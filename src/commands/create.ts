import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { TaskRepository } from '../database/tasks.js';
import { NotificationService } from '../services/notification.js';

export const createTaskCommand = new Command('create')
  .alias('new')
  .description('Create a new task')
  .option('-t, --title <title>', 'Task title')
  .option('-d, --description <description>', 'Task description')
  .option('-p, --priority <priority>', 'Task priority (low, medium, high, urgent)', 'medium')
  .option('-c, --category <category>', 'Task category')
  .option('--due <date>', 'Due date (YYYY-MM-DD)')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (options) => {
    const spinner = ora('Creating task...').start();

    try {
      let taskData: any = {};

      if (options.title) {
        taskData.title = options.title;
        taskData.description = options.description;
        taskData.priority = options.priority;
        taskData.category = options.category;
        taskData.due_date = options.due ? new Date(options.due) : undefined;
        taskData.tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined;
      } else {
        spinner.stop();
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'title',
            message: 'Task title:',
            validate: (input) => input.length > 0 || 'Task title is required'
          },
          {
            type: 'input',
            name: 'description',
            message: 'Task description (optional):'
          },
          {
            type: 'list',
            name: 'priority',
            message: 'Priority:',
            choices: [
              { name: '🔴 Urgent', value: 'urgent' },
              { name: '🟡 High', value: 'high' },
              { name: '🟢 Medium', value: 'medium' },
              { name: '⚪ Low', value: 'low' }
            ],
            default: 'medium'
          },
          {
            type: 'input',
            name: 'category',
            message: 'Category (optional):'
          },
          {
            type: 'input',
            name: 'due_date',
            message: 'Due date (YYYY-MM-DD, optional):',
            validate: (input) => {
              if (!input) return true;
              const date = new Date(input);
              return !isNaN(date.getTime()) || 'Invalid date format';
            }
          },
          {
            type: 'input',
            name: 'tags',
            message: 'Tags (comma-separated, optional):'
          }
        ]);

        taskData = {
          ...answers,
          due_date: answers.due_date ? new Date(answers.due_date) : undefined,
          tags: answers.tags ? answers.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined
        };

        spinner.start('Creating task...');
      }

      const taskRepo = new TaskRepository();
      const task = await taskRepo.createTask(taskData);

      spinner.succeed(chalk.green('✅ Task created successfully!'));
      
      console.log(chalk.cyan('\n📋 Task Details:'));
      console.log(`${chalk.bold('ID:')} ${task.id}`);
      console.log(`${chalk.bold('Title:')} ${task.title}`);
      
      if (task.description) {
        console.log(`${chalk.bold('Description:')} ${task.description}`);
      }
      
      const priorityColors = {
        urgent: chalk.red('🔴 URGENT'),
        high: chalk.yellow('🟡 HIGH'),
        medium: chalk.green('🟢 MEDIUM'),
        low: chalk.gray('⚪ LOW')
      };
      
      console.log(`${chalk.bold('Priority:')} ${priorityColors[task.priority as keyof typeof priorityColors]}`);
      console.log(`${chalk.bold('Status:')} ${chalk.blue(task.status.toUpperCase())}`);
      
      if (task.category) {
        console.log(`${chalk.bold('Category:')} ${task.category}`);
      }
      
      if (task.due_date) {
        console.log(`${chalk.bold('Due Date:')} ${new Date(task.due_date).toLocaleDateString()}`);
      }
      
      if (task.tags && task.tags.length > 0) {
        console.log(`${chalk.bold('Tags:')} ${task.tags.map(tag => chalk.bgBlue.white(` ${tag} `)).join(' ')}`);
      }

      // Send notification
      const notificationService = new NotificationService();
      await notificationService.sendNotification(
        'New Task Created',
        `Task "${task.title}" has been created with ${task.priority} priority.`
      );

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to create task'));
      console.error(chalk.red(error));
      process.exit(1);
    }
  });