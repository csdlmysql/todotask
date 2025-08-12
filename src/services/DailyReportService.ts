import * as cron from 'node-cron';
import { TaskRepository } from '../database/tasks.js';
import { UserRepository } from '../database/users.js';
import { TelegramService } from './telegram.js';
import { DatabaseConnection } from '../database/connection.js';

export class DailyReportService {
  private taskRepo: TaskRepository;
  private userRepo: UserRepository;
  private telegramService: TelegramService | null = null;
  private db: DatabaseConnection;
  private reportTime: string = '0 20 * * *'; // Default: 8 PM daily
  private reminderTime: string = '0 15 * * *'; // Default: 3 PM daily
  private scheduledTask: cron.ScheduledTask | null = null;
  private reminderTask: cron.ScheduledTask | null = null;

  constructor() {
    this.taskRepo = new TaskRepository();
    this.userRepo = new UserRepository();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    this.db = DatabaseConnection.getInstance({ url: databaseUrl });
  }

  setTelegramService(telegramService: TelegramService) {
    this.telegramService = telegramService;
  }

  startScheduler() {
    // Start report scheduler
    if (this.scheduledTask) {
      this.scheduledTask.stop();
    }

    this.scheduledTask = cron.schedule(this.reportTime, async () => {
      console.log('📊 Running scheduled daily report...');
      await this.generateAndSendDailyReport(true, false); // Use full format for scheduled reports
    });

    console.log(`📅 Daily report scheduler started (${this.getReportTimeDisplay()})`);

    // Start reminder scheduler
    if (this.reminderTask) {
      this.reminderTask.stop();
    }

    this.reminderTask = cron.schedule(this.reminderTime, async () => {
      console.log('🔔 Sending work reminder to all users...');
      await this.sendWorkReminder();
    });

    console.log(`⏰ Work reminder scheduler started (${this.getReminderTimeDisplay()})`);
  }

  stopScheduler() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      console.log('⏹️ Daily report scheduler stopped');
    }
    
    if (this.reminderTask) {
      this.reminderTask.stop();
      console.log('⏹️ Work reminder scheduler stopped');
    }
  }

  setReportTime(hour: number, minute: number = 0) {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('Invalid time. Hour must be 0-23, minute must be 0-59');
    }
    
    this.reportTime = `${minute} ${hour} * * *`;
    
    // Restart scheduler with new time
    if (this.scheduledTask) {
      this.startScheduler();
    }
  }

  setReminderTime(hour: number, minute: number = 0) {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('Invalid time. Hour must be 0-23, minute must be 0-59');
    }
    
    this.reminderTime = `${minute} ${hour} * * *`;
    
    // Restart scheduler with new time
    if (this.reminderTask) {
      this.startScheduler();
    }
  }

  getReportTimeDisplay(): string {
    const parts = this.reportTime.split(' ');
    const minute = parts[0].padStart(2, '0');
    const hour = parts[1].padStart(2, '0');
    return `${hour}:${minute}`;
  }

  getReminderTimeDisplay(): string {
    const parts = this.reminderTime.split(' ');
    const minute = parts[0].padStart(2, '0');
    const hour = parts[1].padStart(2, '0');
    return `${hour}:${minute}`;
  }

  async generateAndSendDailyReport(sendToAdmins: boolean = true, compact: boolean = false): Promise<string> {
    try {
      console.log('📊 Generating daily report...');
      
      // Get all active users
      const allUsers = await this.userRepo.getAllUsers({ status: 'active', role: 'user' });
      console.log('Active users:', allUsers.length);
      
      // Get users without activity today
      const usersWithoutActivity = await this.userRepo.getUsersWithoutActivityToday();
      console.log('Users without activity:', usersWithoutActivity.length);
      
      // Get all user activities today
      const userActivities = await this.taskRepo.getAllUsersActivityToday();
      console.log('User activities:', userActivities.length);
      
      // Create a map for easy lookup
      const activityMap = new Map(userActivities.map(a => [a.user_id, a]));
      
      // Calculate totals with more metrics (convert strings to numbers)
      const totalTasksCreated = userActivities.reduce((sum, a) => sum + (parseInt(a.created_today, 10) || 0), 0);
      const totalTasksCompleted = userActivities.reduce((sum, a) => sum + (parseInt(a.completed_today, 10) || 0), 0);
      const totalTasksUpdated = userActivities.reduce((sum, a) => sum + (parseInt(a.updated_today, 10) || 0), 0);
      const activeUsersCount = userActivities.length;
      
      // Generate report content
      const report = compact 
        ? await this.formatCompactReport({
            date: new Date(),
            allUsers,
            usersWithoutActivity,
            userActivities,
            activityMap,
            totalTasksCreated,
            totalTasksCompleted,
            totalTasksUpdated,
            activeUsersCount
          })
        : await this.formatDailyReport({
            date: new Date(),
            allUsers,
            usersWithoutActivity,
            userActivities,
            activityMap,
            totalTasksCreated,
            totalTasksCompleted,
            totalTasksUpdated,
            activeUsersCount
          });

      // Save report to database
      if (sendToAdmins) {
        await this.saveReportToDatabase(report, usersWithoutActivity.length, activeUsersCount, totalTasksCreated, totalTasksCompleted);
        
        // Send to all admins
        await this.sendReportToAdmins(report);
      }

      return report;
    } catch (error) {
      console.error('Error generating daily report:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private async formatDailyReport(data: any): Promise<string> {
    const { 
      date, 
      allUsers, 
      usersWithoutActivity, 
      userActivities,
      activityMap,
      totalTasksCreated, 
      totalTasksCompleted,
      totalTasksUpdated,
      activeUsersCount 
    } = data;

    const dateStr = date.toLocaleDateString('vi-VN', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const timeStr = date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    let report = `📊 *BÁO CÁO CÔNG VIỆC HÀNG NGÀY*\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📅 ${dateStr}\n`;
    report += `🕐 Thời gian: ${timeStr}\n\n`;

    // Overall statistics with visual bars
    const activeRate = allUsers.length > 0 ? Math.round((activeUsersCount / allUsers.length) * 100) : 0;
    const completionRate = totalTasksCreated > 0 ? Math.round((totalTasksCompleted / totalTasksCreated) * 100) : 0;
    
    report += `*📈 TỔNG QUAN HOẠT ĐỘNG:*\n`;
    report += `┌─────────────────────────┐\n`;
    report += `│ 👥 Người dùng: ${activeUsersCount}/${allUsers.length} (${activeRate}%)\n`;
    report += `│ ${this.createProgressBar(activeRate)}\n`;
    report += `│\n`;
    report += `│ 📝 Tasks tạo mới: ${totalTasksCreated}\n`;
    report += `│ ✅ Tasks hoàn thành: ${totalTasksCompleted}\n`;
    report += `│ 🎯 Tỷ lệ: ${completionRate}%\n`;
    report += `│ ${this.createProgressBar(completionRate)}\n`;
    report += `└─────────────────────────┘\n\n`;

    // Users without reports
    if (usersWithoutActivity.length > 0) {
      report += `*⚠️ CHƯA BÁO CÁO (${usersWithoutActivity.length} người):*\n`;
      report += `┌─────────────────────────┐\n`;
      for (const user of usersWithoutActivity) {
        const lastActivity = await this.userRepo.getUserLastActivity(user.id);
        const lastActivityStr = lastActivity 
          ? this.formatTimeSince(lastActivity)
          : 'Chưa có hoạt động';
        report += `│ 👤 ${user.name}\n`;
        report += `│    └ ${lastActivityStr}\n`;
      }
      report += `└─────────────────────────┘\n\n`;
    } else {
      report += `*✅ TẤT CẢ ĐÃ BÁO CÁO*\n`;
      report += `Tuyệt vời! 100% người dùng đã hoạt động.\n\n`;
    }

    // Active users details with ranking
    if (userActivities.length > 0) {
      // Sort by total activity (created + completed) - convert strings to numbers
      const sortedActivities = userActivities.sort((a, b) => 
        ((parseInt(b.created_today, 10) || 0) + (parseInt(b.completed_today, 10) || 0)) - 
        ((parseInt(a.created_today, 10) || 0) + (parseInt(a.completed_today, 10) || 0))
      );
      
      report += `*🏆 BẢNG XẾP HẠNG HOẠT ĐỘNG:*\n`;
      
      for (let i = 0; i < sortedActivities.length; i++) {
        const activity = sortedActivities[i];
        const user = allUsers.find(u => u.id === activity.user_id);
        if (!user) continue;
        
        // Ranking medal
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const createdToday = parseInt(activity.created_today, 10) || 0;
        const completedToday = parseInt(activity.completed_today, 10) || 0;
        const updatedToday = parseInt(activity.updated_today, 10) || 0;
        
        const userCompletionRate = createdToday > 0 
          ? Math.round((completedToday / createdToday) * 100) 
          : 0;

        // User performance emoji
        let performanceEmoji = '';
        if (userCompletionRate >= 80) performanceEmoji = '🔥';
        else if (userCompletionRate >= 60) performanceEmoji = '💪';
        else if (userCompletionRate >= 40) performanceEmoji = '📈';
        else if (userCompletionRate > 0) performanceEmoji = '🌱';
        else performanceEmoji = '💤';

        report += `\n${medal} *${user.name}* ${performanceEmoji}\n`;
        report += `┌──────────────────────────┐\n`;
        report += `│ 📊 *Thống kê cá nhân:*\n`;
        report += `│ ├─ 📝 Tạo mới: ${createdToday} tasks\n`;
        report += `│ ├─ ✅ Hoàn thành: ${completedToday} tasks\n`;
        report += `│ ├─ 🔄 Cập nhật: ${updatedToday} tasks\n`;
        report += `│ └─ 🎯 Hiệu suất: ${userCompletionRate}%\n`;
        report += `│\n`;
        report += `│ 📈 *Tiến độ hoàn thành:*\n`;
        report += `│ ${this.createProgressBar(userCompletionRate)} ${userCompletionRate}%\n`;

        // Get today's tasks for details
        const todayTasks = await this.taskRepo.getUserDailyTasks(user.id);
        const pendingTasks = todayTasks.filter(t => t.status === 'pending');
        const completedTasks = todayTasks.filter(t => t.status === 'completed');
        const cancelledTasks = todayTasks.filter(t => t.status === 'cancelled');
        
        // Get urgent and overdue tasks
        const now = new Date();
        const urgentTasks = pendingTasks.filter(t => t.priority === 'urgent');
        const overdueTasks = pendingTasks.filter(t => {
          if (!t.due_date) return false;
          return new Date(t.due_date) < now;
        });

        report += `│\n`;
        report += `│ 📋 *Chi tiết công việc:*\n`;
        
        // Show warning if has urgent or overdue tasks
        if (urgentTasks.length > 0 || overdueTasks.length > 0) {
          report += `│ ⚠️ *Cần chú ý:*\n`;
          if (urgentTasks.length > 0) {
            report += `│   🔴 ${urgentTasks.length} task khẩn cấp\n`;
          }
          if (overdueTasks.length > 0) {
            report += `│   ⏰ ${overdueTasks.length} task quá hạn\n`;
          }
        }

        if (completedTasks.length > 0) {
          report += `│\n`;
          report += `│ ✅ *Hoàn thành (${completedTasks.length}):*\n`;
          completedTasks.slice(0, 2).forEach(task => {
            const title = task.title.length > 30 ? task.title.slice(0, 30) + '...' : task.title;
            report += `│   • ${title}\n`;
          });
          if (completedTasks.length > 2) {
            report += `│   ... +${completedTasks.length - 2} tasks\n`;
          }
        }

        if (pendingTasks.length > 0) {
          report += `│\n`;
          report += `│ ⏳ *Đang thực hiện (${pendingTasks.length}):*\n`;
          pendingTasks.slice(0, 2).forEach(task => {
            const title = task.title.length > 30 ? task.title.slice(0, 30) + '...' : task.title;
            const priorityIcon = task.priority === 'urgent' ? '🔴' : 
                               task.priority === 'high' ? '🟡' : 
                               task.priority === 'medium' ? '🟢' : '⚪';
            report += `│   ${priorityIcon} ${title}\n`;
          });
          if (pendingTasks.length > 2) {
            report += `│   ... +${pendingTasks.length - 2} tasks\n`;
          }
        }

        // Personal recommendation
        report += `│\n`;
        report += `│ 💡 *Gợi ý cá nhân:*\n`;
        if (userCompletionRate < 30) {
          report += `│ ⚡ Cần tập trung hoàn thành\n`;
          report += `│    các task đã tạo\n`;
        } else if (userCompletionRate >= 80) {
          report += `│ 🌟 Hiệu suất xuất sắc!\n`;
          report += `│    Tiếp tục phát huy\n`;
        } else if (overdueTasks.length > 0) {
          report += `│ ⏰ Ưu tiên xử lý ${overdueTasks.length} task\n`;
          report += `│    đã quá hạn\n`;
        } else if (urgentTasks.length > 0) {
          report += `│ 🔴 Tập trung vào ${urgentTasks.length} task\n`;
          report += `│    khẩn cấp\n`;
        } else {
          report += `│ 📈 Duy trì tiến độ tốt\n`;
        }
        
        report += `└──────────────────────────┘\n`;
      }
    }

    // Summary and recommendations
    report += `\n*📌 ĐÁNH GIÁ & KHUYẾN NGHỊ:*\n`;
    report += `┌─────────────────────────┐\n`;
    
    // Performance rating
    let rating = '';
    let ratingEmoji = '';
    if (completionRate >= 80 && activeRate >= 80) {
      rating = 'Xuất sắc';
      ratingEmoji = '🌟🌟🌟🌟🌟';
    } else if (completionRate >= 60 && activeRate >= 60) {
      rating = 'Tốt';
      ratingEmoji = '🌟🌟🌟🌟';
    } else if (completionRate >= 40 && activeRate >= 40) {
      rating = 'Khá';
      ratingEmoji = '🌟🌟🌟';
    } else {
      rating = 'Cần cải thiện';
      ratingEmoji = '🌟🌟';
    }
    
    report += `│ 🎯 Đánh giá: ${rating}\n`;
    report += `│ ${ratingEmoji}\n`;
    report += `│\n`;
    
    if (usersWithoutActivity.length > 0) {
      report += `│ ⚠️ Cần nhắc nhở:\n`;
      report += `│ ${usersWithoutActivity.length} người chưa báo cáo\n`;
    }
    
    if (completionRate < 50) {
      report += `│ 💡 Gợi ý:\n`;
      report += `│ Cần tăng tỷ lệ hoàn thành\n`;
    }
    
    report += `└─────────────────────────┘\n`;
    report += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `_Báo cáo tự động by Task-Killer Bot_`;

    return report;
  }

  private async formatCompactReport(data: any): Promise<string> {
    const { 
      date, 
      allUsers, 
      usersWithoutActivity, 
      userActivities,
      totalTasksCreated, 
      totalTasksCompleted,
      activeUsersCount 
    } = data;

    const dateStr = date.toLocaleDateString('vi-VN');
    const completionRate = totalTasksCreated > 0 ? Math.round((totalTasksCompleted / totalTasksCreated) * 100) : 0;
    
    let report = `📊 *BÁO CÁO ${dateStr}*\n\n`;
    
    // Summary
    report += `📈 *Tổng quan:*\n`;
    report += `• Hoạt động: ${activeUsersCount}/${allUsers.length}\n`;
    report += `• Tạo mới: ${totalTasksCreated}\n`;
    report += `• Hoàn thành: ${totalTasksCompleted} (${completionRate}%)\n\n`;

    // Users without activity
    if (usersWithoutActivity.length > 0) {
      report += `⚠️ *Chưa báo cáo (${usersWithoutActivity.length}):*\n`;
      usersWithoutActivity.forEach(user => {
        report += `• ${user.name}\n`;
      });
      report += '\n';
    }

    // Top performers only
    if (userActivities.length > 0) {
      const sortedActivities = userActivities.sort((a: any, b: any) => 
        ((parseInt(b.created_today, 10) || 0) + (parseInt(b.completed_today, 10) || 0)) - 
        ((parseInt(a.created_today, 10) || 0) + (parseInt(a.completed_today, 10) || 0))
      );
      
      report += `🏆 *Top hoạt động:*\n`;
      
      for (let i = 0; i < Math.min(5, sortedActivities.length); i++) {
        const activity = sortedActivities[i];
        const user = allUsers.find((u: any) => u.id === activity.user_id);
        if (!user) continue;
        
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const createdToday = parseInt(activity.created_today, 10) || 0;
        const completedToday = parseInt(activity.completed_today, 10) || 0;
        const rate = createdToday > 0 
          ? Math.round((completedToday / createdToday) * 100) 
          : 0;
        
        report += `${medal} ${user.name}\n`;
        report += `   📝${createdToday} ✅${completedToday} (${rate}%)\n`;
      }
    }

    return report;
  }

  private createProgressBar(percentage: number): string {
    // Ensure percentage is between 0 and 100
    const safePercentage = Math.max(0, Math.min(100, percentage));
    const filled = Math.round(safePercentage / 10);
    const empty = Math.max(0, 10 - filled);
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}]`;
  }

  private formatTimeSince(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) {
        return '⚡ Vừa xong';
      }
      return `⏱️ ${diffMinutes} phút trước`;
    } else if (diffHours < 24) {
      return `🕐 ${diffHours} giờ trước`;
    } else if (diffDays === 1) {
      return '📅 Hôm qua';
    } else if (diffDays < 7) {
      return `📆 ${diffDays} ngày trước`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `🗓️ ${weeks} tuần trước`;
    } else {
      const months = Math.floor(diffDays / 30);
      return `📊 ${months} tháng trước`;
    }
  }

  private async saveReportToDatabase(
    reportContent: string,
    usersWithoutReports: number,
    activeUsers: number,
    totalTasksCreated: number,
    totalTasksCompleted: number
  ) {
    const admins = await this.userRepo.getAllAdmins();
    
    for (const admin of admins) {
      const query = `
        INSERT INTO daily_reports (
          report_date, 
          admin_id, 
          report_content, 
          users_without_reports, 
          active_users,
          total_tasks_created,
          total_tasks_completed
        )
        VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
        ON CONFLICT (report_date, admin_id) 
        DO UPDATE SET 
          report_content = EXCLUDED.report_content,
          users_without_reports = EXCLUDED.users_without_reports,
          active_users = EXCLUDED.active_users,
          total_tasks_created = EXCLUDED.total_tasks_created,
          total_tasks_completed = EXCLUDED.total_tasks_completed,
          sent_at = NOW()
      `;
      
      await this.db.query(query, [
        admin.id,
        reportContent,
        usersWithoutReports,
        activeUsers,
        totalTasksCreated,
        totalTasksCompleted
      ]);
    }
  }

  private async sendReportToAdmins(report: string) {
    if (!this.telegramService) {
      console.warn('Telegram service not initialized, cannot send report');
      return;
    }

    const admins = await this.userRepo.getAllAdmins();
    
    for (const admin of admins) {
      try {
        await this.telegramService.sendDirectMessage(admin.telegram_id, report, true);
        console.log(`📨 Daily report sent to admin: ${admin.name}`);
      } catch (error) {
        console.error(`Failed to send report to admin ${admin.name}:`, error);
      }
    }
  }

  async getReportHistory(adminId: string, limit: number = 7): Promise<any[]> {
    // Ensure limit is positive
    const safeLimit = Math.max(1, Math.abs(limit || 7));
    
    const query = `
      SELECT * FROM daily_reports 
      WHERE admin_id = $1
      ORDER BY report_date DESC
      LIMIT $2
    `;
    const result = await this.db.query(query, [adminId, safeLimit]);
    return result.rows;
  }

  async sendWorkReminder() {
    if (!this.telegramService) {
      console.warn('Telegram service not initialized, cannot send reminders');
      return;
    }

    try {
      // Get all active users
      const activeUsers = await this.userRepo.getAllUsers({ status: 'active', role: 'user' });
      
      // Check who hasn't reported today
      const usersWithoutActivity = await this.userRepo.getUsersWithoutActivityToday();
      const usersWithoutActivityIds = new Set(usersWithoutActivity.map(u => u.id));
      
      let remindersSent = 0;
      let alreadyReported = 0;
      
      for (const user of activeUsers) {
        try {
          if (usersWithoutActivityIds.has(user.id)) {
            // User hasn't reported - send reminder
            const message = `⏰ *NHẮC NHỞ BÁO CÁO CÔNG VIỆC*\n\n` +
              `Xin chào ${user.name}!\n\n` +
              `Đã đến giờ báo cáo công việc hàng ngày.\n` +
              `Bạn chưa có hoạt động nào hôm nay.\n\n` +
              `📝 Hãy:\n` +
              `• Tạo task mới cho công việc hôm nay\n` +
              `• Cập nhật trạng thái các task hiện có\n` +
              `• Hoàn thành các task đã làm xong\n\n` +
              `💡 Gợi ý:\n` +
              `• Gõ trực tiếp để tạo task (VD: "làm báo cáo dự án A")\n` +
              `• /list - Xem danh sách task\n` +
              `• /help - Xem hướng dẫn\n\n` +
              `⚠️ Admin sẽ nhận báo cáo tổng hợp lúc ${this.getReportTimeDisplay()}`;
              
            await this.telegramService.sendDirectMessage(user.telegram_id, message, true);
            remindersSent++;
            console.log(`📨 Reminder sent to: ${user.name}`);
          } else {
            // User has already reported
            const userActivity = await this.taskRepo.getUserActivityToday(user.id);
            
            const message = `✅ *CẢM ƠN BÁO CÁO!*\n\n` +
              `Xin chào ${user.name}!\n\n` +
              `Bạn đã báo cáo công việc hôm nay:\n` +
              `• Tạo mới: ${userActivity.created_today} tasks\n` +
              `• Hoàn thành: ${userActivity.completed_today} tasks\n` +
              `• Đang chờ: ${userActivity.pending_tasks} tasks\n\n` +
              `Tiếp tục cập nhật nếu có thêm công việc.\n\n` +
              `💪 Chúc bạn làm việc hiệu quả!`;
              
            await this.telegramService.sendDirectMessage(user.telegram_id, message, true);
            alreadyReported++;
            console.log(`✅ Confirmation sent to: ${user.name}`);
          }
        } catch (error) {
          console.error(`Failed to send reminder to ${user.name}:`, error);
        }
      }
      
      // Send summary to admins
      const admins = await this.userRepo.getAllAdmins();
      const summaryMessage = `📢 *KẾT QUẢ NHẮC NHỞ 15:00*\n\n` +
        `• Tổng số người dùng: ${activeUsers.length}\n` +
        `• Đã báo cáo: ${alreadyReported}\n` +
        `• Chưa báo cáo: ${remindersSent}\n\n` +
        `Đã gửi nhắc nhở cho ${remindersSent} người chưa báo cáo.\n` +
        `Báo cáo chi tiết sẽ được gửi lúc ${this.getReportTimeDisplay()}.`;
      
      for (const admin of admins) {
        try {
          await this.telegramService.sendDirectMessage(admin.telegram_id, summaryMessage, true);
        } catch (error) {
          console.error(`Failed to send summary to admin ${admin.name}:`, error);
        }
      }
      
      console.log(`🔔 Work reminders sent: ${remindersSent} reminders, ${alreadyReported} confirmations`);
      
    } catch (error) {
      console.error('Error sending work reminders:', error);
    }
  }
}