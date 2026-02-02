/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import {
  DebugConfiguration,
  LaunchConfiguration,
  Breakpoint,
  DebugSession,
  StackFrame,
  Variable,
  DAPRequest,
  DAPResponse,
  DAPEvent,
} from '../../src/types/debug';

interface DebugAdapter {
  process?: ChildProcessWithoutNullStreams;
  socket?: net.Socket;
  messageBuffer: string;
  sequenceNumber: number;
  pendingRequests: Map<number, { resolve: (response: DAPResponse) => void; reject: (error: Error) => void }>;
}

class DebugSessionManager {
  private sessions: Map<string, DebugSession> = new Map();
  private adapters: Map<string, DebugAdapter> = new Map();
  private sessionIdCounter = 0;

  /**
   * Load launch.json from workspace
   */
  async loadLaunchConfiguration(workspacePath: string): Promise<LaunchConfiguration | null> {
    const launchJsonPath = path.join(workspacePath, '.vscode', 'launch.json');

    if (!fs.existsSync(launchJsonPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(launchJsonPath, 'utf-8');
      // Remove comments (simple approach)
      const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const config: LaunchConfiguration = JSON.parse(jsonContent);
      return config;
    } catch (error) {
      console.error('Failed to load launch.json:', error);
      return null;
    }
  }

  /**
   * Auto-detect debug configurations
   */
  async autoDetectConfigurations(workspacePath: string): Promise<DebugConfiguration[]> {
    const configs: DebugConfiguration[] = [];

    // Detect Node.js/TypeScript
    const packageJsonPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const mainFile = packageJson.main || 'index.js';

        configs.push({
          type: 'node',
          request: 'launch',
          name: 'Launch Node.js Program',
          program: '${workspaceFolder}/' + mainFile,
          skipFiles: ['<node_internals>/**'],
        });

        // Check for TypeScript
        const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
          configs.push({
            type: 'node',
            request: 'launch',
            name: 'Launch TypeScript Program',
            program: '${workspaceFolder}/src/index.ts',
            runtimeArgs: ['-r', 'ts-node/register'],
            skipFiles: ['<node_internals>/**'],
            sourceMaps: true,
          });
        }
      } catch (error) {
        console.error('Failed to parse package.json:', error);
      }
    }

    // Detect Python
    const pythonFiles = fs
      .readdirSync(workspacePath)
      .filter((f) => f.endsWith('.py') && f !== '__init__.py');
    if (pythonFiles.length > 0) {
      const _mainPy = pythonFiles.find((f) => f === 'main.py') || pythonFiles[0];
      configs.push({
        type: 'debugpy',
        request: 'launch',
        name: 'Python: Current File',
        program: '${file}',
        console: 'integratedTerminal',
      });
    }

    // Detect Rust
    const cargoTomlPath = path.join(workspacePath, 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      configs.push({
        type: 'lldb',
        request: 'launch',
        name: 'Debug Rust',
        program: '${workspaceFolder}/target/debug/${workspaceFolderBasename}',
        args: [],
        cwd: '${workspaceFolder}',
        preLaunchTask: 'cargo build',
      });
    }

    // Detect Go
    const goModPath = path.join(workspacePath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      configs.push({
        type: 'delve',
        request: 'launch',
        name: 'Launch Go Program',
        mode: 'debug',
        program: '${workspaceFolder}',
      });
    }

    // Detect C/C++
    const cppFiles = fs
      .readdirSync(workspacePath)
      .filter((f) => f.endsWith('.cpp') || f.endsWith('.c') || f.endsWith('.cc'));
    if (cppFiles.length > 0) {
      configs.push({
        type: 'cppdbg',
        request: 'launch',
        name: 'Debug C/C++',
        program: '${workspaceFolder}/a.out',
        args: [],
        cwd: '${workspaceFolder}',
        MIMode: process.platform === 'darwin' ? 'lldb' : 'gdb',
      });
    }

    return configs;
  }

  /**
   * Get all debug configurations
   */
  async getAllConfigurations(workspacePath: string): Promise<DebugConfiguration[]> {
    const autoDetected = await this.autoDetectConfigurations(workspacePath);
    const config = await this.loadLaunchConfiguration(workspacePath);

    if (config && config.configurations) {
      return [...config.configurations, ...autoDetected];
    }

    return autoDetected;
  }

  /**
   * Start a debug session
   */
  async startSession(
    configuration: DebugConfiguration,
    workspacePath: string,
    window: BrowserWindow,
    activeFile?: string
  ): Promise<string> {
    const sessionId = `debug-${++this.sessionIdCounter}`;

    // Create session
    const session: DebugSession = {
      id: sessionId,
      configuration,
      state: 'initializing',
      breakpoints: new Map(),
      variables: [],
      callStack: [],
    };

    this.sessions.set(sessionId, session);

    // Resolve configuration variables
    const resolvedConfig = this.resolveConfigurationVariables(configuration, workspacePath, activeFile);

    try {
      // Launch debug adapter
      const adapter = await this.launchDebugAdapter(resolvedConfig, workspacePath, window);
      this.adapters.set(sessionId, adapter);

      // Set up message handling with sessionId for response tracking
      this.setupAdapterCommunication(adapter, window, sessionId);

      // Send initialize request
      await this.sendDAPRequest(sessionId, 'initialize', {
        clientID: 'kalynt-ide',
        clientName: 'Kalynt IDE',
        adapterID: resolvedConfig.type,
        pathFormat: 'path',
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsVariablePaging: true,
        supportsRunInTerminalRequest: true,
        locale: 'en-US',
      });

      // Send launch/attach request
      const requestType = resolvedConfig.request;
      await this.sendDAPRequest(sessionId, requestType, resolvedConfig);

      // Send configuration done
      await this.sendDAPRequest(sessionId, 'configurationDone', {});

      session.state = 'running';

      window.webContents.send('debug:started', { sessionId, configuration: resolvedConfig });

      return sessionId;
    } catch (error: any) {
      session.state = 'error';
      window.webContents.send('debug:error', {
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Launch debug adapter process
   */
  private async launchDebugAdapter(
    configuration: DebugConfiguration,
    workspacePath: string,
    _window: BrowserWindow
  ): Promise<DebugAdapter> {
    const adapter: DebugAdapter = {
      messageBuffer: '',
      sequenceNumber: 1,
      pendingRequests: new Map(),
    };

    const { type } = configuration;

    let debuggerPath: string;
    let debuggerArgs: string[];
    let requiredBinary: string | null = null;
    let installInstructions: string = '';

    // Determine debugger executable based on type
    switch (type) {
      case 'node':
      case 'node-terminal':
        // Use Node's built-in inspector protocol
        debuggerPath = process.execPath; // Node.js executable
        debuggerArgs = ['--inspect-brk=0', configuration.program || ''];
        // Node is always available since we're running in Electron
        break;

      case 'debugpy':
      case 'python':
        debuggerPath = 'python';
        debuggerArgs = ['-m', 'debugpy', '--listen', '5678', '--wait-for-client'];
        if (configuration.program) {
          debuggerArgs.push(configuration.program);
        }
        requiredBinary = 'python';
        installInstructions = 'Python debugging requires Python and debugpy.\nInstall with: pip install debugpy';
        break;

      case 'lldb':
      case 'rust-lldb':
        debuggerPath = 'lldb-vscode';
        debuggerArgs = [];
        requiredBinary = 'lldb-vscode';
        installInstructions = 'LLDB debugging requires lldb-vscode.\nInstall LLVM/LLDB from https://llvm.org/';
        break;

      case 'gdb':
      case 'cppdbg':
        debuggerPath = 'gdb';
        debuggerArgs = ['--interpreter=mi'];
        requiredBinary = 'gdb';
        installInstructions = 'GDB debugging requires GDB.\nInstall via your system package manager (e.g., apt install gdb)';
        break;

      case 'delve':
      case 'go':
        debuggerPath = 'dlv';
        debuggerArgs = ['dap', '--listen=127.0.0.1:0'];
        requiredBinary = 'dlv';
        installInstructions = 'Go debugging requires Delve.\nInstall with: go install github.com/go-delve/delve/cmd/dlv@latest';
        break;

      default:
        throw new Error(`Unsupported debug type: ${type}`);
    }

    // Validate that the required binary exists before attempting to spawn
    if (requiredBinary) {
      const binaryExists = await this.checkBinaryExists(requiredBinary);
      if (!binaryExists) {
        throw new Error(`Debug adapter not found: '${requiredBinary}' is not installed or not in PATH.\n\n${installInstructions}`);
      }

      // Resolve the actual path to use (may be from common locations)
      debuggerPath = await this.resolveBinaryPath(requiredBinary);
      console.log(`[Debug] Using debugger at: ${debuggerPath}`);

      // For Python, also check if debugpy module is installed
      if (type === 'python' || type === 'debugpy') {
        const debugpyInstalled = await this.checkPythonModule('debugpy');
        if (!debugpyInstalled) {
          throw new Error(`Python debugger module not found.\n\nInstall with: pip install debugpy`);
        }
      }
    }

    // Spawn debugger process
    const childProcess = spawn(debuggerPath, debuggerArgs, {
      cwd: configuration.cwd || workspacePath,
      env: {
        ...process.env,
        ...configuration.env,
      },
    });

    adapter.process = childProcess;

    return adapter;
  }

  /**
   * Platform-specific search paths for debuggers
   */
  private readonly DEBUGGER_SEARCH_PATHS: Record<string, { windows: string[]; darwin: string[]; linux: string[] }> = {
    python: {
      windows: [
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python39\\python.exe',
        'C:\\Python38\\python.exe',
        `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python311\\python.exe`,
        `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python310\\python.exe`,
        `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python39\\python.exe`,
        `${process.env.USERPROFILE}\\.pyenv\\pyenv-win\\shims\\python.exe`,
        'C:\\msys64\\mingw64\\bin\\python.exe',
      ],
      darwin: [
        '/usr/bin/python3',
        '/usr/local/bin/python3',
        '/opt/homebrew/bin/python3',
        `${process.env.HOME}/.pyenv/shims/python`,
        '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
        '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3',
      ],
      linux: [
        '/usr/bin/python3',
        '/usr/local/bin/python3',
        `${process.env.HOME}/.pyenv/shims/python`,
        '/usr/bin/python',
      ],
    },
    gdb: {
      windows: [
        'C:\\MinGW\\bin\\gdb.exe',
        'C:\\msys64\\mingw64\\bin\\gdb.exe',
        'C:\\msys64\\usr\\bin\\gdb.exe',
        'C:\\cygwin64\\bin\\gdb.exe',
        `${process.env.PROGRAMFILES}\\mingw-w64\\x86_64-8.1.0-posix-seh-rt_v6-rev0\\mingw64\\bin\\gdb.exe`,
      ],
      darwin: [
        '/usr/local/bin/gdb',
        '/opt/homebrew/bin/gdb',
      ],
      linux: [
        '/usr/bin/gdb',
        '/usr/local/bin/gdb',
      ],
    },
    'lldb-vscode': {
      windows: [
        'C:\\Program Files\\LLVM\\bin\\lldb-vscode.exe',
        `${process.env.PROGRAMFILES}\\LLVM\\bin\\lldb-vscode.exe`,
      ],
      darwin: [
        '/usr/local/opt/llvm/bin/lldb-vscode',
        '/opt/homebrew/opt/llvm/bin/lldb-vscode',
        '/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-vscode',
      ],
      linux: [
        '/usr/bin/lldb-vscode',
        '/usr/local/bin/lldb-vscode',
        '/usr/lib/llvm-14/bin/lldb-vscode',
        '/usr/lib/llvm-15/bin/lldb-vscode',
      ],
    },
    dlv: {
      windows: [
        `${process.env.GOPATH || process.env.USERPROFILE + '\\go'}\\bin\\dlv.exe`,
        `${process.env.USERPROFILE}\\go\\bin\\dlv.exe`,
      ],
      darwin: [
        `${process.env.GOPATH || process.env.HOME + '/go'}/bin/dlv`,
        `${process.env.HOME}/go/bin/dlv`,
        '/usr/local/bin/dlv',
      ],
      linux: [
        `${process.env.GOPATH || process.env.HOME + '/go'}/bin/dlv`,
        `${process.env.HOME}/go/bin/dlv`,
        '/usr/local/bin/dlv',
      ],
    },
  };

  /**
   * Check if a binary exists in PATH or common installation paths
   */
  private async checkBinaryExists(binary: string): Promise<boolean> {
    // First, check if it's in PATH using which/where
    const inPath = await this.checkBinaryInPath(binary);
    if (inPath) return true;

    // If not in PATH, search common installation locations
    const foundPath = await this.findBinaryPath(binary);
    return foundPath !== null;
  }

  /**
   * Check if binary is in PATH
   */
  private checkBinaryInPath(binary: string): Promise<boolean> {
    return new Promise((resolve) => {
      const command = process.platform === 'win32' ? 'where' : 'which';
      const checkProcess = spawn(command, [binary], { shell: true });

      checkProcess.on('close', (code) => {
        resolve(code === 0);
      });

      checkProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Find binary in common platform-specific paths
   * Returns the path if found, null otherwise
   */
  private async findBinaryPath(binary: string): Promise<string | null> {
    const searchPaths = this.DEBUGGER_SEARCH_PATHS[binary];
    if (!searchPaths) return null;

    const platform = process.platform;
    let paths: string[] = [];

    if (platform === 'win32') {
      paths = searchPaths.windows;
    } else if (platform === 'darwin') {
      paths = searchPaths.darwin;
    } else {
      paths = searchPaths.linux;
    }

    for (const p of paths) {
      if (p && fs.existsSync(p)) {
        console.log(`[Debug] Found ${binary} at: ${p}`);
        return p;
      }
    }

    return null;
  }

  /**
   * Get the actual binary path (from PATH or common locations)
   */
  private async resolveBinaryPath(binary: string): Promise<string> {
    // Check common paths first
    const foundPath = await this.findBinaryPath(binary);
    if (foundPath) return foundPath;

    // Fallback to name (will use PATH)
    return binary;
  }

  /**
   * Check if a Python module is installed
   */
  private async checkPythonModule(moduleName: string): Promise<boolean> {
    // First, try to find Python
    const pythonPath = await this.resolveBinaryPath('python');

    return new Promise((resolve) => {
      const checkProcess = spawn(pythonPath, ['-c', `import ${moduleName}`], { shell: true });

      checkProcess.on('close', (code) => {
        resolve(code === 0);
      });

      checkProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Set up communication with debug adapter
   */
  private setupAdapterCommunication(adapter: DebugAdapter, window: BrowserWindow, sessionId: string) {
    if (!adapter.process) return;

    adapter.process.stdout?.on('data', (data: Buffer) => {
      adapter.messageBuffer += data.toString();
      this.processAdapterMessages(adapter, window, sessionId);
    });

    adapter.process.stderr?.on('data', (data: Buffer) => {
      console.error('Debug adapter error:', data.toString());
      window.webContents.send('debug:output', {
        type: 'stderr',
        data: data.toString(),
      });
    });

    adapter.process.on('exit', (code) => {
      console.log('Debug adapter exited with code:', code);
      window.webContents.send('debug:terminated', { exitCode: code });
    });
  }

  /**
   * Process messages from debug adapter
   */
  private processAdapterMessages(adapter: DebugAdapter, window: BrowserWindow, sessionId: string) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const headerMatch = /Content-Length: (\d+)\r\n\r\n/.exec(adapter.messageBuffer);
      if (!headerMatch) break;

      const contentLength = Number.parseInt(headerMatch[1], 10);
      const headerLength = headerMatch[0].length;
      const totalLength = headerLength + contentLength;

      if (adapter.messageBuffer.length < totalLength) break;

      const messageContent = adapter.messageBuffer.substring(
        headerLength,
        totalLength
      );
      adapter.messageBuffer = adapter.messageBuffer.substring(totalLength);

      try {
        const message = JSON.parse(messageContent);
        this.handleAdapterMessage(message, window, sessionId);
      } catch (error) {
        console.error('Failed to parse DAP message:', error);
      }
    }
  }

  /**
   * Handle messages from debug adapter
   */
  private handleAdapterMessage(
    message: DAPResponse | DAPEvent,
    window: BrowserWindow,
    sessionId: string
  ) {
    if (message.type === 'event') {
      const event = message as DAPEvent;
      window.webContents.send('debug:event', event);

      // Handle specific events
      switch (event.event) {
        case 'stopped':
          window.webContents.send('debug:stopped', event.body);
          break;
        case 'continued':
          window.webContents.send('debug:continued', event.body);
          break;
        case 'terminated':
          window.webContents.send('debug:terminated', event.body);
          break;
        case 'output':
          window.webContents.send('debug:output', event.body);
          break;
        case 'breakpoint':
          window.webContents.send('debug:breakpoint', event.body);
          break;
      }
    } else if (message.type === 'response') {
      const response = message as DAPResponse;
      window.webContents.send('debug:response', response);

      // Resolve pending request if exists
      const adapter = this.adapters.get(sessionId);
      if (adapter) {
        const pending = adapter.pendingRequests.get(response.request_seq);
        if (pending) {
          if (response.success) {
            pending.resolve(response);
          } else {
            pending.reject(new Error(response.message || 'DAP request failed'));
          }
        }
      }
    }
  }

  /**
   * Send DAP request to debug adapter and await response
   */
  private sendDAPRequest(
    sessionId: string,
    command: string,
    args?: any,
    timeout: number = 10000
  ): Promise<DAPResponse> {
    return new Promise((resolve, reject) => {
      const adapter = this.adapters.get(sessionId);
      if (!adapter) {
        reject(new Error('Debug adapter not found'));
        return;
      }

      const request: DAPRequest = {
        seq: adapter.sequenceNumber++,
        type: 'request',
        command,
        arguments: args,
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        adapter.pendingRequests.delete(request.seq);
        reject(new Error(`DAP request '${command}' timed out after ${timeout}ms`));
      }, timeout);

      // Store pending request with resolver
      adapter.pendingRequests.set(request.seq, {
        resolve: (response: DAPResponse) => {
          clearTimeout(timeoutId);
          adapter.pendingRequests.delete(request.seq);
          resolve(response);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          adapter.pendingRequests.delete(request.seq);
          reject(error);
        },
      });

      const message = JSON.stringify(request);
      const header = `Content-Length: ${Buffer.byteLength(message, 'utf8')}\r\n\r\n`;
      const packet = header + message;

      if (adapter.process?.stdin) {
        adapter.process.stdin.write(packet);
      } else if (adapter.socket) {
        adapter.socket.write(packet);
      } else {
        clearTimeout(timeoutId);
        adapter.pendingRequests.delete(request.seq);
        reject(new Error('No communication channel available'));
      }
    });
  }

  /**
   * Set breakpoints
   */
  async setBreakpoints(
    sessionId: string,
    file: string,
    breakpoints: Breakpoint[]
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    session.breakpoints.set(file, breakpoints);

    await this.sendDAPRequest(sessionId, 'setBreakpoints', {
      source: { path: file },
      breakpoints: breakpoints.map((bp) => ({
        line: bp.line,
        column: bp.column,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage,
      })),
    });
  }

  /**
   * Continue execution
   */
  async continue(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    await this.sendDAPRequest(sessionId, 'continue', {
      threadId: threadId || session.threadId || 1,
    });

    session.state = 'running';
  }

  /**
   * Step over
   */
  async stepOver(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    await this.sendDAPRequest(sessionId, 'next', {
      threadId: threadId || session.threadId || 1,
    });
  }

  /**
   * Step into
   */
  async stepInto(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    await this.sendDAPRequest(sessionId, 'stepIn', {
      threadId: threadId || session.threadId || 1,
    });
  }

  /**
   * Step out
   */
  async stepOut(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    await this.sendDAPRequest(sessionId, 'stepOut', {
      threadId: threadId || session.threadId || 1,
    });
  }

  /**
   * Pause execution
   */
  async pause(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    await this.sendDAPRequest(sessionId, 'pause', {
      threadId: threadId || session.threadId || 1,
    });

    session.state = 'stopped';
  }

  /**
   * Stop debug session
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    const adapter = this.adapters.get(sessionId);

    if (session) {
      session.state = 'terminated';
    }

    if (adapter) {
      // Send terminate request
      try {
        await this.sendDAPRequest(sessionId, 'terminate', {});
        await this.sendDAPRequest(sessionId, 'disconnect', {});
      } catch (error) {
        console.error('Error terminating debug session:', error);
      }

      // Kill adapter process
      if (adapter.process) {
        adapter.process.kill();
      }
      if (adapter.socket) {
        adapter.socket.destroy();
      }

      this.adapters.delete(sessionId);
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Get call stack
   */
  async getCallStack(sessionId: string, threadId?: number): Promise<StackFrame[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Debug session not found');
    }

    const response = await this.sendDAPRequest(sessionId, 'stackTrace', {
      threadId: threadId || session.threadId || 1,
    });

    return response.body?.stackFrames || [];
  }

  /**
   * Get variables
   */
  async getVariables(sessionId: string, variablesReference: number): Promise<Variable[]> {
    const response = await this.sendDAPRequest(sessionId, 'variables', {
      variablesReference,
    });

    return response.body?.variables || [];
  }

  /**
   * Evaluate expression
   */
  async evaluate(sessionId: string, expression: string, frameId?: number): Promise<any> {
    const response = await this.sendDAPRequest(sessionId, 'evaluate', {
      expression,
      frameId,
      context: 'watch',
    });

    return response.body;
  }

  /**
   * Resolve configuration variables like ${workspaceFolder}
   */
  private resolveConfigurationVariables(
    config: DebugConfiguration,
    workspacePath: string,
    activeFile?: string
  ): DebugConfiguration {
    const resolved = structuredClone(config);

    // Compute file-related variables
    const filePath = activeFile || '';
    const fileBasename = filePath ? path.basename(filePath) : '';
    const fileExtension = filePath ? path.extname(filePath) : '';
    const fileBasenameNoExtension = fileBasename ? fileBasename.slice(0, -fileExtension.length || undefined) : '';
    const fileDirname = filePath ? path.dirname(filePath) : '';
    const relativeFile = filePath && workspacePath ? path.relative(workspacePath, filePath) : '';

    const replacements: Record<string, string> = {
      '${workspaceFolder}': workspacePath,
      '${workspaceFolderBasename}': path.basename(workspacePath),
      '${file}': filePath,
      '${fileBasename}': fileBasename,
      '${fileBasenameNoExtension}': fileBasenameNoExtension,
      '${fileDirname}': fileDirname,
      '${relativeFile}': relativeFile,
      '${fileExtname}': fileExtension,
    };

    const replaceVariables = (obj: any): any => {
      if (typeof obj === 'string') {
        let result = obj;
        for (const [variable, value] of Object.entries(replacements)) {
          result = result.replace(variable, value);
        }
        return result;
      } else if (Array.isArray(obj)) {
        return obj.map(replaceVariables);
      } else if (obj && typeof obj === 'object') {
        const newObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
          newObj[key] = replaceVariables(value);
        }
        return newObj;
      }
      return obj;
    };

    return replaceVariables(resolved);
  }
}

// Singleton instance
const debugSessionManager = new DebugSessionManager();

export function setupDebugHandlers(
  ipc: typeof ipcMain,
  getMainWindow: () => BrowserWindow | null,
  _getWorkspacePath: () => string | null
) {
  // Get all debug configurations
  ipc.handle('debug:getConfigurations', async (_, workspacePath: string) => {
    try {
      const configurations = await debugSessionManager.getAllConfigurations(workspacePath);
      return { success: true, configurations };
    } catch (error: any) {
      console.error('Failed to get debug configurations:', error);
      return { success: false, error: error.message };
    }
  });

  // Start debug session
  ipc.handle(
    'debug:start',
    async (_, configuration: DebugConfiguration, workspacePath: string, activeFile?: string) => {
      try {
        const mainWindow = getMainWindow();
        if (!mainWindow) {
          return { success: false, error: 'Main window not available' };
        }

        const sessionId = await debugSessionManager.startSession(
          configuration,
          workspacePath,
          mainWindow,
          activeFile
        );
        return { success: true, sessionId };
      } catch (error: any) {
        console.error('Failed to start debug session:', error);
        return { success: false, error: error.message };
      }
    }
  );

  // Stop debug session
  ipc.handle('debug:stop', async (_, sessionId: string) => {
    try {
      await debugSessionManager.stopSession(sessionId);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to stop debug session:', error);
      return { success: false, error: error.message };
    }
  });

  // Set breakpoints
  ipc.handle(
    'debug:setBreakpoints',
    async (_, sessionId: string, file: string, breakpoints: Breakpoint[]) => {
      try {
        await debugSessionManager.setBreakpoints(sessionId, file, breakpoints);
        return { success: true };
      } catch (error: any) {
        console.error('Failed to set breakpoints:', error);
        return { success: false, error: error.message };
      }
    }
  );

  // Debug controls
  ipc.handle('debug:continue', async (_, sessionId: string, threadId?: number) => {
    try {
      await debugSessionManager.continue(sessionId, threadId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:stepOver', async (_, sessionId: string, threadId?: number) => {
    try {
      await debugSessionManager.stepOver(sessionId, threadId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:stepInto', async (_, sessionId: string, threadId?: number) => {
    try {
      await debugSessionManager.stepInto(sessionId, threadId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:stepOut', async (_, sessionId: string, threadId?: number) => {
    try {
      await debugSessionManager.stepOut(sessionId, threadId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:pause', async (_, sessionId: string, threadId?: number) => {
    try {
      await debugSessionManager.pause(sessionId, threadId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get call stack
  ipc.handle('debug:getCallStack', async (_, sessionId: string, threadId?: number) => {
    try {
      const callStack = await debugSessionManager.getCallStack(sessionId, threadId);
      return { success: true, callStack };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get variables
  ipc.handle(
    'debug:getVariables',
    async (_, sessionId: string, variablesReference: number) => {
      try {
        const variables = await debugSessionManager.getVariables(
          sessionId,
          variablesReference
        );
        return { success: true, variables };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Evaluate expression
  ipc.handle(
    'debug:evaluate',
    async (_, sessionId: string, expression: string, frameId?: number) => {
      try {
        const result = await debugSessionManager.evaluate(sessionId, expression, frameId);
        return { success: true, result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );
}
