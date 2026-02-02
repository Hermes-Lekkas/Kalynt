# Kalynt v1.0.1-beta Release Notes

## 🚀 Key Features

### Enhanced Git Integration
A completely rewritten Git experience bringing command-line power to the IDE.
- **Complete Feature Set**: `init`, `status`, `log`, `diff`, `add`, `commit`, `branch`, `checkout`, `reset`, `push`, `pull`, `fetch`, `remote`.
- **Visual Branch Management**: Create, switch, and manage branches directly from the UI.
- **Advanced Diff Viewer**: Syntax-highlighted diffs with side-by-side comparison.
- **Smart Staging**: Stage/unstage individual files or all changes.
- **History & Sync**: View commit history and sync status (ahead/behind counts) with remote.

### Advanced Search & Replace
A professional-grade search engine with powerful refactoring capabilities.
- **Search & Replace**: Find and replace text across single files or the entire workspace.
- **Smart Case Preservation**: Maintains casing (e.g., `fooBar` -> `newBar`, `FOO_BAR` -> `NEW_BAR`) during replacement.
- **Advanced Filters**: Case-sensitive, Whole Word, and Regular Expression support.
- **Search History**: Quick access to recent search queries.
- **Performance**: Virtualized results list for handling thousands of matches without lag.
- **Deep Integration**: Progress indicators, file exclusion patterns (e.g., `node_modules`), and binary file detection.

## 🛡️ Security & Stability Improvements

### Search Security
- **ReDoS Protection**: Implemented guards against Regular Expression Denial of Service attacks.
- **Regex Sanitization**: Safer handling of user-provided regex patterns.

### Bug Fixes
- Fixed `react-window` import issues in `SearchPanel`.
- Resolved TypeScript type safety issues in various components.
- Improved error handling for backend file system operations.
- Fixed `implicit any` types and unused variables to improve code quality.

## 🏗️ Technical Details
- **Backend**: New Electron handlers for `git:init`, `git:discard`, `git:createBranch` etc.
- **Frontend**: Full React rewrite of Git and Search panels using optimized hooks and virtualization.
- **Build System**: Cleaned up build warnings and optimized production builds.
