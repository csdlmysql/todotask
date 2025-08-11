#!/usr/bin/env node

import dotenv from 'dotenv';
import { TaskRepository } from './src/database/tasks.js';
import { UserRepository } from './src/database/users.js';

dotenv.config();

async function cleanupDuplicates() {
  try {
    const taskRepo = new TaskRepository();
    const userRepo = new UserRepository();

    // Get user Test thoi
    const user = await userRepo.getUserByTelegramId(7092322056);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`👤 Cleaning duplicates for user: ${user.name}`);

    // Get all tasks for this user
    const tasks = await taskRepo.getTasks({ user_id: user.id });
    
    // Group tasks by title
    const tasksByTitle = tasks.reduce((acc, task) => {
      if (!acc[task.title]) {
        acc[task.title] = [];
      }
      acc[task.title].push(task);
      return acc;
    }, {} as Record<string, any[]>);

    // Keep only the earliest task for each title, delete the rest
    let deletedCount = 0;
    for (const [title, duplicateTasks] of Object.entries(tasksByTitle)) {
      if (duplicateTasks.length > 1) {
        console.log(`🚨 Found ${duplicateTasks.length} duplicates for: ${title}`);
        
        // Sort by created_at (earliest first)
        duplicateTasks.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        // Keep the first (earliest), delete the rest
        for (let i = 1; i < duplicateTasks.length; i++) {
          const taskToDelete = duplicateTasks[i];
          await taskRepo.deleteTask(taskToDelete.id);
          console.log(`❌ Deleted duplicate: ${taskToDelete.id.slice(0, 8)}`);
          deletedCount++;
        }
      }
    }

    console.log(`\n✅ Cleanup completed! Deleted ${deletedCount} duplicate tasks.`);

    // Show remaining tasks
    const remainingTasks = await taskRepo.getTasks({ user_id: user.id });
    console.log(`📋 Remaining tasks: ${remainingTasks.length}`);
    remainingTasks.forEach((task, index) => {
      console.log(`${index + 1}. ${task.title} (ID: ${task.id.slice(0, 8)})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

cleanupDuplicates();