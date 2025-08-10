import chalk from 'chalk';
import ora from 'ora';
import { DatabaseConnection } from '../database/connection.js';
import { GeminiServiceSimple } from '../services/gemini-simple.js';
import TelegramBot from 'node-telegram-bot-api';

export class HealthChecker {
  async runAllChecks(): Promise<boolean> {
    console.log(chalk.cyan('\n🔍 Health Check - Checking services...\n'));
    
    let allHealthy = true;
    
    // Check Database
    if (!await this.checkDatabase()) allHealthy = false;
    
    // Check Gemini API
    if (!await this.checkGemini()) allHealthy = false;
    
    // Check Telegram (optional)
    await this.checkTelegram();
    
    console.log(); // Empty line
    
    if (allHealthy) {
      console.log(chalk.green('✅ All critical services are working properly!\n'));
    } else {
      console.log(chalk.yellow('⚠️  Some services have issues, but you can still continue.\n'));
    }
    
    return allHealthy;
  }

  private async checkDatabase(): Promise<boolean> {
    const spinner = ora('Checking Database...').start();
    
    try {
      const databaseUrl = process.env.DATABASE_URL;
      
      if (!databaseUrl) {
        spinner.fail(chalk.red('❌ Database: Missing DATABASE_URL'));
        console.log(chalk.gray('   → Need to set DATABASE_URL in .env file'));
        return false;
      }

      const db = DatabaseConnection.getInstance({ url: databaseUrl });
      
      // Test connection
      await db.query('SELECT 1');
      
      // Test tasks table exists
      const result = await db.query("SELECT COUNT(*) FROM tasks");
      const taskCount = result.rows[0].count;
      
      spinner.succeed(chalk.green(`✅ Database: OK (${taskCount} tasks)`));
      return true;
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Database: Connection error'));
      console.log(chalk.gray(`   → ${error instanceof Error ? error.message : String(error)}`));
      console.log(chalk.gray('   → Check if PostgreSQL is running'));
      console.log(chalk.gray('   → Check DATABASE_URL in .env'));
      return false;
    }
  }

  private async checkGemini(): Promise<boolean> {
    const spinner = ora('Checking Gemini AI...').start();
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        spinner.fail(chalk.red('❌ Gemini AI: Missing API key'));
        console.log(chalk.gray('   → Need to set GEMINI_API_KEY in .env file'));
        console.log(chalk.gray('   → Get API key at: https://makersuite.google.com/app/apikey'));
        return false;
      }

      if (apiKey.length < 30) {
        spinner.fail(chalk.red('❌ Gemini AI: Invalid API key'));
        console.log(chalk.gray('   → API key too short, please check again'));
        return false;
      }

      // Test API call
      const gemini = new GeminiServiceSimple(apiKey);
      const testResponse = await gemini.processVietnameseInput('test');
      
      spinner.succeed(chalk.green('✅ Gemini AI: OK'));
      return true;
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Gemini AI: API Error'));
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('API key')) {
        console.log(chalk.gray('   → API key invalid or expired'));
        console.log(chalk.gray('   → Create new API key at: https://makersuite.google.com/app/apikey'));
      } else if (errorMessage.includes('quota')) {
        console.log(chalk.gray('   → API quota exceeded, try again later'));
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        console.log(chalk.gray('   → Network error, check internet connection'));
      } else {
        console.log(chalk.gray(`   → ${errorMessage}`));
      }
      
      return false;
    }
  }

  private async checkTelegram(): Promise<boolean> {
    const spinner = ora('Checking Telegram Bot...').start();
    
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      if (!token || !chatId) {
        spinner.warn(chalk.yellow('⚠️  Telegram Bot: Not configured (optional)'));
        console.log(chalk.gray('   → Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable'));
        return false;
      }

      // Test bot connection
      const bot = new TelegramBot(token);
      const me = await bot.getMe();
      
      spinner.succeed(chalk.green(`✅ Telegram Bot: OK (@${me.username})`));
      return true;
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Telegram Bot: Error'));
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('token')) {
        console.log(chalk.gray('   → Bot token invalid'));
        console.log(chalk.gray('   → Create new bot with @BotFather on Telegram'));
      } else {
        console.log(chalk.gray(`   → ${errorMessage}`));
      }
      
      return false;
    }
  }

  async quickCheck(): Promise<{ database: boolean; gemini: boolean }> {
    const results = { database: false, gemini: false };
    
    try {
      // Quick database check
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl) {
        const db = DatabaseConnection.getInstance({ url: databaseUrl });
        await db.query('SELECT 1');
        results.database = true;
      }
    } catch (error) {
      // Database failed
    }

    try {
      // Quick Gemini check
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && apiKey.length > 30) {
        results.gemini = true;
      }
    } catch (error) {
      // Gemini failed
    }

    return results;
  }

  displayServiceStatus(database: boolean, gemini: boolean, telegram: boolean = false) {
    console.log(chalk.cyan('📊 Service Status:'));
    console.log(`   Database: ${database ? chalk.green('●') : chalk.red('●')} ${database ? 'Online' : 'Offline'}`);
    console.log(`   Gemini AI: ${gemini ? chalk.green('●') : chalk.red('●')} ${gemini ? 'Online' : 'Offline'}`);
    console.log(`   Telegram: ${telegram ? chalk.green('●') : chalk.gray('●')} ${telegram ? 'Online' : 'Not configured'}`);
  }
}