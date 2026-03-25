import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Category } from '../types';

export const useMediaFilter = () => {
  const { allCategories, activeFilter, searchQuery, hiddenCategoryIds } = useStore();

  const filteredCategories = useMemo(() => {
    // 1. Filter out hidden categories
    let result = allCategories.filter(cat => !hiddenCategoryIds.includes(cat.id));

    // 2. Filter by type (home, live, movies, series)
    if (activeFilter !== 'home') {
      result = result.filter(cat => cat.type === activeFilter);
    }

    // 3. Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.map(cat => ({
        ...cat,
        items: cat.items.filter(item => 
          item.title.toLowerCase().includes(query) || 
          cat.title.toLowerCase().includes(query)
        )
      })).filter(cat => cat.items.length > 0);
    }

    return result;
  }, [allCategories, activeFilter, searchQuery, hiddenCategoryIds]);

  return { filteredCategories };
};
