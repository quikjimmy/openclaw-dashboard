import { StorageService } from './storage.js';
import { generateDeviceIdentity, signChallenge, DeviceIdentity } from './crypto.js';

export interface InstanceDeviceIdentity extends DeviceIdentity {
  deviceToken: string | null;
}

/**
 * Per-instance device identity service.
 *
 * Each OpenClaw instance has its own Ed25519 key pair and paired device token,
 * persisted on the instances table. The service lazily generates keys when an
 * instance is first connected.
 */
export class InstanceDeviceService {
  constructor(private storage: StorageService) {}

  getOrCreate(instanceId: string): InstanceDeviceIdentity {
    const existing = this.storage.getInstanceCredentials(instanceId);
    if (existing && existing.privateKey && existing.publicKey) {
      const instance = this.storage.getInstance(instanceId);
      return {
        id: instance?.deviceId || this.deriveDeviceId(existing.publicKey),
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        deviceToken: existing.deviceToken,
      };
    }

    const fresh = generateDeviceIdentity();
    this.storage.updateInstance(instanceId, {
      deviceId: fresh.id,
      privateKey: fresh.privateKey,
      publicKey: fresh.publicKey,
    });

    return { ...fresh, deviceToken: null };
  }

  saveDeviceToken(instanceId: string, token: string): void {
    this.storage.updateInstance(instanceId, { deviceToken: token });
  }

  signGatewayChallenge(
    instanceId: string,
    nonce: string
  ): {
    device: {
      id: string;
      publicKey: string;
      signature: string;
      signedAt: number;
      nonce: string;
    };
    clientId: string;
    scopes: string[];
    token?: string;
  } {
    const identity = this.getOrCreate(instanceId);
    const clientId = `dashboard-${identity.id.slice(0, 8)}`;
    const signedAt = Date.now();
    const scopes = ['*'];
    const token = identity.deviceToken ?? undefined;

    const signature = signChallenge(identity.privateKey, {
      deviceId: identity.id,
      clientId,
      role: 'operator',
      scopes,
      signedAt,
      token,
      nonce,
    });

    return {
      device: {
        id: identity.id,
        publicKey: identity.publicKey,
        signature,
        signedAt,
        nonce,
      },
      clientId,
      scopes,
      token,
    };
  }

  private deriveDeviceId(publicKeyBase64: string): string {
    const { createHash } = require('crypto') as typeof import('crypto');
    const publicKeyBytes = Buffer.from(publicKeyBase64, 'base64');
    return createHash('sha256').update(publicKeyBytes).digest('hex');
  }
}
