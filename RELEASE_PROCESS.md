# Release Process

This document describes the release process for the adept-triage-agent, including critical bundling requirements.

## ⚠️ CRITICAL: Bundling Requirements

**The #1 cause of release failures is improperly bundled dist files.** 

GitHub Actions uses code from the repository at the release tag, NOT from release assets. Therefore:
- ✅ dist/index.js MUST be properly bundled with all dependencies (~2-3MB file)
- ✅ dist/index.js MUST be committed to the repository BEFORE creating the release
- ✅ The release tag MUST point to a commit with bundled dist files

## Pre-Release Verification

**Always run this before releasing:**

```bash
# Run the automated verification script
./scripts/verify-release-readiness.sh
```

This script checks:
- ✅ All tests pass
- ✅ Linting passes
- ✅ dist/index.js is properly bundled (>1MB)
- ✅ No external require() calls in dist/index.js
- ✅ dist/ files are committed
- ✅ No uncommitted changes

## Release Workflow

### Option 1: GitHub UI (Recommended)

1. **Ensure dist is bundled and committed:**
   ```bash
   npm run all           # Build and bundle
   git add dist/
   git commit -m "chore: update dist files for release"
   git push origin main
   ```

2. **Bump version:**
   ```bash
   npm version patch     # or minor/major
   git push origin main
   ```

3. **Create release via GitHub UI:**
   - Go to [Releases](https://github.com/adept-at/adept-triage-agent/releases)
   - Click "Draft a new release"
   - Create tag matching package.json version (e.g., `v1.7.1`)
   - Target: main branch
   - Write release notes
   - Click "Publish release"

4. **The automated workflow will:**
   - Verify dist files are properly bundled
   - Re-tag if needed to include bundled dist
   - Upload bundled index.js as release asset
   - Update major version tags (e.g., v1)

### Option 2: Command Line

```bash
# 1. Verify release readiness
./scripts/verify-release-readiness.sh

# 2. Bump version
npm version patch  # or minor/major

# 3. Ensure dist is bundled
npm run all
git add dist/
git commit -m "chore: update dist files for v$(node -p "require('./package.json').version")"
git push origin main

# 4. Create release
VERSION=$(node -p "require('./package.json').version")
gh release create v$VERSION \
  --title "Release v$VERSION" \
  --notes "Release notes here" \
  --target main
```

## How the Release Process Works

### 1. Verification Phase
- Builds fresh dist files
- Verifies they're properly bundled (>1MB, no external requires)
- Commits any changes to main if needed
- Ensures the release tag will have bundled code

### 2. Publishing Phase
- Creates/updates the release tag to point to main with bundled dist
- Uploads bundled index.js as a release asset
- Updates major version tags

### 3. Safety Checks
- File size verification (must be >1MB)
- No external require() statements
- Automatic commit of dist changes before tagging

## Common Issues and Solutions

### Issue: "Cannot find module '@actions/core'"
**Cause:** dist/index.js was not bundled with ncc
**Solution:** Run `npm run package` and commit the changes

### Issue: Release has old code
**Cause:** dist files weren't rebuilt before release
**Solution:** Always run `npm run all` before releasing

### Issue: dist/index.js is only ~20KB
**Cause:** Only TypeScript compilation ran, not ncc bundling
**Solution:** Run `npm run package` after `npm run build`

## Local Development

The pre-commit hook automatically handles bundling:
```bash
# .husky/pre-commit runs:
npm run lint
npm run build    # TypeScript compilation
npm run package  # ncc bundling
# Automatically adds dist/ to commit if changed
```

## Rollback Procedure

If a bad release is published:

1. **Delete the bad release:**
   ```bash
   gh release delete v1.7.1 --yes
   ```

2. **Delete the tag:**
   ```bash
   git push origin :refs/tags/v1.7.1
   ```

3. **Fix the issue and re-release**

## Testing a Release Locally

Before releasing, test the action locally:

```bash
# Build and bundle
npm run all

# Test with act (GitHub Actions emulator)
act -j test-action

# Or test in a sample workflow
mkdir -p /tmp/test-action
cp -r dist /tmp/test-action/
cp action.yml /tmp/test-action/
# Create test workflow using /tmp/test-action
```

## Release Checklist

- [ ] All tests passing
- [ ] Linter passing
- [ ] Version bumped in package.json
- [ ] dist/ rebuilt with `npm run all`
- [ ] dist/ changes committed
- [ ] Pushed to main
- [ ] Ran `./scripts/verify-release-readiness.sh`
- [ ] Release notes prepared

## Why Bundling Matters

GitHub Actions works differently than npm packages:
- **npm packages**: Install dependencies at runtime
- **GitHub Actions**: Must include ALL code in the repository

When someone uses `uses: adept-at/adept-triage-agent@v1`, GitHub:
1. Clones the repository at tag v1
2. Runs the code directly from dist/index.js
3. Does NOT install npm dependencies

Therefore, dist/index.js must be self-contained with all dependencies bundled inline.