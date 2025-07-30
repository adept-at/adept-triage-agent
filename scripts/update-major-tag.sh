#!/bin/bash

# Script to update major version tag after a release
# Usage: ./scripts/update-major-tag.sh v1.3.1

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <version-tag>"
  echo "Example: $0 v1.3.1"
  exit 1
fi

VERSION_TAG=$1
# Extract major version (e.g., v1.3.1 -> v1)
MAJOR_VERSION=$(echo $VERSION_TAG | grep -oE 'v[0-9]+')

echo "Updating $MAJOR_VERSION to point to $VERSION_TAG..."

# Update the major version tag
git tag -fa $MAJOR_VERSION -m "Update $MAJOR_VERSION to $VERSION_TAG"
git push origin $MAJOR_VERSION --force

echo "✅ Successfully updated $MAJOR_VERSION to $VERSION_TAG"
echo ""
echo "Consumers using $MAJOR_VERSION will now get $VERSION_TAG"