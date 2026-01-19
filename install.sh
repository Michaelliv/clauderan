#!/bin/bash
set -e

REPO="Michaelliv/cc-dejavu"
INSTALL_DIR="$HOME/.local/bin"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="darwin" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  *) echo "Unsupported OS: $OS" && exit 1 ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac

# Build binary name
if [ "$OS" = "windows" ]; then
  BINARY="deja-windows-x64.exe"
else
  BINARY="deja-${OS}-${ARCH}"
fi

echo "Downloading deja for ${OS}/${ARCH}..."

# Create install dir
mkdir -p "$INSTALL_DIR"

# Download
URL="https://github.com/${REPO}/releases/latest/download/${BINARY}"
curl -fsSL "$URL" -o "$INSTALL_DIR/deja"
chmod +x "$INSTALL_DIR/deja"

echo "Installed deja to $INSTALL_DIR/deja"

# Check if in PATH
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
  echo ""
  echo "Add to your PATH by running:"
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
  echo "  # or for zsh:"
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
fi

echo ""
echo "Run 'deja onboard' to set up Claude integration"
