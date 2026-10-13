import type { SlotConfig, SourceRef } from '@retro-tv/schedule';
import { useEffect, useState } from 'preact/hooks';
import { AddContent } from './AddContent';

/** A slot being edited may not have content picked yet. */
export type DraftSlot = Omit<SlotConfig, 'source'> & { source: SourceRef | null };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LENGTHS = [15, 30, 45, 60, 90, 120, 150, 180, 240];
const PX_PER_HOUR = 22;

export function newSlot(): DraftSlot {
  return {
    id: `slot-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    days: [1, 2, 3, 4, 5],
    start: '20:00',
    durationMin: 30,
    order: 'next',
    source: null,
  };
}

function fmtClock(start: string, plusMin = 0): string {
  const [h, m] = start.split(':').map(Number) as [number, number];
  const total = (h * 60 + m + plusMin) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const suffix = hh < 12 ? 'am' : 'pm';
  return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${suffix}`;
}

function daysLabel(days: number[]): string {
  const key = [...days].sort().join('');
  if (key === '12345') return 'Weeknights';
  if (key === '06') return 'Weekends';
  if (key === '0123456') return 'Every day';
  return [...days].sort().map((d) => DAYS[d]).join(', ');
}

interface Props {
  slots: DraftSlot[];
  onChange: (slots: DraftSlot[]) => void;
  episodeCounts: Record<string, number>;
  plexConfigured: boolean;
}

export function Schedule({ slots, onChange, episodeCounts, plexConfigured }: Props) {
  const [picking, setPicking] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    void fetch('/api/settings')
      .then((r) => r.json())
      .then((s: { timeZone: string }) => setTimeZone(s.timeZone));
  }, []);

  async function useDeviceZone() {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeZone: deviceZone }),
    });
    if (res.ok) setTimeZone(((await res.json()) as { timeZone: string }).timeZone);
  }

  const update = (id: string, patch: Partial<DraftSlot>) => onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function add() {
    const slot = newSlot();
    onChange([...slots, slot]);
    setPicking(slot.id);
  }

  return (
    <div class="mg-card">
      <p class="mg-dim small">
        Time slots air at fixed times, like a real TV schedule. The regular programming fills the time around them
        (padded with commercials so slots start on time).
        {timeZone && (
          <>
            {' '}
            Times are in <strong>{timeZone}</strong>.
            {deviceZone !== timeZone && (
              <>
                {' '}
                <button class="mg-link-button" onClick={() => void useDeviceZone()}>
                  Use {deviceZone} (this device) instead
                </button>
              </>
            )}
          </>
        )}
      </p>

      {slots.length > 0 && <WeekGrid slots={slots} />}

      <ol class="mg-slots">
        {slots.map((slot, i) => (
          <li key={slot.id} class="mg-slot">
            <div class="mg-slot-head">
              <strong>
                {i + 1}. {slot.source?.title ?? 'Pick what plays'}
              </strong>
              <span class="mg-dim small">
                {daysLabel(slot.days)} · {fmtClock(slot.start)}–{fmtClock(slot.start, slot.durationMin)}
                {slot.source && episodeCounts[slot.id] !== undefined && ` · ${episodeCounts[slot.id]} episodes`}
              </span>
            </div>
            <div class="mg-slot-fields">
              <div class="mg-days" role="group" aria-label="Days">
                {DAYS.map((name, d) => (
                  <button
                    key={name}
                    class={slot.days.includes(d) ? 'active' : ''}
                    aria-pressed={slot.days.includes(d)}
                    onClick={() => update(slot.id, { days: slot.days.includes(d) ? slot.days.filter((x) => x !== d) : [...slot.days, d].sort() })}
                  >
                    {name[0]}
                  </button>
                ))}
              </div>
              <label>
                Starts
                <input type="time" step={300} value={slot.start} onInput={(e) => update(slot.id, { start: (e.target as HTMLInputElement).value })} />
              </label>
              <label>
                Length
                <select value={slot.durationMin} onChange={(e) => update(slot.id, { durationMin: Number((e.target as HTMLSelectElement).value) })}>
                  {[...new Set([...LENGTHS, slot.durationMin])].sort((a, b) => a - b).map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', '½ h')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Plays
                <select value={slot.order} onChange={(e) => update(slot.id, { order: (e.target as HTMLSelectElement).value as DraftSlot['order'] })}>
                  <option value="next">Next episode</option>
                  <option value="random">Random episode</option>
                </select>
              </label>
              <div class="mg-actions">
                <button onClick={() => setPicking(picking === slot.id ? null : slot.id)}>{slot.source ? 'Change show' : 'Pick show'}</button>
                <button class="mg-danger" onClick={() => onChange(slots.filter((s) => s.id !== slot.id))}>
                  Remove
                </button>
              </div>
            </div>
            {picking === slot.id && (
              <div class="mg-slot-picker">
                <AddContent
                  plexConfigured={plexConfigured}
                  added={slot.source ? [slot.source] : []}
                  onAdd={(source) => {
                    update(slot.id, { source });
                    setPicking(null);
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      <button onClick={add}>+ Add time slot</button>
    </div>
  );
}

/** Mon–Sun columns, midnight to midnight, with each slot drawn where it airs. */
function WeekGrid({ slots }: { slots: DraftSlot[] }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const blocks = slots.flatMap((slot, i) =>
    slot.days.flatMap((day) => {
      const [h, m] = slot.start.split(':').map(Number) as [number, number];
      const start = h * 60 + m;
      const end = start + slot.durationMin;
      // A slot past midnight continues at the top of the next day's column.
      const parts = [{ day, from: start, to: Math.min(end, 1440) }];
      if (end > 1440) parts.push({ day: (day + 1) % 7, from: 0, to: end - 1440 });
      return parts.map((p) => ({ ...p, i, title: slot.source?.title ?? 'New slot' }));
    }),
  );
  return (
    <div class="mg-week">
      <div class="mg-week-hours">
        {Array.from({ length: 25 }, (_, h) => (
          <div key={h} style={{ top: `${h * PX_PER_HOUR}px` }}>
            {h % 3 === 0 && h < 24 ? fmtClock(`${h}:00`) : ''}
          </div>
        ))}
      </div>
      {order.map((day) => (
        <div key={day} class="mg-week-day">
          <div class="mg-week-dayname">{DAYS[day]}</div>
          <div class="mg-week-col" style={{ height: `${24 * PX_PER_HOUR}px` }}>
            {blocks
              .filter((b) => b.day === day)
              .map((b) => (
                <div
                  key={`${b.i}-${b.from}`}
                  class={`mg-week-block c${b.i % 6}`}
                  style={{ top: `${(b.from / 60) * PX_PER_HOUR}px`, height: `${Math.max(((b.to - b.from) / 60) * PX_PER_HOUR, 6)}px` }}
                  title={b.title}
                >
                  {b.title}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
