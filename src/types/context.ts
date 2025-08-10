export interface Message {
  id: string;
  timestamp: Date;
  type: 'user' | 'bot';
  content: string;
  metadata?: {
    action?: string;
    entities?: any;
    function_call?: any;
    success?: boolean;
    data?: any;
    displayedTasks?: any[];
  };
}

export interface UserPreferences {
  defaultCategory?: string;
  defaultPriority: 'low' | 'medium' | 'high' | 'urgent';
  workingHours: {
    start: string; // "09:00"
    end: string;   // "18:00"
  };
  timezone: string;
  language: 'vi' | 'en';
  notificationSettings: {
    desktop: boolean;
    telegram: boolean;
    beforeDeadline: number; // hours
  };
}

export interface SessionFlow {
  type: 'creating' | 'updating' | 'bulk_operation' | 'planning' | 'searching';
  step: number;
  totalSteps?: number;
  data: any;
  startedAt: Date;
  timeout?: Date; // Auto-cancel flow after timeout
}

export interface TemporaryEntities {
  lastTask?: any;           // Reference to "task đó", "task vừa tạo"
  lastList?: any[];         // Reference to "danh sách vừa xem" 
  recentTasks?: any[];      // For "task gần đây"
  contextTasks?: any[];     // Tasks mentioned in conversation
  pendingAction?: {         // Action waiting for confirmation
    type: string;
    data: any;
  };
  
  // Explicit Task ID Memory System
  taskIdMap?: Record<string, string>;        // "fix bug mangov3" -> full-uuid
  activeTaskContext?: {                      // Currently discussed tasks
    primary?: string;       // Main task ID being discussed
    secondary?: string[];   // Other mentioned task IDs
    lastDisplayed?: any[];  // Tasks just displayed to user
  };
  conversationFlow?: {      // Context flow tracking
    expectingTaskRef?: boolean;  // Next input likely refers to task
    implicitTaskId?: string;     // Implied task from conversation
  };
  
  // Helper for task memory updates
  shouldAddToMemory?: {
    type: 'single' | 'multiple';
    task?: any;
    tasks?: any[];
  };
}

export interface ConversationContext {
  // Message history
  history: Message[];
  maxHistoryLength: number;

  // Current session
  sessionId: string;
  startTime: Date;
  
  // User preferences (learned over time)
  preferences: UserPreferences;
  
  // Current workflow state
  currentFlow?: SessionFlow;
  
  // Temporary references for context resolution
  entities: TemporaryEntities;
  
  // Statistics for learning
  stats: {
    totalTasks: number;
    completedTasks: number;
    commonCategories: string[];
    commonPriorities: Record<string, number>;
    averageTaskDuration: number; // days
    peakProductivityHours: number[];
  };

  // Recent actions for undo/redo
  actionHistory: Array<{
    action: string;
    timestamp: Date;
    data: any;
    reversible: boolean;
  }>;
}

export interface IntentAnalysis {
  primary_action: 'create' | 'read' | 'update' | 'delete' | 'search' | 'analyze' | 'plan' | 'help';
  secondary_actions?: string[];
  
  entities: {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    category?: string;
    tags?: string[];
    deadline?: string; // ISO date or relative like "tomorrow"
    task_references?: string[]; // IDs or descriptions of referenced tasks
    task_id?: string; // Resolved task ID for updates/deletes
  };

  context_usage: {
    references_previous: boolean;
    continues_flow: boolean;
    needs_clarification: boolean;
    ambiguous_references: string[];
  };

  confidence: number; // 0-1
  instructions: string; // Detailed execution instructions
  clarification_needed?: string; // What to ask user if confidence is low

  // For multi-intent handling
  operations?: Array<{
    action: string;
    entities: any;
    order: number;
  }>;
}

export interface ExecutionResult {
  success: boolean;
  action: string;
  data?: any;
  message: string;
  context_updates?: {
    entities?: Partial<TemporaryEntities>;
    preferences?: Partial<UserPreferences>;
    flow?: SessionFlow;
  };
  follow_up_suggestions?: string[];
  needs_clarification?: boolean;
}