// Re-export all types
export * from './types/protocol.js';
export * from './types/agent.js';
export * from './types/chat.js';
export * from './types/approval.js';
export * from './types/task.js';
export * from './types/tenant.js';

// Utility types
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Connection state
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'pairing_required'
  | 'connected'
  | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  deviceId: string | null;
  gatewayUrl: string;
  lastError: string | null;
  connectedAt: number | null;
}
