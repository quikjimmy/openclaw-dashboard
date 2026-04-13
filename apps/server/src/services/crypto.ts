import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// Enable synchronous methods
ed.etc.sha512Sync = (...m) => {
  const { sha512 } = require('@noble/hashes/sha512');
  return sha512(ed.etc.concatBytes(...m));
};

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface DeviceIdentity {
  id: string;
  publicKey: string;
  privateKey: string;
}

/**
 * Generate a new Ed25519 key pair
 */
export function generateKeyPair(): KeyPair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/**
 * Generate a device identity from a key pair
 * Device ID is SHA-256 hash of the public key
 */
export function generateDeviceIdentity(): DeviceIdentity {
  const { publicKey, privateKey } = generateKeyPair();
  const id = bytesToHex(sha256(publicKey));

  return {
    id,
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}

/**
 * Sign a challenge payload using the v3 protocol format
 */
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

  // v3 payload format: v3|deviceId|clientId|mode|role|scopes|ts|token|nonce
  const payloadStr = [
    'v3',
    payload.deviceId,
    payload.clientId,
    'operator', // clientMode
    payload.role,
    payload.scopes.join(','),
    payload.signedAt.toString(),
    payload.token || '',
    payload.nonce,
  ].join('|');

  const messageBytes = new TextEncoder().encode(payloadStr);
  const signature = ed.sign(messageBytes, privateKey);

  return Buffer.from(signature).toString('base64');
}

/**
 * Verify a signature
 */
export function verifySignature(
  publicKeyBase64: string,
  message: string,
  signatureBase64: string
): boolean {
  try {
    const publicKey = Buffer.from(publicKeyBase64, 'base64');
    const signature = Buffer.from(signatureBase64, 'base64');
    const messageBytes = new TextEncoder().encode(message);
    return ed.verify(signature, messageBytes, publicKey);
  } catch {
    return false;
  }
}
