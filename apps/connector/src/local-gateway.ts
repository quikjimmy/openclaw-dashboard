import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { DeviceIdentity, generateDeviceIdentity, signChallenge } from './crypto.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface Message {
  type: string;
  id?: string;
  method?: string;
  params?: unknown;
  ok?: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
  event?: string;
}

/**
 * Holds the operator-role WebSocket to a local OpenClaw gateway, completes v3
 * pairing (persisting its device identity + device token), and exposes a
 * request/event interface.
 */
export class LocalGateway extends EventEmitter {
  private ws: WebSocket | null = null;
  private identity: DeviceIdentity;
  private deviceToken: string | null;
  private pending = new Map<string, PendingRequest>();
  private connected = false;
  private shouldReconnect = true;
  private reconnectAttempt = 0;

  constructor(
    private gatewayUrl: string,
    private identityPath: string
  ) {
    super();
    const loaded = this.loadIdentity();
    this.identity = loaded.identity;
    this.deviceToken = loaded.deviceToken;
  }

  get deviceId(): string {
    return this.identity.id;
  }

  get devicePublicKey(): string {
    return this.identity.publicKey;
  }

  isConnected(): boolean {
    return this.connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws?.close();
      console.log(`[local] connecting to OpenClaw at ${this.gatewayUrl}`);
      const ws = new WebSocket(this.gatewayUrl);
      this.ws = ws;
      const connectTimeout = setTimeout(() => {
        reject(new Error('Local gateway connect timeout'));
        ws.close();
      }, 30000);

      ws.on('open', () => {
        console.log('[local] socket open, awaiting challenge...');
      });
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as Message;
          this.handleMessage(msg, resolve, reject, connectTimeout);
        } catch (err) {
          console.error('[local] failed to parse message:', err);
        }
      });
      ws.on('close', (code, reason) => {
        console.log(`[local] socket closed: ${code} ${reason.toString()}`);
        this.connected = false;
        this.emit('disconnected');
        this.scheduleReconnect();
      });
      ws.on('error', (err) => {
        console.error('[local] socket error:', err.message);
        clearTimeout(connectTimeout);
        reject(err);
      });
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  async request<T = unknown>(method: string, params?: unknown, idempotencyKey?: string): Promise<T> {
    if (!this.connected) throw new Error('Local gateway not connected');
    const id = idempotencyKey || crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Local gateway timeout: ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timeout,
      });
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  private handleMessage(
    msg: Message,
    connectResolve?: (v: void) => void,
    connectReject?: (err: Error) => void,
    connectTimeout?: NodeJS.Timeout
  ): void {
    if (msg.type === 'event') {
      if (msg.event === 'connect.challenge') {
        const nonce = (msg.payload as { nonce: string }).nonce;
        this.sendConnect(nonce);
        return;
      }
      if (msg.event === 'connect.approved') {
        console.log('[local] pairing approved');
        return;
      }
      this.emit('event', msg);
      return;
    }

    if (msg.type === 'res') {
      if (msg.id === 'connect') {
        if (connectTimeout) clearTimeout(connectTimeout);
        if (msg.ok) {
          const payload = msg.payload as { auth?: { deviceToken?: string }; gateway?: { version?: string } };
          if (payload.auth?.deviceToken) {
            this.deviceToken = payload.auth.deviceToken;
            this.saveIdentity();
          }
          this.connected = true;
          this.reconnectAttempt = 0;
          console.log(`[local] connected (gateway ${payload.gateway?.version ?? 'unknown'})`);
          this.emit('connected');
          connectResolve?.();
        } else {
          const err = msg.error;
          if (err?.code === 'PAIRING_REQUIRED') {
            console.log(
              `[local] pairing required — approve device ${this.identity.id.slice(0, 12)}... in OpenClaw`
            );
            this.emit('pairing-required', this.identity.id);
            // keep socket open; once approved, gateway re-issues challenge
            return;
          }
          connectReject?.(new Error(err?.message || 'Local gateway connect failed'));
        }
        return;
      }

      const pending = this.pending.get(msg.id!);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(msg.id!);
      if (msg.ok) pending.resolve(msg.payload);
      else pending.reject(new Error(msg.error?.message || 'Local request failed'));
    }
  }

  private sendConnect(nonce: string): void {
    const signedAt = Date.now();
    const scopes = ['*'];
    const token = this.deviceToken || undefined;
    const clientId = `connector-${this.identity.id.slice(0, 8)}`;

    const signature = signChallenge(this.identity.privateKey, {
      deviceId: this.identity.id,
      clientId,
      role: 'operator',
      scopes,
      signedAt,
      token,
      nonce,
    });

    this.ws!.send(
      JSON.stringify({
        type: 'req',
        id: 'connect',
        method: 'connect',
        params: {
          device: {
            id: this.identity.id,
            publicKey: this.identity.publicKey,
            signature,
            signedAt,
            nonce,
          },
          clientId,
          scopes,
          token,
        },
      })
    );
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.reconnectAttempt++;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempt, 5)));
    console.log(`[local] reconnecting in ${delay}ms`);
    setTimeout(() => {
      this.connect().catch((err) => console.error('[local] reconnect failed:', err.message));
    }, delay);
  }

  private loadIdentity(): { identity: DeviceIdentity; deviceToken: string | null } {
    if (fs.existsSync(this.identityPath)) {
      const raw = JSON.parse(fs.readFileSync(this.identityPath, 'utf8'));
      return {
        identity: { id: raw.id, publicKey: raw.publicKey, privateKey: raw.privateKey },
        deviceToken: raw.deviceToken ?? null,
      };
    }
    const identity = generateDeviceIdentity();
    fs.mkdirSync(path.dirname(this.identityPath), { recursive: true });
    fs.writeFileSync(
      this.identityPath,
      JSON.stringify({ ...identity, deviceToken: null }, null, 2),
      { mode: 0o600 }
    );
    console.log(`[local] generated new device identity: ${identity.id.slice(0, 12)}...`);
    return { identity, deviceToken: null };
  }

  private saveIdentity(): void {
    fs.writeFileSync(
      this.identityPath,
      JSON.stringify({ ...this.identity, deviceToken: this.deviceToken }, null, 2),
      { mode: 0o600 }
    );
  }
}
