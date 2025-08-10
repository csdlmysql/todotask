import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';
import { TelegramService } from './src/services/telegram.js';

dotenv.config();

async function main() {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!telegramToken) {
        console.error(chalk.red('❌ TELEGRAM_BOT_TOKEN environment variable is not set'));
        console.log(chalk.yellow('Please set your Telegram bot token in the .env file'));
        process.exit(1);
    }

    if (!chatId) {
        console.error(chalk.red('❌ TELEGRAM_CHAT_ID environment variable is not set'));
        console.log(chalk.yellow('Please set your Telegram chat ID in the .env file'));
        process.exit(1);
    }

    if (!geminiApiKey) {
        console.error(chalk.red('❌ GEMINI_API_KEY environment variable is not set'));
        console.log(chalk.yellow('Please set your Gemini API key in the .env file'));
        process.exit(1);
    }

    const spinner = ora('🤖 Starting Telegram bot...').start();

    try {
        const telegramService = new TelegramService(
            { token: telegramToken, chatId },
            geminiApiKey
        );

        await telegramService.startBot();
        
        spinner.succeed(chalk.green('🤖 Telegram bot started successfully!'));
        
        console.log(chalk.cyan('\n🔔 Bot Features:'));
        console.log(chalk.gray('• Natural language task management'));
        console.log(chalk.gray('• Interactive task operations'));
        console.log(chalk.gray('• Real-time notifications'));
        console.log(chalk.gray('• Task statistics and filtering'));
        
        console.log(chalk.yellow('\n💡 Usage:'));
        console.log(chalk.gray('• Send natural language messages to the bot'));
        console.log(chalk.gray('• Use /help command for available options'));
        console.log(chalk.gray('• Press Ctrl+C to stop the bot'));

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log(chalk.yellow('\n\n🛑 Stopping Telegram bot...'));
            await telegramService.stopBot();
            console.log(chalk.green('✅ Telegram bot stopped successfully!'));
            process.exit(0);
        });

        // Keep the process alive
        console.log(chalk.green('\n🚀 Bot is now running! Send messages to test it.\n'));
        
        // Heartbeat to show bot is alive
        setInterval(() => {
            // Silent heartbeat - just keeps process alive
        }, 60000);

        // Keep alive indefinitely
        await new Promise((resolve) => {
            // Never resolve - keeps the process running
        });

    } catch (error) {
        spinner.fail(chalk.red('❌ Failed to start Telegram bot'));
        console.error(chalk.red(error));
        process.exit(1);
    }
}

main();