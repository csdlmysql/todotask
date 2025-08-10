// Simple types to avoid complex Gemini SDK type issues
export interface SimpleFunctionDeclaration {
  name: string;
  description: string;
  parameters: any;
}

export interface SimpleGeminiResponse {
  functionCalls?: Array<{
    name: string;
    args: any;
  }>;
  text?: () => string;
}