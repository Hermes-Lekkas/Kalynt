# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.4-beta] - 2026-02-15

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

#### Resource Monitor
- Fixed crash caused by missing iVRAM (Integrated VRAM) stats on some systems.

#### Build Stability
- Resolved numerous TypeScript errors and unused variable warnings blocking production builds.

#### Performance
- Optimized file watcher to prevent over-firing during workspace indexing.

#### Security
- Enhanced path validation in file system handlers to prevent potential traversal attacks.

#### Visual Polish
- Added missing icons (`Globe`, `History`, `Settings`).
- Fixed styling in Member Management tab.
- Improved button hover states and active indicators.

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

Summary of Fixes
Phase 1: Critical Security (1 fix)
SEC-001: Enabled Electron sandbox (sandbox: true) in main.ts
Phase 2: High Security (5 fixes)
SEC-002: Added module path validation in llm-inference.ts - validates paths before dynamic import
SEC-003: Added deep link URL validation in main.ts - prevents URL-based attacks
SEC-004: Added env var filtering in debug.ts - whitelist of safe debug env vars
SEC-006: Added file path sanitization in debug.ts - sanitizes package.json main field
Phase 3: High Bugs (6 fixes)
BUG-001: Fixed resize listener lifecycle in IDEWorkspace.tsx
BUG-002/003: Fixed MemberSyncService promise handling and double-processing in memberSyncService.ts
BUG-004: Added custom AnalysisTimeoutError class in UnifiedAgentPanel.tsx
BUG-005/006: Fixed salt listener race condition in useYjs.ts with setup instance tracking
Phase 4: Medium Issues (9 fixes)
SEC-007/BUG-011/012: Added P2P rate limiter cleanup, peer count consistency in p2pService.ts
BUG-007: Added encryption init error handling in UnifiedAgentPanel.tsx
BUG-008: Added isMounted ref for scan loop in UnifiedAgentPanel.tsx
BUG-009: Added immediate state sync in setCallbacks in agentService.ts
BUG-010: Added error type classification in aiService.ts
SEC-008: Added GitHub token validation in update-handler.ts
Phase 5: Feature (1 implementation)
FEAT-001: Implemented suggest action handler in agentService.ts
