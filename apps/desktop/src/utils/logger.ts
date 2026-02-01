/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Centralized Logger for Kalynt
// Provides togglable debug logging per subsystem

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type Subsystem = 'crdt' | 'p2p' | 'crypto' | 'agent' | 'ide' | 'ai' | 'general'

interface LoggerConfig {
    enabled: boolean
    level: LogLevel
    subsystems: Partial<Record<Subsystem, boolean>>
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
}

// Default config - can be overridden
const config: LoggerConfig = {
    enabled: true,
    level: 'info',
    subsystems: {
        crdt: true,
        p2p: true,
        crypto: true,
        agent: true,
        ide: true,
        ai: true,
        general: true
    }
}

// Load config from localStorage if available
function loadConfig() {
    try {
        const stored = localStorage.getItem('kalynt-logger-config')
        if (stored) {
            const parsed = JSON.parse(stored)
            Object.assign(config, parsed)
        }
    } catch (error) {
        // Intentionally ignore errors in logger infrastructure to avoid circular logging
        // Falls back to default config if localStorage is unavailable or parsing fails
        if (typeof console !== 'undefined' && console.debug) {
            console.debug('[Logger] Failed to load config from localStorage, using defaults', error)
        }
    }
}

// Save config to localStorage
function saveConfig() {
    try {
        localStorage.setItem('kalynt-logger-config', JSON.stringify(config))
    } catch (error) {
        // Intentionally ignore errors in logger infrastructure to avoid circular logging
        // Silent failure is acceptable here as logger will continue with in-memory config
        if (typeof console !== 'undefined' && console.debug) {
            console.debug('[Logger] Failed to save config to localStorage', error)
        }
    }
}

// Initialize config
if (typeof localStorage !== 'undefined') {
    loadConfig()
}

// Formatted timestamp
function timestamp(): string {
    return new Date().toISOString().split('T')[1].slice(0, 12)
}

// Main logger class
class Logger {
    private subsystem: Subsystem
    private prefix: string

    constructor(subsystem: Subsystem) {
        this.subsystem = subsystem
        this.prefix = `[${subsystem.toUpperCase()}]`
    }

    private shouldLog(level: LogLevel): boolean {
        if (!config.enabled) return false
        if (config.subsystems[this.subsystem] === false) return false
        return LOG_LEVELS[level] >= LOG_LEVELS[config.level]
    }

    debug(...args: unknown[]) {
        if (this.shouldLog('debug')) {
            console.debug(`${timestamp()} ${this.prefix}`, ...args)
        }
    }

    info(...args: unknown[]) {
        if (this.shouldLog('info')) {
            console.info(`${timestamp()} ${this.prefix}`, ...args)
        }
    }

    warn(...args: unknown[]) {
        if (this.shouldLog('warn')) {
            console.warn(`${timestamp()} ${this.prefix}`, ...args)
        }
    }

    error(...args: unknown[]) {
        if (this.shouldLog('error')) {
            console.error(`${timestamp()} ${this.prefix}`, ...args)
        }
    }

    // Log with specific level
    log(level: LogLevel, ...args: unknown[]) {
        switch (level) {
            case 'debug': this.debug(...args); break
            case 'info': this.info(...args); break
            case 'warn': this.warn(...args); break
            case 'error': this.error(...args); break
        }
    }
}

// Create loggers for each subsystem
export const logger = {
    crdt: new Logger('crdt'),
    p2p: new Logger('p2p'),
    crypto: new Logger('crypto'),
    agent: new Logger('agent'),
    ide: new Logger('ide'),
    ai: new Logger('ai'),
    general: new Logger('general')
}

// Config controls (for dev console)
export const loggerConfig = {
    enable: () => { config.enabled = true; saveConfig() },
    disable: () => { config.enabled = false; saveConfig() },
    setLevel: (level: LogLevel) => { config.level = level; saveConfig() },
    enableSubsystem: (sub: Subsystem) => { config.subsystems[sub] = true; saveConfig() },
    disableSubsystem: (sub: Subsystem) => { config.subsystems[sub] = false; saveConfig() },
    getConfig: () => ({ ...config }),
    // Quick toggle for dev
    verbose: () => { config.level = 'debug'; saveConfig() },
    quiet: () => { config.level = 'error'; saveConfig() }
}

// Expose to window for dev console access
if (typeof window !== 'undefined') {
    (window as any).kalyntLogger = loggerConfig
}
