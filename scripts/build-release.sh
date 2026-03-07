#!/bin/bash
set -e

# Build a signed, notarized release (DMG + ZIP) and create a draft GitHub release.
#
# Required environment variables:
#   APPLE_ID            – Apple ID email
#   APPLE_ID_PASSWORD   – app-specific password
#   APPLE_TEAM_ID       – Apple Developer team ID
#
# Prerequisites:
#   - gh CLI authenticated (gh auth login)
#   - Xcode command line tools installed
#
# Options:
#   --no-release   Skip creating a draft GitHub release (notarize only)
#
# Usage:
#   APPLE_ID=you@example.com APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=XXXXXXXXXX \
#     ./scripts/build-release.sh [--no-release]

SKIP_RELEASE=false
for arg in "$@"; do
  case "$arg" in
    --no-release) SKIP_RELEASE=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Validate required env vars
for var in APPLE_ID APPLE_ID_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!var}" ]; then
    echo "ERROR: $var is not set"
    exit 1
  fi
done

# Check gh is authenticated (only needed for release)
if [ "$SKIP_RELEASE" = false ] && ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
echo "==> Building Itsyconnect v$VERSION"
echo ""

step_start() { STEP_START=$SECONDS; echo "==> $1..."; }
step_done() { echo "    done in $(( SECONDS - STEP_START ))s"; echo ""; }

step_start "Cleaning previous build artifacts"
rm -rf out/
step_done

step_start "Compiling Electron TypeScript"
npm run electron:compile
step_done

step_start "Building Next.js"
npx next build
step_done

step_start "Preparing standalone bundle"
npm run electron:prepare
step_done

step_start "Making DMG + ZIP (signing + notarizing)"
npx electron-forge make
step_done

# Find outputs and rename DMG to stable filename for /releases/latest/download/Itsyconnect.dmg
# Prefer artifacts matching the current version to avoid picking stale files from previous builds.
ORIG_DMG=$(find out/make -name "*${VERSION}*.dmg" -type f | head -1)
ZIP_PATH=$(find out/make -name "*-${VERSION}.zip" -type f | head -1)

# Fallbacks for unusual maker naming patterns
if [ -z "$ORIG_DMG" ]; then
  ORIG_DMG=$(find out/make -name "*.dmg" -type f | head -1)
fi
if [ -z "$ZIP_PATH" ]; then
  ZIP_PATH=$(find out/make -name "*.zip" -type f | head -1)
fi

if [ -z "$ORIG_DMG" ]; then
  echo "ERROR: DMG not found in out/make/"
  exit 1
fi
if [ -z "$ZIP_PATH" ]; then
  echo "ERROR: ZIP not found in out/make/"
  exit 1
fi

DMG_PATH="$(dirname "$ORIG_DMG")/Itsyconnect.dmg"
mv "$ORIG_DMG" "$DMG_PATH"

DMG_SHA=$(shasum -a 256 "$DMG_PATH" | cut -d' ' -f1)

echo "==> Build complete!"
echo "    DMG: $DMG_PATH ($(du -h "$DMG_PATH" | cut -f1 | xargs))"
echo "    ZIP: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1 | xargs))"
echo "    SHA256 (DMG): $DMG_SHA"
echo ""

if [ "$SKIP_RELEASE" = false ]; then
  step_start "Creating draft GitHub release v$VERSION"
  gh release create "v$VERSION" "$DMG_PATH" "$ZIP_PATH" \
    --title "v$VERSION" \
    --draft \
    --generate-notes
  step_done
fi

TOTAL=$(( SECONDS ))
echo "==> All done in $(( TOTAL / 60 ))m $(( TOTAL % 60 ))s"
if [ "$SKIP_RELEASE" = false ]; then
  echo "    Review the draft release on GitHub, then publish it."
  echo "    https://github.com/nickustinov/itsyconnect-macos/releases"
else
  echo "    GitHub release skipped (--no-release)."
fi
