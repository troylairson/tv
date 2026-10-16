import type { SourceRef } from '@retro-tv/schedule';
import { useEffect, useState } from 'preact/hooks';
import { api, type ChannelStatus, type DiscoverFilters, type DiscoverResult, type DiscoverShelf, type DiscoverSort } from './api';

const SORTS: [DiscoverSort, string, string][] = [
  ['popular', 'Popular', 'Most viewed first'],
  ['gems', 'Hidden gems', 'Watched by a few hundred people, not millions'],
  ['newest', 'Newest uploads', 'Just added to the Archive'],
  ['oldest', 'Oldest first', 'By air or release date'],
];

/** Browse the Internet Archive by shelf (off-air tapes, holidays, genres) and filters, then add finds to channels. */
export function Discover({ onOpenChannel }: { onOpenChannel: (id: string) => void }) {
  const [shelves, setShelves] = useState<DiscoverShelf[]>([]);
  const [kinds, setKinds] = useState<{ id: string; name: string }[]>([]);
  const [decades, setDecades] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [filters, setFilters] = useState<DiscoverFilters>({ kind: 'any', decade: '', vintage: true, sort: 'popular' });
  const [text, setText] = useState('');
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void api
      .discoverShelves()
      .then((r) => {
        setShelves(r.shelves);
        setKinds(r.kinds);
        setDecades(r.decades);
        // Open on whatever holiday is coming up, else the off-air tapes.
        const start = r.shelves.find((s) => s.inSeason) ?? r.shelves[0];
        if (start) setFilters((f) => ({ ...f, shelf: start.id }));
      })
      .catch((e: Error) => setError(e.message));
    void api.channels().then((r) => setChannels(r.channels.slice().sort((a, b) => a.number - b.number)));
  }, []);

  async function run(next: DiscoverFilters, nextPage = 1) {
    if (!next.shelf && !next.q) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.discover(next, nextPage);
      setResults((old) => (nextPage > 1 && old ? [...old, ...r.results] : r.results));
      setTotal(r.total);
      setPage(nextPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void run(filters);
  }, [filters]);

  const set = (patch: Partial<DiscoverFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const shelf = shelves.find((s) => s.id === filters.shelf);
  const label = [shelf?.name, filters.q && `“${filters.q}”`, filters.decade, filters.kind !== 'any' && kinds.find((k) => k.id === filters.kind)?.name]
    .filter(Boolean)
    .join(' · ');

  /** The current view as a channel source; it re-runs at night, so new uploads keep arriving. */
  const searchSource = async (): Promise<SourceRef> => {
    const { query } = await api.discover(filters, 1);
    return {
      kind: 'ia-search',
      query,
      items: 40,
      filesPerItem: 10,
      title: label || query,
      sort: filters.sort === 'oldest' ? 'date' : filters.sort,
      // Short clips (promos, bumpers) get in the way on a show channel; commercials are the point on an ad channel.
      ...(filters.kind === 'commercials' ? {} : { minMinutes: 5 }),
    };
  };

  async function addTo(channelId: string, source: SourceRef) {
    const c = channels.find((x) => x.id === channelId);
    if (!c) return;
    await api.update(c.id, { sources: [...c.sources, source] });
    setNotice(`Added “${source.title}” to ${c.number} ${c.name}. It'll be on within a few minutes.`);
    void api.channels().then((r) => setChannels(r.channels.slice().sort((a, b) => a.number - b.number)));
  }

  async function makeChannel() {
    const name = prompt('Name for the new channel', shelf?.name ?? filters.q ?? 'Discoveries');
    if (!name) return;
    const created = await api.create({ name, mode: 'shuffle', breaks: true, sources: [await searchSource()] });
    onOpenChannel(created.id);
  }

  const groups = [...new Set(shelves.map((s) => s.group))];

  return (
    <section class="mg-discover">
      <div class="mg-titlebar">
        <h1>Discover</h1>
      </div>
      <p class="mg-dim">Browse the Internet Archive for things worth putting on: pick a shelf, narrow it down, and add what you like to a channel.</p>

      <form
        class="mg-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: text.trim() || undefined });
        }}
      >
        <input
          type="search"
          placeholder="Search too, e.g. Johnny Carson, WGN, drive-in, 1983 (or paste an archive.org link)"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button class="mg-primary" type="submit">
          Search
        </button>
        {filters.q && (
          <button
            type="button"
            onClick={() => {
              setText('');
              set({ q: undefined });
            }}
          >
            Clear search
          </button>
        )}
      </form>

      {groups.map((g) => (
        <div key={g} class="mg-shelves">
          <h2>{g}</h2>
          <div class="mg-chips">
            {shelves
              .filter((s) => s.group === g)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  class={`mg-chip ${filters.shelf === s.id ? 'on' : ''}`}
                  title={s.blurb}
                  onClick={() => set({ shelf: filters.shelf === s.id ? undefined : s.id })}
                >
                  {s.name}
                  {s.inSeason && <span class="mg-chip-badge">coming up</span>}
                </button>
              ))}
          </div>
        </div>
      ))}

      <div class="mg-card mg-discover-filters">
        <label>
          Kind
          <select value={filters.kind} onChange={(e) => set({ kind: (e.target as HTMLSelectElement).value })}>
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Decade
          <select value={filters.decade} onChange={(e) => set({ decade: (e.target as HTMLSelectElement).value })}>
            <option value="">Any</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label class="inline">
          <input type="checkbox" checked={filters.vintage} disabled={!!filters.decade} onChange={(e) => set({ vintage: (e.target as HTMLInputElement).checked })} />
          Before 2000 only
        </label>
        <div class="mg-segmented" role="group" aria-label="Sort">
          {SORTS.map(([id, name, hint]) => (
            <button key={id} type="button" class={filters.sort === id ? 'on' : ''} title={hint} onClick={() => set({ sort: id })}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {shelf && <p class="mg-dim small">{shelf.blurb}</p>}
      {error && <p class="mg-error">{error}</p>}
      {notice && <p class="mg-notice">{notice}</p>}
      {!filters.shelf && !filters.q && <p class="mg-dim">Pick a shelf or search to start.</p>}

      {results && (filters.shelf || filters.q) && (
        <div class="mg-row mg-search-summary">
          <span>
            {loading && page === 1 ? 'Searching…' : `${total.toLocaleString()} results`}
            {label && ` for ${label}`}
          </span>
          <span class="mg-actions">
            <button class="mg-primary" disabled={!total} onClick={() => void makeChannel().catch((e: Error) => setError(e.message))}>
              Make a channel from this
            </button>
            <ChannelSelect channels={channels} label="Add this search to…" onPick={(id) => void searchSource().then((s) => addTo(id, s)).catch((e: Error) => setError(e.message))} />
          </span>
        </div>
      )}

      {results && (
        <ul class="mg-discover-grid">
          {results.map((r) => (
            <ResultCard
              key={r.identifier}
              result={r}
              channels={channels}
              onAdd={(id) => void addTo(id, { kind: 'ia-item', identifier: r.identifier, title: r.title }).catch((e: Error) => setError(e.message))}
              onPivot={(query, name) => {
                setText(query);
                setFilters((f) => ({ ...f, shelf: undefined, q: query }));
                setNotice(`Showing: ${name}`);
                scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ))}
        </ul>
      )}
      {results && results.length < total && (
        <div class="mg-row">
          <button disabled={loading} onClick={() => void run(filters, page + 1)}>
            {loading ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </section>
  );
}

function ChannelSelect({ channels, label, onPick }: { channels: ChannelStatus[]; label: string; onPick: (id: string) => void }) {
  return (
    <select
      value=""
      onChange={(e) => {
        const el = e.target as HTMLSelectElement;
        if (el.value) onPick(el.value);
        el.value = '';
      }}
    >
      <option value="">{label}</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          {c.number} {c.name}
        </option>
      ))}
    </select>
  );
}

function ResultCard({
  result: r,
  channels,
  onAdd,
  onPivot,
}: {
  result: DiscoverResult;
  channels: ChannelStatus[];
  onAdd: (channelId: string) => void;
  onPivot: (query: string, label: string) => void;
}) {
  const [watching, setWatching] = useState(false);
  const [pivots, setPivots] = useState<{ label: string; query: string }[] | null>(null);
  const [added, setAdded] = useState(false);
  return (
    <li class="mg-discover-card">
      {watching ? (
        <iframe class="mg-discover-player" src={`https://archive.org/embed/${encodeURIComponent(r.identifier)}?autoplay=1`} allow="autoplay; fullscreen" allowFullScreen />
      ) : (
        <button type="button" class="mg-discover-thumb" style={{ backgroundImage: `url(${r.thumb})` }} onClick={() => setWatching(true)} aria-label={`Watch ${r.title}`}>
          <span>▶</span>
        </button>
      )}
      <div class="mg-discover-body">
        <a class="mg-discover-title" href={`https://archive.org/details/${encodeURIComponent(r.identifier)}`} target="_blank" rel="noreferrer">
          {r.title}
        </a>
        <div class="mg-dim small">{[r.date, r.downloads !== undefined && `${r.downloads.toLocaleString()} views`].filter(Boolean).join(' · ')}</div>
        {r.description && <p class="mg-discover-desc">{r.description}</p>}
        <div class="mg-actions">
          <button type="button" onClick={() => setWatching(!watching)}>
            {watching ? 'Close' : 'Watch'}
          </button>
          <button type="button" onClick={() => (pivots ? setPivots(null) : void api.related(r.identifier).then((p) => setPivots(p.pivots)))}>
            More like this
          </button>
          {added ? (
            <span class="mg-badge">Added</span>
          ) : (
            <ChannelSelect
              channels={channels}
              label="Add to…"
              onPick={(id) => {
                onAdd(id);
                setAdded(true);
              }}
            />
          )}
        </div>
        {pivots && (
          <div class="mg-chips small">
            {pivots.length === 0 && <span class="mg-dim">Nothing to go on for this one.</span>}
            {pivots.map((p) => (
              <button key={p.query} type="button" class="mg-chip" onClick={() => onPivot(p.query, p.label)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
