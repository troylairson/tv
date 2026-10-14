/**
 * Hand-drawn channel logos: SVG markup for a 360×210 viewBox on a transparent
 * background. Anything that needs a backing shape draws it itself, and free text
 * carries a dark outline so it reads over video, panels and themes alike.
 * Parodies nod to real networks under their own names; they never copy a logo.
 * Ids inside a logo are prefixed with its key so two logos can share a page.
 */

/** Text with a contrasting outline drawn behind the fill. */
const outlined = (stroke: string, width: number) => `stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" paint-order="stroke"`;

const star = (x: number, y: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
};

/** A half-ring from radius r to R around (cx, cy), opening downwards. */
const arcBand = (cx: number, cy: number, R: number, r: number) =>
  `M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy} L${cx + r} ${cy} A${r} ${r} 0 0 0 ${cx - r} ${cy}Z`;

export interface HandLogo {
  name: string;
  svg: string;
}

export const HAND_LOGOS: Record<string, HandLogo> = {
  rpw: {
    name: 'RPW (wrestling)',
    svg: `
<defs><linearGradient id="rpw-chrome" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#b9c2cc"/><stop offset=".5" stop-color="#5d6670"/><stop offset="1" stop-color="#e9eef2"/>
</linearGradient></defs>
<g transform="translate(180 88) skewX(-10)">
  <rect x="-150" y="-72" width="300" height="116" fill="#c8102e"/>
  <rect x="-139" y="-61" width="278" height="94" fill="#0b0b0f"/>
  <text x="0" y="20" text-anchor="middle" font-family="Alfa Slab One" font-size="92" fill="url(#rpw-chrome)" stroke="#000" stroke-width="2" letter-spacing="2">RPW</text>
</g>
<polygon points="${star(24, 22, 15)}" fill="#c8102e" ${outlined('#0b0b0f', 3)}/>
<polygon points="${star(336, 22, 15)}" fill="#c8102e" ${outlined('#0b0b0f', 3)}/>
<text x="180" y="190" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="25" fill="#fff" letter-spacing="5" ${outlined('#0b0b0f', 6)}>RETRO PRO WRESTLING</text>`,
  },

  nite: {
    name: 'TV at Nite (sitcoms)',
    svg: `
<g fill="#ffd23f">
  <polygon points="${star(300, 34, 8)}"/><polygon points="${star(340, 72, 6)}"/><polygon points="${star(28, 182, 6)}"/>
</g>
<path d="M88 22 a84 84 0 1 0 84 130 a67 67 0 1 1 -84 -130z" fill="#ffd23f" stroke="#101a4a" stroke-width="4"/>
<g transform="translate(118 112)">
  <line x1="26" y1="-50" x2="12" y2="-72" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <line x1="70" y1="-50" x2="84" y2="-72" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <rect x="-10" y="-52" width="116" height="84" rx="14" fill="#ff5fa2" stroke="#fff" stroke-width="5"/>
  <text x="48" y="4" text-anchor="middle" font-family="Bungee" font-size="44" fill="#fff" ${outlined('#9c1257', 4)}>TV</text>
</g>
<text x="228" y="168" font-family="Pacifico" font-size="42" fill="#7fe3ff" transform="rotate(-8 228 168)" ${outlined('#101a4a', 7)}>at Nite</text>`,
  },

  shock: {
    name: 'Shock Theater (horror)',
    svg: `
<defs><radialGradient id="shock-moon"><stop offset="0" stop-color="#f6f3c2"/><stop offset="1" stop-color="#b9b36a"/></radialGradient></defs>
<circle cx="292" cy="56" r="50" fill="url(#shock-moon)"/>
<text x="16" y="96" font-family="Creepster" font-size="90" fill="#7dff4f" ${outlined('#0b2a0b', 7)}>SHOCK</text>
<g fill="#7dff4f" stroke="#0b2a0b" stroke-width="2"><path d="M58 94 q4 18 0 26 q-4 -8 0 -26z"/><path d="M152 94 q4 24 0 34 q-4 -10 0 -34z"/><path d="M206 94 q3 12 0 18 q-3 -6 0 -18z"/></g>
<text x="30" y="178" font-family="Creepster" font-size="66" fill="#e8f5d0" letter-spacing="3" ${outlined('#0b2a0b', 7)}>THEATER</text>`,
  },

  saddle: {
    name: 'Saddle Up (westerns)',
    svg: `
<rect x="16" y="82" width="328" height="112" rx="14" fill="#8b4a1c" stroke="#4a2209" stroke-width="6"/>
<path d="M36 112 h110 M200 176 h120 M44 170 h70 M250 108 h70" stroke="#6e3711" stroke-width="4" stroke-linecap="round"/>
<circle cx="34" cy="100" r="5" fill="#4a2209"/><circle cx="326" cy="100" r="5" fill="#4a2209"/><circle cx="34" cy="176" r="5" fill="#4a2209"/><circle cx="326" cy="176" r="5" fill="#4a2209"/>
<polygon points="${star(180, 62, 58)}" fill="#e0b232" stroke="#4a2209" stroke-width="5" stroke-linejoin="round"/>
<circle cx="180" cy="66" r="15" fill="#8b4a1c" stroke="#4a2209" stroke-width="3"/>
<text x="180" y="156" text-anchor="middle" font-family="Rye" font-size="48" fill="#f6e7c1" ${outlined('#4a2209', 4)}>SADDLE UP</text>
<text x="180" y="182" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="15" fill="#f6c56b" letter-spacing="8">WESTERNS ALL DAY</text>`,
  },

  gsc: {
    name: 'GSC (game shows)',
    svg: `
<rect x="24" y="14" width="312" height="134" rx="20" fill="#f2b705" stroke="#5a3a00" stroke-width="4"/>
<rect x="40" y="30" width="280" height="102" rx="11" fill="#1d0a2c"/>
<g fill="#fff6c9" stroke="#b07a00" stroke-width="1.5">
  ${[46, 86, 126, 166, 206, 246, 286, 314].map((x) => `<circle cx="${x}" cy="22" r="5"/><circle cx="${x}" cy="140" r="5"/>`).join('')}
</g>
<text x="180" y="110" text-anchor="middle" font-family="Bungee Shade" font-size="72" fill="#ff4fa3">GSC</text>
<text x="180" y="190" text-anchor="middle" font-family="Bungee" font-size="22" fill="#f2b705" letter-spacing="2" ${outlined('#2a0d3e', 6)}>GAME SHOW CLASSICS</text>`,
  },

  atomic: {
    name: 'Atomic Age (sci-fi)',
    svg: `
<g transform="translate(84 105)" fill="none" stroke="#ff7b54" stroke-width="7">
  <ellipse rx="72" ry="26" stroke="#0f3b3e" stroke-width="13"/><ellipse rx="72" ry="26" transform="rotate(60)" stroke="#0f3b3e" stroke-width="13"/><ellipse rx="72" ry="26" transform="rotate(-60)" stroke="#0f3b3e" stroke-width="13"/>
  <ellipse rx="72" ry="26"/><ellipse rx="72" ry="26" transform="rotate(60)"/><ellipse rx="72" ry="26" transform="rotate(-60)"/>
  <circle r="14" fill="#ffd166" stroke="#0f3b3e" stroke-width="4"/>
</g>
<text x="170" y="88" font-family="Righteous" font-size="46" fill="#f4f1de" ${outlined('#0f3b3e', 7)}>ATOMIC</text>
<text x="170" y="136" font-family="Righteous" font-size="46" fill="#ffd166" ${outlined('#0f3b3e', 7)}>AGE</text>
<text x="172" y="168" font-family="Oswald" font-weight="700" font-size="19" fill="#7fd1c7" letter-spacing="8" ${outlined('#0f3b3e', 5)}>THEATER</text>`,
  },

  noir: {
    name: 'Noir After Dark (film noir)',
    svg: `
<defs>
  <clipPath id="noir-card"><rect x="10" y="16" width="340" height="178" rx="12"/></clipPath>
  <pattern id="noir-blinds" width="360" height="20" patternUnits="userSpaceOnUse" patternTransform="skewY(-14)"><rect width="360" height="10" fill="#2b2b2b"/></pattern>
</defs>
<g clip-path="url(#noir-card)">
  <rect x="10" y="16" width="340" height="178" fill="#d9d4c7"/>
  <rect x="10" y="16" width="340" height="178" fill="url(#noir-blinds)"/>
  <rect x="10" y="62" width="340" height="88" fill="#0c0c0c"/>
</g>
<rect x="10" y="16" width="340" height="178" rx="12" fill="none" stroke="#0c0c0c" stroke-width="4"/>
<text x="180" y="114" text-anchor="middle" font-family="Limelight" font-size="54" fill="#f2efe6" letter-spacing="6">NOIR</text>
<text x="180" y="142" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="19" fill="#ff4a57" letter-spacing="9">AFTER DARK</text>`,
  },

  saturday: {
    name: 'Saturday Morning (cartoons)',
    svg: `
${[
  ['#e53935', 172, 150],
  ['#fb8c00', 150, 128],
  ['#fdd835', 128, 106],
  ['#43a047', 106, 84],
  ['#1e88e5', 84, 62],
]
  .map(([c, R, r]) => `<path d="${arcBand(180, 210, R as number, r as number)}" fill="${c}"/>`)
  .join('')}
<text x="180" y="70" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="54" fill="#fff" ${outlined('#3a1c71', 9)}>SATURDAY</text>
<text x="180" y="130" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="54" fill="#fff" ${outlined('#3a1c71', 9)}>MORNING</text>
<text x="180" y="198" text-anchor="middle" font-family="Pacifico" font-size="30" fill="#ffe14d" ${outlined('#3a1c71', 7)}>cartoons!</text>`,
  },

  'classic-tv': {
    name: 'Classic TV (the eye)',
    svg: `
<ellipse cx="180" cy="86" rx="132" ry="70" fill="#fff" stroke="#111" stroke-width="5"/>
<rect x="114" y="36" width="132" height="100" rx="18" fill="#111"/>
<rect x="126" y="48" width="108" height="76" rx="11" fill="#3d7bd9"/>
<text x="180" y="104" text-anchor="middle" font-family="Alfa Slab One" font-size="44" fill="#fff">TV</text>
<text x="180" y="192" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="28" fill="#fff" letter-spacing="9" ${outlined('#111', 6)}>CLASSIC TV</text>`,
  },

  ads: {
    name: 'ADS neon (commercials)',
    svg: `
<defs><filter id="ads-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect x="14" y="14" width="332" height="182" rx="22" fill="#1a0820" stroke="#3a1640" stroke-width="6"/>
<text x="180" y="116" text-anchor="middle" font-family="Monoton" font-size="86" fill="none" stroke="#ff3fa4" stroke-width="2.5" filter="url(#ads-glow)">ADS</text>
<text x="180" y="170" text-anchor="middle" font-family="Pacifico" font-size="30" fill="#40e0ff" filter="url(#ads-glow)">and now a word…</text>`,
  },

  feature: {
    name: 'Feature Presentation (movies)',
    svg: `
<defs><linearGradient id="feature-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#d4a017"/><stop offset="1" stop-color="#8a6508"/></linearGradient></defs>
<g fill="#fff" opacity=".16"><path d="M168 210 L40 0 L86 0 L184 210z"/><path d="M176 210 L274 0 L320 0 L192 210z"/></g>
<text x="180" y="96" text-anchor="middle" font-family="Limelight" font-size="48" fill="url(#feature-gold)" letter-spacing="3" ${outlined('#1a1206', 6)}>FEATURE</text>
<text x="180" y="150" text-anchor="middle" font-family="Limelight" font-size="40" fill="url(#feature-gold)" letter-spacing="2" ${outlined('#1a1206', 6)}>PRESENTATION</text>`,
  },

  prelinger: {
    name: 'Prelinger (educational films)',
    svg: `
<rect x="8" y="30" width="344" height="150" rx="16" fill="#e8e2cf" stroke="#2e4a62" stroke-width="5"/>
<g transform="translate(84 105)" fill="#2e4a62">
  <circle r="42"/>
  ${[0, 45, 90, 135].map((a) => `<rect x="-9" y="-58" width="18" height="116" transform="rotate(${a})"/>`).join('')}
  <circle r="19" fill="#e8e2cf"/>
</g>
<text x="152" y="100" font-family="Oswald" font-weight="700" font-size="36" fill="#2e4a62">PRELINGER</text>
<text x="153" y="124" font-family="Oswald" font-weight="700" font-size="12.5" fill="#b5442b" letter-spacing="1.5">EDUCATIONAL • INDUSTRIAL</text>
<text x="153" y="148" font-family="Georgia, serif" font-style="italic" font-size="13.5" fill="#2e4a62">“A better tomorrow, today”</text>`,
  },
};

/** The hand-drawn logo each channel pack and default channel gets automatically. */
export const AUTO_HAND_LOGO: Record<string, string> = {
  // packs
  'retro-pro-wrestling': 'rpw',
  'classic-sitcoms': 'nite',
  'shock-theater': 'shock',
  'saddle-up-westerns': 'saddle',
  'game-show-classics': 'gsc',
  'atomic-age-sci-fi': 'atomic',
  'film-noir-after-dark': 'noir',
  'saturday-morning-cartoons': 'saturday',
  // the default lineup, by channel id
  'ia-2': 'classic-tv',
  'ia-4': 'prelinger',
  'ia-5': 'ads',
  'ia-6': 'feature',
};
