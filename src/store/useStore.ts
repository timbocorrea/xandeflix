import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Category, EPGProgram, Media } from '../types';
import { supabase } from '../lib/supabase';

export type AdultAccessState = {
  enabled: boolean;
  totpEnabled: boolean;
};

type PlaybackProgressEntry = {
  currentTime: number;
  duration: number;
  timestamp: number;
};

type SavePlaybackProgressInput = {
  mediaId?: string;
  url: string;
  currentTime: number;
  duration?: number;
};

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

  // New persistent states
  favorites: string[]; // List of video URLs
  toggleFavorite: (videoUrl: string) => void;
  
  watchHistory: Record<string, number>; // url -> timeInSeconds
  updateWatchHistory: (url: string, timeInSeconds: number, duration?: number) => void;
  savePlaybackProgress: (input: SavePlaybackProgressInput) => void;

  epgData: Record<string, EPGProgram[]> | null;
  setEpgData: (epgData: Record<string, EPGProgram[]> | null) => void;

  playbackProgress: Record<string, PlaybackProgressEntry>;

  isAdminMode: boolean;
  setIsAdminMode: (mode: boolean) => void;
  managedUsers: any[];
  setManagedUsers: (users: any[]) => void;

  adultAccess: AdultAccessState;
  setAdultAccessSettings: (settings?: Partial<AdultAccessState> | null) => void;
  isAdultUnlocked: boolean;
  unlockAdultContent: () => void;
  lockAdultContent: () => void;
  hydrateProfileState: (userId?: string) => void;
  clearSessionState: () => void;
}

export const useStore = create<XandeflixState>()(
  persist(
    (set) => ({
      allCategories: [],
      activeFilter: 'home',
      searchQuery: '',
      selectedMedia: null,
      isSettingsVisible: false,
      isUsingMock: false,
      hiddenCategoryIds: [],
      favorites: [],
      watchHistory: {},
      epgData: null,
      playbackProgress: {},
      isAdminMode: false,
      managedUsers: [],
      adultAccess: { enabled: false, totpEnabled: false },
      isAdultUnlocked: false,

      setAllCategories: (categories) => set({ allCategories: categories }),
      setActiveFilter: (filter) => set({ activeFilter: filter }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedMedia: (media) => set({ selectedMedia: media }),
      setIsSettingsVisible: (visible) => set({ isSettingsVisible: visible }),
      setIsUsingMock: (using) => set({ isUsingMock: using }),
      
      setHiddenCategoryIds: (ids) => set({ hiddenCategoryIds: ids }),

      toggleFavorite: (url: string) => 
        set((state) => ({
          favorites: state.favorites.includes(url)
            ? state.favorites.filter((f) => f !== url)
            : [...state.favorites, url]
        })),

      updateWatchHistory: (url: string, time: number, duration?: number) =>
        set((state) => ({
          watchHistory: {
            ...state.watchHistory,
            [url]: time
          },
          playbackProgress: {
            ...state.playbackProgress,
            [url]: {
              currentTime: time,
              duration: duration ?? state.playbackProgress[url]?.duration ?? 0,
              timestamp: Date.now(),
            },
          },
        })),

      savePlaybackProgress: ({ mediaId, url, currentTime, duration }) =>
        set((state) => {
          const previousUrlEntry = state.playbackProgress[url];
          const previousMediaEntry = mediaId ? state.playbackProgress[mediaId] : undefined;
          const entry: PlaybackProgressEntry = {
            currentTime,
            duration:
              duration ??
              previousMediaEntry?.duration ??
              previousUrlEntry?.duration ??
              0,
            timestamp: Date.now(),
          };

          return {
            watchHistory: {
              ...state.watchHistory,
              [url]: currentTime,
            },
            playbackProgress: {
              ...state.playbackProgress,
              [url]: entry,
              ...(mediaId ? { [mediaId]: entry } : {}),
            },
          };
        }),

      setEpgData: (epgData) => set({ epgData }),

      setIsAdminMode: (mode) => set({ isAdminMode: mode }),
      setManagedUsers: (users) => set({ managedUsers: users }),
      setAdultAccessSettings: (settings) => {
        const enabled = Boolean(settings?.enabled);
        set((state) => ({
          adultAccess: {
            ...state.adultAccess,
            enabled,
            totpEnabled: Boolean(settings?.totpEnabled),
          },
          isAdultUnlocked: enabled ? state.isAdultUnlocked : false,
        }));
      },
      unlockAdultContent: () => set({ isAdultUnlocked: true }),
      lockAdultContent: () => set({ isAdultUnlocked: false }),
      hydrateProfileState: () =>
        set({
          allCategories: [],
          activeFilter: 'home',
          searchQuery: '',
          selectedMedia: null,
          isSettingsVisible: false,
          isUsingMock: false,
          epgData: null,
        }),
      clearSessionState: () =>
        set({
          allCategories: [],
          activeFilter: 'home',
          searchQuery: '',
          selectedMedia: null,
          isSettingsVisible: false,
          isUsingMock: false,
          managedUsers: [],
          adultAccess: { enabled: false, totpEnabled: false },
          isAdultUnlocked: false,
          epgData: null,
          playbackProgress: {},
        }),
    }),
    {
      name: 'xandeflix-app-storage',
      partialize: (state) => ({
        favorites: state.favorites,
        watchHistory: state.watchHistory,
        playbackProgress: state.playbackProgress,
        hiddenCategoryIds: state.hiddenCategoryIds,
        isAdminMode: state.isAdminMode,
        adultAccess: state.adultAccess,
      }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);
