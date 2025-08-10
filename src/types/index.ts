export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: Date;
  updated_at: Date;
  due_date?: Date;
  deadline?: Date; // Alias for due_date, more user-friendly
  tags?: string[];
  category?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: Date;
  deadline?: Date; // Alias for due_date
  tags?: string[];
  category?: string;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: Date;
  tags?: string[];
  category?: string;
}

export interface GeminiFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface TelegramConfig {
  token: string;
  chatId: string;
}

export interface DatabaseConfig {
  url: string;
}