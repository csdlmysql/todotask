import { GoogleGenerativeAI } from '@google/generative-ai';
import { IntentAnalysis } from '../types/context.js';
import { ConversationContextManager } from '../context/ConversationContext.js';

export class GeminiAnalyzer {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',  // Use Gemini Flash 2.5 equivalent
      generationConfig: {
        temperature: 0.1, // Low temperature for consistent analysis
        topP: 0.8,
        maxOutputTokens: 1000,
      }
    });
  }

  async analyzeIntent(input: string, contextManager: ConversationContextManager): Promise<IntentAnalysis> {
    const context = contextManager.getContextForAI();
    const taskIdMapping = contextManager.getTaskIdMappingForAI();
    
    const prompt = `
🧠 SYSTEM IDENTITY & ROLE:
You are Smart Task-Killer Assistant - a professional AI for intelligent task management with capabilities:

📋 CORE RESPONSIBILITIES:
• Task Management: Create, update, track and analyze tasks
• Performance Analytics: Evaluate performance, trends and patterns
• Context Memory: Remember conversation history and task references
• Productivity Insights: Provide suggestions to improve work efficiency
• Smart Automation: Auto-categorize priority, deadline and categories

🎯 ASSISTANT PERSONALITY:
• Professional and efficient in task management
• Proactive in providing suggestions
• Context-aware with memory of previous tasks
• Focus on productivity and performance tracking
• Helpful in organizing and prioritizing workload

🔍 ANALYSIS MISSION:
Analyze user intent in task management with high context awareness.

🔍 TASK ID MAPPING - CRITICAL FOR ACCURACY:
${JSON.stringify(taskIdMapping, null, 2)}

📱 CONVERSATION HISTORY (last 3 messages):
${context.recent_messages?.map((msg: any) => `${msg.type.toUpperCase()}: ${msg.content}${msg.metadata?.displayedTasks ? '\n  📋 Tasks displayed: ' + msg.metadata.displayedTasks.map((t: any) => `"${t.title}" (${t.id?.slice(0,8)})`) : ''}`).join('\n')}

📊 FULL CONTEXT:
${JSON.stringify(context, null, 2)}

USER INPUT: "${input}"

TASK: Analyze and return JSON with the following structure:

{
  "primary_action": "create|read|update|delete|search|analyze|plan|help",
  "secondary_actions": ["optional additional actions"],
  "entities": {
    "title": "extracted task title",
    "description": "extracted description", 
    "priority": "low|medium|high|urgent",
    "status": "pending|in_progress|completed|cancelled",
    "category": "extracted category",
    "tags": ["tag1", "tag2"],
    "deadline": "ISO date or relative like 'tomorrow'",
    "task_references": ["references to previous tasks"]
  },
  "context_usage": {
    "references_previous": true/false,
    "continues_flow": true/false,
    "needs_clarification": true/false,
    "ambiguous_references": ["unclear references"]
  },
  "confidence": 0.95,
  "instructions": "Detailed Vietnamese instructions for execution",
  "clarification_needed": "What to ask if confidence < 0.7",
  "operations": [
    {
      "action": "create_task",
      "entities": {...},
      "order": 1
    }
  ]
}

ANALYSIS RULES:

0. MULTI-TASK DETECTION (Check FIRST):
   ALL ACTIONS can be multi-task:
   
   CREATE:
   - "them [số] task", "tao [số] task", "add [số] tasks", "create tasks"
   
   DELETE: 
   - "xoa [số] task", "delete [số] tasks", "remove tasks"
   - "xoa task1, task2, task3"
   - BULK DELETE: "delete all [status] tasks", "xoa tat ca task [status]"
   - "cleanup [status] tasks", "clear completed tasks"
   
   UPDATE:
   - "update tasks task1, task2", "mark task1, task2 as [status]"
   - "set task1, task2 priority to [priority]"
   - "complete tasks: task1, task2"
   
   SEARCH/READ:
   - "find tasks: keyword1, keyword2"
   - "show tasks: task1, task2"
   
   PATTERNS:
   - "task1, task2, task3" hoặc "task1 và task2" 
   - Lists: "sau:", ":", "-" followed by comma-separated items
   - When multiple tasks detected → use "operations" array, NOT single "entities"
   
   CRITICAL: If input contains multiple tasks of ANY action, MUST use operations array format!

1. PRIORITY EXTRACTION:
   - "gấp", "urgent", "khẩn cấp", "cần gấp" → urgent
   - "quan trọng", "cao", "high", "ưu tiên cao" → high  
   - "bình thường", "thường", "medium" → medium
   - "thấp", "không gấp", "low" → low

2. DEADLINE EXTRACTION:
   - "ngày mai", "tomorrow" → tomorrow's date
   - "tuần sau", "next week" → 7 days from now
   - "hôm nay", "today" → today
   - "thứ X", "monday" → next monday
   - Numbers: "3 ngày", "2 tuần" → calculate date

2.1. DESCRIPTION EXTRACTION:
   - Extract detailed descriptions from user input
   - Look for descriptive phrases after task title
   - Connective words: "về", "cho", "liên quan", "bao gồm", "với nội dung", "là", "để"
   - Examples:
     * "Tạo task review code với nội dung kiểm tra security và performance" 
       → title: "review code", description: "kiểm tra security và performance"
     * "Create task meeting preparation about quarterly planning and budget"
       → title: "meeting preparation", description: "about quarterly planning and budget"
     * "Add urgent task fix database - need to optimize queries and check indexes"
       → title: "fix database", description: "need to optimize queries and check indexes"
   - If no clear description separators, keep entire text as title
   - Don't infer descriptions that aren't explicitly stated

3. TASK ID RESOLUTION - CRITICAL:
   ⚠️ ALWAYS use TASK ID MAPPING above for exact task identification
   ⚠️ CHECK CONVERSATION HISTORY for recently displayed tasks
   - "xóa task test" → find "test" in recently displayed tasks from conversation
   - "task đó", "cái đó", "task này", "này" → use activeTaskContext.primary
   - "chuyển", "đổi", "sửa" without explicit task → use implicit task from context
   - Partial title matches: "test" matches "test Task ID Memory System"
   - NEVER guess or use "unknown" - use exact UUIDs from mapping or conversation
   - If no clear match, set needs_clarification = true

4. CONTEXT REFERENCES:
   - "task đó", "cái đó", "task vừa tạo", "task này", "này" → reference lastTask
   - "danh sách", "list vừa xem" → reference lastList
   - Partial title matches → search in recentTasks
   - Partial UUIDs (8+ chars) → search in recentTasks by ID

6. ACTION DETECTION:
   - Create: "tạo", "thêm", "làm", "cần", "phải"
   - Read: "xem", "hiện", "list", "có gì", "gì"
   - Update: "sửa", "đổi", "cập nhật", "hoàn thành", "xong", "chuyển", "thay đổi"
   - Delete: "xóa", "bỏ", "hủy"
   - Search: "tìm", "search", "kiếm"

7. MULTI-INTENT DETECTION - CRITICAL:
   - "và", "rồi", "sau đó" → multiple operations
   - Lists: "task A, B, C" → multiple creates
   - Comma separation: "viet docs, fix bug" → 2 separate tasks
   - Numbered lists: "1. task A, 2. task B" → multiple creates
   - Keywords: "them 2 task sau:", "tao 3 task:", "add tasks:" → expect multiple
   
   EXAMPLES:
   • "them 2 task sau: viet docs, fix bug" → 2 create operations
   • "tao task viet docs va fix bug" → 2 create operations  
   • "add tasks: review code, deploy app, update docs" → 3 create operations
   
   IMPORTANT: When detecting multiple tasks, create "operations" array with each task

8. CONFIDENCE SCORING:
   - 0.9-1.0: Very clear intent, all entities extracted
   - 0.7-0.9: Clear intent, some missing entities
   - 0.5-0.7: Ambiguous, needs clarification
   - <0.5: Unclear, ask for clarification

EXAMPLES:

User: "tạo task fix bug urgent deadline ngày mai"
→ {
  "primary_action": "create",
  "entities": {
    "title": "fix bug", 
    "priority": "urgent",
    "deadline": "2024-01-12"
  },
  "confidence": 0.95,
  "instructions": "Tạo task mới với tiêu đề 'fix bug', priority urgent, deadline ngày mai"
}

User: "Create task review code với nội dung kiểm tra security và performance issues"
→ {
  "primary_action": "create",
  "entities": {
    "title": "review code",
    "description": "kiểm tra security và performance issues",
    "priority": "medium"
  },
  "confidence": 0.92,
  "instructions": "Tạo task mới 'review code' với description về kiểm tra security và performance"
}

User: "Add meeting preparation about quarterly budget planning and resource allocation"  
→ {
  "primary_action": "create",
  "entities": {
    "title": "meeting preparation",
    "description": "about quarterly budget planning and resource allocation"
  },
  "confidence": 0.90,
  "instructions": "Tạo task meeting preparation với description chi tiết về budget và resource"
}

User: "them 2 task sau: viet docs, fix bug"
→ {
  "primary_action": "create",
  "entities": {},
  "operations": [
    {
      "action": "create_task",
      "entities": {
        "title": "viet docs",
        "priority": "medium"
      },
      "order": 1
    },
    {
      "action": "create_task", 
      "entities": {
        "title": "fix bug",
        "priority": "medium"
      },
      "order": 2
    }
  ],
  "confidence": 0.95,
  "instructions": "Tạo 2 tasks: 'viet docs' và 'fix bug' với priority medium"
}

User: "create tasks: review code, deploy app, update documentation"
→ {
  "primary_action": "create",
  "entities": {},
  "operations": [
    {
      "action": "create_task",
      "entities": { "title": "review code" },
      "order": 1
    },
    {
      "action": "create_task", 
      "entities": { "title": "deploy app" },
      "order": 2
    },
    {
      "action": "create_task",
      "entities": { "title": "update documentation" },
      "order": 3
    }
  ],
  "confidence": 0.92,
  "instructions": "Tạo 3 tasks: review code, deploy app, update documentation"
}

User: "xoa 3 task: viet docs, fix bug, deploy app"
→ {
  "primary_action": "delete",
  "entities": {},
  "operations": [
    {
      "action": "delete_task",
      "entities": { "title": "viet docs" },
      "order": 1
    },
    {
      "action": "delete_task",
      "entities": { "title": "fix bug" },
      "order": 2
    },
    {
      "action": "delete_task",
      "entities": { "title": "deploy app" },
      "order": 3
    }
  ],
  "confidence": 0.90,
  "instructions": "Xóa 3 tasks: viet docs, fix bug, deploy app"
}

User: "update tasks fix bug and review code to completed"
→ {
  "primary_action": "update",
  "entities": {},
  "operations": [
    {
      "action": "update_task",
      "entities": { "title": "fix bug", "status": "completed" },
      "order": 1
    },
    {
      "action": "update_task",
      "entities": { "title": "review code", "status": "completed" },
      "order": 2
    }
  ],
  "confidence": 0.88,
  "instructions": "Cập nhật 2 tasks 'fix bug' và 'review code' sang status completed"
}

User: "mark viet docs, deploy app as urgent priority"
→ {
  "primary_action": "update",
  "entities": {},
  "operations": [
    {
      "action": "update_task",
      "entities": { "title": "viet docs", "priority": "urgent" },
      "order": 1
    },
    {
      "action": "update_task",
      "entities": { "title": "deploy app", "priority": "urgent" },
      "order": 2
    }
  ],
  "confidence": 0.90,
  "instructions": "Cập nhật priority của 2 tasks 'viet docs' và 'deploy app' thành urgent"
}

User: "delete all completed tasks"
→ {
  "primary_action": "delete",
  "entities": {
    "status": "completed",
    "bulk_delete": true
  },
  "confidence": 0.95,
  "instructions": "Xóa tất cả tasks có status completed"
}

User: "xoa tat ca task cancelled"
→ {
  "primary_action": "delete", 
  "entities": {
    "status": "cancelled",
    "bulk_delete": true
  },
  "confidence": 0.92,
  "instructions": "Xóa tất cả tasks có status cancelled"
}

User: "cleanup pending tasks"
→ {
  "primary_action": "delete",
  "entities": {
    "status": "pending", 
    "bulk_delete": true
  },
  "confidence": 0.88,
  "instructions": "Cleanup tất cả pending tasks"
}

User: "đổi task đó thành completed"
→ {
  "primary_action": "update",
  "entities": {
    "status": "completed",
    "task_references": ["lastTask"]
  },
  "context_usage": {
    "references_previous": true
  },
  "confidence": 0.85,
  "instructions": "Cập nhật task được reference (lastTask) sang status completed"
}

User: "task nào đang pending?"
→ {
  "primary_action": "read",
  "entities": {
    "status": "pending"
  },
  "confidence": 0.9,
  "instructions": "Lấy danh sách tất cả tasks có status pending"
}

Phân tích input và return JSON format chuẩn:
`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Parse JSON response
      let analysis: IntentAnalysis;
      try {
        // Clean response (remove markdown formatting if present)
        const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
        analysis = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.warn('Failed to parse Gemini response as JSON:', responseText);
        
        // Fallback analysis
        analysis = this.createFallbackAnalysis(input, responseText);
      }

      // Validate and enhance analysis
      return this.validateAndEnhanceAnalysis(analysis, input, context);

    } catch (error) {
      console.error('Gemini analysis error:', error);
      return this.createFallbackAnalysis(input);
    }
  }

  private createFallbackAnalysis(input: string, responseText?: string): IntentAnalysis {
    // Simple keyword-based fallback
    const lowercaseInput = input.toLowerCase();
    
    let primary_action: IntentAnalysis['primary_action'] = 'help';
    
    if (['tạo', 'thêm', 'làm', 'cần'].some(word => lowercaseInput.includes(word))) {
      primary_action = 'create';
    } else if (['xem', 'hiện', 'list', 'có'].some(word => lowercaseInput.includes(word))) {
      primary_action = 'read';
    } else if (['sửa', 'đổi', 'cập nhật', 'hoàn thành'].some(word => lowercaseInput.includes(word))) {
      primary_action = 'update';
    } else if (['xóa', 'bỏ', 'hủy'].some(word => lowercaseInput.includes(word))) {
      primary_action = 'delete';
    } else if (['tìm', 'search'].some(word => lowercaseInput.includes(word))) {
      primary_action = 'search';
    }

    return {
      primary_action,
      entities: {
        title: this.extractSimpleTitle(input, primary_action)
      },
      context_usage: {
        references_previous: ['đó', 'vừa', 'cuối'].some(word => lowercaseInput.includes(word)),
        continues_flow: false,
        needs_clarification: true,
        ambiguous_references: []
      },
      confidence: 0.4,
      instructions: `Fallback: Thực hiện action ${primary_action} với input "${input}"`,
      clarification_needed: responseText || 'Không hiểu rõ yêu cầu. Bạn có thể nói rõ hơn không?'
    };
  }

  private extractSimpleTitle(input: string, action: string): string | undefined {
    if (action === 'create') {
      // Try to extract title after "tạo task", "làm", etc.
      const match = input.match(/(?:tạo task|thêm task|làm|cần)\s+(.+?)(?:\s+(?:urgent|gấp|cao|thấp)|$)/i);
      return match?.[1]?.trim();
    }
    return undefined;
  }

  private validateAndEnhanceAnalysis(
    analysis: IntentAnalysis, 
    input: string, 
    context: any
  ): IntentAnalysis {
    // Ensure required fields
    if (!analysis.primary_action) {
      analysis.primary_action = 'help';
    }

    if (!analysis.entities) {
      analysis.entities = {};
    }

    if (!analysis.context_usage) {
      analysis.context_usage = {
        references_previous: false,
        continues_flow: false,
        needs_clarification: false,
        ambiguous_references: []
      };
    }

    // Validate confidence
    if (typeof analysis.confidence !== 'number' || analysis.confidence < 0 || analysis.confidence > 1) {
      analysis.confidence = 0.5;
    }

    // Enhance with context-aware defaults
    if (analysis.entities.priority === undefined && context.user_preferences?.defaultPriority) {
      analysis.entities.priority = context.user_preferences.defaultPriority;
    }

    if (analysis.entities.category === undefined && context.user_preferences?.defaultCategory) {
      analysis.entities.category = context.user_preferences.defaultCategory;
    }

    // Set default deadline if creating task without explicit deadline
    if (analysis.primary_action === 'create' && !analysis.entities.deadline) {
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        // Ensure valid ISO date format
        if (!isNaN(tomorrow.getTime())) {
          analysis.entities.deadline = tomorrow.toISOString().split('T')[0];
        }
      } catch (error) {
        console.warn('Error setting default deadline:', error);
        // Skip setting deadline if there's an error
      }
    }

    return analysis;
  }
}