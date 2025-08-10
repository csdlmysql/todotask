import { GoogleGenerativeAI } from '@google/generative-ai';
import { SimpleFunctionDeclaration } from '../gemini-types.js';

export class GeminiServiceSimple {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      tools: [{ functionDeclarations: this.getVietnameseFunctionDeclarations() as any }]
    });
  }

  private getVietnameseFunctionDeclarations(): SimpleFunctionDeclaration[] {
    return [
      {
        name: 'create_task',
        description: 'Tạo task mới khi người dùng muốn thêm công việc',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Tiêu đề task (bắt buộc)'
            },
            description: {
              type: 'string',
              description: 'Mô tả chi tiết task'
            },
            priority: {
              type: 'string',
              description: 'Độ ưu tiên: low (thấp), medium (trung bình), high (cao), urgent (khẩn cấp)',
              enum: ['low', 'medium', 'high', 'urgent']
            },
            due_date: {
              type: 'string',
              description: 'Ngày hết hạn/deadline (YYYY-MM-DD). Hôm nay, ngày mai, tuần sau, v.v. Mặc định là 1 ngày nếu không chỉ định.'
            },
            deadline: {
              type: 'string',
              description: 'Deadline của task (YYYY-MM-DD). Tương tự due_date.'
            },
            category: {
              type: 'string',
              description: 'Danh mục: work (công việc), personal (cá nhân), study (học tập)'
            },
            tags: {
              type: 'string',
              description: 'Tags phân cách bằng dấu phẩy'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'list_tasks',
        description: 'Hiển thị danh sách task khi người dùng muốn xem',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Lọc theo trạng thái: pending (chờ), in_progress (đang làm), completed (hoàn thành), cancelled (hủy)',
              enum: ['pending', 'in_progress', 'completed', 'cancelled']
            },
            priority: {
              type: 'string',
              description: 'Lọc theo độ ưu tiên',
              enum: ['low', 'medium', 'high', 'urgent']
            },
            category: {
              type: 'string',
              description: 'Lọc theo danh mục'
            },
            limit: {
              type: 'string',
              description: 'Giới hạn số lượng task hiển thị'
            }
          },
          required: []
        }
      },
      {
        name: 'update_task',
        description: 'Cập nhật task khi người dùng muốn thay đổi trạng thái, độ ưu tiên, v.v.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID của task cần cập nhật (8 ký tự đầu cũng được)'
            },
            title: {
              type: 'string',
              description: 'Tiêu đề mới'
            },
            description: {
              type: 'string',
              description: 'Mô tả mới'
            },
            status: {
              type: 'string',
              description: 'Trạng thái mới: pending, in_progress, completed, cancelled',
              enum: ['pending', 'in_progress', 'completed', 'cancelled']
            },
            priority: {
              type: 'string',
              description: 'Độ ưu tiên mới',
              enum: ['low', 'medium', 'high', 'urgent']
            }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_task',
        description: 'Xóa task khi người dùng muốn bỏ task không cần thiết',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID của task cần xóa'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'search_tasks',
        description: 'Tìm kiếm task theo từ khóa',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Từ khóa tìm kiếm'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_task_stats',
        description: 'Xem thống kê task',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              description: 'Khoảng thời gian: today (hôm nay), week (tuần), month (tháng), all (tất cả)',
              enum: ['today', 'week', 'month', 'all']
            }
          },
          required: []
        }
      }
    ];
  }

  async processVietnameseInput(input: string): Promise<any> {
    // Parse ngày tháng tiếng Việt
    const processedInput = this.parseVietnameseDates(input);
    
    const prompt = `
Bạn là assistant quản lý task. Phân tích câu sau và GỌI FUNCTION phù hợp:

"${processedInput}"

RULES:
1. LUÔN LUÔN gọi function, không trả về text
2. Phân tích ý định và map thành function calls

MAPPING:
- "tạo", "thêm", "làm" → call create_task
- "xem", "hiện", "list", "có những task nào" → call list_tasks  
- "hoàn thành", "xong" → call update_task
- "xóa", "bỏ" → call delete_task
- "tìm", "search" → call search_tasks

DEADLINE KEYWORDS:
- "deadline", "hạn", "đến hạn", "due"
- Mặc định: 1 ngày nếu không chỉ định
- "ngày mai" = tomorrow, "tuần sau" = next week

EXAMPLES:
User: "tạo task fix bug"
→ create_task(title: "fix bug") // Auto deadline = 1 ngày

User: "tạo task review code deadline 3 ngày"
→ create_task(title: "review code", due_date: "3 days from now")

User: "tôi có những task nào"  
→ list_tasks()

User: "xem task sắp hết hạn"
→ list_tasks() // Filter by due soon

NOW ANALYZE AND CALL FUNCTION:
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      console.log('DEBUG - Gemini response:', response);
      console.log('DEBUG - Function calls:', response.functionCalls);
      
      // Thử cả hai cách để get function calls
      let functionCalls = null;
      if (typeof response.functionCalls === 'function') {
        functionCalls = response.functionCalls();
      } else {
        functionCalls = response.functionCalls;
      }
      
      console.log('DEBUG - Actual function calls:', functionCalls);
      
      if (functionCalls && functionCalls.length > 0) {
        const functionCall = functionCalls[0];
        return {
          name: functionCall.name,
          args: functionCall.args
        };
      }
      
      return {
        text: response.text(),
        needsMoreInfo: true
      };
    } catch (error) {
      throw new Error(`Lỗi Gemini AI: ${error}`);
    }
  }

  private parseVietnameseDates(input: string): string {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    let processed = input
      .replace(/hôm nay/g, today.toISOString().split('T')[0])
      .replace(/ngày mai/g, tomorrow.toISOString().split('T')[0])
      .replace(/tuần sau/g, nextWeek.toISOString().split('T')[0])
      .replace(/tháng sau/g, nextMonth.toISOString().split('T')[0]);

    return processed;
  }

  async getSuggestions(context: string): Promise<string[]> {
    const suggestions = [
      'Tạo task mới',
      'Xem task hôm nay', 
      'Hiển thị task urgent',
      'Hoàn thành task cuối cùng',
      'Thống kê task',
      'Tìm task theo từ khóa'
    ];

    // Có thể mở rộng với AI để đưa ra gợi ý thông minh hơn
    return suggestions;
  }

  async explainCommand(command: string): Promise<string> {
    const explanations: { [key: string]: string } = {
      'create': 'Tạo task mới. VD: "Tạo task làm báo cáo, urgent"',
      'list': 'Xem danh sách task. VD: "Xem task pending"',
      'update': 'Cập nhật task. VD: "Hoàn thành task abc123"',
      'delete': 'Xóa task. VD: "Xóa task không cần thiết"',
      'search': 'Tìm task. VD: "Tìm task về meeting"',
      'stats': 'Xem thống kê. VD: "Thống kê task tuần này"'
    };

    return explanations[command] || 'Không hiểu lệnh này. Gõ /help để xem hướng dẫn.';
  }
}