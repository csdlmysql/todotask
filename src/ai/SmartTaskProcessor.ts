import { GeminiAnalyzer } from './GeminiAnalyzer.js';
import { GeminiExecutor } from './GeminiExecutor.js';
import { ConversationContextManager } from '../context/ConversationContext.js';
import { IntentAnalysis, ExecutionResult } from '../types/context.js';

export interface ProcessingResult {
  success: boolean;
  message: string;
  data?: any;
  analysis?: IntentAnalysis;
  context_summary?: any;
  follow_up_suggestions?: string[];
  needs_clarification?: boolean;
}

export class SmartTaskProcessor {
  private analyzer: GeminiAnalyzer;
  private executor: GeminiExecutor;
  private contextManager: ConversationContextManager;
  private initialized: boolean = false;

  constructor(geminiApiKey: string) {
    this.analyzer = new GeminiAnalyzer(geminiApiKey);
    this.executor = new GeminiExecutor(geminiApiKey);
    this.contextManager = new ConversationContextManager();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Load recent tasks into context for reference resolution
      const { TaskRepository } = await import('../database/tasks.js');
      const taskRepo = new TaskRepository();
      const recentTasks = await taskRepo.getTasks({ limit: 20 }); // Get last 20 tasks
      
      // Populate context with recent tasks
      this.contextManager.updateContext({
        success: true,
        action: 'init',
        message: 'Context initialized',
        context_updates: {
          entities: {
            recentTasks: recentTasks
          }
        }
      });
      
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize context with recent tasks:', error);
      this.initialized = true; // Continue anyway
    }
  }

  async processInput(input: string): Promise<ProcessingResult> {
    // Ensure context is initialized with recent tasks
    await this.initialize();
    
    // Record user message
    this.contextManager.addMessage('user', input);

    try {
      // Phase 1: Analyze intent with context
      console.log('🧠 Phase 1: Analyzing intent...');
      const analysis = await this.analyzer.analyzeIntent(input, this.contextManager);
      
      console.log('📊 Analysis result:', {
        action: analysis.primary_action,
        confidence: analysis.confidence,
        entities: analysis.entities,
        context_usage: analysis.context_usage
      });

      // Handle multi-intent operations
      if (analysis.operations && analysis.operations.length > 1) {
        return await this.handleMultiIntentOperations(analysis);
      }

      // Phase 2: Execute with instructions
      console.log('⚙️  Phase 2: Executing instructions...');
      const executionResult = await this.executor.executeInstructions(analysis, this.contextManager);

      // Phase 3: Update context and learn
      this.contextManager.updateContext(executionResult);
      
      // Learn from successful operations
      if (executionResult.success && executionResult.data) {
        this.learnFromOperation(analysis, executionResult);
      }

      // Record bot response with rich context
      this.contextManager.addMessage('bot', executionResult.message, {
        action: executionResult.action,
        success: executionResult.success,
        data: executionResult.data, // Include task data for reference
        displayedTasks: Array.isArray(executionResult.data) ? executionResult.data : 
                       executionResult.data ? [executionResult.data] : []
      });

      // Generate smart follow-up suggestions
      const suggestions = this.generateSmartSuggestions(analysis, executionResult);

      return {
        success: executionResult.success,
        message: executionResult.message,
        data: executionResult.data,
        analysis,
        context_summary: this.contextManager.getContextSummary(),
        follow_up_suggestions: suggestions,
        needs_clarification: analysis.confidence < 0.7
      };

    } catch (error) {
      const errorMessage = `❌ Processing Error: ${error instanceof Error ? error.message : String(error)}`;
      
      this.contextManager.addMessage('bot', errorMessage, {
        action: 'error',
        success: false
      });

      return {
        success: false,
        message: errorMessage,
        context_summary: this.contextManager.getContextSummary(),
        needs_clarification: true
      };
    }
  }

  private async handleMultiIntentOperations(analysis: IntentAnalysis): Promise<ProcessingResult> {
    const results: ExecutionResult[] = [];
    let allSuccessful = true;

    if (!analysis.operations) {
      return {
        success: false,
        message: 'Error processing multi-intent operations'
      };
    }

    console.log(`🔄 Processing ${analysis.operations.length} operations...`);

    // Execute operations in order
    for (const operation of analysis.operations.sort((a, b) => a.order - b.order)) {
      try {
        const operationAnalysis: IntentAnalysis = {
          primary_action: operation.action as any,
          entities: operation.entities,
          context_usage: analysis.context_usage,
          confidence: analysis.confidence,
          instructions: `Execute ${operation.action} with entities: ${JSON.stringify(operation.entities)}`
        };

        const result = await this.executor.executeInstructions(operationAnalysis, this.contextManager);
        results.push(result);

        if (!result.success) {
          allSuccessful = false;
          break; // Stop on first failure
        }

        // Update context after each successful operation
        this.contextManager.updateContext(result);

      } catch (error) {
        allSuccessful = false;
        results.push({
          success: false,
          action: operation.action,
          message: `Error executing ${operation.action}: ${error}`
        });
        break;
      }
    }

    // Generate summary message
    const successCount = results.filter(r => r.success).length;
    let message = '';

    if (allSuccessful) {
      message = `✅ Successfully executed ${successCount} operations!`;
    } else {
      message = `⚠️ Executed ${successCount}/${results.length} operations.`;
    }

    // Combine all result data
    const combinedData = results
      .filter(r => r.success && r.data)
      .map(r => r.data);

    return {
      success: allSuccessful,
      message,
      data: combinedData,
      analysis,
      context_summary: this.contextManager.getContextSummary(),
      follow_up_suggestions: allSuccessful ? [
        'View operation results',
        'Continue with other operations',
        'View task list'
      ] : [
        'Retry failed operation',
        'View error details',
        'Execute one step at a time'
      ]
    };
  }

  private learnFromOperation(analysis: IntentAnalysis, result: ExecutionResult): void {
    if (result.success && result.data) {
      // Learn from task operations
      if (analysis.primary_action === 'create' && result.data.title) {
        this.contextManager.learnFromTaskOperation(result.data, 'create');
      } else if (analysis.primary_action === 'update' && analysis.entities.status === 'completed') {
        this.contextManager.learnFromTaskOperation(result.data, 'complete');
      }
    }
  }

  private generateSmartSuggestions(analysis: IntentAnalysis, result: ExecutionResult): string[] {
    const suggestions: string[] = [];

    // Use result's suggestions if available
    if (result.follow_up_suggestions?.length) {
      suggestions.push(...result.follow_up_suggestions);
    }

    // Add context-aware suggestions
    if (analysis.primary_action === 'create' && result.success) {
      suggestions.push('Create related task');
      suggestions.push('Set reminder for this task');
    } else if (analysis.primary_action === 'read') {
      suggestions.push('Filter results more');
      suggestions.push('Update some task');
    } else if (analysis.primary_action === 'update') {
      suggestions.push('View updated task');
      suggestions.push('Update other task');
    }

    // Add time-based suggestions
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 11) { // Morning
      suggestions.push('Plan for the day');
    } else if (hour >= 17 && hour <= 19) { // Evening
      suggestions.push('Review today\'s progress');
    }

    // Remove duplicates and limit
    return [...new Set(suggestions)].slice(0, 3);
  }

  // Handle conversational flows
  async handleConversationalFlow(input: string): Promise<ProcessingResult> {
    // Ensure context is initialized with recent tasks
    await this.initialize();
    
    const isFlowActive = this.contextManager.isFlowActive();
    
    if (isFlowActive) {
      // Continue existing flow
      return await this.continueFlow(input);
    } else {
      // Normal processing
      return await this.processInput(input);
    }
  }

  private async continueFlow(input: string): Promise<ProcessingResult> {
    // This would handle step-by-step task creation, updates, etc.
    // For now, just process normally
    return await this.processInput(input);
  }

  // Context management methods
  getContextSummary(): any {
    return this.contextManager.getContextSummary();
  }

  resetContext(): void {
    this.contextManager.reset();
  }

  // Handle special commands
  async handleSpecialCommand(command: string): Promise<ProcessingResult> {
    const { TaskRepository } = await import('../database/tasks.js');
    const taskRepo = new TaskRepository();

    switch (command.toLowerCase()) {
      case 'context':
      case 'debug':
        return {
          success: true,
          message: '🔍 Context Debug Info',
          data: this.contextManager.getContextSummary()
        };

      case 'reset':
        this.resetContext();
        return {
          success: true,
          message: '🔄 Context has been reset'
        };

      case 'stats':
        try {
          const stats = await taskRepo.getTaskStats();
          const totalTasks = stats.total || 0;
          const completed = stats.completed || 0;
          const pending = stats.pending || 0;
          const inProgress = stats.in_progress || 0;
          const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

          return {
            success: true,
            message: `📊 Task Statistics`,
            data: {
              summary: `📈 Total: ${totalTasks} | ✅ Completed: ${completed} | ⏳ Pending: ${pending} | 🔄 In Progress: ${inProgress}`,
              completion_rate: `🎯 Completion Rate: ${completionRate}%`,
              breakdown: stats
            }
          };
        } catch (error) {
          return { success: false, message: `❌ Error getting statistics: ${error}` };
        }

      case 'list':
        return await this.processInput('view all tasks');

      case 'recent':
        try {
          const recentTasks = await taskRepo.getTasks({ limit: 10 });
          return {
            success: true,
            message: '🕐 10 Most Recent Tasks',
            data: recentTasks,
            follow_up_suggestions: ['View task details', 'Filter by status', 'Create new task']
          };
        } catch (error) {
          return { success: false, message: `❌ Error getting recent tasks: ${error}` };
        }

      case 'search':
        return {
          success: true,
          message: '🔍 Search Mode - Enter keywords to find tasks:',
          follow_up_suggestions: ['Search by title', 'Search by description', 'Search by tag']
        };

      case 'export':
        try {
          const allTasks = await taskRepo.getTasks();
          const exportData = {
            export_time: new Date().toISOString(),
            total_tasks: allTasks.length,
            tasks: allTasks.map(task => ({
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              created_at: task.created_at,
              updated_at: task.updated_at,
              due_date: task.due_date
            }))
          };
          
          const fs = await import('fs/promises');
          const exportFile = `task-export-${new Date().toISOString().split('T')[0]}.json`;
          await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));

          return {
            success: true,
            message: `📤 Exported ${allTasks.length} tasks to ${exportFile}`,
            data: { file: exportFile, count: allTasks.length }
          };
        } catch (error) {
          return { success: false, message: `❌ Export error: ${error}` };
        }

      case 'backup':
        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const backupDir = 'backups';
          
          try {
            await fs.access(backupDir);
          } catch {
            await fs.mkdir(backupDir);
          }

          const allTasks = await taskRepo.getTasks();
          const backupData = {
            backup_time: new Date().toISOString(),
            version: '1.0',
            context: this.contextManager.getContextSummary(),
            tasks: allTasks
          };

          const backupFile = path.join(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
          await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));

          return {
            success: true,
            message: `💾 Backup successful! File: ${backupFile}`,
            data: { file: backupFile, tasks_count: allTasks.length }
          };
        } catch (error) {
          return { success: false, message: `❌ Backup error: ${error}` };
        }

      case 'config':
        const contextSummary = this.contextManager.getContextSummary();
        return {
          success: true,
          message: '⚙️  Smart Task-Killer Configuration',
          data: {
            preferences: contextSummary.preferences,
            session_info: {
              messages_count: contextSummary.messages_count,
              current_flow: contextSummary.current_flow
            },
            env_check: {
              gemini_api: process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing',
              database: process.env.DATABASE_URL ? '✅ Connected' : '❌ Missing',
              telegram: process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing'
            }
          }
        };

      case 'clear':
        // Clear console
        console.clear();
        return {
          success: true,
          message: '🧹 Console cleared! Smart Task-Killer ready.',
          follow_up_suggestions: ['View task list', 'Create new task', '/help']
        };

      case 'help':
        return {
          success: true,
          message: `
🤖 Smart Task-Killer Commands

**📋 Task Management:**
• /list - View all tasks
• /recent - 10 most recent tasks 
• /search - Search tasks

**📊 Analytics & Data:**
• /stats - Detailed statistics
• /export - Export tasks to JSON file
• /backup - Create full backup

**🔧 System & Config:**
• /config - View system configuration
• /context - Debug context info
• /reset - Reset conversation context
• /clear - Clear console screen

**💬 Natural Language:**
• "create task fix bug urgent deadline tomorrow"
• "view pending tasks"
• "mark that task as completed"
• "delete task test"

**🧠 Smart Features:**
• Context Memory: Remembers recently created/viewed tasks
• Text Search: Find by name, no UUID needed
• Multi-operations: "create 3 tasks: A urgent, B medium, C low"
• Natural Language Processing
          `,
          follow_up_suggestions: [
            'Try /recent to view tasks',
            'Create first task',
            '/stats to view statistics'
          ]
        };

      default:
        return await this.processInput(command);
    }
  }
}