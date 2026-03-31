import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Category } from '../types';

export const useMediaFilter = () => {
  const { allCategories, activeFilter, searchQuery, hiddenCategoryIds, favorites } = useStore();

  const filteredCategories = useMemo(() => {
    // 0. Build virtual "Minha Lista" category
    const favoriteItems = allCategories
      .flatMap(cat => cat.items)
      // Filter out duplicates if same item exists in multiple categories
      .filter((item, index, self) => 
        favorites.includes(item.id) && 
        self.findIndex(t => t.id === item.id) === index
      );

    const favoritesCategory: Category | null = favoriteItems.length > 0 ? {
      id: 'mylist-cat',
      title: 'Minha Lista',
      items: favoriteItems,
      type: 'movie' as any // Virtual type
    } : null;

    // 1. Handle "Minha Lista" dedicated view
    if (activeFilter === 'mylist') {
      return favoritesCategory ? [favoritesCategory] : [];
    }

    // 2. Filter out hidden categories from general result
    let result = allCategories.filter(cat => !hiddenCategoryIds.includes(cat.id));

    // 3. Dedicated search mode searches across the full visible library
    if (activeFilter === 'search') {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return [];

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

    // 4. Filter by type (home, live, movies, series)
    if (activeFilter === 'home') {
      // Show everything EXCEPT live channels on the initial dashboard
      result = result.filter(cat => cat.type !== 'live');
      
      // Inject favorites at the top if they exist
      if (favoritesCategory) {
        result = [favoritesCategory, ...result];
      }
    } else {
      // Filter strictly by the active type (live, movie, or series)
      result = result.filter(cat => cat.type === activeFilter);
    }

    return result;
  }, [allCategories, activeFilter, searchQuery, hiddenCategoryIds, favorites]);

  return { filteredCategories };
};
