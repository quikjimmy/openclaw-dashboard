import { EventEmitter } from 'events';
import { GatewayClient } from './client.js';
import { InstanceDeviceService } from '../services/device.js';
import { StorageService } from '../services/storage.js';
import type { GatewayEvent } from '@openclaw-dashboard/shared';

export interface ScopedGatewayEvent {
  instanceId: string;
  event: GatewayEvent;
}

/**
 * Maintains one GatewayClient per instance, created lazily on first access.
 *
 * Re-emits client lifecycle as scoped events so a single SSE stream can carry
 * events from every tenant instance without consumers wiring per-client handlers.
 */
export class GatewayPool extends EventEmitter {
  private clients = new Map<string, GatewayClient>();

  constructor(
    private readonly storage: StorageService,
    private readonly devices: InstanceDeviceService
  ) {
    super();
  }

  /** Get (or lazily construct) a client for an instance. Does not connect. */
  get(instanceId: string): GatewayClient {
    const existing = this.clients.get(instanceId);
    if (existing) return existing;

    const instance = this.storage.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const client = new GatewayClient(instanceId, instance.gatewayUrl, this.devices);
    this.wire(client);
    this.clients.set(instanceId, client);
    return client;
  }

  has(instanceId: string): boolean {
    return this.clients.has(instanceId);
  }

  /** Connect if not already connected. */
  async connect(instanceId: string): Promise<void> {
    const client = this.get(instanceId);
    if (client.isConnected()) return;
    await client.connect();
  }

  /** Disconnect and drop the client (use on instance delete or reconfig). */
  disconnect(instanceId: string): void {
    const client = this.clients.get(instanceId);
    if (!client) return;
    client.removeAllListeners();
    client.disconnect();
    this.clients.delete(instanceId);
  }

  /** Disconnect everything (shutdown). */
  disconnectAll(): void {
    for (const id of Array.from(this.clients.keys())) {
      this.disconnect(id);
    }
  }

  /** Summary for health / dashboard endpoints. */
  summary(): { instanceId: string; connected: boolean }[] {
    return Array.from(this.clients.entries()).map(([id, c]) => ({
      instanceId: id,
      connected: c.isConnected(),
    }));
  }

  private wire(client: GatewayClient): void {
    const id = client.instanceId;

    client.on('gateway-event', (event: GatewayEvent) => {
      this.emit('event', { instanceId: id, event } as ScopedGatewayEvent);
      this.storage.updateInstance(id, { lastSeenAt: Date.now() });
    });
    client.on('connected', () => {
      this.storage.updateInstance(id, { status: 'online', lastSeenAt: Date.now() });
      this.emit('connected', id);
    });
    client.on('disconnected', () => {
      this.storage.updateInstance(id, { status: 'offline' });
      this.emit('disconnected', id);
    });
    client.on('pairing-required', (deviceId: string) => {
      this.emit('pairing-required', { instanceId: id, deviceId });
    });
    client.on('pairing-approved', () => {
      this.emit('pairing-approved', id);
    });
  }
}
