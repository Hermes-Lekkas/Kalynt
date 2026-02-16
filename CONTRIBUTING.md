# Contributing to Kalynt

Thank you for your interest in contributing to Kalynt! We welcome contributions from the community to help make this the best privacy-first IDE.

## Repository Structure

Kalynt is a monorepo managed by NPM Workspaces.

```text
kalynt/
├── apps/
│   └── desktop/          # The main Electron application
├── packages/
│   ├── crdt/             # Shared CRDT logic (Yjs wrappers)
│   ├── networking/       # P2P Networking layer
│   └── shared/           # Common types and utilities
└── ...
```

## Getting Started

1.  **Prerequisites**:
    *   Node.js >= 18.0.0
    *   Python 3.10+ (for native module builds)
    *   C++ Build Tools

2.  **Setup**:
    ```bash
    git clone https://github.com/Hermes-Lekkas/Kalynt.git
    cd Kalynt
    npm install
    ```

3.  **Run Development Environment**:
    ```bash
    npm run dev
    ```
    This command starts the Vite dev server and launches Electron.

## What You Can Contribute To

We accept Pull Requests (PRs) for the **Open Source Core**:

*   **UI/UX**: React components, CSS styling, Themes (`apps/desktop/src/components`)
*   **Utilities**: Helper functions, formatters (`apps/desktop/src/utils`)
*   **Language Support**: Adding support for new languages in the execution engine.
*   **Networking**: Improvements to P2P reliability in `@kalynt/networking`.
*   **Documentation**: Improving guides and tutorials.

**Files marked with `SPDX-License-Identifier: AGPL-3.0-only` are open for contribution.**

## What You Cannot Contribute To

The **Proprietary Pro Modules** are closed source. We **do not** accept PRs for:

*   **Agent Logic**: `agentService.ts`, `offlineLLMService.ts`
*   **AIME Engine**: `llm-inference.ts`
*   **Cloud Integrations**: `aiService.ts`

These files are marked with a `PROPRIETARY & CONFIDENTIAL` header (or similar indication) and are often obfuscated in production.

## Submission Guidelines

1.  **Fork the repository**.
2.  **Create a feature branch**: `git checkout -b feature/my-new-feature`
3.  **Commit your changes**: `git commit -am 'Add some feature'`
4.  **Push to the branch**: `git push origin feature/my-new-feature`
5.  **Submit a Pull Request**.

## Code of Conduct

*   Be respectful and inclusive.
*   Focus on constructive feedback.
*   Zero tolerance for harassment or discrimination.

## License

By contributing, you agree that your contributions will be licensed under the **AGPL-3.0-only** license.

---
© 2026 Hermes Lekkas (hermeslekkasdev@gmail.com). All rights reserved.
