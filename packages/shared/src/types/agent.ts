// Agent types

export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  model: ModelConfig;
  skills: string[];
  channels: string[];
  createdAt: number;
  updatedAt: number;
  config?: AgentConfig;
}

export type AgentStatus = 'active' | 'inactive' | 'error' | 'starting' | 'stopping';

export interface ModelConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentConfig {
  systemPrompt?: string;
  greeting?: string;
  sandbox?: SandboxConfig;
  approvals?: ApprovalConfig;
}

export interface SandboxConfig {
  enabled: boolean;
  docker?: {
    image?: string;
    env?: Record<string, string>;
  };
}

export interface ApprovalConfig {
  requireApproval: boolean;
  autoApprove?: string[];
  alwaysDeny?: string[];
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  model: ModelConfig;
  skills?: string[];
  channels?: string[];
  config?: AgentConfig;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  model?: Partial<ModelConfig>;
  skills?: string[];
  channels?: string[];
  config?: Partial<AgentConfig>;
}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
}
