/**
 * Kalynt Test Extension
 * Demonstrates VS Code extension API compatibility
 */

import * as vscode from 'vscode'

/**
 * Called when extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('[Kalynt Test Extension] Activated!')

  // Register Hello World command
  const helloCommand = vscode.commands.registerCommand('kalyntTest.hello', () => {
    // Get configuration
    const config = vscode.workspace.getConfiguration('kalyntTest')
    const message = config.get<string>('greetingMessage', 'Hello from Kalynt!')
    
    // Show message
    vscode.window.showInformationMessage(message)
  })

  // Register Show Date command
  const dateCommand = vscode.commands.registerCommand('kalyntTest.showDate', () => {
    const now = new Date()
    const dateString = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    
    vscode.window.showInformationMessage(`Current date: ${dateString}`)
  })

  // Register a command that uses the output channel
  const outputCommand = vscode.commands.registerCommand('kalyntTest.createOutput', () => {
    const channel = vscode.window.createOutputChannel('Kalynt Test')
    channel.appendLine('This is a test output channel')
    channel.appendLine(`Extension path: ${context.extensionPath}`)
    channel.show()
  })

  // Add all disposables to context
  context.subscriptions.push(helloCommand, dateCommand, outputCommand)

  // Show activation message
  vscode.window.showInformationMessage('Kalynt Test Extension is now active!')
}

/**
 * Called when extension is deactivated
 */
export function deactivate() {
  console.log('[Kalynt Test Extension] Deactivated!')
}
