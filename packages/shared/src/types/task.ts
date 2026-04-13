// Task types

export interface Task {
  id: string;
  runId?: string;
  agentId: string;
  sessionId?: string;
  type: TaskType;
  status: TaskStatus;
  description?: string;
  progress?: TaskProgress;
  result?: TaskResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export type TaskType = 'chat' | 'tool' | 'skill' | 'scheduled' | 'webhook';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface TaskProgress {
  current: number;
  total: number;
  message?: string;
  steps?: TaskStep[];
}

export interface TaskStep {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  output?: string;
}

export interface TaskResult {
  success: boolean;
  output?: unknown;
  error?: string;
  artifacts?: TaskArtifact[];
}

export interface TaskArtifact {
  type: 'file' | 'url' | 'data';
  name: string;
  path?: string;
  url?: string;
  data?: unknown;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  running: number;
  queued: number;
}

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  agentId?: string;
  type?: TaskType;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export interface TaskStats {
  running: number;
  queued: number;
  completedToday: number;
  failedToday: number;
  avgDurationMs: number;
}
