# Security Policy

## 🛡️ Security Philosophy

Kalynt is built on a "Trust No One" (Zero Trust) architecture. We assume that networks are compromised and that privacy is a fundamental right.

### Core Principles

1.  **Local-First:** Data should never leave the user's machine unless explicitly authorized.
2.  **End-to-End Encryption:** All peer-to-peer communication is encrypted using AES-256-GCM.
3.  **Sandboxed Execution:** AI agents and extensions run in isolated environments to prevent unauthorized system access.
4.  **Transparency:** The core codebase is open-source (AGPL-3.0) for public audit.

---

## 🔒 Security Features

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
*   **Mechanism:** API keys (OpenAI, Anthropic) are **never** stored in plain text.
*   **Implementation:** We use Electron's `safeStorage` API, which leverages the OS-level keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service) to encrypt secrets at rest.

---

## 🐛 Reporting Vulnerabilities

We take security vulnerabilities seriously. If you discover a security issue, please **DO NOT** open a public issue.

**Contact:** [hermeslekkasdev@gmail.com](mailto:hermeslekkasdev@gmail.com)

Please include:
*   Description of the vulnerability.
*   Steps to reproduce.
*   Potential impact.

We will acknowledge receipt within 48 hours and strive to provide a patch within 14 days.

---

## 📝 Security Updates (v1.0.4-beta)

*   **Enhanced Path Sanitization:** Hardened `file-system.ts` against advanced path traversal techniques involving complex symlink chains.
*   **Dependency Audits:** Updated `node-llama-cpp` and `electron` to patched versions.
*   **Chat Persistence:** Chat history database is stored locally in the user's `AppData` folder, ensuring conversation data remains private and is not synced to any cloud.
