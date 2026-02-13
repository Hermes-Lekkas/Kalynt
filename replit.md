# Kalynt - Serverless P2P Team Collaboration Platform

## Overview
Kalynt is a native Electron desktop IDE (Windows/Linux/macOS) for privacy-first AI-assisted development with P2P collaboration. Development happens in Replit but the build target is a native desktop app. The Replit environment uses a web shim to preview the UI.

## Project Architecture
- **Monorepo** with npm workspaces
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + Monaco Editor
- **Packages**: `packages/crdt` (Yjs wrappers), `packages/networking` (P2P/WebRTC), `packages/shared` (common types)
- **Desktop app**: `apps/desktop` (Electron main + renderer)
- **Extension system**: `apps/desktop/electron/extensions/` (host manager + sandboxed process)

### Key Files
- `apps/desktop/vite.config.ts` - Vite config (Electron plugins removed for Replit web preview)
- `apps/desktop/src/electronShim.ts` - Shim providing no-op implementations of Electron APIs for web mode
- `apps/desktop/src/main.tsx` - React entry point
- `apps/desktop/src/App.tsx` - Main app component
- `apps/desktop/electron/main.ts` - Electron main process entry
- `apps/desktop/electron/extensions/extensionHostManager.ts` - Extension host coordinator (main process)
- `apps/desktop/electron/extensions/extensionHostProcess.ts` - Sandboxed extension runner (child process)
- `apps/desktop/src/services/aimeService.ts` - AIME orchestration
- `apps/desktop/src/workers/aimeWorker.ts` - Background codebase indexer

## Replit Adaptations
- Electron plugins removed from Vite config for web preview
- `electronShim.ts` provides stub implementations of all Electron IPC APIs
- CSP meta tag removed from index.html for web compatibility
- Splash screen bypassed in web mode (detected via `platform === 'browser'`)
- Vite dev server configured on `0.0.0.0:5000` with `allowedHosts: true`

## Running
- Workflow: `cd apps/desktop && npx vite --host 0.0.0.0 --port 5000`
- Native build: `npm run build` (outputs to `apps/desktop/release/`)

## Documentation
- `README.MD` - Project overview, features, installation
- `ARCHITECTURE.md` - Technical architecture deep-dive
- `SECURITY.md` - Security guide, threat model, incident response
- `CONTRIBUTING.md` - Contribution guidelines and coding standards
- `LICENSE` - Dual license (AGPL-3.0 open core + proprietary modules)

## User Preferences
- Only free services (free STUN/TURN, Open VSX marketplace, yjs.dev signaling)
- No paid infrastructure
- Build target is native Electron desktop app, not web

## Recent Changes
- 2026-02-13: Initial Replit setup, adapted Electron desktop app for web environment
- 2026-02-13: Fixed P2P/WebRTC collaboration with free STUN servers and yjs.dev signaling
- 2026-02-13: Fixed terminal and output panel (xterm.js)
- 2026-02-13: Fixed Agent panel with multi-provider cloud AI + local LLM inference
- 2026-02-13: Fixed AIME worker indexing with symbol data sync back to main thread
- 2026-02-13: Fixed extension system with Open VSX marketplace, message-ID command routing, shared types
- 2026-02-13: Created comprehensive documentation (README, ARCHITECTURE, SECURITY, CONTRIBUTING)
