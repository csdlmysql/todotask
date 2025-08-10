import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { TaskRepository } from '../database/tasks.js';

export const listTasksCommand = new Command('list')
  .alias('ls')
  .description('List tasks')
  .option('-s, --status <status>', 'Filter by status (pending, in_progress, completed, cancelled)')
  .option('-p, --priority <priority>', 'Filter by priority (low, medium, high, urgent)')
  .option('-c, --category <category>', 'Filter by category')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .option('--stats', 'Show task statistics')
  .action(async (options) => {
    const spinner = ora('Loading tasks...').start();

    try {
      const taskRepo = new TaskRepository();

      if (options.stats) {
        const stats = await taskRepo.getTaskStats();
        spinner.succeed(chalk.green('📊 Task Statistics'));
        
        const statsTable = new Table({
          head: ['Status', 'Priority', 'Total', 'Today', 'This Week', 'This Month'],
          colWidths: [12, 10, 8, 8, 12, 12],
          style: {
            head: ['cyan'],
            border: ['gray']
          }
        });

        stats.forEach((stat: any) => {
          const statusColors: Record<string, string> = {
            pending: chalk.yellow(stat.status),
            in_progress: chalk.blue(stat.status),
            completed: chalk.green(stat.status),
            cancelled: chalk.red(stat.status)
          };
          const statusColor = statusColors[stat.status] || stat.status;

          const priorityColors: Record<string, string> = {
            urgent: chalk.red(stat.priority),
            high: chalk.yellow(stat.priority),
            medium: chalk.green(stat.priority),
            low: chalk.gray(stat.priority)
          };
          const priorityColor = priorityColors[stat.priority] || stat.priority;

          statsTable.push([
            statusColor,
            priorityColor,
            stat.total,
            stat.today,
            stat.week,
            stat.month
          ]);
        });

        console.log(statsTable.toString());
        return;
      }

      const filters = {
        status: options.status,
        priority: options.priority,
        category: options.category,
        limit: parseInt(options.limit)
      };

      const tasks = await taskRepo.getTasks(filters);
      
      spinner.succeed(chalk.green(`📋 Found ${tasks.length} task(s)`));

      if (tasks.length === 0) {
        console.log(chalk.yellow('\n🎉 No tasks found! You\'re all caught up!'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Title', 'Status', 'Priority', 'Category', 'Due Date', 'Tags'],
        colWidths: [10, 30, 12, 10, 15, 12, 20],
        style: {
          head: ['cyan'],
          border: ['gray']
        },
        wordWrap: true
      });

      tasks.forEach(task => {
        const statusColors = {
          pending: chalk.yellow('⏳ Pending'),
          in_progress: chalk.blue('🔄 In Progress'),
          completed: chalk.green('✅ Completed'),
          cancelled: chalk.red('❌ Cancelled')
        };

        const priorityColors = {
          urgent: chalk.red('🔴 URGENT'),
          high: chalk.yellow('🟡 HIGH'),
          medium: chalk.green('🟢 MEDIUM'),
          low: chalk.gray('⚪ LOW')
        };

        const dueDate = task.due_date 
          ? new Date(task.due_date).toLocaleDateString()
          : '-';

        const tags = task.tags && task.tags.length > 0
          ? task.tags.slice(0, 3).map(tag => chalk.bgBlue.white(` ${tag} `)).join(' ')
          : '-';

        table.push([
          task.id.slice(0, 8) + '...',
          task.title.length > 25 ? task.title.slice(0, 25) + '...' : task.title,
          statusColors[task.status as keyof typeof statusColors],
          priorityColors[task.priority as keyof typeof priorityColors],
          task.category || '-',
          dueDate,
          tags
        ]);
      });

      console.log('\n' + table.toString());

      // Show summary
      const statusCounts = tasks.reduce((acc: any, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {});

      console.log(chalk.cyan('\n📊 Summary:'));
      Object.entries(statusCounts).forEach(([status, count]) => {
        const emoji = {
          pending: '⏳',
          in_progress: '🔄',
          completed: '✅',
          cancelled: '❌'
        }[status];
        console.log(`${emoji} ${status.replace('_', ' ')}: ${count}`);
      });

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to load tasks'));
      console.error(chalk.red(error));
      process.exit(1);
    }
  });