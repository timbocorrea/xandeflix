import crypto from 'crypto';

export type SessionRole = 'admin' | 'user';

export interface AuthSession {
  token: string;
  role: SessionRole;
  userId?: string;
  createdAt: number;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface SessionPayload {
  role: SessionRole;
  userId?: string;
  createdAt: number;
  expiresAt: number;
}

export class AuthSessionService {
  private static ttlMs = Number(process.env.SESSION_TTL_MS || DEFAULT_TTL_MS);
  private static secret = process.env.SESSION_SECRET || process.env.ADMIN_SECRET_KEY || 'xandeflix-local-session-secret';

  private static toBase64Url(value: string): string {
    return Buffer.from(value, 'utf-8').toString('base64url');
  }

  private static fromBase64Url<T>(value: string): T {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf-8')) as T;
  }

  private static sign(payload: string): string {
    return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  public static issueSession(role: SessionRole, userId?: string): string {
    const now = Date.now();
    const payload: SessionPayload = {
      role,
      userId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    const encodedPayload = this.toBase64Url(JSON.stringify(payload));
    const signature = this.sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  public static getSession(token?: string | null): AuthSession | null {
    if (!token) return null;
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = this.sign(encodedPayload);
    const receivedSignature = Buffer.from(signature, 'utf-8');
    const calculatedSignature = Buffer.from(expectedSignature, 'utf-8');

    if (
      receivedSignature.length !== calculatedSignature.length ||
      !crypto.timingSafeEqual(receivedSignature, calculatedSignature)
    ) {
      return null;
    }

    try {
      const payload = this.fromBase64Url<SessionPayload>(encodedPayload);
      if (payload.expiresAt <= Date.now()) {
        return null;
      }

      return {
        token,
        role: payload.role,
        userId: payload.userId,
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt,
      };
    } catch {
      return null;
    }
  }

  public static revokeSession(token?: string | null): void {
    void token;
  }
}
