# Kalynt - The Privacy-First AI IDE

<div align="center">
  <img src="apps/desktop/public/Kalynt_256x256.ico" alt="Kalynt Logo" width="128" height="128" />
  
  <h3>Local-First AI. End-to-End Encrypted Collaboration. No Subscription Required.</h3>

  <p>
    Kalynt is a next-generation Integrated Development Environment designed for the post-GPT era. 
    It embeds an autonomous AI agent deeply into your workflow while ensuring your code never leaves your machine unless you want it to.
  </p>

  [![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
  [![Version](https://img.shields.io/badge/version-v1.0.4--beta-green)](https://github.com/Hermes-Lekkas/Kalynt/releases)
  [![Platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey)](https://github.com/Hermes-Lekkas/Kalynt/releases)
</div>

---

## 🚀 Key Features

### 🧠 Autonomous AI Agent (AIME)
*   **Local Inference:** Run LLMs (Llama 3, Mistral, CodeQwen) directly on your CPU/GPU using `node-llama-cpp`. No internet required.
*   **Agentic Loop:** An autonomous ReAct (Reasoning + Acting) loop that can plan, execute terminal commands, edit files, and fix bugs without hand-holding.
*   **Shadow Workspace:** AI changes are sandboxed and validated before touching your real code.
*   **Cloud Fallback:** Seamlessly switch to OpenAI (GPT-4o), Anthropic (Claude 3.5), or Google (Gemini 1.5) when you need extra horsepower.

### 🔒 Privacy & Security by Design
*   **Local-First:** Your code, chat history, and embeddings live on your disk.
*   **P2P Collaboration:** Serverless, end-to-end encrypted collaboration (CRDT + WebRTC). No central server sees your keystrokes.
*   **Security Scanning:** Integrated static analysis and dependency scanning (Snyk/Trivy compatible).

### ⚡ Modern Developer Experience
*   **Unified & Modern UI:** A sleek, glassmorphism-based interface with a redesigned Settings Panel and streamlined Agent controls.
*   **Monaco Editor:** The battle-tested core of VS Code, enhanced with AI inline completions and diff views.
*   **Resizable Panels:** Fully customizable layout with draggable Terminal, File Explorer, and Agent Sidebar.
*   **Chat History:** Persistent, searchable chat sessions with your AI pair programmer.
*   **Integrated Terminal:** Hardware-accelerated terminal with smart command suggestions.

---

## 🛠️ Architecture

Kalynt is built on a robust, modern tech stack:

*   **Runtime:** Electron (Main Process), Chromium (Renderer)
*   **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
*   **State Management:** Zustand (w/ Persistence), Yjs (CRDT for collaboration)
*   **AI Engine:** `node-llama-cpp` (Local), Custom OpenAI-compatible client (Cloud)
*   **Storage:** SQLite (Metadata), JSON/File System (Workspaces)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep dive into the system design.

---

## 📦 Installation

### Pre-built Binaries
Download the latest installer for Windows, macOS, or Linux from the [Releases Page](https://github.com/Hermes-Lekkas/Kalynt/releases).

### Building from Source

**Prerequisites:**
*   Node.js 18+
*   Python 3.10+ (for node-gyp dependencies)
*   C++ Build Tools (Visual Studio Build Tools on Windows, Xcode on Mac)

```bash
# Clone the repository
git clone https://github.com/Hermes-Lekkas/Kalynt.git
cd Kalynt

# Install dependencies
npm install

# Start in development mode
npm run dev

# Build for production
npm run build
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to submit PRs, report bugs, and request features.

---

## 📄 License

Kalynt is open-source software licensed under the **AGPL-3.0**.
*   **Core:** Free and open.
*   **Extensions:** Can be proprietary or open.

Copyright © 2026 Hermes Lekkas.
