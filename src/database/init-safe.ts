import { DatabaseConnection } from './connection.js';

export async function initDatabaseSafe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const db = DatabaseConnection.getInstance({ url: databaseUrl });

  try {
    // Chỉ tạo tables và functions cần thiết, skip conflicts
    await db.query(`
      -- Create extension if not exists
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Create tasks table if not exists
      CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
          priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
          category VARCHAR(100),
          tags TEXT[], -- Array of tags
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          due_date TIMESTAMP WITH TIME ZONE
      );
    `);

    // Create indexes if not exists
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING GIN(tags);
    `);

    // Create or replace function
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Drop and recreate trigger để tránh conflict
    await db.query(`
      DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
      
      CREATE TRIGGER update_tasks_updated_at 
          BEFORE UPDATE ON tasks 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create or replace view
    await db.query(`
      CREATE OR REPLACE VIEW task_stats AS
      SELECT 
          status,
          priority,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_count,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_count,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as month_count
      FROM tasks
      GROUP BY status, priority;
    `);

    console.log('Database initialized successfully (safe mode)');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}