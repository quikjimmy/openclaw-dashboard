// HITL Approval types

export interface Approval {
  id: string;
  agentId: string;
  sessionId?: string;
  type: ApprovalType;
  status: ApprovalStatus;
  request: ApprovalRequest;
  resolution?: ApprovalResolution;
  createdAt: number;
  resolvedAt?: number;
  expiresAt?: number;
}

export type ApprovalType = 'exec' | 'file_write' | 'network' | 'custom';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'auto_approved';

export interface ApprovalRequest {
  command?: string;
  workingDir?: string;
  filePath?: string;
  url?: string;
  description?: string;
  risk?: RiskLevel;
  context?: Record<string, unknown>;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalResolution {
  action: ApprovalAction;
  resolvedBy?: string;
  reason?: string;
  rememberChoice?: boolean;
}

export type ApprovalAction = 'allow-once' | 'allow-always' | 'deny' | 'deny-always';

export interface ResolveApprovalRequest {
  action: ApprovalAction;
  reason?: string;
  rememberChoice?: boolean;
}

export interface ApprovalListResponse {
  approvals: Approval[];
  pending: number;
  total: number;
}

export interface ApprovalStats {
  pending: number;
  approvedToday: number;
  deniedToday: number;
  avgResolutionTimeMs: number;
}
