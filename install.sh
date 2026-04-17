#!/usr/bin/env bash
# lpad — EKD Digital Launchpad CLI installer
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/ekddigital/ekd-cli/main/install.sh | bash

set -uo pipefail

EKD_CLI_REPO="${LPAD_CLI_REPO:-ekddigital/ekd-cli}"
EKD_RAW_BASE="https://raw.githubusercontent.com/${EKD_CLI_REPO}/main"
EKD_INSTALL_DIR="${LPAD_INSTALL_DIR:-$HOME/.local/bin}"
EKD_NO_SHELL_HOOK="${LPAD_NO_SHELL_HOOK:-0}"

if command -v curl >/dev/null 2>&1; then
  fetch_file() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch_file() { wget -qO "$2" "$1"; }
else
  echo "ERROR: curl or wget is required." >&2
  exit 1
fi

detect_shell() {
  basename "${SHELL:-/bin/bash}"
}

get_rc_file() {
  case "$(detect_shell)" in
    zsh) echo "$HOME/.zshrc" ;;
    bash) echo "$HOME/.bashrc" ;;
    fish) echo "$HOME/.config/fish/config.fish" ;;
    *) echo "$HOME/.profile" ;;
  esac
}

in_file() {
  grep -qF "$1" "$2" 2>/dev/null
}

echo

echo "Installing lpad (EKD Digital Launchpad CLI)..."
mkdir -p "$EKD_INSTALL_DIR"

TMP_BIN=$(mktemp)
fetch_file "${EKD_RAW_BASE}/bin/lpad.js" "$TMP_BIN" || {
  rm -f "$TMP_BIN"
  echo "ERROR: failed to download lpad binary." >&2
  exit 1
}

chmod +x "$TMP_BIN"
mv "$TMP_BIN" "${EKD_INSTALL_DIR}/lpad"
echo "OK: installed ${EKD_INSTALL_DIR}/lpad"

if [[ "$EKD_NO_SHELL_HOOK" != "1" ]]; then
  RC_FILE=$(get_rc_file)
  PATH_LINE="export PATH=\"${EKD_INSTALL_DIR}:\$PATH\""

  if ! in_file "$EKD_INSTALL_DIR" "$RC_FILE"; then
    {
      echo ""
      echo "# lpad — EKD Digital Launchpad CLI"
      echo "$PATH_LINE"
    } >> "$RC_FILE"
    echo "OK: added PATH entry to $RC_FILE"
  fi
fi

echo "Done. Run: source $(get_rc_file)"
