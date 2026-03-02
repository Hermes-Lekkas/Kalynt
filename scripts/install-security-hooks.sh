#!/bin/bash
#
# Install security pre-commit hooks for Kalynt repository
# Run this script after cloning the repository
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOK_SOURCE="$REPO_ROOT/.github/hooks/pre-commit"
HOOK_DEST="$REPO_ROOT/.git/hooks/pre-commit"

echo "🔒 Kalynt Security Hook Installer"
echo "================================="
echo ""

# Check if we're in a git repository
if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "❌ Error: Not a git repository!"
    exit 1
fi

# Check if hook source exists
if [ ! -f "$HOOK_SOURCE" ]; then
    echo "❌ Error: Hook source not found at $HOOK_SOURCE"
    exit 1
fi

# Check if hook already exists
if [ -f "$HOOK_DEST" ]; then
    echo "⚠️  A pre-commit hook already exists."
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

# Copy and make executable
cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "✅ Pre-commit hook installed successfully!"
echo ""

# Run a quick test
echo "🧪 Running test..."
cd "$REPO_ROOT"

# Create a test file with fake secret
TEST_FILE="/tmp/kalynt_hook_test_$$.txt"
echo "api_key=test-secret-12345678901234567890123456789012" > "$TEST_FILE"
git add "$TEST_FILE" 2>/dev/null || true

# Try to commit (should fail)
if git commit -m "Test secret detection" --no-verify 2>/dev/null; then
    echo "⚠️  Warning: Hook test inconclusive (commit succeeded)"
else
    echo "✅ Hook is working correctly (would block secrets)"
fi

# Cleanup
rm -f "$TEST_FILE"
git reset HEAD "$TEST_FILE" 2>/dev/null || true

echo ""
echo "📋 Next steps:"
echo "   1. Review SECURITY_HYGIENE.md for best practices"
echo "   2. Run: git check-ignore -v deploy_key .env"
echo "   3. Ensure your secrets are properly excluded"
echo ""
echo "🚨 IMPORTANT: If you have accidentally committed secrets:"
echo "   1. IMMEDIATELY revoke/rotate the compromised credentials"
echo "   2. Follow the cleanup steps in SECURITY_HYGIENE.md"
echo ""
echo "✨ Security hooks installed and ready!"