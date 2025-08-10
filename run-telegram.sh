#!/bin/bash

# Quick Telegram Bot Runner for Smart Task-Killer

echo "🤖 Starting Smart Task-Killer Telegram Bot..."
echo ""

# Check if config exists - try multiple locations
CONFIG_FILE=""
if [ -f ".env" ]; then
    CONFIG_FILE=".env"
elif [ -f "$HOME/.task-killer/.env" ]; then
    CONFIG_FILE="$HOME/.task-killer/.env"
elif [ -f "$(pwd)/.env" ]; then
    CONFIG_FILE="$(pwd)/.env"
else
    echo "❌ Configuration not found. Checked:"
    echo "   - ./.env"
    echo "   - $HOME/.task-killer/.env"
    echo ""
    echo "Run setup first: ./setup-telegram.sh"
    exit 1
fi

echo "📁 Using config: $CONFIG_FILE"

# Load config
source "$CONFIG_FILE"

# Check required variables
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ] || [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ Missing required configuration. Please check:"
    echo "   - TELEGRAM_BOT_TOKEN"
    echo "   - TELEGRAM_CHAT_ID" 
    echo "   - GEMINI_API_KEY"
    echo ""
    echo "Run setup script: ./setup-telegram.sh"
    exit 1
fi

echo "✅ Configuration loaded"
echo "🤖 Bot Token: ${TELEGRAM_BOT_TOKEN:0:10}..."
echo "💬 Chat ID: $TELEGRAM_CHAT_ID"
echo ""

# Start the bot
echo "🚀 Starting Telegram bot..."
echo ""
echo "💡 Bot Features:"
echo "  • Natural language task management"
echo "  • Interactive buttons and commands"
echo "  • Real-time notifications"
echo "  • Task statistics and filtering"
echo ""
echo "📱 Try these commands in Telegram:"
echo "  /help - Show all commands"
echo "  /tasks - View task list"
echo "  \"Create urgent task fix database bug\" - Natural language"
echo ""
echo "🛑 Press Ctrl+C to stop the bot"
echo ""

# Export variables and run the Telegram bot
export TELEGRAM_BOT_TOKEN
export TELEGRAM_CHAT_ID
export GEMINI_API_KEY

npx tsx start-telegram-bot.ts