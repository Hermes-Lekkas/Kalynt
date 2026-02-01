/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as path from 'node:path';
import * as fs from 'node:fs';

const FORBIDDEN_PATTERNS = [
    /\.git/i,
    /\.env/i,
    /\.ssh/i,
    /\.aws/i,
    /id_rsa/i,
    /\.npmrc/i,
];

function getRealPath(normalizedRequested: string): string {
    try {
        if (fs.existsSync(normalizedRequested)) {
            return fs.realpathSync(normalizedRequested);
        }
        const parentDir = path.dirname(normalizedRequested);
        if (fs.existsSync(parentDir)) {
            const realParent = fs.realpathSync(parentDir);
            return path.join(realParent, path.basename(normalizedRequested));
        }
    } catch {
        /* Fallback */
    }
    return normalizedRequested;
}

function isForbidden(normalizedPath: string): boolean {
    if (normalizedPath.endsWith('.gitignore')) return false;
    return FORBIDDEN_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Validates that the requested path is safe and contained within the workspace.
 * Prevents path traversal attacks and symlink bypasses.
 * 
 * @param workspacePath The absolute path to the workspace root
 * @param requestedPath The path requested by the user/agent
 * @returns The normalized absolute path if safe
 */
export function validatePath(workspacePath: string, requestedPath: string): string {
    if (!workspacePath) throw new Error('Workspace path is required');
    if (!requestedPath) throw new Error('Path is required');

    const resolved = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(workspacePath, requestedPath);

    const normW = path.normalize(workspacePath);
    const normR = path.normalize(resolved);

    if (isForbidden(normR)) {
        console.warn(`[Security] Forbidden path access: ${requestedPath}`);
        throw new Error('Access denied: Forbidden pattern');
    }

    const realR = getRealPath(normR);
    const relative = path.relative(normW, realR);

    const isSafe = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    if (!isSafe) {
        console.warn(`[Security] Path traversal detect: ${requestedPath} -> ${realR} outside ${workspacePath}`);
        throw new Error('Access denied: Outside workspace');
    }

    return normR;
}
