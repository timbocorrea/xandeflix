import type { EPGProgram } from '../types';

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim();
}

function parseXmltvDate(value: string | null): Date | null {
  const rawValue = normalizeText(value);
  if (!rawValue) {
    return null;
  }

  const match = rawValue.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}|Z))?/,
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, zone] = match;
  const baseUtcTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  if (!zone || zone === 'Z') {
    return new Date(baseUtcTime);
  }

  const sign = zone.startsWith('-') ? -1 : 1;
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(3, 5));
  const offsetMs = sign * ((offsetHours * 60) + offsetMinutes) * 60 * 1000;

  return new Date(baseUtcTime - offsetMs);
}

function isSameLocalDay(date: Date, targetDate: Date): boolean {
  return (
    date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate()
  );
}

export class EPGParser {
  public static parse(xmltvRaw: string, targetDate = new Date()): Record<string, EPGProgram[]> {
    const xmlSource = normalizeText(xmltvRaw);
    if (!xmlSource || typeof DOMParser === 'undefined') {
      return {};
    }

    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlSource, 'application/xml');
    const parserError = xml.querySelector('parsererror');

    if (parserError) {
      console.warn('[EPG] XMLTV invalido:', parserError.textContent || 'parsererror');
      return {};
    }

    const channelMap: Record<string, EPGProgram[]> = {};
    const channelNodes = Array.from(xml.getElementsByTagName('channel'));

    channelNodes.forEach((channelNode) => {
      const channelId = normalizeText(channelNode.getAttribute('id'));
      if (channelId && !channelMap[channelId]) {
        channelMap[channelId] = [];
      }
    });

    const programmeNodes = Array.from(xml.getElementsByTagName('programme'));

    programmeNodes.forEach((programmeNode) => {
      const channelId = normalizeText(programmeNode.getAttribute('channel'));
      if (!channelId) {
        return;
      }

      const startDate = parseXmltvDate(programmeNode.getAttribute('start'));
      const stopDate = parseXmltvDate(programmeNode.getAttribute('stop'));

      if (!startDate || !isSameLocalDay(startDate, targetDate)) {
        return;
      }

      if (!channelMap[channelId]) {
        channelMap[channelId] = [];
      }

      const titleNode = programmeNode.getElementsByTagName('title')[0];
      const descNode = programmeNode.getElementsByTagName('desc')[0];

      channelMap[channelId].push({
        title: normalizeText(titleNode?.textContent) || 'Programacao indisponivel',
        start: startDate.toISOString(),
        stop: stopDate?.toISOString() || startDate.toISOString(),
        desc: normalizeText(descNode?.textContent),
      });
    });

    Object.keys(channelMap).forEach((channelId) => {
      channelMap[channelId].sort(
        (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
      );
    });

    return channelMap;
  }
}
