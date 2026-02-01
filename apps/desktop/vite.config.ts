/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'
// @ts-expect-error rollup-plugin-javascript-obfuscator lacks built-in types
import obfuscator from 'rollup-plugin-javascript-obfuscator'

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
].map(p => path.resolve(__dirname, p))

// ============================================================================
// HEAVY OBFUSCATION CONFIGURATION
// Applied only when OBFUSCATE=true environment variable is set
// ============================================================================
const HEAVY_OBFUSCATION_OPTIONS = {
    // Variable/Function names
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,

    // String protection (RC4 - strongest)
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['rc4'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 3,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 5,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.8,
    splitStrings: true,
    splitStringsChunkLength: 8,

    // Control flow
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.9,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.5,

    // Anti-debugging
    selfDefending: true,
    debugProtection: true,
    debugProtectionInterval: 3000,
    disableConsoleOutput: true,

    // Numbers/expressions
    numbersToExpressions: true,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,

    // Target browser for React frontend
    target: 'browser',

    // No source maps in production!
    sourceMap: false
}

export default defineConfig({
    plugins: [
        react(),
        // Apply obfuscation ONLY to proprietary files
        shouldObfuscate ? obfuscator({
            include: PROPRIETARY_FILES,
            ...HEAVY_OBFUSCATION_OPTIONS
        }) : null,
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
                            ],
                            // Inject obfuscator specifically for Electron build too
                            plugins: [
                                shouldObfuscate ? obfuscator({
                                    include: PROPRIETARY_FILES,
                                    ...HEAVY_OBFUSCATION_OPTIONS,
                                    target: 'node'
                                }) : null
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
