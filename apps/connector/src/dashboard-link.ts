import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { LocalGateway } from './local-gateway.js';

interface InboundMessage {
  type: string;
  id?: string;
  method?: string;
  params?: unknown;
  event?: string;
  payload?: unknown;
}

/**
 * Outbound WebSocket link to the dashboard. Authenticates with the instance
 * token, then proxies every inbound request to the local OpenClaw gateway and
 * forwards responses (and local events) back.
 */
export class DashboardLink extends EventEmitter {
  private ws: WebSocket | null = null;
  private shouldReconnect = true;
  private reconnectAttempt = 0;

  constructor(
    private dashboardUrl: string,
    private instanceToken: string,
    private local: LocalGateway
  ) {
    super();

    // Relay local-side events up to the dashboard
    this.local.on('event', (event: unknown) => {
      this.send({ type: 'event', ...(event as object) });
    });
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    const url = new URL(this.dashboardUrl);
    url.searchParams.set('token', this.instanceToken);
    console.log(`[dash] connecting to ${url.origin}${url.pathname}`);

    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.on('open', () => {
      console.log('[dash] link open');
      this.reconnectAttempt = 0;
    });
    ws.on('message', (data) => this.handleMessage(data.toString()));
    ws.on('close', (code, reason) => {
      console.log(`[dash] link closed: ${code} ${reason.toString()}`);
      this.scheduleReconnect();
    });
    ws.on('error', (err) => {
      console.error('[dash] link error:', err.message);
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: InboundMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'event' && msg.event === 'server.ack') {
      console.log('[dash] authenticated');
      return;
    }

    if (msg.type === 'req' && msg.id && msg.method) {
      try {
        const result = await this.local.request(msg.method, msg.params, msg.id);
        this.send({ type: 'res', id: msg.id, ok: true, payload: result });
      } catch (err) {
        this.send({
          type: 'res',
          id: msg.id,
          ok: false,
          error: { message: (err as Error).message },
        });
      }
    }
  }

  private send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.reconnectAttempt++;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempt, 5)));
    console.log(`[dash] reconnecting in ${delay}ms`);
    setTimeout(() => this.connect(), delay);
  }
}
