import { DatabaseConnection } from './connection.js';
import { User, CreateUserInput, UpdateUserInput } from '../types/index.js';

export class UserRepository {
  private db: DatabaseConnection;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    this.db = DatabaseConnection.getInstance({ url: databaseUrl });
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const query = `
      INSERT INTO users (telegram_id, email, name, role, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      input.telegram_id,
      input.email,
      input.name,
      input.role || 'user',
      input.status || 'inactive'
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getUserById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await this.db.query(query, [telegramId]);
    return result.rows[0] || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.db.query(query, [email]);
    return result.rows[0] || null;
  }

  async getAllUsers(filters?: {
    status?: 'inactive' | 'active';
    role?: 'user' | 'admin';
    limit?: number;
  }): Promise<User[]> {
    let query = 'SELECT * FROM users WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    if (filters?.status) {
      query += ` AND status = $${++paramCount}`;
      values.push(filters.status);
    }

    if (filters?.role) {
      query += ` AND role = $${++paramCount}`;
      values.push(filters.role);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      // Ensure limit is positive
      const safeLimit = Math.max(1, Math.abs(filters.limit));
      query += ` LIMIT $${++paramCount}`;
      values.push(safeLimit);
    }

    const result = await this.db.query(query, values);
    return result.rows;
  }

  async updateUser(input: UpdateUserInput): Promise<User | null> {
    if (!input.id && !input.telegram_id) {
      throw new Error('Either id or telegram_id must be provided');
    }

    // Get user by id or telegram_id
    let user: User | null = null;
    if (input.id) {
      user = await this.getUserById(input.id);
    } else if (input.telegram_id) {
      user = await this.getUserByTelegramId(input.telegram_id);
    }

    if (!user) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (input.email !== undefined) {
      updates.push(`email = $${++paramCount}`);
      values.push(input.email);
    }

    if (input.name !== undefined) {
      updates.push(`name = $${++paramCount}`);
      values.push(input.name);
    }

    if (input.role !== undefined) {
      updates.push(`role = $${++paramCount}`);
      values.push(input.role);
    }

    if (input.status !== undefined) {
      updates.push(`status = $${++paramCount}`);
      values.push(input.status);
    }

    if (updates.length === 0) {
      return user;
    }

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `;
    values.push(user.id);

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async activateUser(id: string): Promise<User | null> {
    return this.updateUser({ id, status: 'active' });
  }

  async deactivateUser(id: string): Promise<User | null> {
    return this.updateUser({ id, status: 'inactive' });
  }

  async isUserActive(telegramId: number): Promise<boolean> {
    const user = await this.getUserByTelegramId(telegramId);
    return user?.status === 'active';
  }

  async isUserAdmin(telegramId: number): Promise<boolean> {
    const user = await this.getUserByTelegramId(telegramId);
    return user?.role === 'admin' && user?.status === 'active';
  }

  async getUserStats(): Promise<any> {
    const query = `
      SELECT 
        status,
        role,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as month
      FROM users
      GROUP BY status, role
      ORDER BY status, role
    `;
    
    const result = await this.db.query(query);
    return result.rows;
  }

  async emailExists(email: string): Promise<boolean> {
    const query = 'SELECT 1 FROM users WHERE email = $1';
    const result = await this.db.query(query, [email]);
    return result.rows.length > 0;
  }

  async telegramIdExists(telegramId: number): Promise<boolean> {
    const query = 'SELECT 1 FROM users WHERE telegram_id = $1';
    const result = await this.db.query(query, [telegramId]);
    return result.rows.length > 0;
  }

  async getUsersWithoutActivityToday(): Promise<User[]> {
    const query = `
      SELECT u.* 
      FROM users u
      WHERE u.status = 'active'
      AND u.role = 'user'
      AND NOT EXISTS (
        SELECT 1 FROM tasks t 
        WHERE t.user_id = u.id 
        AND (DATE(t.created_at) = CURRENT_DATE OR DATE(t.updated_at) = CURRENT_DATE)
      )
      ORDER BY u.name
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  async getUserLastActivity(userId: string): Promise<Date | null> {
    const query = `
      SELECT MAX(GREATEST(created_at, updated_at)) as last_activity
      FROM tasks 
      WHERE user_id = $1
    `;
    const result = await this.db.query(query, [userId]);
    return result.rows[0]?.last_activity || null;
  }

  async getAllAdmins(): Promise<User[]> {
    const query = `
      SELECT * FROM users 
      WHERE role = 'admin' 
      AND status = 'active'
      ORDER BY name
    `;
    const result = await this.db.query(query);
    return result.rows;
  }
}