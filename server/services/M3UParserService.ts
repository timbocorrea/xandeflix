import { Category, Media, MediaType } from '../../src/types';

export class M3UParserService {
  /**
   * Parses M3U attributes and determines content type
   */
  public static parseAttributes(attributes: string, name: string): Media {
    const logoMatch = attributes.match(/tvg-logo="([^"]*)"/i);
    const groupMatch = attributes.match(/group-title="([^"]*)"/i);
    const xtreamGroupMatch = attributes.match(/group-id="([^"]*)"/i);
    
    let category = 'Geral';
    if (groupMatch) category = groupMatch[1];
    else if (xtreamGroupMatch) category = xtreamGroupMatch[1];
    
    let type: MediaType = MediaType.LIVE;
    const catLower = category.toLowerCase();
    const nameLower = name.toLowerCase();

    if (catLower.includes('filme') || catLower.includes('movie') || catLower.includes('vod') || nameLower.includes('filme') || nameLower.includes('vod')) {
      type = MediaType.MOVIE;
    } else if (catLower.includes('serie') || nameLower.includes('serie') || catLower.includes('season') || nameLower.includes('season')) {
      type = MediaType.SERIES;
    }

    const thumbnail = logoMatch ? logoMatch[1] : `https://picsum.photos/seed/${encodeURIComponent(name)}/400/225`;

    return {
      title: name,
      thumbnail,
      backdrop: thumbnail,
      category,
      type,
      id: Math.random().toString(36).substring(2, 11),
      videoUrl: '', // Will be populated in the main loop
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

      if (line.toUpperCase().startsWith('#EXTINF:')) {
        const commaIndex = line.indexOf(',');
        let name = 'Canal Sem Nome';
        let attributes = '';
        
        if (commaIndex !== -1) {
          const infoPart = line.substring(0, commaIndex);
          name = line.substring(commaIndex + 1).trim();
          attributes = infoPart.substring(infoPart.indexOf(':') + 1).trim();
        } else {
          attributes = line.substring(line.indexOf(':') + 1).trim();
        }
          
        currentItem = this.parseAttributes(attributes, name);
      } else if (line.startsWith('http')) {
        if (!currentItem) {
          const name = `Link ${items.length + 1}`;
          const thumbnail = `https://picsum.photos/seed/link-${items.length}/400/225`;
          currentItem = {
            id: Math.random().toString(36).substring(2, 11),
            title: name,
            thumbnail,
            backdrop: thumbnail,
            category: 'Geral',
            type: MediaType.LIVE,
            description: `Link de transmissão #${items.length + 1}`,
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
      if (categoriesMap[item.category].items.length < 500) {
        categoriesMap[item.category].items.push(item);
      }
    });

    return Object.values(categoriesMap).slice(0, 300);
  }
}
