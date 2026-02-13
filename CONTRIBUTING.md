# Contributing to Kalynt

Thank you for your interest in contributing to Kalynt! We welcome contributions from the community to help make this the best privacy-first IDE.

## Repository Structure

Kalynt is a monorepo managed by NPM Workspaces:

```text
kalynt/
├── apps/
│   └── desktop/               # The main Electron application
│       ├── electron/           # Main process (Node.js)
│       │   ├── main.ts         # Electron entry point
│       │   ├── preload.ts      # Context bridge
│       │   ├── extensions/     # Extension host system
│       │   └── handlers/       # IPC handlers
│       └── src/                # Renderer process (React)
│           ├── components/     # UI components
│           ├── services/       # Service layer
│           ├── stores/         # Zustand state stores
│           ├── workers/        # Web Workers
│           ├── types/          # TypeScript types
│           └── utils/          # Utility functions
├── packages/
│   ├── crdt/                   # @kalynt/crdt -- Yjs wrappers
│   ├── networking/             # @kalynt/networking -- P2P layer
│   └── shared/                 # Common types and utilities
└── examples/
    └── test-extension/         # Sample VS Code extension
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Python 3.10+ (for native module builds like `node-pty`, `better-sqlite3`)
- C++ Build Tools:
  - **Windows**: Visual Studio Build Tools with "Desktop development with C++"
  - **macOS**: `xcode-select --install`
  - **Linux**: `sudo apt install build-essential libsecret-1-dev`

### Setup

```bash
git clone https://github.com/Hermes-Lekkas/Kalynt.git
cd Kalynt
npm install
```

### Run Development Environment

```bash
npm run dev
```

This starts the Vite dev server and launches Electron with hot module replacement.

### Run Tests

```bash
npm test
```

### Lint

```bash
npm run lint
```

## What You Can Contribute To

We accept Pull Requests for the **Open Source Core** -- any file marked with `SPDX-License-Identifier: AGPL-3.0-only`:

- **UI/UX** -- React components, styling, themes (`apps/desktop/src/components/`)
- **Editor features** -- Monaco Editor configuration, keybindings, syntax support (`apps/desktop/src/components/ide/`)
- **Utilities** -- Helper functions, formatters (`apps/desktop/src/utils/`)
- **Networking** -- P2P reliability, signaling improvements (`packages/networking/`)
- **CRDT** -- Yjs document management, conflict resolution (`packages/crdt/`)
- **Extension system** -- VS Code API shim coverage, marketplace integration (`apps/desktop/src/services/extensions/`, `apps/desktop/electron/extensions/`)
- **Terminal** -- xterm.js addons, terminal features (`apps/desktop/src/components/ide/`)
- **Documentation** -- Guides, tutorials, API docs
- **Bug fixes** -- Anything in the open-source core

## What You Cannot Contribute To

The **Proprietary Pro Modules** are closed source. We do not accept PRs for:

- **Agent logic** -- `agentService.ts`, `offlineLLMService.ts`
- **AIME engine** -- `aimeService.ts`, `aimeWorker.ts`, `llm-inference.ts`
- **Cloud AI integrations** -- `aiService.ts`
- **Hardware detection** -- `hardwareService.ts`

These files are marked with a `PROPRIETARY & CONFIDENTIAL` header and are obfuscated in production builds.

## Coding Standards

### TypeScript
- Prefer `unknown` over `any` for untyped values
- Prefer `interface` over `type` for object shapes
- Follow the existing type patterns in `apps/desktop/src/types/`

### React
- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused -- extract logic into custom hooks or services
- Use Zustand for global state, React state for local UI state

### Styling
- Tailwind CSS utility classes preferred
- No inline styles except for dynamic values
- Follow existing color scheme and spacing conventions

### File Organization
- One component per file
- Services in `services/` directory
- Types in `types/` directory or co-located with their module
- Workers in `workers/` directory

### Naming Conventions
- Components: `PascalCase.tsx`
- Services: `camelCase.ts`
- Types: `PascalCase` for interfaces and types
- Constants: `UPPER_SNAKE_CASE`
- Files: `camelCase.ts` for services/utils, `PascalCase.tsx` for components

## Submission Guidelines

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-new-feature`
3. **Make your changes** following the coding standards above
4. **Test your changes**: ensure `npm run lint` passes with no errors
5. **Commit your changes**: use clear, descriptive commit messages
6. **Push to your fork**: `git push origin feature/my-new-feature`
7. **Submit a Pull Request** with a description of what you changed and why

### Commit Messages

Use clear, descriptive messages:

```
feat: add keyboard shortcut for split pane toggle
fix: resolve file explorer crash on empty directories
docs: update ARCHITECTURE.md with extension system details
refactor: extract terminal resize logic into custom hook
```

### Pull Request Checklist

- [ ] Code follows existing conventions and style
- [ ] No new TypeScript errors (`npx tsc --noEmit`)
- [ ] No new ESLint warnings (`npm run lint`)
- [ ] Changes are limited to open-source core files
- [ ] Commit messages are clear and descriptive
- [ ] PR description explains the change and motivation

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Zero tolerance for harassment or discrimination
- Assume good intent in code reviews

## Questions?

If you have questions about contributing, open a Discussion on the GitHub repository.

## License

By contributing, you agree that your contributions will be licensed under the **AGPL-3.0-only** license.

---
(c) 2026 Hermes Lekkas. All rights reserved.
