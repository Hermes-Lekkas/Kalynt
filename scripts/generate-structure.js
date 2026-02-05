const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outputFile = path.join(rootDir, 'PROJECT_STRUCTURE.md');

const ignorePatterns = [
    'node_modules',
    '.git',
    '.vscode',
    '.agent',
    '.claude',
    'dist',
    'dist-electron',
    'build',
    'coverage',
    '.DS_Store',
    'Thumbs.db'
];

const ignoreExtensions = [
    '.log',
    '.txt' // As requested: "error.txt etc"
];

function shouldIgnore(name) {
    if (ignorePatterns.includes(name)) return true;
    if (ignoreExtensions.some(ext => name.endsWith(ext))) return true;
    return false;
}

function generateTree(dir, prefix = '') {
    let output = '';
    const items = fs.readdirSync(dir, { withFileTypes: true });

    // Sort directories first, then files
    items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    const filteredItems = items.filter(item => !shouldIgnore(item.name));

    filteredItems.forEach((item, index) => {
        const isLast = index === filteredItems.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        output += `${prefix}${connector}${item.name}\n`;

        if (item.isDirectory()) {
            output += generateTree(path.join(dir, item.name), prefix + childPrefix);
        }
    });

    return output;
}

const tree = `# Kalynt Project Structure\n\nGenerated on: ${new Date().toLocaleString()}\n\n\`\`\`\n` +
    generateTree(rootDir) +
    `\`\`\`\n`;

fs.writeFileSync(outputFile, tree);
console.log(`Structure documented in ${outputFile}`);
