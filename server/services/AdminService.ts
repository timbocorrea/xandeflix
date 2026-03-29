import fs from 'fs';
import path from 'path';

export interface UserRecord {
  id: string;
  name: string; // Client Name
  username: string; // Access ID
  password?: string;
  playlistUrl: string;
  isBlocked: boolean;
  lastAccess?: string;
}

const USERS_FILE = path.join(process.cwd(), 'users.json');

export class AdminService {
  private static users: UserRecord[] = [];

  private static loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.users = parsed;
          console.log(`[ADMIN] Loaded ${this.users.length} users from file.`);
          return;
        }
      }
      // File doesn't exist or is empty → seed default user
      this.users = [
        { 
          id: 'usr_001', 
          name: 'Alexandre',
          username: 'Alexandre',
          password: '123',
          playlistUrl: process.env.PLAYLIST_URL || '', 
          isBlocked: false,
          lastAccess: new Date().toISOString()
        }
      ];
      this.saveUsers();
      console.log('[ADMIN] Created default user and saved to file.');
    } catch (err) {
      console.error('[ADMIN] Error loading users:', err);
      this.users = [];
    }
  }

  private static saveUsers() {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2));
    } catch (err) {
      console.error('[ADMIN] Error saving users:', err);
    }
  }

  // Auto-load on first call
  static {
    this.loadUsers();
  }

  public static async listUsers(): Promise<UserRecord[]> {
    return this.users;
  }

  public static async toggleUserStatus(userId: string, blocked: boolean): Promise<boolean> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      this.users[userIndex].isBlocked = blocked;
      this.saveUsers();
      console.log(`[ADMIN] User status updated for ${userId}: ${blocked ? 'BLOCKED' : 'ACTIVE'}`);
      return true;
    }
    return false;
  }

  public static async updateUser(userId: string, data: Partial<UserRecord>): Promise<boolean> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      if (data.playlistUrl) data.playlistUrl = data.playlistUrl.trim();
      this.users[userIndex] = { ...this.users[userIndex], ...data };
      this.saveUsers();
      console.log(`[ADMIN] User updated for ${userId}`);
      return true;
    }
    return false;
  }

  public static async addUser(name: string, playlistUrl: string, username?: string, password?: string): Promise<UserRecord> {
    const newUser: UserRecord = {
      id: `usr_${Math.random().toString(36).substring(2, 9)}`,
      name,
      username: username || name,
      password: password || '123',
      playlistUrl: playlistUrl.trim(),
      isBlocked: false
    };
    this.users.push(newUser);
    this.saveUsers();
    return newUser;
  }

  public static async deleteUser(userId: string): Promise<boolean> {
    const initialLength = this.users.length;
    this.users = this.users.filter(u => u.id !== userId);
    this.saveUsers();
    return this.users.length < initialLength;
  }

  public static async authenticate(identifier: string, token?: string): Promise<{ type: 'admin' | 'user'; data?: UserRecord } | null> {
    const adminSecret = process.env.ADMIN_SECRET_KEY || 'xandeflix-admin-2026';
    
    if (identifier === 'admin' && token === adminSecret) {
      console.log('[AUTH] Admin authenticated successfully');
      return { type: 'admin' };
    }

    const user = this.users.find(u => 
      (u.id === identifier || u.username === identifier) && 
      (!u.password || u.password === token) &&
      !u.isBlocked
    );
    
    if (user) {
      user.lastAccess = new Date().toISOString();
      this.saveUsers();
      console.log(`[AUTH] User authenticated: ${user.name} (${user.id})`);
      return { type: 'user', data: user };
    }

    console.warn(`[AUTH] Failed login attempt for: ${identifier}`);
    return null;
  }
}
