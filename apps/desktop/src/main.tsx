/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

import { ErrorBoundary } from './components/ErrorBoundary'
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'

// Configure Monaco to load from local node_modules instead of CDN
loader.config({ monaco })

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Failed to find the root element')

createRoot(rootElement).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>
)
