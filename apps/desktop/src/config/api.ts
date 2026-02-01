/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * API Configuration
 * Centralized API endpoints with environment variable support
 */

export const API_CONFIG = {
  // AI Provider APIs
  openai: {
    baseUrl: import.meta.env.VITE_OPENAI_API_URL || 'https://api.openai.com/v1',
    timeout: 30000,
  },
  anthropic: {
    baseUrl: import.meta.env.VITE_ANTHROPIC_API_URL || 'https://api.anthropic.com/v1',
    timeout: 30000,
  },
  google: {
    baseUrl: import.meta.env.VITE_GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
    timeout: 30000,
  },

  // External Services
  github: {
    baseUrl: import.meta.env.VITE_GITHUB_API_URL || 'https://api.github.com',
    timeout: 15000,
  },

  // Model Registry
  modelRegistry: {
    baseUrl: import.meta.env.VITE_MODEL_REGISTRY_URL || '/models.json',
    updateCheckUrl: import.meta.env.VITE_MODEL_UPDATE_URL || 'https://api.kalynt.com/models/registry',
  },
} as const

export type ApiConfig = typeof API_CONFIG
