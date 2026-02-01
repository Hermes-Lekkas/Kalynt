/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// main-process/shellIntegration.ts
import { IPty } from 'node-pty'
import { EventEmitter } from 'events'

export interface ShellIntegrationData {
    type: 'command_start' | 'command_end' | 'cwd_change' | 'prompt' | 'continuation'
    timestamp: number
    terminalId: string
    data?: any
}

export interface CommandRecord {
    id: string
    terminalId: string
    command: string
    cwd: string
    startTime: number
    endTime?: number
    exitCode?: number
    output?: string
    hasOutput: boolean
    decorations?: Array<{
        line: number
        column: number
        length: number
        type: 'error' | 'warning' | 'info' | 'success'
        message?: string
    }>
}

export class ShellIntegrationService extends EventEmitter {
    private readonly integrations = new Map<string, ShellIntegration>()
    private readonly commandHistory = new Map<string, CommandRecord[]>()
    private readonly maxCommandHistory = 1000

    constructor() {
        super()
    }

    attachToTerminal(terminalId: string, ptyProcess: IPty, shell: string): void {
        const integration = new ShellIntegration(terminalId, shell, ptyProcess)
        this.integrations.set(terminalId, integration)

        integration.on('data', (data: ShellIntegrationData) => {
            this.handleIntegrationData(data)
        })

        integration.on('command', (command: CommandRecord) => {
            this.handleCommandRecord(command)
        })

        // Initialize shell integration
        integration.initialize()
    }

    private handleIntegrationData(data: ShellIntegrationData): void {
        this.emit('integration_data', data)

        // Process based on type
        switch (data.type) {
            case 'command_start':
                // Handle command start
                break
            case 'command_end':
                // Handle command end
                break
            case 'cwd_change':
                // Update current working directory
                break
        }
    }

    private handleCommandRecord(command: CommandRecord): void {
        // Store in history
        const history = this.commandHistory.get(command.terminalId) || []
        history.push(command)

        // Trim history if too long
        if (history.length > this.maxCommandHistory) {
            history.splice(0, history.length - this.maxCommandHistory)
        }

        this.commandHistory.set(command.terminalId, history)

        // Emit event for UI updates
        this.emit('command_recorded', command)

        // Analyze command for decorations
        this.analyzeCommandForDecorations(command)
    }

    private analyzeCommandForDecorations(command: CommandRecord): void {
        // Analyze command output for errors, warnings, etc.
        if (command.output) {
            const decorations: Array<{
                line: number
                column: number
                length: number
                type: 'error' | 'warning' | 'info' | 'success'
                message?: string
            }> = []

            // Example: Find error patterns
            const errorPatterns = [
                /error:/gi,
                /failed/gi,
                /syntax error/gi,
                /not found/gi,
                /permission denied/gi
            ]

            const lines = command.output.split('\n')
            lines.forEach((line, lineIndex) => {
                errorPatterns.forEach(pattern => {
                    const matches = line.match(pattern)
                    if (matches) {
                        matches.forEach(match => {
                            const column = line.indexOf(match)
                            decorations.push({
                                line: lineIndex,
                                column,
                                length: match.length,
                                type: 'error',
                                message: 'Error detected'
                            })
                        })
                    }
                })
            })

            if (decorations.length > 0) {
                command.decorations = decorations
                this.emit('decorations_available', {
                    terminalId: command.terminalId,
                    commandId: command.id,
                    decorations
                })
            }
        }
    }

    processData(terminalId: string, data: string): void {
        const integration = this.integrations.get(terminalId)
        if (integration) {
            integration.processData(data)
        }
    }

    getCommandHistory(terminalId: string): CommandRecord[] {
        return this.commandHistory.get(terminalId) || []
    }

    getCurrentCommand(terminalId: string): CommandRecord | undefined {
        const history = this.commandHistory.get(terminalId)
        return history ? history[history.length - 1] : undefined
    }

    clearHistory(terminalId: string): void {
        this.commandHistory.delete(terminalId)
    }

    getShellIntegrationScript(shell: string): string {
        const scripts = {
            bash: `
        __kalynt_prompt_command() {
          local exit_code=$?
          printf "\\033]633;E;$exit_code\\007"
          printf "\\033]633;D\\007"
        }
        PS1="\\[\\033]633;A\\007\\]\\[\\033]633;C;$PWD\\007\\]\\[\\033]633;B\\007\\]$PS1\\[\\033]633;D\\007\\]"
        trap '__kalynt_prompt_command' DEBUG
      `,
            zsh: `
        precmd() {
          printf "\\033]633;A\\007"
          printf "\\033]633;C;$PWD\\007"
          printf "\\033]633;B\\007"
        }
        preexec() {
          printf "\\033]633;D\\007"
        }
      `,
            fish: `
        function __kalynt_prompt --on-event fish_prompt
          printf "\\033]633;A\\007"
          printf "\\033]633;C;$PWD\\007"
          printf "\\033]633;B\\007"
        end
        function __kalynt_preexec --on-event fish_preexec
          printf "\\033]633;D\\007"
        end
      `,
            pwsh: `
        function prompt {
          Write-Host -NoNewLine "\`e]633; A\`a"
          Write-Host -NoNewLine "\`e]633; C; $($executionContext.SessionState.Path.CurrentLocation)\`a"
          Write-Host -NoNewLine "\`e]633; B\`a"
          "> "
        }
        function __kalynt_preexec {
          Write-Host -NoNewLine "\`e]633; D\`a"
        }
        Set-PSBreakpoint -Command '*' -Action { __kalynt_preexec }
      `
        }

        return scripts[shell as keyof typeof scripts] || ''
    }

    dispose(): void {
        this.integrations.clear()
        this.commandHistory.clear()
        this.removeAllListeners()
    }
}

class ShellIntegration extends EventEmitter {
    private buffer = ''
    private currentCommand?: CommandRecord
    private outputBuffer = ''
    private inCommand = false

    constructor(
        private terminalId: string,
        private shell: string,
        private ptyProcess: IPty
    ) {
        super()
    }

    initialize(): void {
        const script = this.getIntegrationScript()
        if (script) {
            // Send initialization script
            setTimeout(() => {
                this.ptyProcess.write(script + '\r\n')
            }, 100)
        }
    }

    processData(data: string): void {
        this.buffer += data

        // Look for OSC 633 sequences (VS Code shell integration protocol)
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // eslint-disable-next-line no-control-regex
            const match = this.buffer.match(/\x1b\]633;(.+?)\x07/)
            if (!match) break

            const sequence = match[1]
            this.buffer = this.buffer.replace(match[0], '')
            this.handleSequence(sequence)
        }

        // Buffer output if in command
        if (this.inCommand) {
            this.outputBuffer += data
        }

        // Pass through remaining data
        if (this.buffer.length > 0) {
            this.emit('raw_data', this.buffer)
            this.buffer = ''
        }
    }

    private handleSequence(sequence: string): void {
        const [type, ...args] = sequence.split(';')

        switch (type) {
            case 'A': // Command started
                this.inCommand = true
                this.outputBuffer = ''
                this.currentCommand = {
                    id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    terminalId: this.terminalId,
                    command: '',
                    cwd: args[0] || process.cwd(),
                    startTime: Date.now(),
                    hasOutput: false
                }
                this.emit('data', {
                    type: 'command_start',
                    timestamp: Date.now(),
                    terminalId: this.terminalId,
                    data: this.currentCommand
                })
                break

            case 'B': // Command line updated
                if (this.currentCommand) {
                    this.currentCommand.command = args.join(';')
                }
                break

            case 'C': // Current working directory
                if (this.currentCommand) {
                    this.currentCommand.cwd = args[0] || this.currentCommand.cwd
                }
                this.emit('data', {
                    type: 'cwd_change',
                    timestamp: Date.now(),
                    terminalId: this.terminalId,
                    data: { cwd: args[0] }
                })
                break

            case 'D': // Command finished
                this.inCommand = false
                if (this.currentCommand) {
                    this.currentCommand.endTime = Date.now()
                    this.currentCommand.output = this.outputBuffer
                    this.currentCommand.hasOutput = this.outputBuffer.length > 0

                    this.emit('command', this.currentCommand)
                    this.emit('data', {
                        type: 'command_end',
                        timestamp: Date.now(),
                        terminalId: this.terminalId,
                        data: this.currentCommand
                    })
                }
                break

            case 'E': // Exit code
                if (this.currentCommand && args[0]) {
                    this.currentCommand.exitCode = parseInt(args[0], 10)
                }
                break

            case 'P': // Prompt
                this.emit('data', {
                    type: 'prompt',
                    timestamp: Date.now(),
                    terminalId: this.terminalId
                })
                break
        }
    }

    private getIntegrationScript(): string {
        // Don't wrap PowerShell/CMD in bash syntax!
        const shellName = this.shell.toLowerCase()

        // PowerShell variants - disable integration for now
        // Multiline scripts cause parsing issues when sent through PTY
        if (shellName.includes('pwsh') || shellName.includes('powershell')) {
            console.log('[ShellIntegration] Skipping integration for PowerShell')
            return '' // Disable until we can send single-line scripts
        }

        // CMD - no integration (limited shell)
        if (shellName.includes('cmd')) {
            return '' // CMD doesn't support advanced prompt customization
        }

        // Unix shells (bash, zsh, fish)
        const baseScript = `
      # Kalynt Terminal Shell Integration
      if [ -n "$KALYNT_TERMINAL" ]; then
        ${this.getShellSpecificScript()}
      fi
    `

        return baseScript
    }

    private getShellSpecificScript(): string {
        const scripts: Record<string, string> = {
            bash: `
        __kalynt_cmd_start() {
          printf "\\033]633;A\\007"
          printf "\\033]633;C;$PWD\\007"
        }
        __kalynt_cmd_end() {
          printf "\\033]633;D\\007"
        }
        __kalynt_update_cmd() {
          printf "\\033]633;B;%s\\007" "$1"
        }
        trap '__kalynt_cmd_start' DEBUG
        PS1="\\[\\$(__kalynt_update_cmd "\\W")\\]$PS1"
      `,
            zsh: `
        __kalynt_preexec() {
          printf "\\033]633;A\\007"
          printf "\\033]633;C;$PWD\\007"
        }
        __kalynt_precmd() {
          printf "\\033]633;D\\007"
        }
        autoload -Uz add-zsh-hook
        add-zsh-hook preexec __kalynt_preexec
        add-zsh-hook precmd __kalynt_precmd
      `,
            fish: `
        function __kalynt_fish_preexec --on-event fish_preexec
          printf "\\033]633;A\\007"
          printf "\\033]633;C;$PWD\\007"
        end
        function __kalynt_fish_postexec --on-event fish_postexec
          printf "\\033]633;D\\007"
        end
      `,
            pwsh: `
        function __kalynt_prompt {
          Write-Host -NoNewLine "\`e]633; A\`a"
          Write-Host -NoNewLine "\`e]633; C; $PWD\`a"
          "> "
        }
        function __kalynt_preexec {
          param($Command)
          Write-Host -NoNewLine "\`e]633; B; $Command\`a"
        }
        Set-PSBreakpoint -Command '*' -Action { __kalynt_preexec $args[0] }
      `
        }

        return scripts[this.shell] || ''
    }
}