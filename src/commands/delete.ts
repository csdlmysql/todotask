import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { TaskRepository } from '../database/tasks.js';

export const deleteTaskCommand = new Command('delete')
  .alias('rm')
  .description('Delete a task')
  .argument('<id>', 'Task ID to delete')
  .option('-f, --force', 'Force delete without confirmation')
  .action(async (taskId, options) => {
    const spinner = ora('Loading task...').start();

    try {
      const taskRepo = new TaskRepository();
      const task = await taskRepo.getTaskById(taskId);

      if (!task) {
        spinner.fail(chalk.red('❌ Task not found'));
        return;
      }

      spinner.succeed(chalk.green('📋 Task found'));

      console.log(chalk.cyan('\n📋 Task to Delete:'));
      console.log(`${chalk.bold('ID:')} ${task.id}`);
      console.log(`${chalk.bold('Title:')} ${task.title}`);
      console.log(`${chalk.bold('Status:')} ${task.status}`);
      console.log(`${chalk.bold('Priority:')} ${task.priority}`);

      let shouldDelete = options.force;

      if (!shouldDelete) {
        const answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmDelete',
            message: chalk.red.bold('Are you sure you want to delete this task? This action cannot be undone.'),
            default: false
          }
        ]);

        shouldDelete = answer.confirmDelete;
      }

      if (!shouldDelete) {
        console.log(chalk.yellow('❌ Task deletion cancelled'));
        return;
      }

      spinner.start('Deleting task...');

      const deleted = await taskRepo.deleteTask(taskId);

      if (!deleted) {
        spinner.fail(chalk.red('❌ Failed to delete task'));
        return;
      }

      spinner.succeed(chalk.green('✅ Task deleted successfully!'));
      console.log(chalk.gray(`Task "${task.title}" has been permanently removed.`));

    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to delete task'));
      console.error(chalk.red(error));
      process.exit(1);
    }
  });