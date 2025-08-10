#!/bin/bash

echo "🧠 Installing Smart Task-Killer (Fixed Version)..."

# Get the current directory (where the executable is)
CURRENT_DIR="$(pwd)"
EXECUTABLE="task-killer-smart"

if [ ! -f "$EXECUTABLE" ]; then
    echo "❌ $EXECUTABLE not found in current directory"
    exit 1
fi

# Check if running as root for system install
if [ "$EUID" -eq 0 ]; then
    INSTALL_DIR="/usr/local/bin"
    echo "📦 Installing system-wide to $INSTALL_DIR"
else
    INSTALL_DIR="$HOME/.local/bin"
    echo "📦 Installing for user to $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
fi

# Copy executable
cp "$EXECUTABLE" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/$EXECUTABLE"

echo "✅ Installed: $INSTALL_DIR/$EXECUTABLE"

# Add to PATH if needed
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo "⚠️  Add to your PATH by adding this to ~/.bashrc or ~/.zshrc:"
    echo "export PATH=\"$INSTALL_DIR:\$PATH\""
fi

echo ""
echo "🎉 Installation complete!"
echo "🚀 Run: task-killer-smart"
echo ""
echo "📝 Note: The executable references the project files at:"
echo "   $CURRENT_DIR"
echo "   Keep this directory intact for the executable to work."
