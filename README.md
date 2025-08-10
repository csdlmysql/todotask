# 🎯 Task-Killer

Task-Killer is an AI-powered task management CLI tool that helps you manage your tasks efficiently using natural language processing. It integrates with Google's Gemini AI for intelligent task operations and supports notifications through desktop and Telegram.

## ✨ Features

- 🤖 **AI-Powered Natural Language Processing** - Create, update, and manage tasks using natural language with Gemini AI
- 📱 **Cross-Platform** - Works on macOS, Linux, and Windows
- 🗄️ **PostgreSQL Database** - Reliable task storage with full ACID compliance
- 📲 **Telegram Integration** - Complete bot with Markdown v2 formatting and interactive buttons
- 🔔 **Smart Notifications** - Desktop and Telegram notifications with task reminders
- 🎨 **Modern CLI Interface** - Beautiful terminal interface with colors, tables, and progress indicators
- 🔍 **Advanced Search** - Search tasks by title, description, tags, category with highlighting
- 📊 **Statistics & Analytics** - Detailed task statistics and progress tracking
- ⏰ **Task Scheduling** - Automated reminders and daily summaries
- 🏷️ **Tags & Categories** - Organize tasks with custom tags and categories
- 📅 **Due Date Management** - Set due dates with automatic reminder notifications

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Google Gemini API key
- (Optional) Telegram Bot Token for bot integration

### Installation

1. **Clone and Install**
   ```bash
   git clone https://github.com/your-username/task-killer.git
   cd task-killer
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Required
   GEMINI_API_KEY=your_gemini_api_key_here
   DATABASE_URL=postgresql://username:password@localhost:5432/task_killer
   
   # Optional - For Telegram Bot
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   
   # Optional - Notifications
   ENABLE_NOTIFICATIONS=true
   ```

3. **Database Setup**
   ```bash
   # Create PostgreSQL database
   createdb task_killer
   
   # Initialize database schema
   npm run build
   npm start init
   ```

4. **Build and Install Globally** (Optional)
   ```bash
   npm run build
   npm link
   ```

## 📖 Usage

### Command Line Interface

#### Basic Task Operations

```bash
# Create a new task
task-killer create -t "Review project proposal" -p high -c work --due 2024-01-15

# List all tasks
task-killer list

# List with filters
task-killer ls --status pending --priority high

# Update a task
task-killer update <task-id> --status completed

# Delete a task
task-killer delete <task-id>

# Search tasks
task-killer search "project" --category work
```

#### AI Chat Interface

```bash
# Single command
task-killer chat "Create a high priority task to review the budget"

# Interactive chat mode
task-killer chat
```

Examples of natural language commands:
- "Create a task to buy groceries with high priority due tomorrow"
- "Show me all pending tasks for work category"
- "Mark task abc123 as completed"
- "What tasks do I have due this week?"

#### Telegram Bot

```bash
# Start the Telegram bot
task-killer telegram
```

### 🤖 AI Natural Language Examples

Task-Killer's AI can understand various natural language patterns:

**Creating Tasks:**
- "Add a task to review the quarterly report with high priority"
- "I need to call the client tomorrow, make it urgent"
- "Create a work task to update the website due next Friday"

**Updating Tasks:**
- "Mark the presentation task as completed"
- "Change the priority of task abc123 to urgent"
- "Move the project review to in progress status"

**Querying Tasks:**
- "Show me all urgent tasks"
- "What do I have to do today?"
- "List all completed tasks from this week"
- "Find tasks about client meetings"

### 📱 Telegram Bot Features

The Telegram bot provides a complete task management experience:

- **Natural Language Processing** - Send any message and the AI will understand
- **Interactive Buttons** - Quick actions for common operations
- **Formatted Messages** - Beautiful Markdown v2 formatting
- **Task Notifications** - Real-time updates and reminders
- **Statistics** - Visual task statistics and summaries

Telegram Commands:
- `/start` - Welcome message and setup
- `/help` - Show available commands
- `/tasks` - Display task list with filters
- `/stats` - Show task statistics

## 🛠️ Configuration

### Database Configuration

Task-Killer uses PostgreSQL with the following schema:
- Tasks with UUID primary keys
- Support for tags arrays
- Automatic timestamp updates
- Indexes for performance
- Statistics views

### Notification Settings

Configure notifications in your `.env` file:

```env
ENABLE_NOTIFICATIONS=true  # Enable/disable all notifications
```

Notification types:
- 🔔 Task created/updated/completed
- ⏰ Due date reminders
- 📊 Daily task summaries
- 🚨 Overdue task alerts

### Task Scheduler

The built-in scheduler handles:
- **Hourly checks** for due tasks and reminders
- **Daily summaries** at 6 PM
- **Custom reminders** for specific tasks
- **Overdue notifications** for missed deadlines

## 🎨 CLI Interface Features

### Beautiful Tables
- Color-coded task status and priority
- Truncated text with proper formatting
- Emoji indicators for better visualization
- Sortable columns with proper alignment

### Interactive Prompts
- Smart defaults based on existing data
- Validation for dates and enums
- Auto-completion where applicable
- Confirmation dialogs for destructive actions

### Progress Indicators
- Spinners for long-running operations
- Success/error indicators
- Loading states for API calls
- Real-time operation feedback

## 🔧 Development

### Project Structure

```
src/
├── commands/       # CLI command implementations
├── database/       # Database schema and connections
├── services/       # External service integrations
├── types/          # TypeScript type definitions
├── utils/          # Utility functions and helpers
└── index.ts        # Main entry point
```

### Available Scripts

```bash
npm run dev         # Development with hot reload
npm run build       # Build TypeScript to JavaScript
npm start           # Run the built application
npm run db:migrate  # Run database migrations
```

### Adding New Commands

1. Create command file in `src/commands/`
2. Implement using Commander.js pattern
3. Add to main `src/index.ts` file
4. Update Gemini function declarations if AI integration needed

## 🤝 API Integration

### Gemini AI Integration

Task-Killer uses Google's Gemini 1.5 Pro model with function calling:

- **Natural Language Understanding** - Converts user intent to function calls
- **Context Awareness** - Understands task management domain
- **Response Generation** - Creates helpful responses based on results
- **Function Mapping** - Maps natural language to specific operations

### Telegram Bot API

Full integration with Telegram Bot API:
- **Webhook or Polling** - Flexible message receiving
- **Markdown v2 Support** - Rich message formatting
- **Inline Keyboards** - Interactive button controls
- **Callback Queries** - Handle user interactions
- **Chat Actions** - Show typing indicators

## 🔒 Security

- Environment variable configuration for sensitive data
- Database connection with SSL support
- Input validation and sanitization
- No secrets stored in code or logs
- Proper error handling without information disclosure

## 🐛 Troubleshooting

### Common Issues

**Database Connection Failed:**
```bash
# Check PostgreSQL is running
pg_isready -d task_killer

# Test connection
psql $DATABASE_URL
```

**Gemini API Errors:**
- Verify API key is correct
- Check API quota and billing
- Ensure proper network connectivity

**Telegram Bot Not Responding:**
- Verify bot token is valid
- Check chat ID is correct
- Ensure bot has proper permissions

**Notifications Not Working:**
- Check `ENABLE_NOTIFICATIONS` setting
- Verify notification permissions on OS
- Test Telegram bot connectivity

### Logs and Debugging

Enable debug mode:
```bash
DEBUG=task-killer* npm start
```

Check database logs:
```sql
-- View recent tasks
SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10;

-- Check task statistics
SELECT * FROM task_stats;
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

- Create an issue for bug reports
- Use discussions for questions
- Check existing documentation first
- Provide detailed reproduction steps

---

**Made with ❤️ and AI** 🤖