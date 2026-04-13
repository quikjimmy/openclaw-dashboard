import { StorageService } from '../services/storage.js';
import { GatewayPool } from './pool.js';
import { ConnectorHub } from './connector.js';
import { InstanceGateway } from './types.js';

/**
 * Facade that picks the right transport per instance:
 * - `outbound`  → dashboard dials the tenant's gateway (GatewayPool)
 * - `connector` → tenant's connector holds an inbound socket (ConnectorHub)
 *
 * Every route uses `resolve(instanceId)` and calls `.request(...)` — the mode
 * difference is transparent.
 */
export class Gateways {
  constructor(
    private storage: StorageService,
    readonly pool: GatewayPool,
    readonly hub: ConnectorHub
  ) {}

  /** Returns a live, in-memory gateway handle if the instance has one. */
  resolve(instanceId: string): InstanceGateway | null {
    const instance = this.storage.getInstance(instanceId);
    if (!instance) return null;

    if (instance.connectionMode === 'connector') {
      return this.hub.get(instanceId) ?? null;
    }
    return this.pool.has(instanceId) ? this.pool.get(instanceId) : null;
  }

  /**
   * For outbound instances, triggers pool.connect(). Connector instances are
   * driven by the client dialing us, so we just report whatever's live now.
   */
  async ensureConnected(instanceId: string): Promise<InstanceGateway | null> {
    const instance = this.storage.getInstance(instanceId);
    if (!instance) return null;
    if (instance.connectionMode === 'outbound') {
      await this.pool.connect(instanceId);
    }
    return this.resolve(instanceId);
  }

  disconnect(instanceId: string): void {
    const instance = this.storage.getInstance(instanceId);
    if (!instance) return;
    if (instance.connectionMode === 'connector') {
      this.hub.disconnect(instanceId);
    } else {
      this.pool.disconnect(instanceId);
    }
  }

  summary(): { instanceId: string; mode: 'outbound' | 'connector'; connected: boolean }[] {
    const outbound = this.pool.summary().map((s) => ({
      instanceId: s.instanceId,
      mode: 'outbound' as const,
      connected: s.connected,
    }));
    const connector = this.hub.summary().map((s) => ({
      instanceId: s.instanceId,
      mode: 'connector' as const,
      connected: s.connected,
    }));
    return [...outbound, ...connector];
  }
}
