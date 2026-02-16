# Developer Guide

Welcome to the Kalynt development team! This guide will help you set up your environment, understand the development workflow, and contribute effectively.

## 1. Prerequisites

Before you begin, ensure you have the following installed:

*   **Node.js:** v20.0.0 or higher
*   **npm:** v10.0.0 or higher
*   **Git:** Latest version
*   **Build Tools (Native Modules):**
    *   **Windows:** Visual Studio Build Tools (C++ Desktop Development workload)
    *   **macOS:** Xcode Command Line Tools (`xcode-select --install`)
    *   **Linux:** `build-essential`, `python3`, `libx11-dev`, `libxkbfile-dev`

## 2. Project Setup

Kalynt is a monorepo managed by npm workspaces.

```bash
# Clone the repository
git clone https://github.com/RoodyNorman/Kalynt_Development.git
cd Kalynt_Development

# Install dependencies
npm install
```

## 3. Development Workflow

### Starting the App

To start the application in development mode:

**For Windows/macOS:**
```bash
npm run electron:dev
```

**For Linux (Recommended for Ubuntu/Wayland):**
```bash
npm run electron:dev:linux
```
*This command includes necessary stability flags (`--no-sandbox`, `--disable-gpu`) to prevent segmentation faults on modern Linux kernels.*

### Web-Only Mode

If you only want to work on the UI without Electron:
```bash
npm run dev:web
```

## 4. Architecture Overview for Developers

*   **`apps/desktop/src`**: The React Frontend (Renderer).
*   **`apps/desktop/electron`**: The Node.js Backend (Main).
*   **`packages/`**: Shared libraries (CRDT, Networking, Shared types).

## 5. Compatibility & Testing Status

*   **Windows:** Extensively tested.
*   **Linux:** Extensively tested (specifically Ubuntu 24.04 and 25.10).
*   **macOS:** Limited testing.

## 6. Common Issues & Troubleshooting

### Segmentation Fault on Linux
If the app crashes immediately on launch:
1. Use `npm run electron:dev:linux`.
2. Ensure you are not running as root unless using `--no-sandbox`.
3. Try rebuilding native modules: `cd apps/desktop && npx electron-rebuild`.

### Native Module Errors (node-pty / better-sqlite3)
If you see ABI mismatch errors:
```bash
cd apps/desktop
npm install --save-dev @electron/rebuild
npx electron-rebuild
```

---
**Happy Coding!**
