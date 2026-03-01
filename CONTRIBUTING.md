# Contributing to Kalynt

Thank you for your interest in contributing to Kalynt! We welcome contributions from the community to help make this the best privacy-first IDE.

## Repository Structure

Kalynt is a monorepo managed by NPM Workspaces.

```text
kalynt/
├── apps/
│   └── desktop/              # The main Electron application
│       ├── electron/         # Main process services & IPC
│       │   └── services/     # Hardware, Runtime, Performance Acceleration
│       └── src/              # Renderer (React UI, services, stores)
│           ├── components/   # UI components (ide/, collaboration/, extensions/)
│           ├── services/     # 28 renderer-side services
│           └── stores/       # 6 Zustand stores
├── packages/
│   ├── crdt/                 # Shared CRDT logic (Yjs wrappers)
│   ├── networking/           # P2P Networking layer
│   ├── shared/               # Common types and utilities
│   └── native-macos/         # Swift native helper (FSEvents, CoreML, memory)
└── ...
```

## Getting Started

1.  **Prerequisites**:
    *   Node.js >= 22.0.0
    *   Python 3.10+ (for native module builds)
    *   C++ Build Tools
    *   Swift 5.9+ (for macOS native helper, optional)

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

We accept Pull Requests (PRs) :

*   **UI/UX**: React components, CSS styling, Themes (`apps/desktop/src/components`)
*   **Utilities**: Helper functions, formatters (`apps/desktop/src/utils`)
*   **Language Support**: Adding support for new languages in the execution engine.
*   **Networking**: Improvements to P2P reliability in `packages/networking`.
*   **Performance**: Memory optimization, lazy loading, build acceleration (`electron/services/Performance_Acceleration`).
*   **Security**: Path sanitization, CSP improvements, audit logging.
*   **Native (macOS)**: Swift native helper improvements (`packages/native-macos`).
*   **Documentation**: Improving guides and tutorials.



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
