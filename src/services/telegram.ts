import TelegramBot from 'node-telegram-bot-api';
import { TelegramConfig, Task, User } from '../types/index.js';
import { SmartTaskProcessor } from '../ai/SmartTaskProcessor.js';
import { TaskRepository } from '../database/tasks.js';
import { UserRepository } from '../database/users.js';
import { DailyReportService } from './DailyReportService.js';

export class TelegramService {
  private bot: TelegramBot;
  private chatId: string;
  private smartProcessor: SmartTaskProcessor;
  private taskRepo: TaskRepository;
  private userRepo: UserRepository;
  private dailyReportService: DailyReportService;
  private pendingRegistrations: Map<number, { step: string; data: any }>;
  private pendingEdits: Map<number, { taskId: string; field: string; nextAction?: string }>;
  private processedMessages: Set<string>;

  constructor(config: TelegramConfig, geminiApiKey: string) {
    this.bot = new TelegramBot(config.token, { polling: true });
    this.chatId = config.chatId;
    this.smartProcessor = new SmartTaskProcessor(geminiApiKey);
    this.taskRepo = new TaskRepository();
    this.userRepo = new UserRepository();
    this.dailyReportService = new DailyReportService();
    this.dailyReportService.setTelegramService(this);
    this.pendingRegistrations = new Map();
    this.pendingEdits = new Map();
    this.processedMessages = new Set();
    
    this.setupBotHandlers();
  }

  private setupBotHandlers() {
    this.bot.on('message', async (msg) => {
      // Only respond to private messages (not groups)
      if (msg.chat.type !== 'private') {
        return;
      }

      const telegramId = msg.from?.id;
      if (!telegramId) return;

      // Prevent duplicate message processing
      const messageKey = `${msg.message_id}-${msg.chat.id}`;
      if (this.processedMessages.has(messageKey)) {
        console.log('🔄 Skipping duplicate message:', messageKey);
        return;
      }
      this.processedMessages.add(messageKey);

      // Clean up old processed messages (keep only last 1000)
      if (this.processedMessages.size > 1000) {
        const messages = Array.from(this.processedMessages);
        this.processedMessages.clear();
        messages.slice(-500).forEach(key => this.processedMessages.add(key));
      }

      const messageText = msg.text || '';

      // Handle registration process
      if (this.pendingRegistrations.has(telegramId)) {
        await this.handleRegistrationStep(msg);
        return;
      }

      // Handle edit process
      if (this.pendingEdits.has(telegramId)) {
        await this.handleEditStep(msg);
        return;
      }

      // Check if this is a reply to bot's message asking for edit
      if (msg.reply_to_message && msg.reply_to_message.from?.is_bot) {
        const botMessage = msg.reply_to_message.text || '';
        // Check if bot was asking for edit input
        if (botMessage.includes('Please type the new title') || botMessage.includes('Please type the new description')) {
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('❌ Edit session expired. Please click the edit button again.'),
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
      }

      if (messageText.startsWith('/')) {
        await this.handleCommand(msg);
      } else {
        // Check if user is registered and active for natural language processing
        const user = await this.userRepo.getUserByTelegramId(telegramId);
        if (!user) {
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('🚫 You need to register first. Use /register command.'),
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        if (user.status !== 'active') {
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('⏳ Your account is inactive. Please wait for admin approval.'),
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }

        await this.handleNaturalLanguage(msg);
      }
    });

    this.bot.on('callback_query', async (callbackQuery) => {
      await this.handleCallbackQuery(callbackQuery);
    });
  }

  private async handleCommand(msg: TelegramBot.Message) {
    const command = msg.text?.split(' ')[0].toLowerCase().substring(1); // Remove '/' 
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    switch (command) {
      case 'start':
      case 'help':
        await this.sendWelcomeMessage(msg.chat.id);
        break;

      case 'register':
        await this.handleRegisterCommand(msg);
        break;
      
      case 'list':
      case 'tasks':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleListCommand(msg);
        }
        break;
      
      case 'mylist':
      case 'mytasks':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('list', msg.chat.id, telegramId);
        }
        break;
      
      case 'recent':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('recent', msg.chat.id, telegramId);
        }
        break;
      
      case 'stats':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('stats', msg.chat.id, telegramId);
        }
        break;
        
      case 'search':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('search', msg.chat.id, telegramId);
        }
        break;
        
      case 'export':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('export', msg.chat.id, telegramId);
        }
        break;
        
      case 'backup':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('backup', msg.chat.id, telegramId);
        }
        break;
        
      case 'config':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('config', msg.chat.id, telegramId);
        }
        break;
        
      case 'context':
      case 'debug':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('context', msg.chat.id, telegramId);
        }
        break;
        
      case 'reset':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('reset', msg.chat.id, telegramId);
        }
        break;
        
      case 'cleanup':
      case 'delete-by-status':
        if (await this.checkUserActive(telegramId, msg.chat.id)) {
          await this.handleSmartCommand('cleanup', msg.chat.id, telegramId);
        }
        break;

      case 'users':
        await this.handleUsersCommand(msg);
        break;

      case 'activate':
        await this.handleActivateCommand(msg);
        break;

      case 'deleteuser':
        await this.handleDeleteUserCommand(msg);
        break;

      case 'edituser':
        await this.handleEditUserCommand(msg);
        break;

      case 'report':
        await this.handleReportCommand(msg);
        break;

      case 'setreporttime':
        await this.handleSetReportTimeCommand(msg);
        break;

      case 'reminder':
        await this.handleReminderCommand(msg);
        break;

      case 'setremindertime':
        await this.handleSetReminderTimeCommand(msg);
        break;
      
      default:
        // Check if user needs to register for unknown commands
        const user = await this.userRepo.getUserByTelegramId(telegramId);
        if (!user) {
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('🚫 You need to register first. Use /register command.'),
            { parse_mode: 'MarkdownV2' }
          );
        } else {
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('❓ Unknown command. Type /help for available commands.'),
            { parse_mode: 'MarkdownV2' }
          );
        }
    }
  }

  private async handleListCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    const user = await this.userRepo.getUserByTelegramId(telegramId);
    if (!user) return;

    // If admin, show all tasks; otherwise show user's tasks
    if (user.role === 'admin') {
      await this.sendAllTasksList(msg.chat.id);
    } else {
      await this.sendTaskList(msg.chat.id);
    }
  }

  // Handle Smart commands using SmartTaskProcessor
  private async handleSmartCommand(command: string, chatId: number, telegramId?: number) {
    try {
      await this.bot.sendChatAction(chatId, 'typing');

      // Get user and set context
      if (telegramId) {
        const user = await this.userRepo.getUserByTelegramId(telegramId);
        if (user) {
          this.smartProcessor.setUserContext(user.id);
        }
      }

      const result = await this.smartProcessor.handleSpecialCommand(command);
      
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`🤖 ${result.message}`),
        { parse_mode: 'MarkdownV2' }
      );

      // Send formatted data if available
      if (result.data) {
        await this.sendSmartData(chatId, result.data);
      }

      // Send follow-up suggestions
      if (result.follow_up_suggestions?.length) {
        const suggestionsText = '💡 Suggestions: ' + result.follow_up_suggestions.join(' • ');
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2(suggestionsText),
          { parse_mode: 'MarkdownV2' }
        );
      }

    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleNaturalLanguage(msg: TelegramBot.Message) {
    try {
      await this.bot.sendChatAction(msg.chat.id, 'typing');

      // Set user context
      const telegramId = msg.from?.id;
      if (telegramId) {
        const user = await this.userRepo.getUserByTelegramId(telegramId);
        if (user) {
          this.smartProcessor.setUserContext(user.id);
        }
      }

      // Use SmartTaskProcessor for conversational flow (same as CLI)
      const result = await this.smartProcessor.handleConversationalFlow(msg.text || '');

      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`🤖 ${result.message}`),
        { parse_mode: 'MarkdownV2' }
      );

      // Send formatted data if available  
      if (result.data) {
        await this.sendSmartData(msg.chat.id, result.data);
      }

      // Send follow-up suggestions
      if (result.follow_up_suggestions?.length) {
        const suggestionsText = '💡 Suggestions: ' + result.follow_up_suggestions.join(' • ');
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2(suggestionsText),
          { parse_mode: 'MarkdownV2' }
        );
      }

      // Show clarification tip if needed
      if (result.needs_clarification) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('💭 Tip: Be more specific so AI can understand better'),
          { parse_mode: 'MarkdownV2' }
        );
      }

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  // Note: executeFunction method removed - now using SmartTaskProcessor directly

  // Smart data display method (similar to CLI display)
  private async sendSmartData(chatId: number, data: any) {
    if (!data) return;

    // Handle different data types like CLI does
    if (data.id && data.title) {
      // Single task
      await this.sendTaskDetails(chatId, data);
    } else if (Array.isArray(data)) {
      if (data.length > 0 && data[0].id && data[0].title) {
        // Task list
        await this.sendTaskList(chatId, null, data);
      } else {
        // Stats or other array data
        await this.sendGenericData(chatId, data);
      }
    } else if (typeof data === 'object') {
      // Stats, config, or other object data
      await this.sendGenericData(chatId, data);
    }
  }

  private async sendGenericData(chatId: number, data: any) {
    const dataString = JSON.stringify(data, null, 2);
    await this.bot.sendMessage(
      chatId,
      this.escapeMarkdownV2(`📊 Data:\n\`\`\`\n${dataString}\n\`\`\``),
      { parse_mode: 'MarkdownV2' }
    );
  }

  private async sendWelcomeMessage(chatId: number) {
    const message = `
🧠 *Smart Task\\-Killer v1\\.0\\.0*
*Professional AI Task Management Assistant*
_Author: csdlmysql_

*👤 User Management:*
• \\/register \\- Register your account \\(email \\+ name required\\)
• New users start as inactive and need admin approval
• Only active users can use task management features

*📋 Task Management Commands \\(Active Users\\):*
• \\/list \\- View tasks \\(all tasks for admin, own tasks for users\\)
• \\/mylist \\- View only your own tasks
• \\/recent \\- 10 most recent tasks
• \\/search \\- Search your tasks
• \\/cleanup \\- Bulk delete by status

*📊 Analytics & Data Commands:*
• \\/stats \\- Your detailed statistics
• \\/export \\- Export your tasks to JSON
• \\/backup \\- Create full backup

*👑 Admin Commands:*
• \\/users \\- View all registered users
• \\/activate \\<telegram\\_id\\|email\\> \\- Activate user account
• \\/deleteuser \\<telegram\\_id\\|email\\> \\- Delete a user and all their data
• \\/edituser \\<telegram\\_id\\|email\\> \\<new\\_name\\> \\- Change user's name
• \\/report \\- Generate daily report manually
• \\/setreporttime HH:MM \\- Set daily report time \\(default: 20:00\\)
• \\/reminder \\- Send work reminder to all users
• \\/setremindertime HH:MM \\- Set reminder time \\(default: 15:00\\)

*🔧 System Commands:*
• \\/config \\- View configuration
• \\/context \\- Debug context info
• \\/reset \\- Reset conversation context

*💬 Natural Language Examples \\(Active Users\\):*
• "them 2 task sau: viet docs, fix bug"
• "delete all completed tasks"
• "mark task1, task2 as urgent priority"
• "show pending tasks with high priority"

*🧠 Smart Features:*
• User Registration \\& Role\\-based Access Control
• Multi\\-Task Operations: Create/update/delete multiple tasks
• Bulk Cleanup: Delete all tasks by status
• Context Memory: AI remembers task references
• Performance Analytics: Track productivity patterns
• Natural Language Processing

*🚀 Getting Started:*
1\\. Register with \\/register command
2\\. Wait for admin approval
3\\. Start managing your tasks naturally
`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
  }

  private async sendAllTasksList(chatId: number, page: number = 0) {
    try {
      // Get all tasks from all users
      const tasks = await this.taskRepo.getTasks({ limit: 100 });
      const users = await this.userRepo.getAllUsers({ status: 'active' });
      
      if (tasks.length === 0) {
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2('📋 No tasks found from any user'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      // Create user map for quick lookup
      const userMap = new Map(users.map(u => [u.id, u]));

      // Pagination settings
      const tasksPerPage = 5;
      const totalPages = Math.ceil(tasks.length / tasksPerPage);
      const currentPage = Math.min(page, totalPages - 1);
      const startIndex = currentPage * tasksPerPage;
      const endIndex = Math.min(startIndex + tasksPerPage, tasks.length);
      const pageTasks = tasks.slice(startIndex, endIndex);

      // Send header
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`📋 All Tasks (Admin View)\nTotal: ${tasks.length} tasks from ${users.length} users`),
        { parse_mode: 'MarkdownV2' }
      );

      // Send each task with user info and buttons
      for (const task of pageTasks) {
        const user = userMap.get(task.user_id);
        const userName = user ? user.name : 'Unknown User';
        await this.sendTaskWithButtons(chatId, task, userName);
      }

      // Send pagination controls
      const paginationKeyboard: any[] = [];
      
      // Pagination row
      const paginationRow = [];
      if (currentPage > 0) {
        paginationRow.push({ text: '⬅️ Previous', callback_data: `admin_page_${currentPage - 1}` });
      }
      paginationRow.push({ text: `📄 ${currentPage + 1}/${totalPages}`, callback_data: 'current_page' });
      if (currentPage < totalPages - 1) {
        paginationRow.push({ text: 'Next ➡️', callback_data: `admin_page_${currentPage + 1}` });
      }
      if (paginationRow.length > 0) {
        paginationKeyboard.push(paginationRow);
      }

      // Admin options
      paginationKeyboard.push([
        { text: '🔄 Refresh All', callback_data: 'refresh_all_tasks' },
        { text: '📊 Statistics', callback_data: 'stats' }
      ]);
      
      paginationKeyboard.push([
        { text: '📝 My Tasks', callback_data: 'my_tasks' },
        { text: '📊 Daily Report', callback_data: 'daily_report' }
      ]);

      const summaryMessage = `📊 *Admin Summary*\n` +
        `Total: ${tasks.length} tasks\n` +
        `Users: ${users.length} active\n` +
        `Page: ${currentPage + 1}/${totalPages}\n` +
        `Showing: ${startIndex + 1}-${endIndex} of ${tasks.length}`;

      await this.bot.sendMessage(chatId, this.escapeMarkdownV2(summaryMessage), { 
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: paginationKeyboard
        }
      });

    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error loading all tasks: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async sendTaskList(chatId: number, filters?: any, tasksData?: any[], page: number = 0) {
    try {
      // Get user context for filtering
      const user = await this.userRepo.getUserByTelegramId(chatId);
      if (!user || user.status !== 'active') {
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2('🚫 User not found or inactive.'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      // Add user filter to existing filters
      const userFilters = { user_id: user.id, ...filters };
      const tasks = tasksData || await this.taskRepo.getTasks(userFilters);

      if (tasks.length === 0) {
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2('🎉 No tasks found. You\'re all caught up'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      // Pagination settings
      const tasksPerPage = 5;
      const totalPages = Math.ceil(tasks.length / tasksPerPage);
      const currentPage = Math.min(page, totalPages - 1);
      const startIndex = currentPage * tasksPerPage;
      const endIndex = Math.min(startIndex + tasksPerPage, tasks.length);
      const pageTasks = tasks.slice(startIndex, endIndex);

      // Send each task as a separate message with its own buttons
      for (const task of pageTasks) {
        await this.sendTaskWithButtons(chatId, task);
      }

      // Send pagination and filter controls
      const paginationKeyboard: any[] = [];
      
      // Pagination row
      const paginationRow = [];
      if (currentPage > 0) {
        paginationRow.push({ text: '⬅️ Previous', callback_data: `page_${currentPage - 1}` });
      }
      paginationRow.push({ text: `📄 ${currentPage + 1}/${totalPages}`, callback_data: 'current_page' });
      if (currentPage < totalPages - 1) {
        paginationRow.push({ text: 'Next ➡️', callback_data: `page_${currentPage + 1}` });
      }
      if (paginationRow.length > 0) {
        paginationKeyboard.push(paginationRow);
      }

      // Filter options
      paginationKeyboard.push([
        { text: '🔄 Refresh', callback_data: 'refresh_tasks' },
        { text: '📊 Statistics', callback_data: 'stats' }
      ]);
      
      paginationKeyboard.push([
        { text: '⏳ Pending', callback_data: 'filter_pending' },
        { text: '✅ Completed', callback_data: 'filter_completed' }
      ]);

      const summaryMessage = `📋 *Summary*\n` +
        `Total: ${tasks.length} tasks\n` +
        `Page: ${currentPage + 1}/${totalPages}\n` +
        `Showing: ${startIndex + 1}-${endIndex} of ${tasks.length}`;

      await this.bot.sendMessage(chatId, this.escapeMarkdownV2(summaryMessage), { 
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: paginationKeyboard
        }
      });

    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error loading tasks: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async sendTaskWithButtons(chatId: number, task: Task, userName?: string) {
    const statusEmojis: Record<string, string> = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌'
    };
    const statusEmoji = statusEmojis[task.status] || '❓';

    const priorityEmojis: Record<string, string> = {
      urgent: '🔴',
      high: '🟡',
      medium: '🟢',
      low: '⚪'
    };
    const priorityEmoji = priorityEmojis[task.priority] || '⚫';

    let message = `${statusEmoji} ${priorityEmoji} *${this.escapeMarkdownV2(task.title)}*\n`;
    
    // Add user name if provided (for admin view)
    if (userName) {
      message += `👤 ${this.escapeMarkdownV2(userName)}\n`;
    }
    
    if (task.description) {
      const shortDescription = task.description.length > 100 
        ? task.description.slice(0, 100) + '...' 
        : task.description;
      message += `📝 ${this.escapeMarkdownV2(shortDescription)}\n`;
    }
    
    message += `🆔 \`${task.id.slice(0, 8)}\`\n`;
    
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const today = new Date();
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let dueDateStr = dueDate.toLocaleDateString();
      if (diffDays === 0) dueDateStr += ' (Today)';
      else if (diffDays === 1) dueDateStr += ' (Tomorrow)';
      else if (diffDays < 0) dueDateStr += ` (${Math.abs(diffDays)} days overdue)`;
      
      message += `📅 ${this.escapeMarkdownV2(dueDateStr)}\n`;
    }

    // Simplified buttons for all tasks
    const keyboard: any[][] = [];
    
    // First row - status toggle button
    if (task.status === 'completed') {
      keyboard.push([
        { text: '⏳ Mark as Pending', callback_data: `pending_${task.id}` }
      ]);
    } else {
      keyboard.push([
        { text: '✅ Mark as Complete', callback_data: `complete_${task.id}` }
      ]);
    }
    
    // Second row - edit buttons
    keyboard.push([
      { text: '✏️ Edit Title', callback_data: `edit_title_${task.id}` },
      { text: '📝 Edit Description', callback_data: `edit_desc_${task.id}` }
    ]);
    
    // Third row - details button
    keyboard.push([
      { text: '📋 View Details', callback_data: `details_${task.id}` }
    ]);

    await this.bot.sendMessage(chatId, message, { 
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  }

  private async sendTaskStats(chatId: number) {
    try {
      // Get user context for stats
      const user = await this.userRepo.getUserByTelegramId(chatId);
      if (!user || user.status !== 'active') {
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2('🚫 User not found or inactive.'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      const stats = await this.taskRepo.getTaskStats({ user_id: user.id });

      let message = '📊 *Task Statistics*\n\n';

      const statusGroups = stats.reduce((acc: any, stat: any) => {
        if (!acc[stat.status]) {
          acc[stat.status] = [];
        }
        acc[stat.status].push(stat);
        return acc;
      }, {});

      Object.entries(statusGroups).forEach(([status, statusStats]: [string, any]) => {
        const statusEmoji = {
          pending: '⏳',
          in_progress: '🔄',
          completed: '✅',
          cancelled: '❌'
        }[status];

        message += `${statusEmoji} *${this.escapeMarkdownV2(status.replace('_', ' ').toUpperCase())}*\n`;
        
        statusStats.forEach((stat: any) => {
          const priorityEmojis: Record<string, string> = {
            urgent: '🔴',
            high: '🟡',
            medium: '🟢',
            low: '⚪'
          };
          const priorityEmoji = priorityEmojis[stat.priority];

          message += `   ${priorityEmoji} ${this.escapeMarkdownV2(stat.priority)}: ${stat.total} total`;
          
          if (stat.today > 0) {
            message += ` \\(${stat.today} today\\)`;
          }
          
          message += '\n';
        });
        
        message += '\n';
      });

      await this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });

    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error loading statistics: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async sendTaskDetails(chatId: number, task: Task) {
    const statusEmoji = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌'
    }[task.status];

    const priorityEmoji = {
      urgent: '🔴',
      high: '🟡',
      medium: '🟢',
      low: '⚪'
    }[task.priority];

    let message = `📋 *Task Details*\n\n`;
    message += `${statusEmoji} ${priorityEmoji} *${this.escapeMarkdownV2(task.title)}*\n\n`;
    message += `*ID:* \`${task.id}\`\n`;
    message += `*Status:* ${this.escapeMarkdownV2(task.status.replace('_', ' '))}\n`;
    message += `*Priority:* ${this.escapeMarkdownV2(task.priority)}\n`;

    if (task.description) {
      message += `*Description:* ${this.escapeMarkdownV2(task.description)}\n`;
    }

    if (task.category) {
      message += `*Category:* ${this.escapeMarkdownV2(task.category)}\n`;
    }

    if (task.due_date) {
      const dueDate = new Date(task.due_date).toLocaleDateString();
      message += `*Due Date:* ${this.escapeMarkdownV2(dueDate)}\n`;
    }

    if (task.tags && task.tags.length > 0) {
      message += `*Tags:* ${task.tags.map(tag => `#${this.escapeMarkdownV2(tag)}`).join(' ')}\n`;
    }

    const createdDate = new Date(task.created_at).toLocaleDateString();
    message += `*Created:* ${this.escapeMarkdownV2(createdDate)}\n`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✏️ Edit', callback_data: `edit_${task.id}` },
          { text: '🗑️ Delete', callback_data: `delete_${task.id}` }
        ],
        [
          { text: '✅ Complete', callback_data: `complete_${task.id}` },
          { text: '🔄 In Progress', callback_data: `progress_${task.id}` }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, message, { 
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard
    });
  }

  private async handleCallbackQuery(callbackQuery: TelegramBot.CallbackQuery) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;
    const userId = callbackQuery.from.id;

    if (!chatId) return;

    try {
      await this.bot.answerCallbackQuery(callbackQuery.id);

      switch (data) {
        case 'stats':
          await this.sendTaskStats(chatId);
          break;
        
        case 'refresh_tasks':
          await this.sendTaskList(chatId);
          break;
        
        case 'refresh_all_tasks':
          await this.sendAllTasksList(chatId);
          break;
        
        case 'my_tasks':
          await this.sendTaskList(chatId);
          break;
        
        case 'daily_report':
          const telegramId = callbackQuery.from?.id;
          if (telegramId) {
            const user = await this.userRepo.getUserByTelegramId(telegramId);
            if (user?.role === 'admin') {
              const report = await this.dailyReportService.generateAndSendDailyReport(false);
              await this.bot.sendMessage(chatId, this.escapeMarkdownV2(report), { parse_mode: 'MarkdownV2' });
            }
          }
          break;
        
        case 'filter_pending':
          await this.sendTaskList(chatId, { status: 'pending' });
          break;
        
        case 'filter_in_progress':
          await this.sendTaskList(chatId, { status: 'in_progress' });
          break;
        
        case 'filter_completed':
          await this.sendTaskList(chatId, { status: 'completed' });
          break;
        
        case 'filter_high_priority':
          await this.sendTaskList(chatId, { priority: 'high' });
          break;
        
        default:
          // Handle task-specific actions
          if (data?.startsWith('complete_')) {
            const taskId = data.replace('complete_', '');
            const task = await this.taskRepo.getTaskById(taskId);
            
            if (!task) {
              await this.bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Task not found' });
              return;
            }
            
            // Always require description update before completion
            this.pendingEdits.set(userId, { taskId, field: 'description', nextAction: 'complete' });
            
            // Auto-clear edit context after 5 minutes
            setTimeout(() => {
              this.pendingEdits.delete(userId);
            }, 5 * 60 * 1000);
            
            // Show current description as reference
            const currentDesc = task.description ? `\n\n📄 Mô tả hiện tại:\n${task.description}` : '';
            
            await this.bot.sendMessage(
              chatId,
              this.escapeMarkdownV2(`📝 Vui lòng cập nhật mô tả chi tiết công việc trước khi hoàn thành:\n\nTask: `) + 
              this.escapeMarkdownV2(task.title) + 
              (currentDesc ? this.escapeMarkdownV2(currentDesc) : '') +
              this.escapeMarkdownV2(`\n\n⚠️ Nhập mô tả mới hoặc cập nhật mô tả hiện tại (ít nhất 10 ký tự).`),
              { 
                parse_mode: 'MarkdownV2',
                reply_markup: {
                  force_reply: true,
                  input_field_placeholder: task.description || 'Nhập mô tả chi tiết công việc đã làm...'
                }
              }
            );
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: '📝 Cập nhật mô tả để hoàn thành' });
            
          } else if (data?.startsWith('pending_')) {
            const taskId = data.replace('pending_', '');
            await this.taskRepo.updateTask({ id: taskId, status: 'pending' });
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Task marked as pending' });
            // Update the message to reflect new status
            await this.updateTaskMessage(callbackQuery.message, taskId);
            
          } else if (data?.startsWith('edit_title_')) {
            const taskId = data.replace('edit_title_', '');
            // Store editing context
            this.pendingEdits.set(userId, { taskId, field: 'title' });
            
            // Auto-clear edit context after 5 minutes
            setTimeout(() => {
              this.pendingEdits.delete(userId);
            }, 5 * 60 * 1000);
            
            await this.bot.sendMessage(
              chatId,
              this.escapeMarkdownV2(`✏️ Please type the new title for this task:\n\nCurrent task ID: ${taskId.slice(0, 8)}`),
              { 
                parse_mode: 'MarkdownV2',
                reply_markup: {
                  force_reply: true,
                  input_field_placeholder: 'Enter new title...'
                }
              }
            );
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Type the new title' });
            
          } else if (data?.startsWith('edit_desc_')) {
            const taskId = data.replace('edit_desc_', '');
            // Store editing context
            this.pendingEdits.set(userId, { taskId, field: 'description' });
            
            // Auto-clear edit context after 5 minutes
            setTimeout(() => {
              this.pendingEdits.delete(userId);
            }, 5 * 60 * 1000);
            
            await this.bot.sendMessage(
              chatId,
              this.escapeMarkdownV2(`📝 Please type the new description for this task:\n\nCurrent task ID: ${taskId.slice(0, 8)}`),
              { 
                parse_mode: 'MarkdownV2',
                reply_markup: {
                  force_reply: true,
                  input_field_placeholder: 'Enter new description...'
                }
              }
            );
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Type the new description' });
            
          } else if (data?.startsWith('details_')) {
            const taskId = data.replace('details_', '');
            const task = await this.taskRepo.getTaskById(taskId);
            if (task) {
              await this.sendTaskDetails(chatId, task);
            }
            await this.bot.answerCallbackQuery(callbackQuery.id);
            
          } else if (data?.startsWith('page_')) {
            const page = parseInt(data.replace('page_', ''));
            await this.sendTaskList(chatId, {}, undefined, page);
            
          } else if (data?.startsWith('admin_page_')) {
            const page = parseInt(data.replace('admin_page_', ''));
            await this.sendAllTasksList(chatId, page);
            
          } else if (data === 'current_page') {
            // Do nothing, just acknowledge
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Current page' });
            return;
            
          } else if (data?.startsWith('user_detail_')) {
            const userId = data.replace('user_detail_', '');
            await this.sendUserDetailedReport(chatId, userId);
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Loading details...' });
            
          } else if (data === 'back_to_report') {
            await this.bot.sendMessage(
              chatId,
              this.escapeMarkdownV2('ℹ️ Sử dụng lệnh /report để xem lại báo cáo tổng quan'),
              { parse_mode: 'MarkdownV2' }
            );
            await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Use /report to see overview' });
          }
      }
    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async updateTaskMessage(message: any, taskId: string) {
    if (!message) return;
    
    try {
      const task = await this.taskRepo.getTaskById(taskId);
      if (!task) return;

      const statusEmojis: Record<string, string> = {
        pending: '⏳',
        in_progress: '🔄',
        completed: '✅',
        cancelled: '❌'
      };
      const statusEmoji = statusEmojis[task.status] || '❓';

      const priorityEmojis: Record<string, string> = {
        urgent: '🔴',
        high: '🟡',
        medium: '🟢',
        low: '⚪'
      };
      const priorityEmoji = priorityEmojis[task.priority] || '⚫';

      let newMessage = `${statusEmoji} ${priorityEmoji} *${this.escapeMarkdownV2(task.title)}*\n`;
      
      if (task.description) {
        const shortDescription = task.description.length > 100 
          ? task.description.slice(0, 100) + '...' 
          : task.description;
        newMessage += `📝 ${this.escapeMarkdownV2(shortDescription)}\n`;
      }
      
      newMessage += `🆔 \`${task.id.slice(0, 8)}\`\n`;
      
      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        const today = new Date();
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let dueDateStr = dueDate.toLocaleDateString();
        if (diffDays === 0) dueDateStr += ' (Today!)';
        else if (diffDays === 1) dueDateStr += ' (Tomorrow)';
        else if (diffDays < 0) dueDateStr += ` (${Math.abs(diffDays)} days overdue!)`;
        
        newMessage += `📅 ${this.escapeMarkdownV2(dueDateStr)}\n`;
      }

      // Update buttons based on new status
      const keyboard: any[][] = [];
      
      if (task.status === 'completed') {
        keyboard.push([
          { text: '⏳ Mark as Pending', callback_data: `pending_${task.id}` }
        ]);
      } else {
        keyboard.push([
          { text: '✅ Mark as Complete', callback_data: `complete_${task.id}` }
        ]);
      }
      
      keyboard.push([
        { text: '✏️ Edit Title', callback_data: `edit_title_${task.id}` },
        { text: '📝 Edit Description', callback_data: `edit_desc_${task.id}` }
      ]);
      
      keyboard.push([
        { text: '📋 View Details', callback_data: `details_${task.id}` }
      ]);

      await this.bot.editMessageText(newMessage, {
        chat_id: message.chat.id,
        message_id: message.message_id,
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      console.error('Error updating task message:', error);
    }
  }

  private escapeMarkdownV2(text: string): string {
    return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  private async sendLongMessage(chatId: number, text: string, parseMode: 'MarkdownV2' | 'HTML' = 'MarkdownV2'): Promise<void> {
    const MAX_LENGTH = 4000; // Leave some buffer for safety
    
    // If message is short enough, send as is
    if (text.length <= MAX_LENGTH) {
      await this.bot.sendMessage(chatId, text, { parse_mode: parseMode });
      return;
    }

    // Split intelligently by sections
    const messages: string[] = [];
    
    // First try to split by major sections (for reports)
    const majorSections = text.split(/(?=\n\*(?:📊|📈|⚠️|🏆|📌))/);
    
    let currentMessage = '';
    
    for (const section of majorSections) {
      // Check if this is a user section (medal or number)
      const userSections = section.split(/(?=\n(?:🥇|🥈|🥉|\d+\.) )/);
      
      for (const userSection of userSections) {
        // If adding this would exceed limit, save current and start new
        if (currentMessage.length + userSection.length > MAX_LENGTH) {
          if (currentMessage.trim()) {
            messages.push(currentMessage.trim());
          }
          currentMessage = userSection;
        } else {
          currentMessage += userSection;
        }
      }
    }
    
    // Add remaining content
    if (currentMessage.trim()) {
      messages.push(currentMessage.trim());
    }
    
    // Send all messages with small delay
    for (let i = 0; i < messages.length; i++) {
      if (i === 0) {
        await this.bot.sendMessage(chatId, messages[i], { parse_mode: parseMode });
      } else {
        // Add continuation marker for subsequent messages
        const continuationMessage = `\\.\\.\\.tiếp theo \\(${i + 1}/${messages.length}\\)\n\n${messages[i]}`;
        await this.bot.sendMessage(chatId, continuationMessage, { parse_mode: parseMode });
      }
      
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between messages
      }
    }
  }

  // User management methods
  private async checkUserActive(telegramId: number, chatId: number): Promise<boolean> {
    const user = await this.userRepo.getUserByTelegramId(telegramId);
    if (!user) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2('🚫 You need to register first. Use /register command.'),
        { parse_mode: 'MarkdownV2' }
      );
      return false;
    }
    
    if (user.status !== 'active') {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2('⏳ Your account is inactive. Please wait for admin approval.'),
        { parse_mode: 'MarkdownV2' }
      );
      return false;
    }

    return true;
  }

  private async checkUserAdmin(telegramId: number, chatId: number): Promise<boolean> {
    const user = await this.userRepo.getUserByTelegramId(telegramId);
    if (!user) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2('🚫 You need to register first. Use /register command.'),
        { parse_mode: 'MarkdownV2' }
      );
      return false;
    }
    
    if (user.status !== 'active' || user.role !== 'admin') {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2('🚫 Admin access required for this command.'),
        { parse_mode: 'MarkdownV2' }
      );
      return false;
    }

    return true;
  }

  private async handleRegisterCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    // Check if already registered
    const existingUser = await this.userRepo.getUserByTelegramId(telegramId);
    if (existingUser) {
      const statusMessage = existingUser.status === 'active' 
        ? '✅ You are already registered and active'
        : '⏳ You are already registered but inactive. Please wait for admin approval.';
      
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(statusMessage),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    // Start registration process
    this.pendingRegistrations.set(telegramId, { step: 'email', data: {} });
    
    await this.bot.sendMessage(
      msg.chat.id,
      this.escapeMarkdownV2('📝 Registration Process\n\nPlease provide your email address (must be real email):'),
      { parse_mode: 'MarkdownV2' }
    );
  }

  private async handleRegistrationStep(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    const registration = this.pendingRegistrations.get(telegramId);
    if (!registration) return;

    const userInput = msg.text?.trim();
    if (!userInput) return;

    switch (registration.step) {
      case 'email':
        if (this.isValidEmail(userInput)) {
          // Check if email already exists
          const emailExists = await this.userRepo.emailExists(userInput);
          if (emailExists) {
            await this.bot.sendMessage(
              msg.chat.id,
              this.escapeMarkdownV2('❌ This email is already registered. Please use a different email:'),
              { parse_mode: 'MarkdownV2' }
            );
            return;
          }

          registration.data.email = userInput;
          registration.step = 'name';
          this.pendingRegistrations.set(telegramId, registration);
          
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('✅ Email accepted\n\nNow please provide your full name:'),
            { parse_mode: 'MarkdownV2' }
          );
        } else {
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('❌ Invalid email format. Please provide a valid email address:'),
            { parse_mode: 'MarkdownV2' }
          );
        }
        break;

      case 'name':
        if (userInput.length >= 2) {
          registration.data.name = userInput;
          
          // Create user
          try {
            const newUser = await this.userRepo.createUser({
              telegram_id: telegramId,
              email: registration.data.email,
              name: registration.data.name,
              role: 'user',
              status: 'inactive'
            });

            this.pendingRegistrations.delete(telegramId);

            await this.bot.sendMessage(
              msg.chat.id,
              this.escapeMarkdownV2(`✅ Registration completed successfully!\n\n📧 Email: ${newUser.email}\n👤 Name: ${newUser.name}\n📊 Status: ${newUser.status}\n🎭 Role: ${newUser.role}\n\n⏳ Your account is currently inactive. Please wait for admin approval to start using the bot.`),
              { parse_mode: 'MarkdownV2' }
            );

          } catch (error) {
            this.pendingRegistrations.delete(telegramId);
            await this.bot.sendMessage(
              msg.chat.id,
              this.escapeMarkdownV2(`❌ Registration failed: ${error instanceof Error ? error.message : String(error)}`),
              { parse_mode: 'MarkdownV2' }
            );
          }
        } else {
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2('❌ Name too short. Please provide your full name (minimum 2 characters):'),
            { parse_mode: 'MarkdownV2' }
          );
        }
        break;
    }
  }

  private async handleEditStep(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    const editContext = this.pendingEdits.get(telegramId);
    if (!editContext) return;

    const userInput = msg.text?.trim();
    if (!userInput) return;

    const { taskId, field, nextAction } = editContext;
    
    console.log('[EDIT_STEP] Processing edit:', {
      telegramId,
      taskId,
      field,
      nextAction,
      userInput: userInput.substring(0, 100) + (userInput.length > 100 ? '...' : ''),
      inputLength: userInput.length
    });

    try {
      // Get the task to ensure it exists
      const task = await this.taskRepo.getTaskById(taskId);
      if (!task) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ Task not found. The task may have been deleted.'),
          { parse_mode: 'MarkdownV2' }
        );
        this.pendingEdits.delete(telegramId);
        return;
      }

      // Check if the user owns the task or is an admin
      const user = await this.userRepo.getUserByTelegramId(telegramId);
      if (!user) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ User not found. Please register first.'),
          { parse_mode: 'MarkdownV2' }
        );
        this.pendingEdits.delete(telegramId);
        return;
      }

      // Only allow user to edit their own tasks unless they're admin
      if (task.user_id !== user.id && user.role !== 'admin') {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ You can only edit your own tasks.'),
          { parse_mode: 'MarkdownV2' }
        );
        this.pendingEdits.delete(telegramId);
        return;
      }

      // Update the task based on the field
      const updateData: any = { id: taskId };
      if (field === 'title') {
        updateData.title = userInput;
      } else if (field === 'description') {
        updateData.description = userInput;
      }

      const updatedTask = await this.taskRepo.updateTask(updateData);
      
      if (updatedTask) {
        // Check if this was an update before completion
        if (nextAction === 'complete' && field === 'description') {
          // Validate description length
          if (userInput.length < 10) {
            console.log('[COMPLETE_TASK] Description too short:', userInput);
            await this.bot.sendMessage(
              msg.chat.id,
              this.escapeMarkdownV2('⚠️ Mô tả quá ngắn. Cần ít nhất 10 ký tự. Vui lòng thử lại.'),
              { parse_mode: 'MarkdownV2' }
            );
            return; // Keep the edit context active
          }
          
          console.log('[COMPLETE_TASK] Completing task with description:', {
            taskId,
            userInput,
            updatedTask: updatedTask?.description
          });
          
          // Complete the task now
          const completedTask = await this.taskRepo.updateTask({ id: taskId, status: 'completed' });
          if (completedTask) {
            const messageContent = `✅ Task hoàn thành thành công\\n\\n📋 \\*${this.escapeMarkdownV2(completedTask.title)}\\*\\n📝 ${this.escapeMarkdownV2(completedTask.description || '')}\\n✨ Trạng thái: Completed`;
            
            console.log('[COMPLETE_TASK] Sending success message:', messageContent);
            
            await this.bot.sendMessage(
              msg.chat.id,
              messageContent,
              { parse_mode: 'MarkdownV2' }
            );
          }
        } else {
          // Normal update
          await this.bot.sendMessage(
            msg.chat.id,
            this.escapeMarkdownV2(`✅ Task ${field} updated successfully\\n\\n📋 *${updatedTask.title}*\\n${field === 'description' ? `📝 ${updatedTask.description || 'No description'}` : ''}`),
            { parse_mode: 'MarkdownV2' }
          );
        }
      } else {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ Failed to update task. Please try again.'),
          { parse_mode: 'MarkdownV2' }
        )
      }

      // Clear the edit context
      this.pendingEdits.delete(telegramId);

    } catch (error) {
      this.pendingEdits.delete(telegramId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error('[EDIT_STEP] Error updating task:', {
        error,
        errorMessage,
        taskId: editContext?.taskId,
        field: editContext?.field,
        nextAction: editContext?.nextAction
      });
      
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error updating task: ${errorMessage}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async handleUsersCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    try {
      const users = await this.userRepo.getAllUsers();
      
      if (users.length === 0) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('📋 No users found.'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      let message = `👥 *Users List* \\(${users.length} users\\)\n\n`;
      
      users.forEach((user, index) => {
        const statusEmoji = user.status === 'active' ? '✅' : '⏳';
        const roleEmoji = user.role === 'admin' ? '👑' : '👤';
        const createdDate = new Date(user.created_at).toLocaleDateString();
        
        message += `${statusEmoji} ${roleEmoji} *${this.escapeMarkdownV2(user.name)}*\n`;
        message += `   📧 ${this.escapeMarkdownV2(user.email)}\n`;
        message += `   📱 Telegram ID: \`${user.telegram_id}\`\n`;
        message += `   📊 Status: ${this.escapeMarkdownV2(user.status)}\n`;
        message += `   🎭 Role: ${this.escapeMarkdownV2(user.role)}\n`;
        message += `   📅 Registered: ${this.escapeMarkdownV2(createdDate)}\n`;
        message += `   🔑 ID: \`${user.id.slice(0, 8)}\`\n\n`;
      });

      await this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'MarkdownV2' });

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error loading users: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleActivateCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    const commandParts = msg.text?.split(' ');
    if (!commandParts || commandParts.length < 2) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('❌ Usage: /activate <telegram_id> or /activate <email>'),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const identifier = commandParts[1];

    try {
      let user: User | null = null;

      // Try to find user by telegram ID first (numeric), then by email
      if (/^\d+$/.test(identifier)) {
        user = await this.userRepo.getUserByTelegramId(parseInt(identifier));
      } else {
        user = await this.userRepo.getUserByEmail(identifier);
      }

      if (!user) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ User not found.'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      if (user.status === 'active') {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2(`✅ User ${user.name} is already active.`),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      const updatedUser = await this.userRepo.activateUser(user.id);
      if (updatedUser) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2(`✅ User ${updatedUser.name} has been activated successfully!`),
          { parse_mode: 'MarkdownV2' }
        );

        // Send notification to the activated user
        await this.bot.sendMessage(
          updatedUser.telegram_id,
          this.escapeMarkdownV2(`🎉 Congratulations! Your account has been activated by an admin.\n\nYou can now use all bot features. Type /help to get started.`),
          { parse_mode: 'MarkdownV2' }
        );
      }

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error activating user: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleReportCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    try {
      await this.bot.sendChatAction(msg.chat.id, 'typing');
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('📊 Generating daily report...'),
        { parse_mode: 'MarkdownV2' }
      );

      // Generate full detailed report
      const report = await this.dailyReportService.generateAndSendDailyReport(false, false);
      
      // Send report with detail buttons
      await this.sendReportWithDetailButtons(msg.chat.id, report);

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error generating report: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleSetReportTimeCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    const commandParts = msg.text?.split(' ');
    if (!commandParts || commandParts.length < 2) {
      const currentTime = this.dailyReportService.getReportTimeDisplay();
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`⏰ Current report time: ${currentTime}\n\nUsage: /setreporttime HH:MM (24-hour format)\nExample: /setreporttime 20:00`),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const timeStr = commandParts[1];
    const timeParts = timeStr.split(':');
    
    if (timeParts.length !== 2) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('❌ Invalid time format. Use HH:MM (e.g., 20:00)'),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const hour = parseInt(timeParts[0]);
    const minute = parseInt(timeParts[1]);

    try {
      this.dailyReportService.setReportTime(hour, minute);
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`✅ Report time set to ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`),
        { parse_mode: 'MarkdownV2' }
      );
    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleDeleteUserCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    const commandParts = msg.text?.split(' ');
    if (!commandParts || commandParts.length < 2) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('❌ Usage: /deleteuser <telegram_id> or /deleteuser <email>'),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const identifier = commandParts.slice(1).join(' ');

    try {
      let user: User | null = null;

      // Try to find user by telegram ID first (numeric), then by email
      if (/^\d+$/.test(identifier)) {
        user = await this.userRepo.getUserByTelegramId(parseInt(identifier));
      } else {
        user = await this.userRepo.getUserByEmail(identifier);
      }

      if (!user) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ User not found.'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      // Prevent deleting self
      if (user.telegram_id === telegramId) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ You cannot delete yourself'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      // Get task count before deletion
      const taskCount = await this.taskRepo.getUserTaskCount(user.id);

      // Delete user (will cascade delete tasks due to foreign key)
      const deleted = await this.userRepo.deleteUser(user.id);

      if (deleted) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2(`✅ User ${user.name} (${user.email}) has been deleted successfully!\n\n📊 Deleted: 1 user, ${taskCount} tasks`),
          { parse_mode: 'MarkdownV2' }
        );

        // Try to notify the deleted user
        try {
          await this.bot.sendMessage(
            user.telegram_id,
            this.escapeMarkdownV2(`⚠️ Your account has been deleted by an admin.\n\nAll your data has been removed from the system.`),
            { parse_mode: 'MarkdownV2' }
          );
        } catch (error) {
          // User might have blocked the bot
        }
      } else {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ Failed to delete user.'),
          { parse_mode: 'MarkdownV2' }
        );
      }

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error deleting user: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleEditUserCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    const commandParts = msg.text?.split(' ');
    if (!commandParts || commandParts.length < 3) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('❌ Usage: /edituser <telegram_id|email> <new_name>\n\nExample: /edituser user@email.com John Doe'),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const identifier = commandParts[1];
    const newName = commandParts.slice(2).join(' ');

    if (newName.length < 2) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('❌ Name must be at least 2 characters long.'),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    try {
      let user: User | null = null;

      // Try to find user by telegram ID first (numeric), then by email
      if (/^\d+$/.test(identifier)) {
        user = await this.userRepo.getUserByTelegramId(parseInt(identifier));
      } else {
        user = await this.userRepo.getUserByEmail(identifier);
      }

      if (!user) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ User not found.'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      const oldName = user.name;
      const updatedUser = await this.userRepo.updateUser({
        id: user.id,
        name: newName
      });

      if (updatedUser) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2(`✅ User name updated successfully!\n\n👤 Old name: ${oldName}\n👤 New name: ${updatedUser.name}\n📧 Email: ${updatedUser.email}`),
          { parse_mode: 'MarkdownV2' }
        );

        // Notify the user about the change
        try {
          await this.bot.sendMessage(
            updatedUser.telegram_id,
            this.escapeMarkdownV2(`ℹ️ Your account name has been updated by an admin.\n\n👤 Old name: ${oldName}\n👤 New name: ${updatedUser.name}`),
            { parse_mode: 'MarkdownV2' }
          );
        } catch (error) {
          // User might have blocked the bot
        }
      } else {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❌ Failed to update user name.'),
          { parse_mode: 'MarkdownV2' }
        );
      }

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error updating user: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleReminderCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    try {
      await this.bot.sendChatAction(msg.chat.id, 'typing');
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('🔔 Sending work reminders to all users...'),
        { parse_mode: 'MarkdownV2' }
      );

      await this.dailyReportService.sendWorkReminder();
      
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('✅ Work reminders sent successfully'),
        { parse_mode: 'MarkdownV2' }
      );

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error sending reminders: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleSetReminderTimeCommand(msg: TelegramBot.Message) {
    const telegramId = msg.from?.id;
    if (!telegramId) return;

    if (!await this.checkUserAdmin(telegramId, msg.chat.id)) {
      return;
    }

    const commandParts = msg.text?.split(' ');
    if (!commandParts || commandParts.length < 2) {
      const currentTime = this.dailyReportService.getReminderTimeDisplay();
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`⏰ Current reminder time: ${currentTime}\n\nUsage: /setremindertime HH:MM (24-hour format)\nExample: /setremindertime 15:00`),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const timeStr = commandParts[1];
    const timeParts = timeStr.split(':');
    
    if (timeParts.length !== 2) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2('❌ Invalid time format. Use HH:MM (e.g., 15:00)'),
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const hour = parseInt(timeParts[0]);
    const minute = parseInt(timeParts[1]);

    try {
      this.dailyReportService.setReminderTime(hour, minute);
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`✅ Reminder time set to ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`),
        { parse_mode: 'MarkdownV2' }
      );
    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  async sendDirectMessage(telegramId: number, message: string, isMarkdown: boolean = false): Promise<void> {
    try {
      if (isMarkdown) {
        const escapedMessage = this.escapeMarkdownV2(message);
        await this.sendLongMessage(telegramId, escapedMessage, 'MarkdownV2');
      } else {
        // For non-markdown, still check length
        if (message.length > 4000) {
          const chunks = this.splitMessage(message, 4000);
          for (const chunk of chunks) {
            await this.bot.sendMessage(telegramId, chunk);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          await this.bot.sendMessage(telegramId, message);
        }
      }
    } catch (error) {
      console.error(`Failed to send message to ${telegramId}:`, error);
    }
  }

  private async sendUserDetailedReport(chatId: number, userId: string): Promise<void> {
    try {
      // Get user info
      const user = await this.userRepo.getUserById(userId);
      if (!user) {
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2('❌ User not found'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }
      
      // Get user's tasks today
      const todayTasks = await this.taskRepo.getUserDailyTasks(userId);
      const activity = await this.taskRepo.getUserActivityToday(userId);
      
      const pendingTasks = todayTasks.filter(t => t.status === 'pending');
      const completedTasks = todayTasks.filter(t => t.status === 'completed');
      const cancelledTasks = todayTasks.filter(t => t.status === 'cancelled');
      
      // Build detailed report
      let message = `📊 \\*CHI TIẾT BÁO CÁO \\- ${this.escapeMarkdownV2(user.name)}\\*\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      message += `\\*📈 Thống kê hôm nay:\\*\n`;
      message += `• Tạo mới: ${activity.created_today} tasks\n`;
      message += `• Hoàn thành: ${activity.completed_today} tasks\n`;
      message += `• Đang chờ: ${activity.pending_tasks} tasks\n`;
      message += `• Cập nhật: ${activity.updated_today} tasks\n\n`;
      
      if (completedTasks.length > 0) {
        message += `\\*✅ Tasks đã hoàn thành \\(${completedTasks.length}\\):\\*\n\n`;
        completedTasks.forEach((task, index) => {
          message += `${index + 1}\\. \\*Title:\\* ${this.escapeMarkdownV2(task.title)}\n`;
          if (task.description) {
            message += `   \\*Description:\\* ${this.escapeMarkdownV2(task.description.substring(0, 100) + (task.description.length > 100 ? '...' : ''))}\n`;
          }
          if (task.category) {
            message += `   \\*Category:\\* ${this.escapeMarkdownV2(task.category)}\n`;
          }
          if (task.tags && task.tags.length > 0) {
            message += `   \\*Tags:\\* ${this.escapeMarkdownV2(task.tags.join(', '))}\n`;
          }
          message += '\n';
        });
      }
      
      if (pendingTasks.length > 0) {
        message += `\\*⏳ Tasks đang thực hiện \\(${pendingTasks.length}\\):\\*\n\n`;
        pendingTasks.forEach((task, index) => {
          const priorityEmoji = task.priority === 'urgent' ? '🔴' : 
                               task.priority === 'high' ? '🟡' : 
                               task.priority === 'medium' ? '🟢' : '⚪';
          message += `${index + 1}\\. \\*Title:\\* ${this.escapeMarkdownV2(task.title)}\n`;
          message += `   \\*Priority:\\* ${priorityEmoji} ${this.escapeMarkdownV2(task.priority)}\n`;
          
          if (task.due_date) {
            const dueDate = new Date(task.due_date);
            const today = new Date();
            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let deadlineStatus = '';
            if (diffDays < 0) {
              deadlineStatus = `⚠️ Quá hạn ${Math.abs(diffDays)} ngày`;
            } else if (diffDays === 0) {
              deadlineStatus = '📅 Hạn hôm nay';
            } else if (diffDays === 1) {
              deadlineStatus = '📅 Hạn ngày mai';
            } else {
              deadlineStatus = `📅 Còn ${diffDays} ngày`;
            }
            message += `   \\*Deadline:\\* ${this.escapeMarkdownV2(deadlineStatus)} \\(${this.escapeMarkdownV2(dueDate.toLocaleDateString('vi-VN'))}\\)\n`;
          }
          
          if (task.description) {
            message += `   \\*Description:\\* ${this.escapeMarkdownV2(task.description.substring(0, 100) + (task.description.length > 100 ? '...' : ''))}\n`;
          }
          
          if (task.category) {
            message += `   \\*Category:\\* ${this.escapeMarkdownV2(task.category)}\n`;
          }
          
          if (task.tags && task.tags.length > 0) {
            message += `   \\*Tags:\\* ${this.escapeMarkdownV2(task.tags.join(', '))}\n`;
          }
          
          message += `   \\*Status:\\* ${this.escapeMarkdownV2(task.status)}\n`;
          message += `   \\*Created:\\* ${this.escapeMarkdownV2(new Date(task.created_at).toLocaleDateString('vi-VN'))}\n`;
          message += '\n';
        });
      }
      
      if (cancelledTasks.length > 0) {
        message += `\\*❌ Tasks đã hủy \\(${cancelledTasks.length}\\):\\*\n`;
        cancelledTasks.slice(0, 3).forEach((task, index) => {
          message += `${index + 1}\\. ${this.escapeMarkdownV2(task.title)}\n`;
        });
        if (cancelledTasks.length > 3) {
          message += `\\.\\.\\. và ${cancelledTasks.length - 3} tasks khác\n`;
        }
      }
      
      // Send detailed report
      await this.bot.sendMessage(
        chatId,
        message,
        { 
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [[
              { text: '⬅️ Quay lại', callback_data: 'back_to_report' }
            ]]
          }
        }
      );
      
    } catch (error) {
      console.error('Error sending user detailed report:', error);
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error loading details: ${error instanceof Error ? error.message : String(error)}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async sendReportWithDetailButtons(chatId: number, report: string): Promise<void> {
    // Get user activities for adding buttons
    const { TaskRepository } = await import('../database/tasks.js');
    const taskRepo = new TaskRepository();
    const userActivities = await taskRepo.getAllUsersActivityToday();
    const { UserRepository } = await import('../database/users.js');
    const userRepo = new UserRepository();
    const allUsers = await userRepo.getAllUsers({ status: 'active', role: 'user' });
    
    // Split report by user sections
    const sections = report.split(/(?=\n(?:🥇|🥈|🥉|\d+\.) )/);
    
    // Send overview section first
    if (sections[0] && !sections[0].startsWith('🥇') && !sections[0].startsWith('🥈')) {
      await this.bot.sendMessage(chatId, this.escapeMarkdownV2(sections[0].trim()), { parse_mode: 'MarkdownV2' });
    }
    
    // Process each user section
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      
      // Try to extract user name from section
      let userId = null;
      for (const user of allUsers) {
        if (section.includes(user.name)) {
          userId = user.id;
          break;
        }
      }
      
      // Send section with or without button
      if (userId) {
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2(section.trim()),
          {
            parse_mode: 'MarkdownV2',
            reply_markup: {
              inline_keyboard: [[
                { text: '📋 Xem chi tiết đầy đủ', callback_data: `user_detail_${userId}` }
              ]]
            }
          }
        );
      } else {
        // For summary section or sections without identified user
        await this.bot.sendMessage(chatId, this.escapeMarkdownV2(section.trim()), { parse_mode: 'MarkdownV2' });
      }
      
      // Small delay between messages
      if (i < sections.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private async sendReportWithUserButtons(chatId: number, report: string, userActivities: any[], allUsers: any[]): Promise<void> {
    // Send the overview part first (without user details)
    const overviewEndIndex = report.indexOf('*🏆 BẢNG XẾP HẠNG HOẠT ĐỘNG:*');
    if (overviewEndIndex > 0) {
      const overview = report.substring(0, overviewEndIndex);
      await this.bot.sendMessage(chatId, this.escapeMarkdownV2(overview), { parse_mode: 'MarkdownV2' });
    }
    
    // Send header for ranking
    await this.bot.sendMessage(
      chatId, 
      this.escapeMarkdownV2('*🏆 BẢNG XẾP HẠNG HOẠT ĐỘNG:*'),
      { parse_mode: 'MarkdownV2' }
    );
    
    // Sort activities
    const sortedActivities = userActivities.sort((a: any, b: any) => 
      (parseInt(b.created_today, 10) + parseInt(b.completed_today, 10)) - 
      (parseInt(a.created_today, 10) + parseInt(a.completed_today, 10))
    );
    
    // Send each user summary with detail button
    for (let i = 0; i < sortedActivities.length; i++) {
      const activity = sortedActivities[i];
      const user = allUsers.find((u: any) => u.id === activity.user_id);
      if (!user) continue;
      
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const createdToday = parseInt(activity.created_today, 10);
      const completedToday = parseInt(activity.completed_today, 10);
      const completionRate = createdToday > 0 
        ? Math.round((completedToday / createdToday) * 100) 
        : 0;
      
      // Performance emoji
      let performanceEmoji = '';
      if (completionRate >= 80) performanceEmoji = '🔥';
      else if (completionRate >= 60) performanceEmoji = '💪';
      else if (completionRate >= 40) performanceEmoji = '📈';
      else if (completionRate > 0) performanceEmoji = '🌱';
      else performanceEmoji = '💤';
      
      const userSummary = `${medal} *${user.name}* ${performanceEmoji}\n` +
        `📝 Tạo: ${createdToday} | ✅ Hoàn thành: ${completedToday} | 🎯 ${completionRate}%`;
      
      // Send with detail button
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(userSummary),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: {
            inline_keyboard: [[
              { text: '📋 Xem chi tiết', callback_data: `user_detail_${user.id}` }
            ]]
          }
        }
      );
      
      // Small delay between messages
      if (i < sortedActivities.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Send summary section
    const summaryIndex = report.indexOf('*📌 ĐÁNH GIÁ & KHUYẾN NGHỊ:*');
    if (summaryIndex > 0) {
      const summary = report.substring(summaryIndex);
      await this.bot.sendMessage(chatId, this.escapeMarkdownV2(summary), { parse_mode: 'MarkdownV2' });
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  async sendNotification(title: string, message: string): Promise<void> {
    try {
      const formattedMessage = `🔔 *${this.escapeMarkdownV2(title)}*\n\n${this.escapeMarkdownV2(message)}`;
      await this.bot.sendMessage(this.chatId, formattedMessage, { parse_mode: 'MarkdownV2' });
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }

  async startBot(): Promise<void> {
    console.log('🤖 Telegram bot started successfully');
    // Start daily report scheduler
    this.dailyReportService.startScheduler();
  }

  async stopBot(): Promise<void> {
    this.bot.stopPolling();
    this.dailyReportService.stopScheduler();
  }
}