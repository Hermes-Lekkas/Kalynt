/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'
import JavaScriptObfuscator from 'javascript-obfuscator'

// Check if obfuscation should be applied
const isProduction = process.env.NODE_ENV === 'production'
const shouldObfuscate = process.env.OBFUSCATE === 'true'

// ============================================================================
// PROPRIETARY FILES WHITELIST
// These are the ONLY files that will be obfuscated
// ============================================================================
const PROPRIETARY_FILES = [
    // Backend Services
    'electron/handlers/llm-inference.ts',

    // Frontend Services
    'src/services/agentService.ts',
    'src/services/offlineLLMService.ts',
    'src/services/aiService.ts',

    // UI Components
    'src/components/AIMESettings.tsx',

    // Core Types/Logic
    'src/types/aime.ts',

    // Hardware/Optimization
    'src/services/hardwareService.ts'
]

// Normalize paths for cross-platform comparison
const PROPRIETARY_PATHS = PROPRIETARY_FILES.map(p =>
    path.resolve(__dirname, p).replace(/\\/g, '/')
)

// ============================================================================
// HEAVY OBFUSCATION CONFIGURATION
// Applied only when OBFUSCATE=true environment variable is set
// ============================================================================
const OBFUSCATION_OPTIONS_BROWSER = {
    // Variable/Function names
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal' as const,
    renameGlobals: false,

    // String protection (RC4 - strongest)
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['rc4' as const],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function' as const,
    stringArrayThreshold: 0.75,
    splitStrings: true,
    splitStringsChunkLength: 10,

    // Control flow
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,

    // Anti-debugging (disabled for browser - causes issues)
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,

    // Numbers/expressions
    numbersToExpressions: true,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,

    // Target
    target: 'browser' as const,
    sourceMap: false
}

const OBFUSCATION_OPTIONS_NODE = {
    ...OBFUSCATION_OPTIONS_BROWSER,
    target: 'node' as const,
    // Node can handle stronger obfuscation
    selfDefending: true,
    stringArrayWrappersCount: 3,
    controlFlowFlatteningThreshold: 0.9,
    deadCodeInjectionThreshold: 0.5
}

// ============================================================================
// CUSTOM VITE PLUGIN FOR SELECTIVE OBFUSCATION
// Transforms proprietary files during the build phase
// ============================================================================
function createObfuscatorPlugin(target: 'browser' | 'node' = 'browser'): Plugin {
    const options = target === 'node' ? OBFUSCATION_OPTIONS_NODE : OBFUSCATION_OPTIONS_BROWSER

    return {
        name: 'vite-plugin-selective-obfuscator',
        enforce: 'post', // Run after TypeScript compilation

        transform(code: string, id: string) {
            // Skip if obfuscation is disabled
            if (!shouldObfuscate) return null

            // Normalize the file path for comparison
            const normalizedId = id.replace(/\\/g, '/').split('?')[0]

            // Check if this file should be obfuscated
            const shouldObfuscateFile = PROPRIETARY_PATHS.some(p => normalizedId.endsWith(p.split('/').slice(-2).join('/')))

            if (!shouldObfuscateFile) return null

            console.log(`[Obfuscator] Obfuscating: ${path.basename(normalizedId)}`)

            try {
                const result = JavaScriptObfuscator.obfuscate(code, options)
                return {
                    code: result.getObfuscatedCode(),
                    map: null // No source map for obfuscated code
                }
            } catch (error) {
                console.error(`[Obfuscator] Failed to obfuscate ${path.basename(normalizedId)}:`, error)
                // Return original code if obfuscation fails
                return null
            }
        }
    }
}

export default defineConfig({
    plugins: [
        react(),
        // Apply selective obfuscation to proprietary files
        createObfuscatorPlugin('browser'),
        electron({
            main: {
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        // Use terser for production builds
                        minify: isProduction ? 'terser' : false,
                        terserOptions: isProduction ? {
                            mangle: {
                                toplevel: true,
                                properties: {
                                    regex: /^_private_/
                                }
                            },
                            compress: {
                                drop_console: true,
                                drop_debugger: true,
                                passes: 3,
                                pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
                            },
                            format: {
                                comments: false
                            }
                        } : undefined,
                        rollupOptions: {
                            external: [
                                'electron',
                                'better-sqlite3',
                                'node-pty',
                                'simple-git',
                                'node-llama-cpp',
                                'chokidar'
                            ]
                        }
                    }
                }
            },
            preload: {
                input: 'electron/preload.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        minify: isProduction ? 'terser' : false,
                        terserOptions: isProduction ? {
                            mangle: { toplevel: true },
                            compress: {
                                drop_console: true,
                                drop_debugger: true
                            },
                            format: { comments: false }
                        } : undefined
                    }
                }
            },
            renderer: {}
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@collabforge/crdt': path.resolve(__dirname, '../../packages/crdt/src'),
            '@collabforge/networking': path.resolve(__dirname, '../../packages/networking/src'),
            '@collabforge/crypto': path.resolve(__dirname, '../../packages/crypto/src'),
            '@collabforge/shared': path.resolve(__dirname, '../../packages/shared/src')
        }
    },
    optimizeDeps: {
        include: ['react-window', 'lodash.debounce']
    },
    build: {
        rollupOptions: {
            external: ['better-sqlite3'],
            output: {
                // Mangle chunk names in production
                chunkFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
                entryFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
                assetFileNames: isProduction ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]'
            }
        },
        // Use terser for React bundle
        minify: isProduction ? 'terser' : 'esbuild',
        terserOptions: isProduction ? {
            mangle: {
                toplevel: true
            },
            compress: {
                drop_console: true,
                drop_debugger: true,
                passes: 2
            },
            format: {
                comments: false
            }
        } : undefined,
        // Never generate source maps in production
        sourcemap: !isProduction
    },
    // Drop console.* and debugger statements in production builds
    esbuild: isProduction ? {
        drop: ['console', 'debugger'],
        legalComments: 'none'
    } : {}
})
