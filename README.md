# Chatbot — AI Coding Assistant for VS Code

A local-first AI coding assistant embedded directly in VS Code's sidebar. It understands your codebase through AST-aware retrieval, can read and edit files autonomously via tool calling, and keeps a persistent, multi-threaded chat history — all without leaving the editor.

## Features

- **Codebase-aware chat** — Retrieval-augmented generation (RAG) using Tree-sitter AST chunking, local embeddings, and a LanceDB vector store, so answers are grounded in your actual code rather than guesses.
- **Agentic tool use** — The assistant can read files, list directories, inspect AST nodes, and make precise, targeted edits (rather than blind full-file rewrites) using a structured tool-calling loop.
- **Streaming responses** — Real-time token streaming over SSE, with a working Stop button that actually interrupts generation mid-stream.
- **Multi-chat management** — Create, fork, rename, search, and delete chat threads, each persisted independently to disk.
- **Message-level controls** — Regenerate, edit, and fork from any point in a conversation; per-message copy buttons for both text and code blocks.
- **@file mentions** — Reference any workspace file inline (`@filename`) and its full content is automatically attached to your message.
- **Terminal command execution** — AI-suggested terminal commands are rendered with a one-click "Run" button that executes them in an integrated VS Code terminal.
- **Dark / light theme** — Full theming support via CSS custom properties, with an animated toggle.
- **Markdown + syntax highlighting** — Responses render as formatted Markdown with syntax-highlighted code blocks.
- **Chat export** — Export full chat history to JSON for backup or sharing.

## Tech Stack

| Layer | Technology |
|---|---|
| Extension host | VS Code Extension API, Webview |
| LLM completions | [OpenRouter](https://openrouter.ai/) API |
| Code parsing | [web-tree-sitter](https://github.com/tree-sitter/tree-sitter) (AST-based chunking) |
| Embeddings | [@xenova/transformers](https://github.com/xenova/transformers.js) (all-MiniLM-L6-v2, runs locally) |
| Vector store | [LanceDB](https://lancedb.com/) |
| Markdown rendering | [marked](https://github.com/markedjs/marked) + [marked-highlight](https://github.com/markedjs/marked-highlight) + [highlight.js](https://highlightjs.org/) |
| Fuzzy text matching | Custom Levenshtein-distance implementation |

## How It Works

1. **Indexing** — Running the indexer parses your workspace with Tree-sitter, chunks code by function/AST node, generates embeddings locally, and stores them in a LanceDB vector database.
2. **Retrieval** — When you ask a question, relevant code chunks are retrieved via similarity search and injected into the prompt as context — only when needed, to avoid unnecessary noise.
3. **Agentic editing** — For code changes, the assistant inspects the AST first (`getASTTree`, `findNodeTypes`), previews the change, then applies precise edits (`editFile`, `insertBeforeNode`, `nodeDelete`) rather than rewriting whole files.
4. **Streaming** — Responses stream token-by-token over Server-Sent Events, with an abort-safe stop mechanism.

## Dependencies

**Runtime dependencies:**

| Package | Purpose |
|---|---|
| `@lancedb/lancedb` | Vector database for RAG storage and similarity search |
| `@xenova/transformers` | Local embedding generation (all-MiniLM-L6-v2) |
| `apache-arrow` | Columnar data format required by LanceDB |
| `dotenv` | Loads environment variables (API keys) from `.env` |
| `highlight.js` | Syntax highlighting for code blocks |
| `marked` | Markdown parsing and rendering |
| `marked-highlight` | Bridges `marked` with `highlight.js` |
| `tree-sitter-cpp` | Tree-sitter grammar for C++ parsing |
| `tree-sitter-javascript` | Tree-sitter grammar for JavaScript parsing |
| `tree-sitter-python` | Tree-sitter grammar for Python parsing |
| `web-tree-sitter` | Core Tree-sitter WASM bindings for AST parsing |

**Development dependencies:**

| Package | Purpose |
|---|---|
| `@eslint/js` | ESLint's core JS rule set |
| `@types/mocha` | TypeScript types for Mocha (test IntelliSense) |
| `@types/node` | TypeScript types for Node.js APIs |
| `@types/vscode` | TypeScript types for the VS Code Extension API |
| `@vscode/test-cli` | CLI test runner for VS Code extensions |
| `@vscode/test-electron` | Downloads and runs VS Code for extension testing |
| `eslint` | Linting |
| `globals` | Predefined global variables for ESLint environments |

All dependencies install automatically via `npm install` — no manual installation of individual packages is needed.

## Setup

**Prerequisites:** Node.js (v18+) and VS Code installed.

1. Clone the repo and install dependencies:
```bash
   npm install
```

2. Create a `.env` file in the project root with your OpenRouter API key:
API_KEY=your_key_here

3. Build the RAG index for your workspace:
```bash
   node index.js
```
   > **Note:** Re-run this command whenever you make significant changes to the codebase you're indexing, so the assistant's search results stay accurate and up to date. It doesn't need to be re-run for every small edit — just after meaningful batches of changes.

4. Press `F5` in VS Code to launch the extension in a new Extension Development Host window.

5. Open the chat panel from the activity bar icon and start chatting.

## Known Limitations

- No `.vsix` packaging yet — currently run only via the Extension Development Host.

## License

MIT — see [LICENSE](./LICENSE) for details.