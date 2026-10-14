import { useMemo } from 'preact/hooks';
import { AUTO_HAND_LOGO, HAND_LOGOS } from './hand';
import { generateLogo, type LogoTheme } from './generate';
import './fonts.css';

export interface LogoChannel {
  id: string;
  name: string;
  logo?: string;
  packId?: string;
  logoHint?: string;
  /** The manager has sources instead of a hint. */
  sources?: { title: string }[];
}

/** What a channel shows: its own choice, else its pack's (or default channel's) hand-drawn logo, else a generated one. */
export function logoSpec(channel: LogoChannel): string {
  if (channel.logo) return channel.logo;
  const hand = AUTO_HAND_LOGO[channel.packId ?? ''] ?? AUTO_HAND_LOGO[channel.id];
  return hand ? `hand:${hand}` : 'gen:0';
}

/** SVG markup for a channel's logo, or null for "number only". */
export function logoSvg(channel: LogoChannel, theme: LogoTheme): string | null {
  const spec = logoSpec(channel);
  if (spec === 'none') return null;
  if (spec.startsWith('hand:')) {
    const hand = HAND_LOGOS[spec.slice(5)];
    if (hand) return hand.svg;
  }
  const seed = spec.startsWith('gen:') ? Number(spec.slice(4)) || 0 : 0;
  const hint = channel.logoHint ?? channel.sources?.map((s) => s.title).join(' · ') ?? '';
  return generateLogo({ name: channel.name, hint, seed, theme });
}

export function Logo({ channel, theme, class: cls = '' }: { channel: LogoChannel; theme: LogoTheme; class?: string }) {
  const svg = useMemo(() => logoSvg(channel, theme), [channel.id, channel.name, channel.logo, channel.packId, channel.logoHint, theme]);
  if (!svg) return null;
  return <svg class={`logo ${cls}`} viewBox="0 0 360 210" role="img" aria-label={channel.name} dangerouslySetInnerHTML={{ __html: svg }} />;
}
