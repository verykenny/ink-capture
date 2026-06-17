#!/usr/bin/env bash
#
# One-command dev bootstrap for ink-capture.
#
# Prerequisites (installed separately — see README "Getting Started"):
#   - Homebrew, then `brew bundle` (watchman, nvm, zulu@17 from the Brewfile)
#   - Xcode + an iOS Simulator runtime (for iOS)
#   - Android Studio with the SDK/NDK (for Android)
#
# This script is idempotent: it installs the Node version from .nvmrc, JS deps
# (which installs the Husky git hook via the `prepare` script), and the iOS
# CocoaPods. Re-running it is safe.

set -euo pipefail

cd "$(dirname "$0")/.."
echo "==> ink-capture setup (running in $(pwd))"

# 1. Node (version pinned in .nvmrc) via nvm.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
elif command -v brew >/dev/null 2>&1 && [ -s "$(brew --prefix nvm 2>/dev/null)/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$(brew --prefix nvm)/nvm.sh"
else
  echo "ERROR: nvm not found. Run 'brew bundle' first, then ensure nvm is sourced in your shell." >&2
  exit 1
fi

echo "==> Installing/using Node from .nvmrc"
nvm install   # reads .nvmrc
nvm use       # reads .nvmrc

# 2. JS dependencies — runs the `prepare` script, installing the Husky hook.
echo "==> Installing JS dependencies (npm install)"
npm install

# 3. iOS CocoaPods via Bundler (CocoaPods pinned in the Gemfile).
# Install gems into a project-local path (gitignored vendor/bundle) so no sudo
# is needed against the macOS system Ruby, whose global gem dir is not
# user-writable. Override by exporting BUNDLE_PATH before running.
export BUNDLE_PATH="${BUNDLE_PATH:-vendor/bundle}"
if command -v bundle >/dev/null 2>&1; then
  echo "==> Installing CocoaPods (bundle install --> $BUNDLE_PATH)"
  bundle install
  echo "==> Installing iOS pods (pod install)"
  bundle exec pod install --project-directory=ios
else
  echo "WARNING: Bundler not found — skipping iOS pod install."
  echo "         Install Ruby + Bundler, then run:"
  echo "           bundle install && bundle exec pod install --project-directory=ios"
fi

cat <<'EOF'

==> Setup complete.

Next steps:
  npm start            # start the Metro bundler (in one terminal)
  npm run ios          # build + launch on the iOS Simulator
  npm run android      # build + launch on an Android emulator/device

Sanity-check your environment any time with:
  npx react-native doctor

The Husky pre-commit hook (lint-staged) was installed by `npm install`.
EOF
