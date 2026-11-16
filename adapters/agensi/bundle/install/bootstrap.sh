#!/usr/bin/env bash
# GraphCompose AI Flow — first-run setup on macOS and Linux.
# Makes sure Node.js 20+ exists, then hands over to bootstrap.mjs with the same
# arguments. Node is only installed when --install-missing is given.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -p 'process.versions.node.split(".")[0]'
}

install=0
for a in "$@"; do
  [ "$a" = "--install-missing" ] || [ "$a" = "--yes" ] && install=1
done

if [ "$(node_major)" -lt 20 ]; then
  if [ "$install" -ne 1 ]; then
    echo "Node.js 20+ is required. Install it, or re-run with --install-missing:"
    if [ "$(uname)" = "Darwin" ]; then echo "    brew install node@20"; else echo "    https://nodejs.org/en/download"; fi
    exit 1
  fi
  if [ "$(uname)" = "Darwin" ]; then
    brew install node@20 && brew link --overwrite --force node@20
  else
    # Debian's packaged node is usually older than 20, and piping a vendor
    # script into a root shell is not something to do on someone's behalf.
    echo "Install Node.js 20+ for your distribution: https://nodejs.org/en/download/package-manager"
    exit 1
  fi
  if [ "$(node_major)" -lt 20 ]; then echo "Node.js did not install; open a new terminal and retry."; exit 1; fi
fi

exec node "$here/bootstrap.mjs" "$@"
