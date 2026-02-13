# Kalynt Test Extension

A simple test extension to demonstrate VS Code extension API compatibility in Kalynt.

## Features

- `Kalynt Test: Hello World` - Shows a greeting message
- `Kalynt Test: Show Current Date` - Displays the current date and time

## Installation

1. Build the extension:
   ```bash
   npm install
   npm run compile
   ```

2. Package the extension:
   ```bash
   npx vsce package
   ```

3. Install in Kalynt:
   - Open Kalynt
   - Go to Extensions view (Ctrl+Shift+X)
   - Click "Install from VSIX"
   - Select the generated `.vsix` file

## Usage

Open the Command Palette (Ctrl+Shift+P) and type:
- `Kalynt Test: Hello World`
- `Kalynt Test: Show Current Date`

## Development

This extension demonstrates:
- Command registration
- Configuration support
- Message display
- Output channel usage
- Extension lifecycle (activate/deactivate)
