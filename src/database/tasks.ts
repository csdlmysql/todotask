import { DatabaseConnection } from './connection.js';
import { Task, CreateTaskInput, UpdateTaskInput } from '../types/index.js';

export class TaskRepository {
  private db: DatabaseConnection;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    this.db = DatabaseConnection.getInstance({ url: databaseUrl });
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    // Auto set default deadline to 1 day if not specified
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 1);
    
    const dueDate = input.due_date || input.deadline || defaultDeadline;
    
    const query = `
      INSERT INTO tasks (title, description, priority, due_date, category, tags)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      input.title,
      input.description || null,
      input.priority || 'medium',
      dueDate,
      input.category || null,
      input.tags || []
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getTasks(filters?: {
    status?: string;
    priority?: string;
    category?: string;
    limit?: number;
  }): Promise<Task[]> {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    if (filters?.status) {
      query += ` AND status = $${++paramCount}`;
      values.push(filters.status);
    }

    if (filters?.priority) {
      query += ` AND priority = $${++paramCount}`;
      values.push(filters.priority);
    }

    if (filters?.category) {
      query += ` AND category = $${++paramCount}`;
      values.push(filters.category);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ` LIMIT $${++paramCount}`;
      values.push(filters.limit);
    }

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async getTaskById(id: string): Promise<Task | null> {
    const query = 'SELECT * FROM tasks WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async updateTask(input: UpdateTaskInput): Promise<Task | null> {
    const task = await this.getTaskById(input.id);
    if (!task) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (input.title !== undefined) {
      updates.push(`title = $${++paramCount}`);
      values.push(input.title);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${++paramCount}`);
      values.push(input.description);
    }

    if (input.status !== undefined) {
      updates.push(`status = $${++paramCount}`);
      values.push(input.status);
    }

    if (input.priority !== undefined) {
      updates.push(`priority = $${++paramCount}`);
      values.push(input.priority);
    }

    if (input.due_date !== undefined) {
      updates.push(`due_date = $${++paramCount}`);
      values.push(input.due_date);
    }

    if (input.category !== undefined) {
      updates.push(`category = $${++paramCount}`);
      values.push(input.category);
    }

    if (input.tags !== undefined) {
      updates.push(`tags = $${++paramCount}`);
      values.push(input.tags);
    }

    if (updates.length === 0) {
      return task;
    }

    const query = `
      UPDATE tasks 
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `;
    values.push(input.id);

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async deleteTask(id: string): Promise<boolean> {
    const query = 'DELETE FROM tasks WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async getTaskStats(period?: string): Promise<any> {
    let query = `
      SELECT 
        status,
        priority,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as month
      FROM tasks
    `;

    if (period === 'today') {
      query += ' WHERE created_at >= CURRENT_DATE';
    } else if (period === 'week') {
      query += ' WHERE created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      query += ' WHERE created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    query += ' GROUP BY status, priority ORDER BY status, priority';

    const result = await this.db.query(query);
    return result.rows;
  }

  async searchTasks(searchTerm: string): Promise<Task[]> {
    const query = `
      SELECT * FROM tasks 
      WHERE title ILIKE $1 
         OR description ILIKE $1 
         OR $2 = ANY(tags)
         OR category ILIKE $1
      ORDER BY created_at DESC
    `;
    
    const searchPattern = `%${searchTerm}%`;
    const result = await this.db.query(query, [searchPattern, searchTerm]);
    return result.rows;
  }
}