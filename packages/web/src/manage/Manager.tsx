import type { ChannelItem, SourceRef } from '@retro-tv/schedule';
import { useEffect, useState } from 'preact/hooks';
import { AddContent } from './AddContent';
import { api, fmtDuration, sourceLabel, type ChannelFields, type ChannelStatus, type PackInfo, type PreviewBlock } from './api';
import { Schedule, type DraftSlot } from './Schedule';
import { Logo, logoSpec } from '../logos/Logo';
import { HAND_LOGOS } from '../logos/hand';

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
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    void fetch('/api/info')
      .then((r) => r.json())
      .then((info: { version?: string }) => setVersion(info.version ?? null))
      .catch(() => undefined);
  }, []);
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
        <span class="mg-header-right">
          {version && <span class="mg-version" title="Server version (git commit)">v{version}</span>}
          <a class="mg-link" href="/">
            Open the TV ↗
          </a>
        </span>
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
            <div class="mg-logo-thumb">
              <Logo channel={c} theme="retro" />
            </div>
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
              {c.unavailable > 0 && <div class="mg-badge warn">{c.unavailable} unavailable (skipped)</div>}
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
      <ChannelIdeas />
    </section>
  );
}

/** Ready-made channels: hand-curated content, order and time slots, added in one tap. */
function ChannelIdeas() {
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .packs()
      .then((r) => setPacks(r.packs))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function install(pack: PackInfo) {
    setBusy(pack.id);
    try {
      const created = await api.installPack(pack.id);
      go(`/manage/${encodeURIComponent(created.id)}`);
    } catch (e) {
      alert((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <h2>Channel ideas</h2>
      {error && <p class="mg-error">Couldn't load channel ideas: {error}</p>}
      {!packs && !error && <p class="mg-dim">Loading…</p>}
      <ul class="mg-ideas">
        {packs?.map((p) => (
          <li key={p.id} class="mg-card mg-idea">
            <div class="mg-channel-name">{p.name}</div>
            <p>{p.description}</p>
            <div class="mg-dim small">
              {p.sourceCount} sources · {p.slotCount} time slots · curated {p.curated.split(':')[0]}
            </div>
            <div class="mg-row">
              <span class="mg-dim small">{p.installed.length > 0 && `On channel ${p.installed.map((c) => c.number).join(', ')}`}</span>
              <button class={p.installed.length ? '' : 'mg-primary'} disabled={busy === p.id} onClick={() => void install(p)}>
                {busy === p.id ? 'Adding…' : p.installed.length ? 'Add another copy' : 'Add this channel'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

type Form = Omit<ChannelFields, 'slots'> & { slots: DraftSlot[] };

const EMPTY: Form = { number: 0, name: '', mode: 'loop', breaks: true, sources: [], excluded: [], slots: [] };

/** Pick the channel's logo: automatic, a generated one (try another), a hand-drawn one, or just the number. */
function LogoPicker({
  channel,
  savedLogo,
  canUpload,
  onChange,
  onUploaded,
}: {
  channel: { id: string; name: string; logo?: string; packId?: string; sources: SourceRef[] };
  savedLogo?: string;
  canUpload: boolean;
  onChange: (logo: string | undefined) => void;
  onUploaded: (logo: string | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const spec = logoSpec(channel);
  const choice = !channel.logo ? 'auto' : channel.logo.startsWith('gen:') ? 'gen' : channel.logo;
  const seed = spec.startsWith('gen:') ? Number(spec.slice(4)) || 0 : 0;
  // The uploaded image stays on the server when another logo is picked, so it can be picked again.
  const uploaded = channel.logo?.startsWith('upload:') ? channel.logo : savedLogo?.startsWith('upload:') ? savedLogo : null;
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      onUploaded((await api.uploadLogo(channel.id, file)).logo);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div class="mg-card mg-logo-picker">
      <div class="mg-logo-previews">
        {(['retro', 'modern', 'seventies'] as const).map((theme) => (
          <div key={theme} class={`mg-logo-preview ${theme}`}>
            {spec === 'none' ? <span class="mg-dim">Number only</span> : <Logo channel={channel} theme={theme} />}
          </div>
        ))}
      </div>
      <div class="mg-logo-controls">
        <select
          value={choice}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onChange(v === 'auto' ? undefined : v === 'gen' ? `gen:${seed}` : v);
          }}
        >
          <option value="auto">Automatic</option>
          <option value="gen">Generated from the name</option>
          <optgroup label="Hand-drawn">
            {Object.entries(HAND_LOGOS).map(([key, logo]) => (
              <option key={key} value={`hand:${key}`}>
                {logo.name}
              </option>
            ))}
          </optgroup>
          {uploaded && <option value={uploaded}>Uploaded image</option>}
          <option value="none">None (number only)</option>
        </select>
        {spec.startsWith('gen:') && <button onClick={() => onChange(`gen:${(seed + 1) % 1000}`)}>Try another</button>}
        <label class={`mg-upload ${canUpload ? '' : 'disabled'}`}>
          {uploading ? 'Uploading…' : 'Upload your own…'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            disabled={!canUpload || uploading}
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              void upload(input.files?.[0]).then(() => (input.value = ''));
            }}
          />
        </label>
        {!canUpload && <span class="mg-dim small">Create the channel first to upload a logo.</span>}
        {uploadError && <span class="mg-error">{uploadError}</span>}
        <p class="mg-dim small">
          Uploads: PNG, JPEG, WebP, GIF or SVG up to 2 MB. A wide image on a transparent background looks best. Generated logos pick their look from the channel's name and content, and follow each TV's theme (Retro, Modern, 70s shown above).
        </p>
      </div>
    </div>
  );
}

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
    if (c && !dirty) setForm({ number: c.number, name: c.name, mode: c.mode, breaks: c.breaks, sources: c.sources, excluded: c.excluded, slots: c.slots ?? [], logo: c.logo, bumpers: c.bumpers });
  };

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  // While the server is resolving sources, keep the status fresh.
  useEffect(() => {
    if (!saved?.resolving && !saved?.checking && saved?.upToDate !== false) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [saved?.resolving, saved?.checking, saved?.upToDate, dirty]);

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
    const fields: ChannelFields = { ...form, logo: form.logo ?? 'auto', bumpers: form.bumpers !== false, slots: form.slots.map((s) => ({ ...s, source: s.source! })) };
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
        <label class="inline">
          <input
            type="checkbox"
            checked={form.bumpers !== false}
            disabled={!form.breaks}
            onChange={(e) => set({ bumpers: (e.target as HTMLInputElement).checked ? undefined : false })}
          />{' '}
          “Coming up on…” card at the end of each break
        </label>
      </div>

      <h2>Logo</h2>
      <LogoPicker
        channel={{ id: id ?? 'new', name: form.name || 'New Channel', logo: form.logo, packId: saved?.packId, sources: form.sources }}
        savedLogo={saved?.logo}
        canUpload={!!id}
        onChange={(logo) => set({ logo })}
        onUploaded={(logo) => {
          // Already saved on the server: no need to mark the form changed.
          setForm((f) => ({ ...f, logo }));
          setSaved((s) => s && { ...s, logo });
        }}
      />

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
  const [items, setItems] = useState<(ChannelItem & { unavailable?: string })[] | null>(null);
  const [checkStarted, setCheckStarted] = useState(false);
  const checking = checkStarted || channel.checking;
  // The server reports checking once it starts; after that its flag is the truth.
  useEffect(() => {
    if (channel.checking) setCheckStarted(false);
  }, [channel.checking]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) void api.items(channel.id).then((r) => setItems(r.items));
  }, [open, channel.resolvedAt, channel.unavailable, channel.checking]);

  return (
    <div class="mg-card">
      <div class="mg-row">
        <span>
          {channel.resolving ? 'Updating… ' : ''}
          {channel.itemCount} items · {fmtDuration(channel.totalSec)}
          {channel.excluded.length > 0 && ` · ${channel.excluded.length} removed`}
          {channel.unavailable > 0 && <span class="mg-warn-text"> · {channel.unavailable} unavailable (skipped)</span>}
        </span>
        <span class="mg-actions">
          {channel.excluded.length > 0 && <button onClick={() => onExclude([])}>Restore removed</button>}
          <button onClick={() => void api.refresh(channel.id)}>Refresh from sources</button>
          <button
            disabled={checking}
            title="Check that every video still plays; ones that don't are skipped until they're back"
            onClick={() => {
              setCheckStarted(true);
              void api.check(channel.id);
              setTimeout(() => setCheckStarted(false), 4000);
            }}
          >
            {checking ? 'Checking…' : 'Check videos'}
          </button>
          <button onClick={() => setOpen(!open)}>{open ? 'Hide list' : 'Show list'}</button>
        </span>
      </div>
      {channel.errors.length > 0 && <p class="mg-error small">{channel.errors.join(' · ')}</p>}
      {open && (
        <ol class="mg-items">
          {!items && <li class="mg-dim">Loading…</li>}
          {items?.map((item) => (
            <li key={item.id}>
              <span class={`mg-item-title ${item.unavailable ? 'mg-unavailable' : ''}`} title={item.unavailable}>
                {item.title}
                {item.unavailable && <span class="mg-badge warn">Unavailable: {item.unavailable}</span>}
              </span>
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
