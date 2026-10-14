/**
 * Generated channel logos for channels without a hand-drawn one. The channel's
 * name and content pick a motif (wrestling → barbed wire, western → star…); a
 * hash of the name plus a "regenerate" seed picks the layout, palette and font.
 * Palettes and fonts follow the TV theme. Output: SVG markup for a 360×210
 * viewBox on a transparent background, like the hand-drawn logos.
 */
import { hashString } from '@retro-tv/schedule';

export type LogoTheme = 'retro' | 'modern' | 'seventies';

/** [main, accent, ink]: ink outlines text and shapes so they read on any background. */
type Palette = [string, string, string];

const PALETTES: Record<LogoTheme, Palette[]> = {
  retro: [
    ['#c8102e', '#ffd23f', '#0b0b0f'],
    ['#1e88e5', '#ffffff', '#0d1b4c'],
    ['#43a047', '#fdd835', '#10301a'],
    ['#ff5fa2', '#7fe3ff', '#2a0d3e'],
    ['#ff7b54', '#ffd166', '#0f3b3e'],
  ],
  modern: [
    ['#4f8cff', '#ffffff', '#111318'],
    ['#ff6b6b', '#ffffff', '#111318'],
    ['#21c7a8', '#ffffff', '#111318'],
    ['#f4b400', '#ffffff', '#111318'],
    ['#9b7bff', '#ffffff', '#111318'],
  ],
  seventies: [
    ['#e8452c', '#f6a623', '#3b1f0e'],
    ['#c9651b', '#fbecd0', '#3b1f0e'],
    ['#6b8e23', '#f6a623', '#2b1508'],
    ['#b5442b', '#f6d28b', '#2b1508'],
    ['#d9822b', '#fbecd0', '#4a2209'],
  ],
};

const FONTS: Record<LogoTheme, string[]> = {
  retro: ['Alfa Slab One', 'Bungee', 'Righteous', 'Oswald'],
  modern: ['Oswald', 'Righteous', 'Roboto'],
  seventies: ['Limelight', 'Righteous', 'Alfa Slab One', 'Pacifico'],
};

/** Rough average glyph width per em, to size names so they fit. */
const GLYPH_WIDTH: Record<string, number> = {
  'Alfa Slab One': 0.66,
  Bungee: 0.72,
  Righteous: 0.6,
  Oswald: 0.46,
  Roboto: 0.6,
  Limelight: 0.66,
  Pacifico: 0.56,
  Creepster: 0.5,
  Rye: 0.68,
  Monoton: 0.95,
  Orbitron: 0.86,
  Fredoka: 0.6,
};

const FONT_STACK: Record<string, string> = { Roboto: "Roboto, Inter, 'Helvetica Neue', Arial, sans-serif" };

interface Motif {
  id: string;
  match: RegExp;
  /** A font that suits the motif, used instead of the theme's. */
  font?: string;
}

const MOTIFS: Motif[] = [
  { id: 'wrestling', match: /wrestl|deathmatch|\bwwf\b|\bwcw\b|\becw\b|\bnwa\b|\bawa\b|slam|rumble/, font: 'Alfa Slab One' },
  { id: 'western', match: /western|cowboy|saddle|frontier|lone ranger|gunsmoke|cattle|ranch|outlaw/, font: 'Rye' },
  { id: 'horror', match: /horror|shock|monster|creature|vampire|zombie|ghost|haunted|fright|terror|dracula|frankenstein/, font: 'Creepster' },
  { id: 'space', match: /sci-?fi|space|atomic|rocket|planet|alien|martian|flash gordon|outer/, font: 'Orbitron' },
  { id: 'cartoon', match: /cartoon|animat|looney|popeye|toon|fleischer|felix|saturday morning/, font: 'Fredoka' },
  { id: 'music', match: /music|video|\b80s\b|eighties|rock|disco|concert|jukebox|band/, font: 'Righteous' },
  { id: 'game', match: /game show|quiz|what's my line|password|jeopardy|match game|i've got a secret|you bet/, font: 'Bungee' },
  { id: 'news', match: /news|newsreel|report|documentar|history|world/ },
  { id: 'crime', match: /noir|crime|detective|mystery|sherlock|dragnet|cops|police|private eye/ },
  { id: 'sports', match: /sport|baseball|football|boxing|basketball|hockey|olympic|bowling/ },
  { id: 'film', match: /film|movie|cinema|matinee|serial|theat|feature|picture show|drive-in/ },
  { id: 'comedy', match: /sitcom|comedy|laugh|funny|stooges|lucy|honeymooners/ },
];

/** Icons drawn around (0,0), about 100 units across. */
function icon(motif: string, [main, accent, ink]: Palette): string {
  const line = `stroke="${ink}" stroke-width="5" stroke-linejoin="round"`;
  switch (motif) {
    case 'wrestling':
      return `<rect x="-52" y="-24" width="104" height="48" rx="10" fill="${accent}" ${line}/><ellipse rx="26" ry="32" fill="${main}" ${line}/><polygon points="${starPoints(0, 0, 16)}" fill="${accent}"/>`;
    case 'western':
      return `<polygon points="${starPoints(0, 0, 52)}" fill="${accent}" ${line}/><circle r="13" fill="${main}" ${line}/>`;
    case 'horror':
      return `<circle r="44" fill="#f2efc0" ${line}/><path d="M-34 4 q12 -16 22 -4 q6 -14 12 0 q6 -14 12 0 q10 -12 22 4 q-14 -2 -18 10 q-6 -8 -16 -4 q-10 -4 -16 4 q-4 -12 -18 -10z" fill="${ink}"/>`;
    case 'space':
      return `<ellipse rx="58" ry="16" fill="none" stroke="${ink}" stroke-width="11" transform="rotate(-18)"/><circle r="32" fill="${main}" ${line}/><ellipse rx="58" ry="16" fill="none" stroke="${accent}" stroke-width="5" transform="rotate(-18)"/><path d="M-30 -2 a30 30 0 0 0 60 0" fill="${main}" transform="rotate(-18)"/>`;
    case 'cartoon':
      return `<polygon points="${burst(0, 0, 54, 32, 12)}" fill="${accent}" ${line}/><polygon points="${burst(0, 0, 30, 18, 12)}" fill="${main}"/>`;
    case 'music':
      return `<circle r="46" fill="${main}" ${line}/><g fill="${ink}"><rect x="-46" y="6" width="92" height="5"/><rect x="-46" y="18" width="92" height="7"/><rect x="-46" y="32" width="92" height="9"/></g>`;
    case 'game':
      return `<circle r="48" fill="${main}" ${line}/><text y="26" text-anchor="middle" font-family="Bungee" font-size="72" fill="${accent}" stroke="${ink}" stroke-width="4" paint-order="stroke">?</text>`;
    case 'news':
      return `<circle r="46" fill="${main}" ${line}/><g fill="none" stroke="${accent}" stroke-width="4"><ellipse rx="20" ry="46"/><line x1="-46" x2="46"/><path d="M-40 -22 h80 M-40 22 h80"/></g>`;
    case 'crime':
      return `<circle cx="-8" cy="-8" r="34" fill="${accent}" fill-opacity=".35" stroke="${ink}" stroke-width="14"/><circle cx="-8" cy="-8" r="34" fill="none" stroke="${main}" stroke-width="7"/><line x1="18" y1="18" x2="48" y2="48" stroke="${ink}" stroke-width="18" stroke-linecap="round"/><line x1="18" y1="18" x2="48" y2="48" stroke="${main}" stroke-width="9" stroke-linecap="round"/>`;
    case 'sports':
      return `<circle r="46" fill="#fff" ${line}/><path d="M-30 -34 q18 34 0 68 M30 -34 q-18 34 0 68" fill="none" stroke="${main}" stroke-width="5" stroke-dasharray="7 5"/>`;
    case 'film':
      return `<circle r="48" fill="${main}" ${line}/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="0" cy="-26" r="11" fill="${ink}" transform="rotate(${a})"/>`).join('')}<circle r="7" fill="${accent}"/>`;
    case 'comedy':
    default:
      return `<line x1="-14" y1="-38" x2="-30" y2="-58" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><line x1="14" y1="-38" x2="30" y2="-58" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><rect x="-54" y="-40" width="108" height="80" rx="16" fill="${main}" ${line}/><rect x="-40" y="-28" width="80" height="56" rx="10" fill="${accent}" ${line}/>`;
  }
}

function starPoints(x: number, y: number, r: number) {
  return burst(x, y, r, r * 0.42, 5);
}

function burst(x: number, y: number, outer: number, inner: number, points: number) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Split a long name over two lines at the space nearest the middle. */
function splitName(name: string): string[] {
  if (name.length <= 11 || !name.includes(' ')) return [name];
  const mid = name.length / 2;
  let best = -1;
  for (let i = 0; i < name.length; i++) if (name[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return [name.slice(0, best), name.slice(best + 1)];
}

/** One line of text sized to fit maxWidth; squeezed with textLength when even the smallest size won't. */
function fitText(text: string, opts: { x: number; y: number; maxWidth: number; maxSize: number; font: string; fill: string; ink: string; anchor?: string; caps?: boolean }) {
  const t = opts.caps === false ? text : text.toUpperCase();
  const per = GLYPH_WIDTH[opts.font] ?? 0.62;
  const minSize = opts.maxSize * 0.55;
  const size = Math.max(minSize, Math.min(opts.maxSize, opts.maxWidth / (t.length * per)));
  const squeeze = t.length * per * size > opts.maxWidth ? ` textLength="${opts.maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
  const family = FONT_STACK[opts.font] ?? `'${opts.font}'`;
  const weight = opts.font === 'Roboto' || opts.font === 'Oswald' || opts.font === 'Fredoka' ? ' font-weight="700"' : '';
  return {
    size,
    svg: `<text x="${opts.x}" y="${opts.y}" text-anchor="${opts.anchor ?? 'middle'}" font-family="${escapeXml(family)}"${weight} font-size="${size.toFixed(1)}" fill="${opts.fill}" stroke="${opts.ink}" stroke-width="${Math.max(4, size / 9).toFixed(1)}" stroke-linejoin="round" paint-order="stroke"${squeeze}>${escapeXml(t)}</text>`,
  };
}

/** Lines of the name stacked in a box (centre x, top y, width, height). */
function nameBlock(name: string, box: { x: number; y: number; w: number; h: number }, font: string, fill: string, ink: string, anchor = 'middle', caps = true, oneLine = false) {
  const lines = oneLine ? [name] : splitName(name);
  const lineH = box.h / lines.length;
  return lines
    .map((line, i) => fitText(line, { x: box.x, y: box.y + lineH * (i + 0.8), maxWidth: box.w, maxSize: lineH * 0.95, font, fill, ink, anchor, caps }).svg)
    .join('');
}

export interface GenerateInput {
  name: string;
  /** What the channel plays (source titles). */
  hint?: string;
  seed: number;
  theme: LogoTheme;
}

export function motifFor(name: string, hint = ''): string | null {
  const text = `${name} ${hint}`.toLowerCase();
  // The name wins over the content: "Saturday Matinee" full of westerns is still a film channel.
  return (MOTIFS.find((m) => m.match.test(name.toLowerCase())) ?? MOTIFS.find((m) => m.match.test(text)))?.id ?? null;
}

export function generateLogo({ name, hint, seed, theme }: GenerateInput): string {
  // Separate hashes per choice, so regenerating changes them independently.
  const pick = (what: string, n: number) => Math.abs(hashString(`${name.toLowerCase()}#${seed}#${what}`)) % n;
  const motifId = motifFor(name, hint);
  const motif = MOTIFS.find((m) => m.id === motifId);
  const palettes = PALETTES[theme];
  const palette = palettes[pick('palette', palettes.length)]!;
  const [main, accent, ink] = palette;
  const themeFonts = FONTS[theme];
  // Seed 0 uses the motif's font; regenerating also tries the theme's fonts.
  const font = motif?.font && (seed === 0 || pick('motif-font', 2) === 0) ? motif.font : themeFonts[pick('font', themeFonts.length)]!;
  const pic = icon(motifId ?? 'tv', palette);
  let layout = pick('layout', 4);
  // The badge's ribbon only has room for a short name.
  if (layout === 2 && name.length > 14) layout = 0;

  switch (layout) {
    // Icon on the left, name stacked on the right.
    case 0:
      return `<g transform="translate(66 105) scale(1.05)">${pic}</g>${nameBlock(name, { x: 252, y: 40, w: 196, h: 130 }, font, accent, ink)}`;
    // A slanted slab with the name in it, icon above.
    case 1:
      return (
        `<g transform="translate(180 54) scale(.92)">${pic}</g>` +
        (motifId === 'wrestling' ? barbedWire(102, ink) + barbedWire(200, ink) : '') +
        `<g transform="skewX(-10) translate(18 0)"><rect x="14" y="108" width="332" height="84" rx="6" fill="${main}" stroke="${ink}" stroke-width="5"/></g>` +
        nameBlock(name, { x: 180, y: 112, w: 296, h: 76 }, font, '#fff', ink)
      );
    // A round badge with a ribbon across it.
    case 2:
      return (
        `<circle cx="180" cy="92" r="84" fill="${main}" stroke="${ink}" stroke-width="6"/><circle cx="180" cy="92" r="72" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="4 6"/>` +
        `<g transform="translate(180 74) scale(1.05)">${pic}</g>` +
        `<path d="M14 128 h332 l-16 30 l16 30 h-332 l16 -30z" fill="${accent}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>` +
        nameBlock(name, { x: 180, y: 134, w: 280, h: 48 }, font === 'Pacifico' ? 'Oswald' : font, ink, accent === '#ffffff' ? main : '#ffffff', 'middle', true, true)
      );
    // Script name with a swoosh, small icon.
    default:
      return (
        `<g transform="translate(50 52) scale(.8)">${pic}</g>` +
        nameBlock(name, { x: 204, y: 36, w: 264, h: 124 }, theme === 'modern' ? 'Righteous' : 'Pacifico', accent, ink, 'middle', false) +
        `<path d="M40 182 C 140 150, 240 210, 330 166" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round"/><path d="M40 182 C 140 150, 240 210, 330 166" fill="none" stroke="${main}" stroke-width="6" stroke-linecap="round"/>`
      );
  }
}

function barbedWire(y: number, ink: string) {
  let d = `M0 ${y}`;
  for (let x = 0; x < 360; x += 24) d += ` l12 -7 l12 7`;
  const barbs = Array.from({ length: 8 }, (_, i) => `<path d="M${22 + i * 46} ${y - 12} l8 12 l-8 12 M${30 + i * 46} ${y - 12} l-8 12 l8 12" stroke="${ink}" stroke-width="3" fill="none"/>`).join('');
  return `<path d="${d}" fill="none" stroke="#9aa0a6" stroke-width="3"/>${barbs}`;
}
