import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { InstanceDeviceService } from '../services/device.js';
import { InstanceGateway } from './types.js';
import type {
  GatewayMessage,
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  ConnectChallenge,
  ConnectResult,
} from '@openclaw-dashboard/shared';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class GatewayClient extends EventEmitter implements InstanceGateway {
  private ws: WebSocket | null = null;
  private gatewayUrl: string;
  private deviceService: InstanceDeviceService;
  readonly instanceId: string;
  private pendingRequests = new Map<string, PendingRequest>();
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private shouldReconnect = true;

  constructor(
    instanceId: string,
    gatewayUrl: string,
    deviceService: InstanceDeviceService
  ) {
    super();
    this.instanceId = instanceId;
    this.gatewayUrl = gatewayUrl;
    this.deviceService = deviceService;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.close();
      }

      console.log(`Connecting to Gateway at ${this.gatewayUrl}...`);
      this.ws = new WebSocket(this.gatewayUrl);

      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.ws?.close();
      }, 30000);

      this.ws.on('open', () => {
        console.log('WebSocket connection established, waiting for challenge...');
      });

      this.ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString()) as GatewayMessage;
          await this.handleMessage(message, resolve, reject, connectionTimeout);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} ${reason.toString()}`);
        this.connected = false;
        this.emit('disconnected');
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        clearTimeout(connectionTimeout);
        reject(error);
      });
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  private async handleMessage(
    message: GatewayMessage,
    connectResolve?: (value: void) => void,
    connectReject?: (error: Error) => void,
    connectionTimeout?: NodeJS.Timeout
  ): Promise<void> {
    if (message.type === 'event') {
      await this.handleEvent(message as GatewayEvent, connectResolve, connectReject, connectionTimeout);
    } else if (message.type === 'res') {
      this.handleResponse(message as GatewayResponse, connectResolve, connectReject, connectionTimeout);
    }
  }

  private async handleEvent(
    event: GatewayEvent,
    connectResolve?: (value: void) => void,
    connectReject?: (error: Error) => void,
    connectionTimeout?: NodeJS.Timeout
  ): Promise<void> {
    if (event.event === 'connect.challenge') {
      // Received challenge, send connect request
      const challenge = event.payload as ConnectChallenge;
      console.log('Received challenge, authenticating...');

      const connectParams = this.deviceService.signGatewayChallenge(
        this.instanceId,
        challenge.nonce
      );

      this.send({
        type: 'req',
        id: 'connect',
        method: 'connect',
        params: connectParams,
      });
    } else if (event.event === 'connect.approved') {
      // Device was paired/approved
      console.log('Device pairing approved');
      this.emit('pairing-approved');
    } else {
      // Forward other events
      this.emit('gateway-event', event);
    }
  }

  private handleResponse(
    response: GatewayResponse,
    connectResolve?: (value: void) => void,
    connectReject?: (error: Error) => void,
    connectionTimeout?: NodeJS.Timeout
  ): void {
    // Handle connect response specially
    if (response.id === 'connect') {
      if (connectionTimeout) clearTimeout(connectionTimeout);

      if (response.ok) {
        const result = response.payload as ConnectResult;
        console.log('Connected to Gateway:', result.gateway.version);

        // Save the device token
        if (result.auth.deviceToken) {
          this.deviceService.saveDeviceToken(this.instanceId, result.auth.deviceToken);
        }

        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        connectResolve?.();
      } else {
        const error = response.error;
        console.error('Connection failed:', error?.message);

        if (error?.code === 'PAIRING_REQUIRED') {
          console.log('Device pairing required - approve in OpenClaw');
          const identity = this.deviceService.getOrCreate(this.instanceId);
          this.emit('pairing-required', identity.id);
          // Keep connection open for pairing approval
        } else {
          connectReject?.(new Error(error?.message || 'Connection failed'));
        }
      }
      return;
    }

    // Handle other responses
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);

      if (response.ok) {
        pending.resolve(response.payload);
      } else {
        pending.reject(new Error(response.error?.message || 'Request failed'));
      }
    }
  }

  private handleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    setTimeout(() => {
      this.connect().catch((err) => {
        console.error('Reconnection failed:', err.message);
      });
    }, delay);
  }

  private send(message: GatewayRequest | GatewayResponse): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Gateway');
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a request to the Gateway and wait for response
   */
  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeout?: number; idempotencyKey?: string }
  ): Promise<T> {
    if (!this.connected) {
      throw new Error('Not connected to Gateway');
    }

    const id = options?.idempotencyKey || crypto.randomUUID();
    const timeout = options?.timeout || 30000;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutId,
      });

      this.send({
        type: 'req',
        id,
        method,
        params,
      });
    });
  }
}
