# Applied Fixes - January 29, 2026

## Build Fix #1: NotificationType Initialization Error

Imported `DidChangeConfigurationNotification` from `vscode-languageserver/node` instead of defining it locally.

---

## Build Fix #2: Variable Shadowing Errors

Renamed local `process` variables to `lspProcess` and `debugProcess`.

---

## Build Fix #3: Implicit Any Types

Added explicit type annotations: `(code: number | null)` and `(data: Buffer)`.

---

## Build Fix #4: Map Iteration Errors

Used `Array.from(map.entries())` for iteration.

---

## Build Fix #5: Code Quality Improvements

- Updated imports to use `node:` prefix
- Added `readonly` modifiers to class members
- Removed unused imports

---

## Runtime Fix #6: onDownloadProgress API Error

Added optional chaining: `window.electronAPI?.onDownloadProgress`

**File:** `apps/desktop/src/stores/modelStore.ts`

---

## Runtime Fix #7: require.resolve() Crashes

### Problem
The app crashed at startup with errors like:
- `Cannot find module 'typescript-language-server/lib/cli.js'`
- `Cannot find module '@vscode/debugadapter/out/debugAdapter.js'`

This was caused by `require.resolve()` being called for packages that weren't installed. The crash occurred during `LanguageRuntimeGateway` instantiation, which **prevented all IPC handlers from being registered**.

### Solution
Replaced all `require.resolve()` calls with global command paths in both:
1. `languageServerConfigurations` - Language servers expected to be in PATH
2. `debugAdapterConfigurations` - Debug adapters expected to be in PATH

**Example change:**
```typescript
// Before (crashed if package not installed)
node: { command: 'node', args: [require.resolve('@vscode/debugadapter/...')] }

// After (graceful fallback)
node: { command: 'node', args: ['--inspect-brk', '${program}'] }
```

**File:** `apps/desktop/electron/terminal/languageGateway.ts`

---

## Files Modified
- `apps/desktop/electron/terminal/languageGateway.ts`
- `apps/desktop/src/stores/modelStore.ts`

## Verification
- **npm run build:vite** - Exit code 0
- **TypeScript compilation passes**
- **IPC handlers now register properly** (no more `fs:readDir` errors)
