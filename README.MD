# Kalynt - The Privacy-First AI IDE

<div align="center">
  <img src="apps/desktop/public/Kalynt_256x256.ico" alt="Kalynt Logo" width="128" height="128" />
  
  <h3>Local-First AI. End-to-End Encrypted Collaboration. No Subscription Required.</h3>

  <p>
    Kalynt is a next-generation Integrated Development Environment designed for the post-GPT era. 
    It embeds an autonomous AI agent deeply into your workflow while ensuring your code never leaves your machine unless you want it to.
  </p>

  [![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
  [![Version](https://img.shields.io/badge/version-v1.0.4--beta-green)](https://github.com/RoodyNorman/Kalynt_Development/releases)
  [![Platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey)](https://github.com/RoodyNorman/Kalynt_Development/releases)
</div>

---

## Key Features

### Autonomous AI Agent (AIME)
*   **Local Inference:** Run LLMs (Llama 3, Mistral, CodeQwen) directly on your CPU/GPU using `node-llama-cpp`. No internet required.
*   **Agentic Loop:** An autonomous ReAct (Reasoning + Acting) loop that can plan, execute terminal commands, edit files, and fix bugs without hand-holding.
*   **Shadow Workspace:** **Safety First.** AI changes are sandboxed and validated in a temporary "shadow" environment before touching your real code.
*   **Cloud Fallback:** Seamlessly switch to OpenAI (GPT-4o), Anthropic (Claude 3.5), or Google (Gemini 1.5) when you need extra horsepower.

### Privacy & Security by Design
*   **Local-First:** Your code, chat history, and vector embeddings live strictly on your disk.
*   **P2P Collaboration:** Serverless, end-to-end encrypted (AES-256-GCM) collaboration using CRDTs and WebRTC. No central server sees your keystrokes.
*   **Security Scanning:** Integrated static analysis and dependency scanning.

### Modern Developer Experience
*   **Unified & Modern UI:** A sleek, glassmorphism-based interface with a redesigned Settings Panel.
*   **Monaco Editor:** The battle-tested core of VS Code, enhanced with AI inline completions.
*   **Resizable Panels:** Fully customizable layout with draggable Terminal, File Explorer, and Agent Sidebar.
*   **Chat History:** Persistent, searchable chat sessions with your AI pair programmer.
*   **Integrated Terminal:** Hardware-accelerated terminal with smart command suggestions.

---

## Architecture

Kalynt is built on a robust, modern tech stack:

*   **Runtime:** Electron (Main Process), Chromium (Renderer)
*   **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
*   **State Management:** Zustand (w/ Persistence), Yjs (CRDT for collaboration)
*   **AI Engine:** `node-llama-cpp` (Local), Custom OpenAI-compatible client (Cloud)
*   **Storage:** SQLite (Metadata), JSON/File System (Workspaces)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep dive into the system design.

---

## Installation

### Pre-built Binaries
Download the latest installer for Windows, macOS, or Linux from the [Releases Page](https://github.com/RoodyNorman/Kalynt_Development/releases).

### Building from Source

See the [Developer Guide](./DEVELOPER_GUIDE.md) for detailed build instructions.

```bash
# Quick Start
git clone https://github.com/RoodyNorman/Kalynt_Development.git
cd Kalynt_Development
npm install
npm run dev
```

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to submit PRs, report bugs, and request features.

---

## Licensing & Proprietary Modules

Kalynt is open-core software with specific proprietary modules.

### Open Source Core (AGPL-3.0)
The core of the application, including the UI, basic editor functions, networking, and CRDT logic, is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.
Files marked with `SPDX-License-Identifier: AGPL-3.0-only` are free to use, modify, and distribute under the terms of the AGPL.

### Proprietary Pro Modules
Certain advanced features are **Proprietary & Confidential** and are the exclusive intellectual property of Hermes Lekkas. You may NOT copy, modify, distribute, or reverse engineer these files.

**Proprietary Files:**
*   `apps/desktop/electron/handlers/llm-inference.ts`
*   `apps/desktop/src/components/AIMESettings.tsx`
*   `apps/desktop/src/services/agentService.ts`
*   `apps/desktop/src/services/aiService.ts`
*   `apps/desktop/src/services/auditLogService.ts`
*   `apps/desktop/src/services/hardwareService.ts`
*   `apps/desktop/src/services/offlineLLMService.ts`
*   `apps/desktop/src/types/aime.ts`

These files contain the header: `Copyright 2026 Hermes Lekkas (hermeslekkasdev@gmail.com). PROPRIETARY & CONFIDENTIAL.`

Copyright © 2026 Hermes Lekkas (hermeslekkasdev@gmail.com).
