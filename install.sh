#!/bin/bash
set -e

REPO="Michaelliv/cc-dejavu"
INSTALL_DIR="/usr/local/bin"

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
  INSTALL_DIR="$HOME/bin"
else
  BINARY="deja-${OS}-${ARCH}"
fi

echo "Downloading deja for ${OS}/${ARCH}..."

# Download
URL="https://github.com/${REPO}/releases/latest/download/${BINARY}"
curl -fsSL "$URL" -o deja

# Install
chmod +x deja
if [ -w "$INSTALL_DIR" ]; then
  mv deja "$INSTALL_DIR/deja"
else
  echo "Installing to $INSTALL_DIR (requires sudo)..."
  sudo mv deja "$INSTALL_DIR/deja"
fi

echo "Installed deja to $INSTALL_DIR/deja"
echo "Run 'deja onboard' to set up Claude integration"
