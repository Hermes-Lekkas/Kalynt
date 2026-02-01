/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  Task,
  TasksConfiguration,
  TaskExecution,
  Problem,
  ProblemMatcher,
} from '../../src/types/tasks';

interface RunningTask {
  process: ChildProcessWithoutNullStreams;
  execution: TaskExecution;
}

class BuildTaskManager {
  private runningTasks: Map<string, RunningTask> = new Map();
  private taskIdCounter = 0;

  /**
   * Load tasks.json from workspace
   */
  async loadTasksConfiguration(workspacePath: string): Promise<TasksConfiguration | null> {
    const tasksJsonPath = path.join(workspacePath, '.vscode', 'tasks.json');

    if (!fs.existsSync(tasksJsonPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(tasksJsonPath, 'utf-8');
      // Remove comments (simple approach, doesn't handle all cases)
      const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const config: TasksConfiguration = JSON.parse(jsonContent);
      return config;
    } catch (error) {
      console.error('Failed to load tasks.json:', error);
      return null;
    }
  }

  /**
   * Auto-detect tasks from common build files
   */
  async autoDetectTasks(workspacePath: string): Promise<Task[]> {
    const detectedTasks: Task[] = [];

    // Detect npm/yarn scripts
    const packageJsonPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.scripts) {
          for (const [scriptName, scriptCommand] of Object.entries(packageJson.scripts)) {
            detectedTasks.push({
              label: `npm: ${scriptName}`,
              type: 'npm',
              command: scriptName,
              detail: scriptCommand as string,
              group: this.inferTaskGroup(scriptName),
              problemMatcher: this.inferProblemMatcher(scriptName),
            });
          }
        }
      } catch (error) {
        console.error('Failed to parse package.json:', error);
      }
    }

    // Detect Cargo (Rust)
    const cargoTomlPath = path.join(workspacePath, 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      detectedTasks.push(
        {
          label: 'cargo: build',
          type: 'shell',
          command: 'cargo',
          args: ['build'],
          group: { kind: 'build', isDefault: true },
          problemMatcher: '$rustc',
        },
        {
          label: 'cargo: test',
          type: 'shell',
          command: 'cargo',
          args: ['test'],
          group: 'test',
          problemMatcher: '$rustc',
        },
        {
          label: 'cargo: run',
          type: 'shell',
          command: 'cargo',
          args: ['run'],
        }
      );
    }

    // Detect Go
    const goModPath = path.join(workspacePath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      detectedTasks.push(
        {
          label: 'go: build',
          type: 'shell',
          command: 'go',
          args: ['build', '-v', './...'],
          group: { kind: 'build', isDefault: true },
          problemMatcher: '$go',
        },
        {
          label: 'go: test',
          type: 'shell',
          command: 'go',
          args: ['test', '-v', './...'],
          group: 'test',
        }
      );
    }

    // Detect Maven (Java)
    const pomXmlPath = path.join(workspacePath, 'pom.xml');
    if (fs.existsSync(pomXmlPath)) {
      detectedTasks.push(
        {
          label: 'maven: clean install',
          type: 'shell',
          command: 'mvn',
          args: ['clean', 'install'],
          group: { kind: 'build', isDefault: true },
        },
        {
          label: 'maven: test',
          type: 'shell',
          command: 'mvn',
          args: ['test'],
          group: 'test',
        }
      );
    }

    // Detect Gradle (Java/Kotlin)
    const gradleFiles = ['build.gradle', 'build.gradle.kts'];
    const hasGradle = gradleFiles.some((file) =>
      fs.existsSync(path.join(workspacePath, file))
    );
    if (hasGradle) {
      const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
      detectedTasks.push(
        {
          label: 'gradle: build',
          type: 'shell',
          command: gradleCmd,
          args: ['build'],
          group: { kind: 'build', isDefault: true },
        },
        {
          label: 'gradle: test',
          type: 'shell',
          command: gradleCmd,
          args: ['test'],
          group: 'test',
        }
      );
    }

    // Detect Make
    const makefilePath = path.join(workspacePath, 'Makefile');
    if (fs.existsSync(makefilePath)) {
      detectedTasks.push(
        {
          label: 'make: build',
          type: 'shell',
          command: 'make',
          group: { kind: 'build', isDefault: true },
          problemMatcher: '$gcc',
        },
        {
          label: 'make: clean',
          type: 'shell',
          command: 'make',
          args: ['clean'],
          group: 'clean',
        }
      );
    }

    // Detect CMake
    const cmakePath = path.join(workspacePath, 'CMakeLists.txt');
    if (fs.existsSync(cmakePath)) {
      detectedTasks.push(
        {
          label: 'cmake: configure',
          type: 'shell',
          command: 'cmake',
          args: ['-B', 'build', '-S', '.'],
        },
        {
          label: 'cmake: build',
          type: 'shell',
          command: 'cmake',
          args: ['--build', 'build'],
          group: { kind: 'build', isDefault: true },
          problemMatcher: '$gcc',
        }
      );
    }

    return detectedTasks;
  }

  /**
   * Get all tasks (auto-detected + configured)
   */
  async getAllTasks(workspacePath: string): Promise<Task[]> {
    const autoDetected = await this.autoDetectTasks(workspacePath);
    const config = await this.loadTasksConfiguration(workspacePath);

    if (config && config.tasks) {
      // Merge, with configured tasks taking precedence
      const configuredLabels = new Set(config.tasks.map((t) => t.label));
      const filteredAutoDetected = autoDetected.filter(
        (t) => !configuredLabels.has(t.label)
      );
      return [...config.tasks, ...filteredAutoDetected];
    }

    return autoDetected;
  }

  /**
   * Execute a task
   */
  async executeTask(
    task: Task,
    workspacePath: string,
    window: BrowserWindow
  ): Promise<string> {
    const taskId = `task-${++this.taskIdCounter}`;

    const execution: TaskExecution = {
      taskId,
      taskLabel: task.label,
      startTime: Date.now(),
      problems: [],
    };

    // Resolve command and args
    let command = task.command;
    let args = task.args || [];
    let shell = true;

    if (task.type === 'npm') {
      command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      args = ['run', task.command, ...args];
      shell = false;
    }

    // Resolve working directory
    const cwd = task.options?.cwd
      ? path.resolve(workspacePath, task.options.cwd)
      : workspacePath;

    // Resolve environment variables
    const env = {
      ...process.env,
      ...task.options?.env,
    };

    // Send start message
    window.webContents.send('build:output', {
      taskId,
      type: 'start',
      data: `\x1b[1m> Executing task: ${task.label}\x1b[0m\n`,
    });

    // Spawn process
    const childProcess = spawn(command, args, {
      cwd,
      env,
      shell,
      windowsHide: true,
    });

    execution.processId = childProcess.pid;

    // Store running task
    this.runningTasks.set(taskId, {
      process: childProcess,
      execution,
    });

    // Create problem matcher
    const problemMatcher = this.createProblemMatcher(task.problemMatcher);

    // Handle stdout
    childProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      window.webContents.send('build:output', {
        taskId,
        type: 'stdout',
        data: output,
      });

      // Parse problems
      if (problemMatcher) {
        const problems = this.parseProblems(output, problemMatcher, workspacePath);
        execution.problems.push(...problems);
        if (problems.length > 0) {
          window.webContents.send('build:problems', {
            taskId,
            problems: execution.problems,
          });
        }
      }
    });

    // Handle stderr
    childProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      window.webContents.send('build:output', {
        taskId,
        type: 'stderr',
        data: output,
      });

      // Parse problems from stderr too
      if (problemMatcher) {
        const problems = this.parseProblems(output, problemMatcher, workspacePath);
        execution.problems.push(...problems);
        if (problems.length > 0) {
          window.webContents.send('build:problems', {
            taskId,
            problems: execution.problems,
          });
        }
      }
    });

    // Handle process exit
    childProcess.on('close', (code) => {
      execution.endTime = Date.now();
      execution.exitCode = code ?? undefined;

      const duration = ((execution.endTime - execution.startTime) / 1000).toFixed(2);
      const status = code === 0 ? '\x1b[32mâœ“\x1b[0m' : '\x1b[31mâœ—\x1b[0m';

      window.webContents.send('build:output', {
        taskId,
        type: 'end',
        data: `\n${status} Task "${task.label}" ${code === 0 ? 'completed successfully' : `failed with exit code ${code}`
          } (${duration}s)\n`,
      });

      window.webContents.send('build:end', {
        taskId,
        exitCode: code,
        problems: execution.problems,
      });

      this.runningTasks.delete(taskId);
    });

    childProcess.on('error', (error) => {
      window.webContents.send('build:output', {
        taskId,
        type: 'error',
        data: `\x1b[31mError: ${error.message}\x1b[0m\n`,
      });

      window.webContents.send('build:end', {
        taskId,
        exitCode: 1,
        problems: execution.problems,
      });

      this.runningTasks.delete(taskId);
    });

    return taskId;
  }

  /**
   * Kill a running task
   */
  killTask(taskId: string): boolean {
    const runningTask = this.runningTasks.get(taskId);
    if (!runningTask) {
      return false;
    }

    try {
      if (process.platform === 'win32') {
        // On Windows, use taskkill to kill the entire process tree
        spawn('taskkill', ['/pid', runningTask.process.pid!.toString(), '/f', '/t']);
      } else {
        // On Unix, kill the process group
        process.kill(-runningTask.process.pid!, 'SIGTERM');
      }
      this.runningTasks.delete(taskId);
      return true;
    } catch (error) {
      console.error('Failed to kill task:', error);
      return false;
    }
  }

  /**
   * Create problem matcher from configuration
   */
  private createProblemMatcher(
    matcher: string | string[] | ProblemMatcher | ProblemMatcher[] | undefined
  ): ProblemMatcher | null {
    if (!matcher) return null;

    // Handle built-in problem matchers
    if (typeof matcher === 'string') {
      return this.getBuiltInProblemMatcher(matcher);
    }

    // Handle array of matchers (use first one for simplicity)
    if (Array.isArray(matcher)) {
      if (matcher.length === 0) return null;
      const first = matcher[0];
      if (typeof first === 'string') {
        return this.getBuiltInProblemMatcher(first);
      }
      return first;
    }

    return matcher;
  }

  /**
   * Get built-in problem matchers
   */
  private getBuiltInProblemMatcher(name: string): ProblemMatcher | null {
    const matchers: Record<string, ProblemMatcher> = {
      '$tsc': {
        owner: 'typescript',
        pattern: {
          regexp: '^([^\\s].*?)\\((\\d+),(\\d+)\\):\\s+(error|warning|info)\\s+(TS\\d+)\\s*:\\s*(.*)$',
          file: 1,
          line: 2,
          column: 3,
          severity: 4,
          code: 5,
          message: 6,
        },
      },
      '$eslint-compact': {
        owner: 'eslint',
        pattern: {
          regexp: '^(.+?):\\s+line\\s+(\\d+),\\s+col\\s+(\\d+),\\s+(Error|Warning)\\s+-\\s+(.+?)\\s+\\((.+?)\\)$',
          file: 1,
          line: 2,
          column: 3,
          severity: 4,
          message: 5,
          code: 6,
        },
      },
      '$rustc': {
        owner: 'rustc',
        pattern: {
          regexp: '^(error|warning|help|note)(?:\\[(.+?)\\])?:\\s+(.+)$',
          severity: 1,
          code: 2,
          message: 3,
        },
      },
      '$cargo': {
        owner: 'cargo',
        pattern: {
          regexp: '^\\s*(error|warning):\\s+(.+)$',
          severity: 1,
          message: 2,
        },
      },
      '$gcc': {
        owner: 'gcc',
        pattern: {
          regexp: '^(.+?):(\\d+):(\\d+):\\s+(error|warning|note):\\s+(.+)$',
          file: 1,
          line: 2,
          column: 3,
          severity: 4,
          message: 5,
        },
      },
      '$go': {
        owner: 'go',
        pattern: {
          regexp: '^(.+?):(\\d+):(\\d+)?:?\\s+(.+)$',
          file: 1,
          line: 2,
          column: 3,
          message: 4,
        },
      },
    };

    return matchers[name] || null;
  }

  /**
   * Parse problems from output using problem matcher
   */
  private parseProblems(
    output: string,
    matcher: ProblemMatcher,
    workspacePath: string
  ): Problem[] {
    const problems: Problem[] = [];
    const pattern = matcher.pattern;

    if (!pattern || Array.isArray(pattern)) {
      // Multi-line patterns not implemented yet
      return problems;
    }

    const lines = output.split('\n');
    const regex = new RegExp(pattern.regexp);

    for (const line of lines) {
      const match = regex.exec(line);
      if (!match) continue;

      const problem: Problem = {
        file: pattern.file ? match[pattern.file] : 'unknown',
        line: pattern.line ? parseInt(match[pattern.line], 10) : 1,
        column: pattern.column ? parseInt(match[pattern.column], 10) : 1,
        severity: this.parseSeverity(
          pattern.severity ? match[pattern.severity] : 'error'
        ),
        message: pattern.message ? match[pattern.message] : line,
        code: pattern.code ? match[pattern.code] : undefined,
        source: matcher.owner,
      };

      // Resolve relative file paths
      if (problem.file && !path.isAbsolute(problem.file)) {
        problem.file = path.join(workspacePath, problem.file);
      }

      problems.push(problem);
    }

    return problems;
  }

  /**
   * Parse severity from string
   */
  private parseSeverity(severity: string): 'error' | 'warning' | 'info' {
    const lower = severity.toLowerCase();
    if (lower.includes('error')) return 'error';
    if (lower.includes('warning')) return 'warning';
    return 'info';
  }

  /**
   * Infer task group from task name
   */
  private inferTaskGroup(taskName: string): string | undefined {
    const lower = taskName.toLowerCase();
    if (lower.includes('build') || lower === 'compile') return 'build';
    if (lower.includes('test')) return 'test';
    if (lower.includes('clean')) return 'clean';
    return undefined;
  }

  /**
   * Infer problem matcher from task name
   */
  private inferProblemMatcher(taskName: string): string | undefined {
    const lower = taskName.toLowerCase();
    if (lower.includes('tsc') || lower.includes('typescript')) return '$tsc';
    if (lower.includes('eslint')) return '$eslint-compact';
    if (lower.includes('build') && lower.includes('rust')) return '$rustc';
    return undefined;
  }
}

// Singleton instance
const buildTaskManager = new BuildTaskManager();

export function setupBuildHandlers(
  ipc: typeof ipcMain,
  getMainWindow: () => BrowserWindow | null,
  _getWorkspacePath: () => string | null
) {
  // Get all tasks
  ipc.handle('build:getTasks', async (_, workspacePath: string) => {
    try {
      const tasks = await buildTaskManager.getAllTasks(workspacePath);
      return { success: true, tasks };
    } catch (error: any) {
      console.error('Failed to get tasks:', error);
      return { success: false, error: error.message };
    }
  });

  // Execute a task
  ipc.handle('build:executeTask', async (_, task: Task, workspacePath: string) => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        return { success: false, error: 'Main window not available' };
      }

      const taskId = await buildTaskManager.executeTask(task, workspacePath, mainWindow);
      return { success: true, taskId };
    } catch (error: any) {
      console.error('Failed to execute task:', error);
      return { success: false, error: error.message };
    }
  });

  // Kill a task
  ipc.handle('build:killTask', async (_, taskId: string) => {
    try {
      const success = buildTaskManager.killTask(taskId);
      return { success };
    } catch (error: any) {
      console.error('Failed to kill task:', error);
      return { success: false, error: error.message };
    }
  });
}
