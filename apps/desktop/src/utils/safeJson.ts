/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Safe JSON parsing utilities
 * 
 * These utilities provide safe wrappers around JSON.parse with proper
 * error handling and optional schema validation.
 */

export interface SafeParseResult<T> {
    success: boolean
    data?: T
    error?: string
}

/**
 * Safely parse JSON string with error handling
 * @param jsonString The string to parse
 * @param defaultValue Optional default value to return on failure
 * @returns The parsed data or default value
 */
export function safeJsonParse<T>(jsonString: string | null | undefined, defaultValue?: T): T | undefined {
    if (!jsonString || typeof jsonString !== 'string') {
        return defaultValue
    }

    try {
        return JSON.parse(jsonString) as T
    } catch (error) {
        console.warn('[safeJson] Failed to parse JSON:', error)
        return defaultValue
    }
}

/**
 * Safely parse JSON string and return a result object
 * @param jsonString The string to parse
 * @returns Result object with success flag and data or error
 */
export function safeJsonParseResult<T>(jsonString: string | null | undefined): SafeParseResult<T> {
    if (!jsonString || typeof jsonString !== 'string') {
        return { success: false, error: 'Invalid input: null, undefined, or not a string' }
    }

    try {
        const data = JSON.parse(jsonString) as T
        return { success: true, data }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
    }
}

/**
 * Safely stringify JSON with error handling
 * @param data The data to stringify
 * @param defaultValue Optional default value to return on failure
 * @returns The JSON string or default value
 */
export function safeJsonStringify(data: unknown, defaultValue = '{}'): string {
    try {
        return JSON.stringify(data)
    } catch (error) {
        console.warn('[safeJson] Failed to stringify JSON:', error)
        return defaultValue
    }
}

/**
 * Safely parse JSON from localStorage
 * @param key The localStorage key
 * @param defaultValue Optional default value to return on failure
 * @returns The parsed data or default value
 */
export function safeLocalStorageGet<T>(key: string, defaultValue?: T): T | undefined {
    try {
        const item = localStorage.getItem(key)
        if (!item) {
            return defaultValue
        }
        return JSON.parse(item) as T
    } catch (error) {
        console.warn(`[safeJson] Failed to parse localStorage item "${key}":`, error)
        return defaultValue
    }
}

/**
 * Safely stringify and save to localStorage
 * @param key The localStorage key
 * @param data The data to save
 * @returns true if successful, false otherwise
 */
export function safeLocalStorageSet(key: string, data: unknown): boolean {
    try {
        localStorage.setItem(key, JSON.stringify(data))
        return true
    } catch (error) {
        console.warn(`[safeJson] Failed to save localStorage item "${key}":`, error)
        return false
    }
}

/**
 * Validate that parsed data matches expected type using a guard function
 * @param jsonString The string to parse
 * @param typeGuard A type guard function to validate the parsed data
 * @returns The parsed data if valid, undefined otherwise
 */
export function safeJsonParseWithGuard<T>(
    jsonString: string | null | undefined,
    typeGuard: (data: unknown) => data is T
): T | undefined {
    const result = safeJsonParseResult<T>(jsonString)
    
    if (!result.success) {
        return undefined
    }
    
    if (!typeGuard(result.data)) {
        console.warn('[safeJson] Parsed data failed type guard validation')
        return undefined
    }
    
    return result.data
}

/**
 * Parse JSON array safely
 * @param jsonString The string to parse
 * @returns Array if successful, empty array otherwise
 */
export function safeJsonParseArray<T>(jsonString: string | null | undefined): T[] {
    const result = safeJsonParseResult<T[]>(jsonString)
    
    if (!result.success || !Array.isArray(result.data)) {
        return []
    }
    
    return result.data
}

/**
 * Parse JSON object safely
 * @param jsonString The string to parse
 * @returns Object if successful, empty object otherwise
 */
export function safeJsonParseObject<T extends Record<string, unknown>>(
    jsonString: string | null | undefined
): T {
    const result = safeJsonParseResult<T>(jsonString)
    
    if (!result.success || typeof result.data !== 'object' || result.data === null || Array.isArray(result.data)) {
        return {} as T
    }
    
    return result.data
}
