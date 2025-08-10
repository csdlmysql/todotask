import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiFunction } from '../types/index.js';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      tools: [{ functionDeclarations: this.getFunctionDeclarations() as any }]
    });
  }

  private getFunctionDeclarations(): GeminiFunction[] {
    return [
      {
        name: 'create_task',
        description: 'Create a new task',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'The title of the task'
            },
            description: {
              type: 'string',
              description: 'Detailed description of the task'
            },
            priority: {
              type: 'string',
              description: 'Priority level of the task',
              enum: ['low', 'medium', 'high', 'urgent']
            },
            due_date: {
              type: 'string',
              description: 'Due date in ISO format (YYYY-MM-DD)'
            },
            category: {
              type: 'string',
              description: 'Category or project the task belongs to'
            },
            tags: {
              type: 'string',
              description: 'Comma-separated tags for the task'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'list_tasks',
        description: 'List tasks with optional filtering',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by status',
              enum: ['pending', 'in_progress', 'completed', 'cancelled']
            },
            priority: {
              type: 'string',
              description: 'Filter by priority',
              enum: ['low', 'medium', 'high', 'urgent']
            },
            category: {
              type: 'string',
              description: 'Filter by category'
            },
            limit: {
              type: 'string',
              description: 'Maximum number of tasks to return'
            }
          },
          required: []
        }
      },
      {
        name: 'update_task',
        description: 'Update an existing task',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to update'
            },
            title: {
              type: 'string',
              description: 'New title for the task'
            },
            description: {
              type: 'string',
              description: 'New description for the task'
            },
            status: {
              type: 'string',
              description: 'New status for the task',
              enum: ['pending', 'in_progress', 'completed', 'cancelled']
            },
            priority: {
              type: 'string',
              description: 'New priority for the task',
              enum: ['low', 'medium', 'high', 'urgent']
            }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_task',
        description: 'Delete a task',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to delete'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_task_stats',
        description: 'Get statistics about tasks',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              description: 'Time period for stats',
              enum: ['today', 'week', 'month', 'all']
            }
          },
          required: []
        }
      }
    ];
  }

  async processNaturalLanguage(input: string): Promise<any> {
    const prompt = `
You are a helpful task management assistant. Analyze the user's natural language input and determine what action they want to perform.

Current context: The user is using a task management CLI tool called Task-Killer.

User input: "${input}"

Please analyze this input and call the appropriate function to help the user. If the user wants to:
- Create a task: Use create_task function
- List/show/view tasks: Use list_tasks function  
- Update/modify/change a task: Use update_task function
- Delete/remove a task: Use delete_task function
- Get statistics: Use get_task_stats function

Extract relevant information from the natural language and map it to the function parameters.
For dates, convert relative dates like "tomorrow", "next week" to actual dates.
For priorities, map words like "important", "urgent", "critical" to appropriate priority levels.

If the input is ambiguous or you need more information, explain what additional details are needed.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      if (response.functionCalls && response.functionCalls.length > 0) {
        return response.functionCalls[0];
      }
      
      return {
        text: response.text(),
        needsMoreInfo: true
      };
    } catch (error) {
      throw new Error(`Gemini API error: ${error}`);
    }
  }

  async generateResponse(context: string, result: any): Promise<string> {
    const prompt = `
Based on the following context and result, generate a helpful response to the user:

Context: ${context}
Result: ${JSON.stringify(result)}

Generate a friendly, concise response that explains what happened and any relevant details.
If there was an error, provide helpful guidance.
Use emojis sparingly and appropriately.
`;

    try {
      const response = await this.model.generateContent(prompt);
      return response.response.text();
    } catch (error) {
      return `Task completed successfully! ${JSON.stringify(result)}`;
    }
  }
}