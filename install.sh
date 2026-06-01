#!/usr/bin/env bash
#
# kimi-webbridge bootstrap installer
#
# Usage:
#   curl -fsSL https://cdn.kimi.com/webbridge/install.sh | bash
#   curl -fsSL https://cdn.kimi.com/webbridge/install.sh | bash -s -- -h
#   curl -fsSL https://cdn.kimi.com/webbridge/install.sh | bash -s -- --no-start
#   curl -fsSL https://cdn.kimi.com/webbridge/install.sh | bash -s -- --no-skill
#
# What it does:
#   1. Detect OS/arch (macOS / Linux; arm64 / amd64)
#   2. Resolve latest version from OSS (or honor KIMI_WEBBRIDGE_VERSION)
#   3. Download binary to ~/.kimi-webbridge/bin/kimi-webbridge and chmod +x
#   4. Start the daemon (unless --no-start)
#   5. Install skills to detected AI agent runtimes (unless --no-skill)

set -euo pipefail

# ---------- config ----------

BASE_URL="https://cdn.kimi.com/webbridge"
INSTALL_DIR="$HOME/.kimi-webbridge"
BIN_DIR="$INSTALL_DIR/bin"
BIN_PATH="$BIN_DIR/kimi-webbridge"

# ---------- output ----------

if [ -t 1 ]; then
  B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else
  B=""; G=""; Y=""; R=""; N=""
fi

info() { printf "%s==>%s %s\n" "$B" "$N" "$*"; }
ok()   { printf "%s✓%s %s\n" "$G" "$N" "$*"; }
warn() { printf "%s!%s %s\n" "$Y" "$N" "$*" >&2; }
err()  { printf "%s✗%s %s\n" "$R" "$N" "$*" >&2; }

show_help() {
  cat <<EOF
kimi-webbridge bootstrap installer

Usage:
  curl -fsSL $BASE_URL/install.sh | bash                                  # latest
  curl -fsSL $BASE_URL/install.sh | bash -s -- --no-start                 # skip daemon start
  curl -fsSL $BASE_URL/install.sh | bash -s -- --no-skill                 # skip skill install
  KIMI_WEBBRIDGE_VERSION=v0.3.0 curl -fsSL $BASE_URL/install.sh | bash    # pin specific version

Options:
  -h, --help       Show this help.
  --no-start       Install binary and skills, but don't start the daemon.
  --no-skill       Install binary and start the daemon, but skip skill installation.

What it does:
  1. Detect OS/arch (macOS / Linux; arm64 / amd64)
  2. Download kimi-webbridge binary from OSS to $BIN_PATH
  3. Start the daemon (unless --no-start)
  4. Install skills to detected AI-agent runtimes (unless --no-skill)

Environment:
  KIMI_WEBBRIDGE_VERSION   Pin to a specific version (e.g. v0.3.0; default: latest from OSS).
EOF
}

# ---------- args ----------

NO_START=0
NO_SKILL=0
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)   show_help; exit 0 ;;
    --no-start)  NO_START=1; shift ;;
    --no-skill)  NO_SKILL=1; shift ;;
    *) err "unknown option: $1"; echo; show_help >&2; exit 2 ;;
  esac
done

# ---------- prerequisites ----------

for cmd in curl mktemp uname; do
  command -v "$cmd" >/dev/null 2>&1 || { err "required command not found: $cmd"; exit 1; }
done

# ---------- detect OS/arch ----------

info "Detecting OS/arch..."
case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *) err "unsupported OS: $(uname -s). Supported: macOS, Linux."; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="amd64" ;;
  *) err "unsupported arch: $(uname -m). Supported: arm64, amd64."; exit 1 ;;
esac

PLATFORM="$OS-$ARCH"
ok "Platform: $PLATFORM"

# ---------- resolve version ----------

# Version-first OSS layout: 'latest' is itself a directory with the current
# release's contents, so we can address it by name without a text-file
# indirection. Users can still pin a specific version via env var.
VERSION="${KIMI_WEBBRIDGE_VERSION:-latest}"
ok "Version: $VERSION"

# ---------- download binary ----------

BIN_URL="$BASE_URL/$VERSION/releases/kimi-webbridge-$PLATFORM"
info "Downloading binary from $BIN_URL"
mkdir -p "$BIN_DIR"
TMP_BIN=$(mktemp "${TMPDIR:-/tmp}/kimi-webbridge.XXXXXX")
if ! curl -fsSL --retry 3 --connect-timeout 10 -o "$TMP_BIN" "$BIN_URL"; then
  err "failed to download binary"
  rm -f "$TMP_BIN"
  exit 1
fi
mv "$TMP_BIN" "$BIN_PATH"
chmod +x "$BIN_PATH"
ok "Installed to $BIN_PATH"

# ---------- start daemon ----------

if [ "$NO_START" -eq 0 ]; then
  info "Starting daemon..."
  if "$BIN_PATH" start; then
    ok "Daemon started"
  else
    warn "Daemon failed to start — check logs at $INSTALL_DIR/logs/daemon.log"
  fi
else
  info "Skipping daemon start (--no-start)"
fi

# ---------- install skill ----------

if [ "$NO_SKILL" -eq 0 ]; then
  info "Installing skills..."
  if "$BIN_PATH" install-skill -y; then
    ok "Skills installed"
  else
    warn "Some skill installations failed"
  fi
else
  info "Skipping skill install (--no-skill)"
fi

printf "\n%sDone.%s Check status anytime: %skimi-webbridge status%s\n\n" "$G" "$N" "$B" "$N"
