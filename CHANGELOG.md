# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.4-beta] - 2026-02-16

### Key Highlights

#### Unified & Modern UI
- **Redesigned Settings Panel:** Completely rebuilt `UnifiedSettingsPanel` with a sleek, glassmorphism-based design, proper sidebar, responsive tabs, and a dedicated "Danger Zone".
- **Streamlined Agent Header:** Simplified `UnifiedAgentPanel` header by removing cluttered buttons and adding a unified "Configure AI" entry point.
- **Compact Mode Switcher:** Added pill-style toggles for "Cloud" vs "Local" AI modes and "Chat" vs "AI Scan" tabs.

#### Persistent Chat History
- **Automatic Saving:** AI conversations are now automatically saved to a local SQLite/JSON database.
- **History Panel:** Added a "Previous Chats" overlay for browsing, renaming, and deleting past sessions.
- **Session Management:** Users can now pick up exactly where they left off.

#### Resizable Panels Everywhere
- **Draggable Agent Sidebar:** The right-hand Agent panel is now fully resizable.
- **Consistent Layout:** Resizing logic matches Terminal and File Explorer behavior.

### Improvements & Fixes

#### Performance & Stability
- **Resource Monitor:** Fixed crash caused by missing iVRAM (Integrated VRAM) stats on some systems.
- **Build Stability:** Resolved numerous TypeScript errors and unused variable warnings blocking production builds.
- **File Watcher:** Optimized watcher to prevent over-firing during workspace indexing.
- **Resize Lifecycle (BUG-001):** Fixed resize listener lifecycle in `IDEWorkspace.tsx` to prevent memory leaks.
- **Agent Service (BUG-009/010):** Added immediate state sync for callbacks and introduced error type classification.
- **Member Sync (BUG-002/003):** Improved promise handling and prevented double-processing in `MemberSyncService`.

#### Collaboration & P2P
- **P2P Hardening (SEC-007/BUG-011/012):** Added rate limiter cleanup and fixed peer count consistency in `p2pService.ts`.
- **Encryption Flow (BUG-007):** Added proper error handling for encryption initialization failures.
- **State Sync (BUG-005/006):** Fixed race conditions in salt listener setup in `useYjs.ts`.

#### AI & Agent Panel
- **Scan Stability (BUG-008):** Added `isMounted` checks to prevent state updates on unmounted scan loops.
- **Error Handling (BUG-004):** Introduced `AnalysisTimeoutError` for better feedback during long AI scans.
- **Action Handlers (FEAT-001):** Implemented a new "Suggest Action" handler in the agent service.

#### Security
- **Electron Sandboxing (SEC-001):** Enabled renderer sandboxing for enhanced process isolation.
- **Import Validation (SEC-002):** Added module path validation before dynamic imports in LLM inference.
- **Deep Link Security (SEC-003):** Implemented validation for application deep links to prevent injection.
- **Env Var Filtering (SEC-004):** Whitelisted safe environment variables for child processes in the debugger.
- **Path Sanitization (SEC-006):** Sanitized entry point paths in the debug handler to prevent traversal.
- **Update Integrity (SEC-008):** Added validation for update tokens and metadata.
- **XSS Mitigation:** Replaced unsafe HTML rendering with `react-syntax-highlighter` in code blocks.
- **Filesystem Hardening:** Enhanced path validation logic to resolve symlinks before checking bounds.

#### Linux Compatibility
- **Fixed Crash on Launch:** Disabled window transparency on Linux platforms to prevent segmentation faults common on Wayland and modern Ubuntu versions.
- **Binary Naming:** Fixed an issue where the executable was incorrectly named `@kalyntdesktop`. It is now correctly named `kalynt`.
- **Permission Fixes:** Updated terminal session storage to use `userData` directory instead of `process.cwd()`, preventing crashes when launched from read-only environments.
- **Icon Support:** Improved desktop integration by using PNG icons specifically for Linux builds.

#### Documentation
- Updated licensing information to clearly distinguish between AGPL-3.0 core modules and Proprietary Pro modules.
- Removed emojis from documentation for a cleaner, professional look.

### Architecture

#### Chat Store
- Introduced dedicated `chatStore` (Zustand + Persistence) to manage sessions independently of main application state.

#### Agent Loop Config
- Updated `AgentLoopConfig` types to support dynamic model overrides per session.

## [v1.0.3-beta] - 2026-02-03

### Team Collaboration Fixes

#### Workspace Sharing Bug Fixed
- **Issue**: When sharing a workspace link, the joiner would see "Shared Space" instead of the actual workspace name
- **Fix**: Workspace name is now included in the invite link URL fragment (`#n=WorkspaceName`) and parsed when joining

#### Chat Encryption Fixed
- **Issue**: Messages in the collaboration chat appeared encrypted/unreadable - decryption was failing
- **Root Cause**: Each peer was independently generating their own random encryption salt, resulting in different derived keys
- **Fix**: Encryption salt is now shared via the Yjs awareness protocol:
  - Room creator broadcasts their salt to all peers
  - Joiners receive and use the creator's salt before deriving their encryption key
  - All peers now use the same salt → same key → successful decryption

#### Connection Race Condition Fixed
- **Issue**: Users joining with a password could end up in different P2P rooms
- **Root Cause**: Password was stored in localStorage AFTER setting the current space, causing `useYDoc` to connect before the password was available
- **Fix**: Password is now stored BEFORE triggering the space change, ensuring both users join the same encrypted room (`kalynt-{spaceId}#{password}`)

### Security Hardening

#### Command Injection Prevention
- Added allowlists for safe commands in `dependencyManager.ts` and `debug.ts`
- Commands are validated against known-safe package managers and debugger binaries before execution
- Python module checks now validate against allowlist before spawning

#### XSS Protection Enhanced
- Improved `sanitizeContent()` to also encode `&` character (OWASP recommendation)
- All HTML special characters now properly escaped: `& < > " ' /`

#### Credential Storage Hardened
- Removed insecure base64 fallback when Electron's safeStorage is unavailable
- Now properly rejects credential storage when encryption is not available
- Prevents plaintext credential storage on systems without keychain access

#### Path Traversal Prevention
- Added symlink resolution using `fs.realpathSync()` before path validation
- Prevents symlink-based escapes from workspace directory
- Catches both `../` traversal and symlink attacks

#### Environment Variable Protection
- Created whitelist of safe environment variables for child processes
- Prevents leaking sensitive data (API keys, tokens) to user-executed code
- Safe vars include: PATH, HOME, NODE_ENV, language-specific paths

#### Content Security Policy
- Added CSP headers to Electron BrowserWindow
- Restricts script sources to 'self' and required API endpoints
- Prevents XSS attacks from loading external malicious scripts

### Bug Fixes

#### Offline LLM ESM Loading Fixed
- **Issue**: Offline AI engine failed to load with "require() of ES Module not supported" error
- **Root Cause**: Bundler was converting dynamic `import()` to `require()` for node-llama-cpp
- **Fix**: Added `dynamicImportESM()` helper using Function constructor to prevent bundler transformation

#### Memory Leak in Salt Listener Fixed
- **Issue**: Salt listener in useYjs was never removed on component unmount
- **Fix**: Added `saltListenerRef` to store listener and proper cleanup in useEffect return

#### FileTransferService Race Condition Fixed
- **Issue**: Rapid init/destroy cycles could register duplicate observers
- **Fix**: Added `initSequence` tracking to invalidate stale setTimeout callbacks

#### AgentService Promise Handling Fixed
- **Issue**: Timeout promise didn't properly handle abort and leaked event listeners
- **Fix**: Proper abort rejection and cleanup of event listeners using `.finally()`

#### Base64 Binary Data Fixed
- **Issue**: `storageService.ts` used `fromCodePoint`/`codePointAt` instead of `fromCharCode`/`charCodeAt`
- **Fix**: Corrected to use byte-appropriate methods for Uint8Array serialization

### Files Modified
- `apps/desktop/src/services/p2pService.ts` - Added `spaceName` parameter to link generation/parsing
- `apps/desktop/src/components/CollaborationPanel.tsx` - Fixed join flow race condition, use parsed workspace name
- `apps/desktop/src/hooks/useYjs.ts` - Salt sharing, memory leak fix for salt listener
- `apps/desktop/electron/terminal/dependencyManager.ts` - Command injection prevention
- `apps/desktop/electron/handlers/debug.ts` - Binary/module allowlists for security
- `apps/desktop/electron/handlers/safeStorage.ts` - Removed insecure fallback
- `apps/desktop/electron/handlers/file-system.ts` - Symlink resolution for path validation
- `apps/desktop/electron/handlers/code-execution.ts` - Environment variable whitelist
- `apps/desktop/electron/handlers/llm-inference.ts` - ESM dynamic import fix
- `apps/desktop/electron/main.ts` - Added CSP headers
- `apps/desktop/src/components/UnifiedAgentPanel.tsx` - Enhanced XSS sanitization
- `apps/desktop/src/services/fileTransferService.ts` - Race condition fix
- `apps/desktop/src/services/agentService.ts` - Promise handling fix
- `apps/desktop/src/services/storageService.ts` - Binary encoding fix

