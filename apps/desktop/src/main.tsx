/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import './electronShim'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

import { ErrorBoundary } from './components/ErrorBoundary'

// RAM Optimization: Lazy-load Monaco only when the editor is actually mounted.
// This defers ~150MB of V8 heap allocation until a file is opened.
import { loader } from '@monaco-editor/react'
loader.config({
    'vs/nls': { availableLanguages: { '*': '' } }, // Skip i18n loading
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Failed to find the root element')

createRoot(rootElement).render(
    <StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </StrictMode>
)
