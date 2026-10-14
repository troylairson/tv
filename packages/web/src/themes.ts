import type { LogoTheme } from './logos/generate';

/**
 * The TV's looks. Each is a block of CSS in themes.css (.tv[data-theme=…]); the
 * markup is shared, and a theme shows, hides and restyles its parts. This table
 * holds what CSS can't: names, which logo palette to use and theme-specific text.
 */
export interface Theme {
  id: string;
  name: string;
  /** Generated logos' palette and fonts. */
  logo: LogoTheme;
  /** Header over the guide, if the theme has one. */
  guideMasthead?: { badge?: string; title: (ms: number) => string };
  /** The "Coming up next" card's label. */
  upNext: string;
}

const dayPart = (ms: number) => {
  const h = new Date(ms).getHours();
  return h < 5 ? 'Late Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
};
const weekday = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'long' });

export const THEMES: Theme[] = [
  { id: 'prevue', name: "Prevue '89", logo: 'retro', upNext: 'Coming up next' },
  { id: 'vcr', name: 'VCR', logo: 'retro', guideMasthead: { title: () => 'PROGRAM GUIDE' }, upNext: 'COMING UP NEXT' },
  { id: 'streaming', name: 'Streaming', logo: 'modern', upNext: 'Up next' },
  { id: 'broadcast', name: 'Broadcast', logo: 'modern', guideMasthead: { title: () => "What's on" }, upNext: 'Up next' },
  { id: 'stationid', name: 'Station ID', logo: 'seventies', upNext: 'Coming up next' },
  {
    id: 'console',
    name: 'Console',
    logo: 'seventies',
    guideMasthead: { badge: 'TV LOG', title: (ms) => `${weekday(ms)} ${dayPart(ms)}` },
    upNext: 'Coming up next',
  },
];

/** Themes from before there were six. */
const RENAMED: Record<string, string> = { retro: 'prevue', modern: 'streaming', seventies: 'stationid' };

export function findTheme(id: string | null): Theme {
  const wanted = RENAMED[id ?? ''] ?? id;
  return THEMES.find((t) => t.id === wanted) ?? THEMES[0]!;
}
