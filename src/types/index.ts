export interface User {
  id: string;
  telegram_id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'inactive' | 'active';
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  user_id: string;
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

export interface CreateUserInput {
  telegram_id: number;
  email: string;
  name: string;
  role?: 'user' | 'admin';
  status?: 'inactive' | 'active';
}

export interface UpdateUserInput {
  id?: string;
  telegram_id?: number;
  email?: string;
  name?: string;
  role?: 'user' | 'admin';
  status?: 'inactive' | 'active';
}

export interface CreateTaskInput {
  user_id: string;
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