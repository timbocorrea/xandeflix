import React from 'react';
import { View, Text, StyleSheet, TouchableHighlight, Image, FlatList } from 'react-native';
import { Category, Media } from '../types';

interface MediaItemProps {
  item: Media;
  rowIndex: number;
  index: number;
  isFocused: boolean;
  onFocus: (media: Media, id: string) => void;
  onPress: (media: Media) => void;
}

const MediaItem = React.memo(({ item, rowIndex, index, isFocused, onFocus, onPress }: MediaItemProps) => {
  const navId = `item-${rowIndex}-${index}`;

  return (
    <TouchableHighlight
      onFocus={() => onFocus(item, navId)}
      onPress={() => onPress(item)}
      // @ts-ignore
      onClick={() => onPress(item)}
      underlayColor="transparent"
      style={[
        styles.cardContainer,
        isFocused && styles.cardFocused
      ]}
      // @ts-ignore
      className="cursor-pointer"
    >
      <View style={styles.cardInner}>
        <Image 
          source={{ uri: item.thumbnail }} 
          style={styles.thumbnail}
          resizeMode="cover"
          // @ts-ignore
          loading="lazy"
        />
        <View style={styles.placeholder} />
        
        {isFocused && (
          <View style={styles.cardOverlay}>
            <View style={styles.overlayInner}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableHighlight>
  );
});

interface CategoryRowProps {
  category: Category;
  rowIndex: number;
  focusedId: string | null;
  onMediaFocus: (media: Media, id: string) => void;
  onMediaPress: (media: Media) => void;
}

export const CategoryRow: React.FC<CategoryRowProps> = React.memo(({ 
  category, 
  rowIndex, 
  focusedId, 
  onMediaFocus, 
  onMediaPress 
}) => {
  return (
    <View style={styles.categoryRow}>
      <Text style={styles.categoryTitle}>{category.title}</Text>
      <FlatList
        horizontal
        data={category.items}
        renderItem={({ item, index }) => (
          <MediaItem 
            item={item} 
            rowIndex={rowIndex} 
            index={index} 
            isFocused={focusedId === `item-${rowIndex}-${index}`}
            onFocus={onMediaFocus}
            onPress={onMediaPress}
          />
        )}
        keyExtractor={(item, idx) => `cat-${category.id}-item-${item.id}-${idx}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.flatListContent}
        removeClippedSubviews={true}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={3}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  categoryRow: {
    marginBottom: 44,
    paddingLeft: 4,
  },
  categoryTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
    marginBottom: 24,
    fontFamily: 'Outfit',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  flatListContent: {
    paddingRight: 100,
    paddingVertical: 20,
  },
  cardContainer: {
    width: 320,
    height: 180,
    marginRight: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.05)',
    // @ts-ignore
    transition: 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
  } as any,
  cardFocused: {
    transform: 'scale(1.08) translateY(-10px)' as any,
    zIndex: 10,
    borderColor: '#E50914',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 20,
  },
  cardInner: {
    width: '100%',
    height: '100%',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
    zIndex: -1,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  overlayInner: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  cardTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Outfit',
  },
});
