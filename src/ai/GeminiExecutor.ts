import { GoogleGenerativeAI } from '@google/generative-ai';
import { IntentAnalysis, ExecutionResult } from '../types/context.js';
import { TaskRepository } from '../database/tasks.js';
import { ConversationContextManager } from '../context/ConversationContext.js';

export class GeminiExecutor {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private taskRepo: TaskRepository;
  private currentUserId: string | null = null;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',  // Use Gemini Flash 2.5 equivalent
      tools: [{ functionDeclarations: this.getFunctionDeclarations() }],
      generationConfig: {
        temperature: 0.1, // Very low for consistent function calling
        topP: 0.8,
      }
    });
    this.taskRepo = new TaskRepository();
  }

  // Set the current user context
  setUserContext(userId: string): void {
    this.currentUserId = userId;
  }

  // Clear user context
  clearUserContext(): void {
    this.currentUserId = null;
  }

  async executeInstructions(
    analysis: IntentAnalysis, 
    contextManager: ConversationContextManager
  ): Promise<ExecutionResult> {
    const context = contextManager.getContextForAI();

    // Handle low confidence - ask for clarification
    if (analysis.confidence < 0.7) {
      return {
        success: false,
        action: 'clarification',
        message: analysis.clarification_needed || 'Can you be more specific?'
      };
    }

    // Resolve context references
    const resolvedAnalysis = await this.resolveContextReferences(analysis, contextManager);

    try {
      // Execute based on primary action
      switch (resolvedAnalysis.primary_action) {
        case 'create':
          return await this.executeCreateTask(resolvedAnalysis, context);
        case 'read':
          return await this.executeReadTasks(resolvedAnalysis, context);
        case 'update':
          return await this.executeUpdateTask(resolvedAnalysis, context, contextManager);
        case 'delete':
          return await this.executeDeleteTask(resolvedAnalysis, context, contextManager);
        case 'search':
          return await this.executeSearchTasks(resolvedAnalysis, context);
        case 'analyze':
          return await this.executeAnalyzeTasks(resolvedAnalysis, context);
        default:
          return this.executeWithGeminiFunction(resolvedAnalysis, context, contextManager);
      }
    } catch (error) {
      return {
        success: false,
        action: resolvedAnalysis.primary_action,
        message: `Lỗi thực hiện: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async resolveContextReferences(
    analysis: IntentAnalysis, 
    contextManager: ConversationContextManager
  ): Promise<IntentAnalysis> {
    const resolved = { ...analysis };

    // Priority 1: Use explicit task_id from analysis if already resolved
    if (analysis.entities.task_id && this.isValidUUID(analysis.entities.task_id)) {
      return resolved; // Already has valid ID
    }

    // Priority 2: Resolve task references
    if (analysis.entities.task_references?.length) {
      for (const ref of analysis.entities.task_references) {
        const task = contextManager.resolveTaskReference(ref);
        if (task && task.id && this.isValidUUID(task.id)) {
          // Set resolved task ID
          if (analysis.primary_action === 'update' || analysis.primary_action === 'delete') {
            resolved.entities.task_id = task.id;
            break; // Use first valid match
          }
        }
      }
    }

    // Priority 3: Check for implicit references in update/delete actions
    if (!resolved.entities.task_id && (analysis.primary_action === 'update' || analysis.primary_action === 'delete')) {
      const taskIdMapping = contextManager.getTaskIdMappingForAI();
      const context = contextManager.getContextForAI();

      // Try to find implicit task ID from active context
      if (context.temporary_entities?.activeTaskContext?.primary) {
        const implicitTaskId = context.temporary_entities.activeTaskContext.primary;
        if (this.isValidUUID(implicitTaskId)) {
          resolved.entities.task_id = implicitTaskId;
        }
      }
    }

    return resolved;
  }

  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  private getContextManager(context: any): ConversationContextManager {
    // Helper để get contextManager từ context
    return context.contextManager || null;
  }

  // Flexible task resolution từ text, title, hoặc UUID
  private async resolveTaskFromText(identifier: string, contextManager: ConversationContextManager): Promise<string | null> {
    // Priority 1: Nếu đã là valid UUID, return luôn
    if (this.isValidUUID(identifier)) {
      return identifier;
    }

    // Priority 2: Check context resolution trước
    const contextTask = contextManager.resolveTaskReference(identifier);
    if (contextTask && contextTask.id && this.isValidUUID(contextTask.id)) {
      return contextTask.id;
    }

    // Priority 3: Search trong database theo text
    try {
      // Tìm exact title match trước
      const allTasks = await this.taskRepo.getTasks();
      
      // Exact title match (case insensitive)
      const exactMatch = allTasks.find(task => 
        task.title.toLowerCase() === identifier.toLowerCase()
      );
      if (exactMatch) return exactMatch.id;

      // Partial title match
      const partialMatch = allTasks.find(task => 
        task.title.toLowerCase().includes(identifier.toLowerCase())
      );
      if (partialMatch) return partialMatch.id;

      // Search in description
      const descMatch = allTasks.find(task => 
        task.description && task.description.toLowerCase().includes(identifier.toLowerCase())
      );
      if (descMatch) return descMatch.id;

      // Partial UUID match (8+ characters)
      if (identifier.length >= 8) {
        const uuidMatch = allTasks.find(task => 
          task.id.toLowerCase().startsWith(identifier.toLowerCase())
        );
        if (uuidMatch) return uuidMatch.id;
      }

    } catch (error) {
      console.warn('Error searching tasks:', error);
    }

    return null; // Không tìm thấy
  }

  private async executeCreateTask(analysis: IntentAnalysis, context: any): Promise<ExecutionResult> {
    const entities = analysis.entities;

    if (!entities.title) {
      return {
        success: false,
        action: 'create',
        message: 'Task title is required. What task do you want to create?'
      };
    }

    if (!this.currentUserId) {
      return {
        success: false,
        action: 'create',
        message: 'User context is required to create tasks.'
      };
    }

    try {
      const taskInput = {
        user_id: this.currentUserId,
        title: entities.title,
        description: entities.description,
        priority: entities.priority || context.user_preferences?.defaultPriority || 'medium',
        category: entities.category || context.user_preferences?.defaultCategory,
        tags: entities.tags,
        due_date: entities.deadline ? this.parseValidDate(entities.deadline) : undefined
      };

      const task = await this.taskRepo.createTask(taskInput);

      return {
        success: true,
        action: 'create',
        data: task,
        message: `✅ Task "${task.title}" created successfully! 📈 Keep up the productivity momentum.`,
        context_updates: {
          entities: { 
            lastTask: task,
            // Add to task ID memory
            shouldAddToMemory: { type: 'single', task: task }
          },
          preferences: this.learnFromTask(taskInput, context.user_preferences)
        },
        follow_up_suggestions: [
          'Track task progress',
          'Set productivity goals', 
          'Analyze task patterns'
        ]
      };
    } catch (error) {
      return {
        success: false,
        action: 'create',
        message: `❌ Không thể tạo task: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async executeReadTasks(analysis: IntentAnalysis, context: any): Promise<ExecutionResult> {
    const entities = analysis.entities;

    if (!this.currentUserId) {
      return {
        success: false,
        action: 'read',
        message: 'User context is required to read tasks.'
      };
    }

    try {
      const filters: any = { user_id: this.currentUserId };
      if (entities.status) filters.status = entities.status;
      if (entities.priority) filters.priority = entities.priority;
      if (entities.category) filters.category = entities.category;

      // Smart filtering based on deadline mentions
      if (entities.deadline) {
        // This would need more complex date logic
        filters.due_date = entities.deadline;
      }

      const tasks = await this.taskRepo.getTasks(filters);

      let message = `📋 Tìm thấy ${tasks.length} task`;
      if (Object.keys(filters).length > 0) {
        const filterDesc = Object.entries(filters)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        message += ` (${filterDesc})`;
      }

      return {
        success: true,
        action: 'read',
        data: tasks,
        message,
        context_updates: {
          entities: { 
            lastList: tasks, 
            recentTasks: tasks.slice(0, 10),
            // Add to task ID memory
            shouldAddToMemory: { type: 'multiple', tasks: tasks }
          }
        },
        follow_up_suggestions: tasks.length > 0 ? [
          'Review task priorities',
          'Analyze completion trends',
          'Optimize task workflow'
        ] : [
          'Create first task',
          'Set productivity goals',
          'Setup task categories'
        ]
      };
    } catch (error) {
      return {
        success: false,
        action: 'read',
        message: `❌ Không thể lấy danh sách task: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async executeUpdateTask(analysis: IntentAnalysis, context: any, contextManager: ConversationContextManager): Promise<ExecutionResult> {
    const entities = analysis.entities;

    // Flexible task resolution từ entities.task_id hoặc task references
    let taskId: string | null = null;

    if (entities.task_id) {
      taskId = await this.resolveTaskFromText(entities.task_id, contextManager);
    }

    // Strict validation: Must resolve to valid UUID
    if (!taskId || !this.isValidUUID(taskId)) {
      return {
        success: false,
        action: 'update',
        message: 'Cannot identify which task to update. Please be more specific about the task to modify.',
        needs_clarification: true
      };
    }

    try {

      const updateData: any = { id: taskId };
      if (entities.title) updateData.title = entities.title;
      if (entities.description) updateData.description = entities.description;
      if (entities.status) updateData.status = entities.status;
      if (entities.priority) updateData.priority = entities.priority;
      if (entities.deadline) updateData.due_date = this.parseValidDate(entities.deadline);
      if (entities.category) updateData.category = entities.category;
      if (entities.tags) updateData.tags = entities.tags;

      const updatedTask = await this.taskRepo.updateTask(updateData);

      if (!updatedTask) {
        return {
          success: false,
          action: 'update',
          message: 'Task not found for update.'
        };
      }

      return {
        success: true,
        action: 'update',
        data: updatedTask,
        message: `✅ Đã cập nhật task "${updatedTask.title}" thành công!`,
        context_updates: {
          entities: { lastTask: updatedTask }
        },
        follow_up_suggestions: [
          'Xem task đã cập nhật',
          'Cập nhật task khác',
          'Xem danh sách task'
        ]
      };
    } catch (error) {
      return {
        success: false,
        action: 'update',
        message: `❌ Không thể cập nhật task: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async executeDeleteTask(analysis: IntentAnalysis, context: any, contextManager: ConversationContextManager): Promise<ExecutionResult> {
    const entities = analysis.entities;

    // Handle bulk delete by status
    if (entities.bulk_delete && entities.status) {
      return await this.executeBulkDeleteByStatus(entities.status);
    }

    // Flexible task resolution từ entities.task_id 
    let taskId: string | null = null;

    if (entities.task_id) {
      taskId = await this.resolveTaskFromText(entities.task_id, contextManager);
    }

    // Strict validation: Must resolve to valid UUID
    if (!taskId || !this.isValidUUID(taskId)) {
      return {
        success: false,
        action: 'delete',
        message: 'Cannot identify which task to delete. Please be more specific about the task to remove.',
        needs_clarification: true
      };
    }

    try {
      const deleted = await this.taskRepo.deleteTask(taskId);

      if (!deleted) {
        return {
          success: false,
          action: 'delete',
          message: 'Task not found for deletion.'
        };
      }

      return {
        success: true,
        action: 'delete',
        data: { task_id: entities.task_id },
        message: '🗑️ Task deleted successfully!',
        follow_up_suggestions: [
          'View remaining tasks',
          'Create new task',
          'Show task statistics'
        ]
      };
    } catch (error) {
      return {
        success: false,
        action: 'delete',
        message: `❌ Không thể xóa task: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async executeSearchTasks(analysis: IntentAnalysis, context: any): Promise<ExecutionResult> {
    const entities = analysis.entities;
    const searchTerm = entities.title || analysis.instructions.split('"')[1] || '';

    if (!searchTerm) {
      return {
        success: false,
        action: 'search',
        message: 'Search keyword is required.'
      };
    }

    try {
      const tasks = await this.taskRepo.searchTasks(searchTerm);

      return {
        success: true,
        action: 'search',
        data: tasks,
        message: `🔍 Tìm thấy ${tasks.length} task với từ khóa "${searchTerm}"`,
        context_updates: {
          entities: { lastList: tasks, recentTasks: tasks }
        },
        follow_up_suggestions: tasks.length > 0 ? [
          'Xem chi tiết kết quả đầu tiên',
          'Lọc kết quả thêm',
          'Tìm kiếm từ khóa khác'
        ] : [
          'Thử từ khóa khác',
          'Xem tất cả task',
          'Tạo task mới'
        ]
      };
    } catch (error) {
      return {
        success: false,
        action: 'search',
        message: `❌ Lỗi tìm kiếm: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async executeAnalyzeTasks(analysis: IntentAnalysis, context: any): Promise<ExecutionResult> {
    try {
      const stats = await this.taskRepo.getTaskStats();

      return {
        success: true,
        action: 'analyze',
        data: stats,
        message: '📊 Thống kê task của bạn:',
        follow_up_suggestions: [
          'Xem chi tiết thống kê',
          'Lọc theo thời gian',
          'Tối ưu hóa workflow'
        ]
      };
    } catch (error) {
      return {
        success: false,
        action: 'analyze',
        message: `❌ Không thể phân tích: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async executeWithGeminiFunction(analysis: IntentAnalysis, context: any, contextManager: ConversationContextManager): Promise<ExecutionResult> {
    // Fallback to Gemini function calling for complex operations
    const prompt = `
🧠 SMART TASK-KILLER ASSISTANT - EXECUTION MODE

📋 IDENTITY: Professional Task Management AI Assistant
• Focus: Productivity optimization and performance tracking
• Capabilities: Context memory, smart automation, analytics
• Mission: Execute task operations efficiently and provide insights

🎯 EXECUTION CONTEXT:
ANALYSIS: ${JSON.stringify(analysis)}
CONTEXT: ${JSON.stringify(context)}

🚀 EXECUTION INSTRUCTIONS:
1. Execute the primary task operation based on analysis
2. Maintain context awareness for references
3. Provide performance insights when applicable
4. Suggest productivity improvements
5. Track patterns for future optimization

Call the appropriate function to complete this task management operation.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response;

      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        return await this.executeFunctionCall(functionCall, contextManager);
      }

      return {
        success: false,
        action: analysis.primary_action,
        message: 'Không thể thực hiện thao tác này.'
      };
    } catch (error) {
      return {
        success: false,
        action: analysis.primary_action,
        message: `❌ Lỗi thực hiện: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async executeFunctionCall(functionCall: any, contextManager: ConversationContextManager): Promise<ExecutionResult> {
    const { name, args } = functionCall;
    
    try {
      switch (name) {
        case 'delete_task':
          // Map old 'id' to new 'task_identifier' for backward compatibility
          const deleteIdentifier = args.task_identifier || args.id;
          if (!deleteIdentifier) {
            return {
              success: false,
              action: 'delete',
              message: 'Thiếu thông tin task cần xóa.'
            };
          }
          
          const deleteTaskId = await this.resolveTaskFromText(deleteIdentifier, contextManager);
          if (!deleteTaskId) {
            return {
              success: false,
              action: 'delete',
              message: `Không tìm thấy task "${deleteIdentifier}". Vui lòng kiểm tra lại tên task.`
            };
          }

          const deleted = await this.taskRepo.deleteTask(deleteTaskId);
          if (deleted) {
            return {
              success: true,
              action: 'delete',
              data: { task_id: deleteTaskId },
              message: `🗑️ Đã xóa task "${deleteIdentifier}" thành công!`,
              follow_up_suggestions: [
                'Xem danh sách task còn lại',
                'Tạo task mới',
                'Undo thao tác vừa rồi'
              ]
            };
          } else {
            return {
              success: false,
              action: 'delete',
              message: 'Không thể xóa task. Task có thể đã được xóa trước đó.'
            };
          }

        case 'update_task':
          // Map old 'id' to new 'task_identifier' for backward compatibility  
          const updateIdentifier = args.task_identifier || args.id;
          if (!updateIdentifier) {
            return {
              success: false,
              action: 'update',
              message: 'Thiếu thông tin task cần cập nhật.'
            };
          }

          const updateTaskId = await this.resolveTaskFromText(updateIdentifier, contextManager);
          if (!updateTaskId) {
            return {
              success: false,
              action: 'update',
              message: `Không tìm thấy task "${updateIdentifier}". Vui lòng kiểm tra lại tên task.`
            };
          }

          const updateData: any = { id: updateTaskId };
          if (args.title) updateData.title = args.title;
          if (args.description) updateData.description = args.description;
          if (args.status) updateData.status = args.status;
          if (args.priority) updateData.priority = args.priority;
          if (args.deadline) updateData.due_date = this.parseValidDate(args.deadline);
          if (args.category) updateData.category = args.category;

          const updatedTask = await this.taskRepo.updateTask(updateData);
          if (updatedTask) {
            return {
              success: true,
              action: 'update',
              data: updatedTask,
              message: `✅ Đã cập nhật task "${updatedTask.title}" thành công!`,
              context_updates: {
                entities: { 
                  lastTask: updatedTask,
                  shouldAddToMemory: { type: 'single', task: updatedTask }
                }
              },
              follow_up_suggestions: [
                'Xem task đã cập nhật',
                'Cập nhật task khác', 
                'Xem danh sách task'
              ]
            };
          } else {
            return {
              success: false,
              action: 'update',
              message: 'Không thể cập nhật task.'
            };
          }

        default:
          return {
            success: false,
            action: name,
            message: `Không hỗ trợ function "${name}".`
          };
      }
    } catch (error) {
      return {
        success: false,
        action: name,
        message: `❌ Lỗi thực hiện ${name}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private learnFromTask(taskInput: any, currentPreferences: any): any {
    const updates: any = {};

    // Learn default category
    if (taskInput.category && 
        (!currentPreferences.defaultCategory || Math.random() < 0.3)) {
      updates.defaultCategory = taskInput.category;
    }

    // Learn default priority patterns (could be more sophisticated)
    if (taskInput.priority && Math.random() < 0.2) {
      updates.defaultPriority = taskInput.priority;
    }

    return Object.keys(updates).length > 0 ? updates : undefined;
  }

  private getFunctionDeclarations(): any[] {
    return [
      {
        name: 'create_task',
        description: 'Create a new task',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            category: { type: 'string', description: 'Task category' },
            deadline: { type: 'string', description: 'Due date in ISO format' },
            tags: { type: 'array', items: { type: 'string' } }
          },
          required: ['title']
        }
      },
      {
        name: 'list_tasks',
        description: 'List tasks with optional filtering',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            category: { type: 'string' },
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'update_task',
        description: 'Update an existing task - can identify task by ID, title, or partial text match',
        parameters: {
          type: 'object',
          properties: {
            task_identifier: { type: 'string', description: 'Task ID, title, or partial text to identify the task (e.g. "fix bug", "test", partial title)' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            category: { type: 'string' },
            deadline: { type: 'string' }
          },
          required: ['task_identifier']
        }
      },
      {
        name: 'delete_task',
        description: 'Delete a task - can identify task by ID, title, or partial text match',
        parameters: {
          type: 'object',
          properties: {
            task_identifier: { type: 'string', description: 'Task ID, title, or partial text to identify the task (e.g. "fix bug", "test", partial title)' }
          },
          required: ['task_identifier']
        }
      },
      {
        name: 'search_tasks',
        description: 'Search tasks by keyword',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    ];
  }

  private async executeBulkDeleteByStatus(status: string): Promise<ExecutionResult> {
    try {
      // First, get all tasks with the specified status
      const tasksToDelete = await this.taskRepo.getTasks({ status });
      
      if (tasksToDelete.length === 0) {
        return {
          success: false,
          action: 'delete',
          message: `📭 No tasks found with status "${status}"`
        };
      }

      // Show confirmation-like message with count
      const statusEmojis: Record<string, string> = {
        completed: '✅',
        cancelled: '❌', 
        pending: '⏳',
        in_progress: '🔄'
      };
      const emoji = statusEmojis[status] || '📋';

      // Delete all tasks with the specified status
      let deletedCount = 0;
      const failedTasks = [];

      for (const task of tasksToDelete) {
        try {
          const deleted = await this.taskRepo.deleteTask(task.id);
          if (deleted) {
            deletedCount++;
          } else {
            failedTasks.push(task.title);
          }
        } catch (error) {
          failedTasks.push(task.title);
        }
      }

      if (deletedCount === 0) {
        return {
          success: false,
          action: 'delete', 
          message: `❌ Failed to delete any ${status} tasks`
        };
      }

      let message = `🗑️ Successfully deleted ${deletedCount} ${status} tasks ${emoji}`;
      if (failedTasks.length > 0) {
        message += `\n⚠️ Failed to delete ${failedTasks.length} tasks: ${failedTasks.slice(0, 3).join(', ')}`;
      }

      return {
        success: true,
        action: 'delete',
        message,
        data: {
          deleted_count: deletedCount,
          failed_count: failedTasks.length,
          status,
          total_found: tasksToDelete.length
        },
        follow_up_suggestions: [
          'Show remaining tasks',
          'View task statistics', 
          'Create new task'
        ]
      };

    } catch (error) {
      return {
        success: false,
        action: 'delete',
        message: `❌ Error during bulk delete: ${error}`
      };
    }
  }

  private parseValidDate(dateInput: string | Date): Date | undefined {
    try {
      let date: Date;
      
      if (dateInput instanceof Date) {
        date = dateInput;
      } else if (typeof dateInput === 'string') {
        // Handle common date formats
        if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // YYYY-MM-DD format
          date = new Date(dateInput + 'T00:00:00.000Z');
        } else if (dateInput.match(/^\d{4}-\d{2}-\d{2}T/)) {
          // ISO format with time
          date = new Date(dateInput);
        } else {
          // Try parsing directly
          date = new Date(dateInput);
        }
      } else {
        return undefined;
      }
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date: ${dateInput}, using tomorrow as fallback`);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      }
      
      return date;
    } catch (error) {
      console.warn(`Date parsing error for ${dateInput}:`, error);
      // Fallback to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
  }
}