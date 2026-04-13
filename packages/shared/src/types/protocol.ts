// OpenClaw Gateway Protocol Types

export interface GatewayRequest {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface GatewayResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: GatewayError;
}

export interface GatewayEvent {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: number;
}

export interface GatewayError {
  code: string;
  message: string;
  details?: unknown;
}

export type GatewayMessage = GatewayRequest | GatewayResponse | GatewayEvent;

// Connection types
export interface ConnectChallenge {
  nonce: string;
  ts: number;
}

export interface DeviceIdentity {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

export interface ConnectParams {
  device: DeviceIdentity;
  clientId?: string;
  clientMode?: 'operator' | 'node';
  scopes?: string[];
  token?: string;
}

export interface ConnectResult {
  auth: {
    deviceToken: string;
    expiresAt?: number;
  };
  gateway: {
    version: string;
    features?: string[];
  };
}

// Gateway event types
export type GatewayEventType =
  | 'connect.challenge'
  | 'connect.approved'
  | 'connect.rejected'
  | 'chat'
  | 'session.message'
  | 'sessions.changed'
  | 'exec.approval.requested'
  | 'exec.approval.resolved'
  | 'tick'
  | 'health'
  | 'error';
