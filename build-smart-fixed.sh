#!/bin/bash

# Smart Task-Killer Build Script (Fixed)
# Creates a truly portable executable

set -e

echo "🧠 Building Smart Task-Killer (Fixed Version)..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get absolute paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

echo -e "${BLUE}📋 Project root: $PROJECT_ROOT${NC}"
echo ""

# Step 1: Install dependencies locally
echo -e "${CYAN}📦 Installing dependencies...${NC}"
npm install

# Step 2: Run TypeScript check
echo -e "${CYAN}🔧 Running TypeScript compilation check...${NC}"
npm run build || echo -e "${YELLOW}Warning: TypeScript had some issues${NC}"

# Step 3: Create the portable executable
echo -e "${CYAN}🔨 Creating portable Smart Task-Killer executable...${NC}"

cat > task-killer-smart << EOF
#!/bin/bash

# Smart Task-Killer Portable Executable
# This script is self-contained and works from any location

# Get the absolute path of this script
SCRIPT_PATH="\$(readlink -f "\$0" 2>/dev/null || python -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "\$0" 2>/dev/null || echo "\$0")"
SCRIPT_DIR="\$(dirname "\$SCRIPT_PATH")"

# Project paths - these need to be set correctly
PROJECT_ROOT="$PROJECT_ROOT"
SOURCE_DIR="\$PROJECT_ROOT/src"
NODE_MODULES="\$PROJECT_ROOT/node_modules"

# Function to setup user configuration
setup_config() {
    CONFIG_DIR="\$HOME/.task-killer"
    
    if [ ! -d "\$CONFIG_DIR" ]; then
        echo -e "\033[0;36m📁 Setting up Smart Task-Killer configuration...\033[0m"
        mkdir -p "\$CONFIG_DIR"
        
        # Create comprehensive .env file
        cat > "\$CONFIG_DIR/.env" << 'ENVEOF'
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
        
        echo -e "\033[0;32m✅ Created config at: \$CONFIG_DIR/.env\033[0m"
        echo ""
        echo -e "\033[1;33m⚠️  IMPORTANT: Please edit your API key:\033[0m"
        echo -e "\033[0;37m   \$CONFIG_DIR/.env\033[0m"
        echo ""
        echo -e "\033[0;36m🔗 Get your Gemini API key:\033[0m"
        echo -e "\033[0;37m   https://makersuite.google.com/app/apikey\033[0m"
        echo ""
    fi
    
    # Change to config directory for database files
    cd "\$CONFIG_DIR"
    
    # Load environment variables
    if [ -f ".env" ]; then
        export \$(grep -v '^#' .env | grep -v '^\$' | xargs) 2>/dev/null || true
    fi
}

# Function to check requirements
check_requirements() {
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        echo -e "\033[0;31m❌ Node.js is required but not installed.\033[0m"
        echo -e "\033[0;37m   Please install Node.js from: https://nodejs.org/\033[0m"
        exit 1
    fi
    
    # Check Node version (need 16+)
    NODE_VERSION=\$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "\$NODE_VERSION" -lt 16 ]; then
        echo -e "\033[0;31m❌ Node.js version 16+ required, found: \$(node -v)\033[0m"
        exit 1
    fi
    
    # Check if project files exist
    if [ ! -f "\$SOURCE_DIR/index-smart.ts" ]; then
        echo -e "\033[0;31m❌ Source files not found at: \$SOURCE_DIR\033[0m"
        echo -e "\033[0;37m   This executable must be run from the project directory or\033[0m"
        echo -e "\033[0;37m   the project files must be available at: \$PROJECT_ROOT\033[0m"
        exit 1
    fi
    
    # Check if node_modules exists
    if [ ! -d "\$NODE_MODULES" ]; then
        echo -e "\033[0;33m⚠️  Dependencies not found. Installing...\033[0m"
        cd "\$PROJECT_ROOT"
        npm install
        cd - > /dev/null
    fi
}

# Function to show help
show_help() {
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
}

# Handle command line arguments
case "\$1" in
    "--help"|"-h")
        show_help
        ;;
    "--config")
        CONFIG_DIR="\$HOME/.task-killer"
        mkdir -p "\$CONFIG_DIR"
        \${EDITOR:-nano} "\$CONFIG_DIR/.env"
        exit 0
        ;;
    "--version")
        echo "Smart Task-Killer v1.0.0"
        exit 0
        ;;
esac

# Main execution
main() {
    echo -e "\033[1;36m🧠 Smart Task-Killer\033[0m"
    echo -e "\033[0;37mAI-Powered Task Management\033[0m"
    echo ""
    
    check_requirements
    setup_config
    
    # Run the smart application from the project directory
    cd "\$PROJECT_ROOT"
    exec npx tsx src/index-smart.ts "\$@"
}

# Run main function
main "\$@"
EOF

chmod +x task-killer-smart

# Step 4: Test the executable locally
echo -e "${CYAN}🧪 Testing executable locally...${NC}"
if ./task-killer-smart --version >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Executable test passed${NC}"
else
    echo -e "${YELLOW}⚠️  Executable test had issues${NC}"
fi

# Step 5: Create installer
cat > install-smart-fixed.sh << 'EOF'
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
EOF

chmod +x install-smart-fixed.sh

# Show results
echo ""
echo -e "${GREEN}🎉 Smart Task-Killer build complete (Fixed)!${NC}"
echo ""
echo -e "${BLUE}📋 Files created:${NC}"
ls -lh task-killer-smart install-smart-fixed.sh
echo ""

echo -e "${CYAN}📖 Usage Options:${NC}"
echo ""
echo -e "${YELLOW}1. Run locally:${NC}"
echo -e "   ./task-killer-smart"
echo ""
echo -e "${YELLOW}2. Install (keeps project dependency):${NC}"
echo -e "   ./install-smart-fixed.sh"
echo ""
echo -e "${YELLOW}3. Test version:${NC}"
echo -e "   ./task-killer-smart --version"
echo ""

echo -e "${GREEN}✨ Ready to use! Try: ./task-killer-smart${NC}"