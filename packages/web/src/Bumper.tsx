import type { ChannelInfo, Airing } from './tuner';
import { Logo } from './logos/Logo';
import { fullTitle } from './titles';
import type { Theme } from './themes';

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtClock = (ms: number) => fmtTime(ms).replace(/\s?[AP]M$/i, '');
const fmtAmPm = (ms: number) => /([AP]M)$/i.exec(fmtTime(ms))?.[1] ?? '';

/**
 * "Coming up on <channel>": the channel's next few shows, shown over the last
 * seconds of a commercial break. One set of markup; each theme in themes.css
 * arranges it (plate and bars, blue menu, cards, lower thirds, listings page…).
 */
export function Bumper({ channel, shows, theme, nowMs }: { channel: ChannelInfo; shows: Airing[]; theme: Theme; nowMs: number }) {
  const next = shows[0];
  if (!next) return null;
  const mins = Math.max(1, Math.ceil((next.startMs - nowMs) / 60_000));
  return (
    <div class="bumper">
      {next.item.thumb && <div class="bumper-backdrop" style={{ backgroundImage: `url(${next.item.thumb})` }} />}
      <div class="bumper-head">
        <span class="bumper-badge">TV LOG</span>
        <div class="bumper-logo">
          <Logo channel={channel} theme={theme.logo} />
          <span class="bumper-logo-number">{channel.number}</span>
        </div>
        <div class="bumper-heading">
          <span class="bumper-k">Coming up</span> <span class="bumper-on">on channel {channel.number}</span>
        </div>
        <div class="bumper-chname">{channel.name}</div>
        <div class="bumper-clock">{fmtTime(nowMs)}</div>
      </div>
      {next.item.thumb && (
        <div class="bumper-photo-wrap">
          <div class="bumper-photo" style={{ backgroundImage: `url(${next.item.thumb})` }} />
          <div class="bumper-caption">Next: {fullTitle(next.item)}</div>
        </div>
      )}
      <ol class="bumper-list">
        {shows.map((a, i) => (
          <li key={a.startMs} class={i === 0 ? 'next' : ''}>
            {i === 0 && <span class="bumper-tag">Next!</span>}
            <span class="bumper-time">
              {fmtClock(a.startMs)}
              <small>{fmtAmPm(a.startMs)}</small>
            </span>
            <span class="bumper-art" style={a.item.thumb ? { backgroundImage: `url(${a.item.thumb})` } : undefined}>
              {!a.item.thumb && <Logo channel={channel} theme={theme.logo} />}
            </span>
            <span class="bumper-title">
              {i === 0 && <span class="bumper-chip">In {mins} min</span>}
              <b>{a.item.show ?? a.item.title}</b>
              {a.item.episode && <span class="bumper-episode">{a.item.episode}</span>}
              {i === 0 && a.item.description && <span class="bumper-desc">{a.item.description}</span>}
            </span>
            <span class="bumper-dots" />
          </li>
        ))}
      </ol>
      <div class="bumper-ticker">
        <b>Channel {channel.number}</b>
        {channel.name} · stay tuned
      </div>
    </div>
  );
}
