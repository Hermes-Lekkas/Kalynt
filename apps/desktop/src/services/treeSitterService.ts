/**
 * TreeSitterService
 * Handles multi-language structural parsing using web-tree-sitter.
 */

import { Parser, Language } from 'web-tree-sitter'

import treeSitterWasmUrl from '../assets/wasm/tree-sitter.wasm?url'
import tsWasmUrl from '../assets/wasm/tree-sitter-typescript.wasm?url'
import tsxWasmUrl from '../assets/wasm/tree-sitter-tsx.wasm?url'
import jsWasmUrl from '../assets/wasm/tree-sitter-javascript.wasm?url'
import pyWasmUrl from '../assets/wasm/tree-sitter-python.wasm?url'
import goWasmUrl from '../assets/wasm/tree-sitter-go.wasm?url'
import rsWasmUrl from '../assets/wasm/tree-sitter-rust.wasm?url'

class TreeSitterService {
    private parser: Parser | null = null
    private languages: Record<string, Language> = {}
    private isInitialized = false

    async init() {
        if (this.isInitialized) return

        const electronAPI = (globalThis as any).electronAPI
        if (!electronAPI) return

        try {
            await Parser.init({
                locateFile: () => treeSitterWasmUrl
            })
            this.parser = new Parser()
            this.isInitialized = true
            console.log('[TreeSitter] Initialized successfully')
        } catch (error) {
            console.error('[TreeSitter] Initialization failed:', error)
        }
    }

    private async getLanguage(langId: string): Promise<Language | null> {
        if (this.languages[langId]) return this.languages[langId]

        const electronAPI = (globalThis as any).electronAPI
        if (!electronAPI || !this.parser) return null

        // Map language IDs to imported WASM URLs
        const wasmUrls: Record<string, string> = {
            'typescript': tsWasmUrl,
            'tsx': tsxWasmUrl,
            'javascript': jsWasmUrl,
            'python': pyWasmUrl,
            'go': goWasmUrl,
            'rust': rsWasmUrl
        }

        const wasmUrl = wasmUrls[langId]
        if (!wasmUrl) return null

        try {
            // Load language directly from resolved URL
            const lang = await Language.load(wasmUrl)
            this.languages[langId] = lang
            return lang
        } catch (error) {
            console.error(`[TreeSitter] Failed to load language ${langId}:`, error)
        }
        return null
    }

    async parseSymbols(content: string, filePath: string): Promise<any[]> {
        if (!this.parser && !this.isInitialized) await this.init()
        if (!this.parser) return []

        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        const langMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'tsx',
            'js': 'javascript',
            'jsx': 'javascript',
            'py': 'python',
            'go': 'go',
            'rs': 'rust'
        }

        const langId = langMap[ext]
        if (!langId) return []

        const lang = await this.getLanguage(langId)
        if (!lang) return []

        this.parser.setLanguage(lang)
        const tree = this.parser.parse(content)
        if (!tree) return []
        const symbols: any[] = []

        // Recursive tree traversal or specific queries could be used here.
        // For efficiency, we use a simple traversal to find identifying nodes.
        const cursor = tree.walk()

        const visit = () => {
            const node = cursor.currentNode

            // Common node types for symbols across languages
            const symbolTypes = [
                'class_declaration', 'function_declaration', 'method_definition',
                'interface_declaration', 'type_alias_declaration',
                'function_definition', // Python
                'function_declaration', // Go
                'function_item', 'struct_item', 'enum_item', 'trait_item', 'impl_item', 'mod_item' // Rust
            ]

            if (symbolTypes.includes(node.type)) {
                // Find the name of the symbol (usually an identifier child)
                const nameNode = node.childForFieldName('name') ||
                    node.children.find((c: any) => c.type === 'identifier')

                if (nameNode) {
                    symbols.push({
                        name: nameNode.text,
                        type: this.normalizeType(node.type),
                        line: node.startPosition.row + 1,
                        content: content.split('\n')[node.startPosition.row]?.trim() || ''
                    })
                }
            }

            if (cursor.gotoFirstChild()) {
                visit()
                while (cursor.gotoNextSibling()) {
                    visit()
                }
                cursor.gotoParent()
            }
        }

        visit()

        try {
            cursor.delete()
            tree.delete()
        } catch (e) {
            // Ignore cleanup errors
        }

        return symbols
    }

    private normalizeType(type: string): string {
        if (type.includes('class')) return 'class'
        if (type.includes('interface')) return 'interface'
        if (type.includes('type')) return 'interface'
        if (type.includes('method')) return 'method'
        if (type.includes('struct') || type.includes('impl') || type.includes('trait')) return 'interface'
        return 'function'
    }
}

export const treeSitterService = new TreeSitterService()
