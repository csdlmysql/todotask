import TelegramBot from 'node-telegram-bot-api';
import { TelegramConfig, Task } from '../types/index.js';
import { GeminiService } from './gemini.js';
import { TaskRepository } from '../database/tasks.js';

export class TelegramService {
  private bot: TelegramBot;
  private chatId: string;
  private geminiService: GeminiService;
  private taskRepo: TaskRepository;

  constructor(config: TelegramConfig, geminiApiKey: string) {
    this.bot = new TelegramBot(config.token, { polling: true });
    this.chatId = config.chatId;
    this.geminiService = new GeminiService(geminiApiKey);
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
    const command = msg.text?.split(' ')[0].toLowerCase();

    switch (command) {
      case '/start':
      case '/help':
        await this.sendWelcomeMessage(msg.chat.id);
        break;
      
      case '/tasks':
        await this.sendTaskList(msg.chat.id);
        break;
      
      case '/stats':
        await this.sendTaskStats(msg.chat.id);
        break;
      
      default:
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2('❓ Unknown command. Type /help for available commands.'),
          { parse_mode: 'MarkdownV2' }
        );
    }
  }

  private async handleNaturalLanguage(msg: TelegramBot.Message) {
    try {
      await this.bot.sendChatAction(msg.chat.id, 'typing');

      const response = await this.geminiService.processNaturalLanguage(msg.text || '');

      if (response.needsMoreInfo) {
        await this.bot.sendMessage(
          msg.chat.id,
          this.escapeMarkdownV2(`🤖 ${response.text}`),
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      const result = await this.executeFunction(response);
      const aiResponse = await this.geminiService.generateResponse(msg.text || '', result);

      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`🤖 ${aiResponse}`),
        { parse_mode: 'MarkdownV2' }
      );

      // Send formatted task details if it was a create or update operation
      if (response.name === 'create_task' && result) {
        await this.sendTaskDetails(msg.chat.id, result);
      }

    } catch (error) {
      await this.bot.sendMessage(
        msg.chat.id,
        this.escapeMarkdownV2(`❌ Error: ${error}`),
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  private async executeFunction(functionCall: any): Promise<any> {
    const { name, args } = functionCall;

    switch (name) {
      case 'create_task':
        return await this.taskRepo.createTask({
          title: args.title,
          description: args.description,
          priority: args.priority || 'medium',
          due_date: args.due_date ? new Date(args.due_date) : undefined,
          category: args.category,
          tags: args.tags ? args.tags.split(',').map((t: string) => t.trim()) : undefined
        });

      case 'list_tasks':
        return await this.taskRepo.getTasks({
          status: args.status,
          priority: args.priority,
          category: args.category,
          limit: args.limit ? parseInt(args.limit) : undefined
        });

      case 'update_task':
        return await this.taskRepo.updateTask({
          id: args.id,
          title: args.title,
          description: args.description,
          status: args.status,
          priority: args.priority
        });

      case 'delete_task':
        return await this.taskRepo.deleteTask(args.id);

      case 'get_task_stats':
        return await this.taskRepo.getTaskStats(args.period);

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  private async sendWelcomeMessage(chatId: number) {
    const message = `
🎯 *Welcome to Task\\-Killer\\!*

I'm your AI\\-powered task management assistant\\. You can interact with me using natural language or commands\\.

*📋 Commands:*
• \\/tasks \\- View your task list
• \\/stats \\- View task statistics
• \\/help \\- Show this help message

*💬 Natural Language Examples:*
• "Create a high priority task to review the project proposal"
• "Show me all pending tasks"
• "Mark task abc123 as completed"
• "What tasks do I have due this week?"

Just type your request naturally and I'll help you manage your tasks\\! 🚀
`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
  }

  private async sendTaskList(chatId: number, filters?: any) {
    try {
      const tasks = await this.taskRepo.getTasks(filters);

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

        message += `${statusEmoji} ${priorityEmoji} *${this.escapeMarkdownV2(task.title)}*\n`;
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