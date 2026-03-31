import { create } from 'zustand';
import { Category, Media } from '../types';
import { supabase } from '../lib/supabase';

type PlaybackProgressEntry = {
  currentTime: number;
  duration: number;
  timestamp: number;
};

type PlaybackProgressMap = Record<string, PlaybackProgressEntry>;

const STORAGE_KEYS = {
  authRole: 'xandeflix_auth_role',
  adminMode: 'xandeflix_admin_mode',
  userId: 'xandeflix_user_id',
  hiddenCategories: 'xandeflix_hidden_categories',
  favorites: 'xandeflix_favorites',
  playbackProgress: 'xandeflix_playback_progress',
} as const;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJsonValue<T>(rawValue: string | null, fallbackValue: T): T {
  if (!rawValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallbackValue;
  }
}

function readStorageValue<T>(key: string, fallbackValue: T): T {
  const storage = getStorage();
  return storage ? readJsonValue(storage.getItem(key), fallbackValue) : fallbackValue;
}

function writeStorageValue<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

function getScopedStorageKey(baseKey: string, userId?: string): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const resolvedUserId = userId || storage.getItem(STORAGE_KEYS.userId) || 'guest';
  return `${baseKey}:${resolvedUserId}`;
}

function readScopedStorageValue<T>(baseKey: string, fallbackValue: T, userId?: string): T {
  const storage = getStorage();
  const scopedKey = getScopedStorageKey(baseKey, userId);

  if (!storage || !scopedKey) {
    return fallbackValue;
  }

  const scopedRawValue = storage.getItem(scopedKey);
  if (scopedRawValue !== null) {
    return readJsonValue(scopedRawValue, fallbackValue);
  }

  const legacyRawValue = storage.getItem(baseKey);
  if (legacyRawValue === null) {
    return fallbackValue;
  }

  const legacyValue = readJsonValue(legacyRawValue, fallbackValue);
  writeStorageValue(scopedKey, legacyValue);
  return legacyValue;
}

function writeScopedStorageValue<T>(baseKey: string, value: T, userId?: string): void {
  const scopedKey = getScopedStorageKey(baseKey, userId);
  if (!scopedKey) {
    return;
  }

  writeStorageValue(scopedKey, value);
}

function getInitialFavorites(): string[] {
  return readScopedStorageValue<string[]>(STORAGE_KEYS.favorites, []);
}

function getInitialPlaybackProgress(): PlaybackProgressMap {
  return readScopedStorageValue<PlaybackProgressMap>(STORAGE_KEYS.playbackProgress, {});
}

interface XandeflixState {
  allCategories: Category[];
  setAllCategories: (categories: Category[]) => void;

  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  selectedMedia: Media | null;
  setSelectedMedia: (media: Media | null) => void;
  isSettingsVisible: boolean;
  setIsSettingsVisible: (visible: boolean) => void;

  hiddenCategoryIds: string[];
  setHiddenCategoryIds: (ids: string[]) => void;

  isUsingMock: boolean;
  setIsUsingMock: (using: boolean) => void;

  playbackProgress: PlaybackProgressMap;
  setPlaybackProgress: (id: string, currentTime: number, duration: number) => void;
  syncProgressToSupabase: (userId: string, mediaId: string, currentTime: number, duration: number) => Promise<void>;

  isAdminMode: boolean;
  setIsAdminMode: (mode: boolean) => void;
  managedUsers: any[];
  setManagedUsers: (users: any[]) => void;

  favorites: string[];
  toggleFavorite: (mediaId: string) => void;
  hydrateProfileState: (userId?: string) => void;
  clearSessionState: () => void;
}

export const useStore = create<XandeflixState>((set) => ({
  allCategories: [],
  activeFilter: 'home',
  searchQuery: '',
  selectedMedia: null,
  isSettingsVisible: false,
  isUsingMock: false,
  isAdminMode:
    getStorage()?.getItem(STORAGE_KEYS.authRole) === 'admin' ||
    getStorage()?.getItem(STORAGE_KEYS.adminMode) === 'true',
  managedUsers: [],
  hiddenCategoryIds: readStorageValue<string[]>(STORAGE_KEYS.hiddenCategories, []),
  playbackProgress: getInitialPlaybackProgress(),
  favorites: getInitialFavorites(),

  setAllCategories: (categories) => set({ allCategories: categories }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedMedia: (media) => set({ selectedMedia: media }),
  setIsSettingsVisible: (visible) => set({ isSettingsVisible: visible }),
  setIsUsingMock: (using) => set({ isUsingMock: using }),
  setIsAdminMode: (mode) => {
    const storage = getStorage();
    storage?.setItem(STORAGE_KEYS.adminMode, String(mode));
    set({ isAdminMode: mode });
  },
  setManagedUsers: (users) => set({ managedUsers: users }),
  setHiddenCategoryIds: (ids) => {
    writeStorageValue(STORAGE_KEYS.hiddenCategories, ids);
    set({ hiddenCategoryIds: ids });
  },
  setPlaybackProgress: (id, currentTime, duration) => {
    set((state) => {
      const newProgress = {
        ...state.playbackProgress,
        [id]: { currentTime, duration, timestamp: Date.now() },
      };

      writeScopedStorageValue(STORAGE_KEYS.playbackProgress, newProgress);
      return { playbackProgress: newProgress };
    });
  },
  syncProgressToSupabase: async (userId, mediaId, currentTime, duration) => {
    try {
      const { error } = await supabase
        .from('playback_progress')
        .upsert(
          {
            user_id: userId,
            media_id: mediaId,
            playback_time: currentTime,
            duration,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,media_id' },
        );

      if (error) {
        throw error;
      }

      console.log(`[Supabase] Progresso sincronizado para ${mediaId}`);
    } catch (err) {
      console.error('[Supabase] Erro ao sincronizar progresso:', err);
    }
  },
  toggleFavorite: (mediaId: string) => {
    set((state) => {
      const favorites = state.favorites.includes(mediaId)
        ? state.favorites.filter((id) => id !== mediaId)
        : [...state.favorites, mediaId];

      writeScopedStorageValue(STORAGE_KEYS.favorites, favorites);
      return { favorites };
    });
  },
  hydrateProfileState: (userId?: string) => {
    set({
      allCategories: [],
      activeFilter: 'home',
      searchQuery: '',
      selectedMedia: null,
      isSettingsVisible: false,
      isUsingMock: false,
      favorites: readScopedStorageValue<string[]>(STORAGE_KEYS.favorites, [], userId),
      playbackProgress: readScopedStorageValue<PlaybackProgressMap>(STORAGE_KEYS.playbackProgress, {}, userId),
    });
  },
  clearSessionState: () => {
    set({
      allCategories: [],
      activeFilter: 'home',
      searchQuery: '',
      selectedMedia: null,
      isSettingsVisible: false,
      isUsingMock: false,
      favorites: [],
      playbackProgress: {},
    });
  },
}));
