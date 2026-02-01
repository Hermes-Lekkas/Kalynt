# Security Guide for Kalynt Auto-Update System

This document outlines the security measures implemented in Kalynt's auto-update system and best practices for maintaining security.

## Security Architecture

### 1. Secure Token Storage

#### OS-Level Encryption
GitHub tokens are never stored in plain text. We use Electron's `safeStorage` API which leverages operating system security features:

| Platform | Technology | Security Level |
|----------|-----------|----------------|
| Windows | Data Protection API (DPAPI) | User-level encryption |
| macOS | Keychain Services | Keychain encryption |
| Linux | Secret Service API / libsecret | Keyring encryption |

#### Implementation
```typescript
// Storing token (encrypted automatically)
await window.electronAPI.safeStorage.set({
  key: 'github-update-token',
  value: token
})

// Retrieving token (decrypted automatically)
const result = await window.electronAPI.safeStorage.get('github-update-token')
```

The token is:
- **Encrypted at rest**
- **Only accessible to the current user**
- **Never exposed to renderer process**
- **Only used in the main process**
- **Automatically cleared when deleted**

### 2. HTTPS-Only Communication

All communication with GitHub uses HTTPS exclusively:

```typescript
// Enforced in update-handler.ts
autoUpdater.forceDevUpdateConfig = false  // Disables dev config
```

- **All API calls encrypted in transit**
- **No downgrade to HTTP allowed**
- **Certificate validation enforced**

### 3. Minimal Token Permissions

GitHub tokens require minimal scopes:

- **Public Repositories**: `public_repo` scope only
- **Private Repositories**: `repo` scope

**Never grant additional permissions**. The token only needs read access to releases.

### 4. Code Signing (Production)

#### Why Code Signing Matters
Code signing ensures:
- The update came from you (authenticity)
- The update hasn't been tampered with (integrity)
- Users trust the source (trustworthiness)

#### macOS Code Signing

1. **Get a Developer ID Certificate**
   - Enroll in Apple Developer Program ($99/year)
   - Generate certificate in Xcode or Apple Developer portal

2. **Configure Environment**
   ```bash
   export CSC_LINK=/path/to/certificate.p12
   export CSC_KEY_PASSWORD=your_password
   export APPLE_ID=your_apple_id@email.com
   export APPLE_ID_PASSWORD=app-specific-password
   ```

3. **Build Configuration** (in `package.json`)
   ```json
   {
     "build": {
       "mac": {
         "hardenedRuntime": true,
         "gatekeeperAssess": false,
         "entitlements": "build/entitlements.mac.plist",
         "entitlementsInherit": "build/entitlements.mac.plist",
         "category": "public.app-category.developer-tools"
       }
     }
   }
   ```

4. **Entitlements File** (`build/entitlements.mac.plist`)
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
     <true/>
     <key>com.apple.security.cs.disable-library-validation</key>
     <true/>
   </dict>
   </plist>
   ```

#### Windows Code Signing

1. **Get a Code Signing Certificate**
   - Purchase from trusted CA (DigiCert, Sectigo, etc.)
   - Or use self-signed for internal testing

2. **Configure Environment**
   ```bash
   export CSC_LINK=/path/to/certificate.pfx
   export CSC_KEY_PASSWORD=your_password
   ```

3. **Build Configuration**
   ```json
   {
     "build": {
       "win": {
         "publisherName": "Your Company Name",
         "verifyUpdateCodeSignature": true
       }
     }
   }
   ```

### 5. Update Signature Verification

When code signing is configured, `electron-updater` automatically:

1. Downloads the update
2. Verifies the digital signature
3. Rejects updates with invalid/missing signatures
4. Only installs verified updates

**Configuration:**
```json
{
  "win": {
    "verifyUpdateCodeSignature": true  // Enforces signature check
  }
}
```

### 6. Code Obfuscation (IP Protection)

Kalynt applies heavy obfuscation to proprietary modules in production builds to protect against reverse engineering of our core AI logic (AIME).

- **Targeted Files**: `agentService.ts`, `hardwareService.ts`, `aime.ts`, `AIMESettings.tsx`, etc.
- **Obfuscation Level**: HEAVY (Control flow flattening, RC4 string encryption, Dead code injection).
- **Environment**: Enabled only when `OBFUSCATE=true` during `npm run build:secure`.

See [OBFUSCATION.md](./OBFUSCATION.md) for a detailed list of protected files.

## Security Best Practices

### For Developers

#### 1. Protect GitHub Tokens

```bash
# ❌ NEVER DO THIS
git add .env
git commit -m "Added configuration"

# ✅ DO THIS
echo ".env" >> .gitignore
git add .gitignore
```

#### 2. Use Environment Variables

```bash
# Set token only when building
GH_TOKEN=ghp_xxx npm run build

# Or use .env file (but never commit it!)
```

#### 3. Rotate Tokens Regularly

- Rotate GitHub tokens every 90 days
- Immediately rotate if token is compromised
- Use fine-grained tokens when possible

#### 4. Limit Token Access

- Create tokens with minimal scopes
- Use separate tokens for CI/CD vs manual builds
- Consider using GitHub Actions secrets

#### 5. Secure Build Pipeline

```yaml
# Example GitHub Actions workflow
name: Build and Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Use GitHub's provided token
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
        run: npm run build
```

### For End Users

#### 1. Verify Updates

Before installing updates:
- Check the release notes
- Verify the version number
- Ensure it's from official source

#### 2. Backup Data

- Backup your workspaces before major updates
- Export important configurations
- Save any unsaved work

#### 3. Secure Your GitHub Token

If using a private repository:
- Never share your GitHub token
- Use the Settings panel to configure it
- Delete the token if you suspect compromise

#### 4. Use Official Releases Only

- Only download from official GitHub releases
- Don't install updates from unknown sources
- Verify the publisher name on Windows/macOS

## Threat Model

### What We Protect Against

**Man-in-the-Middle (MITM) Attacks**
- HTTPS encryption prevents interception
- Certificate validation prevents impersonation

**Token Theft from Disk**
- OS-level encryption protects stored tokens
- Tokens only accessible to current user

**Tampered Updates**
- Code signing verifies update integrity
- Signature verification rejects modified updates

**Unauthorized Access**
- Minimal token permissions limit damage
- Token scope restricted to releases only

### What We Don't Protect Against

**Compromised Developer Machine**
- If your development machine is compromised, attackers could sign malicious updates
- Mitigation: Use secure development practices, 2FA, encrypted drives

**Compromised GitHub Account**
- If your GitHub account is compromised, attackers could publish malicious releases
- Mitigation: Enable 2FA, use strong passwords, monitor release activity

**Supply Chain Attacks**
- If dependencies are compromised, they could be included in updates
- Mitigation: Use lockfiles, audit dependencies, SCA tools

**User Device Compromise**
- If user's device is compromised, malware could intercept the update
- Mitigation: Users should maintain updated antivirus, firewalls

## Incident Response

### If GitHub Token is Compromised

1. **Immediately revoke the token**
   - Go to https://github.com/settings/tokens
   - Delete the compromised token

2. **Generate a new token**
   - Create new token with minimal scopes
   - Update build configuration

3. **Audit recent releases**
   - Check for unauthorized releases
   - Delete any suspicious releases

4. **Notify users** (if necessary)
   - If malicious updates were published
   - Provide instructions to verify installations

### If Code Signing Certificate is Compromised

1. **Revoke the certificate immediately**
   - Contact your certificate authority
   - Revoke the compromised certificate

2. **Obtain a new certificate**
   - Purchase/generate new certificate
   - Update build configuration

3. **Re-sign and re-publish all recent releases**
   - Build with new certificate
   - Replace all release assets

4. **Notify users**
   - Alert about the compromise
   - Provide verification steps

## Compliance

### GDPR Compliance

- No personal data collected during updates
- No tracking or analytics in update process
- User controls when updates are installed
- Tokens stored locally, never transmitted except to GitHub

### OWASP Top 10

Our update system addresses:
- **A02: Cryptographic Failures** - OS-level token encryption
- **A04: Insecure Design** - Secure-by-default architecture
- **A07: Identification and Authentication Failures** - Token-based auth
- **A08: Software and Data Integrity Failures** - Code signing

## Security Checklist

Before deploying auto-updates:

- [ ] Configure code signing for all platforms
- [ ] Set up secure token storage
- [ ] Enable signature verification
- [ ] Test update process end-to-end
- [ ] Document security procedures
- [ ] Set up monitoring for releases
- [ ] Create incident response plan
- [ ] Enable 2FA on GitHub account
- [ ] Use minimal token permissions
- [ ] Regular security audits

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT open a public issue**
2. Email: security@hermeslekkas.dev
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

I will respond within 48 hours and work with you to address the issue.

## Additional Resources

- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [GitHub Token Security](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure)

---

**Remember**: Security is an ongoing process, not a one-time setup. Regularly review and update your security practices.
