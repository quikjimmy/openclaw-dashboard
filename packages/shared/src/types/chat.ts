// Chat and Session types

export interface Session {
  id: string;
  agentId: string;
  channelId: string;
  userId?: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  lastMessageAt?: number;
  metadata?: Record<string, unknown>;
}

export type SessionStatus = 'active' | 'archived' | 'expired';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  metadata?: MessageMetadata;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
}

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed' | 'approved' | 'denied';

export interface ToolResult {
  toolCallId: string;
  result?: unknown;
  error?: string;
}

export interface MessageMetadata {
  model?: string;
  tokens?: {
    prompt: number;
    completion: number;
  };
  latencyMs?: number;
}

export interface SendMessageRequest {
  sessionId?: string;
  agentId: string;
  content: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: 'file' | 'image' | 'url';
  name: string;
  url?: string;
  content?: string;
  mimeType?: string;
}

export interface ChatHistoryResponse {
  messages: Message[];
  hasMore: boolean;
  cursor?: string;
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
}
