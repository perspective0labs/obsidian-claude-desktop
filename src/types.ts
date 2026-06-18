export type MessageRole = 'user' | 'assistant';
export type PluginMode = 'chat' | 'cowork' | 'code';
export type ModelId =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-8';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  id: string;
  role: MessageRole;
  content: string | ContentBlock[];
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: ModelId;
  mode: PluginMode;
  createdAt: number;
  updatedAt: number;
}

export interface ClaudeSettings {
  apiKey: string;
  defaultModel: ModelId;
  conversationsFolder: string;
  systemPrompt: string;
  enableVaultTools: boolean;
  enableCodeMode: boolean;
  enableCowork: boolean;
  maxTokens: number;
  syncFilePath: string;
  autoSyncOnStartup: boolean;
  autoExportChats: boolean;
  exportFolder: string;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface CoworkAgent {
  id: string;
  name: string;
  role: string;
  model: ModelId;
  systemPrompt: string;
  status: 'idle' | 'thinking' | 'done' | 'error';
  output?: string;
}
