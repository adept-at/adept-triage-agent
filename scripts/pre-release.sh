#!/bin/bash

# Pre-release script to ensure dist/ is up-to-date
# Run this before creating a release tag

set -e

echo "🔍 Pre-release checks..."

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
  git status --short
  exit 1
fi

echo "📦 Building and packaging..."
npm run all

# Check if dist/ changed
if [ -n "$(git status --porcelain dist/)" ]; then
  echo "⚠️  dist/ files were updated during build"
  echo "📝 Committing updated dist files..."
  
  git add dist/
  git commit -m "build: update dist files for release"
  
  echo "✅ dist/ files updated and committed"
  echo ""
  echo "⚠️  IMPORTANT: Push this commit before creating the release tag!"
  echo "   git push origin main"
  echo ""
else
  echo "✅ dist/ files are up-to-date"
fi

echo ""
echo "🎉 Ready for release! Next steps:"
echo "1. Push any new commits: git push origin main"
echo "2. Create and push tag: git tag v<VERSION> && git push origin v<VERSION>"
echo ""
echo "Example:"
echo "  git tag v1.6.4"
echo "  git push origin v1.6.4"
