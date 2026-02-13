# Kalynt - Serverless P2P Team Collaboration Platform

## Overview
Kalynt is a desktop collaboration platform originally built with Electron + React/Vite. It has been adapted to run as a web application in the Replit environment.

## Project Architecture
- **Monorepo** with npm workspaces
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + Monaco Editor
- **Packages**: `packages/crdt`, `packages/networking`, `packages/shared`
- **Desktop app**: `apps/desktop` (Electron-based, adapted for web)

### Key Files
- `apps/desktop/vite.config.ts` - Vite config (adapted for web, Electron plugins removed)
- `apps/desktop/src/electronShim.ts` - Shim providing no-op implementations of Electron APIs for web mode
- `apps/desktop/src/main.tsx` - React entry point (imports electronShim)
- `apps/desktop/src/App.tsx` - Main app component (splash screen skipped in web mode)

## Replit Adaptations
- Electron plugins removed from Vite config
- `electronShim.ts` provides stub implementations of all Electron IPC APIs
- CSP meta tag removed from index.html for web compatibility
- Splash screen bypassed in web mode (detected via `platform === 'browser'`)
- Vite dev server configured on `0.0.0.0:5000` with `allowedHosts: true`

## Running
- Workflow: `cd apps/desktop && npx vite --host 0.0.0.0 --port 5000`
- Deployment: Static build from `apps/desktop/dist`

## Recent Changes
- 2026-02-13: Initial Replit setup - adapted Electron desktop app for web environment
