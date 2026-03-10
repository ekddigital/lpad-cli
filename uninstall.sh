#!/usr/bin/env bash
# ekd CLI uninstaller

set -uo pipefail

EKD_INSTALL_DIR="${EKD_INSTALL_DIR:-$HOME/.local/bin}"
EKD_BIN="${EKD_INSTALL_DIR}/ekd"

if [[ -f "$EKD_BIN" ]]; then
  rm -f "$EKD_BIN"
  echo "OK: removed $EKD_BIN"
else
  echo "WARN: binary not found at $EKD_BIN"
fi

echo "Note: shell rc files are not edited automatically."
