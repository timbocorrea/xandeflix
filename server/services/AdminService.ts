export interface UserRecord {
  id: string;
  name: string;
  playlistUrl: string;
  isBlocked: boolean;
  lastAccess?: string;
}

export class AdminService {
  // In-memory user store for demo/initial phase
  private static users: UserRecord[] = [
    { 
      id: 'usr_001', 
      name: 'Alexandre', 
      playlistUrl: process.env.PLAYLIST_URL || '', 
      isBlocked: false,
      lastAccess: new Date().toISOString()
    }
  ];

  /**
   * Retrieves all registered users
   */
  public static async listUsers(): Promise<UserRecord[]> {
    console.log('[ADMIN] Listing users...');
    return this.users;
  }

  /**
   * Toggles the blocked status for a specific user
   */
  public static async toggleUserStatus(userId: string, blocked: boolean): Promise<boolean> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      this.users[userIndex].isBlocked = blocked;
      console.log(`[ADMIN] User status updated for ${userId}: ${blocked ? 'BLOCKED' : 'ACTIVE'}`);
      return true;
    }
    return false;
  }

  /**
   * Updates the global or per-user M3U playlist URL
   */
  public static async updateUserPlaylist(userId: string, newUrl: string): Promise<boolean> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      this.users[userIndex].playlistUrl = newUrl;
      console.log(`[ADMIN] User playlist updated for ${userId}: ${newUrl.substring(0, 50)}...`);
      return true;
    }
    return false;
  }

  /**
   * Adds a new user to the managed list
   */
  public static async addUser(name: string, playlistUrl: string): Promise<UserRecord> {
    const newUser: UserRecord = {
      id: `usr_${Math.random().toString(36).substring(2, 9)}`,
      name,
      playlistUrl,
      isBlocked: false
    };
    this.users.push(newUser);
    return newUser;
  }

  /**
   * Deletes a user access
   */
  public static async deleteUser(userId: string): Promise<boolean> {
    const initialLength = this.users.length;
    this.users = this.users.filter(u => u.id !== userId);
    return this.users.length < initialLength;
  }
}
