import { Category, Media, MediaType } from "../../src/types";

export class M3UParserService {
  /**
   * Parses basic EXTINF attributes from a line
   */
  private static parseAttributes(attributes: string, name: string): Partial<Media> {
    const logoMatch = attributes.match(/tvg-logo="([^"]+)"/);
    const categoryMatch = attributes.match(/group-title="([^"]+)"/);
    const tvgIdMatch = attributes.match(/tvg-id="([^"]+)"/);
    const tvgNameMatch = attributes.match(/tvg-name="([^"]+)"/);
    
    const category = categoryMatch ? categoryMatch[1] : 'Geral';
    const catLower = category.toLowerCase();
    const nameLower = name.toLowerCase();

    // Default to Live
    let type: MediaType = MediaType.LIVE;

    // Advanced Movie Detection
    const movieKeywords = [
      'filme', 'movie', 'vod', '4k', 'ultra', '1080p', 'films', 'filmes', 'movies',
      'lancamentos', 'lançamentos', 'animacao', 'animação', 'acao', 'ação', 'comedia', 'comédia',
      'terror', 'horror', 'suspense', 'drama', 'romance', 'documentario', 'documentário',
      'ficcao', 'ficção', 'aventura', 'infantil', 'kids', 'cinema', 'premiere', '2024', '2023', '2022',
      'marvel', 'dc comics', 'disney', 'pixar'
    ];
    
    // Advanced Series Detection (including S01E01 patterns)
    const seriesKeywords = [
      'serie', 'series', 'série', 'séries', 'season', 'temporada', 'novela', 'episodio', 'episódio', 
      'ep ', 'ep.', 'animes', 'desenhos', 'kids series', 'netflix series', 'hbo series'
    ];

    const isSeriesPattern = /S\d{1,2}E\d{1,2}/i.test(name) || /T\d{1,2}E\d{1,2}/i.test(name);

    if (isSeriesPattern || seriesKeywords.some(kw => catLower.includes(kw) || nameLower.includes(kw))) {
      type = MediaType.SERIES;
    } else if (movieKeywords.some(kw => catLower.includes(kw) || nameLower.includes(kw))) {
      type = MediaType.MOVIE;
    }

    let thumbnail = logoMatch ? logoMatch[1] : `https://picsum.photos/seed/${encodeURIComponent(name)}/400/225`;
    
    // Clean dead domains to prevent heavy console errors
    if (thumbnail && (thumbnail.includes('xvbroker.click') || thumbnail.includes('missing-image'))) {
      thumbnail = `https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=400&auto=format&fit=crop`;
    }

    return {
      id: Math.random().toString(36).substring(2, 11),
      title: name,
      thumbnail,
      backdrop: thumbnail,
      category,
      type,
      description: `Conteúdo da categoria ${category}`,
      year: 2024,
      rating: '12+',
      duration: type === MediaType.LIVE ? 'Ao Vivo' : 'VOD',
      // EPG Metadata
      tvgId: tvgIdMatch ? tvgIdMatch[1] : undefined,
      tvgName: tvgNameMatch ? tvgNameMatch[1] : undefined
    } as any;
  }

  /**
   * Normalizes category names to avoid duplicates like "FILMES 4K" and "4K Filmes"
   */
  private static normalizeCategoryTitle(title: string): string {
    let normalized = title.trim();
    
    // Example: remove standard prefixes/suffixes
    normalized = normalized.replace(/^BR[\s-]*\|?[\s-]*/i, '');
    normalized = normalized.replace(/^PT[\s-]*\|?[\s-]*/i, '');
    
    return normalized;
  }

  /**
   * Parses the full M3U content into organized categories
   */
  public static parse(m3uContent: string, onParsedUrl: (url: string) => void): Category[] {
    const lines = m3uContent.split(/\r?\n/);
    const items: Media[] = [];
    let currentItem: Partial<Media> | null = null;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.toUpperCase().startsWith('#EXTINF')) {
        const commaIndex = line.indexOf(',');
        let name = 'Canal Sem Nome';
        let attributes = '';
        
        if (commaIndex !== -1) {
          name = line.substring(commaIndex + 1).trim();
          const firstSpace = line.indexOf(' ');
          const firstColon = line.indexOf(':');
          
          let attrStart = -1;
          if (firstColon !== -1 && (firstSpace === -1 || firstColon < firstSpace)) {
             attrStart = firstColon + 1;
          } else if (firstSpace !== -1) {
             attrStart = firstSpace + 1;
          }
          
          if (attrStart !== -1 && attrStart < commaIndex) {
            attributes = line.substring(attrStart, commaIndex).trim();
          }
        } else {
          const firstColon = line.indexOf(':');
          attributes = line.substring(firstColon !== -1 ? firstColon + 1 : 7).trim();
        }
          
        currentItem = this.parseAttributes(attributes, name);
      } else if (line.startsWith('http')) {
        if (!currentItem) continue; // Skip orphan links

        const streamUrl = line;
        onParsedUrl(streamUrl);

        (currentItem as Media).videoUrl = `/api/stream?url=${encodeURIComponent(streamUrl)}`;
        items.push(currentItem as Media);
        currentItem = null;
      }
    }

    // Group by category with normalization
    const categoriesMap: { [key: string]: Category } = {};
    items.forEach(item => {
      const normalizedTitle = this.normalizeCategoryTitle(item.category);
      const categoryKey = normalizedTitle.toUpperCase();

      if (!categoriesMap[categoryKey]) {
        categoriesMap[categoryKey] = {
          id: normalizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title: normalizedTitle,
          type: item.type,
          items: []
        };
      }
      
      const currentCat = categoriesMap[categoryKey];
      if (currentCat.items.length < 500) {
        currentCat.items.push(item);
        
        // Refine category type based on content
        if (item.type === MediaType.MOVIE) currentCat.type = MediaType.MOVIE;
        else if (item.type === MediaType.SERIES) currentCat.type = MediaType.SERIES;
      }
    });

    return Object.values(categoriesMap).slice(0, 300);
  }
}
