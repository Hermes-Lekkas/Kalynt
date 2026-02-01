# Kalynt IDE - Code Obfuscation Guide

## Protection Strategy: Hybrid (Open Core)

Kalynt uses a **Open Core** model. We believe in transparency for security-critical components while protecting our unique IP.

- **Open Source Core**: NOT obfuscated. You can verify the code that runs on your machine.
- **Proprietary "Pro" Modules**: HEAVY obfuscation to protect intellectual property.

---

## Obfuscated Files (The "Brain")

Only the following files containing our proprietary algorithms are obfuscated. These files are processed using `rollup-plugin-javascript-obfuscator` with high-security settings (Control Flow Flattening, String Encryption, Dead Code Injection) during production builds.

| File | Description | Protection |
|------|-------------|------------|
| `src/services/agentService.ts` | Autonomous Agent State Machine & Planning | HEAVY |
| `src/services/offlineLLMService.ts` | Local Model Optimization Engine | HEAVY |
| `src/services/aiService.ts` | Cloud AI Integration Layer | HEAVY |
| `electron/handlers/llm-inference.ts` | AIME (Artificial Intelligence Memory Engine) Backend | HEAVY |
| `src/components/AIMESettings.tsx` | AIME Configuration UI | HEAVY |
| `src/types/aime.ts` | AIME Logic & Formulas | HEAVY |
| `src/services/hardwareService.ts` | Hardware Detection & AIME Optimization | HEAVY |

## Open Files (The "Body")

All other files are **NOT obfuscated** and are available for inspection in the source code or the `resources/app.asar` (if unpacked).

This includes:
- **Security Layer**: `file-system.ts`, `ideAgentTools.ts` (Verify what we can access)
- **Execution Layer**: `code-execution.ts` (Verify how we run code)
- **Networking**: `collabEngine.ts`, `p2pService.ts` (Verify encryption)
- **UI Components**: React components, CSS, and styling.

---

## Build Commands

### Development
```bash
npm run dev           # Start development server (No obfuscation)
```

### Production Build
```bash
npm run build:prod    # Standard build
```

### Secure Production Build
```bash
npm run build:secure  # Applies OBFUSCATE=true
```

The build script automatically applies `rollup-plugin-javascript-obfuscator` **ONLY** to the proprietary files whitelisted in `vite.config.ts`.
This ensures targeted protection for IP while keeping the open core verifiable.

---

## License

- **Open Core**: AGPL-3.0-only
- **Proprietary Modules**: Closed Source (Commercial License)

© 2026 Hermes Lekkas. All rights reserved.
