import TelegramBot from 'node-telegram-bot-api';
import { TelegramConfig, Task } from '../types/index.js';
import { SmartTaskProcessor } from '../ai/SmartTaskProcessor.js';
import { TaskRepository } from '../database/tasks.js';

export class TelegramService {
  private bot: TelegramBot;
  private chatId: string;
  private smartProcessor: SmartTaskProcessor;
  private taskRepo: TaskRepository;

  constructor(config: TelegramConfig, geminiApiKey: string) {
    this.bot = new TelegramBot(config.token, { polling: true });
    this.chatId = config.chatId;
    this.smartProcessor = new SmartTaskProcessor(geminiApiKey);
    this.taskRepo = new TaskRepository();
    
    this.setupBotHandlers();
  }

  private setupBotHandlers() {
    this.bot.on('message', async (msg) => {
      if (msg.chat.id.toString() !== this.chatId) {
        return;
      }

      const messageText = msg.text || '';

      if (messageText.startsWith('/')) {
        await this.handleCommand(msg);
      } else {
        await this.handleNaturalLanguage(msg);
      }
    });

    this.bot.on('callback_query', async (callbackQuery) => {
      await this.handleCallbackQuery(callbackQuery);
    });
  }

  private async handleCommand(msg: TelegramBot.Message) {
    const command = msg.text?.split(' ')[0].toLowerCase().substring(1); // Remove '/' 

    switch (command) {
      case 'start':
      case 'help':
        await this.sendWelcomeMessage(msg.chat.id);
        break;
      
      case 'list':
      case 'tasks':
        await this.handleSmartCommand('list', msg.chat.id);
        break;
      
      case 'recent':
        await this.handleSmartCommand('recent', msg.chat.id);
        break;
      
      case 'stats':
        await this.handleSmartCommand('stats', msg.chat.id);
        break;
        
      case 'search':
        await this.handleSmartCommand('search', msg.chat.id);
        break;
        
      case 'export':
        await this.handleSmartCommand('export', msg.chat.id);
        break;
        
      case 'backup':
        await this.handleSmartCommand('backup', msg.chat.id);
        break;
        
      case 'config':
        await this.handleSmartCommand('config', msg.chat.id);
        break;
        
      case 'context':
      case 'debug':
        await this.handleSmartCommand('context', msg.chat.id);
        break;
        
      case 'reset':
        await this.handleSmartCommand('reset', msg.chat.id);
        break;
        
      case 'cleanup':
      case 'delete-by-status':
        await this.handleSmartCommand('cleanup', msg.chat.id);
        break;
      
      default:
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❓ Unknown command. Type /help for available commands.'),
          { parse_mode: 'MarkdownV2' }
        );
    }
  }

  // Handle Smart commands using SmartTaskProcessor
  private async handleSmartCommand(command: string, chatId: number) {
    try {
      await this.bot.sendChatAction(chatId, 'typing');

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
        this.escapeMarkdownV2(`❌ Error: ${error}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async handleNaturalLanguage(msg: TelegramBot.Message) {
    try {
      await this.bot.sendChatAction(msg.chat.id, 'typing');

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
          this.escapeMarkdownV2('💭 Tip: Be more specific so AI can understand better!'),
          { parse_mode: 'MarkdownV2' }
        );
      }

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error: ${error}`),
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

🎯 *Advanced Features:*
• Multi\\-task operations: "them 2 task: A, B"
• Bulk cleanup: "delete all completed tasks"  
• Context memory & natural language processing
• Performance analytics & productivity insights

*📋 Task Management Commands:*
• \\/list \\- View all tasks
• \\/recent \\- 10 most recent tasks
• \\/search \\- Search tasks
• \\/cleanup \\- Bulk delete by status

*📊 Analytics & Data Commands:*
• \\/stats \\- Detailed statistics
• \\/export \\- Export tasks to JSON
• \\/backup \\- Create full backup

*🔧 System Commands:*
• \\/config \\- View configuration
• \\/context \\- Debug context info
• \\/reset \\- Reset conversation context

*💬 Natural Language Examples:*
• "them 2 task sau: viet docs, fix bug"
• "delete all completed tasks"
• "mark task1, task2 as urgent priority"
• "show pending tasks with high priority"

*🧠 Smart Features:*
• Multi\\-Task Operations: Create/update/delete multiple tasks
• Bulk Cleanup: Delete all tasks by status
• Context Memory: AI remembers task references
• Performance Analytics: Track productivity patterns
• Natural Language Processing

Just chat naturally and I'll help you manage your tasks\\! 🚀
`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
  }

  private async sendTaskList(chatId: number, filters?: any, tasksData?: any[]) {
    try {
      const tasks = tasksData || await this.taskRepo.getTasks(filters);

      if (tasks.length === 0) {
        await this.bot.sendMessage(
          chatId,
          this.escapeMarkdownV2('🎉 No tasks found! You\'re all caught up!'),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      let message = `📋 *Task List* \\(${tasks.length} tasks\\)\n\n`;

      tasks.slice(0, 10).forEach((task, index) => {
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

        message += `${statusEmoji} ${priorityEmoji} *${this.escapeMarkdownV2(task.title)}*\n`;
        
        // Add description if exists
        if (task.description) {
          const shortDescription = task.description.length > 50 
            ? task.description.slice(0, 50) + '...' 
            : task.description;
          message += `   📝 ${this.escapeMarkdownV2(shortDescription)}\n`;
        }
        
        message += `   ID: \`${task.id.slice(0, 8)}\`\n`;
        
        if (task.due_date) {
          const dueDate = new Date(task.due_date).toLocaleDateString();
          message += `   📅 Due: ${this.escapeMarkdownV2(dueDate)}\n`;
        }
        
        message += '\n';
      });

      if (tasks.length > 10) {
        message += this.escapeMarkdownV2(`... and ${tasks.length - 10} more tasks`);
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 Statistics', callback_data: 'stats' },
            { text: '🔄 Refresh', callback_data: 'refresh_tasks' }
          ],
          [
            { text: '⏳ Pending', callback_data: 'filter_pending' },
            { text: '🔄 In Progress', callback_data: 'filter_in_progress' }
          ],
          [
            { text: '✅ Completed', callback_data: 'filter_completed' },
            { text: '🔴 High Priority', callback_data: 'filter_high_priority' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, message, { 
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard
      });

    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error loading tasks: ${error}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async sendTaskStats(chatId: number) {
    try {
      const stats = await this.taskRepo.getTaskStats();

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
        this.escapeMarkdownV2(`❌ Error loading statistics: ${error}`),
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
          if (data?.startsWith('complete_')) {
            const taskId = data.replace('complete_', '');
            await this.taskRepo.updateTask({ id: taskId, status: 'completed' });
            await this.bot.sendMessage(
              chatId,
              this.escapeMarkdownV2('✅ Task marked as completed!'),
              { parse_mode: 'MarkdownV2' }
            );
          } else if (data?.startsWith('progress_')) {
            const taskId = data.replace('progress_', '');
            await this.taskRepo.updateTask({ id: taskId, status: 'in_progress' });
            await this.bot.sendMessage(
              chatId,
              this.escapeMarkdownV2('🔄 Task marked as in progress!'),
              { parse_mode: 'MarkdownV2' }
            );
          }
      }
    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        this.escapeMarkdownV2(`❌ Error: ${error}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private escapeMarkdownV2(text: string): string {
    return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
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
    console.log('🤖 Telegram bot started successfully!');
  }

  async stopBot(): Promise<void> {
    this.bot.stopPolling();
  }
}