/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
    plugins: [
        react(),
        electron({
            main: {
                entry: ['electron/main.ts', 'electron/extensions/extensionHostProcess.ts'],
                vite: {
                    build: {
                        outDir: 'dist-electron',
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
                            output: {
                                format: 'es',
                            }
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
                chunkFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
                entryFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
                assetFileNames: isProduction ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]'
            }
        },
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
        sourcemap: !isProduction
    },
    esbuild: isProduction ? {
        drop: ['console', 'debugger'],
        legalComments: 'none'
    } : {}
})
