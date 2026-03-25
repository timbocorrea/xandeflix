import { create } from 'zustand';
import { Category, Media } from '../types';

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

  // Administrative State
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
  isAdminMode: false,
  managedUsers: [],
  hiddenCategoryIds: JSON.parse(localStorage.getItem('xandeflix_hidden_categories') || '[]'),

  // Actions
  setAllCategories: (categories) => set({ allCategories: categories }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedMedia: (media) => set({ selectedMedia: media }),
  setIsSettingsVisible: (visible) => set({ isSettingsVisible: visible }),
  setIsUsingMock: (using) => set({ isUsingMock: using }),
  setIsAdminMode: (mode) => set({ isAdminMode: mode }),
  setManagedUsers: (users) => set({ managedUsers: users }),
  setHiddenCategoryIds: (ids) => {
    localStorage.setItem('xandeflix_hidden_categories', JSON.stringify(ids));
    set({ hiddenCategoryIds: ids });
  },
}));
