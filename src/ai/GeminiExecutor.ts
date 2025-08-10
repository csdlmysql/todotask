import { GoogleGenerativeAI } from '@google/generative-ai';
import { IntentAnalysis, ExecutionResult } from '../types/context.js';
import { TaskRepository } from '../database/tasks.js';
import { ConversationContextManager } from '../context/ConversationContext.js';

export class GeminiExecutor {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private taskRepo: TaskRepository;

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
        message: analysis.clarification_needed || 'Bạn có thể nói rõ hơn không?'
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
        message: 'Thiếu tiêu đề task. Bạn muốn tạo task gì?'
      };
    }

    try {
      const taskInput = {
        title: entities.title,
        description: entities.description,
        priority: entities.priority || context.user_preferences?.defaultPriority || 'medium',
        category: entities.category || context.user_preferences?.defaultCategory,
        tags: entities.tags,
        due_date: entities.deadline ? new Date(entities.deadline) : undefined
      };

      const task = await this.taskRepo.createTask(taskInput);

      return {
        success: true,
        action: 'create',
        data: task,
        message: `✅ Đã tạo task "${task.title}" thành công!`,
        context_updates: {
          entities: { 
            lastTask: task,
            // Add to task ID memory
            shouldAddToMemory: { type: 'single', task: task }
          },
          preferences: this.learnFromTask(taskInput, context.user_preferences)
        },
        follow_up_suggestions: [
          'Xem chi tiết task',
          'Tạo task tiếp theo', 
          'Xem danh sách task'
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

    try {
      const filters: any = {};
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
          'Xem chi tiết task đầu tiên',
          'Lọc thêm theo tiêu chí khác',
          'Cập nhật task nào đó'
        ] : [
          'Tạo task mới',
          'Xem tất cả task',
          'Tìm task khác'
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
        message: 'Không thể xác định chính xác task nào để cập nhật. Vui lòng nói rõ hơn về task cần chỉnh sửa.',
        needs_clarification: true
      };
    }

    try {

      const updateData: any = { id: taskId };
      if (entities.title) updateData.title = entities.title;
      if (entities.description) updateData.description = entities.description;
      if (entities.status) updateData.status = entities.status;
      if (entities.priority) updateData.priority = entities.priority;
      if (entities.deadline) updateData.due_date = new Date(entities.deadline);
      if (entities.category) updateData.category = entities.category;
      if (entities.tags) updateData.tags = entities.tags;

      const updatedTask = await this.taskRepo.updateTask(updateData);

      if (!updatedTask) {
        return {
          success: false,
          action: 'update',
          message: 'Không tìm thấy task để cập nhật.'
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
        message: 'Không thể xác định chính xác task nào để xóa. Vui lòng nói rõ hơn về task cần xóa.',
        needs_clarification: true
      };
    }

    try {
      const deleted = await this.taskRepo.deleteTask(taskId);

      if (!deleted) {
        return {
          success: false,
          action: 'delete',
          message: 'Không tìm thấy task để xóa.'
        };
      }

      return {
        success: true,
        action: 'delete',
        data: { task_id: entities.task_id },
        message: '🗑️ Đã xóa task thành công!',
        follow_up_suggestions: [
          'Xem danh sách task còn lại',
          'Tạo task mới',
          'Undo thao tác vừa rồi'
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
        message: 'Cần từ khóa để tìm kiếm task.'
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
Execute the following task management operation:

ANALYSIS: ${JSON.stringify(analysis)}
CONTEXT: ${JSON.stringify(context)}

Call the appropriate function based on the analysis.
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
          if (args.deadline) updateData.due_date = new Date(args.deadline);
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
}