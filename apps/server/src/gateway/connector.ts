import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import crypto from 'crypto';
import type { Server as HttpServer } from 'http';
import { StorageService } from '../services/storage.js';
import { InstanceGateway, RequestOptions } from './types.js';
import type { GatewayEvent } from '@openclaw-dashboard/shared';

const HELLO_TIMEOUT_MS = 5000;
const PING_INTERVAL_MS = 30000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * One authenticated connector WebSocket. Implements InstanceGateway so routes
 * can call .request() the same way they would an outbound GatewayClient.
 */
export class ConnectorSession extends EventEmitter implements InstanceGateway {
  readonly instanceId: string;
  private ws: WebSocket;
  private pending = new Map<string, PendingRequest>();
  private alive = true;
  private pingTimer: NodeJS.Timeout;

  constructor(instanceId: string, ws: WebSocket) {
    super();
    this.instanceId = instanceId;
    this.ws = ws;

    ws.on('message', (data) => this.handleMessage(data.toString()));
    ws.on('close', () => this.teardown(new Error('Connector disconnected')));
    ws.on('error', () => this.teardown(new Error('Connector socket error')));
    ws.on('pong', () => {
      this.alive = true;
    });

    this.pingTimer = setInterval(() => {
      if (!this.alive) {
        this.ws.terminate();
        return;
      }
      this.alive = false;
      try {
        this.ws.ping();
      } catch {
        /* ignore */
      }
    }, PING_INTERVAL_MS);
  }

  isConnected(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown, options?: RequestOptions): Promise<T> {
    if (!this.isConnected()) return Promise.reject(new Error('Connector not connected'));
    const id = options?.idempotencyKey || crypto.randomUUID();
    const timeout = options?.timeout ?? 30000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Connector request timeout: ${method}`));
      }, timeout);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timeout: timer });
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  close(reason?: string): void {
    try {
      if (reason) this.ws.send(JSON.stringify({ type: 'event', event: 'server.close', payload: { reason } }));
    } catch {
      /* ignore */
    }
    this.teardown(new Error(reason || 'closed'));
    this.ws.close();
  }

  private handleMessage(raw: string): void {
    let msg: { type: string; id?: string; ok?: boolean; payload?: unknown; error?: { message?: string }; event?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'res' && msg.id) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timeout);
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.payload);
      else p.reject(new Error(msg.error?.message || 'Connector request failed'));
      return;
    }

    if (msg.type === 'event') {
      this.emit('gateway-event', msg as unknown as GatewayEvent);
    }
  }

  private teardown(err: Error): void {
    clearInterval(this.pingTimer);
    for (const p of this.pending.values()) {
      clearTimeout(p.timeout);
      p.reject(err);
    }
    this.pending.clear();
    this.emit('closed');
  }
}

/**
 * Accepts inbound connector WebSockets, authenticates by instance token, and
 * exposes the registry of live sessions so routes can route RPCs to the right
 * tenant's OpenClaw.
 */
export class ConnectorHub extends EventEmitter {
  private sessions = new Map<string, ConnectorSession>();
  private wss: WebSocketServer;

  constructor(private storage: StorageService) {
    super();
    this.wss = new WebSocketServer({ noServer: true });
  }

  /** Attach to an existing http.Server so WS upgrades on /api/connector route here. */
  attach(server: HttpServer, path = '/api/connector'): void {
    server.on('upgrade', (req, socket, head) => {
      if (!req.url) return socket.destroy();
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== path) return;

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.onConnection(ws, req);
      });
    });
  }

  get(instanceId: string): ConnectorSession | undefined {
    return this.sessions.get(instanceId);
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    // Accept token via ?token= query, or from the first 'hello' message.
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('token');

    if (queryToken) {
      this.authenticate(ws, queryToken);
      return;
    }

    // Await hello message for auth
    const helloTimer = setTimeout(() => {
      ws.close(4401, 'auth timeout');
    }, HELLO_TIMEOUT_MS);

    const onMessage = (data: WebSocket.RawData) => {
      clearTimeout(helloTimer);
      ws.off('message', onMessage);
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== 'hello' || typeof msg.token !== 'string') {
          ws.close(4400, 'expected hello');
          return;
        }
        this.authenticate(ws, msg.token);
      } catch {
        ws.close(4400, 'invalid hello');
      }
    };
    ws.on('message', onMessage);
  }

  private authenticate(ws: WebSocket, token: string): void {
    const instanceId = this.storage.verifyInstanceToken(token);
    if (!instanceId) {
      ws.close(4403, 'invalid instance token');
      return;
    }

    // Replace any existing session for this instance
    const existing = this.sessions.get(instanceId);
    if (existing) {
      existing.close('replaced');
      this.sessions.delete(instanceId);
    }

    const session = new ConnectorSession(instanceId, ws);
    this.sessions.set(instanceId, session);

    session.on('gateway-event', (event: GatewayEvent) => {
      this.emit('event', { instanceId, event });
      this.storage.updateInstance(instanceId, { lastSeenAt: Date.now() });
    });
    session.on('closed', () => {
      if (this.sessions.get(instanceId) === session) {
        this.sessions.delete(instanceId);
        this.storage.updateInstance(instanceId, { status: 'offline' });
        this.emit('disconnected', instanceId);
      }
    });

    this.storage.updateInstance(instanceId, { status: 'online', lastSeenAt: Date.now() });
    ws.send(JSON.stringify({ type: 'event', event: 'server.ack', payload: { instanceId } }));
    this.emit('connected', instanceId);
  }

  disconnect(instanceId: string): void {
    const session = this.sessions.get(instanceId);
    if (!session) return;
    session.close('admin disconnect');
    this.sessions.delete(instanceId);
  }

  closeAll(): void {
    for (const s of this.sessions.values()) s.close('shutdown');
    this.sessions.clear();
    this.wss.close();
  }

  summary(): { instanceId: string; connected: boolean }[] {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      instanceId: id,
      connected: s.isConnected(),
    }));
  }
}
