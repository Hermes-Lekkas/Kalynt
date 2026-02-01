# Code Obfuscation Feature

Kalynt includes an optional **code obfuscation** feature that applies heavy JavaScript obfuscation to sensitive modules during production builds. This feature makes reverse-engineering significantly more difficult for attackers.

## What is Obfuscation?

Code obfuscation transforms readable JavaScript into functionally equivalent but extremely difficult-to-read code. It doesn't provide cryptographic security, but it creates a significant barrier against:

- Casual code inspection
- Automated code analysis tools
- Quick modification of proprietary logic
- Easy extraction of algorithms

## Protected Modules

When enabled, obfuscation is applied to these files:

| File | Description |
|------|-------------|
| `electron/handlers/llm-inference.ts` | Local LLM inference engine |
| `src/services/agentService.ts` | AI agent orchestration |
| `src/services/offlineLLMService.ts` | Offline model management |
| `src/services/aiService.ts` | AI service abstraction layer |
| `src/components/AIMESettings.tsx` | AIME configuration UI |
| `src/types/aime.ts` | Core AIME type definitions |
| `src/services/hardwareService.ts` | Hardware detection/optimization |

## Obfuscation Techniques Applied

When `OBFUSCATE=true`, the following protections are applied:

### String Protection
- **RC4 Encryption**: All strings are encrypted using RC4 algorithm
- **String Array**: Strings are extracted to a shuffled, rotated array
- **Split Strings**: Long strings are chunked into 10-character pieces

### Control Flow
- **Control Flow Flattening**: Code structure is flattened to hide logic flow
- **Dead Code Injection**: Non-functional code is injected to confuse analysis

### Identifiers
- **Hexadecimal Names**: Variables/functions renamed to `_0x1a2b3c` format
- **Property Transformation**: Object keys are transformed

### Additional (Node.js builds)
- **Self-Defending**: Code resists formatting/beautification attempts
- **Higher Thresholds**: More aggressive transformation ratios

## How to Enable Obfuscation

### Local Build

```bash
# Standard build (no obfuscation)
npm run build

# Obfuscated production build
npm run build:secure
```

### CI/CD (GitHub Actions)

Edit `.github/workflows/release.yml` and set `OBFUSCATE: "true"`:

```yaml
- name: Build and Publish
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OBFUSCATE: "true"  # Enable obfuscation
  run: |
    npm run electron:build:secure
```

## Performance Impact

Obfuscation increases:
- **Build time**: ~2-5x longer for obfuscated files
- **Bundle size**: ~20-40% larger due to added complexity
- **Runtime overhead**: Minimal (~1-5% slower execution)

## Security Considerations

Obfuscation is **defense-in-depth**, not a security guarantee:

- Determined attackers can still reverse-engineer obfuscated code
- It significantly increases the time/effort required
- Best combined with other protections (code signing, licensing, etc.)
- Never rely on obfuscation to hide secrets (API keys, passwords)

## Configuration

The obfuscation settings are defined in `apps/desktop/vite.config.ts`. You can adjust thresholds and techniques by modifying:

- `OBFUSCATION_OPTIONS_BROWSER` - Frontend React code
- `OBFUSCATION_OPTIONS_NODE` - Electron main process

See [javascript-obfuscator documentation](https://github.com/javascript-obfuscator/javascript-obfuscator) for all available options.

---

## License

- **Open Core**: AGPL-3.0-only
- **Proprietary Modules**: Closed Source (Commercial License)

**Note**: The default release builds do NOT include obfuscation. Enable it by setting `OBFUSCATE=true` if you want this additional protection layer.

© 2026 Hermes Lekkas. All rights reserved.
