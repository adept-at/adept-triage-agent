# Release Process

This document describes the optimized release process for the adept-triage-agent.

## Overview

Our release process separates testing from publishing:
- **Testing** happens automatically when code is pushed to main
- **Releasing** only handles packaging and publishing artifacts

This eliminates duplicate work and reduces release time from ~5 minutes to ~2 minutes.

## Release Workflow

### Option 1: GitHub UI (Recommended)

1. Ensure all changes are merged to main and tests have passed
2. Go to [Releases](https://github.com/adept-at/adept-triage-agent/releases) page
3. Click "Draft a new release"
4. Create a new tag (e.g., `v1.7.1`) on the main branch
5. Fill in release notes
6. Click "Publish release"
7. The workflow will automatically:
   - Build fresh artifacts
   - Upload them to the release
   - Update major version tags

### Option 2: Command Line

```bash
# 1. Update version in package.json
npm version patch  # or minor/major

# 2. Push changes
git push origin main

# 3. Create and push tag
git tag v1.7.1
git push origin v1.7.1

# 4. Create release via GitHub CLI
gh release create v1.7.1 \
  --title "Release v1.7.1" \
  --notes "Release notes here"
```

### Option 3: Manual Workflow Trigger

1. Go to Actions → Release workflow
2. Click "Run workflow"
3. Enter the tag name (e.g., `v1.7.1`)
4. Click "Run workflow"

## What Happens During Release

1. **No duplicate testing** - Tests already ran when code was pushed to main
2. **Fresh build** - Artifacts are built specifically for the release
3. **Automatic tagging** - Major version tags (e.g., `v1`) are updated automatically
4. **Asset upload** - The packaged action is attached to the release

## Benefits of This Approach

- ✅ **No duplicate work** - Tests run once, builds run once
- ✅ **Faster releases** - ~60% reduction in release time
- ✅ **Clearer separation** - Testing vs releasing are distinct phases
- ✅ **More flexible** - Can release from UI, CLI, or API
- ✅ **Safer** - Can't accidentally release untested code

## Comparison with Old Process

### Old Process (Duplicate Work)
```
Push to main → Test + Build
Push tag → Test + Build + Release  ← Duplicate!
Total: 2x tests, 2x builds
```

### New Process (Optimized)
```
Push to main → Test + Build
Create release → Build + Publish
Total: 1x test, 2x builds (one for validation, one for release)
```

## Migration Guide

To migrate to the new release workflow:

1. Replace `.github/workflows/release.yml` with the new version
2. Continue using your normal development workflow
3. Create releases through GitHub UI instead of just pushing tags

The old tag-based trigger can remain as a fallback if needed.
