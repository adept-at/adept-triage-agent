# Release Process

This document outlines the release process for the Adept Triage Agent.

## Automatic Release Process

When you create a release on GitHub, the major version tag is automatically updated:

1. Go to [Releases](https://github.com/adept-at/adept-triage-agent/releases)
2. Click "Draft a new release"
3. Create a tag following semantic versioning (e.g., `v1.3.2`)
4. Publish the release
5. The `update-major-tags.yml` workflow will automatically update the major version tag

## Manual Release Process

If you need to manually update tags:

```bash
# 1. Create and push the version tag
git tag v1.3.2
git push origin v1.3.2

# 2. Update the major version tag
./scripts/update-major-tag.sh v1.3.2
```

## Version Strategy

- **v1.x.x** - Current stable version with backward-compatible changes
- **v2.x.x** - Future version with breaking changes (when needed)

## Consumer Impact

Consumers using different version strategies:

| Version Reference | Gets Updates? | Use Case                              |
| ----------------- | ------------- | ------------------------------------- |
| `@v1`             | ✅ Yes        | Recommended - gets all v1.x.x updates |
| `@v1.3.1`         | ❌ No         | Pin to specific version               |
| `@main`           | ✅ Yes        | Development/testing only              |

## Breaking Changes

If you need to make breaking changes:

1. Release as v2.0.0
2. Update documentation
3. Notify users via release notes
4. Maintain v1 for a deprecation period
