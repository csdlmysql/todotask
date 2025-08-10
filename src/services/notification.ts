import notifier from 'node-notifier';
import { TelegramService } from './telegram.js';

export class NotificationService {
  private telegramService?: TelegramService;
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.ENABLE_NOTIFICATIONS === 'true';
    
    // Initialize Telegram service if credentials are available
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (telegramToken && chatId && geminiApiKey) {
      try {
        this.telegramService = new TelegramService(
          { token: telegramToken, chatId },
          geminiApiKey
        );
      } catch (error) {
        console.warn('Failed to initialize Telegram notifications:', error);
      }
    }
  }

  async sendNotification(title: string, message: string): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    // Send desktop notification
    await this.sendDesktopNotification(title, message);

    // Send Telegram notification if available
    if (this.telegramService) {
      await this.sendTelegramNotification(title, message);
    }
  }

  private async sendDesktopNotification(title: string, message: string): Promise<void> {
    return new Promise((resolve) => {
      const options: any = {
        title,
        message,
        sound: true,
        wait: false,
        timeout: 5,
        icon: this.getIconPath(),
        appID: 'Task-Killer'
      };

      // Platform-specific options
      if (process.platform === 'darwin') {
        // macOS specific options
        (options as any).subtitle = 'Task Management';
        (options as any).contentImage = this.getIconPath();
      } else if (process.platform === 'win32') {
        // Windows specific options
        (options as any).type = 'info';
      } else {
        // Linux specific options
        (options as any).urgency = 'normal';
        (options as any).category = 'im.received';
      }

      notifier.notify(options, (error, response, metadata) => {
        if (error) {
          console.warn('Desktop notification failed:', error);
        }
        resolve();
      });
    });
  }

  private async sendTelegramNotification(title: string, message: string): Promise<void> {
    try {
      await this.telegramService?.sendNotification(title, message);
    } catch (error) {
      console.warn('Telegram notification failed:', error);
    }
  }

  private getIconPath(): string {
    // You can customize this to point to your app icon
    if (process.platform === 'darwin') {
      return '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/TaskListIcon.icns';
    } else if (process.platform === 'win32') {
      return 'C:\\Windows\\System32\\imageres.dll'; // Default Windows icon
    } else {
      return ''; // Linux will use default
    }
  }

  async sendTaskReminder(taskTitle: string, dueDate: Date): Promise<void> {
    const now = new Date();
    const timeDiff = dueDate.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    let message = '';
    
    if (daysDiff < 0) {
      message = `Task "${taskTitle}" is overdue by ${Math.abs(daysDiff)} day(s)!`;
    } else if (daysDiff === 0) {
      message = `Task "${taskTitle}" is due today!`;
    } else if (daysDiff === 1) {
      message = `Task "${taskTitle}" is due tomorrow!`;
    } else if (daysDiff <= 7) {
      message = `Task "${taskTitle}" is due in ${daysDiff} day(s)!`;
    } else {
      return; // Don't send reminders for tasks due more than a week away
    }

    await this.sendNotification('Task Reminder', message);
  }

  async sendTaskCompleted(taskTitle: string): Promise<void> {
    await this.sendNotification(
      'Task Completed! 🎉',
      `Great job! You completed "${taskTitle}"`
    );
  }

  async sendTaskCreated(taskTitle: string, priority: string): Promise<void> {
    const priorityEmoji = {
      urgent: '🔴',
      high: '🟡',
      medium: '🟢',
      low: '⚪'
    }[priority] || '🟢';

    await this.sendNotification(
      'New Task Created',
      `${priorityEmoji} "${taskTitle}" (${priority} priority)`
    );
  }

  async sendDailySummary(pendingCount: number, completedToday: number): Promise<void> {
    let message = `Daily Summary:\n`;
    message += `✅ Completed today: ${completedToday}\n`;
    message += `⏳ Pending tasks: ${pendingCount}`;

    if (pendingCount === 0) {
      message += '\n\n🎉 All caught up! Great work!';
    }

    await this.sendNotification('Daily Task Summary', message);
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  isNotificationEnabled(): boolean {
    return this.isEnabled;
  }
}