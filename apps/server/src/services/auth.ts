import crypto from 'crypto';
import { StorageService } from './storage.js';
import type { User, UserRole } from '@openclaw-dashboard/shared';

const SCRYPT_KEYLEN = 64;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  organizationId?: string;
}

interface TokenPayload extends AuthContext {
  iat: number;
  exp: number;
}

export class AuthService {
  constructor(
    private storage: StorageService,
    private tokenSecret: string
  ) {
    if (!tokenSecret || tokenSecret.length < 16) {
      throw new Error('AUTH_SECRET must be at least 16 characters');
    }
  }

  async hashPassword(plain: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    const derived = await this.scrypt(plain, salt);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  async verifyPassword(plain: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const derived = await this.scrypt(plain, salt);
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }

  issueToken(user: User): string {
    const now = Date.now();
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      iat: now,
      exp: now + TOKEN_TTL_MS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = this.sign(body);
    return `${body}.${sig}`;
  }

  verifyToken(token: string): AuthContext | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    if (this.sign(body) !== sig) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
      if (Date.now() > payload.exp) return null;
      return {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
      };
    } catch {
      return null;
    }
  }

  async login(email: string, password: string): Promise<{ user: User; token: string } | null> {
    const record = this.storage.getUserByEmail(email);
    if (!record) return null;
    const ok = await this.verifyPassword(password, record.passwordHash);
    if (!ok) return null;

    this.storage.updateUser(record.id, { lastLoginAt: Date.now() });
    const user = this.storage.getUser(record.id)!;
    return { user, token: this.issueToken(user) };
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.tokenSecret).update(body).digest('base64url');
  }

  private scrypt(plain: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(plain, salt, SCRYPT_KEYLEN, (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      });
    });
  }
}
