import { TaskRepository } from '../database/tasks.js';
import { NotificationService } from '../services/notification.js';

export class TaskScheduler {
  private taskRepo: TaskRepository;
  private notificationService: NotificationService;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.taskRepo = new TaskRepository();
    this.notificationService = new NotificationService();
  }

  startScheduler(): void {
    // Check for due tasks every hour
    this.intervalId = setInterval(async () => {
      await this.checkDueTasks();
    }, 60 * 60 * 1000); // 1 hour

    // Check immediately on startup
    this.checkDueTasks();

    // Schedule daily summary at 6 PM
    this.scheduleDailySummary();

    console.log('📅 Task scheduler started');
  }

  stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('📅 Task scheduler stopped');
  }

  private async checkDueTasks(): Promise<void> {
    try {
      const tasks = await this.taskRepo.getTasks({ status: 'pending' });
      const now = new Date();

      for (const task of tasks) {
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          const timeDiff = dueDate.getTime() - now.getTime();
          const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

          // Send reminder for tasks due within 7 days or overdue
          if (daysDiff <= 7) {
            await this.notificationService.sendTaskReminder(task.title, dueDate);
          }
        }
      }
    } catch (error) {
      console.error('Error checking due tasks:', error);
    }
  }

  private scheduleDailySummary(): void {
    const now = new Date();
    const summaryTime = new Date(now);
    summaryTime.setHours(18, 0, 0, 0); // 6 PM

    // If it's already past 6 PM today, schedule for tomorrow
    if (now.getTime() > summaryTime.getTime()) {
      summaryTime.setDate(summaryTime.getDate() + 1);
    }

    const timeUntilSummary = summaryTime.getTime() - now.getTime();

    setTimeout(async () => {
      await this.sendDailySummary();
      
      // Schedule daily summary every 24 hours
      setInterval(async () => {
        await this.sendDailySummary();
      }, 24 * 60 * 60 * 1000); // 24 hours

    }, timeUntilSummary);
  }

  private async sendDailySummary(): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const pendingTasks = await this.taskRepo.getTasks({ status: 'pending' });
      const completedTasks = await this.taskRepo.getTasks({ status: 'completed' });
      
      const completedToday = completedTasks.filter(task => {
        const updatedDate = new Date(task.updated_at);
        updatedDate.setHours(0, 0, 0, 0);
        return updatedDate.getTime() >= today.getTime();
      }).length;

      await this.notificationService.sendDailySummary(pendingTasks.length, completedToday);
    } catch (error) {
      console.error('Error sending daily summary:', error);
    }
  }

  async scheduleTaskReminder(taskId: string, reminderDate: Date): Promise<void> {
    const now = new Date();
    const timeUntilReminder = reminderDate.getTime() - now.getTime();

    if (timeUntilReminder > 0) {
      setTimeout(async () => {
        try {
          const task = await this.taskRepo.getTaskById(taskId);
          if (task && task.status !== 'completed' && task.status !== 'cancelled') {
            await this.notificationService.sendTaskReminder(task.title, new Date(task.due_date!));
          }
        } catch (error) {
          console.error('Error sending scheduled reminder:', error);
        }
      }, timeUntilReminder);
    }
  }
}