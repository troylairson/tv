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

  cliff: {
    name: 'Cliffhanger Serials',
    svg: `
<g transform="translate(180 76) rotate(-4)">
  <rect x="-166" y="-50" width="332" height="90" fill="#ffd400" stroke="#1b1b1b" stroke-width="5"/>
  <rect x="-156" y="-40" width="312" height="70" fill="none" stroke="#d7261e" stroke-width="2"/>
  <text y="14" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="52" textLength="290" lengthAdjust="spacingAndGlyphs" fill="#d7261e" letter-spacing="2">CLIFFHANGER</text>
</g>
<text x="180" y="160" text-anchor="middle" font-family="Alfa Slab One" font-size="36" fill="#fff" letter-spacing="8" ${outlined('#1b1b1b', 7)}>SERIALS</text>
<text x="180" y="194" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="16" fill="#ffd400" letter-spacing="4" ${outlined('#1b1b1b', 5)}>TO BE CONTINUED…</text>`,
  },

  teams: {
    name: 'Comedy Teams',
    svg: `
${[
  [118, 66, 1],
  [242, 70, 1.18],
]
  .map(
    ([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})">
  <ellipse cx="0" cy="0" rx="50" ry="10" fill="#1c1c1c" stroke="#f4e3b5" stroke-width="3"/>
  <path d="M-32 0 Q-34 -46 0 -46 Q34 -46 32 0Z" fill="#1c1c1c" stroke="#f4e3b5" stroke-width="3"/>
  <rect x="-32" y="-12" width="64" height="8" fill="#6b4a2b"/>
</g>`,
  )
  .join('')}
<text x="180" y="64" text-anchor="middle" font-family="Pacifico" font-size="34" fill="#ffcc33" ${outlined('#3b1b00', 6)}>&amp;</text>
<text x="180" y="140" text-anchor="middle" font-family="Alfa Slab One" font-size="56" textLength="290" lengthAdjust="spacingAndGlyphs" fill="#ffcc33" ${outlined('#3b1b00', 7)}>COMEDY</text>
<text x="180" y="184" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="30" fill="#fff" letter-spacing="16" ${outlined('#3b1b00', 7)}>TEAMS</text>`,
  },

  drivein: {
    name: 'Drive-In (double features)',
    svg: `
<polygon points="20,32 266,32 266,14 344,88 266,162 266,144 20,144" fill="#0e6f73" stroke="#ffe9a8" stroke-width="5" stroke-linejoin="round"/>
<g fill="#ffe27a">${Array.from({ length: 13 }, (_, i) => `<circle cx="${36 + i * 18}" cy="44" r="4"/><circle cx="${36 + i * 18}" cy="132" r="4"/>`).join('')}</g>
<text x="146" y="106" text-anchor="middle" font-family="Pacifico" font-size="50" textLength="220" lengthAdjust="spacingAndGlyphs" fill="#ff5c8a" ${outlined('#3b0a1e', 6)}>Drive-In</text>
<polygon points="${star(300, 88, 16)}" fill="#ffe27a" stroke="#3b0a1e" stroke-width="2"/>
<text x="180" y="194" text-anchor="middle" font-family="Bungee" font-size="22" textLength="300" lengthAdjust="spacingAndGlyphs" fill="#ffe27a" ${outlined('#0b2e30', 6)}>DOUBLE FEATURE</text>`,
  },

  rewind: {
    name: '80s Rewind (cartoons)',
    svg: `
<defs><linearGradient id="rewind-hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe14d"/><stop offset=".55" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff2e88"/></linearGradient></defs>
<g stroke="#ff2e88" stroke-width="2" opacity=".8">${[176, 186, 198].map((y) => `<line x1="20" y1="${y}" x2="340" y2="${y}"/>`).join('')}${[-120, -60, 0, 60, 120].map((d) => `<line x1="${180 + d * 0.3}" y1="172" x2="${180 + d * 1.4}" y2="208"/>`).join('')}</g>
<rect x="18" y="34" width="112" height="86" rx="14" fill="#ff2e88" stroke="#2a0a4a" stroke-width="5"/>
<path d="M70 52 L32 77 L70 102Z M114 52 L76 77 L114 102Z" fill="#fff"/>
<text x="246" y="116" text-anchor="middle" font-family="Bungee" font-size="80" textLength="196" lengthAdjust="spacingAndGlyphs" fill="url(#rewind-hot)" ${outlined('#2a0a4a', 7)}>80s</text>
<text x="180" y="160" text-anchor="middle" font-family="Orbitron" font-weight="900" font-size="24" textLength="320" lengthAdjust="spacingAndGlyphs" fill="#3ff0ff" ${outlined('#2a0a4a', 6)}>CARTOON REWIND</text>`,
  },

  fight: {
    name: 'Fight Night (boxing)',
    svg: `
<defs><linearGradient id="fight-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#e0b232"/><stop offset="1" stop-color="#9a7108"/></linearGradient></defs>
<rect x="8" y="66" width="344" height="80" rx="10" fill="#b3121a" stroke="#3a0507" stroke-width="5"/>
<rect x="18" y="76" width="324" height="60" rx="6" fill="none" stroke="#ff8a8a" stroke-width="2" stroke-dasharray="6 5"/>
<rect x="26" y="84" width="40" height="44" rx="6" fill="url(#fight-gold)" stroke="#6b4a00" stroke-width="3"/>
<rect x="294" y="84" width="40" height="44" rx="6" fill="url(#fight-gold)" stroke="#6b4a00" stroke-width="3"/>
<ellipse cx="180" cy="106" rx="110" ry="84" fill="url(#fight-gold)" stroke="#6b4a00" stroke-width="5"/>
<ellipse cx="180" cy="106" rx="94" ry="68" fill="none" stroke="#fff3b0" stroke-width="2"/>
<polygon points="${star(180, 52, 13)}" fill="#b3121a" stroke="#6b4a00" stroke-width="2"/>
<text x="180" y="112" text-anchor="middle" font-family="Alfa Slab One" font-size="46" textLength="168" lengthAdjust="spacingAndGlyphs" fill="#b3121a" ${outlined('#fff3b0', 4)}>FIGHT</text>
<text x="180" y="148" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="28" fill="#3a2500" letter-spacing="10">NIGHT</text>`,
  },

  gumshoe: {
    name: 'Gumshoe TV (detectives)',
    svg: `
<line x1="128" y1="132" x2="174" y2="180" stroke="#1f2a33" stroke-width="22" stroke-linecap="round"/>
<line x1="132" y1="136" x2="170" y2="176" stroke="#7a4421" stroke-width="12" stroke-linecap="round"/>
<circle cx="88" cy="90" r="62" fill="#dfeef4" fill-opacity=".9" stroke="#1f2a33" stroke-width="11"/>
<path d="M56 64 a40 40 0 0 1 30 -16" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
<text x="88" y="108" text-anchor="middle" font-family="Alfa Slab One" font-size="50" fill="#1f2a33">TV</text>
<text x="186" y="98" font-family="Oswald" font-weight="700" font-size="44" textLength="160" lengthAdjust="spacingAndGlyphs" fill="#f2e3c0" ${outlined('#1f2a33', 7)}>GUMSHOE</text>
<text x="188" y="128" font-family="Oswald" font-weight="700" font-size="15" textLength="156" lengthAdjust="spacingAndGlyphs" fill="#ffcf3f" letter-spacing="3" ${outlined('#1f2a33', 5)}>JUST THE FACTS</text>`,
  },

  hearth: {
    name: 'Holiday Hearth (Christmas)',
    svg: `
<g>${Array.from({ length: 20 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2;
      return `<circle cx="${(96 + 62 * Math.cos(a)).toFixed(1)}" cy="${(96 + 62 * Math.sin(a)).toFixed(1)}" r="19" fill="${i % 2 ? '#1f7a3a' : '#2e9a4c'}" stroke="#0d3b1b" stroke-width="2"/>`;
    }).join('')}</g>
<g fill="#d7261e" stroke="#5a0a0a" stroke-width="1.5">${[0.6, 2.2, 3.4, 4.6, 5.6].map((a) => `<circle cx="${(96 + 66 * Math.cos(a)).toFixed(1)}" cy="${(96 + 66 * Math.sin(a)).toFixed(1)}" r="6"/>`).join('')}</g>
<path d="M96 160 L66 140 L68 180Z M96 160 L126 140 L124 180Z" fill="#d7261e" stroke="#5a0a0a" stroke-width="3" stroke-linejoin="round"/>
<circle cx="96" cy="160" r="9" fill="#e53935" stroke="#5a0a0a" stroke-width="3"/>
<text x="268" y="92" text-anchor="middle" font-family="Pacifico" font-size="44" textLength="160" lengthAdjust="spacingAndGlyphs" fill="#fff" ${outlined('#7a0d12', 7)}>Holiday</text>
<text x="268" y="144" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="34" textLength="150" lengthAdjust="spacingAndGlyphs" fill="#ffd36b" letter-spacing="6" ${outlined('#3b0a0a', 7)}>HEARTH</text>
<g fill="#fff">${[
      [200, 30],
      [338, 40],
      [226, 186],
      [330, 180],
    ]
      .map(([x, y]) => `<polygon points="${star(x!, y!, 6)}"/>`)
      .join('')}</g>`,
  },

  jukebox: {
    name: 'Soundies (jukebox music)',
    svg: `
<path d="M72 206 V122 A108 108 0 0 1 288 122 V206Z" fill="#7a1f1f" stroke="#ffcc4d" stroke-width="6"/>
${[
  ['#ff5a36', 94],
  ['#ffcc4d', 82],
  ['#43d9ad', 70],
]
  .map(([c, r]) => `<path d="M${180 - (r as number)} 122 A${r} ${r} 0 0 1 ${180 + (r as number)} 122" fill="none" stroke="${c}" stroke-width="9"/>`)
  .join('')}
<rect x="104" y="146" width="152" height="52" rx="6" fill="#2a0b0b" stroke="#ffcc4d" stroke-width="3"/>
<g stroke="#ffcc4d" stroke-width="2" opacity=".5">${Array.from({ length: 9 }, (_, i) => `<line x1="${116 + i * 16}" y1="152" x2="${116 + i * 16}" y2="192"/>`).join('')}</g>
<text x="180" y="180" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="17" fill="#ffcc4d" letter-spacing="8" ${outlined('#2a0b0b', 5)}>JUKEBOX</text>
<text x="180" y="126" text-anchor="middle" font-family="Pacifico" font-size="54" textLength="250" lengthAdjust="spacingAndGlyphs" fill="#fff" ${outlined('#5a0f0f', 8)}>Soundies</text>
<text x="34" y="66" font-family="Fredoka" font-weight="700" font-size="40" fill="#ffcc4d" ${outlined('#5a0f0f', 5)}>♪</text>
<text x="306" y="56" font-family="Fredoka" font-weight="700" font-size="40" fill="#43d9ad" ${outlined('#5a0f0f', 5)}>♫</text>`,
  },

  kiddie: {
    name: 'Kiddie Matinee (kids TV)',
    svg: `
<defs><clipPath id="kiddie-tent"><rect x="20" y="10" width="320" height="44"/></clipPath></defs>
<g clip-path="url(#kiddie-tent)">${Array.from({ length: 8 }, (_, i) => `<rect x="${20 + i * 40}" y="10" width="40" height="44" fill="${i % 2 ? '#fff' : '#e53935'}"/>`).join('')}</g>
<g stroke="#2b1a5a" stroke-width="3">${Array.from({ length: 8 }, (_, i) => `<path d="M${20 + i * 40} 54 a20 20 0 0 0 40 0Z" fill="${i % 2 ? '#fff' : '#e53935'}"/>`).join('')}</g>
<rect x="20" y="10" width="320" height="44" fill="none" stroke="#2b1a5a" stroke-width="3"/>
<text x="180" y="144" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="64" textLength="280" lengthAdjust="spacingAndGlyphs" ${outlined('#2b1a5a', 9)}>${[
      ['#ff5fa2', 'K'],
      ['#ffd23f', 'I'],
      ['#43c6f0', 'D'],
      ['#7ed957', 'D'],
      ['#ff8a3d', 'I'],
      ['#b388ff', 'E'],
    ]
      .map(([c, l]) => `<tspan fill="${c}">${l}</tspan>`)
      .join('')}</text>
<text x="180" y="192" text-anchor="middle" font-family="Pacifico" font-size="34" fill="#ffd23f" ${outlined('#2b1a5a', 7)}>Matinee</text>`,
  },

  kungfu: {
    name: 'Kung Fu Theater (martial arts)',
    svg: `
<circle cx="180" cy="92" r="82" fill="#d7261e" stroke="#5a0a0a" stroke-width="4"/>
<rect x="6" y="64" width="348" height="58" fill="#111"/>
<polygon points="270,120 292,120 304,172 284,176" fill="#111"/>
<polygon points="298,120 316,120 336,166 318,172" fill="#111"/>
<text x="166" y="110" text-anchor="middle" font-family="Alfa Slab One" font-size="46" textLength="270" lengthAdjust="spacingAndGlyphs" fill="#ffd400">KUNG FU</text>
<text x="150" y="196" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="30" fill="#fff" letter-spacing="12" ${outlined('#111', 7)}>THEATER</text>`,
  },

  newsreel: {
    name: 'Newsreel Theater (news)',
    svg: `
<g fill="#fff4c9" opacity=".18"><path d="M180 170 L40 0 L90 0Z"/><path d="M180 170 L270 0 L320 0Z"/></g>
<circle cx="180" cy="96" r="74" fill="#1b3a5c" stroke="#e8d9a8" stroke-width="4"/>
<g fill="none" stroke="#e8d9a8" stroke-width="2"><ellipse cx="180" cy="96" rx="28" ry="74"/><ellipse cx="180" cy="96" rx="54" ry="74"/><line x1="112" y1="66" x2="248" y2="66"/><line x1="112" y1="126" x2="248" y2="126"/></g>
<rect x="12" y="72" width="336" height="50" fill="#c9a227" stroke="#3a2a00" stroke-width="4"/>
<text x="180" y="111" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="40" textLength="300" lengthAdjust="spacingAndGlyphs" fill="#1a1a1a" letter-spacing="6">NEWSREEL</text>
<text x="180" y="198" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="24" fill="#e8d9a8" letter-spacing="12" ${outlined('#111', 6)}>THEATER</text>`,
  },

  silent: {
    name: 'Silent Laughs (title card)',
    svg: `
<rect x="14" y="16" width="332" height="178" rx="6" fill="#0d0d0d" stroke="#e9e2cf" stroke-width="3"/>
<rect x="26" y="28" width="308" height="154" fill="none" stroke="#e9e2cf" stroke-width="1.5"/>
<g fill="#e9e2cf">${[
      [26, 28],
      [334, 28],
      [26, 182],
      [334, 182],
    ]
      .map(([x, y]) => `<path d="M${x} ${y! - 8} L${x! + 8} ${y} L${x} ${y! + 8} L${x! - 8} ${y}Z"/>`)
      .join('')}</g>
<text x="180" y="94" text-anchor="middle" font-family="Limelight" font-size="52" fill="#f3eedf">Silent</text>
<text x="180" y="144" text-anchor="middle" font-family="Limelight" font-size="40" fill="#f3eedf" letter-spacing="8">LAUGHS</text>
<text x="180" y="170" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="14" fill="#bdb59f">~ with piano accompaniment ~</text>`,
  },

  space: {
    name: 'Space Race (NASA films)',
    svg: `
<circle cx="104" cy="105" r="88" fill="#0b3d91" stroke="#0b1d40" stroke-width="4"/>
<g fill="#fff">${[
      [60, 60, 2.5],
      [140, 48, 2],
      [80, 150, 2],
      [150, 140, 2.5],
      [46, 110, 1.8],
      [120, 80, 1.6],
    ]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
      .join('')}</g>
<ellipse cx="104" cy="105" rx="98" ry="28" transform="rotate(-20 104 105)" fill="none" stroke="#fff" stroke-width="3"/>
<path d="M30 150 Q100 84 196 70 Q118 100 52 168Z" fill="#fc3d21"/>
<text x="206" y="98" font-family="Orbitron" font-weight="900" font-size="40" textLength="146" lengthAdjust="spacingAndGlyphs" fill="#fff" ${outlined('#0b1d40', 7)}>SPACE</text>
<text x="206" y="146" font-family="Orbitron" font-weight="900" font-size="40" textLength="120" lengthAdjust="spacingAndGlyphs" fill="#fc3d21" ${outlined('#0b1d40', 7)}>RACE</text>`,
  },

  strange: {
    name: 'Strange Tales (the unknown)',
    svg: `
<path d="${(() => {
      const pts: string[] = [];
      for (let i = 0; i <= 220; i++) {
        const t = (i / 220) * Math.PI * 2 * 4;
        const r = 4 + (i / 220) * 92;
        pts.push(`${(180 + r * Math.cos(t)).toFixed(1)} ${(100 + r * Math.sin(t) * 0.92).toFixed(1)}`);
      }
      return `M${pts.join(' L')}`;
    })()}" fill="none" stroke="#b388ff" stroke-width="5" opacity=".85"/>
<text x="180" y="104" text-anchor="middle" font-family="Limelight" font-size="54" textLength="300" lengthAdjust="spacingAndGlyphs" fill="#e7fbff" ${outlined('#120a2e', 8)}>STRANGE</text>
<text x="180" y="156" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="32" fill="#7ff0d4" letter-spacing="16" ${outlined('#120a2e', 7)}>TALES</text>`,
  },

  taped: {
    name: 'Taped Off TV (VHS)',
    svg: `
<rect x="16" y="22" width="328" height="168" rx="10" fill="#141414" stroke="#3a3a3a" stroke-width="3"/>
<rect x="40" y="36" width="280" height="72" rx="4" fill="#f5f1e3"/>
<rect x="40" y="36" width="280" height="12" fill="#d7261e"/>
<text x="180" y="94" text-anchor="middle" font-family="Pacifico" font-size="32" textLength="230" lengthAdjust="spacingAndGlyphs" fill="#1a3b9a">Taped off TV</text>
<rect x="96" y="118" width="168" height="52" rx="6" fill="#2b2b2b" stroke="#555" stroke-width="2"/>
${[136, 224]
  .map(
    (x, i) => `<circle cx="${x}" cy="144" r="${i ? 14 : 21}" fill="#3a2a1e"/><circle cx="${x}" cy="144" r="9" fill="#ddd"/>
<g stroke="#555" stroke-width="2">${[0, 60, 120].map((a) => `<line x1="${x}" y1="138" x2="${x}" y2="150" transform="rotate(${a} ${x} 144)"/>`).join('')}</g>`,
  )
  .join('')}
<text x="30" y="182" font-family="Oswald" font-weight="700" font-size="13" fill="#bbb">SP</text>
<text x="330" y="182" text-anchor="end" font-family="Oswald" font-weight="700" font-size="13" fill="#bbb">T-120</text>`,
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
  'cliffhanger-serials': 'cliff',
  'comedy-teams': 'teams',
  'drive-in-double-feature': 'drivein',
  'eighties-cartoon-rewind': 'rewind',
  'fight-night': 'fight',
  'gumshoe-tv': 'gumshoe',
  'holiday-hearth': 'hearth',
  'jukebox-soundies': 'jukebox',
  'kiddie-matinee': 'kiddie',
  'kung-fu-theater': 'kungfu',
  'newsreel-theater': 'newsreel',
  'silent-laughs': 'silent',
  'space-race': 'space',
  'strange-tales': 'strange',
  'taped-off-tv': 'taped',
  // the default lineup, by channel id
  'ia-2': 'classic-tv',
  'ia-4': 'prelinger',
  'ia-5': 'ads',
  'ia-6': 'feature',
};
