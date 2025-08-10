#!/bin/bash

# Task-Killer Installer
# Install Task-Killer to /usr/local/bin

set -e

echo "🎯 Task-Killer Installer"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Check if running as root for global install
if [[ $EUID -ne 0 ]] && [[ "$1" != "--local" ]]; then
    echo -e "${YELLOW}⚠️  Global install requires sudo. Trying again...${NC}"
    sudo "$0" "$@"
    exit 0
fi

# Build executable if not exists
if [[ ! -f "task-killer" ]]; then
    echo -e "${CYAN}🔨 Building executable...${NC}"
    ./build-executable.sh
fi

if [[ "$1" == "--local" ]]; then
    # Local install (in user's path)
    LOCAL_BIN="$HOME/.local/bin"
    mkdir -p "$LOCAL_BIN"
    
    cp task-killer "$LOCAL_BIN/"
    chmod +x "$LOCAL_BIN/task-killer"
    
    echo -e "${GREEN}✅ Installed to: $LOCAL_BIN/task-killer${NC}"
    
    # Check if ~/.local/bin is in PATH
    if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
        echo -e "${YELLOW}⚠️  Add to your shell profile:${NC}"
        echo -e "   echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
        echo -e "   echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
    fi
    
else
    # Global install
    cp task-killer /usr/local/bin/
    chmod +x /usr/local/bin/task-killer
    
    echo -e "${GREEN}✅ Installed to: /usr/local/bin/task-killer${NC}"
fi

# Test installation
echo -e "${CYAN}🧪 Testing installation...${NC}"
if command -v task-killer &> /dev/null; then
    echo -e "${GREEN}✅ task-killer is now available globally!${NC}"
else
    echo -e "${YELLOW}⚠️  task-killer installed but not in PATH${NC}"
fi

echo -e "${CYAN}📋 Next steps:${NC}"
echo -e "1. ${YELLOW}First run:${NC}"
echo -e "   task-killer"
echo -e ""
echo -e "2. ${YELLOW}Configure:${NC}"
echo -e "   Edit ~/.task-killer/.env"
echo -e "   Add your GEMINI_API_KEY"
echo -e ""
echo -e "3. ${YELLOW}Get API key:${NC}"
echo -e "   https://makersuite.google.com/app/apikey"
echo -e ""
echo -e "${GREEN}🎉 Installation complete!${NC}"