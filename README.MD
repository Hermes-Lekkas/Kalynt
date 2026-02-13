# Kalynt IDE v1.0.3-beta

**The Privacy-First AI Agent IDE**

Kalynt is a native desktop IDE (Windows, Linux, macOS) built for the era of AI-assisted development. It combines offline local LLM inference, real-time peer-to-peer collaboration, end-to-end encryption, and a full-featured code editor into a single application that keeps your code and data entirely under your control.

## Inspiration

Kalynt draws inspiration from VS Code, Cursor, and Google Antigravity, which set a high bar for developer experience and AI-assisted coding. Working with them daily exposed gaps that motivated building a more privacy-first, offline-capable, team-oriented environment.

- **VS Code** -- Excellent editor and ecosystem, but no built-in real-time AI collaboration, limited offline AI story, and no opinionated memory engine for weaker machines.
- **Cursor** -- Strong AI integration for solo developers, but not designed as a first-class multi-user environment and not focused on privacy-by-default or offline local models.
- **Google Antigravity** -- Powerful AI-assisted workflow, yet tied to cloud usage and not centered on self-contained local execution or strict data-boundary guarantees.

Kalynt was built to combine what these tools do well with what they miss: end-to-end encrypted P2P collaboration, offline local models, and an AIME (Artificial Intelligence Memory Engine) that can carry context for weaker devices without forcing everything into the cloud.

## Key Features

### AIME (Artificial Intelligence Memory Engine)
- **Local LLM inference** via `node-llama-cpp` -- run GGUF models directly on your machine with no data leaving your device.
- **Agentic capabilities** -- autonomous agents that can read, plan, and execute code changes within your workspace.
- **Hybrid mode** -- switch between local models and cloud providers (OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Cohere, xAI) on a per-request basis.
- **Worker-based indexing** -- background web worker parses your codebase into a symbol index for search, context retrieval, and repository mapping without blocking the UI.

### Real-Time P2P Collaboration
- **Serverless** -- peers connect directly via WebRTC (`simple-peer`) with no central relay storing your code.
- **CRDT sync** -- conflict-free collaborative editing powered by Yjs documents and `y-webrtc`.
- **End-to-end encryption** -- optional room encryption ensures only your team can see your work.
- **Free infrastructure** -- uses free STUN servers (Google, Twilio, Xirsys public) and the public `yjs.dev` signaling server. No paid services required.

### Full IDE
- **Monaco Editor** with syntax highlighting, IntelliSense, multi-cursor editing, and inline diff.
- **Integrated terminal** powered by xterm.js with fit, search, Unicode, and web-link addons.
- **File explorer** with tree view, drag-and-drop, rename, create, and delete operations.
- **Breadcrumb navigation**, tab management, split panes, and command palette (`Ctrl+Shift+P`).
- **Git integration** via `simple-git` for status, diff, commit, and branch operations.

### VS Code Extension Compatibility
- **Open VSX marketplace** -- browse, search, and install extensions from the free Open VSX registry.
- **Extension host isolation** -- extensions run in a sandboxed Node.js child process with a VS Code API shim.
- **Activation/deactivation lifecycle** -- full `activate`/`deactivate` support with `ExtensionContext`.
- **Command registration** -- extensions can register and execute commands with result delivery via message-ID routing.

### Security
- **Local-first** -- your code, models, and data stay on your machine unless you explicitly share them.
- **Secure storage** -- sensitive tokens encrypted using OS-level protection (DPAPI / Keychain / libsecret) via Electron's `safeStorage`.
- **Nuke button** -- instant kill-switch to terminate all processes and wipe temporary data.
- **Code signing** -- verified builds to prevent supply-chain attacks.
- **Code obfuscation** -- optional heavy obfuscation of proprietary modules in production builds.

### Additional Features
- **Workspace management** -- create, switch, and organize multiple workspaces.
- **Task board** -- built-in Kanban-style project management.
- **Version panel** -- auto-update system with GitHub Releases integration.
- **Model manager** -- download, manage, and configure GGUF models for local inference.
- **Unified settings** -- centralized settings panel for editor, AI, collaboration, and security preferences.

## Technical Architecture

Kalynt is a monorepo managed by NPM Workspaces:

| Layer | Technology |
|-------|-----------|
| Shell | Electron 28 |
| UI | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Editor | Monaco Editor |
| AI | node-llama-cpp (local), multi-provider cloud API |
| Collaboration | Yjs + y-webrtc + simple-peer |
| Terminal | xterm.js |
| State | Zustand |
| Extensions | Open VSX + sandboxed host process |

### Packages

| Package | Description |
|---------|-------------|
| `@kalynt/crdt` | Yjs document wrappers and CRDT utilities for state synchronization |
| `@kalynt/networking` | P2P signaling, WebRTC connection management, and room handling |
| `@collabforge/shared` | Common TypeScript types and utility functions |

For a detailed architecture breakdown, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Python 3.10+ (for `node-gyp` / native module builds)
- C++ Build Tools:
  - **Windows**: Visual Studio Build Tools (Desktop development with C++)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `libsecret-1-dev`

### Setup

```bash
git clone https://github.com/Hermes-Lekkas/Kalynt.git
cd Kalynt
npm install
```

### Development

```bash
# Start Vite dev server + Electron
npm run dev
```

### Production Build

```bash
# Standard build
npm run build

# Build with code obfuscation
npm run build:secure
```

Build artifacts are output to `apps/desktop/release/` as platform installers (NSIS for Windows, DMG for macOS, AppImage/deb for Linux).

## How It Was Built

Kalynt was built using a modern AI-assisted workflow where AI wrote most of the raw code, and the author acted as the architect and reviewer.

**Development Environment:**
- Google Antigravity IDE (AI-assisted development)
- Claude, Gemini, GPT (for implementation and refactoring)

**Quality Assurance:**
- SonarQube (code quality analysis)
- Snyk (security vulnerability scanning)
- ESLint + TypeScript strict mode

**Project Scale:**
- 44,000+ lines of verified active logic
- Core stacks: TypeScript, React, Electron, node-llama-cpp

## License

- **Open Core**: AGPL-3.0-only
- **Proprietary Modules**: Closed Source (Commercial License)

See [LICENSE](./LICENSE) for full terms and [CONTRIBUTING.md](./CONTRIBUTING.md) for what can be modified.

## Security

For security architecture, threat model, and incident response procedures, see [SECURITY.md](./SECURITY.md).

To report a vulnerability, email **security@hermeslekkas.dev**. Do not open a public issue.

---
(c) 2026 Hermes Lekkas. All rights reserved.
