import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { TaskRepository } from '../database/tasks.js';

export const searchTasksCommand = new Command('search')
  .alias('find')
  .description('Search tasks by title, description, category, or tags')
  .argument('<query>', 'Search query')
  .option('-c, --category <category>', 'Filter by category')
  .option('-s, --status <status>', 'Filter by status (pending, in_progress, completed, cancelled)')
  .option('-p, --priority <priority>', 'Filter by priority (low, medium, high, urgent)')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .action(async (query, options) => {
    const spinner = ora(`🔍 Searching for "${query}"...`).start();

    try {
      const taskRepo = new TaskRepository();
      let tasks = await taskRepo.searchTasks(query);

      // Apply additional filters
      if (options.category) {
        tasks = tasks.filter(task => 
          task.category?.toLowerCase().includes(options.category.toLowerCase())
        );
      }

      if (options.status) {
        tasks = tasks.filter(task => task.status === options.status);
      }

      if (options.priority) {
        tasks = tasks.filter(task => task.priority === options.priority);
      }

      // Apply limit
      const limit = parseInt(options.limit);
      if (limit > 0) {
        tasks = tasks.slice(0, limit);
      }

      spinner.succeed(chalk.green(`🔍 Found ${tasks.length} matching task(s)`));

      if (tasks.length === 0) {
        console.log(chalk.yellow(`\n📭 No tasks found matching "${query}"`));
        console.log(chalk.gray('Try using different search terms or check your filters.'));
        return;
      }

      console.log(chalk.cyan(`\n📋 Search Results for "${query}":`));

      const table = new Table({
        head: ['ID', 'Title', 'Description', 'Status', 'Priority', 'Category', 'Tags'],
        colWidths: [10, 25, 30, 12, 10, 15, 20],
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

        const highlightText = (text: string, searchTerm: string): string => {
          if (!text) return '-';
          const regex = new RegExp(`(${searchTerm})`, 'gi');
          return text.replace(regex, chalk.bgYellow.black('$1'));
        };

        const tags = task.tags && task.tags.length > 0
          ? task.tags.slice(0, 3).map(tag => {
              const highlighted = highlightText(tag, query);
              return chalk.bgBlue.white(` ${highlighted} `);
            }).join(' ')
          : '-';

        table.push([
          task.id.slice(0, 8) + '...',
          highlightText(
            task.title.length > 20 ? task.title.slice(0, 20) + '...' : task.title,
            query
          ),
          highlightText(
            task.description 
              ? (task.description.length > 25 ? task.description.slice(0, 25) + '...' : task.description)
              : '-',
            query
          ),
          statusColors[task.status as keyof typeof statusColors],
          priorityColors[task.priority as keyof typeof priorityColors],
          highlightText(task.category || '-', query),
          tags
        ]);
      });

      console.log('\n' + table.toString());

      // Show search summary
      const statusCounts = tasks.reduce((acc: any, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {});

      const priorityCounts = tasks.reduce((acc: any, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      }, {});

      console.log(chalk.cyan('\n📊 Search Summary:'));
      
      if (Object.keys(statusCounts).length > 0) {
        console.log(chalk.bold('By Status:'));
        Object.entries(statusCounts).forEach(([status, count]) => {
          const emoji = {
            pending: '⏳',
            in_progress: '🔄',
            completed: '✅',
            cancelled: '❌'
          }[status];
          console.log(`  ${emoji} ${status.replace('_', ' ')}: ${count}`);
        });
      }

      if (Object.keys(priorityCounts).length > 0) {
        console.log(chalk.bold('By Priority:'));
        Object.entries(priorityCounts).forEach(([priority, count]) => {
          const emoji = {
            urgent: '🔴',
            high: '🟡',
            medium: '🟢',
            low: '⚪'
          }[priority];
          console.log(`  ${emoji} ${priority}: ${count}`);
        });
      }

      // Show suggestions for refining search
      if (tasks.length === parseInt(options.limit)) {
        console.log(chalk.yellow('\n💡 Tip: Use --limit to see more results or add filters to narrow down your search.'));
      }

    } catch (error) {
      spinner.fail(chalk.red('❌ Search failed'));
      console.error(chalk.red(error));
      process.exit(1);
    }
  });