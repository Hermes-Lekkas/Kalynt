# Cross-Platform Build Guide for Kalynt

Kalynt relies on native C++ modules (specifically `node-llama-cpp` for AI and `node-pty` for the terminal) which must be compiled specifically for the operating system they run on.

**You cannot build the macOS application from Windows, or vice versa.**

To release Kalynt for Windows, macOS, and Linux simultaneously, you must use a CI/CD system like **GitHub Actions** that can spin up virtual machines for each operating system to build the application in parallel.

## The Solution: GitHub Actions Matrix Build

We use a "Matrix Strategy" to run the build command on three different runners (`windows-latest`, `macos-latest`, `ubuntu-latest`) at the same time.

### 1. Setup GitHub Token

1.  Go to your GitHub Repository Settings.
2.  Navigate to **Secrets and variables** > **Actions**.
3.  Create a **New Repository Secret**:
    *   Name: `GH_TOKEN`
    *   Value: A GitHub Personal Access Token (Classic) with `repo` and `write:packages` permissions.
    *   *Note: GitHub automatically provides a `GITHUB_TOKEN` in actions, but a personal token is often better for triggering subsequent workflows.*

### 2. Create the Workflow File

Create a file at `.github/workflows/release.yml` with the following content. This workflow will automatically run whenever you push a tag starting with `v` (e.g., `v1.0.0`).

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    name: Build (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      # Windows-specific setup (C++ Build Tools)
      - name: Install C++ Build Tools (Windows)
        if: matrix.os == 'windows-latest'
        uses: ilammy/msvc-dev-cmd@v1

      # Linux-specific setup
      - name: Install Dependencies (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libarchive-tools icnsutils graphicsmagick

      - name: Install Dependencies
        run: npm install

      # Build & Publish
      # OBFUSCATE=true enables code protection for the release
      - name: Build and Publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OBFUSCATE: "true"
        run: |
          npm run electron:build:secure
```

### 3. Code Signing (Optional but Recommended)

For professional releases (to avoid "Unknown Publisher" warnings), you need code signing certificates.

1.  **Export your certificates** as base64 strings.
2.  **Add them as Secrets** in GitHub Actions:
    *   `CSC_LINK`: The base64 encoded certificate file (.p12 or .pfx).
    *   `CSC_KEY_PASSWORD`: The password for the certificate.
3.  **Update the workflow** to include these secrets in the `env` section of the Build step.

## Manual Building

If you do not want to use GitHub Actions, you must manually build on each machine:

1.  **For Windows**: Run `npm run build:secure` on a Windows PC.
2.  **For macOS**: Run `npm run build:secure` on a Mac.
3.  **For Linux**: Run `npm run build:secure` on a Linux machine.

You can then manually upload the generated artifacts (file in `apps/desktop/release/`) to a GitHub Release.
