/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Centralized Configuration Constants
 * All magic numbers, limits, and configuration values in one place
 */

export const CONFIG = {
  // File System Limits
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB - matches BUG-046 fix
  MAX_FILES_PER_DIRECTORY: 10000,
  DEFAULT_FILE_LIST_LIMIT: 100,

  // Collaboration
  COLLAB_MAX_HISTORY_ITEMS: 50,
  COLLAB_AUTO_SAVE_INTERVAL_MS: 5000,
  COLLAB_CAPTURE_TIMEOUT_MS: 500,
  MAX_COLLABORATORS: 100, // Free beta limit

  // Encryption (NIST/OWASP recommended values)
  ENCRYPTION_KEY_LENGTH: 256, // AES-256
  ENCRYPTION_PBKDF2_ITERATIONS: 100000, // OWASP minimum

  // AI/Streaming
  STREAMING_MAX_ITERATIONS: 1000000,
  AI_DEFAULT_MAX_TOKENS: 2048,
  AI_MIN_CONTEXT_TOKENS: 1024,
  AI_MAX_CONTEXT_TOKENS: 4096,
  AI_REQUEST_TIMEOUT_MS: 30000, // 30 seconds - matches BUG-089 fix

  // Agent
  AGENT_MAX_SUGGESTIONS: 100,
  AGENT_ANALYSIS_TIMEOUT_MS: 30000,
  AGENT_TIMER_DEBOUNCE_MS: 1000,

  // Model Downloads
  MODEL_DOWNLOAD_CHUNK_SIZE: 1024 * 1024, // 1MB chunks
  MODEL_DOWNLOAD_RESUME_SUPPORT: true,

  // UI/UX
  NOTIFICATION_DEFAULT_DURATION_MS: 5000,
  TERMINAL_DEFAULT_HEIGHT_PX: 200,
  SIDEBAR_DEFAULT_WIDTH_PX: 250,

  // Workspace
  MAX_WORKSPACES: Infinity, // Unlimited in free beta
  MAX_OPEN_TABS: 20,

  // Performance
  DEBOUNCE_SEARCH_MS: 300,
  THROTTLE_SCROLL_MS: 16, // ~60fps
  MAX_LOG_ENTRIES: 1000,

  // Version
  APP_VERSION: 'v1.0 beta',

  // Auto-Update Configuration
  UPDATE_CHECK_INTERVAL_MS: 3600000, // Check every hour
  GITHUB_REPO_OWNER: 'Hermes-Lekkas',
  GITHUB_REPO_NAME: 'Kalynt',
  UPDATE_CHANNEL: 'latest', // 'latest' for stable, 'beta' for beta releases
} as const

// Type to ensure constants are readonly
export type AppConfig = typeof CONFIG

// Helper function to get config with fallback
export function getConfig<K extends keyof AppConfig>(key: K, fallback?: AppConfig[K]): AppConfig[K] {
  return CONFIG[key] ?? fallback ?? CONFIG[key]
}
