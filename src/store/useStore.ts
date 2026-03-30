import { create } from 'zustand';
import { Category, Media } from '../types';
import { supabase } from '../lib/supabase';

interface XandeflixState {
  // Playlist State
  allCategories: Category[];
  setAllCategories: (categories: Category[]) => void;
  
  // Filtering & Search
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  // Viewing State
  selectedMedia: Media | null;
  setSelectedMedia: (media: Media | null) => void;
  isSettingsVisible: boolean;
  setIsSettingsVisible: (visible: boolean) => void;
  
  // Customization
  hiddenCategoryIds: string[];
  setHiddenCategoryIds: (ids: string[]) => void;
  
  // Mock Data Tracking
  isUsingMock: boolean;
  setIsUsingMock: (using: boolean) => void;

  // Persistent user progress
  playbackProgress: Record<string, { currentTime: number; duration: number; timestamp: number }>;
  setPlaybackProgress: (id: string, currentTime: number, duration: number) => void;
  syncProgressToSupabase: (userId: string, mediaId: string, currentTime: number, duration: number) => Promise<void>;

  // Administrative State (persisted in localStorage)
  isAdminMode: boolean;
  setIsAdminMode: (mode: boolean) => void;
  managedUsers: any[];
  setManagedUsers: (users: any[]) => void;
}

export const useStore = create<XandeflixState>((set) => ({
  // Defaults
  allCategories: [],
  activeFilter: 'home',
  searchQuery: '',
  selectedMedia: null,
  isSettingsVisible: false,
  isUsingMock: false,
  // Persist admin mode across page reloads
  isAdminMode:
    localStorage.getItem('xandeflix_auth_role') === 'admin' ||
    localStorage.getItem('xandeflix_admin_mode') === 'true',
  managedUsers: [],
  hiddenCategoryIds: JSON.parse(localStorage.getItem('xandeflix_hidden_categories') || '[]'),
  playbackProgress: JSON.parse(localStorage.getItem('xandeflix_playback_progress') || '{}'),

  // Actions
  setAllCategories: (categories) => set({ allCategories: categories }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedMedia: (media) => set({ selectedMedia: media }),
  setIsSettingsVisible: (visible) => set({ isSettingsVisible: visible }),
  setIsUsingMock: (using) => set({ isUsingMock: using }),
  setIsAdminMode: (mode) => {
    localStorage.setItem('xandeflix_admin_mode', String(mode));
    set({ isAdminMode: mode });
  },
  setManagedUsers: (users) => set({ managedUsers: users }),
  setHiddenCategoryIds: (ids) => {
    localStorage.setItem('xandeflix_hidden_categories', JSON.stringify(ids));
    set({ hiddenCategoryIds: ids });
  },
  setPlaybackProgress: (id, currentTime, duration) => {
    set((state) => {
      const newProgress = {
        ...state.playbackProgress,
        [id]: { currentTime, duration, timestamp: Date.now() }
      };
      localStorage.setItem('xandeflix_playback_progress', JSON.stringify(newProgress));
      return { playbackProgress: newProgress };
    });
  },
  syncProgressToSupabase: async (userId, mediaId, currentTime, duration) => {
    try {
      const { error } = await supabase
        .from('playback_progress')
        .upsert({
          user_id: userId,
          media_id: mediaId,
          playback_time: currentTime,
          duration: duration,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,media_id' });

      if (error) throw error;
      console.log(`[Supabase] Progresso sincronizado para ${mediaId}`);
    } catch (err) {
      console.error('[Supabase] Erro ao sincronizar progresso:', err);
    }
  },
}));
