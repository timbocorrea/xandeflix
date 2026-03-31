import bcrypt from 'bcryptjs';
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
  hiddenCategories?: string[];
  categoryOverrides?: Record<string, string>;
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
  hidden_categories?: string[] | null;
  category_overrides?: Record<string, string> | null;
}

const USERS_FILE = path.join(process.cwd(), 'users.json');
const COMPILED_SERVER_MARKER = `${path.sep}dist${path.sep}server${path.sep}`;
const IS_COMPILED_SERVER_RUNTIME = (process.argv[1] || '').includes(COMPILED_SERVER_MARKER);

export class AdminService {
  private static users: UserRecord[] = [];
  private static initialized = false;

  private static isHash(password: string): boolean {
    return password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$');
  }

  private static hashPassword(password: string): string {
    return this.isHash(password) ? password : bcrypt.hashSync(password, 10);
  }

  private static async verifyPassword(plain: string, stored: string): Promise<boolean> {
    if (!stored) return false;
    if (this.isHash(stored)) {
      try {
        return await bcrypt.compare(plain, stored);
      } catch (e) {
        return false;
      }
    }
    // Fallback for legacy plain text passwords during transition
    return plain === stored;
  }

  private static isProductionRuntime(): boolean {
    return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) || IS_COMPILED_SERVER_RUNTIME;
  }

  private static canFallbackToLocal(): boolean {
    return !this.isProductionRuntime();
  }

  private static createPersistenceError(action: string, cause?: unknown): Error {
    const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
    const suffix = detail ? ` Detalhe: ${detail}` : '';

    return new Error(
      `${action} exige persistencia no Supabase neste ambiente. Configure o backend com acesso de escrita ao banco.${suffix}`,
    );
  }

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
      hiddenCategories: user.hidden_categories || [],
      categoryOverrides: user.category_overrides || {},
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

  private static migrateLegacyLocalPasswords(): number {
    let migratedCount = 0;

    this.users = this.users.map((user) => {
      if (!user.password || this.isHash(user.password)) {
        return user;
      }

      migratedCount += 1;
      return {
        ...user,
        password: this.hashPassword(user.password),
      };
    });

    return migratedCount;
  }

  private static mergeUsers(primaryUsers: UserRecord[], secondaryUsers: UserRecord[]): UserRecord[] {
    const merged: UserRecord[] = [];
    const seenKeys = new Set<string>();

    // Inherit missing optional fields from secondary users before deduplicating
    for (const pUser of primaryUsers) {
      const pUsername = this.normalizeIdentifier(pUser.username || pUser.id);
      const sUser = secondaryUsers.find(s => s.id === pUser.id || this.normalizeIdentifier(s.username || s.id) === pUsername);
      if (sUser) {
        if (!pUser.hiddenCategories || pUser.hiddenCategories.length === 0) {
          pUser.hiddenCategories = sUser.hiddenCategories;
        }
        if (!pUser.categoryOverrides || Object.keys(pUser.categoryOverrides).length === 0) {
          pUser.categoryOverrides = sUser.categoryOverrides;
        }
      }
    }

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
      throw new Error('Supabase indisponivel');
    }

    const { data, error } = await supabase
      .from('xandeflix_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []).map((user) => this.mapSupabaseUser(user as SupabaseUserRow));
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
    const migratedLocalPasswords = this.migrateLegacyLocalPasswords();
    if (migratedLocalPasswords > 0) {
      this.saveUsers();
      console.log(`[ADMIN] Migrated ${migratedLocalPasswords} local user password(s) to bcrypt.`);
    }
    this.initialized = true;

    // Fire-and-forget sync: push local-only users to Supabase
    this.syncLocalUsersToSupabase().catch((err) => {
      console.warn('[ADMIN] Background sync to Supabase failed:', err);
    });

    this.migrateLegacySupabasePasswords().catch((err) => {
      console.warn('[ADMIN] Background Supabase password migration failed:', err);
    });
  }

  private static async migrateLegacySupabasePasswords(): Promise<void> {
    if (!supabase) {
      console.log('[SYNC] Supabase not available, skipping password migration.');
      return;
    }

    try {
      const supabaseUsers = await this.listSupabaseUsers();
      const legacyUsers = supabaseUsers.filter((user) => user.password && !this.isHash(user.password));

      if (legacyUsers.length === 0) {
        console.log('[SYNC] No legacy Supabase passwords to migrate.');
        return;
      }

      console.log(`[SYNC] Migrating ${legacyUsers.length} legacy Supabase password(s) to bcrypt...`);

      for (const user of legacyUsers) {
        const { error } = await supabase
          .from('xandeflix_users')
          .update({ password: this.hashPassword(user.password || '') })
          .eq('id', user.id);

        if (error) {
          console.warn(`[SYNC] Error migrating password for "${user.username}":`, error.message);
          continue;
        }

        console.log(`[SYNC] Migrated Supabase password for "${user.username}".`);
      }
    } catch (err: any) {
      console.warn('[SYNC] Unable to migrate legacy Supabase passwords:', err.message || err);
    }
  }

  /**
   * Syncs local-only users (those with non-UUID IDs like usr_xxx) to Supabase.
   * - If the user already exists in Supabase (by username), updates the local ID to match.
   * - If the user doesn't exist in Supabase, creates them there.
   */
  private static async syncLocalUsersToSupabase(): Promise<void> {
    if (!supabase) {
      console.log('[SYNC] Supabase not available, skipping sync.');
      return;
    }

    const localOnlyUsers = this.users.filter((u) => !this.isUuid(u.id));
    if (localOnlyUsers.length === 0) {
      console.log('[SYNC] No local-only users to sync.');
      return;
    }

    console.log(`[SYNC] Found ${localOnlyUsers.length} local-only user(s). Syncing to Supabase...`);

    for (const localUser of localOnlyUsers) {
      try {
        // Check if user already exists in Supabase by username
        const { data: existing, error: findError } = await supabase
          .from('xandeflix_users')
          .select('*')
          .ilike('username', this.normalizeIdentifier(localUser.username))
          .maybeSingle();

        if (findError) {
          console.warn(`[SYNC] Error checking user "${localUser.username}":`, findError.message);
          continue;
        }

        if (existing) {
          // User exists in Supabase — update local record with Supabase UUID
          const oldId = localUser.id;
          const mapped = this.mapSupabaseUser(existing as SupabaseUserRow);
          
          // Update the playlist URL in Supabase if the local one is newer/different
          if (localUser.playlistUrl && localUser.playlistUrl !== mapped.playlistUrl) {
            await supabase
              .from('xandeflix_users')
              .update({ playlist_url: localUser.playlistUrl })
              .eq('id', existing.id);
            console.log(`[SYNC] Updated playlist URL in Supabase for "${localUser.username}".`);
          }

          if (localUser.password && (!mapped.password || !this.isHash(mapped.password))) {
            await supabase
              .from('xandeflix_users')
              .update({ password: this.hashPassword(localUser.password) })
              .eq('id', existing.id);
            console.log(`[SYNC] Updated password hash in Supabase for "${localUser.username}".`);
          }

          localUser.id = existing.id;
          console.log(`[SYNC] Linked local user "${localUser.username}" (${oldId}) → Supabase (${existing.id})`);
        } else {
          // User doesn't exist in Supabase — insert
          const passwordToSync = localUser.password || '123';
          const { data: inserted, error: insertError } = await supabase
            .from('xandeflix_users')
            .insert({
              name: localUser.name,
              username: localUser.username,
              password: this.hashPassword(passwordToSync),
              playlist_url: localUser.playlistUrl,
              is_blocked: localUser.isBlocked,
              role: localUser.role || 'user',
            })
            .select('*')
            .maybeSingle();

          if (insertError) {
            console.warn(`[SYNC] Error inserting user "${localUser.username}":`, insertError.message);
            continue;
          }

          if (inserted) {
            const oldId = localUser.id;
            localUser.id = inserted.id;
            console.log(`[SYNC] Created user "${localUser.username}" in Supabase (${oldId} → ${inserted.id})`);
          }
        }
      } catch (err: any) {
        console.warn(`[SYNC] Unexpected error syncing user "${localUser.username}":`, err.message);
      }
    }

    // Save updated local file with new Supabase UUIDs
    this.saveUsers();
    console.log('[SYNC] Local users.json updated with Supabase UUIDs.');
  }

  public static async listUsers(): Promise<UserRecord[]> {
    this.initialize();

    if (!supabase) {
      if (this.canFallbackToLocal()) {
        return this.users.map((user) => ({ ...user }));
      }

      throw this.createPersistenceError('Listar usuarios');
    }

    const supabaseUsers = await this.listSupabaseUsers();
    if (supabaseUsers.length === 0 && this.canFallbackToLocal()) {
      return this.users.map((user) => ({ ...user }));
    }

    return this.canFallbackToLocal()
      ? this.mergeUsers(supabaseUsers, this.users)
      : supabaseUsers;
  }

  public static async getUserById(userId: string): Promise<UserRecord | null> {
    this.initialize();

    const supabaseUser = await this.findSupabaseUserById(userId);
    if (supabaseUser) {
      if (this.canFallbackToLocal()) {
        const localUser = this.findLocalUserById(userId);
        if (localUser) {
           if (!supabaseUser.hiddenCategories || supabaseUser.hiddenCategories.length === 0) {
             supabaseUser.hiddenCategories = localUser.hiddenCategories;
           }
           if (!supabaseUser.categoryOverrides || Object.keys(supabaseUser.categoryOverrides).length === 0) {
             supabaseUser.categoryOverrides = localUser.categoryOverrides;
           }
        }
      }
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
        if (!this.canFallbackToLocal()) {
          throw this.createPersistenceError(`Atualizar status do usuario ${userId}`, err);
        }

        console.warn(`[ADMIN] Supabase error (toggle status for ${userId}), falling back to local file:`, err);
      }
    }

    if (!this.canFallbackToLocal()) {
      throw this.createPersistenceError(`Atualizar status do usuario ${userId}`);
    }

    const userIndex = this.users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return false;
    }

    this.users[userIndex].isBlocked = blocked;
    this.saveUsers();
    console.log(`[ADMIN] Local user status updated for ${userId}: ${blocked ? 'BLOCKED' : 'ACTIVE'}`);

    return true;
  }

  public static async updateHiddenCategories(userId: string, categories: string[]): Promise<boolean> {
    this.initialize();

    if (this.isUuid(userId)) {
      try {
        if (!supabase) throw new Error('Supabase indisponível');

        // We try updating the column. If it fails due to missing column, we catch it.
        const { data, error } = await supabase
          .from('xandeflix_users')
          .update({ hidden_categories: categories })
          .eq('id', userId)
          .select('*')
          .maybeSingle();

        if (error) throw error;

        if (data) {
          this.syncLocalUser(userId, { hiddenCategories: categories });
          console.log(`[ADMIN] User hidden categories updated in Supabase for ${userId}. Count: ${categories.length}`);
          return true;
        }
      } catch (err: any) {
        console.error(`[ADMIN] Warning: Could not update hidden_categories in Supabase for ${userId}. (Means column doesn't exist):`, err.message);
        if (!this.canFallbackToLocal()) throw err;
      }
    }

    const localIndex = this.users.findIndex((u) => u.id === userId);
    if (localIndex !== -1) {
      this.users[localIndex].hiddenCategories = categories;
      this.saveUsers();
      console.log(`[ADMIN] User hidden categories updated locally for ${userId}`);
      return true;
    }

    return false;
  }

  public static async updateCategoryOverrides(userId: string, overrides: Record<string, string>): Promise<boolean> {
    this.initialize();

    if (this.isUuid(userId)) {
      try {
        if (!supabase) throw new Error('Supabase indisponível');

        const { data, error } = await supabase
          .from('xandeflix_users')
          .update({ category_overrides: overrides })
          .eq('id', userId)
          .select('*')
          .maybeSingle();

        if (error) throw error;

        if (data) {
          this.syncLocalUser(userId, { categoryOverrides: overrides });
          console.log(`[ADMIN] User category overrides updated in Supabase for ${userId}. Count: ${Object.keys(overrides).length}`);
          return true;
        }
      } catch (err: any) {
        console.error(`[ADMIN] Warning: Could not update category_overrides in Supabase for ${userId} (probably column missing):`, err.message);
        if (!this.canFallbackToLocal()) throw err;
      }
    }

    const localIndex = this.users.findIndex((u) => u.id === userId);
    if (localIndex !== -1) {
      this.users[localIndex].categoryOverrides = overrides;
      this.saveUsers();
      console.log(`[ADMIN] User category overrides updated locally for ${userId}`);
      return true;
    }

    return false;
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
            ...(data.password !== undefined ? { password: this.hashPassword(data.password) } : {}),
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
          this.syncLocalUser(userId, { 
            ...data, 
            playlistUrl: trimmedPlaylistUrl,
            password: data.password ? this.hashPassword(data.password) : undefined 
          });
          console.log(`[ADMIN] User updated in Supabase for ${userId}`);
          return true;
        }
      } catch (err) {
        if (!this.canFallbackToLocal()) {
          throw this.createPersistenceError(`Atualizar usuario ${userId}`, err);
        }

        console.warn(`[ADMIN] Supabase error (updating user ${userId}), falling back to local file:`, err);
      }
    }

    if (!this.canFallbackToLocal()) {
      throw this.createPersistenceError(`Atualizar usuario ${userId}`);
    }

    const userIndex = this.users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return false;
    }

    this.users[userIndex] = {
      ...this.users[userIndex],
      ...data,
      password: data.password ? this.hashPassword(data.password) : this.users[userIndex].password,
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
      password: this.hashPassword(password || '123'),
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
      if (!this.canFallbackToLocal()) {
        throw this.createPersistenceError(`Criar usuario ${newUser.username}`, err);
      }

      console.warn(`[ADMIN] Supabase error (creating user ${newUser.username}), falling back to local file:`, err);
    }

    if (!this.canFallbackToLocal()) {
      throw this.createPersistenceError(`Criar usuario ${newUser.username}`);
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
        if (!this.canFallbackToLocal()) {
          throw this.createPersistenceError(`Excluir usuario ${userId}`, err);
        }

        console.warn(`[ADMIN] Supabase error (deleting user ${userId}), falling back to local file:`, err);
      }
    }

    if (!this.canFallbackToLocal()) {
      throw this.createPersistenceError(`Excluir usuario ${userId}`);
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

    // Admin via env variables
    if (normalizedIdentifier === adminUsername && token && adminPasswords.includes(token)) {
      console.log('[AUTH] Admin authenticated successfully via environment credentials');
      return { type: 'admin' };
    }

    // Try Supabase first
    try {
      if (!supabase) {
        throw new Error('Supabase indisponível');
      }

      const { data: user, error } = await supabase
        .from('xandeflix_users')
        .select('*')
        .ilike('username', normalizedIdentifier)
        .maybeSingle();

      if (!error && user && !user.is_blocked) {
        const isMatch = await this.verifyPassword(token || '', user.password || '');
        if (isMatch) {
          const now = new Date().toISOString();

          await supabase
            .from('xandeflix_users')
            .update({ last_access: now })
            .eq('id', user.id);

          const mappedUser = this.mapSupabaseUser({
            ...(user as SupabaseUserRow),
            last_access: now,
          });

          if (this.canFallbackToLocal()) {
            const localFallback = this.findLocalUserById(mappedUser.id);
            if (localFallback) {
              if (!mappedUser.hiddenCategories || mappedUser.hiddenCategories.length === 0) {
                mappedUser.hiddenCategories = localFallback.hiddenCategories;
              }
              if (!mappedUser.categoryOverrides || Object.keys(mappedUser.categoryOverrides).length === 0) {
                mappedUser.categoryOverrides = localFallback.categoryOverrides;
              }
            }
          }

          console.log(`[AUTH] User authenticated via Supabase: ${mappedUser.name} (${mappedUser.id})`);
          return {
            type: mappedUser.role === 'admin' ? 'admin' : 'user',
            data: mappedUser,
          };
        }
      }
    } catch (err: any) {
      console.error('[AUTH] Supabase authentication error:', err.message);
    }

    // Try Local fallback
    const localUserMatch = this.users.find(u => this.normalizeIdentifier(u.username) === normalizedIdentifier);
    if (localUserMatch && !localUserMatch.isBlocked) {
      const isMatch = await this.verifyPassword(token || '', localUserMatch.password || '');
      if (isMatch) {
        localUserMatch.lastAccess = new Date().toISOString();
        this.saveUsers();
        console.log(`[AUTH] User authenticated via Local JSON: ${localUserMatch.name}`);
        return {
          type: localUserMatch.role === 'admin' ? 'admin' : 'user',
          data: { ...localUserMatch },
        };
      }
    }

    console.warn(`[AUTH] Failed login attempt for: ${identifier}`);
    return null;
  }
}
