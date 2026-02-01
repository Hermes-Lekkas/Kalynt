# Kalynt Auto-Update System Documentation

## Overview

Kalynt now includes a professional, secure auto-update system that automatically delivers updates to users via GitHub Releases. The system is built on `electron-updater`, the industry-standard solution for Electron applications.

## Features

- **Automatic Update Checking**: Checks for updates on app startup and every hour
- **Manual Update Checks**: Users can manually check for updates via the update button
- **Background Downloads**: Updates download in the background with progress tracking
- **User Control**: Users decide when to install updates (no forced updates)
- **Secure Token Storage**: GitHub tokens encrypted using OS-level keychain
- **Differential Updates**: Only downloads changed files, not the entire app
- **Release Notes**: Shows changelog and release information to users
- **Professional UI**: Sleek update button and modal replacing "Free Beta" badge

## Architecture

### Components

1. **Frontend (React)**
   - `UpdateButton.tsx` - Titlebar button showing update status
   - `UpdateModal.tsx` - Modal for displaying update information and controls
   - `updateStore.ts` - Zustand store for managing update state

2. **Backend (Electron Main)**
   - `update-handler.ts` - IPC handlers for update operations
   - `main.ts` - Initialization and periodic update checks

3. **Configuration**
   - `package.json` - electron-builder publish configuration
   - `constants.ts` - Update check interval and GitHub repo settings
   - `preload.ts` - Update API exposed to renderer

## Setup Instructions

### 1. Configure GitHub Repository

In `apps/desktop/package.json`, update the publish configuration:

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "HermesLekkas",
      "repo": "kalynt",                    
      "private": false,
      "releaseType": "release"
    }
  }
}
```

Also update in `apps/desktop/src/config/constants.ts`:

```typescript
export const CONFIG = {
  // ...
  GITHUB_REPO_OWNER: 'HermesLekkas',
  GITHUB_REPO_NAME: 'kalynt',                 
  UPDATE_CHANNEL: 'latest',  
}
```

### 2. Set Environment Variables (Optional)

Create a `.env` file in `apps/desktop/`:

```bash
# For private repositories (optional)
GH_TOKEN=your_github_personal_access_token

# Update channel
UPDATE_CHANNEL=latest

# Update check interval (milliseconds)
UPDATE_CHECK_INTERVAL_MS=3600000
```

### 3. Build and Publish

```bash
# Navigate to desktop app
cd apps/desktop

# Build the application
npm run build

# Publish to GitHub Releases (requires GH_TOKEN environment variable)
npm run electron:build
```

The `electron-builder` will automatically:
- Create installers for all platforms (Windows, macOS, Linux)
- Generate update metadata files (latest.yml, etc.)
- Upload all files to GitHub Releases

## User Guide

### For End Users

#### Checking for Updates

1. Look at the top-right corner of the titlebar
2. Click the "Check for Updates" button
3. The button will show:
   - **"Checking..."** - Currently checking for updates
   - **"Update [version]"** - An update is available
   - **"Up to date"** - No updates available
   - **"Update Error"** - An error occurred

#### Installing Updates

1. When an update is available, click the pulsing update button
2. A modal will appear showing:
   - Current version and new version
   - Release date
   - Release notes / changelog
3. Click "Download Update" to download in the background
4. Once downloaded, click "Install & Restart" to complete the update

### For Private Repositories

If your Kalynt repository is private, you need to configure a GitHub Personal Access Token:

1. Go to Settings → Security tab
2. Scroll to "Auto-Update Configuration"
3. Create a GitHub token at: https://github.com/settings/tokens/new
   - Select scope: `public_repo` (or `repo` for private repos)
4. Paste the token in the input field
5. Click "Save Token"

The token is encrypted and stored securely in your OS keychain.

## Security Features

### 1. OS-Level Token Encryption

GitHub tokens are stored using Electron's `safeStorage` API, which uses:
- **Windows**: Data Protection API (DPAPI)
- **macOS**: Keychain Services
- **Linux**: Secret Service API / libsecret

### 2. HTTPS-Only

All update checks and downloads use HTTPS exclusively.

### 3. Code Signing (Recommended)

For production deployments, configure code signing:

**macOS:**
```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
```

**Windows:**
```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your_password
```

**Configuration in package.json:**
```json
{
  "build": {
    "win": {
      "publisherName": "Hermes Lekkas",
      "verifyUpdateCodeSignature": true
    },
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

### 4. Signature Verification

`electron-updater` automatically verifies digital signatures when code signing is configured.

### 5. Token Scope

GitHub tokens only require minimal `public_repo` scope for public repositories, or `repo` for private repositories. Never use tokens with broader permissions.

## Update Channels

Support for multiple update channels:

- **latest**: Stable releases only
- **beta**: Beta and stable releases
- **alpha**: All releases including experimental

Configure in `constants.ts`:
```typescript
UPDATE_CHANNEL: 'latest'  // or 'beta', 'alpha'
```

## Troubleshooting

### Updates Not Appearing

1. Check GitHub Releases exists at: `https://github.com/YOUR_USERNAME/YOUR_REPO/releases`
2. Verify `package.json` has correct owner/repo
3. Check browser console for errors
4. For private repos, verify GitHub token is configured

### "Update Error" Message

1. Open DevTools (View → Toggle Developer Tools)
2. Check Console tab for detailed error messages
3. Common issues:
   - No internet connection
   - GitHub API rate limiting
   - Invalid GitHub token
   - Missing release assets

### Download Stuck

1. Check internet connection
2. Check available disk space
3. Try clearing cache: `C:\Users\<You>\AppData\Roaming\Kalynt\` (Windows)

## Development

### Testing Updates Locally

1. Build version v1.0 beta:
   ```bash
   npm run build
   ```

2. Create a GitHub release with version 0.91.0

3. Upload built installers to the release

4. Run your local v1.0 beta app - it should detect the 1.0.0-rc.1 update

### Disabling Auto-Update

For development, you can disable automatic checks in `update-handler.ts`:

```typescript
// Comment out this line in initializeAutoUpdater:
// await autoUpdater.checkForUpdates()
```

## API Reference

### Update Store

```typescript
import { useUpdateStore } from './stores/updateStore'

// Actions
const { checkForUpdates, downloadUpdate, installUpdate } = useUpdateStore()

// State
const { status, updateInfo, downloadProgress, error } = useUpdateStore()
```

### Electron API

```typescript
// Configure GitHub token
await window.electronAPI.update.configureToken(token)

// Check for updates
const result = await window.electronAPI.update.checkForUpdates()

// Download update
await window.electronAPI.update.downloadUpdate()

// Install update and restart
await window.electronAPI.update.installUpdate()

// Event listeners
window.electronAPI.update.onUpdateAvailable((info) => {
  console.log('Update available:', info.version)
})
```

## Best Practices

1. **Version Numbering**: Use semantic versioning (e.g., 1.0.0, 1.0.1, 1.1.0)
2. **Release Notes**: Always provide clear, user-friendly release notes
3. **Testing**: Test updates on all platforms before releasing
4. **Staged Rollouts**: Consider beta channel for gradual rollouts
5. **Backup Strategy**: Advise users to backup data before major updates
6. **Communication**: Announce updates on your website/social media

## Support

For issues or questions:
- GitHub Issues: [Issues](https://github.com/HermesLekkas/kalynt/issues)
- Documentation: This file
- Electron Updater Docs: https://www.electron.build/auto-update

---

**Security Note**: Never commit GitHub tokens to version control. Use environment variables or secure token storage.
