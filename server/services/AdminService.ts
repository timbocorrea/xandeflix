import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase';

export interface UserRecord {
  id: string;
  name: string; // Client Name
  username: string; // Access ID
  password?: string;
  playlistUrl: string;
  isBlocked: boolean;
  role?: string;
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
      this.users = [];
      console.log('[ADMIN] No users file found. Starting with an empty user list.');
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
    try {
      const { data, error } = await supabase
        .from('xandeflix_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data && data.length > 0) {
        return data.map((u: any) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          password: u.password,
          playlistUrl: u.playlist_url,
          isBlocked: u.is_blocked,
          role: u.role,
          lastAccess: u.last_access
        })) as UserRecord[];
      }
    } catch (err) {
      console.warn('[ADMIN] Supabase error (listing users), falling back to local file:', err);
    }
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
    const adminSecret = process.env.ADMIN_SECRET_KEY;
    
    // Legacy Admin Check (for backward compatibility if needed)
    if (identifier === 'admin' && adminSecret && token === adminSecret) {
      console.log('[AUTH] Admin authenticated successfully via Secret Key');
      return { type: 'admin' };
    }

    try {
      const { data: user, error } = await supabase
        .from('xandeflix_users')
        .select('*')
        .eq('username', identifier)
        .eq('password', token)
        .single();

      if (user && !user.is_blocked) {
        // Atualiza último acesso
        await supabase
          .from('xandeflix_users')
          .update({ last_access: new Date().toISOString() })
          .eq('id', user.id);

        console.log(`[AUTH] User authenticated via Supabase: ${user.name} (${user.id}) as ${user.role || 'user'}`);
        return { 
          type: user.role === 'admin' ? 'admin' : 'user', 
          data: {
            id: user.id,
            name: user.name,
            username: user.username,
            playlistUrl: user.playlist_url,
            isBlocked: user.is_blocked,
            role: user.role,
            lastAccess: user.last_access
          }
        };
      }
    } catch (err) {
      console.warn('[AUTH] Supabase check failed, checking local storage...', err);
    }

    // Fallback to local users.json
    const user = this.users.find(u => 
      (u.id === identifier || u.username === identifier) && 
      (!u.password || u.password === token) &&
      !u.isBlocked
    );
    
    if (user) {
      user.lastAccess = new Date().toISOString();
      this.saveUsers();
      console.log(`[AUTH] User authenticated via Local JSON: ${user.name} (${user.id})`);
      return { type: 'user', data: user };
    }

    console.warn(`[AUTH] Failed login attempt for: ${identifier}`);
    return null;
  }
}
