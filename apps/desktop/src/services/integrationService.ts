/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Integration APIs - External service connectors and webhooks
// Designed for future integrations with third-party services

export interface IntegrationConfig {
    id: string
    type: IntegrationType
    name: string
    enabled: boolean
    credentials: Record<string, string>
    settings: Record<string, unknown>
    lastSync?: number
}

export type IntegrationType =
    | 'github'
    | 'gitlab'
    | 'jira'
    | 'slack'
    | 'discord'
    | 'notion'
    | 'linear'
    | 'trello'
    | 'webhook'
    | 'api'

export interface WebhookConfig {
    id: string
    url: string
    secret?: string
    events: WebhookEvent[]
    enabled: boolean
    retryCount: number
    lastTrigger?: number
}

export type WebhookEvent =
    | 'project.created'
    | 'project.updated'
    | 'project.deleted'
    | 'task.created'
    | 'task.updated'
    | 'task.completed'
    | 'document.changed'
    | 'member.joined'
    | 'member.left'
    | 'version.created'

export interface IntegrationEventPayload {
    title?: string
    description?: string
    name?: string
    project?: string
    label?: string
    channel?: string
    text?: string
    sender?: string
    [key: string]: unknown
}

export interface APIEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    path: string
    description: string
    requiresAuth: boolean
    rateLimit: number
    handler: (req: APIRequest) => Promise<APIResponse>
}

export interface APIRequest {
    method: string
    path: string
    params: Record<string, string>
    query: Record<string, string>
    body: unknown
    headers: Record<string, string>
    userId?: string
}

export interface APIResponse {
    status: number
    data?: unknown
    error?: string
    headers?: Record<string, string>
}

// Integration adapters
interface IntegrationAdapter {
    type: IntegrationType
    connect(config: IntegrationConfig): Promise<boolean>
    disconnect(): Promise<void>
    sync(): Promise<void>
    sendEvent(event: WebhookEvent, payload: IntegrationEventPayload): Promise<void>
}

// GitHub adapter
class GitHubAdapter implements IntegrationAdapter {
    type: IntegrationType = 'github'
    private accessToken: string = ''
    private repo: string = ''

    async connect(config: IntegrationConfig): Promise<boolean> {
        this.accessToken = config.credentials.accessToken || ''
        this.repo = (config.settings.repo as string) || ''
        return !!this.accessToken
    }

    async disconnect(): Promise<void> {
        this.accessToken = ''
    }

    async sync(): Promise<void> {
        // Sync issues, PRs, etc.
    }

    async sendEvent(event: WebhookEvent, payload: IntegrationEventPayload): Promise<void> {
        // Create GitHub issue/comment
        if (event === 'task.created') {
            await fetch(`https://api.github.com/repos/${this.repo}/issues`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: payload.title,
                    body: payload.description
                })
            })
        }
    }
}

// Slack adapter
class SlackAdapter implements IntegrationAdapter {
    type: IntegrationType = 'slack'
    private webhookUrl: string = ''
    private channel: string = ''

    async connect(config: IntegrationConfig): Promise<boolean> {
        this.webhookUrl = config.credentials.webhookUrl || ''
        this.channel = (config.settings.channel as string) || ''
        return !!this.webhookUrl
    }

    async disconnect(): Promise<void> {
        this.webhookUrl = ''
    }

    async sync(): Promise<void> {
        // No sync needed for Slack
    }

    async sendEvent(event: WebhookEvent, payload: IntegrationEventPayload): Promise<void> {
        const messages: Record<WebhookEvent, string> = {
            'project.created': `New project created: ${payload.name}`,
            'project.updated': `Project updated: ${payload.name}`,
            'project.deleted': `Project deleted: ${payload.name}`,
            'task.created': `New task: ${payload.title}`,
            'task.updated': `Task updated: ${payload.title}`,
            'task.completed': `Task completed: ${payload.title}`,
            'document.changed': `Document changed in ${payload.project}`,
            'member.joined': `${payload.name} joined the project`,
            'member.left': `${payload.name} left the project`,
            'version.created': `New version: ${payload.label}`
        }

        await fetch(this.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channel: this.channel,
                text: messages[event] || `Event: ${event}`
            })
        })
    }
}

// Generic webhook adapter
class WebhookAdapter implements IntegrationAdapter {
    type: IntegrationType = 'webhook'
    private url: string = ''
    private secret: string = ''

    async connect(config: IntegrationConfig): Promise<boolean> {
        this.url = config.credentials.url || ''
        this.secret = config.credentials.secret || ''
        return !!this.url
    }

    async disconnect(): Promise<void> {
        this.url = ''
    }

    async sync(): Promise<void> { }

    async sendEvent(event: WebhookEvent, payload: IntegrationEventPayload): Promise<void> {
        const body = JSON.stringify({ event, payload, timestamp: Date.now() })

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        }

        if (this.secret) {
            // Sign the payload
            const encoder = new TextEncoder()
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(this.secret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            )
            const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
            headers['X-Signature'] = Array.from(new Uint8Array(signature))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
        }

        await fetch(this.url, { method: 'POST', headers, body })
    }
}

// Main integration service
class IntegrationService {
    private integrations: Map<string, IntegrationConfig> = new Map()
    private adapters: Map<string, IntegrationAdapter> = new Map()
    private webhooks: Map<string, WebhookConfig> = new Map()
    private apiEndpoints: Map<string, APIEndpoint> = new Map()

    // Initialize default adapters
    constructor() {
        this.registerAdapter('github', new GitHubAdapter())
        this.registerAdapter('slack', new SlackAdapter())
        this.registerAdapter('webhook', new WebhookAdapter())
    }

    // Register adapter
    registerAdapter(type: string, adapter: IntegrationAdapter): void {
        this.adapters.set(type, adapter)
    }

    // Add integration
    async addIntegration(config: IntegrationConfig): Promise<boolean> {
        const adapter = this.adapters.get(config.type)
        if (!adapter) return false

        const connected = await adapter.connect(config)
        if (connected) {
            this.integrations.set(config.id, config)
        }
        return connected
    }

    // Remove integration
    async removeIntegration(id: string): Promise<void> {
        const config = this.integrations.get(id)
        if (!config) return

        const adapter = this.adapters.get(config.type)
        if (adapter) {
            await adapter.disconnect()
        }
        this.integrations.delete(id)
    }

    // Get integrations
    getIntegrations(): IntegrationConfig[] {
        return Array.from(this.integrations.values())
    }

    // Emit event to all integrations
    async emitEvent(event: WebhookEvent, payload: IntegrationEventPayload): Promise<void> {
        const promises: Promise<void>[] = []

        // Send to integrations
        this.integrations.forEach((config, _id) => {
            if (config.enabled) {
                const adapter = this.adapters.get(config.type)
                if (adapter) {
                    promises.push(adapter.sendEvent(event, payload))
                }
            }
        })

        // Send to webhooks
        this.webhooks.forEach((webhook) => {
            if (webhook.enabled && webhook.events.includes(event)) {
                promises.push(this.triggerWebhook(webhook, event, payload))
            }
        })

        await Promise.allSettled(promises)
    }

    // Add webhook
    addWebhook(config: WebhookConfig): void {
        this.webhooks.set(config.id, config)
    }

    // Remove webhook
    removeWebhook(id: string): void {
        this.webhooks.delete(id)
    }

    // Trigger webhook
    private async triggerWebhook(webhook: WebhookConfig, event: WebhookEvent, payload: IntegrationEventPayload): Promise<void> {
        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event, payload, timestamp: Date.now() })
            })

            webhook.lastTrigger = Date.now()

            if (!response.ok && webhook.retryCount > 0) {
                // Retry after delay
                setTimeout(() => {
                    webhook.retryCount--
                    this.triggerWebhook(webhook, event, payload)
                }, 5000)
            }
        } catch (e) {
            console.error('Webhook failed:', e)
        }
    }

    // Register API endpoint
    registerEndpoint(endpoint: APIEndpoint): void {
        const key = `${endpoint.method}:${endpoint.path}`
        this.apiEndpoints.set(key, endpoint)
    }

    // Handle API request
    async handleRequest(req: APIRequest): Promise<APIResponse> {
        const key = `${req.method}:${req.path}`
        const endpoint = this.apiEndpoints.get(key)

        if (!endpoint) {
            return { status: 404, error: 'Not found' }
        }

        if (endpoint.requiresAuth && !req.userId) {
            return { status: 401, error: 'Unauthorized' }
        }

        try {
            return await endpoint.handler(req)
        } catch (e) {
            return { status: 500, error: e instanceof Error ? e.message : 'Internal error' }
        }
    }

    // Get API schema
    getAPISchema(): Array<{ method: string; path: string; description: string }> {
        return Array.from(this.apiEndpoints.values()).map(e => ({
            method: e.method,
            path: e.path,
            description: e.description
        }))
    }
}

// Singleton
export const integrationService = new IntegrationService()

// Register default API endpoints
integrationService.registerEndpoint({
    method: 'GET',
    path: '/api/projects',
    description: 'List all projects',
    requiresAuth: true,
    rateLimit: 100,
    handler: async (_req) => {
        // Would integrate with projectService
        return { status: 200, data: [] }
    }
})

integrationService.registerEndpoint({
    method: 'GET',
    path: '/api/projects/:id',
    description: 'Get project by ID',
    requiresAuth: true,
    rateLimit: 100,
    handler: async (_req) => {
        return { status: 200, data: null }
    }
})

integrationService.registerEndpoint({
    method: 'POST',
    path: '/api/projects/:id/tasks',
    description: 'Create task in project',
    requiresAuth: true,
    rateLimit: 50,
    handler: async (_req) => {
        return { status: 201, data: { id: 'new-task' } }
    }
})

integrationService.registerEndpoint({
    method: 'POST',
    path: '/api/webhooks',
    description: 'Register webhook',
    requiresAuth: true,
    rateLimit: 10,
    handler: async (_req) => {
        return { status: 201, data: { id: 'new-webhook' } }
    }
})
