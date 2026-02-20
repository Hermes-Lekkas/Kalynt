# Kalynt - Codebase Analysis & Change Log

## 1. Project Overview & Architecture

Kalynt is a **Local-First, AI-Native IDE** built with a focus on privacy, security, and autonomous agentic workflows. It leverages a modern tech stack to provide a seamless developer experience with integrated local LLMs and P2P collaboration.

### Tech Stack
- **Framework:** [Electron](https://www.electronjs.org/) (Runtime), [React 18](https://reactjs.org/) (UI), [Vite](https://vitejs.dev/) (Bundler).
- **Language:** TypeScript (Strict Mode).
- **Editor:** [Monaco Editor](https://microsoft.github.io/monaco-editor/) (VS Code's core).
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) with a glassmorphism aesthetic.
- **State Management:** [Zustand](https://github.com/pmndrs/zustand) with persistence.
- **AI Engine:** [node-llama-cpp](https://withcatai.github.io/node-llama-cpp/) for local inference, supporting Llama 3, Mistral, etc.
- **Collaboration:** [Yjs](https://yjs.dev/) (CRDTs) and [simple-peer](https://github.com/feross/simple-peer) (WebRTC) for serverless P2P sync.
- **Storage:** SQLite (Metadata/History) and Local File System.

### Architectural Mental Map
- **Main Process (Electron):** Handles heavy lifting and privileged operations (File System, PTY Terminal, LLM Inference, Extension Hosting).
- **Renderer Process (React):** The IDE interface. Communicates with Main via Context-bridged IPC.
- **Agent System (AIME):** The "brain" consisting of:
    - `agentLoopService`: Implements the ReAct (Reasoning + Acting) loop.
    - `aimeService`: Local RAG (Retrieval-Augmented Generation) engine using vector embeddings.
    - `shadowWorkspaceService`: A safety sandbox for validating AI-proposed changes.
- **Extension System:** A separate Node.js process (`ExtensionHostProcess`) that isolates plugins from the main app, providing a VS Code-compatible API.
- **Monorepo Packages:**
    - `packages/crdt`: Shared Yjs-based conflict resolution.
    - `packages/networking`: P2P connection management.
    - `packages/shared`: Common types and utilities.

---

## 2. Core Components Analysis

### 2.1. Agentic Loop (`agentLoopService.ts`)
The core engine for AI autonomy. It follows a multi-step process:
1. **Context Building:** Combines user prompts with RAG context from AIME.
2. **Inference:** Sends context to local or cloud LLMs.
3. **Tool Execution:** Parses responses for tool calls (e.g., `writeFile`, `terminal.execute`) and runs them.
4. **Self-Correction:** Validates changes in a Shadow Workspace and feeds errors back to the AI.

### 2.2. AIME (AI Memory Engine)
AIME acts as the long-term memory. It indexes the codebase into a local vector store, allowing the agent to retrieve relevant code snippets semantically, ensuring high-quality context for complex tasks.

### 2.3. Extension System
The extension system is designed for high compatibility and safety:
- **Process Isolation:** Extensions run in a fork of the main process.
- **VS Code API:** Implements a subset of the VS Code API, allowing many standard extensions to be ported easily.
- **Dynamic Loading:** Supports installing `.vsix` files and downloading from Open VSX.

---

## 3. Recent Changes Log (Git History & Changelog)

### [v1.0.4-beta] - 2026-02-16 to 2026-02-19

#### Major Core Upgrades (Feb 18, 2026)
- **AI Agent Stability:** Significant hardening of the `agentLoopService` to prevent infinite loops and improve tool-call parsing.
- **Enhanced Debugging:** Improved runtime inspection and error reporting for the integrated debugger.
- **Performance Optimizations:** Reduced memory footprint during large workspace indexing.

#### UX & UI Overhaul (Feb 17, 2026)
- **Settings Panel:** Redesigned `UnifiedSettingsPanel` with glassmorphism and dedicated "Danger Zone".
- **Agent UI:** Simplified `UnifiedAgentPanel` header and added pill-style mode switchers (Cloud/Local).
- **Resizable Panels:** Implemented draggable Agent sidebar with state persistence.

#### Stability & Compatibility (Feb 16, 2026)
- **Linux Support:** Fixed critical crashes on Ubuntu 24.04 (Wayland issues) by disabling window transparency and early path resolution.
- **Native Modules:** Rebuilt `node-pty` and `better-sqlite3` for Electron 28 compatibility.
- **Obfuscation Fixes:** Optimized heavy obfuscation settings to prevent build-time failures.

#### Security Hardening (Feb 15, 2026)
- **Sandboxing:** Enabled full renderer sandboxing.
- **Injection Protection:** Added command allowlists and path sanitization (SEC-001 to SEC-008).
- **P2P Security:** Implemented rate limiting and shared-salt encryption for collaborative rooms.

#### Collaboration Features (Feb 14, 2026)
- **Yjs Integration:** Implemented real-time collaboration with WebRTC and IndexedDB persistence.
- **Workspace Sharing:** Fixed race conditions in workspace link generation and invitation parsing.

### Licensing & Meta
- **Relicensing:** Transitioned to **AGPL-3.0-only** for core modules.
- **Repository:** Updated publishing configuration to `Hermes-Lekkas/Kalynt`.
- **Documentation:** Extensive cleanup of `README.MD`, `ARCHITECTURE.md`, and removal of emojis for professional consistency.

---
*Last updated: Thursday, February 19, 2026*

## 4. Pending Changes (Uncommitted)

The following changes are currently in the workspace and pending commit:

### UI & Theme System
*   **Light Mode Support:** Implemented a comprehensive theme system with 'light' and 'dark' modes.
*   **CSS Variable Refactor:** Migrated hardcoded colors to CSS variables (`var(--color-...)`) across the entire renderer (`Editor.tsx`, `Sidebar.tsx`, `UnifiedSettingsPanel.tsx`, etc.).
*   **Theme Persistence:** Added `theme` state to `appStore` with local storage persistence and theme-aware component styling.

### Agentic Core Enhancements (`agentLoopService.ts`)
*   **Context Management:** Added `trimToContextWindow` to automatically prune older messages when nearing token limits.
*   **Result Optimization:** Tool results are now truncated if they exceed 4000 characters to protect the context window.
*   **Resiliency:** Implemented exponential backoff retry logic (3 attempts) for cloud LLM generation failures.
*   **Natural Response Flow:** Switched offline LLMs from grammar-forced JSON to natural text parsing, allowing for better conversational interactions during agent tasks.
*   **Model Standardization:** Updated `aiService` to use current flagship models (`gpt-4o`, `claude-3.5-sonnet`, `gemini-1.5-pro`) and simplified provider configurations.
*   **Background Analysis:** Optimized `agentService.analyze()` to bypass the ReAct loop for quick suggestions, significantly reducing latency for non-actionable prompts.

### Performance & Stability
*   **Build Config:** Adjusted Vite obfuscation thresholds to prevent build-time crashes and switched `dist-electron` output format to **CJS** for better compatibility.
*   **Resource Monitor:** Improved RAM usage graphing with theme-aware grid lines and text.
*   **Validation Tools:** Added `validateAgentFixes.ts` to help automate the verification of AI-generated code fixes.

### Aggressive RAM Reduction (800 MB → 450 MB idle)

#### Electron & Chromium Level (`main.ts`)
*   **V8 Heap Cap:** Added `--max-old-space-size=256 --lite-mode --optimize_for_size` to V8 flags.
*   **GPU Process Elimination:** Added `--in-process-gpu` and `--disable-gpu-compositing` to merge the GPU process into main (~80 MB saved).
*   **Chromium Flags:** Disabled `background-networking`, `breakpad`, `component-update`, `domain-reliability`, `software-rasterizer`, `renderer-backgrounding`. Enabled `CalculateNativeWinOcclusion` for Windows.
*   **WebPreferences:** Set `spellcheck: false` (~20 MB), `v8CacheOptions: 'bypassHeatCheck'`, `backgroundThrottling: true`.
*   **Working Set Trimming on Minimize:** Triggers GC + `session.clearCache()` when the window is minimized (same technique as VS Code).
*   **Session Data Cleanup:** Clears `cachestorage`, `shadercache`, and `serviceworkers` on startup.
*   **Conditional DevTools:** DevTools no longer auto-opens in dev mode; use `--devtools` flag when needed (~50 MB saved).

#### Monaco Lazy Loading (`main.tsx`)
*   **Deferred Monaco Import:** Replaced static `import * as monaco from 'monaco-editor'` with CDN-deferred `loader.config()`. Monaco only loads when the editor component mounts (~100–150 MB deferred).

#### React Component Lazy Loading (`MainContent.tsx`)
*   **`React.lazy()` Tab Panels:** Converted `Editor`, `TaskBoard`, `VersionPanel` (DiffEditor), and `FilesPanel` to dynamic imports with `<Suspense>` boundary. Only the active tab's component tree is loaded at any time.

#### Renderer-Side Idle GC (`usePerformanceAcceleration.ts`)
*   **Proactive GC Loop:** Added `requestIdleCallback`-based GC loop that calls `window.gc()` every 10 seconds when the renderer is idle.

#### MemoryAccelerator Tuning (`MemoryAccelerator.ts`)
*   **Faster Check Intervals:** Balanced 60 s → 15 s, Power Saver 30 s → 10 s.
*   **Lower Thresholds:** Balanced 80 % → 65 %, Power Saver 50 % → 40 %.
*   **Native Helper Trim:** GC cycle now sends `memory-trim` RPC to the Swift helper on macOS.

#### Prior Optimizations (already present, verified)
*   **AIME Worker Termination:** `worker.terminate()` after indexing completes (`aimeService.ts`).
*   **Monaco Model Disposal:** `model.dispose()` on file tab close (`IDEWorkspace.tsx`).
*   **LRU Cache Bounds:** `IOAccelerator.ts` maps capped at 50/500 entries.
*   **V8 GC Exposure:** `--expose_gc` flag + `globalThis.gc()` in MemoryAccelerator.

#### Swift Native Helper Optimizations (`main.swift`)
*   **`autoreleasepool`:** Wrapped FSEvents callback, `processBuffer()`, `getHardwareStats()`, and `send()` to prevent ARC object accumulation.
*   **Memory Pressure Monitoring:** Added `DispatchSource.makeMemoryPressureSource` — warning clears caches, critical unloads CoreML model.
*   **Hardware Stats Caching:** `system_profiler` results cached for 30 s (avoids spawning a heavy subprocess every call).
*   **Buffer Compaction:** Shrinks `Data` buffer when wasted capacity exceeds 64 KB.
*   **FSEvents Latency:** Increased from 0.1 s to 0.3 s (3× less callback frequency, less ARC pressure).
*   **`malloc_zone_pressure_relief`:** New `memory-trim` RPC method forces malloc to return freed pages to macOS.
*   **`llm-unload` RPC:** Allows Electron to explicitly release CoreML models when idle.

### Licensing & Assets
*   **License Update:** Finalized transition to **AGPL-3.0-only** in `package-lock.json`.
*   **Iconography:** Added new AI provider icons (`chatgpt-icon.svg`, `google-gemini-icon.svg`, etc.) to the public assets directory.
