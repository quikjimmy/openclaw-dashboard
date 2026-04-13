import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex } from '@noble/hashes/utils';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface DeviceIdentity {
  id: string;
  publicKey: string; // base64
  privateKey: string; // base64
}

export function generateDeviceIdentity(): DeviceIdentity {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return {
    id: bytesToHex(sha256(publicKey)),
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}

export function signChallenge(
  privateKeyBase64: string,
  payload: {
    deviceId: string;
    clientId: string;
    role: 'operator' | 'node';
    scopes: string[];
    signedAt: number;
    token?: string;
    nonce: string;
  }
): string {
  const privateKey = Buffer.from(privateKeyBase64, 'base64');
  const payloadStr = [
    'v3',
    payload.deviceId,
    payload.clientId,
    'operator',
    payload.role,
    payload.scopes.join(','),
    payload.signedAt.toString(),
    payload.token || '',
    payload.nonce,
  ].join('|');
  const messageBytes = new TextEncoder().encode(payloadStr);
  return Buffer.from(ed.sign(messageBytes, privateKey)).toString('base64');
}
