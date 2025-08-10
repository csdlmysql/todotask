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
Bạn là AI expert phân tích ý định người dùng trong task management.

🔍 TASK ID MAPPING - CRITICAL FOR ACCURACY:
${JSON.stringify(taskIdMapping, null, 2)}

📱 CONVERSATION HISTORY (last 3 messages):
${context.recent_messages?.map((msg: any) => `${msg.type.toUpperCase()}: ${msg.content}${msg.metadata?.displayedTasks ? '\n  📋 Tasks displayed: ' + msg.metadata.displayedTasks.map((t: any) => `"${t.title}" (${t.id?.slice(0,8)})`) : ''}`).join('\n')}

📊 FULL CONTEXT:
${JSON.stringify(context, null, 2)}

USER INPUT: "${input}"

NHIỆM VỤ: Phân tích và trả về JSON với structure sau:

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

PHÂN TÍCH RULES:
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

7. MULTI-INTENT:
   - "và", "rồi", "sau đó" → multiple operations
   - Lists: "task A, B, C" → multiple creates

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
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      analysis.entities.deadline = tomorrow.toISOString().split('T')[0];
    }

    return analysis;
  }
}