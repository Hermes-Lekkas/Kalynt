/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Platform-aware keybinding utilities
// Handles cross-platform keyboard shortcuts (Windows/Linux vs macOS)

export type Platform = 'mac' | 'win' | 'linux'

// Detect current platform
export function getPlatform(): Platform {
    if (typeof navigator !== 'undefined') {
        const platform = navigator.platform.toLowerCase()
        if (platform.includes('mac')) return 'mac'
        if (platform.includes('win')) return 'win'
        return 'linux'
    }
    // Default to Windows for Electron
    return 'win'
}

// Format a keybinding for display based on platform
export function formatKeybinding(keybinding: string, platform?: Platform): string {
    const p = platform || getPlatform()

    if (p === 'mac') {
        return keybinding
            .replace(/Ctrl/g, 'âŒ˜')
            .replace(/Alt/g, 'âŒ¥')
            .replace(/Shift/g, 'â‡§')
            .replace(/\+/g, '')
    }

    return keybinding
}

// Common keybindings registry
/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export const keybindings = {
    save: { win: 'Ctrl+S', mac: 'âŒ˜S' },
    close: { win: 'Ctrl+W', mac: 'âŒ˜W' },
    openFile: { win: 'Ctrl+P', mac: 'âŒ˜P' },
    commandPalette: { win: 'Ctrl+Shift+P', mac: 'â‡§âŒ˜P' },
    search: { win: 'Ctrl+Shift+F', mac: 'â‡§âŒ˜F' },
    terminal: { win: 'Ctrl+`', mac: 'âŒƒ`' },
    inlineEdit: { win: 'Ctrl+K', mac: 'âŒ˜K' },
    run: { win: 'F5', mac: 'F5' },
    undo: { win: 'Ctrl+Z', mac: 'âŒ˜Z' },
    redo: { win: 'Ctrl+Y', mac: 'â‡§âŒ˜Z' },
    copy: { win: 'Ctrl+C', mac: 'âŒ˜C' },
    paste: { win: 'Ctrl+V', mac: 'âŒ˜V' },
    cut: { win: 'Ctrl+X', mac: 'âŒ˜X' },
    selectAll: { win: 'Ctrl+A', mac: 'âŒ˜A' },
    find: { win: 'Ctrl+F', mac: 'âŒ˜F' },
    replace: { win: 'Ctrl+H', mac: 'âŒ¥âŒ˜F' }
}

// Get keybinding for current platform
export function getKeybinding(key: keyof typeof keybindings, platform?: Platform): string {
    const p = platform || getPlatform()
    const binding = keybindings[key]
    return p === 'mac' ? binding.mac : binding.win
}

// Check if a keyboard event matches a keybinding
export function matchesKeybinding(
    event: KeyboardEvent,
    key: keyof typeof keybindings
): boolean {
    const platform = getPlatform()
    const binding = keybindings[key]
    const target = platform === 'mac' ? binding.mac : binding.win

    // Parse the binding
    const parts = target.replace(/âŒ˜|â‡§|âŒ¥|âŒƒ/g, '').toLowerCase()
    const hasCmd = target.includes('âŒ˜') || target.includes('Ctrl')
    const hasShift = target.includes('â‡§') || target.includes('Shift')
    const hasAlt = target.includes('âŒ¥') || target.includes('Alt')

    const cmdKey = platform === 'mac' ? event.metaKey : event.ctrlKey

    return (
        event.key.toLowerCase() === parts &&
        cmdKey === hasCmd &&
        event.shiftKey === hasShift &&
        event.altKey === hasAlt
    )
}

// Format keybinding list for display
export function formatKeybindingHint(hints: { action: string; key: keyof typeof keybindings }[]): string {
    const platform = getPlatform()
    return hints
        .map(h => `${h.action}: ${getKeybinding(h.key, platform)}`)
        .join(' | ')
}
