import type { ChannelItem, SourceRef } from '@retro-tv/schedule';
import { useEffect, useState } from 'preact/hooks';
import { AddContent } from './AddContent';
import { api, fmtDuration, sourceLabel, type ChannelFields, type ChannelStatus, type PackInfo, type PreviewBlock } from './api';
import { Schedule, type DraftSlot } from './Schedule';

type Route = { page: 'list' } | { page: 'new' } | { page: 'edit'; id: string };

function parseRoute(): Route {
  const rest = location.pathname.replace(/^\/manage\/?/, '');
  if (!rest) return { page: 'list' };
  if (rest === 'new') return { page: 'new' };
  return { page: 'edit', id: decodeURIComponent(rest) };
}

function go(path: string) {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

/** The channel manager: a regular phone/laptop page at /manage. */
export function Manager() {
  const [route, setRoute] = useState<Route>(parseRoute);
  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  return (
    <div class="mg">
      <header class="mg-header">
        <a
          href="/manage"
          class="mg-brand"
          onClick={(e) => {
            e.preventDefault();
            go('/manage');
          }}
        >
          RETRO TV <span>Channel manager</span>
        </a>
        <a class="mg-link" href="/">
          Open the TV ↗
        </a>
      </header>
      <main class="mg-main">
        {route.page === 'list' && <ChannelList />}
        {route.page === 'new' && <Editor id={null} />}
        {route.page === 'edit' && <Editor id={route.id} key={route.id} />}
      </main>
    </div>
  );
}

function ChannelList() {
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .channels()
      .then((r) => setChannels(r.channels))
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function remove(c: ChannelStatus) {
    if (!confirm(`Delete channel ${c.number} ${c.name}? This can't be undone.`)) return;
    await api.remove(c.id).catch((e: Error) => alert(e.message));
    void load();
  }

  return (
    <section>
      <div class="mg-titlebar">
        <h1>Channels</h1>
        <button class="mg-primary" onClick={() => go('/manage/new')}>
          + New channel
        </button>
      </div>
      {error && <p class="mg-error">{error}</p>}
      {!channels && !error && <p class="mg-dim">Loading…</p>}
      <ul class="mg-channels">
        {channels?.map((c) => (
          <li key={c.id} class="mg-channel">
            <span class="mg-channel-number">{c.number}</span>
            <div class="mg-channel-body">
              <div class="mg-channel-name">{c.name}</div>
              <div class="mg-dim">
                {c.sources.length === 1 ? c.sources[0]!.title : `${c.sources.length} sources`} · {c.itemCount} items ·{' '}
                {fmtDuration(c.totalSec)} · {c.mode === 'loop' ? 'in order' : 'shuffled'}
                {c.breaks ? ' · commercials' : ''}
              </div>
              {c.resolving && <div class="mg-badge">Updating…</div>}
              {!c.resolving && c.itemCount === 0 && <div class="mg-badge warn">Nothing to play yet: add content</div>}
              {c.errors.length > 0 && <div class="mg-error small">{c.errors.join(' · ')}</div>}
            </div>
            <div class="mg-actions">
              <button onClick={() => go(`/manage/${encodeURIComponent(c.id)}`)}>Edit</button>
              <button class="mg-danger" onClick={() => void remove(c)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Form = Omit<ChannelFields, 'slots'> & { slots: DraftSlot[] };

const EMPTY: Form = { number: 0, name: '', mode: 'loop', breaks: true, sources: [], excluded: [], slots: [] };

function Editor({ id }: { id: string | null }) {
  const [saved, setSaved] = useState<ChannelStatus | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [plexConfigured, setPlexConfigured] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const r = await api.channels();
    setPlexConfigured(r.plexConfigured);
    if (!id) {
      if (!dirty) {
        const used = new Set(r.channels.map((c) => c.number));
        let n = 2;
        while (used.has(n)) n++;
        setForm((f) => (f.number ? f : { ...f, number: n }));
      }
      return;
    }
    const c = r.channels.find((ch) => ch.id === id) ?? null;
    setSaved(c);
    if (c && !dirty) setForm({ number: c.number, name: c.name, mode: c.mode, breaks: c.breaks, sources: c.sources, excluded: c.excluded, slots: c.slots ?? [] });
  };

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  // While the server is resolving sources, keep the status fresh.
  useEffect(() => {
    if (!saved?.resolving && saved?.upToDate !== false) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [saved?.resolving, saved?.upToDate, dirty]);

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setNotice(null);
  };

  const addSource = (s: SourceRef) => {
    if (form.sources.some((x) => JSON.stringify(x) === JSON.stringify(s))) return;
    set({ sources: [...form.sources, s] });
    setNotice(`Added “${s.title}”. Save to apply.`);
  };

  const moveSource = (i: number, delta: number) => {
    const sources = form.sources.slice();
    const [s] = sources.splice(i, 1);
    sources.splice(i + delta, 0, s!);
    set({ sources });
  };

  async function save() {
    const unpicked = form.slots.findIndex((s) => !s.source);
    if (unpicked >= 0) {
      setError(`Time slot ${unpicked + 1}: pick a show first`);
      return;
    }
    const fields: ChannelFields = { ...form, slots: form.slots.map((s) => ({ ...s, source: s.source! })) };
    setSaving(true);
    setError(null);
    try {
      if (id) {
        await api.update(id, fields);
        setDirty(false);
        setNotice('Saved. Changes start after what’s on now.');
        await load();
      } else {
        const created = await api.create({ ...fields, name: fields.name || 'New Channel' });
        go(`/manage/${encodeURIComponent(created.id)}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (id && !saved && !error) return <p class="mg-dim">Loading…</p>;
  if (id && !saved) return <p class="mg-error">{error ?? 'No such channel'}</p>;

  return (
    <section>
      <div class="mg-titlebar">
        <h1>{id ? `Channel ${saved!.number}: ${saved!.name}` : 'New channel'}</h1>
        <button onClick={() => go('/manage')}>← All channels</button>
      </div>

      <div class="mg-card mg-form">
        <label>
          Number
          <input type="number" min={1} max={999} value={form.number || ''} onInput={(e) => set({ number: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label class="grow">
          Name
          <input value={form.name} placeholder="e.g. Sitcom Central" maxLength={40} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
        </label>
        <fieldset>
          <legend>Order</legend>
          <label class="inline">
            <input type="radio" checked={form.mode === 'loop'} onChange={() => set({ mode: 'loop' })} /> In order
          </label>
          <label class="inline">
            <input type="radio" checked={form.mode === 'shuffle'} onChange={() => set({ mode: 'shuffle' })} /> Shuffle
          </label>
        </fieldset>
        <label class="inline">
          <input type="checkbox" checked={form.breaks} onChange={(e) => set({ breaks: (e.target as HTMLInputElement).checked })} /> Commercial
          breaks between shows
        </label>
      </div>

      <h2>Regular programming</h2>
      <div class="mg-card">
        <p class="mg-dim small">Plays whenever no time slot is on. Leave it empty for a channel that's only on during its time slots.</p>
        {form.sources.length === 0 && <p class="mg-dim">Nothing yet. Add shows, movies or collections below.</p>}
        <ol class="mg-sources">
          {form.sources.map((s, i) => (
            <li key={JSON.stringify(s)}>
              <div class="mg-source-body">
                <div>{s.title}</div>
                <div class="mg-dim small">{sourceLabel(s)}</div>
              </div>
              <div class="mg-actions">
                <button disabled={i === 0} onClick={() => moveSource(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button disabled={i === form.sources.length - 1} onClick={() => moveSource(i, 1)} aria-label="Move down">
                  ↓
                </button>
                <button class="mg-danger" onClick={() => set({ sources: form.sources.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        {form.mode === 'loop' && form.sources.length > 1 && (
          <p class="mg-dim small">In order: sources play one after another, top to bottom, then repeat.</p>
        )}
      </div>

      <h2>Time slots</h2>
      <Schedule
        slots={form.slots}
        onChange={(slots) => set({ slots })}
        episodeCounts={saved?.slotItemCounts ?? {}}
        plexConfigured={plexConfigured}
      />

      <div class="mg-savebar">
        {error && <span class="mg-error">{error}</span>}
        {notice && !error && <span class="mg-notice">{notice}</span>}
        <button class="mg-primary" disabled={saving || (!dirty && !!id)} onClick={() => void save()}>
          {saving ? 'Saving…' : id ? 'Save changes' : 'Create channel'}
        </button>
      </div>

      <h2>Add to regular programming</h2>
      <AddContent plexConfigured={plexConfigured} onAdd={addSource} added={form.sources} />

      {id && saved && (
        <>
          <h2>What plays</h2>
          <Items channel={saved} onExclude={(excluded) => void api.update(id, { excluded }).then(load)} />
          <h2>Next 24 hours</h2>
          <Preview channel={saved} />
        </>
      )}
    </section>
  );
}

function Items({ channel, onExclude }: { channel: ChannelStatus; onExclude: (excluded: string[]) => void }) {
  const [items, setItems] = useState<ChannelItem[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) void api.items(channel.id).then((r) => setItems(r.items));
  }, [open, channel.resolvedAt]);

  return (
    <div class="mg-card">
      <div class="mg-row">
        <span>
          {channel.resolving ? 'Updating… ' : ''}
          {channel.itemCount} items · {fmtDuration(channel.totalSec)}
          {channel.excluded.length > 0 && ` · ${channel.excluded.length} removed`}
        </span>
        <span class="mg-actions">
          {channel.excluded.length > 0 && <button onClick={() => onExclude([])}>Restore removed</button>}
          <button onClick={() => void api.refresh(channel.id)}>Refresh from sources</button>
          <button onClick={() => setOpen(!open)}>{open ? 'Hide list' : 'Show list'}</button>
        </span>
      </div>
      {channel.errors.length > 0 && <p class="mg-error small">{channel.errors.join(' · ')}</p>}
      {open && (
        <ol class="mg-items">
          {!items && <li class="mg-dim">Loading…</li>}
          {items?.map((item) => (
            <li key={item.id}>
              <span class="mg-item-title">{item.title}</span>
              <span class="mg-dim small">{fmtDuration(item.durationSec)}</span>
              <button
                class="mg-icon"
                title="Don't play this"
                onClick={() => {
                  setItems((list) => list?.filter((i) => i.id !== item.id) ?? null);
                  onExclude([...channel.excluded, item.id]);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Preview({ channel }: { channel: ChannelStatus }) {
  const [blocks, setBlocks] = useState<PreviewBlock[] | null>(null);
  useEffect(() => {
    void api.preview(channel.id).then((r) => setBlocks(r.blocks));
  }, [channel.resolvedAt, channel.mode, channel.breaks, JSON.stringify(channel.slots ?? [])]);
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <div class="mg-card">
      {!blocks && <p class="mg-dim">Loading…</p>}
      {blocks && !blocks.length && <p class="mg-dim">Nothing scheduled yet.</p>}
      <ol class="mg-preview">
        {blocks?.map((b) => (
          <li key={b.startMs} class={`${b.kind} ${b.slot ? 'slot' : ''}`}>
            <span class="mg-preview-time">{fmt(b.startMs)}</span>
            <span>
              {b.title}
              {b.slot && <span class="mg-badge">time slot</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
