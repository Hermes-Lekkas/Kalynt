# Kalynt Architecture Documentation

## 1. System Overview

Kalynt is a **Local-First, AI-Native IDE**. Unlike traditional IDEs that bolt on AI as a plugin, Kalynt integrates the LLM directly into the editor's event loop, creating a bi-directional "Agentic" workflow.

### High-Level Diagram

```mermaid
graph TD
    User[User] --> UI[React UI / Renderer]
    UI --> Main[Electron Main Process]
    
    subgraph "Core Services (Main)"
        FS[File System Handler]
        Term[PTY Terminal Manager]
        Llama[Local Inference Engine]
        Net[P2P Networking]
        Store[SQLite / SafeStorage]
    end
    
    subgraph "Agent System (Renderer)"
        Agent[Agent Loop Service]
        RAG[AIME (RAG Engine)]
        Shadow[Shadow Workspace]
        Chat[Chat Store]
    end
    
    Main --> FS
    Main --> Term
    Main --> Llama
    Main --> Net
    
    UI <--> Agent
    Agent <--> Llama
    Agent <--> RAG
    Agent --> Shadow
    Agent --> Chat
    
    Net <--> Peers[Remote Peers]
```

---

## 2. Key Components

### 2.1. The Unified Agent Panel (`UnifiedAgentPanel.tsx`)
The command center of the IDE. It unifies:
*   **Chat Interface:** Direct communication with the AI.
*   **Agentic Loop:** Visualizing the AI's thought process (Thinking -> Tool Call -> Result -> Observation).
*   **Collaboration:** Managing P2P sessions.
*   **History:** Managing persistent chat sessions via `chatStore`.

### 2.2. AIME (AI Memory Engine)
*   **Role:** Acts as the "Long-Term Memory" for the agent.
*   **Mechanism:** Uses vector embeddings (computed locally via `node-llama-cpp`) to index the codebase.
*   **Retrieval:** When a user asks a question, AIME performs a semantic search to find relevant code snippets (RAG) and injects them into the context window.

### 2.3. Shadow Workspace (`shadowWorkspaceService.ts`)
*   **Role:** Safety sandbox.
*   **Workflow:**
    1.  Agent proposes a code change.
    2.  System creates a temporary "shadow" file in memory/temp dir.
    3.  Linter/Compiler checks the shadow file.
    4.  If valid, change is applied to the real file. If invalid, the error is fed back to the agent for self-correction.

### 2.4. Chat Persistence (`chatStore.ts`)
*   **Storage:** Persists conversations using `zustand/middleware/persist` backed by `localStorage` (mapped to file storage in Electron).
*   **Structure:**
    *   `sessions`: Array of chat sessions.
    *   `messages`: Linked list of message objects.
    *   `metadata`: Timestamp, title, model used.

### 2.5. P2P Networking (`p2pService.ts`)
*   **Tech:** `simple-peer` (WebRTC) + `y-webrtc`.
*   **Topology:** Mesh network.
*   **Conflict Resolution:** CRDTs (Conflict-free Replicated Data Types) via `Yjs` ensure that all peers eventually converge to the same state, even with latency or offline edits.
*   **Security:**
    *   **Encryption:** AES-256-GCM for all data channels.
    *   **Signaling:** Encrypted signaling via STUN/TURN (no payload access by signal server).

---

## 3. Data Flow

### 3.1. Agent Instruction Flow
1.  User inputs prompt in `UnifiedAgentPanel`.
2.  `agentLoopService` receives prompt.
3.  **RAG Step:** Service queries `aimeService` for relevant context.
4.  **Inference:** Context + Prompt sent to LLM (Local or Cloud).
5.  **Tool Parsing:** LLM response parsed for tool calls (e.g., `<tool_code>writeFile...</tool_code>`).
6.  **Execution:** `ideAgentTools` executes the command (via Electron IPC).
7.  **Loop:** Output fed back to LLM. Repeat until task done.

### 3.2. Collaboration Flow
1.  User A types in Editor.
2.  `Yjs` captures update.
3.  Update encoded as binary update vector.
4.  `p2pService` broadcasts vector to connected peers via WebRTC data channel.
5.  User B receives vector, `Yjs` merges it, Editor updates.

---

## 4. Modular Package Structure

Kalynt uses a monorepo structure to separate concerns and allow for code reuse.

*   **`apps/desktop`**: The main application logic (Renderer & Main).
*   **`packages/crdt`**: Shared Conflict-free Replicated Data Type logic using `Yjs`. Handles document state and conflict resolution.
*   **`packages/networking`**: Low-level WebRTC connection management, abstracting peer discovery and connection maintenance.
*   **`packages/shared`**: Common types, interfaces, and utility functions shared between packages and the main app.

## 5. Technology Standards

*   **Language:** TypeScript (Strict Mode).
*   **Bundler:** Vite (Fast HMR).
*   **Styling:** Tailwind CSS (Utility-first).
*   **Icons:** Lucide React.
*   **IPC:** Context-bridged `window.electronAPI` (Secure, no node integration in renderer).
