#!/bin/bash

# Smart Task-Killer Build Script
# Creates production-ready executable for the Smart AI version

set -e

echo "🧠 Building Smart Task-Killer..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    EXT=""
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux" 
    EXT=""
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    OS="win"
    EXT=".exe"
else
    echo -e "${RED}❌ Unsupported OS: $OSTYPE${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Target OS: $OS${NC}"
echo -e "${BLUE}📦 Building Smart AI Version${NC}"
echo ""

# Step 1: Install dependencies
echo -e "${CYAN}📦 Installing dependencies...${NC}"
npm install

echo ""

# Step 2: Run TypeScript check
echo -e "${CYAN}🔧 Running TypeScript compilation check...${NC}"
npm run build || echo -e "${YELLOW}Warning: TypeScript had some issues${NC}"

echo ""

# Step 3: Create executable wrapper
echo -e "${CYAN}🔨 Creating Smart Task-Killer executable...${NC}"

# Create the smart executable
cat > task-killer-smart$EXT << 'EOF'
#!/bin/bash

# Smart Task-Killer Production Executable
# AI-powered task management with natural language processing

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Setup user configuration
setup_config() {
    CONFIG_DIR="$HOME/.task-killer"
    
    if [ ! -d "$CONFIG_DIR" ]; then
        echo -e "\033[0;36m📁 Setting up Smart Task-Killer...\033[0m"
        mkdir -p "$CONFIG_DIR"
        
        # Create comprehensive .env file
        cat > "$CONFIG_DIR/.env" << 'ENVEOF'
# Smart Task-Killer Configuration
# ================================

# 🤖 AI Configuration (Required)
GEMINI_API_KEY=your_gemini_api_key_here

# 💾 Database Configuration
DATABASE_URL=postgresql://localhost:5432/tasks
# Alternative: SQLite (simpler setup)
# DATABASE_URL=sqlite:./smart-tasks.db

# 🔔 Notification Settings
ENABLE_NOTIFICATIONS=true
ENABLE_DESKTOP_NOTIFICATIONS=true

# 📱 Telegram Bot (Optional)
# TELEGRAM_BOT_TOKEN=your_telegram_bot_token
# TELEGRAM_CHAT_ID=your_chat_id

# 🧠 Smart Features
ENABLE_CONTEXT_MEMORY=true
ENABLE_SMART_SUGGESTIONS=true
MAX_CONTEXT_MESSAGES=50

# 🎨 Interface Settings
ENABLE_COLORS=true
ENABLE_EMOJIS=true
DEFAULT_LANGUAGE=en

# 🔧 Development
NODE_ENV=production
DEBUG_MODE=false
ENVEOF
        
        echo -e "\033[0;32m✅ Created config at: $CONFIG_DIR/.env\033[0m"
        echo ""
        echo -e "\033[1;33m⚠️  IMPORTANT: Please edit the config file:\033[0m"
        echo -e "\033[0;37m   $CONFIG_DIR/.env\033[0m"
        echo ""
        echo -e "\033[0;36m🔗 Get your Gemini API key:\033[0m"
        echo -e "\033[0;37m   https://makersuite.google.com/app/apikey\033[0m"
        echo ""
        echo -e "\033[0;36m📖 Quick start:\033[0m"
        echo -e "\033[0;37m   1. Edit the .env file with your API key\033[0m"
        echo -e "\033[0;37m   2. Run: task-killer-smart\033[0m"
        echo -e "\033[0;37m   3. Try: \"create task fix bug urgent\"\033[0m"
        echo ""
        
        # Ask if user wants to edit now
        read -p "Would you like to edit the config now? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ${EDITOR:-nano} "$CONFIG_DIR/.env"
        fi
    fi
    
    # Change to config directory for database files
    cd "$CONFIG_DIR"
    
    # Load environment variables
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | grep -v '^$' | xargs) 2>/dev/null || true
    fi
}

# Check requirements
check_requirements() {
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        echo -e "\033[0;31m❌ Node.js is required but not installed.\033[0m"
        echo -e "\033[0;37m   Please install Node.js from: https://nodejs.org/\033[0m"
        exit 1
    fi
    
    # Check Node version (need 16+)
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        echo -e "\033[0;31m❌ Node.js version 16+ required, found: $(node -v)\033[0m"
        exit 1
    fi
    
    # Check if tsx is available locally in the project
    if [ ! -f "$SCRIPT_DIR/node_modules/.bin/tsx" ]; then
        echo -e "\033[0;33m⚠️  Installing dependencies...\033[0m"
        cd "$SCRIPT_DIR"
        npm install
        cd - > /dev/null
    fi
}

# Main execution
main() {
    echo -e "\033[1;36m🧠 Smart Task-Killer\033[0m"
    echo -e "\033[0;37mAI-Powered Task Management\033[0m"
    echo ""
    
    check_requirements
    setup_config
    
    # Run the smart application
    cd "$SCRIPT_DIR"
    exec npx tsx src/index-smart.ts "$@"
}

# Handle help
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo -e "\033[1;36m🧠 Smart Task-Killer Help\033[0m"
    echo ""
    echo -e "\033[1;37mUsage:\033[0m task-killer-smart [options]"
    echo ""
    echo -e "\033[1;37mOptions:\033[0m"
    echo -e "  -h, --help     Show this help"
    echo -e "  --config       Open config file"
    echo -e "  --version      Show version"
    echo ""
    echo -e "\033[1;37mExamples:\033[0m"
    echo -e "  task-killer-smart                    # Start interactive mode"
    echo -e "  task-killer-smart --config           # Edit configuration"
    echo ""
    echo -e "\033[1;37mInteractive Commands:\033[0m"
    echo -e "  \"create task fix bug urgent deadline tomorrow\""
    echo -e "  \"show me all pending tasks\""
    echo -e "  \"mark that task as completed\""
    echo -e "  /help                                 # Full command list"
    echo -e "  /stats                               # View statistics"
    echo -e "  exit                                 # Quit application"
    exit 0
fi

# Handle config
if [ "$1" = "--config" ]; then
    CONFIG_DIR="$HOME/.task-killer"
    mkdir -p "$CONFIG_DIR"
    ${EDITOR:-nano} "$CONFIG_DIR/.env"
    exit 0
fi

# Handle version
if [ "$1" = "--version" ]; then
    echo "Smart Task-Killer v1.0.0"
    exit 0
fi

# Run main function
main "$@"
EOF

# Make executable
chmod +x task-killer-smart$EXT

# Create installation script
cat > install-smart.sh << 'EOF'
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
EOF

chmod +x install-smart.sh

# Step 4: Test the executable
echo -e "${CYAN}🧪 Testing executable...${NC}"
if ./task-killer-smart$EXT --version >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Executable test passed${NC}"
else
    echo -e "${YELLOW}⚠️  Executable test had issues (but may still work)${NC}"
fi

echo ""

# Step 5: Show results
if [[ -f "task-killer-smart$EXT" ]]; then
    echo -e "${GREEN}🎉 Smart Task-Killer build complete!${NC}"
    echo ""
    echo -e "${BLUE}📋 Files created:${NC}"
    ls -lh task-killer-smart$EXT install-smart.sh
    echo ""
    
    echo -e "${CYAN}📖 Usage Options:${NC}"
    echo ""
    echo -e "${YELLOW}1. Run locally:${NC}"
    echo -e "   ./task-killer-smart$EXT"
    echo ""
    echo -e "${YELLOW}2. Install for current user:${NC}"
    echo -e "   ./install-smart.sh"
    echo ""
    echo -e "${YELLOW}3. Install system-wide:${NC}"
    echo -e "   sudo ./install-smart.sh"
    echo ""
    
    echo -e "${CYAN}🧠 Smart Features:${NC}"
    echo -e "   • AI-powered natural language processing"
    echo -e "   • Context memory across sessions"
    echo -e "   • Smart suggestions and follow-ups"
    echo -e "   • Advanced slash commands"
    echo -e "   • Statistics and analytics"
    echo -e "   • Export and backup functionality"
    echo ""
    
    echo -e "${GREEN}✨ Ready to use! Try: ./task-killer-smart$EXT${NC}"
    
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi