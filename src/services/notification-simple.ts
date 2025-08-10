import notifier from 'node-notifier';

export class NotificationServiceSimple {
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.ENABLE_NOTIFICATIONS === 'true';
  }

  async sendNotification(title: string, message: string): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    // Send desktop notification
    await this.sendDesktopNotification(title, message);
  }

  private async sendDesktopNotification(title: string, message: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        notifier.notify({
          title: title,
          message: message,
          sound: true,
          wait: false
        } as any, (error: any) => {
          if (error) {
            console.warn('Desktop notification failed:', error);
          }
          resolve();
        });
      } catch (error) {
        console.warn('Desktop notification failed:', error);
        resolve();
      }
    });
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

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  isNotificationEnabled(): boolean {
    return this.isEnabled;
  }
}