# VS Code Extension System Integration

**Kalynt** now supports VS Code extensions through a compatible Extension Host architecture. This allows users to install and use thousands of existing VS Code extensions from the Open VSX marketplace.

---

## 📋 Overview

The VS Code extension system integration includes:

1. **Extension Host Process** - Isolated Node.js process for running extensions
2. **VS Code API Compatibility Layer** - Provides `vscode` namespace to extensions
3. **Open VSX Marketplace Integration** - Browse and install from 2000+ extensions
4. **Extension Manager UI** - Manage installed extensions
5. **Contribution Points System** - Commands, views, themes, keybindings, etc.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Kalynt Main Process                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Extension Host Manager                     │  │
│  │   - Manages extension lifecycle                       │  │
│  │   - Handles installation/uninstallation               │  │
│  │   - Collects contributions                            │  │
│  └─────────────────┬─────────────────────────────────────┘  │
│                    │ fork()                                  │
│                    ▼                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Extension Host Process (Child)               │  │
│  │   - Loads extension code                              │  │
│  │   - Provides vscode API                               │  │
│  │   - Sandboxed execution                               │  │
│  └─────────────────┬─────────────────────────────────────┘  │
│                    │ IPC                                     │
└────────────────────┼─────────────────────────────────────────┘
                     │
┌────────────────────┼─────────────────────────────────────────┐
│                    ▼                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Renderer Process                        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │           Extension Manager UI                  │  │  │
│  │  │  - Browse marketplace                           │  │  │
│  │  │  - Install/uninstall extensions                 │  │  │
│  │  │  - Activate/deactivate extensions               │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                           │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │         Extension Service                       │  │  │
│  │  │  - Communicates with main process               │  │  │
│  │  │  - Manages extension state                      │  │  │
│  │  │  - Handles extension events                     │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
apps/desktop/
├── electron/
│   ├── extensions/
│   │   ├── extensionHostManager.ts    # Main process manager
│   │   └── extensionHostProcess.ts    # Child process entry
│   └── handlers/
│       └── app-info.ts                # Added app:getPath handler
├── src/
│   ├── services/extensions/
│   │   ├── extensionService.ts        # Renderer service
│   │   ├── marketplaceService.ts      # Open VSX integration
│   │   └── index.ts                   # Module exports
│   ├── components/extensions/
│   │   ├── ExtensionManager.tsx       # UI component
│   │   ├── ExtensionManager.css       # Styles
│   │   └── index.ts                   # Component exports
│   └── types/extensions/
│       └── index.ts                   # Type definitions
└── electron/preload.ts                # Extended IPC API
```

---

## ✅ Supported Features

### VS Code API Compatibility

| Feature | Status | Notes |
|---------|--------|-------|
| Commands | ✅ Full | Register and execute commands |
| Window API | ✅ Partial | Messages, quick pick, input box |
| Workspace API | ✅ Partial | Configuration, workspace folders |
| Languages API | ✅ Basic | Completion providers, hover |
| Debug API | ✅ Basic | Configuration providers |
| Extensions API | ✅ Full | Get extensions, activate |
| Events | ✅ Full | EventEmitter pattern |
| URIs | ✅ Full | File URI handling |
| Output Channels | ✅ Full | Custom output channels |
| Terminals | ✅ Basic | Create and send text |

### Contribution Points

| Contribution | Status | Description |
|--------------|--------|-------------|
| Commands | ✅ Full | Command palette integration |
| Menus | ✅ Full | Context menus, command palette |
| Keybindings | ✅ Full | Custom keyboard shortcuts |
| Views | ✅ Full | Custom sidebar panels |
| Views Containers | ✅ Full | Activity bar panels |
| Themes | ✅ Full | Color themes |
| Icon Themes | ✅ Full | File icon themes |
| Languages | ✅ Full | Language definitions |
| Grammars | ✅ Full | TextMate grammars |
| Snippets | ✅ Full | Code snippets |
| Debuggers | ✅ Basic | Debug adapters |
| Configuration | ✅ Full | Settings |

---

## 🔧 Usage

### Opening the Extension Manager

```typescript
import { extensionService } from './services/extensions'

// Initialize on app start
await extensionService.initialize()

// The Extension Manager UI can be opened via:
// - Command Palette: "Extensions: Show Extension Manager"
// - Menu: View → Extensions
// - Keyboard Shortcut: Ctrl+Shift+X
```

### Installing Extensions

**Via UI:**
1. Open Extension Manager (Ctrl+Shift+X)
2. Search for extension in marketplace tab
3. Click "Install"

**Via VSIX:**
1. Click "Install from VSIX" button
2. Select .vsix file
3. Extension installs automatically

**Programmatically:**
```typescript
import { extensionService } from './services/extensions'

// From marketplace
await extensionService.installFromMarketplace('ms-python.python')

// From VSIX file
await extensionService.installFromVSIX('/path/to/extension.vsix')
```

### Activating Extensions

Extensions activate automatically based on:
- `activationEvents` in package.json
- Manual activation via UI
- Command invocation

```typescript
// Manual activation
await extensionService.activateExtension('ms-python.python')
```

### Using Extension Commands

```typescript
// Execute a command from an extension
const result = await extensionService.executeCommand(
  'python.sortImports',
  '/path/to/file.py'
)
```

### Getting Extension Contributions

```typescript
// Get all contributions from installed extensions
const contributions = await extensionService.getContributions()

// contributions.commands - All registered commands
// contributions.views - All custom views
// contributions.themes - All color themes
// contributions.keybindings - All keybindings
```

---

## 🌐 Open VSX Marketplace

Kalynt integrates with [Open VSX](https://open-vsx.org/), the open source alternative to the VS Code Marketplace.

### Searching Extensions

```typescript
import { marketplaceService } from './services/extensions'

// Search for extensions
const results = await marketplaceService.searchExtensions({
  searchText: 'python',
  categories: ['Programming Languages'],
  pageSize: 20
})

// Get popular extensions
const popular = await marketplaceService.getPopularExtensions(10)

// Get extension details
const details = await marketplaceService.getExtensionDetails('ms-python', 'python')

// Download extension
const blob = await marketplaceService.downloadExtension(
  'ms-python',
  'python',
  '2024.0.0'
)
```

---

## 🔒 Security

The extension system implements several security measures:

1. **Process Isolation** - Extensions run in a separate Node.js process
2. **Limited API** - Only safe VS Code APIs are exposed
3. **No Node.js Access** - Extensions cannot access Node.js directly
4. **Path Validation** - All file paths are validated to prevent traversal
5. **Permission System** - Future: Extensions declare required permissions

---

## 🚀 Creating Compatible Extensions

Extensions built for VS Code should work with minimal or no modifications.

### package.json Requirements

```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.74.0"
  },
  "activationEvents": [
    "onCommand:myExtension.hello"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "myExtension.hello",
        "title": "Hello World"
      }
    ]
  }
}
```

### Extension Entry Point

```typescript
// extension.ts
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension activated!')
  
  const disposable = vscode.commands.registerCommand(
    'myExtension.hello',
    () => {
      vscode.window.showInformationMessage('Hello from Kalynt!')
    }
  )
  
  context.subscriptions.push(disposable)
}

export function deactivate() {
  console.log('Extension deactivated!')
}
```

### Building and Packaging

```bash
# Install vsce
npm install -g @vscode/vsce

# Package extension
vsce package

# Install in Kalynt
# Use "Install from VSIX" button in Extension Manager
```

---

## 🧪 Testing Extensions

### Unit Tests

```typescript
// __tests__/extension.test.ts
import * as assert from 'assert'
import * as vscode from 'vscode'

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('publisher.my-extension')
    assert.ok(extension)
  })

  test('Should activate', async () => {
    const extension = vscode.extensions.getExtension('publisher.my-extension')
    await extension?.activate()
    assert.ok(extension?.isActive)
  })
})
```

### Integration Tests

Run tests within Kalynt's extension host:

```bash
# Extension host runs tests in isolated environment
npm run test:extension -- --extensionDevelopmentPath=./my-extension
```

---

## 📊 Performance Considerations

### Extension Host
- Runs in separate process to prevent UI blocking
- Automatic restart on crash
- Memory limits enforced per extension

### Lazy Loading
- Extensions load on-demand via activation events
- Contributions collected without activating
- Background extension updates

### Caching
- Marketplace results cached (5 minute TTL)
- Extension metadata cached
- Icon and asset caching

---

## 🐛 Troubleshooting

### Extension Won't Install

1. Check extension is VS Code compatible (has `engines.vscode`)
2. Verify VSIX file is not corrupted
3. Check extension host process is running

### Extension Won't Activate

1. Check activation events in package.json
2. View Extension Host logs in DevTools
3. Try manual activation from Extension Manager

### Commands Not Working

1. Verify extension is active
2. Check command ID matches contribution
3. Review Extension Host logs for errors

### Performance Issues

1. Disable unused extensions
2. Check extension CPU/memory usage
3. Report to extension author

---

## 🔮 Future Enhancements

### Planned Features

- [ ] Full Language Server Protocol support
- [ ] Complete Debug Adapter Protocol support
- [ ] Extension marketplace ratings/reviews
- [ ] Automatic extension updates
- [ ] Extension sync across devices
- [ ] Custom extension registry support
- [ ] Extension signing/verification
- [ ] Sandboxed Web Worker extensions

### API Improvements

- [ ] Source Control API
- [ ] SCM Provider API
- [ ] Task Provider API
- [ ] Custom Editor API
- [ ] Webview Panel API
- [ ] Tree View API enhancements

---

## 📚 Related Documentation

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Open VSX Registry](https://open-vsx.org/)
- [Eclipse Theia Extensions](https://theia-ide.org/docs/authoring_vscode_extensions/)
- [Extension Host Architecture](https://code.visualstudio.com/api/advanced-topics/extension-host)

---

## 📝 License

The VS Code extension system integration is released under the same AGPL-3.0 license as Kalynt.

Note: Individual extensions may have their own licenses. Always check the extension's license before installation.
