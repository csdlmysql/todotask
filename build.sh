#!/bin/bash

# Task-Killer Build Script
# Tạo executable và install vào /usr/local/bin

set -e

echo "🎯 Building Task-Killer..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js không được cài đặt${NC}"
    exit 1
fi

# Kiểm tra npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm không được cài đặt${NC}"
    exit 1
fi

echo -e "${CYAN}📦 Installing dependencies...${NC}"
npm install

echo -e "${CYAN}🔧 Creating standalone executable...${NC}"

# Tạo bundle script với tất cả dependencies
cat > task-killer << 'EOF'
#!/usr/bin/env node

// Task-Killer Executable
// Auto-generated bundle

const fs = require('fs');
const path = require('path');

// Check if running from /usr/local/bin
const isGlobalInstall = __filename.includes('/usr/local/bin');

// Set working directory to home for config files
if (isGlobalInstall) {
    const homeDir = require('os').homedir();
    const configDir = path.join(homeDir, '.task-killer');
    
    // Create config directory if not exists
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Change working directory to config dir
    process.chdir(configDir);
    
    // Create .env file if not exists
    const envPath = path.join(configDir, '.env');
    if (!fs.existsSync(envPath)) {
        const envContent = `# Task-Killer Configuration
# Get your Gemini API key from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Database (SQLite local or PostgreSQL)
DATABASE_URL=sqlite:./tasks.db

# Optional - Telegram Bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Notifications
ENABLE_NOTIFICATIONS=true
`;
        fs.writeFileSync(envPath, envContent);
        console.log(`📝 Created config at: ${envPath}`);
        console.log(`⚠️  Please edit .env file and add your GEMINI_API_KEY`);
    }
}

EOF

# Append the compiled application
echo "
// Application code starts here
require('tsx/cjs').register();
require('./src/index-simple.ts');
" >> task-killer

# Make executable
chmod +x task-killer

echo -e "${GREEN}✅ Executable created: ./task-killer${NC}"

# Test the executable
echo -e "${CYAN}🧪 Testing executable...${NC}"
if ./task-killer --help &> /dev/null; then
    echo -e "${GREEN}✅ Executable works!${NC}"
else
    echo -e "${YELLOW}⚠️  Executable created but may need configuration${NC}"
fi

echo -e "${CYAN}📋 Next steps:${NC}"
echo -e "1. ${YELLOW}Install globally:${NC}"
echo -e "   sudo cp task-killer /usr/local/bin/"
echo -e ""
echo -e "2. ${YELLOW}Configure:${NC}" 
echo -e "   task-killer  # First run will create ~/.task-killer/.env"
echo -e "   nano ~/.task-killer/.env  # Add your GEMINI_API_KEY"
echo -e ""
echo -e "3. ${YELLOW}Use anywhere:${NC}"
echo -e "   task-killer"
echo -e ""
echo -e "${GREEN}🎉 Build complete!${NC}"