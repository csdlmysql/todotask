#!/usr/bin/env node

import { DatabaseConnection } from './connection.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseMigrator {
  private db: DatabaseConnection;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    this.db = DatabaseConnection.getInstance({ url: databaseUrl });
  }

  async migrate() {
    try {
      console.log('🚀 Starting database migration...');

      // Check if migration is needed
      const needsMigration = await this.checkIfMigrationNeeded();
      
      if (!needsMigration) {
        console.log('✅ Database is already up to date!');
        return;
      }

      console.log('📊 Migration needed. Starting...');

      // Step 1: Backup existing tasks if any
      const existingTasks = await this.backupExistingTasks();
      console.log(`📋 Found ${existingTasks.length} existing tasks to migrate`);

      // Step 2: Create users table and update schema
      await this.createUsersTable();
      console.log('👥 Users table created successfully');

      // Step 3: Create default admin user
      const adminUser = await this.createDefaultAdmin();
      console.log(`👑 Default admin user created: ${adminUser.name} (${adminUser.email})`);

      // Step 4: Add user_id column to tasks table and update constraints
      await this.updateTasksTable();
      console.log('📋 Tasks table updated with user association');

      // Step 5: Migrate existing tasks to admin user
      if (existingTasks.length > 0) {
        await this.migrateExistingTasks(existingTasks, adminUser.id);
        console.log(`📦 Migrated ${existingTasks.length} existing tasks to admin user`);
      }

      // Step 6: Create indexes and views
      await this.createIndexesAndViews();
      console.log('📊 Database indexes and views updated');

      console.log('✅ Database migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('1. Use Telegram bot /register command to register users');
      console.log('2. Admin can activate users with /activate command');
      console.log('3. Users will see only their own tasks');
      console.log(`\n👑 Admin credentials:`);
      console.log(`   Name: ${adminUser.name}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Telegram ID: ${adminUser.telegram_id}`);
      console.log(`   Status: ${adminUser.status}`);
      console.log(`   Role: ${adminUser.role}`);

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private async checkIfMigrationNeeded(): Promise<boolean> {
    try {
      // Check if users table exists
      const result = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);
      
      const usersTableExists = result.rows[0].exists;
      
      if (!usersTableExists) {
        return true; // Migration needed
      }

      // Check if tasks table has user_id column
      const taskResult = await this.db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'user_id';
      `);
      
      return taskResult.rows.length === 0; // Migration needed if user_id column doesn't exist
      
    } catch (error) {
      console.log('🔍 Could not check migration status, assuming migration needed');
      return true;
    }
  }

  private async backupExistingTasks(): Promise<any[]> {
    try {
      const result = await this.db.query('SELECT * FROM tasks ORDER BY created_at');
      return result.rows;
    } catch (error) {
      console.log('📋 No existing tasks table found or accessible');
      return [];
    }
  }

  private async createUsersTable(): Promise<void> {
    const createUsersSQL = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        telegram_id BIGINT UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('inactive', 'active')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    await this.db.query(createUsersSQL);
  }

  private async createDefaultAdmin(): Promise<any> {
    // Generate a default admin user
    const adminTelegramId = parseInt(process.env.TELEGRAM_CHAT_ID || '0');
    
    if (adminTelegramId === 0) {
      throw new Error('TELEGRAM_CHAT_ID must be set in environment variables for admin user creation');
    }

    // Check if admin already exists
    const existingAdmin = await this.db.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [adminTelegramId]
    );

    if (existingAdmin.rows.length > 0) {
      return existingAdmin.rows[0];
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@taskkiller.local';
    const adminName = process.env.ADMIN_NAME || 'TaskKiller Admin';

    const result = await this.db.query(`
      INSERT INTO users (telegram_id, email, name, role, status)
      VALUES ($1, $2, $3, 'admin', 'active')
      RETURNING *
    `, [adminTelegramId, adminEmail, adminName]);

    return result.rows[0];
  }

  private async updateTasksTable(): Promise<void> {
    try {
      // Check if user_id column already exists
      const columnCheck = await this.db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'user_id';
      `);

      if (columnCheck.rows.length === 0) {
        // Add user_id column
        await this.db.query(`
          ALTER TABLE tasks 
          ADD COLUMN user_id UUID;
        `);
        
        console.log('📋 Added user_id column to tasks table');
      }

      // After migrating existing tasks, make user_id NOT NULL and add foreign key
      
    } catch (error) {
      console.log('⚠️  Tasks table update warning:', error);
    }
  }

  private async migrateExistingTasks(tasks: any[], adminUserId: string): Promise<void> {
    if (tasks.length === 0) return;

    // Update all existing tasks to belong to admin user
    await this.db.query(`
      UPDATE tasks 
      SET user_id = $1 
      WHERE user_id IS NULL
    `, [adminUserId]);

    console.log(`📦 Assigned ${tasks.length} existing tasks to admin user`);
  }

  private async createIndexesAndViews(): Promise<void> {
    // Add constraints and indexes after migration
    try {
      // Make user_id NOT NULL and add foreign key constraint
      await this.db.query(`
        ALTER TABLE tasks 
        ALTER COLUMN user_id SET NOT NULL;
      `);

      await this.db.query(`
        ALTER TABLE tasks 
        ADD CONSTRAINT fk_tasks_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      `);

      console.log('🔗 Added foreign key constraints');
    } catch (error) {
      console.log('⚠️  Constraint creation warning:', error);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',
      'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);',
      'CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);'
    ];

    for (const indexSQL of indexes) {
      try {
        await this.db.query(indexSQL);
      } catch (error) {
        console.log('⚠️  Index creation warning:', indexSQL, error);
      }
    }

    // Create triggers for updated_at
    const triggerSQL = `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at 
          BEFORE UPDATE ON users 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
      CREATE TRIGGER update_tasks_updated_at 
          BEFORE UPDATE ON tasks 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column();
    `;

    try {
      await this.db.query(triggerSQL);
      console.log('🔧 Created database triggers');
    } catch (error) {
      console.log('⚠️  Trigger creation warning:', error);
    }

    // Update task_stats view
    const viewSQL = `
      CREATE OR REPLACE VIEW task_stats AS
      SELECT 
          t.status,
          t.priority,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE t.created_at >= CURRENT_DATE) as today_count,
          COUNT(*) FILTER (WHERE t.created_at >= CURRENT_DATE - INTERVAL '7 days') as week_count,
          COUNT(*) FILTER (WHERE t.created_at >= CURRENT_DATE - INTERVAL '30 days') as month_count,
          COUNT(DISTINCT t.user_id) as unique_users
      FROM tasks t
      JOIN users u ON t.user_id = u.id
      WHERE u.status = 'active'
      GROUP BY t.status, t.priority;
    `;

    try {
      await this.db.query(viewSQL);
      console.log('📊 Updated task_stats view');
    } catch (error) {
      console.log('⚠️  View creation warning:', error);
    }
  }

  async rollback() {
    console.log('🔄 Rolling back migration...');
    
    try {
      // Remove user_id column from tasks
      await this.db.query('ALTER TABLE tasks DROP COLUMN IF EXISTS user_id;');
      
      // Drop users table
      await this.db.query('DROP TABLE IF EXISTS users CASCADE;');
      
      // Restore original task_stats view
      const originalViewSQL = `
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
      `;
      
      await this.db.query(originalViewSQL);
      
      console.log('✅ Rollback completed successfully');
      
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
}

// Run migration if called directly
async function main() {
  const migrator = new DatabaseMigrator();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--rollback')) {
    await migrator.rollback();
  } else {
    await migrator.migrate();
  }
}

// Export for programmatic use
export { DatabaseMigrator };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });
}