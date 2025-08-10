#!/bin/bash

# Telegram Bot Setup Script for Smart Task-Killer

set -e

echo "🤖 Smart Task-Killer Telegram Bot Setup"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONFIG_DIR="$HOME/.task-killer"
CONFIG_FILE="$CONFIG_DIR/.env"

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

echo -e "${CYAN}This script will help you set up Telegram integration.${NC}"
echo ""

# Step 1: Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}Creating configuration file...${NC}"
    touch "$CONFIG_FILE"
    echo "# Smart Task-Killer Configuration" > "$CONFIG_FILE"
    echo "GEMINI_API_KEY=your_gemini_api_key_here" >> "$CONFIG_FILE"
    echo "DATABASE_URL=postgresql://localhost:5432/tasks" >> "$CONFIG_FILE"
    echo "" >> "$CONFIG_FILE"
fi

# Step 2: Guide through BotFather setup
echo -e "${CYAN}📋 Step 1: Create Telegram Bot${NC}"
echo ""
echo "1. Open Telegram and search for: @BotFather"
echo "2. Send: /newbot"
echo "3. Choose a name (e.g., 'My Task Killer Bot')"
echo "4. Choose a username ending with 'bot' (e.g., 'mytaskkiller_bot')"
echo ""

read -p "Press Enter when you've created your bot and have the token..."
echo ""

# Get bot token
while true; do
    read -p "📱 Enter your bot token (from BotFather): " BOT_TOKEN
    
    if [ -z "$BOT_TOKEN" ]; then
        echo -e "${RED}❌ Token cannot be empty${NC}"
        continue
    fi
    
    # Validate token format (rough check)
    if [[ ! "$BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
        echo -e "${RED}❌ Invalid token format. Should be like: 123456789:ABCdefGHI...${NC}"
        continue
    fi
    
    echo -e "${GREEN}✅ Token looks valid${NC}"
    break
done

echo ""

# Step 3: Get Chat ID
echo -e "${CYAN}📋 Step 2: Get Your Chat ID${NC}"
echo ""
echo "1. Start a chat with your bot (click the link from BotFather)"
echo "2. Send any message to your bot (e.g., 'hello')"
echo ""

read -p "Press Enter when you've sent a message to your bot..."
echo ""

echo -e "${YELLOW}🔍 Attempting to get your Chat ID...${NC}"

# Try to get chat ID automatically
CHAT_ID_RESPONSE=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/getUpdates")

if echo "$CHAT_ID_RESPONSE" | grep -q '"ok":true'; then
    # Extract chat ID from response
    CHAT_ID=$(echo "$CHAT_ID_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data['result']:
        print(data['result'][-1]['message']['chat']['id'])
    else:
        print('')
except:
    print('')
" 2>/dev/null)
    
    if [ ! -z "$CHAT_ID" ]; then
        echo -e "${GREEN}✅ Found Chat ID: $CHAT_ID${NC}"
    else
        echo -e "${YELLOW}⚠️  Couldn't extract Chat ID automatically${NC}"
        CHAT_ID=""
    fi
else
    echo -e "${RED}❌ Failed to connect to Telegram API. Check your token.${NC}"
    CHAT_ID=""
fi

# If auto-detection failed, ask for manual input
if [ -z "$CHAT_ID" ]; then
    echo ""
    echo "Manual method:"
    echo "1. Visit: https://api.telegram.org/bot$BOT_TOKEN/getUpdates"
    echo "2. Find your chat ID in the JSON response"
    echo ""
    
    while true; do
        read -p "📱 Enter your Chat ID (number): " CHAT_ID
        
        if [ -z "$CHAT_ID" ]; then
            echo -e "${RED}❌ Chat ID cannot be empty${NC}"
            continue
        fi
        
        # Validate chat ID (should be a number)
        if ! [[ "$CHAT_ID" =~ ^-?[0-9]+$ ]]; then
            echo -e "${RED}❌ Chat ID should be a number${NC}"
            continue
        fi
        
        echo -e "${GREEN}✅ Chat ID looks valid${NC}"
        break
    done
fi

echo ""

# Step 4: Update config file
echo -e "${CYAN}📋 Step 3: Updating Configuration${NC}"

# Check if Telegram config already exists
if grep -q "TELEGRAM_BOT_TOKEN" "$CONFIG_FILE"; then
    # Update existing values
    sed -i.bak "s/TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$BOT_TOKEN/" "$CONFIG_FILE"
    sed -i.bak "s/TELEGRAM_CHAT_ID=.*/TELEGRAM_CHAT_ID=$CHAT_ID/" "$CONFIG_FILE"
    rm -f "$CONFIG_FILE.bak"
else
    # Add new values
    echo "" >> "$CONFIG_FILE"
    echo "# Telegram Bot Configuration" >> "$CONFIG_FILE"
    echo "TELEGRAM_BOT_TOKEN=$BOT_TOKEN" >> "$CONFIG_FILE"
    echo "TELEGRAM_CHAT_ID=$CHAT_ID" >> "$CONFIG_FILE"
fi

echo -e "${GREEN}✅ Configuration updated${NC}"
echo ""

# Step 5: Test the bot
echo -e "${CYAN}📋 Step 4: Testing Bot Connection${NC}"

echo -e "${YELLOW}🧪 Testing bot connection...${NC}"

TEST_RESPONSE=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/getMe")

if echo "$TEST_RESPONSE" | grep -q '"ok":true'; then
    BOT_USERNAME=$(echo "$TEST_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data['result']['username'])
except:
    print('Unknown')
" 2>/dev/null)
    
    echo -e "${GREEN}✅ Bot connection successful!${NC}"
    echo -e "${GREEN}   Bot username: @$BOT_USERNAME${NC}"
    
    # Send test message
    echo -e "${YELLOW}📱 Sending test message...${NC}"
    TEST_MSG_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
        -d "chat_id=$CHAT_ID" \
        -d "text=🎉 Smart Task-Killer bot is now connected! Send /help to get started.")
    
    if echo "$TEST_MSG_RESPONSE" | grep -q '"ok":true'; then
        echo -e "${GREEN}✅ Test message sent successfully!${NC}"
    else
        echo -e "${YELLOW}⚠️  Test message failed, but bot connection is OK${NC}"
    fi
else
    echo -e "${RED}❌ Bot connection failed. Check your token.${NC}"
fi

echo ""

# Step 6: Show next steps
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo ""
echo -e "${CYAN}📋 Next Steps:${NC}"
echo ""
echo -e "${YELLOW}1. Start the bot:${NC}"
echo "   ./task-killer-smart"
echo ""
echo -e "${YELLOW}2. Or run dedicated Telegram mode:${NC}"
echo "   npm run dev telegram"
echo ""
echo -e "${YELLOW}3. Try these commands in Telegram:${NC}"
echo "   /help - Show all commands"
echo "   /tasks - View your tasks"
echo "   \"Create urgent task fix database bug\" - Natural language"
echo ""
echo -e "${YELLOW}4. Configuration file location:${NC}"
echo "   $CONFIG_FILE"
echo ""
echo -e "${GREEN}✨ Your Telegram bot is ready to manage tasks! 🚀${NC}"