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

export class AuthSessionService {
  private static sessions = new Map<string, AuthSession>();
  private static ttlMs = Number(process.env.SESSION_TTL_MS || DEFAULT_TTL_MS);

  private static cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  public static issueSession(role: SessionRole, userId?: string): string {
    this.cleanupExpiredSessions();

    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    this.sessions.set(token, {
      token,
      role,
      userId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    });

    return token;
  }

  public static getSession(token?: string | null): AuthSession | null {
    if (!token) return null;

    this.cleanupExpiredSessions();
    const session = this.sessions.get(token);
    if (!session) return null;

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  public static revokeSession(token?: string | null): void {
    if (!token) return;
    this.sessions.delete(token);
  }
}
