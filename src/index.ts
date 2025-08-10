#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import dotenv from 'dotenv';
import { createTaskCommand } from './commands/create.js';
import { listTasksCommand } from './commands/list.js';
import { updateTaskCommand } from './commands/update.js';
import { deleteTaskCommand } from './commands/delete.js';
import { chatCommand } from './commands/chat.js';
import { telegramCommand } from './commands/telegram.js';
import { searchTasksCommand } from './commands/search.js';
import { initDatabase } from './database/init.js';

dotenv.config();

const program = new Command();

console.log(
  boxen(
    chalk.cyan.bold('🎯 Task-Killer') + '\n' +
    chalk.gray('AI-powered task management tool'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      textAlignment: 'center'
    }
  )
);

program
  .name('task-killer')
  .description('AI-powered task management CLI tool with Gemini integration')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize database')
  .action(async () => {
    try {
      await initDatabase();
      console.log(chalk.green('✅ Database initialized successfully!'));
    } catch (error) {
      console.error(chalk.red('❌ Database initialization failed:'), error);
      process.exit(1);
    }
  });

program.addCommand(createTaskCommand);
program.addCommand(listTasksCommand);
program.addCommand(updateTaskCommand);
program.addCommand(deleteTaskCommand);
program.addCommand(searchTasksCommand);
program.addCommand(chatCommand);
program.addCommand(telegramCommand);

program.parse();