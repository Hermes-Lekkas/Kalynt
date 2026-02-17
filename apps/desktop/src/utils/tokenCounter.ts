/**
 * Simple heuristic for token counting.
 * Averages ~4 characters per token for English text.
 * Code and other languages may vary, so we add a safety buffer.
 */
export function estimateTokens(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / 4)
}

/**
 * Truncate text to a maximum number of tokens.
 * Keeps the beginning of the text.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
    if (!text) return ''
    const estimated = estimateTokens(text)
    if (estimated <= maxTokens) return text
    
    // safe approximation: maxTokens * 4 chars
    return text.slice(0, maxTokens * 4) + '...(truncated)'
}
