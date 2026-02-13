# Kalynt Architecture

This document describes the technical architecture of Kalynt, a native Electron desktop IDE with P2P collaboration, local LLM inference, and VS Code extension compatibility.

## High-Level Overview

```
+------------------------------------------------------------------+
|                        Electron Shell                             |
|  +-------------------+  +--------------------+  +--------------+ |
|  |   Main Process    |  |  Renderer Process   |  | Extension    | |
|  |                   |  |  (React + Vite)     |  | Host Process | |
|  |  - File system    |  |  - Monaco Editor    |  | (Sandboxed)  | |
|  |  - Terminal (pty) |  |  - UI components    |  | - VS Code    | |
|  |  - Git operations |  |  - State (Zustand)  |  |   API shim   | |
|  |  - Safe storage   |  |  - AIME worker      |  | - Extension  | |
|  |  - Auto-updater   |  |  - P2P networking   |  |   lifecycle  | |
|  |  - Extension mgr  |  |  - Extension svc    |  |              | |
|  +-------------------+  +--------------------+  +--------------+ |
+------------------------------------------------------------------+
```

## Process Model

### Main Process (`electron/`)
The Electron main process handles privileged operations that require Node.js and OS-level access:

- **File system** -- workspace file operations (read, write, watch via chokidar)
- **Terminal management** -- `node-pty` pseudo-terminal creation and lifecycle
- **Git operations** -- `simple-git` for status, diff, commit, branch
- **Secure storage** -- Electron `safeStorage` API for token/key encryption
- **Auto-updater** -- `electron-updater` with GitHub Releases
- **Extension host manager** -- spawns and manages the extension host child process, routes IPC messages, registers commands

### Renderer Process (`apps/desktop/src/`)
The renderer process is a React 18 application bundled by Vite:

- **UI layer** -- React components styled with Tailwind CSS
- **Editor** -- Monaco Editor with full IntelliSense, multi-cursor, inline diff
- **State management** -- Zustand stores for workspace, editor, collaboration, and settings state
- **Services** -- TypeScript service layer mediating between UI and Electron IPC
- **AIME worker** -- Web Worker for background codebase indexing (symbol parsing, search, context retrieval)
- **P2P networking** -- Yjs documents synced via y-webrtc in the renderer

### Extension Host Process (`electron/extensions/extensionHostProcess.ts`)
A sandboxed Node.js child process that:

- Loads and activates VS Code extensions from disk
- Provides a VS Code API shim (`vscode.*` namespace)
- Routes command execution via message-ID-based request/response IPC
- Isolates extension code from the main process and renderer

## Directory Structure

```
kalynt/
├── apps/
│   └── desktop/
│       ├── electron/                  # Electron main process
│       │   ├── main.ts                # Entry point
│       │   ├── preload.ts             # Context bridge / IPC exposure
│       │   ├── extensions/            # Extension host system
│       │   │   ├── extensionHostManager.ts   # Main-process extension coordinator
│       │   │   └── extensionHostProcess.ts   # Sandboxed host (child process)
│       │   └── handlers/              # IPC request handlers
│       ├── src/                       # Renderer process (React app)
│       │   ├── main.tsx               # React entry
│       │   ├── App.tsx                # Root component
│       │   ├── components/            # UI components
│       │   │   ├── ide/               # Editor, file explorer, tabs, breadcrumbs
│       │   │   ├── extensions/        # Extension manager UI
│       │   │   └── ...                # Settings, collaboration, task board, etc.
│       │   ├── services/              # Service layer
│       │   │   ├── extensions/        # Extension + marketplace services
│       │   │   ├── aimeService.ts     # AIME orchestration
│       │   │   ├── aiService.ts       # Cloud AI provider integration
│       │   │   ├── offlineLLMService.ts  # Local LLM via node-llama-cpp
│       │   │   └── ...
│       │   ├── workers/               # Web Workers
│       │   │   └── aimeWorker.ts      # Background codebase indexer
│       │   ├── stores/                # Zustand state stores
│       │   ├── types/                 # TypeScript type definitions
│       │   └── utils/                 # Utility functions
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   ├── crdt/                          # @kalynt/crdt
│   │   └── src/
│   │       ├── index.ts               # Yjs document factory + utilities
│   │       └── ...
│   ├── networking/                    # @kalynt/networking
│   │   └── src/
│   │       ├── index.ts               # P2P connection manager
│   │       ├── signaling.ts           # WebRTC signaling via y-webrtc
│   │       └── ...
│   └── shared/                        # @collabforge/shared (common types)
│       └── src/
│           ├── index.ts               # Common types and utilities
│           └── ...
├── examples/
│   └── test-extension/                # Sample VS Code extension for testing
├── scripts/                           # Build and utility scripts
├── package.json                       # Root workspace configuration
├── ARCHITECTURE.md                    # This file
├── SECURITY.md                        # Security guide and threat model
├── CONTRIBUTING.md                    # Contribution guidelines
├── LICENSE                            # Dual license (AGPL + Proprietary)
└── README.MD                          # Project overview
```

## Core Systems

### 1. AIME (Artificial Intelligence Memory Engine)

AIME provides AI-assisted development through both local and cloud models.

**Components:**
- `aimeService.ts` -- orchestrates AI requests, manages conversation context, routes to local or cloud providers
- `offlineLLMService.ts` -- local inference via `node-llama-cpp` with GGUF model loading
- `aiService.ts` -- multi-provider cloud API (OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Cohere, xAI)
- `aimeWorker.ts` -- Web Worker that indexes the codebase into a symbol table for search and context retrieval

**Indexing pipeline:**
```
Codebase files  -->  aimeWorker (Web Worker)  -->  Symbol index (in-memory)
                     - Parses functions, classes, imports
                     - Sends indexData back to main thread
                     - Supports search, retrieveContext, repoMap commands
```

**Agentic flow:**
```
User prompt  -->  AIME Service  -->  Context retrieval (worker index)
                                -->  Model selection (local / cloud)
                                -->  Response streaming
                                -->  Tool execution (file edit, terminal, etc.)
```

### 2. P2P Collaboration

Real-time collaboration uses a fully serverless architecture with no central servers storing code.

**Stack:**
- **Yjs** -- CRDT library for conflict-free document merging
- **y-webrtc** -- WebRTC provider for Yjs, handles signaling and peer connections
- **simple-peer** -- WebRTC abstraction for data channel management
- **Free STUN servers** -- Google (`stun:stun.l.google.com:19302`), Twilio, Xirsys public endpoints
- **Free signaling** -- `wss://signaling.yjs.dev` (public y-webrtc signaling server)

**Connection flow:**
```
Peer A                    Signaling Server                  Peer B
  |  -- join room ------------>  |                            |
  |                              |  <-- join room -----------  |
  |  <-- SDP offer/answer ----  |  ---- SDP offer/answer --> |
  |  ========= WebRTC Data Channel (direct P2P) ============ |
  |  ---- Yjs updates ----------------------------------------|
  |  <--- Yjs updates ----------------------------------------|
```

**Encryption:**
- Optional room password that derives an encryption key
- All Yjs document updates encrypted before transmission
- Decryption happens locally on each peer

### 3. Extension System

Kalynt supports VS Code extensions via the Open VSX marketplace and a sandboxed extension host.

**Architecture:**
```
Renderer                    Main Process              Extension Host (child)
+------------------+       +-------------------+     +--------------------+
| ExtensionManager |       | ExtensionHost     |     | ExtensionHost      |
| (React UI)       | <---> | Manager           | <-->| Process            |
|                  |       | - spawns host     |     | - loads extensions |
| ExtensionService |       | - routes commands |     | - VS Code API shim |
| MarketplaceService|      | - message-ID IPC  |     | - activation/      |
+------------------+       +-------------------+     |   deactivation     |
                                                      +--------------------+
```

**Message-ID routing:**
Commands executed by extensions use a message-ID-based request/response pattern:
1. Extension calls `vscode.commands.executeCommand(cmd, ...args)`
2. Host process assigns a unique `messageId` and sends `execute-command` to main process
3. Main process executes the command, sends `command-result` with same `messageId`
4. Host process resolves the pending promise with the result

**Marketplace:**
- Source: Open VSX Registry (`https://open-vsx.org/api/`)
- Operations: search, fetch metadata, download VSIX packages
- Installation: extract VSIX to local extensions directory

### 4. Editor

The editor is built on Monaco Editor with IDE-grade features:

- **Multi-tab editing** with unsaved change indicators
- **File explorer** with tree view, context menus, drag-and-drop
- **Breadcrumb navigation** for file path awareness
- **Split panes** for side-by-side editing
- **Command palette** (`Ctrl+Shift+P`) with fuzzy search
- **Inline edit widget** for AI-assisted inline code modifications
- **Code block renderer** for syntax-highlighted previews in AI chat

### 5. Terminal

Integrated terminal using xterm.js in the renderer with `node-pty` in the main process:

- **Addons**: fit (auto-resize), search, Unicode 11, web links
- **Multiple terminals** with tab management
- **Output panel** for build/run output separate from interactive shells

### 6. State Management

Application state is managed by Zustand stores:

- **Workspace store** -- active workspace, files, project structure
- **Editor store** -- open tabs, active file, cursor positions, selections
- **Collaboration store** -- P2P connection state, peers, room info
- **Settings store** -- user preferences, AI config, theme, keybindings

## Build System

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server + Electron |
| `npm run build` | TypeScript compile + Vite build + electron-builder |
| `npm run build:secure` | Production build with code obfuscation |
| `npm run electron:build` | Vite build + electron-builder (skip tsc) |

**Output formats:**
- Windows: NSIS installer (x64)
- macOS: DMG
- Linux: AppImage, deb

## Infrastructure Requirements

Kalynt is designed to run with zero paid infrastructure:

| Service | Provider | Cost |
|---------|----------|------|
| STUN servers | Google, Twilio, Xirsys (public) | Free |
| Signaling | yjs.dev WebSocket server | Free |
| Extension marketplace | Open VSX Registry | Free |
| Local AI inference | node-llama-cpp (on-device) | Free |
| Auto-updates | GitHub Releases | Free |

Cloud AI providers (OpenAI, Anthropic, etc.) are optional and require the user's own API keys.

---
(c) 2026 Hermes Lekkas. All rights reserved.
