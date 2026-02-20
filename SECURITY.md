# Security Policy

##  Security Philosophy

Kalynt is built on a "Trust No One" (Zero Trust) architecture. We assume that networks are compromised and that privacy is a fundamental right.

### Core Principles

1.  **Local-First:** Data should never leave the user's machine unless explicitly authorized.
2.  **End-to-End Encryption:** All peer-to-peer communication is encrypted using AES-256-GCM.
3.  **Sandboxed Execution:** AI agents and extensions run in isolated environments to prevent unauthorized system access.
4.  **Transparency:** The core codebase is open-source (AGPL-3.0) for public audit.

---

##  Security Features

### 1. P2P Collaboration Encryption
*   **Protocol:** WebRTC (Data Channels).
*   **Encryption:** All signaling and data payloads are encrypted.
*   **Keys:** Room keys are generated locally and shared via a secure out-of-band channel (e.g., password protected links). The server only acts as a signaling broker (STUN/TURN) and cannot decrypt payload data.

### 2. AI Agent Sandbox ("Shadow Workspace")
*   **Concept:** Before the AI modifies your actual project files, it operates on a `Shadow Workspace`—a temporary, isolated copy of your codebase.
*   **Validation:** Changes are linted, compiled, and tested in the shadow environment. Only if they pass these checks are they merged into the main workspace.
*   **Permission Scopes:** You grant explicit permissions (Read-Only, Trusted, etc.) to the agent.

### 3. Path Traversal Protection
*   **Validation:** All file system operations (`readFile`, `writeFile`, etc.) pass through a rigorous `validatePath` sanitizer.
*   **Symlinks:** Symbolic links are resolved (`fs.realpath`) to ensure they don't point outside the allowed workspace root.

### 4. API Key Storage
*   **Mechanism:** API keys (OpenAI, Anthropic, Google) are **never** stored in plain text.
*   **Implementation:** We use Electron's `safeStorage` API, which leverages the OS-level keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service) to encrypt secrets at rest.

### 5. Content Security Policy
*   **Enforcement:** CSP headers are applied to every response via `session.webRequest.onHeadersReceived`.
*   **Rules:** `script-src 'self'`, whitelisted CDN origins only, `connect-src` restricted to known API endpoints.
*   **XSS Mitigation:** AI response rendering uses `react-syntax-highlighter` instead of `dangerouslySetInnerHTML`.

### 6. Process & Memory Security
*   **Renderer Sandbox:** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
*   **Performance Acceleration:** All Chromium flags are hardened — GPU process merged into main, background networking disabled, renderer process limited to 1.
*   **Native Helper Isolation:** The Swift helper runs as a separate child process, communicating exclusively via JSON-RPC over stdin/stdout.

---

##  Reporting Vulnerabilities

We take security vulnerabilities seriously. If you discover a security issue, please **DO NOT** open a public issue.

**Contact:** [hermeslekkasdev@gmail.com](mailto:hermeslekkasdev@gmail.com)

Please include:
*   Description of the vulnerability.
*   Steps to reproduce.
*   Potential impact.

We will acknowledge receipt within 48 hours and strive to provide a patch within 14 days.

---

##  Security Updates (v1.0.4-beta)

*   **Electron Sandboxing (SEC-001):** Enabled the `sandbox: true` flag for Electron renderers to enforce strict process isolation.
*   **Dynamic Import Validation (SEC-002):** Implemented strict path validation for local LLM modules before dynamic `import()` to prevent unauthorized code execution.
*   **Deep Link Hardening (SEC-003):** Added rigorous validation for custom protocol deep links to prevent URL-based injection attacks.
*   **Environment Filtering (SEC-004):** Whitelisted safe environment variables for child processes to prevent credential leakage.
*   **Sanitized Debugging (SEC-006):** Hardened the debug handler to sanitize input from `package.json` fields, preventing path traversal during debugger initialization.
*   **Update Integrity (SEC-008):** Added GitHub token validation and checksum verification to the update handler.
*   **Enhanced Path Sanitization:** Hardened `file-system.ts` against advanced path traversal techniques involving complex symlink chains.
*   **XSS Mitigation:** Replaced `dangerouslySetInnerHTML` with `react-syntax-highlighter` in `CodeBlockRenderer.tsx` and enhanced AI response sanitization in `UnifiedAgentPanel.tsx`.
*   **Dependency Audits:** Updated `node-llama-cpp` and `electron` to patched versions.
