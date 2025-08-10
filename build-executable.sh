#!/bin/bash

# Task-Killer Executable Builder
# Tạo file executable để cài vào /usr/local/bin

set -e

echo "🎯 Building Task-Killer Executable..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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

echo -e "${CYAN}📋 Detected OS: $OS${NC}"

# Install dependencies
echo -e "${CYAN}📦 Installing dependencies...${NC}"
npm install

# Compile TypeScript first
echo -e "${CYAN}🔧 Compiling TypeScript...${NC}"
npm run build || echo "Warning: TypeScript compilation had issues"

# Create executable using different methods
METHOD="pkg"  # Can be "nexe" or "pkg" or "bundle"

if [[ "$METHOD" == "nexe" ]]; then
    # Method 1: Using nexe (recommended)
    echo -e "${CYAN}🔨 Building with nexe...${NC}"
    
    # Install nexe if not present
    if ! command -v nexe &> /dev/null; then
        echo -e "${YELLOW}Installing nexe...${NC}"
        npm install -g nexe
    fi
    
    # Build executable with build flag to create missing prebuilt
    nexe src/index-simple.ts -o task-killer$EXT --target node-18.0.0-$OS-x64 --build
    
elif [[ "$METHOD" == "pkg" ]]; then
    # Method 2: Using pkg
    echo -e "${CYAN}🔨 Building with pkg...${NC}"
    npm run pkg-build
    
else
    # Method 3: Simple bundle script
    echo -e "${CYAN}🔨 Creating bundle script...${NC}"
    
    cat > task-killer$EXT << 'EOF'
#!/usr/bin/env node

// Task-Killer Executable Bundle
const path = require('path');
const os = require('os');
const fs = require('fs');

// Setup config directory
const homeDir = os.homedir();
const configDir = path.join(homeDir, '.task-killer');

if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    
    // Create default .env
    const envContent = `# Task-Killer Configuration
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite:./tasks.db
ENABLE_NOTIFICATIONS=true
`;
    fs.writeFileSync(path.join(configDir, '.env'), envContent);
    console.log('📝 Created config at:', path.join(configDir, '.env'));
    console.log('⚠️  Please edit .env and add your GEMINI_API_KEY');
    console.log('🔗 Get API key: https://makersuite.google.com/app/apikey');
}

// Change to config directory
process.chdir(configDir);

// Load environment
require('dotenv').config({ path: path.join(configDir, '.env') });

// Register TypeScript loader
require('tsx/cjs').register();

// Start the application
EOF
    
    # Get the absolute path to the source file
    CURRENT_DIR=$(pwd)
    echo "require('$CURRENT_DIR/src/index-simple.ts');" >> task-killer$EXT
    
    chmod +x task-killer$EXT
fi

if [[ -f "task-killer$EXT" ]]; then
    echo -e "${GREEN}✅ Executable created: task-killer$EXT${NC}"
    
    # Show file info
    ls -lh task-killer$EXT
    
    echo -e "${CYAN}📋 Installation:${NC}"
    echo -e "${YELLOW}1. Test locally:${NC}"
    echo -e "   ./task-killer$EXT"
    echo -e ""
    echo -e "${YELLOW}2. Install globally:${NC}"
    echo -e "   sudo cp task-killer$EXT /usr/local/bin/task-killer"
    echo -e "   sudo chmod +x /usr/local/bin/task-killer"
    echo -e ""
    echo -e "${YELLOW}3. Use anywhere:${NC}"
    echo -e "   task-killer"
    echo -e ""
    echo -e "${GREEN}🎉 Build complete!${NC}"
    
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi