/**
 * Shared interface implemented by both the outbound GatewayClient (dashboard
 * dials the tenant's OpenClaw) and the inbound ConnectorSession (tenant's
 * connector dials the dashboard).
 *
 * Routes resolve one of these per instance and call it the same way.
 */
export interface InstanceGateway {
  readonly instanceId: string;
  isConnected(): boolean;
  request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeout?: number; idempotencyKey?: string }
  ): Promise<T>;
}

export interface RequestOptions {
  timeout?: number;
  idempotencyKey?: string;
}
