# 🤖 Telegram Integration Setup Guide

## Overview
Your Smart Task-Killer includes a full-featured Telegram bot that allows you to manage tasks through natural language chat. Here's how to set it up:

## 📋 Step-by-Step Setup

### Step 1: Create a Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Start a chat** with BotFather
3. **Create new bot** by sending: `/newbot`
4. **Choose a name** for your bot (e.g., "My Task Killer Bot")
5. **Choose a username** (must end with 'bot', e.g., "mytaskkiller_bot")
6. **Copy the token** - BotFather will give you a token like:
   ```
   123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789
   ```

### Step 2: Get Your Chat ID

1. **Start a chat** with your new bot (click the link BotFather provides)
2. **Send any message** to your bot (e.g., "hello")
3. **Get your chat ID** using one of these methods:

#### Method A: Using Browser
```bash
# Replace YOUR_BOT_TOKEN with your actual token
https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

#### Method B: Using curl
```bash
curl https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

4. **Find your chat ID** in the response:
```json
{
  "result": [{
    "message": {
      "chat": {
        "id": 123456789,  // This is your CHAT_ID
        "type": "private"
      }
    }
  }]
}
```

### Step 3: Configure Environment Variables

1. **Edit your config file**:
```bash
./task-killer-smart --config
# or manually edit: ~/.task-killer/.env
```

2. **Add Telegram settings**:
```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789
TELEGRAM_CHAT_ID=123456789

# Make sure these are also set
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgresql://localhost:5432/tasks
```

### Step 4: Start the Telegram Bot

#### Option A: Using Smart Task-Killer (includes Telegram support)
```bash
./task-killer-smart
# The bot will automatically start with Telegram integration
```

#### Option B: Dedicated Telegram Bot Mode
```bash
npm run dev telegram
# or
npx tsx src/commands/telegram.ts
```

## 🎯 Bot Features

### **Natural Language Commands**
Chat naturally with your bot:
- "Create a high priority task to review the project proposal"
- "Show me all pending tasks"
- "Mark task abc123 as completed" 
- "What tasks do I have due this week?"

### **Slash Commands**
- `/start` or `/help` - Show welcome message
- `/tasks` - View task list with interactive buttons
- `/stats` - View detailed task statistics

### **Interactive Features**
- **Inline buttons** for quick actions
- **Task filtering** by status and priority
- **Real-time notifications** for task updates
- **Rich formatting** with emojis and status indicators

## 🔧 Advanced Configuration

### Bot Permissions
Your bot needs these permissions:
- Send messages
- Receive messages
- Use inline keyboards

### Security Settings
```env
# Optional: Restrict to specific chat
TELEGRAM_CHAT_ID=123456789  # Only this chat can use the bot

# Optional: Enable/disable features
ENABLE_TELEGRAM_NOTIFICATIONS=true
TELEGRAM_MESSAGE_FORMAT=markdown  # or 'html'
```

### Webhook Mode (Production)
For production deployment, consider using webhooks instead of polling:

```javascript
// In your production setup
const bot = new TelegramBot(token, { webHook: { port: 8443 } });
bot.setWebHook(`https://yourdomain.com/bot${token}`);
```

## 🚀 Usage Examples

### Creating Tasks
```
You: Create urgent task "Fix database connection issue" due tomorrow
Bot: ✅ Task created successfully!

📋 Task Details
🔴 🔄 Fix database connection issue

ID: `abc12345`
Status: pending  
Priority: urgent
Due Date: 2024-08-11
Created: 2024-08-10
```

### Viewing Tasks
```
You: /tasks
Bot: 📋 Task List (3 tasks)

⏳ 🔴 Fix database connection issue
   ID: `abc12345`
   📅 Due: 8/11/2024

🔄 🟡 Review project proposal  
   ID: `def67890`

✅ 🟢 Update documentation
   ID: `ghi13579`

[📊 Statistics] [🔄 Refresh]
[⏳ Pending] [🔄 In Progress]
```

### Task Statistics
```
You: /stats
Bot: 📊 Task Statistics

⏳ PENDING
   🔴 urgent: 1 total
   🟡 high: 2 total (1 today)

🔄 IN PROGRESS  
   🟡 high: 1 total

✅ COMPLETED
   🟢 medium: 5 total (2 today)
```

## ❓ Troubleshooting

### Common Issues

#### Bot not responding
```bash
# Check if bot is running
ps aux | grep telegram

# Check logs
tail -f ~/.task-killer/logs/telegram.log
```

#### Invalid token error
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Make sure there are no extra spaces
- Token should be exactly as BotFather provided

#### Wrong chat ID
- Send a message to your bot first
- Use `/getUpdates` API to find correct chat ID
- Chat ID should be a number, not username

#### Database connection issues
- Ensure `DATABASE_URL` is configured
- Run database initialization: `npm run init-db`

### Health Check
```bash
./task-killer-smart
# Look for: "✅ Telegram Bot: OK (@your_bot_username)"
```

## 🔐 Security Best Practices

1. **Keep tokens secret** - Never share or commit tokens to version control
2. **Use environment variables** - Store sensitive data in `.env` files
3. **Restrict access** - Set specific `TELEGRAM_CHAT_ID` to limit usage
4. **Regular rotation** - Consider rotating bot tokens periodically
5. **Monitor usage** - Check bot logs for unexpected activity

## 🎉 You're All Set!

Your Telegram bot is now ready! You can:
- Chat naturally with AI-powered task management
- Use interactive buttons for quick actions  
- Get real-time notifications
- Access your tasks from anywhere

Start by sending `/help` to your bot to see all available features! 🚀