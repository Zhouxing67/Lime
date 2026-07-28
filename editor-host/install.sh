#!/usr/bin/env bash
set -e

HOST_NAME="com.lime.editor"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_DIR="$SCRIPT_DIR"

# ---- Detect OS ----
case "$(uname -s)" in
  Linux*)
    CHROME_NMH="$HOME/.config/google-chrome/NativeMessagingHosts"
    EDGE_NMH="$HOME/.config/microsoft-edge/NativeMessagingHosts"
    CHROMIUM_NMH="$HOME/.config/chromium/NativeMessagingHosts"
    ;;
  Darwin*)
    CHROME_NMH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    EDGE_NMH="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    CHROMIUM_NMH="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    ;;
  *)
    echo "Unsupported OS. Please install manually." >&2
    exit 1
    ;;
esac

# ---- Read extension ID ----
EXT_ID="$1"

if [ -z "$EXT_ID" ]; then
  echo "Usage: install.sh <extension-id>"
  echo ""
  echo "  To find your extension ID:"
  echo "  1. Run 'npm run build' or 'npm run dev'"
  echo "  2. Open chrome://extensions (Developer mode ON)"
  echo "  3. Copy the ID shown under the Lime extension card"
  echo "  4. Re-run: ./install.sh <id>"
  echo ""
  echo "  Or pass 'dev' to use a common dev ID (chrome-extension://ibjgmadch...)":
  exit 1
fi

# ---- Generate manifest ----
HOST_BIN="$HOST_DIR/host.js"
MANIFEST=$(cat "$HOST_DIR/com.lime.editor.json" \
  | sed "s|HOST_PATH_PLACEHOLDER|$HOST_BIN|" \
  | sed "s|\"ALLOWED_ORIGINS_PLACEHOLDER\"|\"chrome-extension://$EXT_ID\"|")

# ---- Install to browser NMH dirs ----
install_manifest() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  echo "$MANIFEST" > "$target_dir/$HOST_NAME.json"
  echo "  ✓ $target_dir/$HOST_NAME.json"
}

for NMH in "$CHROME_NMH" "$EDGE_NMH" "$CHROMIUM_NMH"; do
  install_manifest "$NMH"
done

# ---- Copy host.js to stable location ----
INSTALL_DIR="$HOME/.lime/editor-host"
mkdir -p "$INSTALL_DIR"
cp "$HOST_DIR/host.js" "$INSTALL_DIR/host.js"

# Update manifest to point to the installed copy
for NMH in "$CHROME_NMH" "$EDGE_NMH" "$CHROMIUM_NMH"; do
  if [ -f "$NMH/$HOST_NAME.json" ]; then
    sed -i "s|$HOST_BIN|$INSTALL_DIR/host.js|" "$NMH/$HOST_NAME.json" 2>/dev/null || \
    sed -i '' "s|$HOST_BIN|$INSTALL_DIR/host.js|" "$NMH/$HOST_NAME.json"
    echo "  ↻ updated path to $INSTALL_DIR/host.js"
  fi
done

echo ""
echo "✓ Native host installed. Restart Chrome/Edge and test via Settings > Extensions > Lime > Settings."
