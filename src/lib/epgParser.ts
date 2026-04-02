import type { EPGProgram } from '../types';

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim();
}

function parseXmltvTimestamp(value: string | null): number | null {
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
    return baseUtcTime;
  }

  const sign = zone.startsWith('-') ? -1 : 1;
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(3, 5));
  const offsetMs = sign * ((offsetHours * 60) + offsetMinutes) * 60 * 1000;

  return baseUtcTime - offsetMs;
}

export function parseXMLTV(xmlString: string): Record<string, EPGProgram[]> {
  const xmlSource = normalizeText(xmlString);
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

  const groupedPrograms: Record<string, EPGProgram[]> = {};
  const programmeNodes = Array.from(xml.getElementsByTagName('programme'));

  programmeNodes.forEach((programmeNode, index) => {
    const channelId = normalizeText(programmeNode.getAttribute('channel'));
    const start = parseXmltvTimestamp(programmeNode.getAttribute('start'));
    const stop = parseXmltvTimestamp(programmeNode.getAttribute('stop'));

    if (!channelId || start === null) {
      return;
    }

    const titleNode = programmeNode.getElementsByTagName('title')[0];
    const descNode = programmeNode.getElementsByTagName('desc')[0];
    const title = normalizeText(titleNode?.textContent) || 'Programacao indisponivel';

    if (!groupedPrograms[channelId]) {
      groupedPrograms[channelId] = [];
    }

    groupedPrograms[channelId].push({
      id: `${channelId}:${start}:${index}`,
      start,
      stop: stop ?? start,
      title,
      description: normalizeText(descNode?.textContent),
    });
  });

  Object.keys(groupedPrograms).forEach((channelId) => {
    groupedPrograms[channelId].sort((left, right) => left.start - right.start);
  });

  return groupedPrograms;
}
