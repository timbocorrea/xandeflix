import { Category, Media, MediaType } from "../../src/types/index.js";

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

    // If it's a TV series pattern, it's a series - highest confidence for VOD
    const isSeriesPattern = /S\d{1,2}[\s.]?E\d{1,2}/i.test(name) || /T\d{1,2}[\s.]?E\d{1,2}/i.test(name);
    
    if (isSeriesPattern) {
      type = MediaType.SERIES;
    } else {
      // Lower confidence checks - will be refined by URL later
      const isSeriesCategory = seriesKeywords.some(kw => catLower.includes(kw));
      const isMovieCategory = movieKeywords.some(kw => catLower.includes(kw));
      
      if (isSeriesCategory) type = MediaType.SERIES;
      else if (isMovieCategory) type = MediaType.MOVIE;
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

        // --- Refine media type based on URL (Highest Confidence) ---
        if (currentItem) {
          const urlLower = streamUrl.toLowerCase();
          
          // Xtream Codes patterns
          if (urlLower.includes('/live/')) {
            currentItem.type = MediaType.LIVE;
          } else if (urlLower.includes('/movie/')) {
            currentItem.type = MediaType.MOVIE;
          } else if (urlLower.includes('/series/')) {
            currentItem.type = MediaType.SERIES;
          } 
          // Extension/Format patterns
          else if (urlLower.includes('output=mpegts') || urlLower.includes('output=ts')) {
            currentItem.type = MediaType.LIVE;
          } else if (urlLower.match(/\.(mp4|mkv|avi|mov)$/i)) {
            // If it's a file extension and wasn't explicitly live, it's likely VOD
            if (currentItem.type === MediaType.LIVE) {
               currentItem.type = MediaType.MOVIE; // Default VOD to movie if not sure
            }
          }
        }

        (currentItem as Media).videoUrl = `/api/stream?url=${encodeURIComponent(streamUrl)}`;
        items.push(currentItem as Media);
        currentItem = null;
      }
    }

    // 1. First Pass: Group series episodes
    const seriesMap: { [key: string]: Media } = {};
    let finalItems: Media[] = [];

    items.forEach(item => {
      let isEpisode = false;
      let seriesName = item.title;
      let seasonNum = 1;
      let episodeNum = 1;

      // Match pattern like "The Last of Us S01 E01" or "The Last of Us T1 E1"
      const seMatch = item.title.match(/(.*?)[\s\.\-\|]+(?:S|T)(\d{1,2})[\s\.\-\|E]*(\d{1,3})/i);
      if (seMatch) {
         seriesName = seMatch[1].trim();
         seasonNum = parseInt(seMatch[2], 10);
         episodeNum = parseInt(seMatch[3], 10);
         isEpisode = true;
      } else {
        // Fallback match like "Serie Nome Ep 05"
        const epMatch = item.title.match(/(.*?)[\s\-\|]+Ep(?:isod[io|eo])?[\s\.]+(\d{1,3})/i);
        if (epMatch) {
           seriesName = epMatch[1].trim();
           episodeNum = parseInt(epMatch[2], 10);
           isEpisode = true;
        }
      }

      // Se passou por um episódio de uma série
      if ((isEpisode && item.type === MediaType.SERIES) || (item.type === MediaType.SERIES && isEpisode)) {
         const seriesKey = `${item.category}_${seriesName.toLowerCase()}`;
         if (!seriesMap[seriesKey]) {
            seriesMap[seriesKey] = {
               ...item,
               id: `series_${Math.random().toString(36).substring(2, 11)}`,
               title: seriesName,
               seasons: [],
               videoUrl: '' // Série em si não é tocável
            };
            finalItems.push(seriesMap[seriesKey]);
         }

         const series = seriesMap[seriesKey];
         if (!series.seasons) series.seasons = [];
         
         let season = series.seasons.find(s => s.seasonNumber === seasonNum);
         if (!season) {
            season = { seasonNumber: seasonNum, episodes: [] };
            series.seasons.push(season);
         }

         season.episodes.push({
            id: item.id,
            seasonNumber: seasonNum,
            episodeNumber: episodeNum,
            title: `Episódio ${episodeNum}`,
            videoUrl: item.videoUrl
         });
      } else {
         finalItems.push(item);
      }
    });

    // Sort seasons and episodes correctly inside each series
    finalItems.forEach(item => {
      if (item.type === MediaType.SERIES && item.seasons) {
         item.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
         item.seasons.forEach(s => {
            s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
         });
      }
    });

    // 1.5. Live Channel Quality Grouping
    const liveGroupedItems = new Map<string, Media>();
    const mergedItems: Media[] = [];
    
    // Sort qualities for ranking (higher is better)
    const getQualityScore = (quality: string) => {
       const q = quality.toUpperCase();
       if (q.includes('4K')) return 100;
       if (q.includes('H265') || q.includes('HEVC')) return 90;
       if (q.includes('FHD') || q.includes('1080')) return 80;
       if (q.includes('HD') || q.includes('720')) return 60;
       if (q.includes('SD') || q.includes('480')) return 40;
       return 50; // default unknown
    };

    finalItems.forEach(item => {
      if (item.type === MediaType.LIVE) {
         // Detect quality inside the name (e.g. Globo SP FHD, Globo SP H265)
         const qMatch = item.title.match(/\b(4K|FHD|FULL\s?HD|HD|SD|H265|HEVC|1080[P|i]?|720[P|i]?|480[P|i]?)\b/i);
         let baseName = item.title;
         let quality = 'SD'; // default fallback text

         if (qMatch) {
            quality = qMatch[1].toUpperCase().replace('FULL HD', 'FHD').replace('FULLHD', 'FHD');
            // Remove the quality tag to find the core name of the channel
            baseName = item.title.replace(qMatch[0], '').replace(/[|\[\]\(\)\-]/g, '').replace(/\s{2,}/g, ' ').trim();
         } else {
            baseName = item.title.replace(/[|\[\]\(\)\-]/g, '').replace(/\s{2,}/g, ' ').trim();
         }

         const channelKey = `${item.category}_${baseName.toLowerCase()}`;
         
         if (!liveGroupedItems.has(channelKey)) {
            // First time seeing this channel, add the qualities array
            item.qualities = [{ name: quality, url: item.videoUrl }];
            item.title = baseName || item.title; // Update main title to clean version
            liveGroupedItems.set(channelKey, item);
            mergedItems.push(item);
         } else {
            // Already saw this channel, append the new URL to its qualities
            const existing = liveGroupedItems.get(channelKey)!;
            existing.qualities = existing.qualities || [];
            
            // Avoid exact URL duplicates
            if (!existing.qualities.some(q => q.url === item.videoUrl)) {
              let newLabel = quality;
              const sameLabelCount = existing.qualities.filter(q => q.name.startsWith(quality)).length;
              if (sameLabelCount > 0) {
                 if (sameLabelCount === 1) {
                    const firstMatch = existing.qualities.find(q => q.name === quality);
                    if (firstMatch) firstMatch.name = `${quality} 1`;
                 }
                 newLabel = `${quality} ${sameLabelCount + 1}`;
              }
              existing.qualities.push({ name: newLabel, url: item.videoUrl });
            }
         }
      } else {
         mergedItems.push(item); // VOD passes through unaffected
      }
    });

    // Sort the qualities array inside each live channel by QualityScore
    mergedItems.forEach(item => {
       if (item.type === MediaType.LIVE && item.qualities && item.qualities.length > 0) {
          item.qualities.sort((a, b) => getQualityScore(b.name) - getQualityScore(a.name));
          // Set the default videoUrl to the BEST quality stream!
          item.videoUrl = item.qualities[0].url;
       }
    });

    // 2. Second Pass: Group by category with normalização
    const categoriesMap: { [key: string]: Category } = {};
    mergedItems.forEach(item => {
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

    // Convert map to array and sort categories by content type priority
    const sortedCategories = Object.values(categoriesMap).sort((a, b) => {
      const typePriority = { [MediaType.LIVE]: 0, [MediaType.MOVIE]: 1, [MediaType.SERIES]: 2 };
      const priorityA = typePriority[a.type as keyof typeof typePriority] ?? 5;
      const priorityB = typePriority[b.type as keyof typeof typePriority] ?? 5;
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      // Secondary sort alphabetically by title
      return a.title.localeCompare(b.title);
    });

    return sortedCategories.slice(0, 300);
  }
}
