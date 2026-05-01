#!/bin/bash
# Verify that the repository is ready for release

set -e

echo "🔍 Verifying release readiness..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to check status
check() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ $2${NC}"
  else
    echo -e "${RED}❌ $2${NC}"
    ERRORS=$((ERRORS + 1))
  fi
}

warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  WARNINGS=$((WARNINGS + 1))
}

# 1. Check if we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  warn "Not on main branch (current: $CURRENT_BRANCH)"
fi

# 2. Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}❌ Uncommitted changes detected${NC}"
  git status --short
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ No uncommitted changes${NC}"
fi

# 3. Ensure Node 24 is being used (matches `runs.using: node24` in action.yml
# and the GitHub Actions release workflow at .github/workflows/release.yml).
# Releasing on a different major than the runtime can mask ncc bundling
# issues that only surface on the target runtime.
echo ""
echo "🔧 Setting up Node.js environment..."
if [ -f ~/.nvm/nvm.sh ]; then
  source ~/.nvm/nvm.sh
  nvm use 24
else
  echo "Using system Node.js"
fi

# 4. Ensure dependencies are installed
echo ""
echo "📦 Installing dependencies..."
npm ci

# 5. Run tests
echo ""
echo "🧪 Running tests..."
if npm test; then
  echo -e "${GREEN}✅ All tests passed${NC}"
else
  echo -e "${RED}❌ Tests failed${NC}"
  ERRORS=$((ERRORS + 1))
fi

# 6. Run linter
echo ""
echo "📝 Running linter..."
if npm run lint; then
  echo -e "${GREEN}✅ Linting passed${NC}"
else
  echo -e "${RED}❌ Linting failed${NC}"
  ERRORS=$((ERRORS + 1))
fi

# 7. Build and package
echo ""
echo "🔨 Building and packaging..."
npm run build
npm run package

# 8. Verify dist/index.js is properly bundled
echo ""
echo "🔍 Verifying dist/index.js bundling..."

# Check file size (should be > 1MB if bundled)
if [ -f "dist/index.js" ]; then
  FILE_SIZE=$(wc -c < dist/index.js)
  FILE_SIZE_MB=$((FILE_SIZE / 1048576))
  
  if [ $FILE_SIZE -gt 1000000 ]; then
    echo -e "${GREEN}✅ dist/index.js is properly bundled (${FILE_SIZE_MB}MB)${NC}"
  else
    echo -e "${RED}❌ dist/index.js is too small (${FILE_SIZE} bytes) - not properly bundled!${NC}"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "${RED}❌ dist/index.js not found!${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Check for external requires
if grep -q 'require("@actions/core")' dist/index.js || grep -q "require('@actions/core')" dist/index.js; then
  echo -e "${RED}❌ Found external require() calls in dist/index.js - not properly bundled!${NC}"
  echo "   Run 'npm run package' to bundle with ncc"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ No external require() calls found${NC}"
fi

# 9. Check if dist is up to date
echo ""
echo "🔍 Checking if dist/ needs to be committed..."
if [ -n "$(git diff dist/)" ]; then
  echo -e "${RED}❌ dist/ files have uncommitted changes${NC}"
  echo "   Run: git add dist/ && git commit -m 'chore: update dist files'"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ dist/ files are committed${NC}"
fi

# 10. Check package.json version
echo ""
echo "📋 Checking version..."
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "   Current version: v$CURRENT_VERSION"

# Check if this version tag already exists
if git rev-parse "v$CURRENT_VERSION" >/dev/null 2>&1; then
  warn "Tag v$CURRENT_VERSION already exists. Remember to bump version before release."
fi

# 11. Verify GitHub CLI is installed (for releases)
echo ""
if command -v gh &> /dev/null; then
  echo -e "${GREEN}✅ GitHub CLI is installed${NC}"
else
  warn "GitHub CLI not installed. Install with: brew install gh"
fi

# Summary
echo ""
echo "================================"
echo "📊 Release Readiness Summary"
echo "================================"

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Ready for release.${NC}"
  
  if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}   $WARNINGS warning(s) detected (see above)${NC}"
  fi
  
  echo ""
  echo "📝 Next steps:"
  echo "   1. Bump version: npm version patch/minor/major"
  echo "   2. Push to main: git push origin main"
  echo "   3. Create release via GitHub UI or:"
  echo "      gh release create v$CURRENT_VERSION --title \"Release v$CURRENT_VERSION\" --notes \"Release notes here\""
  
  exit 0
else
  echo -e "${RED}❌ $ERRORS error(s) detected. Fix these before releasing.${NC}"
  
  if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}   Also $WARNINGS warning(s) detected${NC}"
  fi
  
  exit 1
fi
