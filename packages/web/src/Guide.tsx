import type { MutableRef } from 'preact/hooks';
import { useEffect, useRef, useState } from 'preact/hooks';
import { now } from './clock';
import type { Action } from './keys';

interface GuideBlock {
  title: string;
  startMs: number;
  endMs: number;
  kind: 'show' | 'break' | 'offair';
  slot?: boolean;
}

interface GuideRow {
  id: string;
  number: number;
  name: string;
  blocks: GuideBlock[];
}

const SLOT_MS = 30 * 60_000;
/** Three half-hour columns on screen, like the classic grid. */
const WINDOW_MS = 3 * SLOT_MS;
/** How far past the window to fetch, so paging right doesn't wait on the network. */
const FETCH_AHEAD_MS = 3 * 3600_000;
/** The schedule is generated 12 h ahead; don't page past what exists. */
const MAX_AHEAD_MS = 11 * 3600_000;
const VISIBLE_ROWS = 6;

const floorToSlot = (ms: number) => Math.floor(ms / SLOT_MS) * SLOT_MS;
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

export interface GuideProps {
  /** Number of the channel playing now (its row is marked and focused on open). */
  currentNumber: number | undefined;
  /** The guide sets this each render; App routes remote keys to it while the guide is open. */
  actionRef: MutableRef<((action: Action) => boolean) | null>;
  onTune: (channelNumber: number) => void;
  onSettings: () => void;
  onClose: () => void;
}

/**
 * The TV guide: the live channel shrinks into the top-left corner (App moves
 * the video), details of the highlighted programme sit beside it, and the grid
 * of channels × half-hours fills the bottom.
 */
export function Guide({ currentNumber, actionRef, onTune, onSettings, onClose }: GuideProps) {
  const [rows, setRows] = useState<GuideRow[]>([]);
  const [fetched, setFetched] = useState<{ from: number; to: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(() => floorToSlot(now()));
  /** -1 is the Settings button in the header. */
  const [row, setRow] = useState(0);
  const [focusMs, setFocusMs] = useState(() => now());
  const [, setTick] = useState(0);
  const loading = useRef(false);

  async function load(from: number) {
    if (loading.current) return;
    loading.current = true;
    try {
      const to = from + WINDOW_MS + FETCH_AHEAD_MS;
      const res = await fetch(`/api/guide?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { channels: GuideRow[] };
      setRows(body.channels);
      setFetched({ from, to });
      setError(null);
    } catch (err) {
      setError(`Couldn't load the guide (${(err as Error).message})`);
    } finally {
      loading.current = false;
    }
  }

  // Load on open, focus the channel that's playing, and keep the time line moving.
  useEffect(() => {
    void load(floorToSlot(now()));
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const i = rows.findIndex((r) => r.number === currentNumber);
    if (i >= 0 && row === 0) setRow(i);
  }, [rows.length]);

  // Refetch when paging moves the window past what we have (or the data goes stale).
  useEffect(() => {
    if (!fetched) return;
    const nowSlot = floorToSlot(now());
    if (windowStart < fetched.from || windowStart + WINDOW_MS > fetched.to || fetched.from < nowSlot) {
      void load(Math.max(nowSlot, windowStart));
    }
  });

  const t = now();
  const earliest = floorToSlot(t);
  const windowEnd = windowStart + WINDOW_MS;
  const blocksOf = (r: number) => rows[r]?.blocks ?? [];
  const blockAt = (r: number, ms: number) => {
    const blocks = blocksOf(r);
    return blocks.find((b) => b.startMs <= ms && ms < b.endMs) ?? blocks.find((b) => b.startMs >= ms) ?? blocks[blocks.length - 1];
  };
  const focused = row >= 0 ? blockAt(row, focusMs) : undefined;

  /** Slide the window so the block (or time) is visible, in half-hour steps. */
  function reveal(startMs: number, endMs: number) {
    let start = windowStart;
    while (startMs >= start + WINDOW_MS) start += SLOT_MS;
    while (endMs <= start && start > earliest) start -= SLOT_MS;
    setWindowStart(Math.max(earliest, Math.min(start, floorToSlot(t + MAX_AHEAD_MS))));
  }

  actionRef.current = (action) => {
    switch (action.type) {
      case 'channelUp': // ▲: up a row, or onto the Settings button
        setRow(Math.max(-1, row - 1));
        return true;
      case 'channelDown':
        setRow(Math.min(rows.length - 1, row + 1));
        return true;
      case 'left': {
        if (row < 0 || !focused) return true;
        const prev = blockAt(row, focused.startMs - 1);
        if (prev && prev !== focused && prev.endMs > t) {
          setFocusMs(Math.max(prev.startMs, t));
          reveal(prev.startMs, prev.endMs);
        }
        return true;
      }
      case 'right': {
        if (row < 0 || !focused) return true;
        if (focused.endMs > t + MAX_AHEAD_MS) return true;
        const next = blockAt(row, focused.endMs);
        if (next && next !== focused) {
          setFocusMs(next.startMs);
          reveal(next.startMs, next.endMs);
        }
        return true;
      }
      case 'ok':
        if (row < 0) onSettings();
        else if (rows[row]) onTune(rows[row].number);
        return true;
      case 'digit': {
        const i = rows.findIndex((r) => String(r.number).startsWith(String(action.digit)));
        if (i >= 0) setRow(i);
        return true;
      }
      case 'back':
        onClose();
        return true;
    }
  };

  // Keep the focused row in view.
  const firstRow = Math.max(0, Math.min(Math.max(0, row) - Math.floor(VISIBLE_ROWS / 2), rows.length - VISIBLE_ROWS));
  const visible = rows.slice(firstRow, firstRow + VISIBLE_ROWS);
  const pct = (ms: number) => ((Math.min(Math.max(ms, windowStart), windowEnd) - windowStart) / WINDOW_MS) * 100;
  const focusedRow = row >= 0 ? rows[row] : undefined;
  const nextAfterFocused = focused && row >= 0 ? blockAt(row, focused.endMs) : undefined;

  return (
    <div class="guide">
      <div class="guide-top">
        {/* The live video sits in this space (positioned by App's .guide-open styles). */}
        <div class="guide-preview" />
        <div class="guide-details">
          {row < 0 ? (
            <>
              <div class="guide-details-ch heading">Settings</div>
              <div class="guide-details-title">Commercial breaks, CRT effect, Plex playback</div>
              <div class="guide-details-meta">Press OK to open</div>
            </>
          ) : focused && focusedRow ? (
            <>
              <div class="guide-details-ch heading">
                {focusedRow.number} {focusedRow.name}
              </div>
              <div class="guide-details-title">{focused.title}</div>
              <div class="guide-details-meta">
                {fmtTime(focused.startMs)} – {fmtTime(focused.endMs)}
                {focused.startMs <= t && t < focused.endMs ? ' · ON NOW' : ` · starts in ${Math.round((focused.startMs - t) / 60_000)} min`}
              </div>
              {nextAfterFocused && nextAfterFocused !== focused && <div class="guide-details-next">Then: {nextAfterFocused.title}</div>}
              <div class="guide-details-hint">OK watch channel {focusedRow.number}</div>
            </>
          ) : (
            <div class="guide-details-title">{error ?? 'Loading the guide…'}</div>
          )}
        </div>
      </div>

      <div class="guide-grid">
        <div class="guide-header">
          <div class={`guide-settings ${row < 0 ? 'focused' : ''}`}>⚙ Settings</div>
          <div class="guide-times">
            {[0, 1, 2].map((i) => (
              <div key={i} class="guide-time" style={{ left: `${(i / 3) * 100}%` }}>
                {fmtTime(windowStart + i * SLOT_MS)}
              </div>
            ))}
            <div class="guide-day">{fmtDay(windowStart)}</div>
          </div>
        </div>

        {visible.map((r) => {
          const index = rows.indexOf(r);
          return (
            <div key={r.id} class={`guide-row ${index === row ? 'focused-row' : ''} ${r.number === currentNumber ? 'current' : ''}`}>
              <div class="guide-channel">
                <span class="guide-channel-number">{r.number}</span>
                <span class="guide-channel-name">{r.name}</span>
              </div>
              <div class="guide-cells">
                {r.blocks
                  .filter((b) => b.endMs > windowStart && b.startMs < windowEnd)
                  .map((b) => (
                    <div
                      key={b.startMs}
                      class={`guide-cell ${b.kind} ${b.slot ? 'slot' : ''} ${index === row && b === focused ? 'focused' : ''} ${pct(b.endMs) - pct(b.startMs) < 2.5 ? 'tiny' : ''}`}
                      style={{ left: `${pct(b.startMs)}%`, width: `${pct(b.endMs) - pct(b.startMs)}%` }}
                    >
                      {b.startMs < windowStart && <span class="guide-more">◀</span>}
                      <span class="guide-cell-title">{b.title}</span>
                      {b.endMs > windowEnd && <span class="guide-more">▶</span>}
                    </div>
                  ))}
                {t >= windowStart && t < windowEnd && <div class="guide-now" style={{ left: `${pct(t)}%` }} />}
              </div>
            </div>
          );
        })}
        <div class="guide-hint">▲▼ channels · ◀▶ programmes · OK watch · Back close</div>
      </div>
    </div>
  );
}
