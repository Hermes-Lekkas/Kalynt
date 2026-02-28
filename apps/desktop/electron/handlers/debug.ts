/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { ipcMain, BrowserWindow, app } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { binaryManager } from '../services/binary-manager';
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

interface WatchExpression {
  id: string;
  expression: string;
  result?: string;
  type?: string;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class DebugSessionManager {
  private sessions: Map<string, DebugSession> = new Map();
  private adapters: Map<string, DebugAdapter> = new Map();
  private sessionIdCounter = 0;
  private watchExpressions: Map<string, WatchExpression[]> = new Map();
  private eventListeners: Map<string, Map<string, ((event: DAPEvent) => void)[]>> = new Map();

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
      // Remove comments safely without breaking strings (e.g., http://...)
      const jsonContent = content.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
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
        // SECURITY: Sanitize mainFile to prevent shell command injection
        // Remove shell metacharacters and path traversal attempts
        const rawMainFile = packageJson.main || 'index.js';
        const mainFile = this.sanitizeFilePath(rawMainFile);

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

      // Prepare to wait for the initialized event before concluding configuration.
      // Some adapters fire this right after 'initialize', some fire it after 'launch'.
      const initializedPromise = this.waitForEvent(sessionId, 'initialized', 10000)
        .catch(e => console.warn(`[Debug][${sessionId}] Initialized event wait warning: ${e.message}`));

      // Send launch/attach request
      // Filter out non-DAP properties from the configuration
      const requestType = resolvedConfig.request;
      const launchArgs = this.filterLaunchArguments(resolvedConfig);
      await this.sendDAPRequest(sessionId, requestType, launchArgs);

      // Await initialized event to ensure adapter is ready for configuration
      await initializedPromise;

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
      case 'node-terminal': {
        // Use js-debug-dap (VS Code's Node.js debugger as standalone DAP adapter)
        // Check for common locations of js-debug-dap
        const jsDebugPaths = [
          // Global npm install
          process.platform === 'win32' 
            ? `${process.env.APPDATA}\\npm\\node_modules\\@vscode\\js-debug-dap\\out\\src\\dapDebugServer.js`
            : `/usr/local/lib/node_modules/@vscode/js-debug-dap/out/src/dapDebugServer.js`,
          // Alternative global location
          process.platform === 'win32'
            ? `${process.env.USERPROFILE}\\node_modules\\@vscode\\js-debug-dap\\out\\src\\dapDebugServer.js`
            : `${process.env.HOME}/.npm-global/lib/node_modules/@vscode/js-debug-dap/out/src/dapDebugServer.js`,
          // Bundled location
          binaryManager.getBinaryPath('js-debug-dap') || '',
        ].filter(Boolean);

        let jsDebugPath = jsDebugPaths.find(p => fs.existsSync(p));
        
        if (!jsDebugPath) {
          // Try to find via npm root
          const npmRootResult = await new Promise<string | null>((resolve) => {
            const proc = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g']);
            let output = '';
            proc.stdout?.on('data', (d) => output += d.toString());
            proc.on('close', (code) => {
              if (code === 0 && output.trim()) {
                const dapPath = path.join(output.trim(), '@vscode', 'js-debug-dap', 'out', 'src', 'dapDebugServer.js');
                resolve(fs.existsSync(dapPath) ? dapPath : null);
              } else {
                resolve(null);
              }
            });
            proc.on('error', () => resolve(null));
          });
          
          if (npmRootResult) {
            jsDebugPath = npmRootResult;
          }
        }

        if (!jsDebugPath) {
          _window.webContents.send('debug:adapter-missing', { 
            type, 
            requiredBinary: '@vscode/js-debug-dap', 
            installInstructions: 'Node.js debugging requires @vscode/js-debug-dap.\nInstall with: npm install -g @vscode/js-debug-dap' 
          });
          throw new Error(`Node.js debug adapter not found. Install with: npm install -g @vscode/js-debug-dap`);
        }

        const nodePort = await this.getAvailablePort();
        debuggerPath = await this.resolveBinaryPath('node');
        debuggerArgs = [jsDebugPath, '--port', nodePort.toString()];

        console.log(`[Debug] Using js-debug-dap at port ${nodePort}`);

        // Spawn the DAP server
        const nodeChildProcess = spawn(debuggerPath, debuggerArgs, {
          cwd: configuration.cwd || workspacePath,
          env: this.getSafeDebugEnv(configuration.env as Record<string, string> | undefined),
        });

        nodeChildProcess.on('error', (err) => {
          console.error(`[Debug][Node Spawn Error] ${err.message}`);
          _window.webContents.send('debug:error', { sessionId: 'initializing', error: `Node.js debugger failed to start: ${err.message}` });
        });

        adapter.process = nodeChildProcess;

        // Establish socket connection to js-debug-dap
        const nodeSocket = new net.Socket();
        let nodeConnected = false;
        const nodeMaxRetries = 10;

        for (let attempt = 1; attempt <= nodeMaxRetries; attempt++) {
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                nodeSocket.destroy();
                reject(new Error('Timeout'));
              }, 2000);

              nodeSocket.once('connect', () => {
                clearTimeout(timeout);
                resolve();
              });

              nodeSocket.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
              });

              nodeSocket.connect(nodePort, '127.0.0.1');
            });
            nodeConnected = true;
            break;
          } catch (e) {
            if (attempt === nodeMaxRetries) {
              throw new Error(`Failed to connect to Node.js debugger after ${nodeMaxRetries} attempts on port ${nodePort}`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        if (!nodeConnected) {
          throw new Error(`Failed to establish connection to js-debug-dap on port ${nodePort}`);
        }

        adapter.socket = nodeSocket;
        return adapter;
      }

      case 'debugpy':
      case 'python': {
        // Use python3 by default on non-windows, python on windows
        requiredBinary = process.platform === 'win32' ? 'python' : 'python3';
        
        // Resolve the actual path to use (may be from common locations or bundled bin)
        debuggerPath = await this.resolveBinaryPath(requiredBinary);

        // Check bundled binaries as fallback
        if (debuggerPath === requiredBinary) {
            const bundled = binaryManager.getBinaryPath(requiredBinary);
            if (bundled) debuggerPath = bundled;
        }

        console.log(`[Debug] Using resolved python path: ${debuggerPath}`);

        // USE STDIO MODE: Starts debugpy adapter which speaks DAP directly over stdio
        debuggerArgs = [
            '-Xfrozen_modules=off', 
            '-m', 'debugpy.adapter'
        ];
        
        // Add environment variable to suppress warnings
        configuration.env = {
            ...((configuration.env as Record<string, string>) || {}),
            'PYDEVD_DISABLE_FILE_VALIDATION': '1',
            'PYTHONUNBUFFERED': '1'
        };
        
        // Spawn the process
        const childProcess = spawn(debuggerPath, debuggerArgs, {
            cwd: configuration.cwd || workspacePath,
            env: this.getSafeDebugEnv(configuration.env as Record<string, string> | undefined),
        });

        // Capture early errors and handle spawn failure
        childProcess.on('error', (err) => {
            console.error(`[Debug][Spawn Error] ${err.message}`);
            _window.webContents.send('debug:error', { sessionId: 'initializing', error: `Debugger failed to start: ${err.message}` });
        });

        adapter.process = childProcess;
        return adapter;
      }

      case 'lldb':
      case 'rust-lldb':
        // Support both old (lldb-vscode) and new (lldb-dap) names
        debuggerPath = 'lldb-dap';
        debuggerArgs = [];
        requiredBinary = 'lldb-dap';
        installInstructions = 'LLDB debugging requires lldb-dap or lldb-vscode.\nInstall LLVM/LLDB from https://llvm.org/';
        break;

      case 'gdb':
      case 'cppdbg': {
        // Use codelldb (LLDB-based DAP adapter that supports C/C++/Rust)
        // This is the recommended approach as GDB MI is NOT DAP-compliant
        const cppPort = await this.getAvailablePort();
        
        // Check for codelldb first (preferred)
        const codelldbPaths = [
          // VS Code extension location
          process.platform === 'win32'
            ? `${process.env.USERPROFILE}\\.vscode\\extensions\\vadimcn.vscode-lldb-*/adapter/codelldb.exe`
            : `${process.env.HOME}/.vscode/extensions/vadimcn.vscode-lldb-*/adapter/codelldb`,
          // Homebrew on macOS
          '/opt/homebrew/bin/codelldb',
          '/usr/local/bin/codelldb',
          // Linux common paths
          '/usr/bin/codelldb',
          `${process.env.HOME}/.local/bin/codelldb`,
        ];

        let codelldbPath: string | null = null;
        
        // Try to find codelldb
        for (const searchPath of codelldbPaths) {
          if (searchPath.includes('*')) {
            // Handle glob pattern for VS Code extensions
            const globDir = path.dirname(searchPath);
            const globPattern = path.basename(searchPath);
            if (fs.existsSync(path.dirname(globDir))) {
              try {
                const dirs = fs.readdirSync(path.dirname(globDir));
                const match = dirs.find(d => d.startsWith(globPattern.replace('*', '')));
                if (match) {
                  codelldbPath = path.join(path.dirname(globDir), match, globPattern.includes('adapter') ? '' : 'adapter', 'codelldb' + (process.platform === 'win32' ? '.exe' : ''));
                  if (fs.existsSync(codelldbPath)) break;
                  codelldbPath = null;
                }
              } catch { /* ignore */ }
            }
          } else if (fs.existsSync(searchPath)) {
            codelldbPath = searchPath;
            break;
          }
        }

        if (!codelldbPath) {
          // Fallback: check if lldb-dap is available (newer LLVM DAP adapter)
          const lldbDapExists = await this.checkBinaryExists('lldb-dap');
          if (lldbDapExists) {
            debuggerPath = await this.resolveBinaryPath('lldb-dap');
            debuggerArgs = [];
            requiredBinary = 'lldb-dap';
            installInstructions = 'C/C++ debugging uses lldb-dap.\nInstall LLVM/LLDB from https://llvm.org/';
            break;
          }

          _window.webContents.send('debug:adapter-missing', { 
            type, 
            requiredBinary: 'codelldb', 
            installInstructions: 'C/C++ debugging requires codelldb or lldb-dap.\n\nInstall codelldb:\n  - VS Code: Install "CodeLLDB" extension\n  - macOS: brew install codelldb\n  - Linux: Download from https://github.com/vadimcn/codelldb/releases\n\nOr install lldb-dap from LLVM/LLDB.' 
          });
          throw new Error(`C/C++ debug adapter not found. Install codelldb or lldb-dap.`);
        }

        debuggerPath = codelldbPath;
        debuggerArgs = ['--port', cppPort.toString()];
        requiredBinary = 'codelldb';
        installInstructions = 'C/C++ debugging requires codelldb.\nInstall from https://github.com/vadimcn/codelldb/releases';

        console.log(`[Debug] Using codelldb at port ${cppPort}`);

        // Spawn codelldb
        const cppChildProcess = spawn(debuggerPath, debuggerArgs, {
          cwd: configuration.cwd || workspacePath,
          env: this.getSafeDebugEnv(configuration.env as Record<string, string> | undefined),
        });

        cppChildProcess.on('error', (err) => {
          console.error(`[Debug][C++ Spawn Error] ${err.message}`);
          _window.webContents.send('debug:error', { sessionId: 'initializing', error: `C/C++ debugger failed to start: ${err.message}` });
        });

        adapter.process = cppChildProcess;

        // Establish socket connection to codelldb
        const cppSocket = new net.Socket();
        let cppConnected = false;
        const cppMaxRetries = 10;

        for (let attempt = 1; attempt <= cppMaxRetries; attempt++) {
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                cppSocket.destroy();
                reject(new Error('Timeout'));
              }, 2000);

              cppSocket.once('connect', () => {
                clearTimeout(timeout);
                resolve();
              });

              cppSocket.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
              });

              cppSocket.connect(cppPort, '127.0.0.1');
            });
            cppConnected = true;
            break;
          } catch (e) {
            if (attempt === cppMaxRetries) {
              throw new Error(`Failed to connect to C/C++ debugger after ${cppMaxRetries} attempts on port ${cppPort}`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        if (!cppConnected) {
          throw new Error(`Failed to establish connection to codelldb on port ${cppPort}`);
        }

        adapter.socket = cppSocket;
        return adapter;
      }

      case 'delve':
      case 'go': {
        const port = await this.getAvailablePort();
        debuggerPath = 'dlv';
        debuggerArgs = ['dap', '--listen', `127.0.0.1:${port}`, ...(configuration.args || [])];
        requiredBinary = 'dlv';
        installInstructions = 'Go debugging requires Delve.\nInstall with: go install github.com/go-delve/delve/cmd/dlv@latest';

        // Check binary existence first
        const binaryExists = await this.checkBinaryExists(requiredBinary);
        if (!binaryExists) {
            const bundled = binaryManager.getBinaryPath(requiredBinary);
            if (bundled) {
                debuggerPath = bundled;
            } else {
                _window.webContents.send('debug:adapter-missing', { type, requiredBinary, installInstructions });
                throw new Error(`Debug adapter not found: '${requiredBinary}'.`);
            }
        } else {
            debuggerPath = await this.resolveBinaryPath(requiredBinary);
        }

        console.log(`[Debug] Using debugger at: ${debuggerPath}`);

        // Spawn Delve
        const childProcess = spawn(debuggerPath, debuggerArgs, {
            cwd: configuration.cwd || workspacePath,
            env: this.getSafeDebugEnv(configuration.env as Record<string, string> | undefined),
        });

        let earlyError = '';
        childProcess.on('error', (err) => {
            console.error(`[Debug][Spawn Error] ${err.message}`);
            _window.webContents.send('debug:error', { sessionId: 'initializing', error: `Debugger failed to start: ${err.message}` });
        });

        childProcess.stderr?.on('data', (data) => {
            earlyError += data.toString();
            console.error(`[Debug][Early] ${data.toString()}`);
        });

        adapter.process = childProcess;

        // Establish socket connection
        const socket = new net.Socket();
        const maxRetries = 5;
        let connected = false;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[Debug] Connection attempt ${attempt} to port ${port}...`);
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        socket.destroy();
                        reject(new Error('Timeout'));
                    }, 2000);

                    socket.once('connect', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    socket.once('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    });

                    socket.connect(port, '127.0.0.1');
                });
                connected = true;
                break;
            } catch (e) {
                if (attempt === maxRetries) {
                    const detailedError = earlyError ? `\nDebugger Output: ${earlyError}` : '';
                    throw new Error(`Failed to connect to Go debugger after ${maxRetries} attempts on port ${port}: ${e instanceof Error ? e.message : String(e)}${detailedError}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (!connected) {
            throw new Error(`Failed to establish connection to delve on port ${port}`);
        }

        adapter.socket = socket;
        return adapter;
      }

      case 'java': {
        // Java debugging requires java-debug DAP adapter (Microsoft's vscode-java-debug)
        // JDWP is NOT DAP-compliant, so we need a proper DAP adapter
        
        const javaDebugPaths = [
          // VS Code extension location
          process.platform === 'win32'
            ? `${process.env.USERPROFILE}\\.vscode\\extensions\\vscjava.vscode-java-debug-*/scripts`
            : `${process.env.HOME}/.vscode/extensions/vscjava.vscode-java-debug-*/scripts`,
          // Global npm install (if packaged separately)
          process.platform === 'win32'
            ? `${process.env.APPDATA}\\npm\\node_modules\\java-debug-adapter`
            : `/usr/local/lib/node_modules/java-debug-adapter`,
        ];

        let javaDebugPath: string | null = null;
        
        // Try to find java-debug adapter
        for (const searchPath of javaDebugPaths) {
          if (searchPath.includes('*')) {
            // Handle glob pattern for VS Code extensions
            const baseDir = path.dirname(searchPath);
            if (fs.existsSync(path.dirname(baseDir))) {
              try {
                const dirs = fs.readdirSync(path.dirname(baseDir));
                const match = dirs.find(d => d.startsWith('vscjava.vscode-java-debug-'));
                if (match) {
                  const scriptPath = path.join(path.dirname(baseDir), match, 'scripts');
                  if (fs.existsSync(scriptPath)) {
                    javaDebugPath = scriptPath;
                    break;
                  }
                }
              } catch { /* ignore */ }
            }
          } else if (fs.existsSync(searchPath)) {
            javaDebugPath = searchPath;
            break;
          }
        }

        if (!javaDebugPath) {
          _window.webContents.send('debug:adapter-missing', { 
            type, 
            requiredBinary: 'java-debug', 
            installInstructions: 'Java debugging requires the Java Debug Server (vscode-java-debug).\n\nInstall via VS Code:\n  1. Install "Extension Pack for Java" or "Debugger for Java"\n  2. The debug adapter will be available automatically\n\nOr configure manually with a DAP-compliant Java debugger.' 
          });
          throw new Error(`Java debug adapter not found. Install the "Debugger for Java" VS Code extension or a DAP-compliant Java debugger.`);
        }

        // The Java debug adapter is typically launched via a script
        const javaPort = await this.getAvailablePort();
        debuggerPath = await this.resolveBinaryPath('java');
        
        // Look for the launcher JAR in the extension
        const launcherJar = path.join(javaDebugPath, 'com.microsoft.java.debug.plugin.jar');
        
        if (!fs.existsSync(launcherJar)) {
          // Try alternative location
          const altJar = path.join(path.dirname(javaDebugPath), 'server', 'com.microsoft.java.debug.plugin.jar');
          if (fs.existsSync(altJar)) {
            debuggerArgs = [
              '-jar', altJar,
              '--port', javaPort.toString()
            ];
          } else {
            // Fallback: use the scripts launcher
            debuggerArgs = [
              '-jar', path.join(javaDebugPath, 'launcher.jar'),
              '--port', javaPort.toString()
            ];
          }
        } else {
          debuggerArgs = [
            '-jar', launcherJar,
            '--port', javaPort.toString()
          ];
        }

        console.log(`[Debug] Using Java debug adapter at port ${javaPort}`);

        // Spawn the Java debug adapter
        const javaChildProcess = spawn(debuggerPath, debuggerArgs, {
          cwd: configuration.cwd || workspacePath,
          env: this.getSafeDebugEnv(configuration.env as Record<string, string> | undefined),
        });

        javaChildProcess.on('error', (err) => {
          console.error(`[Debug][Java Spawn Error] ${err.message}`);
          _window.webContents.send('debug:error', { sessionId: 'initializing', error: `Java debugger failed to start: ${err.message}` });
        });

        adapter.process = javaChildProcess;

        // Establish socket connection to Java debug adapter
        const javaSocket = new net.Socket();
        let javaConnected = false;
        const javaMaxRetries = 10;

        for (let attempt = 1; attempt <= javaMaxRetries; attempt++) {
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                javaSocket.destroy();
                reject(new Error('Timeout'));
              }, 3000);

              javaSocket.once('connect', () => {
                clearTimeout(timeout);
                resolve();
              });

              javaSocket.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
              });

              javaSocket.connect(javaPort, '127.0.0.1');
            });
            javaConnected = true;
            break;
          } catch (e) {
            if (attempt === javaMaxRetries) {
              throw new Error(`Failed to connect to Java debugger after ${javaMaxRetries} attempts on port ${javaPort}`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        if (!javaConnected) {
          throw new Error(`Failed to establish connection to Java debug adapter on port ${javaPort}`);
        }

        adapter.socket = javaSocket;
        return adapter;
      }

      case 'coreclr':
        debuggerPath = 'vsdbg';
        debuggerArgs = ['--interpreter=vscode'];
        requiredBinary = 'vsdbg';
        installInstructions = '.NET Debugging requires vsdbg.\nInstall via .NET SDK or download from Microsoft.';
        break;

      default:
        requiredBinary = `${type}-debug-adapter`;
        installInstructions = `Debugging for '${type}' requires an external Debug Adapter Protocol (DAP) server.\nPlease install the appropriate DAP-compliant debugger for your system.`;
        _window.webContents.send('debug:adapter-missing', { 
            type, 
            requiredBinary, 
            installInstructions 
        });
        throw new Error(`Unsupported debug type: ${type}. Please install the required debug adapter.`);
    }

    // Validate that the required binary exists before attempting to spawn
    if (requiredBinary) {
      const binaryExists = await this.checkBinaryExists(requiredBinary);
      if (!binaryExists) {
        // AUTOMATED INSTALLATION Flow:
        // Try to see if it's available in bundled binaries first
        const bundled = binaryManager.getBinaryPath(requiredBinary);
        if (bundled) {
            debuggerPath = bundled;
        } else {
            // Notify frontend that adapter is missing and offer installation
            _window.webContents.send('debug:adapter-missing', { 
                type, 
                requiredBinary, 
                installInstructions 
            });
            throw new Error(`Debug adapter not found: '${requiredBinary}' is not installed.\n\nKalynt is offering to install it via the popup.`);
        }
      } else {
        // Resolve the actual path to use (may be from common locations)
        debuggerPath = await this.resolveBinaryPath(requiredBinary);
      }
      
      console.log(`[Debug] Using debugger at: ${debuggerPath}`);
    }

    // Spawn debugger process
    // SECURITY: Use filtered environment variables to prevent env injection
    const childProcess = spawn(debuggerPath, debuggerArgs, {
      cwd: configuration.cwd || workspacePath,
      env: this.getSafeDebugEnv(configuration.env as Record<string, string> | undefined),
    });

    childProcess.on('error', (err) => {
      console.error(`[Debug][Spawn Error] ${err.message}`);
      _window.webContents.send('debug:error', { sessionId: 'initializing', error: `Debugger failed to start: ${err.message}` });
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
    'lldb-dap': {
      windows: [
        'C:\\Program Files\\LLVM\\bin\\lldb-dap.exe',
        `${process.env.PROGRAMFILES}\\LLVM\\bin\\lldb-dap.exe`,
      ],
      darwin: [
        '/opt/homebrew/opt/llvm/bin/lldb-dap',
        '/usr/local/opt/llvm/bin/lldb-dap',
        '/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap',
      ],
      linux: [
        '/usr/bin/lldb-dap',
        '/usr/local/bin/lldb-dap',
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
        '/usr/bin/lldb-vscode',
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

  // SECURITY: Allowlist of safe debugger binaries
  private static readonly SAFE_BINARIES = new Set([
    'node', 'python', 'python3',      // Interpreters
    'lldb-vscode', 'lldb-dap', 'gdb', // Debuggers
    'dlv', 'vsdbg', 'java', 'javac',  // More Debuggers/Runtimes
    'debugpy',                        // Python debug module
  ]);

  // SECURITY: Allowlist of safe Python modules to check
  private static readonly SAFE_PYTHON_MODULES = new Set([
    'debugpy', 'pdb', 'ipdb',
  ]);

  // SECURITY: Allowlist of safe environment variables for debug processes
  // Prevents injection of dangerous env vars like LD_PRELOAD, DYLD_INSERT_LIBRARIES
  private static readonly SAFE_DEBUG_ENV_VARS = new Set([
    // Path and system
    'PATH', 'PATHEXT', 'COMSPEC', 'SHELL',
    'HOME', 'USERPROFILE', 'USERNAME', 'USER', 'LOGNAME',
    'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR',
    // Locale
    'LANG', 'LC_ALL', 'LC_CTYPE', 'LANGUAGE', 'TZ',
    // Language runtimes
    'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH',
    'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV',
    'GOPATH', 'GOROOT', 'GOCACHE',
    'CARGO_HOME', 'RUSTUP_HOME',
    // Debug-specific
    'DEBUG', 'NODE_DEBUG', 'RUST_BACKTRACE', 'RUST_LOG', 'PYDEVD_DISABLE_FILE_VALIDATION',
    // Windows-specific
    'SYSTEMROOT', 'WINDIR', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
    'COMMONPROGRAMFILES', 'APPDATA', 'LOCALAPPDATA',
    // macOS/Linux
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
  ]);

  /**
   * Get safe environment variables for debug processes
   * SECURITY FIX: Prevents env injection attacks like LD_PRELOAD
   */
  private getSafeDebugEnv(userEnv?: Record<string, string>): NodeJS.ProcessEnv {
    const safeEnv: NodeJS.ProcessEnv = {};

    // Copy only allowed env vars from process.env
    for (const key of Array.from(DebugSessionManager.SAFE_DEBUG_ENV_VARS)) {
      if (process.env[key] !== undefined) {
        safeEnv[key] = process.env[key];
      }
    }

    // Also allow user-specified env vars, but filter dangerous ones
    if (userEnv) {
      const dangerousPatterns = [
        'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
        'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH',
        'NODE_OPTIONS', // Can be used for code injection
        'ELECTRON_RUN_AS_NODE', // Dangerous in Electron
      ];

      for (const [key, value] of Object.entries(userEnv)) {
        const upperKey = key.toUpperCase();
        const isDangerous = dangerousPatterns.some(p => upperKey.includes(p));
        if (!isDangerous && typeof value === 'string') {
          safeEnv[key] = value;
        } else if (isDangerous) {
          console.warn(`[Debug] Blocked dangerous env var: ${key}`);
        }
      }
    }

    return safeEnv;
  }

  /**
   * Sanitize file path from untrusted sources (e.g., package.json)
   * SECURITY FIX: Prevents shell command injection via malicious file paths
   */
  private sanitizeFilePath(filePath: string): string {
    if (typeof filePath !== 'string') return 'index.js';

    // Remove shell metacharacters that could be used for injection
    let sanitized = filePath
      .replace(/[;&|`$(){}[\]\\'"!<>]/g, '')  // Remove shell special chars
      .replace(/\.\.\//g, '')                   // Remove path traversal
      .replace(/\.\.\\/g, '')                   // Remove Windows path traversal
      .replace(/\0/g, '')                       // Remove null bytes
      .trim();

    // Ensure it's a reasonable file path
    if (!sanitized || sanitized.length === 0) {
      return 'index.js';
    }

    // Only allow common file extensions for entry points
    const allowedExtensions = ['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx'];
    const hasValidExtension = allowedExtensions.some(ext => sanitized.endsWith(ext));
    if (!hasValidExtension && !sanitized.includes('.')) {
      // No extension, assume .js
      sanitized = sanitized + '.js';
    }

    return sanitized;
  }

  /**
   * Validate binary name against allowlist
   * SECURITY FIX: Prevents command injection by only allowing known-safe binary names
   */
  private isBinarySafe(binary: string): boolean {
    // Extract base name (handle paths)
    const baseName = binary.split(/[/\\]/).pop() || binary;
    // Remove extension for Windows
    const cleanName = baseName.replace(/\.(exe|cmd|bat)$/i, '');
    return DebugSessionManager.SAFE_BINARIES.has(cleanName.toLowerCase());
  }

  /**
   * Validate Python module name
   * SECURITY FIX: Prevents code injection in Python import statement
   */
  private isModuleSafe(moduleName: string): boolean {
    return DebugSessionManager.SAFE_PYTHON_MODULES.has(moduleName.toLowerCase());
  }

  /**
   * Check if binary is in PATH
   */
  private checkBinaryInPath(binary: string): Promise<boolean> {
    // SECURITY: Validate binary name before using in shell command
    if (!this.isBinarySafe(binary)) {
      console.warn(`[Debug] Blocked unsafe binary check: ${binary}`);
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const command = process.platform === 'win32' ? 'where' : 'which';
      // SECURITY: shell: false is safer since we validated the binary name
      const checkProcess = spawn(command, [binary]);

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
    // SECURITY: Validate module name before using in Python import
    if (!this.isModuleSafe(moduleName)) {
      console.warn(`[Debug] Blocked unsafe Python module check: ${moduleName}`);
      return false;
    }

    // First, try to find Python
    const pythonPath = await this.resolveBinaryPath('python');

    return new Promise((resolve) => {
      // SECURITY: shell: false is safer, and Python doesn't need shell
      const checkProcess = spawn(pythonPath, ['-c', `import ${moduleName}`]);

      checkProcess.on('close', (code) => {
        resolve(code === 0);
      });

      checkProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Set up communication with debug adapter (process or socket)
   */
  private setupAdapterCommunication(adapter: DebugAdapter, window: BrowserWindow, sessionId: string) {
    const dataHandler = (data: Buffer) => {
      adapter.messageBuffer += data.toString();
      this.processAdapterMessages(adapter, window, sessionId);
    };

    if (adapter.socket) {
      // Socket is handling DAP. stdout/stderr are pure console output.
      adapter.socket.on('data', dataHandler);
      adapter.socket.on('error', (err) => {
        console.error(`[Debug][${sessionId}] Socket error:`, err);
        window.webContents.send('debug:error', { sessionId, error: `Socket error: ${err.message}` });
      });
      adapter.socket.on('close', () => {
        console.log(`[Debug][${sessionId}] Socket closed`);
        window.webContents.send('debug:terminated', { sessionId });
      });

      // Forward pure console output
      adapter.process?.stdout?.on('data', (data: Buffer) => {
        window.webContents.send('debug:output', { type: 'stdout', output: data.toString() });
      });
      adapter.process?.stderr?.on('data', (data: Buffer) => {
        window.webContents.send('debug:output', { type: 'stderr', output: data.toString() });
      });
      adapter.process?.on('exit', (code) => {
        window.webContents.send('debug:terminated', { exitCode: code });
      });

    } else if (adapter.process) {
      // Process stdout is handling DAP stream.
      adapter.process.stdout?.on('data', dataHandler);

      adapter.process.stderr?.on('data', (data: Buffer) => {
        console.error('Debug adapter error:', data.toString());
        window.webContents.send('debug:output', {
          type: 'stderr',
          output: data.toString(), // Use 'output' consistently with DAP
        });
      });

      adapter.process.on('exit', (code) => {
        console.log('Debug adapter exited with code:', code);
        window.webContents.send('debug:terminated', { exitCode: code });
      });
    }
  }

  /**
   * Helper to find an available TCP port
   */
  private async getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => {
          resolve(port);
        });
      });
    });
  }

  /**
   * Process messages from debug adapter using a robust streaming approach
   */
  private processAdapterMessages(adapter: DebugAdapter, _window: BrowserWindow, sessionId: string) {
    while (adapter.messageBuffer.length > 0) {
      const contentLengthPrefix = 'Content-Length: ';
      const headerStartIndex = adapter.messageBuffer.indexOf(contentLengthPrefix);

      if (headerStartIndex === -1) {
          // No DAP header found. If we are not expecting DAP on this channel (e.g. stdout when using socket), 
          // this shouldn't happen, but just in case, we wait for more data.
          // However, if we know it's noise, we could clear it, but we can't be sure until we see a header.
          if (adapter.messageBuffer.length > 10000) {
              // Safety valve to prevent unbounded memory growth if a process is just spamming non-DAP logs
              console.warn(`[Debug][${sessionId}] Buffer overflowed without finding DAP header, discarding data.`);
              _window.webContents.send('debug:output', { type: 'stdout', output: adapter.messageBuffer });
              adapter.messageBuffer = '';
          }
          break;
      }

      // Drop any noise BEFORE the Content-Length header.
      if (headerStartIndex > 0) {
          const noise = adapter.messageBuffer.substring(0, headerStartIndex);
          console.log(`[Debug][${sessionId}] Dropped noise before DAP packet:`, noise);
          // Send noise to debug console so the user sees it (often it's startup logs/errors)
          _window.webContents.send('debug:output', { type: 'stdout', output: noise });
          adapter.messageBuffer = adapter.messageBuffer.substring(headerStartIndex);
          continue; // Restart loop so index is now 0
      }

      // Now adapter.messageBuffer starts exactly at "Content-Length: "
      const headerEndIndex = adapter.messageBuffer.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) break; // Incomplete header

      // Extract Content-Length
      const header = adapter.messageBuffer.substring(0, headerEndIndex);
      const contentLengthMatch = /Content-Length: (\d+)/i.exec(header);
      
      if (!contentLengthMatch) {
          // Extremely malformed header, advance by 1 to try searching again
          adapter.messageBuffer = adapter.messageBuffer.substring(1);
          continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStartIndex = headerEndIndex + 4; // \r\n\r\n is 4 bytes

      // Check if we have the full message body
      if (adapter.messageBuffer.length < messageStartIndex + contentLength) break;

      const messageContent = adapter.messageBuffer.substring(
        messageStartIndex,
        messageStartIndex + contentLength
      );
      
      // Advance buffer
      adapter.messageBuffer = adapter.messageBuffer.substring(messageStartIndex + contentLength);

      try {
        const message = JSON.parse(messageContent);
        this.handleAdapterMessage(message, _window, sessionId);
      } catch (error) {
        console.error(`[Debug][${sessionId}] Failed to parse DAP message:`, error);
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

      // Dispatch to wait listeners if any
      const sessionListeners = this.eventListeners.get(sessionId);
      if (sessionListeners && sessionListeners.has(event.event)) {
        const callbacks = sessionListeners.get(event.event)!;
        callbacks.forEach(cb => cb(event));
        sessionListeners.set(event.event, []); // Clear after firing
      }

      // Handle specific events
      switch (event.event) {
        case 'stopped': {
          // Store threadId for subsequent operations
          const session = this.sessions.get(sessionId);
          if (session && event.body?.threadId !== undefined) {
            session.threadId = event.body.threadId;
          }
          window.webContents.send('debug:stopped', event.body);
          break;
        }
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

      if (adapter.socket) {
        adapter.socket.write(packet);
      } else if (adapter.process?.stdin) {
        adapter.process.stdin.write(packet);
      } else {
        clearTimeout(timeoutId);
        adapter.pendingRequests.delete(request.seq);
        reject(new Error('No communication channel available'));
      }
    });
  }

  /**
   * Wait for a specific DAP event from the debug adapter
   */
  private waitForEvent(sessionId: string, eventName: string, timeoutMs: number = 10000): Promise<DAPEvent> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error(`Timeout waiting for event: ${eventName}`)), timeoutMs);
      
      if (!this.eventListeners.has(sessionId)) {
        this.eventListeners.set(sessionId, new Map());
      }
      const sessionListeners = this.eventListeners.get(sessionId)!;
      if (!sessionListeners.has(eventName)) {
        sessionListeners.set(eventName, []);
      }
      
      sessionListeners.get(eventName)!.push((event: DAPEvent) => {
        clearTimeout(timeoutId);
        resolve(event);
      });
    });
  }

  /**
   * Filter configuration to only include valid DAP launch arguments
   * Removes VS Code-specific properties that are not part of DAP
   */
  private filterLaunchArguments(config: DebugConfiguration): Record<string, any> {
    // Properties that are VS Code specific and should not be sent to DAP adapter
    const vscodeSpecificProps = new Set([
      'type',           // Debug type (handled by adapterID in initialize)
      'request',        // launch/attach (used as command name)
      'name',           // Configuration name (UI only)
      'preLaunchTask',  // VS Code task system
      'postDebugTask',  // VS Code task system
      'internalConsoleOptions', // VS Code UI option
      'presentation',   // VS Code UI presentation
    ]);

    const filtered: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(config)) {
      if (!vscodeSpecificProps.has(key)) {
        filtered[key] = value;
      }
    }
    
    return filtered;
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
   * Add a watch expression
   */
  addWatchExpression(sessionId: string, expression: string): WatchExpression {
    const expressions = this.watchExpressions.get(sessionId) || [];
    const watch: WatchExpression = {
      id: `watch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      expression,
    };
    expressions.push(watch);
    this.watchExpressions.set(sessionId, expressions);
    return watch;
  }

  /**
   * Remove a watch expression
   */
  removeWatchExpression(sessionId: string, watchId: string): boolean {
    const expressions = this.watchExpressions.get(sessionId);
    if (!expressions) return false;
    
    const index = expressions.findIndex(w => w.id === watchId);
    if (index === -1) return false;
    
    expressions.splice(index, 1);
    return true;
  }

  /**
   * Get all watch expressions for a session
   */
  getWatchExpressions(sessionId: string): WatchExpression[] {
    return this.watchExpressions.get(sessionId) || [];
  }

  /**
   * Update all watch expressions for a session (call when execution stops)
   */
  async updateWatchExpressions(sessionId: string, frameId?: number): Promise<void> {
    const expressions = this.watchExpressions.get(sessionId);
    if (!expressions || expressions.length === 0) return;

    for (const watch of expressions) {
      try {
        const result = await this.evaluate(sessionId, watch.expression, frameId);
        watch.result = result?.result;
        watch.type = result?.type;
        watch.error = undefined;
      } catch (error) {
        watch.error = error instanceof Error ? error.message : 'Evaluation failed';
        watch.result = undefined;
      }
    }
  }

  /**
   * Clear watch expressions for a session
   */
  clearWatchExpressions(sessionId: string): void {
    this.watchExpressions.delete(sessionId);
  }

  /**
   * Resolve configuration variables like ${workspaceFolder} and ${env:VAR}
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
      '${pathSeparator}': path.sep,
    };

    const replaceVariables = (obj: any): any => {
      if (typeof obj === 'string') {
        let result = obj;
        
        // Replace standard variables
        for (const [variable, value] of Object.entries(replacements)) {
          result = result.replaceAll(variable, value);
        }

        // Replace environment variables: ${env:NAME}
        result = result.replace(/\$\{env:([^}]+)\}/g, (_, name) => {
            return process.env[name] || '';
        });

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

  /**
   * Stop all active debug sessions
   */
  async stopAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.stopSession(id)));
  }
}

// Singleton instance
const debugSessionManager = new DebugSessionManager();

// Clean up all sessions on app exit
app.on('before-quit', () => {
  debugSessionManager.stopAllSessions().catch(console.error);
});

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

  // Watch Expressions
  ipc.handle('debug:addWatch', async (_, sessionId: string, expression: string) => {
    try {
      const watch = debugSessionManager.addWatchExpression(sessionId, expression);
      return { success: true, watch };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:removeWatch', async (_, sessionId: string, watchId: string) => {
    try {
      const removed = debugSessionManager.removeWatchExpression(sessionId, watchId);
      return { success: removed };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:getWatches', async (_, sessionId: string) => {
    try {
      const watches = debugSessionManager.getWatchExpressions(sessionId);
      return { success: true, watches };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:updateWatches', async (_, sessionId: string, frameId?: number) => {
    try {
      await debugSessionManager.updateWatchExpressions(sessionId, frameId);
      const watches = debugSessionManager.getWatchExpressions(sessionId);
      return { success: true, watches };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipc.handle('debug:clearWatches', async (_, sessionId: string) => {
    try {
      debugSessionManager.clearWatchExpressions(sessionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
