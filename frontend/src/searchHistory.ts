/** How many past searches the remote remembers. */
export const MAX_SEARCHES = 10;

/** Put a search at the front of the list: no blanks, no repeats (ignoring case), only the newest few. */
export function addSearch(list: string[], query: string): string[] {
  const text = query.trim().replace(/\s+/g, ' ');
  if (!text) return list;
  const key = text.toLowerCase();
  return [text, ...list.filter((item) => item.toLowerCase() !== key)].slice(0, MAX_SEARCHES);
}

export function removeSearch(list: string[], query: string): string[] {
  return list.filter((item) => item !== query);
}

/** How many ordered songs the phone remembers itself. */
export const MAX_ORDERED = 50;

/** Put an ordered song at the front, once per song id. */
export function addOrdered<T extends { id: string }>(list: T[], track: T): T[] {
  return [track, ...list.filter((item) => item.id !== track.id)].slice(0, MAX_ORDERED);
}

/** The phone's own orders first, then the server's, once per song. */
export function mergeOrdered<T extends { id: string }>(local: T[], server: T[]): T[] {
  const seen = new Set<string>();
  return [...local, ...server].filter((track) => !seen.has(track.id) && !!seen.add(track.id));
}
