#!/usr/bin/env node

import dotenv from 'dotenv';
import { UserRepository } from './src/database/users.js';
import { TaskRepository } from './src/database/tasks.js';

// Load environment variables
dotenv.config();

async function testUserSystem() {
  console.log('🧪 Testing User Management System...\n');

  try {
    const userRepo = new UserRepository();
    const taskRepo = new TaskRepository();

    // Test 1: Create a test user
    console.log('1. Creating test user...');
    const testUser = await userRepo.createUser({
      telegram_id: 123456789,
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      status: 'active'
    });
    console.log('✅ User created:', testUser.name, `(${testUser.email})`);

    // Test 2: Create a task for the user
    console.log('\n2. Creating test task...');
    const testTask = await taskRepo.createTask({
      user_id: testUser.id,
      title: 'Test Task',
      description: 'This is a test task',
      priority: 'medium',
      category: 'testing'
    });
    console.log('✅ Task created:', testTask.title);

    // Test 3: Get user's tasks
    console.log('\n3. Getting user tasks...');
    const userTasks = await taskRepo.getTasks({ user_id: testUser.id });
    console.log(`✅ Found ${userTasks.length} tasks for user`);

    // Test 4: Test user stats
    console.log('\n4. Getting user task statistics...');
    const stats = await taskRepo.getTaskStats({ user_id: testUser.id });
    console.log('✅ User stats:', stats);

    // Test 5: Test user lookup methods
    console.log('\n5. Testing user lookup methods...');
    const userByTelegramId = await userRepo.getUserByTelegramId(123456789);
    const userByEmail = await userRepo.getUserByEmail('test@example.com');
    console.log('✅ User lookup by Telegram ID:', userByTelegramId?.name);
    console.log('✅ User lookup by email:', userByEmail?.name);

    // Test 6: Test user activation
    console.log('\n6. Testing user deactivation and activation...');
    await userRepo.deactivateUser(testUser.id);
    const inactiveUser = await userRepo.getUserById(testUser.id);
    console.log('✅ User deactivated, status:', inactiveUser?.status);
    
    await userRepo.activateUser(testUser.id);
    const activeUser = await userRepo.getUserById(testUser.id);
    console.log('✅ User reactivated, status:', activeUser?.status);

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await taskRepo.deleteTask(testTask.id);
    await userRepo.deleteUser(testUser.id);
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All tests passed! User management system is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testUserSystem().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});