#!/usr/bin/env node

import dotenv from 'dotenv';
import { TaskRepository } from './src/database/tasks.js';
import { UserRepository } from './src/database/users.js';

dotenv.config();

async function checkDuplicates() {
  try {
    const taskRepo = new TaskRepository();
    const userRepo = new UserRepository();

    // Get user Test thoi
    const user = await userRepo.getUserByTelegramId(7092322056);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`👤 User: ${user.name} (${user.id})`);

    // Get all tasks for this user
    const tasks = await taskRepo.getTasks({ user_id: user.id });
    
    console.log(`\n📋 Total tasks: ${tasks.length}`);
    
    tasks.forEach((task, index) => {
      console.log(`${index + 1}. ${task.title} (ID: ${task.id.slice(0, 8)}) - Created: ${task.created_at}`);
    });

    // Check for duplicates by title
    const duplicates = tasks.filter(task => 
      tasks.filter(t => t.title === task.title).length > 1
    );

    if (duplicates.length > 0) {
      console.log('\n🚨 Found duplicate tasks:');
      duplicates.forEach(task => {
        console.log(`- ${task.title} (ID: ${task.id.slice(0, 8)})`);
      });
    } else {
      console.log('\n✅ No duplicates found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDuplicates();