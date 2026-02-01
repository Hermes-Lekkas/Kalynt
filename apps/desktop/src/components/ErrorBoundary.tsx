/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Component, ReactNode, ErrorInfo } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    backgroundColor: '#111827',
                    color: '#e5e7eb',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#ef4444' }}>
                        âŒ Something went wrong
                    </h1>
                    <div style={{
                        backgroundColor: '#1f2937',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        maxWidth: '600px',
                        overflow: 'auto',
                        marginBottom: '1rem'
                    }}>
                        <code style={{ fontFamily: 'monospace' }}>{this.state.error?.message}</code>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer'
                        }}
                    >
                        Reload App
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
