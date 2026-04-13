// Multi-tenant types

export interface Organization {
  id: string;
  name: string;
  slug: string; // For subdomain: slug.yourdomain.com
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  createdAt: number;
  updatedAt: number;
  settings?: OrganizationSettings;
}

export interface OrganizationSettings {
  maxInstances: number;
  alertEmail?: string;
  slackWebhook?: string;
  customDomain?: string;
}

export interface Instance {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  gatewayUrl: string;
  status: InstanceStatus;
  deployment: 'managed' | 'self-hosted';
  connectionMode: 'outbound' | 'connector';
  region?: string;
  version?: string;
  createdAt: number;
  updatedAt: number;
  lastSeenAt?: number;
  deviceId?: string;
  deviceToken?: string;
}

export type InstanceStatus =
  | 'online'
  | 'offline'
  | 'connecting'
  | 'error'
  | 'maintenance'
  | 'unknown';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string; // null for super admins
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

export type UserRole = 'super_admin' | 'org_admin' | 'org_member' | 'viewer';

export interface HealthCheck {
  id: string;
  instanceId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unreachable';
  latencyMs?: number;
  gatewayVersion?: string;
  agentsActive?: number;
  agentsTotal?: number;
  tasksRunning?: number;
  approvalsPending?: number;
  errorCount?: number;
  checkedAt: number;
  details?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  instanceId: string;
  organizationId: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  status: 'active' | 'acknowledged' | 'resolved';
  createdAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  resolvedAt?: number;
  metadata?: Record<string, unknown>;
}

export type AlertType =
  | 'instance_offline'
  | 'instance_error'
  | 'high_latency'
  | 'approval_stale'
  | 'task_failed'
  | 'agent_error'
  | 'connection_lost'
  | 'version_outdated';

export interface InstanceMetrics {
  instanceId: string;
  timestamp: number;
  messagesTotal: number;
  messagesLast24h: number;
  tasksTotal: number;
  tasksLast24h: number;
  approvalsTotal: number;
  approvalsLast24h: number;
  avgResponseTimeMs: number;
  errorRate: number;
}

// API request/response types
export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  plan?: Organization['plan'];
  settings?: OrganizationSettings;
}

export interface CreateInstanceRequest {
  organizationId: string;
  name: string;
  description?: string;
  gatewayUrl: string;
  deployment: Instance['deployment'];
  connectionMode?: Instance['connectionMode'];
  region?: string;
}

export interface OrganizationListResponse {
  organizations: Organization[];
  total: number;
}

export interface InstanceListResponse {
  instances: Instance[];
  total: number;
}

export interface AlertListResponse {
  alerts: Alert[];
  total: number;
  active: number;
}

export interface DashboardStats {
  totalOrganizations: number;
  totalInstances: number;
  instancesOnline: number;
  instancesOffline: number;
  instancesError: number;
  activeAlerts: number;
  criticalAlerts: number;
}
