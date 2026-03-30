import fs from 'fs';
import path from 'path';
import { supabase } from '../lib/supabase.js';

export interface UserRecord {
  id: string;
  name: string;
  username: string;
  password?: string;
  playlistUrl: string;
  isBlocked: boolean;
  role?: string;
  lastAccess?: string;
}

interface SupabaseUserRow {
  id: string;
  name: string;
  username: string;
  password?: string;
  playlist_url?: string | null;
  is_blocked: boolean;
  role?: string | null;
  last_access?: string | null;
  created_at?: string | null;
}

const USERS_FILE = path.join(process.cwd(), 'users.json');

export class AdminService {
  private static users: UserRecord[] = [];
  private static initialized = false;

  private static normalizeIdentifier(value: string): string {
    return value.trim().toLowerCase();
  }

  private static isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private static mapSupabaseUser(user: SupabaseUserRow): UserRecord {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      password: user.password,
      playlistUrl: user.playlist_url || '',
      isBlocked: user.is_blocked,
      role: user.role || 'user',
      lastAccess: user.last_access || undefined,
    };
  }

  private static loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
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

  private static mergeUsers(primaryUsers: UserRecord[], secondaryUsers: UserRecord[]): UserRecord[] {
    const merged: UserRecord[] = [];
    const seenKeys = new Set<string>();

    for (const user of [...primaryUsers, ...secondaryUsers]) {
      const usernameKey = this.normalizeIdentifier(user.username || user.id);
      const idKey = user.id;

      if (seenKeys.has(idKey) || seenKeys.has(usernameKey)) {
        continue;
      }

      merged.push({ ...user });
      seenKeys.add(idKey);
      seenKeys.add(usernameKey);
    }

    return merged;
  }

  private static async listSupabaseUsers(): Promise<UserRecord[]> {
    if (!supabase) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('xandeflix_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []).map((user) => this.mapSupabaseUser(user as SupabaseUserRow));
    } catch (err) {
      console.warn('[ADMIN] Supabase error (listing users), falling back to local file:', err);
      return [];
    }
  }

  private static async findSupabaseUserById(userId: string): Promise<UserRecord | null> {
    if (!this.isUuid(userId)) {
      return null;
    }
    if (!supabase) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('xandeflix_users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? this.mapSupabaseUser(data as SupabaseUserRow) : null;
    } catch (err) {
      console.warn(`[ADMIN] Supabase error (finding user ${userId}), falling back to local file:`, err);
      return null;
    }
  }

  private static findLocalUserById(userId: string): UserRecord | null {
    return this.users.find((user) => user.id === userId) || null;
  }

  private static findLocalUserByIdentifier(identifier: string, token?: string): UserRecord | null {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);

    return (
      this.users.find((user) => {
        const matchesIdentifier =
          this.normalizeIdentifier(user.id) === normalizedIdentifier ||
          this.normalizeIdentifier(user.username) === normalizedIdentifier;

        return matchesIdentifier && (!user.password || user.password === token);
      }) || null
    );
  }

  private static syncLocalUser(userId: string, data: Partial<UserRecord>): void {
    const index = this.users.findIndex((user) => user.id === userId);
    if (index === -1) {
      return;
    }

    this.users[index] = {
      ...this.users[index],
      ...data,
      playlistUrl: data.playlistUrl !== undefined ? data.playlistUrl.trim() : this.users[index].playlistUrl,
    };
    this.saveUsers();
  }

  public static initialize() {
    if (this.initialized) {
      return;
    }

    this.loadUsers();
    this.initialized = true;
  }

  public static async listUsers(): Promise<UserRecord[]> {
    this.initialize();

    const supabaseUsers = await this.listSupabaseUsers();
    if (supabaseUsers.length === 0) {
      return this.users.map((user) => ({ ...user }));
    }

    return this.mergeUsers(supabaseUsers, this.users);
  }

  public static async getUserById(userId: string): Promise<UserRecord | null> {
    this.initialize();

    const supabaseUser = await this.findSupabaseUserById(userId);
    if (supabaseUser) {
      return supabaseUser;
    }

    return this.findLocalUserById(userId);
  }

  public static async toggleUserStatus(userId: string, blocked: boolean): Promise<boolean> {
    this.initialize();

    if (this.isUuid(userId)) {
      try {
        if (!supabase) {
          throw new Error('Supabase indisponível');
        }

        const { data, error } = await supabase
          .from('xandeflix_users')
          .update({ is_blocked: blocked })
          .eq('id', userId)
          .select('*')
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data) {
          this.syncLocalUser(userId, { isBlocked: blocked });
          console.log(`[ADMIN] User status updated in Supabase for ${userId}: ${blocked ? 'BLOCKED' : 'ACTIVE'}`);
          return true;
        }
      } catch (err) {
        console.warn(`[ADMIN] Supabase error (toggle status for ${userId}), falling back to local file:`, err);
      }
    }

    const userIndex = this.users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return false;
    }

    this.users[userIndex].isBlocked = blocked;
    this.saveUsers();
    console.log(`[ADMIN] User status updated locally for ${userId}: ${blocked ? 'BLOCKED' : 'ACTIVE'}`);
    return true;
  }

  public static async updateUser(userId: string, data: Partial<UserRecord>): Promise<boolean> {
    this.initialize();

    const trimmedPlaylistUrl = data.playlistUrl?.trim();

    if (this.isUuid(userId)) {
      try {
        if (!supabase) {
          throw new Error('Supabase indisponível');
        }

        const { data: updatedUser, error } = await supabase
          .from('xandeflix_users')
          .update({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.username !== undefined ? { username: data.username } : {}),
            ...(data.password !== undefined ? { password: data.password } : {}),
            ...(trimmedPlaylistUrl !== undefined ? { playlist_url: trimmedPlaylistUrl } : {}),
            ...(data.isBlocked !== undefined ? { is_blocked: data.isBlocked } : {}),
          })
          .eq('id', userId)
          .select('*')
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (updatedUser) {
          this.syncLocalUser(userId, { ...data, playlistUrl: trimmedPlaylistUrl });
          console.log(`[ADMIN] User updated in Supabase for ${userId}`);
          return true;
        }
      } catch (err) {
        console.warn(`[ADMIN] Supabase error (updating user ${userId}), falling back to local file:`, err);
      }
    }

    const userIndex = this.users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return false;
    }

    this.users[userIndex] = {
      ...this.users[userIndex],
      ...data,
      playlistUrl: trimmedPlaylistUrl ?? this.users[userIndex].playlistUrl,
    };
    this.saveUsers();
    console.log(`[ADMIN] User updated locally for ${userId}`);
    return true;
  }

  public static async addUser(name: string, playlistUrl: string, username?: string, password?: string): Promise<UserRecord> {
    this.initialize();

    const trimmedPlaylistUrl = playlistUrl.trim();
    const newUser: UserRecord = {
      id: `usr_${Math.random().toString(36).substring(2, 9)}`,
      name,
      username: (username || name).trim(),
      password: password || '123',
      playlistUrl: trimmedPlaylistUrl,
      isBlocked: false,
      role: 'user',
    };

    try {
      if (!supabase) {
        throw new Error('Supabase indisponível');
      }

      const { data, error } = await supabase
        .from('xandeflix_users')
        .insert({
          name: newUser.name,
          username: newUser.username,
          password: newUser.password,
          playlist_url: newUser.playlistUrl,
          is_blocked: newUser.isBlocked,
          role: 'user',
        })
        .select('*')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        console.log(`[ADMIN] User created in Supabase for ${newUser.username}`);
        return this.mapSupabaseUser(data as SupabaseUserRow);
      }
    } catch (err) {
      console.warn(`[ADMIN] Supabase error (creating user ${newUser.username}), falling back to local file:`, err);
    }

    this.users.push(newUser);
    this.saveUsers();
    console.log(`[ADMIN] User created locally for ${newUser.username}`);
    return newUser;
  }

  public static async deleteUser(userId: string): Promise<boolean> {
    this.initialize();

    if (this.isUuid(userId)) {
      try {
        if (!supabase) {
          throw new Error('Supabase indisponível');
        }

        const { data, error } = await supabase
          .from('xandeflix_users')
          .delete()
          .eq('id', userId)
          .select('id')
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data) {
          this.users = this.users.filter((user) => user.id !== userId);
          this.saveUsers();
          console.log(`[ADMIN] User deleted from Supabase for ${userId}`);
          return true;
        }
      } catch (err) {
        console.warn(`[ADMIN] Supabase error (deleting user ${userId}), falling back to local file:`, err);
      }
    }

    const initialLength = this.users.length;
    this.users = this.users.filter((user) => user.id !== userId);
    this.saveUsers();
    return this.users.length < initialLength;
  }

  public static async authenticate(
    identifier: string,
    token?: string,
  ): Promise<{ type: 'admin' | 'user'; data?: UserRecord } | null> {
    this.initialize();

    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const adminUsername = this.normalizeIdentifier(process.env.ADMIN_USERNAME || 'admin');
    const adminPasswords = [process.env.ADMIN_PASSWORD, process.env.ADMIN_SECRET_KEY].filter(Boolean);

    if (normalizedIdentifier === adminUsername && token && adminPasswords.includes(token)) {
      console.log('[AUTH] Admin authenticated successfully via environment credentials');
      return { type: 'admin' };
    }

    try {
      if (!supabase) {
        throw new Error('Supabase indisponível');
      }

      const { data: user, error } = await supabase
        .from('xandeflix_users')
        .select('*')
        .ilike('username', normalizedIdentifier)
        .eq('password', token || '')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (user && !user.is_blocked) {
        const now = new Date().toISOString();

        await supabase
          .from('xandeflix_users')
          .update({ last_access: now })
          .eq('id', user.id);

        const mappedUser = this.mapSupabaseUser({
          ...(user as SupabaseUserRow),
          last_access: now,
        });

        console.log(`[AUTH] User authenticated via Supabase: ${mappedUser.name} (${mappedUser.id}) as ${mappedUser.role || 'user'}`);
        return {
          type: mappedUser.role === 'admin' ? 'admin' : 'user',
          data: mappedUser,
        };
      }
    } catch (err: any) {
      console.error('[AUTH] Supabase authentication error:', err.message);
    }

    const localUser = this.findLocalUserByIdentifier(identifier, token);
    if (localUser && !localUser.isBlocked) {
      localUser.lastAccess = new Date().toISOString();
      this.saveUsers();
      console.log(`[AUTH] User authenticated via Local JSON: ${localUser.name} (${localUser.id})`);
      return {
        type: localUser.role === 'admin' ? 'admin' : 'user',
        data: { ...localUser },
      };
    }

    console.warn(`[AUTH] Failed login attempt for: ${identifier}`);
    return null;
  }
}
