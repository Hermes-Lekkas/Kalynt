/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect } from 'react'
import { TerminalState } from './types'

export function useTerminalIO(
    getCurrentTerminal: () => TerminalState | null,
    activeTabId: string
) {
    useEffect(() => {
        // This hook serves as a placeholder for centralized IO logic
        // Currently, most IO is handled directly in useTerminalSession

        // We can keep this hook for future extensibility
        return () => {
            // Cleanup
        }
    }, [getCurrentTerminal, activeTabId])
}
