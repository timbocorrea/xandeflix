import { Category, Media, MediaType } from "../../src/types";

export class M3UParserService {
  /**
   * Parses basic EXTINF attributes from a line
   */
  private static parseAttributes(attributes: string, name: string): Partial<Media> {
    const logoMatch = attributes.match(/tvg-logo="([^"]+)"/);
    const categoryMatch = attributes.match(/group-title="([^"]+)"/);
    
    const category = categoryMatch ? categoryMatch[1] : 'Geral';
    const catLower = category.toLowerCase();
    const nameLower = name.toLowerCase();

    let type: MediaType = MediaType.LIVE;

    const movieKeywords = [
      'filme', 'movie', 'vod', '4k', 'ultra', '1080p', 'films', 'filmes', 'movies',
      'lancamentos', 'lançamentos', 'animacao', 'animação', 'acao', 'ação', 'comedia', 'comédia',
      'terror', 'horror', 'suspense', 'drama', 'romance', 'documentario', 'documentário',
      'ficcao', 'ficção', 'aventura', 'infantil', 'kids', 'cinema', 'premiere', '2024', '2023', '2022',
      'marvel', 'dc comics', 'disney', 'pixar'
    ];
    const seriesKeywords = [
      'serie', 'series', 'série', 'séries', 'season', 'temporada', 'novela', 'episodio', 'episódio', 
      'ep ', 'ep.', 'animes', 'desenhos', 'kids series', 'netflix series', 'hbo series'
    ];

    if (movieKeywords.some(kw => catLower.includes(kw) || nameLower.includes(kw))) {
      type = MediaType.MOVIE;
    } else if (seriesKeywords.some(kw => catLower.includes(kw) || nameLower.includes(kw))) {
      type = MediaType.SERIES;
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
      duration: type === MediaType.LIVE ? 'Ao Vivo' : 'VOD'
    };
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
        if (!currentItem) {
          const name = `Conteúdo ${items.length + 1}`;
          const thumbnail = `https://picsum.photos/seed/link-${items.length}/400/225`;
          currentItem = {
            id: Math.random().toString(36).substring(2, 11),
            title: name,
            thumbnail,
            backdrop: thumbnail,
            category: 'Geral',
            type: MediaType.LIVE,
            description: `Transmissão #${items.length + 1}`,
            year: 2024,
            rating: '12+',
            duration: 'Ao Vivo'
          } as Media;
        }

        const streamUrl = line;
        onParsedUrl(streamUrl);

        (currentItem as Media).videoUrl = `/api/stream?url=${encodeURIComponent(streamUrl)}`;
        items.push(currentItem as Media);
        currentItem = null;
      }
    }

    // Group by category
    const categoriesMap: { [key: string]: Category } = {};
    items.forEach(item => {
      if (!categoriesMap[item.category]) {
        categoriesMap[item.category] = {
          id: item.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title: item.category,
          type: item.type,
          items: []
        };
      }
      
      const currentCat = categoriesMap[item.category];
      if (currentCat.items.length < 500) {
        currentCat.items.push(item);
        
        // Refine category type based on majority of items
        if (item.type === MediaType.MOVIE) currentCat.type = MediaType.MOVIE;
        else if (item.type === MediaType.SERIES) currentCat.type = MediaType.SERIES;
      }
    });

    return Object.values(categoriesMap).slice(0, 300);
  }
}
