#!/bin/bash

echo "🧠 Installing Smart Task-Killer..."

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
if [ -f "task-killer-smart" ]; then
    cp task-killer-smart "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/task-killer-smart"
    echo "✅ Installed: $INSTALL_DIR/task-killer-smart"
    
    # Add to PATH if needed
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        echo "⚠️  Add to your PATH by adding this to ~/.bashrc or ~/.zshrc:"
        echo "export PATH=\"$INSTALL_DIR:\$PATH\""
    fi
    
    echo ""
    echo "🎉 Installation complete!"
    echo "Run: task-killer-smart"
    
else
    echo "❌ task-killer-smart not found. Run ./build-smart.sh first"
    exit 1
fi
