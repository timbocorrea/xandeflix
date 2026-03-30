import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Category } from '../types';

export const useMediaFilter = () => {
  const { allCategories, activeFilter, searchQuery, hiddenCategoryIds } = useStore();

  const filteredCategories = useMemo(() => {
    // 1. Filter out hidden categories
    let result = allCategories.filter(cat => !hiddenCategoryIds.includes(cat.id));

    // 2. Dedicated search mode searches across the full visible library
    if (activeFilter === 'search') {
      const query = searchQuery.trim().toLowerCase();

      if (!query) {
        return [];
      }

      return result
        .map((cat) => ({
          ...cat,
          items: cat.items.filter((item) =>
            item.title.toLowerCase().includes(query) ||
            cat.title.toLowerCase().includes(query)
          )
        }))
        .filter((cat) => cat.items.length > 0);
    }

    // 3. Filter by type (home, live, movies, series)
    if (activeFilter === 'home') {
      // Show everything EXCEPT live channels on the initial dashboard
      result = result.filter(cat => cat.type !== 'live');
    } else {
      // Filter strictly by the active type (live, movie, or series)
      result = result.filter(cat => cat.type === activeFilter);
    }

    return result;
  }, [allCategories, activeFilter, searchQuery, hiddenCategoryIds]);

  return { filteredCategories };
};
