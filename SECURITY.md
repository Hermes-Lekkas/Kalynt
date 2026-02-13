# Security Guide for Kalynt

This document covers Kalynt's security architecture, threat model, and best practices for developers and end users.

## Security Architecture

### 1. Local-First Design

Kalynt is fundamentally local-first. Your code, AI models, and workspace data remain on your machine unless you explicitly enable collaboration or cloud AI providers.

| Data Type | Storage | Leaves Device? |
|-----------|---------|----------------|
| Source code | Local filesystem | Only via P2P collaboration (encrypted) |
| AI models (GGUF) | Local filesystem | Never |
| AI conversations | Local memory | Only if cloud provider selected |
| Workspace settings | Local filesystem | Never |
| Extension data | Local filesystem | Never |
| Tokens / API keys | OS-encrypted storage | Only to respective API endpoints |

### 2. Secure Token Storage

Sensitive credentials are encrypted using OS-level security via Electron's `safeStorage` API:

| Platform | Technology | Security Level |
|----------|-----------|----------------|
| Windows | Data Protection API (DPAPI) | User-level encryption |
| macOS | Keychain Services | Keychain encryption |
| Linux | Secret Service API / libsecret | Keyring encryption |

Tokens are:
- Encrypted at rest
- Only accessible to the current user
- Never exposed to the renderer process
- Only used in the main process
- Automatically cleared when deleted

### 3. P2P Collaboration Security

#### End-to-End Encryption
When a room password is set, all Yjs document updates are encrypted before transmission over WebRTC data channels. Each peer decrypts locally -- the signaling server never sees plaintext document content.

#### WebRTC Security
- Data channels use DTLS encryption by default
- STUN servers only assist with NAT traversal, they never see application data
- Signaling messages are transient and not stored server-side

#### Free Infrastructure
Kalynt uses only free, public infrastructure for P2P:

| Service | Provider | What It Sees |
|---------|----------|-------------|
| STUN | Google, Twilio, Xirsys (public) | IP addresses only (NAT traversal) |
| Signaling | yjs.dev WebSocket server | Encrypted signaling messages |

### 4. Extension Sandboxing

VS Code extensions run in a sandboxed child process isolated from the main process:

- Extensions cannot access the main process directly
- All communication goes through message-based IPC
- Extensions receive a controlled VS Code API shim, not raw Node.js access to Electron internals
- Extension marketplace (Open VSX) uses HTTPS for all downloads

### 5. HTTPS-Only Communication

All external communication uses HTTPS exclusively:
- GitHub API for auto-updates
- Open VSX API for extension marketplace
- Cloud AI provider APIs
- No HTTP fallback allowed

### 6. Code Signing (Production)

#### Why Code Signing Matters
Code signing ensures:
- The update came from the author (authenticity)
- The update has not been tampered with (integrity)
- Users trust the source (trustworthiness)

#### macOS

1. Get a Developer ID Certificate from the Apple Developer Program
2. Configure environment:
   ```bash
   export CSC_LINK=/path/to/certificate.p12
   export CSC_KEY_PASSWORD=your_password
   export APPLE_ID=your_apple_id@email.com
   export APPLE_ID_PASSWORD=app-specific-password
   ```
3. Hardened runtime is enabled in the build configuration with entitlements for unsigned executable memory and library validation bypass (required for native modules like `node-llama-cpp`).

#### Windows

1. Obtain a code signing certificate from a trusted CA (DigiCert, Sectigo, etc.)
2. Configure environment:
   ```bash
   export CSC_LINK=/path/to/certificate.pfx
   export CSC_KEY_PASSWORD=your_password
   ```
3. Update signature verification is configured in the build settings.

### 7. Auto-Update Security

When code signing is configured, `electron-updater` automatically:
1. Downloads the update from GitHub Releases
2. Verifies the digital signature
3. Rejects updates with invalid or missing signatures
4. Only installs verified updates

### 8. Code Obfuscation (IP Protection)

Proprietary modules receive heavy obfuscation in production builds (`npm run build:secure`):

- RC4 string encryption
- Control flow flattening
- Dead code injection
- Hexadecimal identifier renaming

This protects the AIME engine and agent logic from reverse engineering. See [OBFUSCATION.md](./OBFUSCATION.md) for details.

## Security Best Practices

### For Developers

#### Protect Secrets
```bash
# Never commit secrets
echo ".env" >> .gitignore

# Use environment variables for builds
GH_TOKEN=ghp_xxx npm run build
```

#### Token Hygiene
- Rotate GitHub tokens every 90 days
- Immediately rotate if a token is compromised
- Use fine-grained tokens with minimal scopes
- Create separate tokens for CI/CD vs manual builds

#### Secure Build Pipeline
```yaml
name: Build and Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
        run: npm run build
```

### For End Users

1. **Only download from official GitHub releases** -- verify the publisher name on Windows/macOS
2. **Check release notes** before installing updates
3. **Backup workspaces** before major updates
4. **Never share your GitHub token** if using a private repository
5. **Use the Settings panel** to configure tokens (they are encrypted automatically)

## Threat Model

### What We Protect Against

| Threat | Mitigation |
|--------|-----------|
| Man-in-the-Middle | HTTPS encryption + certificate validation |
| Token theft from disk | OS-level encryption via safeStorage |
| Tampered updates | Code signing + signature verification |
| Unauthorized API access | Minimal token permissions |
| Code exposure during collaboration | End-to-end encryption for P2P |
| Extension malware | Sandboxed host process + IPC isolation |

### What We Do Not Protect Against

| Threat | Recommended Mitigation |
|--------|----------------------|
| Compromised developer machine | Use 2FA, encrypted drives, secure development practices |
| Compromised GitHub account | Enable 2FA, strong passwords, monitor release activity |
| Supply chain attacks (dependencies) | Use lockfiles, audit dependencies, run SCA tools |
| User device compromise | Maintain updated OS, antivirus, firewall |

## Incident Response

### If a Token Is Compromised

1. Immediately revoke at https://github.com/settings/tokens
2. Generate a new token with minimal scopes
3. Audit recent releases for unauthorized activity
4. Notify users if malicious updates were published

### If a Code Signing Certificate Is Compromised

1. Revoke the certificate immediately via your CA
2. Obtain and configure a new certificate
3. Re-sign and re-publish all recent releases
4. Notify users with verification steps

## Compliance

### GDPR
- No personal data collected during updates or normal operation
- No tracking or analytics
- User controls when updates are installed
- Tokens stored locally, transmitted only to their respective API

### OWASP Top 10 Alignment
- **A02 Cryptographic Failures** -- OS-level token encryption
- **A04 Insecure Design** -- Secure-by-default, local-first architecture
- **A07 Identification and Authentication Failures** -- Token-based auth with minimal scopes
- **A08 Software and Data Integrity Failures** -- Code signing + signature verification

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT open a public issue**
2. Email: **security@hermeslekkas.dev**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

Response within 48 hours.

## Additional Resources

- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [GitHub Token Security](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure)

---
(c) 2026 Hermes Lekkas. All rights reserved.
