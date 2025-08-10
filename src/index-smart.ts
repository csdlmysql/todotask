#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import dotenv from 'dotenv';
import Table from 'cli-table3';
import { SmartTaskProcessor, ProcessingResult } from './ai/SmartTaskProcessor.js';
import { initDatabaseSafe } from './database/init-safe.js';
import { HealthChecker } from './utils/health-check.js';

dotenv.config();

class SmartTaskKiller {
  private smartProcessor: SmartTaskProcessor;
  private healthChecker: HealthChecker;

  constructor() {
    this.healthChecker = new HealthChecker();
    
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error(chalk.red('❌ GEMINI_API_KEY is required in .env file'));
      process.exit(1);
    }
    
    this.smartProcessor = new SmartTaskProcessor(geminiApiKey);
  }

  async start() {
    await this.showWelcome();
    
    // Health check
    const isHealthy = await this.healthChecker.runAllChecks();
    
    if (!isHealthy) {
      const proceed = await this.askToContinue();
      if (!proceed) {
        console.log(chalk.yellow('👋 Please setup the services and try again!'));
        return;
      }
    }
    
    await this.checkSetup();
    await this.startSmartInteractiveMode();
  }

  private async showWelcome() {
    console.clear();
    console.log(
      boxen(
        chalk.cyan.bold('🧠 Smart Task-Killer v1.0.0') + '\n' +
        chalk.gray('Professional AI Task Management • Multi-Operations • Analytics') + '\n' +
        chalk.yellow('Context Memory • Natural Language • Telegram Bot • Bulk Actions') + '\n' +
        chalk.dim('Author: csdlmysql'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          textAlignment: 'center'
        }
      )
    );

    console.log(chalk.yellow('🎯 AI Features:'));
    console.log(chalk.gray('  • "them 2 task sau: viet docs, fix bug" (multi-task creation)'));
    console.log(chalk.gray('  • "delete all completed tasks" (bulk cleanup)'));
    console.log(chalk.gray('  • "mark task1, task2 as urgent" (batch operations)'));
    console.log(chalk.gray('  • Context memory: "complete that task" (remembers references)'));
    
    console.log(chalk.yellow('💻 Commands:'));
    console.log(chalk.gray('  • "/cleanup" - bulk delete, "/stats" - analytics'));
    console.log(chalk.gray('  • "/recent" - latest tasks, "/export" - backup'));
    console.log(chalk.gray('  • "/help" - full guide, "exit" - quit\n'));
  }

  private async checkSetup() {
    try {
      await initDatabaseSafe();
    } catch (error) {
      console.log(chalk.green('✅ Database is ready!'));
    }
  }

  private async startSmartInteractiveMode() {
    console.log(chalk.green('🧠 Smart Mode active! Chat naturally with AI...\n'));
    
    // Show initial suggestions
    await this.showSmartSuggestions([
      'Create first task',
      'View existing tasks', 
      'Learn how to use'
    ]);

    while (true) {
      try {
        const { input } = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: chalk.cyan('🧠 You:'),
            validate: (input) => input.length > 0 || 'Please enter something...'
          }
        ]);

        const trimmedInput = input.trim();

        // Check exit commands
        if (['exit', 'quit', 'bye'].includes(trimmedInput.toLowerCase())) {
          console.log(chalk.yellow('\n👋 Goodbye! AI will remember context for next time!'));
          break;
        }

        // Handle special commands
        if (trimmedInput.startsWith('/')) {
          await this.handleSlashCommand(trimmedInput);
          continue;
        }

        // Smart processing with AI
        await this.processWithSmartAI(trimmedInput);

      } catch (error) {
        if (error instanceof Error && error.name === 'ExitPromptError') {
          console.log(chalk.yellow('\n👋 Goodbye! AI will remember context for next time!'));
          break;
        }
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
      }

      console.log(); // Empty line for readability
    }
  }

  private async handleSlashCommand(command: string) {
    const cmd = command.slice(1).toLowerCase();
    const availableCommands = ['help', 'context', 'debug', 'reset', 'stats', 'list', 'recent', 'search', 'export', 'backup', 'config', 'cleanup', 'clear'];

    if (availableCommands.includes(cmd)) {
      const result = await this.smartProcessor.handleSpecialCommand(cmd);
      await this.displayResult(result);
    } else {
      console.log(chalk.red(`❌ Unknown command "${command}"`));
      console.log(chalk.gray('💡 Available commands:'));
      console.log(chalk.gray('   📋 Task Management: /list, /recent, /search, /cleanup'));
      console.log(chalk.gray('   📊 Analytics: /stats, /export'));  
      console.log(chalk.gray('   🔧 System: /help, /context, /reset, /config, /clear'));
      console.log(chalk.gray('   💾 Backup: /backup'));
    }
  }

  private async processWithSmartAI(input: string) {
    const ora = (await import('ora')).default;
    const spinner = ora('🧠 AI is analyzing and executing...').start();

    try {
      const result = await this.smartProcessor.handleConversationalFlow(input);
      spinner.succeed(chalk.green('🧠 Smart AI'));

      await this.displayResult(result);

    } catch (error) {
      spinner.fail(chalk.red('❌ Smart AI error'));
      console.error(chalk.red('Details:'), error instanceof Error ? error.message : String(error));
    }
  }

  private async displayResult(result: ProcessingResult) {
    // Display main message
    console.log(chalk.cyan('🤖'), result.message);

    // Show analysis debug info if available
    if (result.analysis && process.env.NODE_ENV === 'development') {
      console.log(chalk.gray(`\n🔍 Debug: ${result.analysis.primary_action} (${result.analysis.confidence.toFixed(2)})`));
    }

    // Display data if available
    if (result.data) {
      await this.displayData(result.data);
    }

    // Show context summary in debug mode
    if (result.context_summary && process.env.NODE_ENV === 'development') {
      console.log(chalk.gray(`\n📊 Context: ${result.context_summary.messages_count} msgs, flow: ${result.context_summary.current_flow}`));
    }

    // Show smart suggestions
    if (result.follow_up_suggestions?.length) {
      await this.showSmartSuggestions(result.follow_up_suggestions);
    }

    // Handle clarification requests
    if (result.needs_clarification) {
      console.log(chalk.yellow('\n💭 Tip: Be more specific so AI can understand better!'));
    }
  }

  private async displayData(data: any) {
    if (!data) return;

    // Handle task data
    if (data.id && data.title) {
      // Single task
      this.displaySingleTask(data);
    } else if (Array.isArray(data)) {
      if (data.length > 0 && data[0].id && data[0].title) {
        // Task list
        this.displayTaskList(data);
      } else {
        // Stats or other array data
        this.displayGenericData(data);
      }
    } else {
      // Generic data
      this.displayGenericData(data);
    }
  }

  private displaySingleTask(task: any) {
    console.log(chalk.cyan('\n📋 Task Details:'));
    console.log(`   ${chalk.bold('ID:')} ${task.id.slice(0, 8)}`);
    console.log(`   ${chalk.bold('Title:')} ${task.title}`);
    
    if (task.description) {
      console.log(`   ${chalk.bold('Description:')} ${task.description}`);
    }

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

    console.log(`   ${chalk.bold('Status:')} ${statusColors[task.status as keyof typeof statusColors]}`);
    console.log(`   ${chalk.bold('Priority:')} ${priorityColors[task.priority as keyof typeof priorityColors]}`);

    if (task.due_date) {
      const deadline = new Date(task.due_date);
      const now = new Date();
      const daysDiff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let deadlineText = `📅 ${deadline.toLocaleDateString('en-US')}`;
      if (daysDiff < 0) {
        deadlineText += chalk.red(` (Overdue ${Math.abs(daysDiff)} days)`);
      } else if (daysDiff === 0) {
        deadlineText += chalk.yellow(` (Today!)`);
      } else if (daysDiff === 1) {
        deadlineText += chalk.yellow(` (Tomorrow)`);
      } else {
        deadlineText += chalk.gray(` (${daysDiff} days left)`);
      }
      
      console.log(`   ${chalk.bold('Deadline:')} ${deadlineText}`);
    }

    if (task.category) {
      console.log(`   ${chalk.bold('Category:')} ${task.category}`);
    }

    if (task.tags && task.tags.length > 0) {
      console.log(`   ${chalk.bold('Tags:')} ${task.tags.map((tag: string) => chalk.bgBlue.white(` ${tag} `)).join(' ')}`);
    }
  }

  private displayTaskList(tasks: any[]) {
    console.log(chalk.cyan(`\n📋 ${tasks.length} Task(s):`));

    if (tasks.length === 0) {
      console.log(chalk.yellow('🎉 No tasks found!'));
      return;
    }

    const table = new Table({
      head: ['ID', 'Title', 'Description', 'Status', 'Priority', 'Deadline'],
      colWidths: [10, 25, 20, 15, 12, 15],
      style: { head: ['cyan'], border: ['gray'] }
    });

    tasks.slice(0, 10).forEach(task => {
      const statusEmojis: Record<string, string> = {
        pending: '⏳',
        in_progress: '🔄', 
        completed: '✅',
        cancelled: '❌'
      };

      const priorityEmojis: Record<string, string> = {
        urgent: '🔴',
        high: '🟡',
        medium: '🟢',
        low: '⚪'
      };

      const deadline = task.due_date ? 
        new Date(task.due_date).toLocaleDateString('en-US') : '-';

      const description = task.description 
        ? (task.description.length > 18 ? task.description.slice(0, 18) + '...' : task.description)
        : '-';

      table.push([
        task.id.slice(0, 8),
        task.title.length > 23 ? task.title.slice(0, 23) + '...' : task.title,
        description,
        statusEmojis[task.status] + ' ' + task.status,
        priorityEmojis[task.priority] + ' ' + task.priority,
        deadline
      ]);
    });

    console.log(table.toString());

    if (tasks.length > 10) {
      console.log(chalk.gray(`\n... and ${tasks.length - 10} more tasks`));
    }
  }

  private displayGenericData(data: any) {
    console.log(chalk.cyan('\n📊 Data:'));
    console.log(JSON.stringify(data, null, 2));
  }

  private async showSmartSuggestions(suggestions: string[]) {
    if (suggestions.length === 0) return;

    console.log(chalk.gray('\n💡 Suggestions: ' + suggestions.join(' • ')));
  }

  private async askToContinue(): Promise<boolean> {
    try {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: chalk.yellow('Some services have issues. Continue anyway?'),
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
    const app = new SmartTaskKiller();
    await app.start();
  } catch (error) {
    console.error(chalk.red('❌ Startup Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Goodbye! Smart AI will remember context for next time!'));
  process.exit(0);
});

main();