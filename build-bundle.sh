#!/bin/bash

# Task-Killer Bundle Script (Simplest Method)
set -e

echo "🎯 Creating Task-Killer Bundle..."

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

# Create the bundle script
cat > task-killer << 'EOF'
#!/usr/bin/env node

// Task-Killer Executable Bundle
const path = require('path');
const os = require('os');
const fs = require('fs');

// Get the directory where the script is located
const scriptDir = path.dirname(require.main.filename);

// Setup config directory in user home
const homeDir = os.homedir();
const configDir = path.join(homeDir, '.task-killer');

if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    
    // Create default .env
    const envContent = `# Task-Killer Configuration
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgresql://localhost:5432/tasks
ENABLE_NOTIFICATIONS=true

# Optional: Telegram Bot (for notifications)
# TELEGRAM_BOT_TOKEN=your_bot_token
# TELEGRAM_CHAT_ID=your_chat_id
`;
    fs.writeFileSync(path.join(configDir, '.env'), envContent);
    console.log('📝 Created config at:', path.join(configDir, '.env'));
    console.log('⚠️  Please edit .env and add your GEMINI_API_KEY');
    console.log('🔗 Get API key: https://makersuite.google.com/app/apikey');
}

// Change to config directory for database files
process.chdir(configDir);

// Load environment from config directory
require('dotenv').config({ path: path.join(configDir, '.env') });

// Register TypeScript loader if available
try {
    require('tsx/cjs').register();
} catch (e) {
    console.warn('TSX not available, trying ts-node...');
    try {
        require('ts-node/register');
    } catch (e2) {
        console.error('Neither tsx nor ts-node available. Please install tsx: npm install -g tsx');
        process.exit(1);
    }
}

// Start the application from the script directory
EOF

# Get the absolute path to the source file
CURRENT_DIR=$(pwd)
echo "require('$CURRENT_DIR/src/index-smart.ts');" >> task-killer

# Make executable
chmod +x task-killer

echo -e "${GREEN}✅ Bundle created: task-killer${NC}"
ls -lh task-killer

echo -e "${CYAN}📋 Usage:${NC}"
echo "  ./task-killer"
echo ""
echo -e "${CYAN}To install globally:${NC}"
echo "  sudo cp task-killer /usr/local/bin/"
echo "  sudo chmod +x /usr/local/bin/task-killer"
echo ""
echo -e "${GREEN}🎉 Bundle complete!${NC}"