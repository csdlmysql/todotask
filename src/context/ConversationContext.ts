import { ConversationContext, Message, UserPreferences, TemporaryEntities, SessionFlow, ExecutionResult } from '../types/context.js';
import { v4 as uuidv4 } from 'uuid';

export class ConversationContextManager {
  private context: ConversationContext;

  constructor() {
    this.context = this.initializeContext();
  }

  private initializeContext(): ConversationContext {
    return {
      history: [],
      maxHistoryLength: 20,
      sessionId: uuidv4(),
      startTime: new Date(),
      preferences: {
        defaultPriority: 'medium',
        workingHours: { start: '09:00', end: '18:00' },
        timezone: 'Asia/Ho_Chi_Minh',
        language: 'vi',
        notificationSettings: {
          desktop: true,
          telegram: false,
          beforeDeadline: 2 // 2 hours before
        }
      },
      entities: {},
      stats: {
        totalTasks: 0,
        completedTasks: 0,
        commonCategories: [],
        commonPriorities: { low: 0, medium: 0, high: 0, urgent: 0 },
        averageTaskDuration: 1,
        peakProductivityHours: []
      },
      actionHistory: []
    };
  }

  // Message management
  addMessage(type: 'user' | 'bot', content: string, metadata?: any): void {
    const message: Message = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      content,
      metadata
    };

    this.context.history.push(message);

    // Keep history within limits
    if (this.context.history.length > this.context.maxHistoryLength) {
      this.context.history.shift();
    }
  }

  // Context retrieval for AI
  getContextForAI(): any {
    return {
      recent_messages: this.context.history.slice(-5).map(msg => ({
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      })),
      
      current_flow: this.context.currentFlow,
      
      temporary_entities: this.context.entities,
      
      user_preferences: this.context.preferences,
      
      session_stats: {
        session_duration: Date.now() - this.context.startTime.getTime(),
        messages_count: this.context.history.length
      },

      user_patterns: {
        common_categories: this.context.stats.commonCategories,
        preferred_priority: this.getMostUsedPriority(),
        typical_deadline: this.getTypicalDeadlinePattern()
      }
    };
  }

  // Update context after operations
  updateContext(result: ExecutionResult): void {
    // Handle Task ID Memory population FIRST
    if (result.context_updates?.entities?.shouldAddToMemory) {
      const memoryData = result.context_updates.entities.shouldAddToMemory;
      
      if (memoryData.type === 'single' && memoryData.task) {
        this.addTaskToMemory(memoryData.task);
      } else if (memoryData.type === 'multiple' && memoryData.tasks) {
        this.addMultipleTasksToMemory(memoryData.tasks);
      }
      
      // Remove the shouldAddToMemory flag after processing
      delete result.context_updates.entities.shouldAddToMemory;
    }

    // Update temporary entities
    if (result.context_updates?.entities) {
      this.context.entities = {
        ...this.context.entities,
        ...result.context_updates.entities
      };
    }

    // Update preferences
    if (result.context_updates?.preferences) {
      this.context.preferences = {
        ...this.context.preferences,
        ...result.context_updates.preferences
      };
    }

    // Update flow
    if (result.context_updates?.flow) {
      this.context.currentFlow = result.context_updates.flow;
    }

    // Record action for potential undo
    this.context.actionHistory.push({
      action: result.action,
      timestamp: new Date(),
      data: result.data,
      reversible: ['create', 'update', 'delete'].includes(result.action)
    });

    // Keep action history limited
    if (this.context.actionHistory.length > 10) {
      this.context.actionHistory.shift();
    }
  }

  // Learn from user behavior
  learnFromTaskOperation(task: any, action: string): void {
    if (action === 'create') {
      this.context.stats.totalTasks++;
      
      // Learn common categories
      if (task.category && !this.context.stats.commonCategories.includes(task.category)) {
        this.context.stats.commonCategories.push(task.category);
      }
      
      // Learn priority patterns
      this.context.stats.commonPriorities[task.priority]++;
      
      // Update default category if this becomes most used
      const mostUsedCategory = this.getMostUsedCategory();
      if (mostUsedCategory) {
        this.context.preferences.defaultCategory = mostUsedCategory;
      }
    }
    
    if (action === 'complete') {
      this.context.stats.completedTasks++;
    }
  }

  // Context resolution helpers with Task ID Memory
  resolveTaskReference(reference: string): any {
    // Priority 1: Check explicit task ID mapping
    if (this.context.entities.taskIdMap) {
      const taskId = this.context.entities.taskIdMap[reference.toLowerCase()];
      if (taskId) {
        return this.findTaskById(taskId);
      }
    }

    // Priority 2: Check recently displayed tasks from conversation
    const recentlyDisplayedTasks = this.getRecentlyDisplayedTasks();
    if (recentlyDisplayedTasks.length > 0) {
      // Exact partial title match from recent conversation
      const conversationMatch = recentlyDisplayedTasks.find(task => 
        task.title.toLowerCase().includes(reference.toLowerCase())
      );
      if (conversationMatch) return conversationMatch;
    }

    // Priority 3: Check active task context
    if (this.context.entities.activeTaskContext?.primary) {
      // Implicit references when discussing a specific task
      if (['task đó', 'task này', 'này', 'cái đó', 'nó'].includes(reference.toLowerCase())) {
        return this.findTaskById(this.context.entities.activeTaskContext.primary);
      }
    }

    // Priority 4: Traditional references  
    if (['task đó', 'task vừa tạo', 'task cuối', 'cái đó', 'task này', 'này'].includes(reference.toLowerCase())) {
      return this.context.entities.lastTask;
    }
    
    // "task đầu tiên", "task đầu" 
    if (['task đầu tiên', 'task đầu'].includes(reference.toLowerCase())) {
      return this.context.entities.lastList?.[0];
    }

    // Try to find by partial UUID (like "e454d609")
    if (this.context.entities.recentTasks && reference.length >= 8) {
      const match = this.context.entities.recentTasks.find(task => 
        task.id && task.id.toLowerCase().startsWith(reference.toLowerCase())
      );
      if (match) return match;
    }

    // Try to find by partial title match in all collections
    if (this.context.entities.recentTasks) {
      const match = this.context.entities.recentTasks.find(task => 
        task.title.toLowerCase().includes(reference.toLowerCase())
      );
      return match;
    }

    return null;
  }

  private getRecentlyDisplayedTasks(): any[] {
    // Get tasks from recent bot messages
    const recentBotMessages = this.context.history
      .filter(msg => msg.type === 'bot')
      .slice(-3) // Last 3 bot messages
      .reverse(); // Most recent first

    const displayedTasks: any[] = [];
    
    for (const message of recentBotMessages) {
      if (message.metadata?.displayedTasks) {
        displayedTasks.push(...message.metadata.displayedTasks);
      }
    }

    return displayedTasks;
  }

  private findTaskById(taskId: string): any {
    // First check if we have the task directly in memory (for testing)
    if (this.context.entities.lastTask && this.context.entities.lastTask.id === taskId) {
      return this.context.entities.lastTask;
    }

    // Search in all available task collections
    const collections = [
      this.context.entities.recentTasks,
      this.context.entities.lastList,
      this.context.entities.activeTaskContext?.lastDisplayed
    ];

    for (const collection of collections) {
      if (collection) {
        const task = collection.find((t: any) => t.id === taskId);
        if (task) return task;
      }
    }

    return null;
  }

  // Flow management
  startFlow(type: SessionFlow['type'], data?: any): void {
    this.context.currentFlow = {
      type,
      step: 0,
      data: data || {},
      startedAt: new Date(),
      timeout: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes timeout
    };
  }

  updateFlow(step: number, data?: any): void {
    if (this.context.currentFlow) {
      this.context.currentFlow.step = step;
      if (data) {
        this.context.currentFlow.data = { ...this.context.currentFlow.data, ...data };
      }
    }
  }

  completeFlow(): void {
    this.context.currentFlow = undefined;
  }

  isFlowActive(): boolean {
    if (!this.context.currentFlow) return false;
    
    // Check timeout
    if (this.context.currentFlow.timeout && new Date() > this.context.currentFlow.timeout) {
      this.completeFlow();
      return false;
    }
    
    return true;
  }

  // Analytics helpers
  private getMostUsedPriority(): string {
    const priorities = this.context.stats.commonPriorities;
    return Object.entries(priorities).sort(([,a], [,b]) => b - a)[0]?.[0] || 'medium';
  }

  private getMostUsedCategory(): string | undefined {
    // This would be more complex in real implementation
    return this.context.stats.commonCategories[0];
  }

  private getTypicalDeadlinePattern(): string {
    // Based on user's typical deadline setting patterns
    // For now, return default
    return '1 day';
  }

  // Get summary for debugging/display
  getContextSummary(): any {
    return {
      session_id: this.context.sessionId,
      messages_count: this.context.history.length,
      current_flow: this.context.currentFlow?.type || 'none',
      last_task: this.context.entities.lastTask?.title || 'none',
      preferences: {
        default_priority: this.context.preferences.defaultPriority,
        default_category: this.context.preferences.defaultCategory
      },
      stats: this.context.stats
    };
  }

  // Task ID Memory Management
  addTaskToMemory(task: any): void {
    if (!task || !task.id || !task.title) return;

    // Initialize if needed
    if (!this.context.entities.taskIdMap) {
      this.context.entities.taskIdMap = {};
    }
    if (!this.context.entities.activeTaskContext) {
      this.context.entities.activeTaskContext = {};
    }

    // Add to explicit mapping
    const titleKey = task.title.toLowerCase().trim();
    this.context.entities.taskIdMap[titleKey] = task.id;

    // Set as lastTask for traditional references
    this.context.entities.lastTask = task;

    // Set as primary active task
    this.context.entities.activeTaskContext.primary = task.id;
    this.context.entities.activeTaskContext.lastDisplayed = [task];
    
    // Mark conversation flow to expect task references
    if (!this.context.entities.conversationFlow) {
      this.context.entities.conversationFlow = {};
    }
    this.context.entities.conversationFlow.expectingTaskRef = true;
    this.context.entities.conversationFlow.implicitTaskId = task.id;
  }

  addMultipleTasksToMemory(tasks: any[]): void {
    if (!Array.isArray(tasks) || tasks.length === 0) return;

    // Initialize if needed
    if (!this.context.entities.taskIdMap) {
      this.context.entities.taskIdMap = {};
    }
    if (!this.context.entities.activeTaskContext) {
      this.context.entities.activeTaskContext = { secondary: [] };
    }

    // Add all tasks to mapping
    tasks.forEach(task => {
      if (task && task.id && task.title) {
        const titleKey = task.title.toLowerCase().trim();
        this.context.entities.taskIdMap![titleKey] = task.id;
      }
    });

    // Set first task as primary, others as secondary
    if (tasks.length === 1) {
      this.context.entities.activeTaskContext.primary = tasks[0].id;
    } else {
      this.context.entities.activeTaskContext.primary = tasks[0].id;
      this.context.entities.activeTaskContext.secondary = tasks.slice(1).map(t => t.id);
    }

    // Store displayed tasks for reference
    this.context.entities.activeTaskContext.lastDisplayed = tasks;

    // Mark conversation flow 
    if (!this.context.entities.conversationFlow) {
      this.context.entities.conversationFlow = {};
    }
    this.context.entities.conversationFlow.expectingTaskRef = true;
    this.context.entities.conversationFlow.implicitTaskId = tasks[0].id;
  }

  getTaskIdMappingForAI(): Record<string, string> {
    return this.context.entities.taskIdMap || {};
  }

  // Reset context (for testing or new session)
  reset(): void {
    this.context = this.initializeContext();
  }
}