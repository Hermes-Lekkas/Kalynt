# AUTO-UPDATE SETUP (Full Working Flow)
Step 1: Create GitHub Release Infrastructure
Your GitHub repo must have a "Releases" section

When you publish a build, electron-builder creates a release automatically

The release contains: .exe, .AppImage, .dmg files

Plus a latest.yml file (version metadata)

Step 2: Configure electron-builder for Auto-Updates
In package.json build section, specify GitHub as publish provider

Tell it your GitHub username and repository name

electron-builder will use system keychain for token (no file needed)

This is completely automatic - no manual steps

Step 3: Embed Auto-Update Logic in Your App
Your Electron main process checks GitHub API on startup

Calls GitHub Releases API to get latest version

Compares with current app version

If newer version exists, shows "Update Available" notification

User clicks "Download"

App downloads in background to temp directory

On restart, installs and runs new version

User never leaves the app (seamless)

Step 4: Handle Update Events Properly
Startup check: Every time app launches, check for updates (once)

Manual check: User can click "Check for Updates" in settings

Download: Happens silently in background

Installation: Only happens on restart (no interruption)

Rollback: If new version crashes, user can downgrade via file manager

Step 5: Handle Edge Cases
If user has no internet: Show friendly message, not error

If GitHub is down: Silently skip check, app works anyway

If update download fails: Retry automatically, notify user

If user clicks "Update Later": Check again next startup

If user has unstable connection: Resume partial downloads

Step 6: Display Version & Update Info
Show current version in Settings panel

Show "Checking for updates..." briefly while checking

Show "Update available: v1.1.0" with release notes

Show download progress (%) while downloading

Show "Update will install on next restart" after download