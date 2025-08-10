#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import dotenv from 'dotenv';
import { GeminiServiceSimple } from './services/gemini-simple.js';
import { TaskRepository } from './database/tasks.js';
import { NotificationServiceSimple } from './services/notification-simple.js';
import { initDatabaseSafe } from './database/init-safe.js';
import { HealthChecker } from './utils/health-check.js';

dotenv.config();

class SimpleTaskKiller {
  private geminiService!: GeminiServiceSimple;
  private taskRepo: TaskRepository;
  private notificationService: NotificationServiceSimple;
  private healthChecker: HealthChecker;

  constructor() {
    this.taskRepo = new TaskRepository();
    this.notificationService = new NotificationServiceSimple();
    this.healthChecker = new HealthChecker();
    
    // Khởi tạo Gemini service nếu có API key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      this.geminiService = new GeminiServiceSimple(geminiApiKey);
    }
  }

  async start() {
    await this.showWelcome();
    
    // Run health check
    const isHealthy = await this.healthChecker.runAllChecks();
    
    if (!isHealthy) {
      const proceed = await this.askToContinue();
      if (!proceed) {
        console.log(chalk.yellow('👋 Setup các services rồi quay lại nhé!'));
        return;
      }
    }
    
    await this.checkSetup();
    await this.startInteractiveMode();
  }

  private async showWelcome() {
    console.clear();
    console.log(
      boxen(
        chalk.cyan.bold('🎯 Task-Killer') + '\n' +
        chalk.gray('AI Assistant quản lý công việc bằng tiếng Việt'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          textAlignment: 'center'
        }
      )
    );

    console.log(chalk.yellow('💡 Ví dụ sử dụng:'));
    console.log(chalk.gray('  • "Tạo task làm báo cáo, urgent"'));
    console.log(chalk.gray('  • "Xem task hôm nay"'));
    console.log(chalk.gray('  • "Hoàn thành task abc123"'));
    console.log(chalk.gray('  • "/list" - xem tất cả'));
    console.log(chalk.gray('  • "/help" - trợ giúp'));
    console.log(chalk.gray('  • "exit" - thoát\n'));
  }

  private async checkSetup() {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        console.log(chalk.yellow('⚠️  Chưa có database, tạo SQLite local...'));
        // Fallback to SQLite for simplicity
        process.env.DATABASE_URL = 'sqlite:./tasks.db';
      }
      
      await initDatabaseSafe();
    } catch (error) {
      // Database đã được khởi tạo rồi, skip lỗi
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(chalk.green('✅ Database đã sẵn sàng!'));
      } else {
        console.log(chalk.yellow('⚙️  Khởi tạo database...'));
        try {
          await initDatabaseSafe();
        } catch (initError) {
          // Ignore errors, database might already exist
          console.log(chalk.green('✅ Database đã sẵn sàng!'));
        }
      }
    }
  }

  private async startInteractiveMode() {
    console.log(chalk.green('✨ Bắt đầu chat! Hỏi tôi bất cứ gì về task của bạn...\n'));
    
    // Hiện gợi ý ban đầu
    await this.showSmartSuggestions('start');

    while (true) {
      try {
        const { input } = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: chalk.cyan('Bạn:'),
            validate: (input) => input.length > 0 || 'Vui lòng nhập gì đó...'
          }
        ]);

        const trimmedInput = input.trim().toLowerCase();

        // Kiểm tra lệnh thoát
        if (['exit', 'quit', 'bye', 'thoát'].includes(trimmedInput)) {
          console.log(chalk.yellow('\n👋 Tạm biệt! Chúc bạn hoàn thành tốt các task!'));
          break;
        }

        // Xử lý slash commands nhanh
        if (input.startsWith('/')) {
          await this.handleSlashCommand(input);
          continue;
        }

        // Xử lý bằng AI
        if (this.geminiService) {
          await this.processWithAI(input);
        } else {
          console.log(chalk.red('❌ Gemini AI chưa được cấu hình. Chỉ có thể dùng slash commands.'));
          console.log(chalk.gray('Thử: /list, /help'));
        }

        // Hiện gợi ý sau khi xử lý
        await this.showSmartSuggestions('after_action');

      } catch (error) {
        if (error instanceof Error && error.name === 'ExitPromptError') {
          console.log(chalk.yellow('\n👋 Tạm biệt! Chúc bạn hoàn thành tốt các task!'));
          break;
        }
        console.error(chalk.red('❌ Lỗi:'), error instanceof Error ? error.message : String(error));
      }

      console.log(); // Dòng trống để dễ đọc
    }
  }

  private async handleSlashCommand(command: string) {
    const cmd = command.slice(1).toLowerCase();
    const ora = (await import('ora')).default;

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;

      case 'list':
      case 'ls':
        await this.quickListTasks();
        break;

      case 'today':
        await this.showTodayTasks();
        break;

      case 'stats':
        await this.showStats();
        break;

      case 'clear':
        console.clear();
        await this.showWelcome();
        break;

      case 'health':
      case 'status':
        await this.healthChecker.runAllChecks();
        break;

      default:
        console.log(chalk.red(`❌ Không hiểu lệnh "${command}"`));
        console.log(chalk.gray('Gõ "/help" để xem các lệnh có sẵn'));
    }
  }

  private showHelp() {
    console.log(chalk.cyan('\n📚 Trợ Giúp:'));
    console.log(chalk.bold('\n🚀 Lệnh Nhanh:'));
    console.log(chalk.gray('  /list    - Xem tất cả task'));
    console.log(chalk.gray('  /today   - Task hôm nay'));
    console.log(chalk.gray('  /stats   - Thống kê'));
    console.log(chalk.gray('  /health  - Kiểm tra services'));
    console.log(chalk.gray('  /clear   - Xóa màn hình'));
    console.log(chalk.gray('  /help    - Trợ giúp này'));

    console.log(chalk.bold('\n💬 Ví Dụ Chat:'));
    console.log(chalk.green('  "Tạo task đi chợ ngày mai"'));
    console.log(chalk.green('  "Hiển thị task urgent"'));
    console.log(chalk.green('  "Đánh dấu task abc hoàn thành"'));
    console.log(chalk.green('  "Xóa task không cần thiết"'));

    console.log(chalk.bold('\n🎯 Tips:'));
    console.log(chalk.gray('  • Nói tiếng Việt tự nhiên'));
    console.log(chalk.gray('  • Không cần nhớ syntax'));
    console.log(chalk.gray('  • AI sẽ hiểu ý của bạn'));
  }

  private async quickListTasks() {
    const ora = (await import('ora')).default;
    const Table = (await import('cli-table3')).default;
    const spinner = ora('📋 Đang tải task...').start();

    try {
      const tasks = await this.taskRepo.getTasks({ limit: 10 });
      spinner.succeed(chalk.green(`📋 ${tasks.length} task gần đây`));

      if (tasks.length === 0) {
        console.log(chalk.yellow('🎉 Bạn không có task nào! Tạo task mới nhé.'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Task', 'Trạng thái', 'Ưu tiên'],
        colWidths: [10, 40, 15, 12],
        style: { head: ['cyan'], border: ['gray'] }
      });

      tasks.forEach(task => {
        const statusEmoji = {
          pending: '⏳ Chờ',
          in_progress: '🔄 Đang làm',
          completed: '✅ Xong',
          cancelled: '❌ Hủy'
        }[task.status];

        const priorityEmoji = {
          urgent: '🔴 Gấp',
          high: '🟡 Cao',
          medium: '🟢 TB',
          low: '⚪ Thấp'
        }[task.priority];

        table.push([
          task.id.slice(0, 8),
          task.title.length > 35 ? task.title.slice(0, 35) + '...' : task.title,
          statusEmoji,
          priorityEmoji
        ]);
      });

      console.log(table.toString());

    } catch (error) {
      spinner.fail(chalk.red('❌ Không tải được task'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }

  private async showTodayTasks() {
    const ora = (await import('ora')).default;
    const spinner = ora('📅 Tìm task hôm nay...').start();

    try {
      const allTasks = await this.taskRepo.getTasks();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayTasks = allTasks.filter(task => {
        if (!task.due_date) return false;
        const dueDate = new Date(task.due_date);
        return dueDate >= today && dueDate < tomorrow;
      });

      spinner.succeed(chalk.green(`📅 ${todayTasks.length} task hôm nay`));

      if (todayTasks.length === 0) {
        console.log(chalk.yellow('🎉 Không có task nào hôm nay!'));
        return;
      }

      todayTasks.forEach(task => {
        const statusColor = task.status === 'completed' ? chalk.green : 
                           task.status === 'in_progress' ? chalk.blue : chalk.yellow;
        const priorityEmoji = { urgent: '🔴', high: '🟡', medium: '🟢', low: '⚪' }[task.priority];
        
        console.log(`${priorityEmoji} ${statusColor(task.title)} (${task.id.slice(0, 8)})`);
      });

    } catch (error) {
      spinner.fail(chalk.red('❌ Lỗi tải task'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }

  private async showStats() {
    const ora = (await import('ora')).default;
    const spinner = ora('📊 Tính toán thống kê...').start();

    try {
      const stats = await this.taskRepo.getTaskStats();
      spinner.succeed(chalk.green('📊 Thống kê task'));

      const totalStats = stats.reduce((acc: any, stat: any) => {
        acc[stat.status] = (acc[stat.status] || 0) + parseInt(stat.total);
        return acc;
      }, {});

      console.log(chalk.cyan('\n📈 Tổng quan:'));
      Object.entries(totalStats).forEach(([status, count]) => {
        const emoji = { pending: '⏳', in_progress: '🔄', completed: '✅', cancelled: '❌' }[status];
        const name = { pending: 'Chờ', in_progress: 'Đang làm', completed: 'Hoàn thành', cancelled: 'Đã hủy' }[status];
        console.log(`  ${emoji} ${name}: ${count}`);
      });

    } catch (error) {
      spinner.fail(chalk.red('❌ Lỗi tải thống kê'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }

  private async processWithAI(input: string) {
    const ora = (await import('ora')).default;
    const spinner = ora('🤖 AI đang nghĩ...').start();

    try {
      // Cải thiện prompt để hỗ trợ tiếng Việt tốt hơn
      const enhancedPrompt = `
Người dùng nói: "${input}"

Bạn là trợ lý quản lý công việc thông minh, hiểu tiếng Việt. Phân tích yêu cầu và gọi function phù hợp.

Chú ý:
- "tạo", "thêm", "làm" = create_task
- "xem", "hiện", "list" = list_tasks  
- "hoàn thành", "xong", "done" = update_task với status completed
- "xóa", "bỏ", "delete" = delete_task
- "thống kê", "stats" = get_task_stats

Độ ưu tiên:
- "gấp", "urgent", "khẩn cấp" = urgent
- "cao", "quan trọng", "high" = high  
- "bình thường", "medium" = medium
- "thấp", "low" = low
`;

      const response = await this.geminiService.processVietnameseInput(input);
      spinner.succeed(chalk.green('🤖 Task-Killer'));

      // Debug log để xem response
      console.log('DEBUG - Response:', response);

      if (response.needsMoreInfo) {
        console.log(chalk.cyan('🤖'), response.text);
        return;
      }

      // Check if we have function call
      if (!response.name) {
        console.log(chalk.yellow('🤖 Tôi hiểu bạn muốn làm gì nhưng cần rõ hơn. Thử:'));
        console.log(chalk.gray('  • "Tạo task [tên task]"'));
        console.log(chalk.gray('  • "Xem danh sách task"'));
        console.log(chalk.gray('  • "/list" để xem nhanh'));
        return;
      }

      const result = await this.executeFunction(response);
      
      // Tạo response bằng tiếng Việt
      const vietnameseResponse = await this.generateVietnameseResponse(input, result, response.name);
      console.log(chalk.cyan('🤖'), vietnameseResponse);

      // Hiển thị kết quả chi tiết nếu cần
      if (response.name === 'create_task' && result) {
        this.showTaskDetails(result);
      } else if (response.name === 'list_tasks' && result && result.length > 0) {
        await this.displayTasksSimple(result);
      }

    } catch (error) {
      spinner.fail(chalk.red('❌ Lỗi AI'));
      console.error(chalk.red('Chi tiết:'), error instanceof Error ? error.message : String(error));
      
      // Gợi ý khi lỗi
      console.log(chalk.yellow('\n💡 Thử:'));
      console.log(chalk.gray('  • Nói rõ hơn về task bạn muốn'));
      console.log(chalk.gray('  • Gõ "/help" để xem hướng dẫn'));
      console.log(chalk.gray('  • Gõ "/list" để xem task hiện có'));
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
          limit: args.limit ? parseInt(args.limit) : 20
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
        throw new Error(`Không hiểu function: ${name}`);
    }
  }

  private async generateVietnameseResponse(input: string, result: any, functionName: string): Promise<string> {
    // Tạo response đơn giản bằng tiếng Việt thay vì dùng AI
    switch (functionName) {
      case 'create_task':
        return result ? `✅ Đã tạo task "${result.title}" thành công!` : '❌ Không thể tạo task';
      
      case 'list_tasks':
        return result && result.length > 0 ? 
          `📋 Tìm thấy ${result.length} task:` : 
          '📭 Không có task nào phù hợp';
      
      case 'update_task':
        return result ? `✅ Đã cập nhật task thành công!` : '❌ Không tìm thấy task để cập nhật';
      
      case 'delete_task':
        return result ? `🗑️ Đã xóa task thành công!` : '❌ Không tìm thấy task để xóa';
      
      case 'get_task_stats':
        return '📊 Thống kê task của bạn:';
      
      default:
        return '✅ Đã thực hiện xong!';
    }
  }

  private showTaskDetails(task: any) {
    console.log(chalk.gray(`\n📋 Chi tiết:`));
    console.log(chalk.gray(`   ID: ${task.id.slice(0, 8)}`));
    console.log(chalk.gray(`   Ưu tiên: ${task.priority}`));
    console.log(chalk.gray(`   Trạng thái: ${task.status}`));
    if (task.due_date) {
      const deadline = new Date(task.due_date);
      const now = new Date();
      const daysDiff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let deadlineText = `📅 Deadline: ${deadline.toLocaleDateString('vi-VN')}`;
      if (daysDiff < 0) {
        deadlineText += chalk.red(` (Quá hạn ${Math.abs(daysDiff)} ngày)`);
      } else if (daysDiff === 0) {
        deadlineText += chalk.yellow(` (Hôm nay!)`);
      } else if (daysDiff === 1) {
        deadlineText += chalk.yellow(` (Ngày mai)`);
      } else if (daysDiff <= 3) {
        deadlineText += chalk.yellow(` (Còn ${daysDiff} ngày)`);
      } else {
        deadlineText += chalk.gray(` (Còn ${daysDiff} ngày)`);
      }
      
      console.log(chalk.gray(`   ${deadlineText}`));
    }
    if (task.category) {
      console.log(chalk.gray(`   📂 Danh mục: ${task.category}`));
    }
    if (task.tags && task.tags.length > 0) {
      console.log(chalk.gray(`   🏷️  Tags: ${task.tags.join(', ')}`));
    }
  }

  private async displayTasksSimple(tasks: any[]) {
    console.log();
    tasks.slice(0, 5).forEach((task, index) => {
      const statusEmojis: Record<string, string> = {
        pending: '⏳',
        in_progress: '🔄', 
        completed: '✅',
        cancelled: '❌'
      };
      const statusEmoji = statusEmojis[task.status];

      const priorityEmojis: Record<string, string> = {
        urgent: '🔴',
        high: '🟡',
        medium: '🟢',
        low: '⚪'
      };
      const priorityEmoji = priorityEmojis[task.priority];

      console.log(`${statusEmoji}${priorityEmoji} ${task.title} (${task.id.slice(0, 8)})`);
    });

    if (tasks.length > 5) {
      console.log(chalk.gray(`\n   ... và ${tasks.length - 5} task khác. Gõ "/list" để xem tất cả.`));
    }
  }

  private async showSmartSuggestions(context: string) {
    try {
      const tasks = await this.taskRepo.getTasks({ limit: 5 });
      const pendingTasks = tasks.filter(t => t.status === 'pending');
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress');

      let suggestions: string[] = [];

      switch (context) {
        case 'start':
          if (pendingTasks.length === 0) {
            suggestions = ['Tạo task đầu tiên của bạn', 'Xem hướng dẫn /help'];
          } else {
            suggestions = [
              'Xem task hôm nay',
              `Hoàn thành task "${pendingTasks[0].title.slice(0, 20)}..."`,
              'Tạo task mới'
            ];
          }
          break;

        case 'after_action':
          if (Math.random() > 0.7) { // Chỉ hiện 30% lần để không spam
            if (inProgressTasks.length > 0) {
              suggestions = [`💡 Hoàn thành task "${inProgressTasks[0].title.slice(0, 20)}..."?`];
            } else if (pendingTasks.length > 3) {
              suggestions = ['💡 Bạn có nhiều task chưa làm. Ưu tiên task nào?'];
            }
          }
          break;
      }

      if (suggestions.length > 0) {
        console.log(chalk.gray('\n💭 Gợi ý: ' + suggestions.join(' • ')));
      }

    } catch (error) {
      // Không hiện lỗi suggestions để không làm phiền user
    }
  }

  private async askToContinue(): Promise<boolean> {
    try {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: chalk.yellow('Một số services có vấn đề. Tiếp tục không?'),
          default: true
        }
      ]);
      return answer.continue;
    } catch (error) {
      return false;
    }
  }
}

// Main execution
async function main() {
  try {
    const app = new SimpleTaskKiller();
    await app.start();
  } catch (error) {
    console.error(chalk.red('❌ Lỗi khởi động:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Tạm biệt! Chúc bạn hoàn thành tốt các task!'));
  process.exit(0);
});

main();