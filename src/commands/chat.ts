import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { GeminiService } from '../services/gemini.js';
import { TaskRepository } from '../database/tasks.js';

export const chatCommand = new Command('chat')
  .alias('ai')
  .description('Chat with AI assistant for natural language task management')
  .argument('[message]', 'Message to send to AI assistant')
  .action(async (message) => {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
      console.error(chalk.red('❌ GEMINI_API_KEY environment variable is not set'));
      console.log(chalk.yellow('Please set your Gemini API key in the .env file'));
      process.exit(1);
    }

    const geminiService = new GeminiService(geminiApiKey);
    const taskRepo = new TaskRepository();

    if (message) {
      await processSingleMessage(message, geminiService, taskRepo);
    } else {
      await startInteractiveChat(geminiService, taskRepo);
    }
  });

async function processSingleMessage(message: string, geminiService: GeminiService, taskRepo: TaskRepository) {
  const spinner = ora('🤖 AI is thinking...').start();

  try {
    const response = await geminiService.processNaturalLanguage(message);
    
    spinner.succeed(chalk.green('🤖 AI Assistant'));

    if (response.needsMoreInfo) {
      console.log(chalk.cyan(response.text));
      return;
    }

    const result = await executeFunction(response, taskRepo);
    const aiResponse = await geminiService.generateResponse(message, result);
    
    console.log(chalk.cyan('\n🤖 '), aiResponse);

  } catch (error) {
    spinner.fail(chalk.red('❌ AI request failed'));
    console.error(chalk.red(error));
  }
}

async function startInteractiveChat(geminiService: GeminiService, taskRepo: TaskRepository) {
  console.log(chalk.cyan.bold('\n🤖 AI Task Assistant'));
  console.log(chalk.gray('Type your requests in natural language. Type "exit" to quit.\n'));
  console.log(chalk.yellow('Examples:'));
  console.log(chalk.gray('  - "Create a high priority task to review the project proposal"'));
  console.log(chalk.gray('  - "Show me all pending tasks"'));
  console.log(chalk.gray('  - "Mark task abc123 as completed"'));
  console.log(chalk.gray('  - "What tasks do I have due this week?"\n'));

  while (true) {
    try {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          validate: (input) => input.length > 0 || 'Please enter a message'
        }
      ]);

      if (answer.message.toLowerCase().trim() === 'exit') {
        console.log(chalk.yellow('\n👋 Goodbye! Happy task managing!'));
        break;
      }

      const spinner = ora('🤖 AI is thinking...').start();

      try {
        const response = await geminiService.processNaturalLanguage(answer.message);
        
        spinner.stop();

        if (response.needsMoreInfo) {
          console.log(chalk.cyan('🤖 '), response.text);
          continue;
        }

        const result = await executeFunction(response, taskRepo);
        const aiResponse = await geminiService.generateResponse(answer.message, result);
        
        console.log(chalk.cyan('🤖 '), aiResponse);

      } catch (error) {
        spinner.fail(chalk.red('❌ AI request failed'));
        console.error(chalk.red(error));
      }

      console.log(); // Empty line for better readability

    } catch (error) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log(chalk.yellow('\n👋 Goodbye! Happy task managing!'));
        break;
      }
      console.error(chalk.red('❌ Error:'), error);
    }
  }
}

async function executeFunction(functionCall: any, taskRepo: TaskRepository): Promise<any> {
  const { name, args } = functionCall;

  try {
    switch (name) {
      case 'create_task':
        const createData = {
          title: args.title,
          description: args.description,
          priority: args.priority || 'medium',
          due_date: args.due_date ? new Date(args.due_date) : undefined,
          category: args.category,
          tags: args.tags ? args.tags.split(',').map((t: string) => t.trim()) : undefined
        };
        return await taskRepo.createTask(createData);

      case 'list_tasks':
        const filters = {
          status: args.status,
          priority: args.priority,
          category: args.category,
          limit: args.limit ? parseInt(args.limit) : undefined
        };
        return await taskRepo.getTasks(filters);

      case 'update_task':
        const updateData = {
          id: args.id,
          title: args.title,
          description: args.description,
          status: args.status,
          priority: args.priority
        };
        return await taskRepo.updateTask(updateData);

      case 'delete_task':
        return await taskRepo.deleteTask(args.id);

      case 'get_task_stats':
        return await taskRepo.getTaskStats(args.period);

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  } catch (error) {
    throw new Error(`Function execution failed: ${error}`);
  }
}