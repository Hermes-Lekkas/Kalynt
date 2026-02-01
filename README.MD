# Kalynt IDE v1.0 beta

**The Privacy-First AI Agent IDE**

Kalynt is a next-generation Integrated Development Environment designed for the era of AI. It combines the power of offline Large Language Models, peer-to-peer collaboration, and a secure, local-first architecture to provide a development experience that protects your intellectual property while maximizing productivity.

**Inspiration**

Kalynt draws inspiration from tools like VS Code, Cursor, and Google Antigravity, which set a high bar for developer experience and AI‑assisted coding. At the same time, working with them daily exposed gaps that motivated building a more privacy‑first, offline‑capable, team‑oriented environment.
​

VS Code: Excellent editor and ecosystem, but no built‑in real‑time AI collaboration, limited offline AI story, and no opinionated memory engine for weaker machines.
​

Cursor: Strong AI integration for solo developers, but not designed as a first‑class multi‑user environment and not focused on privacy‑by‑default or offline local models.
​

Google Antigravity: Powerful AI‑assisted workflow, yet tied to cloud usage and not centered on self‑contained local execution or strict data‑boundary guarantees.
​

Kalynt was built to combine what these tools do well with what they miss: end‑to‑end encrypted P2P collaboration, offline local models, and an AIME (Artificial Intelligence Memory Engine) that can carry context for weaker devices without forcing everything into the cloud. On top of that, it adds team‑first features like separate workspaces, structured project management, and an open‑core model where the safety‑critical and privacy layers are visible for anyone to review.

## How It Was Built

**Development Environment:**
- Google Antigravity IDE (AI-assisted development)
- Claude, Gemini, GPT (AI orchestration)
- 8GB Lenovo laptop

**Quality Assurance:**
- SonarQube (code quality analysis)
- Snyk (security vulnerability scanning)
- ESLint (code standards enforcement)

**Architecture & Decisions:** 100% human-directed
**System Design:** Deep understanding of WebRTC, CRDTs, P2P, security
**Final Review:** Every line reviewed and understood

Built in less than a month by orchestrating modern tools 
while maintaining deep architectural understanding.

## Key Features

### AIME (Advanced Inference Matrix Engine)
- **Offline Intelligence**: Run powerful LLMs locally using `node-llama-cpp`. No data leaves your machine.
- **Agentic Capabilities**: Autonomous agents that can read, plan, and execute code changes within your workspace.
- **Hybrid Mode**: Seamlessly switch between local models and cloud providers if desired.

### Private Collaboration
- **P2P Sync**: Real-time collaboration powered by CRDTs (`yjs`) and WebRTC (`simple-peer`).
- **Serverless**: Connect directly with peers without central relay servers storing your code.
- **End-to-End Encryption**: Optional room encryption ensures only your team can see your work.

### Iron-Clad Security
- **Local-First**: Your code, your models, your data. Nothing is uploaded to the cloud unless you explicitly configure it.
- **Secure Storage**: Sensitive tokens and keys are encrypted using OS-level protection (DPAPI/Keychain) via `safeStorage`.
- **Nuke Button**: Instant kill-switch to terminate all processes and wipe temporary data in an emergency.
- **Code Signing**: Verified updates to prevent supply-chain attacks.

## Technical Architecture

Kalynt is built as a monorepo using **Turbo/Workspaces**:

- **Core**: Electron + Vite + React
- **Editor**: Monaco Editor
- **AI**: node-llama-cpp (Local Inference)
- **Packages**:
  - `@kalynt/crdt`: Conflict-free Replicated Data Types for state sync.
  - `@kalynt/networking`: P2P signaling and connection management.
  - `@kalynt/shared`: Common types and utilities.

## Installation

**Prerequisites:**
- Node.js >= 18.0.0
- Python 3.10+ (for node-gyp/llama build)
- C++ Build Tools (Visual Studio Build Tools on Windows)

```bash
# Clone the repository
git clone https://github.com/HermesLekkas/kalynt.git
cd kalynt

# Install dependencies
npm install

# Start development mode
npm run dev
```

## Building

Kalynt supports two build modes: **Standard** and **Secure (Obfuscated)**.

### Standard Build (Development/Debug)
```bash
npm run build
```

### Secure Build (Production)
Applies heavy obfuscation to proprietary modules (`src/services/agentService.ts`, `src/services/hardwareService.ts`, `aime` core logic, etc.) to protect IP.

```bash
npm run build:secure
```
*Note: Secure builds require `OBFUSCATE=true` environment variable.*

## License

- **Open Core**: AGPL-3.0-only
- **Proprietary Modules**: Closed Source (Commercial License)

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details on what can be modified.

---
© 2026 Hermes Lekkas. All rights reserved.