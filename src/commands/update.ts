import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { TaskRepository } from '../database/tasks.js';
import { NotificationService } from '../services/notification.js';

export const updateTaskCommand = new Command('update')
  .alias('edit')
  .description('Update an existing task')
  .argument('<id>', 'Task ID to update')
  .option('-t, --title <title>', 'New task title')
  .option('-d, --description <description>', 'New task description')
  .option('-s, --status <status>', 'New task status (pending, in_progress, completed, cancelled)')
  .option('-p, --priority <priority>', 'New task priority (low, medium, high, urgent)')
  .option('-c, --category <category>', 'New task category')
  .option('--due <date>', 'New due date (YYYY-MM-DD)')
  .option('--tags <tags>', 'New comma-separated tags')
  .action(async (taskId, options) => {
    const spinner = ora('Loading task...').start();

    try {
      const taskRepo = new TaskRepository();
      const existingTask = await taskRepo.getTaskById(taskId);

      if (!existingTask) {
        spinner.fail(chalk.red('❌ Task not found'));
        return;
      }

      spinner.succeed(chalk.green('📋 Task found'));

      let updateData: any = { id: taskId };

      // If no options provided, show interactive prompt
      if (!Object.keys(options).some(key => options[key] !== undefined)) {
        console.log(chalk.cyan('\n📋 Current Task Details:'));
        console.log(`${chalk.bold('Title:')} ${existingTask.title}`);
        console.log(`${chalk.bold('Description:')} ${existingTask.description || 'None'}`);
        console.log(`${chalk.bold('Status:')} ${existingTask.status}`);
        console.log(`${chalk.bold('Priority:')} ${existingTask.priority}`);
        console.log(`${chalk.bold('Category:')} ${existingTask.category || 'None'}`);
        console.log(`${chalk.bold('Due Date:')} ${existingTask.due_date ? new Date(existingTask.due_date).toLocaleDateString() : 'None'}`);
        console.log(`${chalk.bold('Tags:')} ${existingTask.tags?.join(', ') || 'None'}`);

        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'title',
            message: 'New title (press Enter to keep current):',
            default: existingTask.title
          },
          {
            type: 'input',
            name: 'description',
            message: 'New description (press Enter to keep current):',
            default: existingTask.description || ''
          },
          {
            type: 'list',
            name: 'status',
            message: 'New status:',
            choices: [
              { name: '⏳ Pending', value: 'pending' },
              { name: '🔄 In Progress', value: 'in_progress' },
              { name: '✅ Completed', value: 'completed' },
              { name: '❌ Cancelled', value: 'cancelled' }
            ],
            default: existingTask.status
          },
          {
            type: 'list',
            name: 'priority',
            message: 'New priority:',
            choices: [
              { name: '🔴 Urgent', value: 'urgent' },
              { name: '🟡 High', value: 'high' },
              { name: '🟢 Medium', value: 'medium' },
              { name: '⚪ Low', value: 'low' }
            ],
            default: existingTask.priority
          },
          {
            type: 'input',
            name: 'category',
            message: 'New category (press Enter to keep current):',
            default: existingTask.category || ''
          },
          {
            type: 'input',
            name: 'due_date',
            message: 'New due date (YYYY-MM-DD, press Enter to keep current):',
            default: existingTask.due_date ? new Date(existingTask.due_date).toISOString().split('T')[0] : '',
            validate: (input) => {
              if (!input) return true;
              const date = new Date(input);
              return !isNaN(date.getTime()) || 'Invalid date format';
            }
          },
          {
            type: 'input',
            name: 'tags',
            message: 'New tags (comma-separated, press Enter to keep current):',
            default: existingTask.tags?.join(', ') || ''
          }
        ]);

        updateData = {
          id: taskId,
          title: answers.title || undefined,
          description: answers.description || undefined,
          status: answers.status,
          priority: answers.priority,
          category: answers.category || undefined,
          due_date: answers.due_date ? new Date(answers.due_date) : undefined,
          tags: answers.tags ? answers.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined
        };
      } else {
        // Use command line options
        updateData = {
          id: taskId,
          title: options.title,
          description: options.description,
          status: options.status,
          priority: options.priority,
          category: options.category,
          due_date: options.due ? new Date(options.due) : undefined,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined
        };
      }

      spinner.start('Updating task...');

      const updatedTask = await taskRepo.updateTask(updateData);

      if (!updatedTask) {
        spinner.fail(chalk.red('❌ Failed to update task'));
        return;
      }

      spinner.succeed(chalk.green('✅ Task updated successfully!'));

      console.log(chalk.cyan('\n📋 Updated Task Details:'));
      console.log(`${chalk.bold('ID:')} ${updatedTask.id}`);
      console.log(`${chalk.bold('Title:')} ${updatedTask.title}`);
      
      if (updatedTask.description) {
        console.log(`${chalk.bold('Description:')} ${updatedTask.description}`);
      }

      const priorityColors = {
        urgent: chalk.red('🔴 URGENT'),
        high: chalk.yellow('🟡 HIGH'),
        medium: chalk.green('🟢 MEDIUM'),
        low: chalk.gray('⚪ LOW')
      };

      const statusColors = {
        pending: chalk.yellow('⏳ Pending'),
        in_progress: chalk.blue('🔄 In Progress'),
        completed: chalk.green('✅ Completed'),
        cancelled: chalk.red('❌ Cancelled')
      };

      console.log(`${chalk.bold('Status:')} ${statusColors[updatedTask.status as keyof typeof statusColors]}`);
      console.log(`${chalk.bold('Priority:')} ${priorityColors[updatedTask.priority as keyof typeof priorityColors]}`);
      
      if (updatedTask.category) {
        console.log(`${chalk.bold('Category:')} ${updatedTask.category}`);
      }
      
      if (updatedTask.due_date) {
        console.log(`${chalk.bold('Due Date:')} ${new Date(updatedTask.due_date).toLocaleDateString()}`);
      }
      
      if (updatedTask.tags && updatedTask.tags.length > 0) {
        console.log(`${chalk.bold('Tags:')} ${updatedTask.tags.map(tag => chalk.bgBlue.white(` ${tag} `)).join(' ')}`);
      }

      // Send notification for status changes
      if (updateData.status && updateData.status !== existingTask.status) {
        const notificationService = new NotificationService();
        await notificationService.sendNotification(
          'Task Status Updated',
          `Task "${updatedTask.title}" status changed to ${updatedTask.status.replace('_', ' ')}.`
        );
      }

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to update task'));
      console.error(chalk.red(error));
      process.exit(1);
    }
  });