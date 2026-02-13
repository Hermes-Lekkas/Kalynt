/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const isProduction = process.env.NODE_ENV === 'production'
const isReplit = process.env.REPL_SLUG !== undefined || process.env.REPLIT_DEPLOYMENT !== undefined

export default defineConfig({
    plugins: [
        react(),
    ],
    define: {
        'process.env.IS_WEB': JSON.stringify('true'),
    },
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
        include: ['react-window', 'lodash.debounce'],
        exclude: ['better-sqlite3', 'node-pty', 'electron']
    },
    server: {
        host: '0.0.0.0',
        port: 5000,
        allowedHosts: true,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    },
    preview: {
        host: '0.0.0.0',
        port: 5000,
        allowedHosts: true,
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            external: ['better-sqlite3', 'electron'],
            output: {
                chunkFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
                entryFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
                assetFileNames: isProduction ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]'
            }
        },
        minify: isProduction ? 'esbuild' : 'esbuild',
        sourcemap: !isProduction
    },
})
