# Kalynt - Gemini Agent Context

This document serves as the primary context and instruction manual for the Gemini AI agent working on the Kalynt project. It outlines the project's architecture, standards, and key components to ensure consistent and accurate code generation and analysis.

## 1. Project Overview

**Kalynt** is a privacy-first, AI-powered Integrated Development Environment (IDE).
*   **Core Philosophy:** Local-first AI inference, end-to-end encrypted collaboration, and extensibility.
*   **License:** AGPL-3.0 (Open Core), with proprietary modules for AIME/Agent logic.

## 2. Tech Stack

*   **Runtime:** Node.js (Electron Main), Chromium (Electron Renderer).
*   **Framework:** Electron 28+.
*   **Frontend:** React 18, Vite, TypeScript.
*   **Styling:** Tailwind CSS.
*   **State Management:** Zustand.
*   **Editor:** Monaco Editor.
*   **AI Inference:** `node-llama-cpp` (Local GGUF), various cloud providers.
*   **Collaboration:** Yjs (CRDT), WebRTC (`simple-peer`) for serverless P2P.
*   **Build System:** Vite (Renderer), `tsc`/`esbuild` (Main/Preload).

## 3. Architecture

Kalynt follows a multi-process architecture standard for modern Electron apps:

### 3.1. Main Process (`apps/desktop/electron/`)
*   **Entry Point:** `apps/desktop/electron/main.ts`
*   **Responsibilities:** Window management, native OS interactions (FS, Shell), IPC handling, extension host management.
*   **Handlers:** Located in `apps/desktop/electron/handlers/`. All IPC handlers must be registered here.

### 3.2. Renderer Process (`apps/desktop/src/`)
*   **Entry Point:** `apps/desktop/src/main.tsx`
*   **Responsibilities:** UI rendering, user interaction, editor logic, client-side state.
*   **Bridge:** Interacts with Main via `window.electronAPI` (defined in `preload.ts`).

### 3.3. Extension Host
*   **Implementation:** `apps/desktop/electron/extensions/`
*   **Responsibilities:** Runs extensions in a sandboxed Node.js environment to prevent UI blocking and ensure security.

### 3.4. AIME (AI Model Engine)
*   **Location:** `apps/desktop/src/services/aimeService.ts`, `apps/desktop/src/workers/aimeWorker.ts`
*   **Function:** Orchestrates AI tasks. Heavy indexing and RAG operations are offloaded to Web Workers.

## 4. Project Structure (Monorepo)

*   `apps/desktop`: The main Electron application.
    *   `electron/`: Main process and Preload scripts.
    *   `src/`: React frontend.
        *   `components/`: UI components (PascalCase).
        *   `services/`: Singleton business logic (camelCase).
        *   `stores/`: Zustand stores.
        *   `hooks/`: React hooks.
*   `packages/`: Shared libraries.
    *   `crdt/`: CRDT logic for collaboration.
    *   `networking/`: P2P networking layer.
    *   `shared/`: Common types and utilities.

## 5. Coding Standards & Guidelines

*   **TypeScript:** Strict mode enabled. No `any` unless absolutely necessary. Define interfaces in `types/` or co-located if specific.
*   **React:** Functional components only. Use hooks for logic reuse.
*   **State:** Use Zustand for global state (`useAppStore`). Avoid deep prop drilling.
*   **IPC:**
    *   **Renderer:** Call via `window.electronAPI.invoke('channel', data)`.
    *   **Main:** Handle via `ipcMain.handle('channel', async (e, data) => { ... })`.
    *   **Security:** Validate all inputs in the Main process handlers.
*   **Styling:** Use Tailwind utility classes.
*   **Comments:** Explain *why*, not *what*. Document complex algorithms (especially CRDT/AI logic).

## 6. Key Files for Reference

*   `apps/desktop/electron/preload.ts`: The definitive API surface for the frontend.
*   `apps/desktop/src/config/api.ts`: API configuration constants.
*   `apps/desktop/src/stores/appStore.ts`: Main application state.
*   `apps/desktop/src/services/aiService.ts`: AI integration points.

## 7. Working with the AI Agent (Self-Correction)

*   **Context:** Always check `ARCHITECTURE.md` and `PROJECT_STRUCTURE.md` if the directory layout seems unfamiliar.
*   **Conventions:** Mimic the existing patterns in `apps/desktop/src/services` when creating new services.
*   **Testing:** Verify changes by ensuring the build passes (`npm run build` in `apps/desktop`).

This file is to be updated as the project evolves.
