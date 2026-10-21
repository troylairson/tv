import type { SourceRef } from '@retro-tv/schedule';
import { useEffect, useState } from 'preact/hooks';
import { useVideoSources } from './house';
import { api, sameSource, type IaResult, type PlexBrowseItem, type PlexSection } from './api';

interface Props {
  plexConfigured: boolean;
  added: SourceRef[];
  onAdd: (source: SourceRef) => void;
}

export function AddContent({ plexConfigured, added, onAdd }: Props) {
  const sources = useVideoSources();
  const preferred = sources === 'ia' || (!plexConfigured && sources !== 'plex') ? 'ia' : 'plex';
  const [tab, setTab] = useState<'plex' | 'ia'>(preferred);
  useEffect(() => setTab(preferred), [preferred]);
  const isAdded = (s: SourceRef) => added.some((a) => sameSource(a, s));

  return (
    <div class="mg-card">
      <div class="mg-tabs" role="tablist">
        {sources !== 'ia' && (
          <button role="tab" class={tab === 'plex' ? 'active' : ''} onClick={() => setTab('plex')}>
            Plex
          </button>
        )}
        {sources !== 'plex' && (
          <button role="tab" class={tab === 'ia' ? 'active' : ''} onClick={() => setTab('ia')}>
            Internet Archive
          </button>
        )}
      </div>
      {tab === 'plex' &&
        (plexConfigured ? (
          <PlexPicker onAdd={onAdd} isAdded={isAdded} />
        ) : (
          <p class="mg-dim">Plex isn't set up on the server (PLEX_URL and PLEX_TOKEN).</p>
        ))}
      {tab === 'ia' && <IaPicker onAdd={onAdd} isAdded={isAdded} />}
    </div>
  );
}

interface PickerProps {
  onAdd: (source: SourceRef) => void;
  isAdded: (source: SourceRef) => boolean;
}

function AddButton({ source, onAdd, isAdded, label = 'Add' }: PickerProps & { source: SourceRef; label?: string }) {
  const done = isAdded(source);
  return (
    <button class={done ? '' : 'mg-primary'} disabled={done} onClick={() => onAdd(source)}>
      {done ? 'Added ✓' : label}
    </button>
  );
}

function PlexPicker({ onAdd, isAdded }: PickerProps) {
  const [sections, setSections] = useState<PlexSection[]>([]);
  const [sectionKey, setSectionKey] = useState('');
  const [view, setView] = useState<'items' | 'collections'>('items');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlexBrowseItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .plexSections()
      .then((list) => {
        const video = list.filter((s) => s.type === 'show' || s.type === 'movie');
        setSections(video);
        setSectionKey((k) => k || video[0]?.key || '');
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Search as you type (debounced), and reload when the library or view changes.
  useEffect(() => {
    if (!sectionKey) return;
    setResults(null);
    const t = setTimeout(() => {
      const load = view === 'collections' ? api.plexCollections(sectionKey) : api.plexBrowse(sectionKey, query);
      load.then(setResults).catch((e: Error) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [sectionKey, view, query]);

  const section = sections.find((s) => s.key === sectionKey);
  const sourceFor = (item: PlexBrowseItem): SourceRef =>
    item.type === 'show'
      ? { kind: 'plex-show', ratingKey: item.ratingKey, title: item.title }
      : item.type === 'collection'
        ? { kind: 'plex-collection', ratingKey: item.ratingKey, title: item.title }
        : { kind: 'plex-item', ratingKey: item.ratingKey, title: item.year ? `${item.title} (${item.year})` : item.title };

  const shown = view === 'collections' && query ? results?.filter((r) => r.title.toLowerCase().includes(query.toLowerCase())) : results;

  return (
    <div>
      <div class="mg-toolbar">
        <select value={sectionKey} onChange={(e) => setSectionKey((e.target as HTMLSelectElement).value)}>
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title} ({s.type === 'show' ? 'TV' : 'movies'})
            </option>
          ))}
        </select>
        <div class="mg-segmented">
          <button class={view === 'items' ? 'active' : ''} onClick={() => setView('items')}>
            {section?.type === 'movie' ? 'Movies' : 'Shows'}
          </button>
          <button class={view === 'collections' ? 'active' : ''} onClick={() => setView('collections')}>
            Collections
          </button>
        </div>
        <input type="search" placeholder="Search by title" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        {section && (
          <AddButton
            source={{ kind: 'plex-library', sectionKey: section.key, type: section.type === 'movie' ? 'movie' : 'show', title: `${section.title} (whole library)` }}
            label="Add whole library"
            onAdd={onAdd}
            isAdded={isAdded}
          />
        )}
      </div>
      {error && <p class="mg-error">{error}</p>}
      {!shown && !error && <p class="mg-dim">Loading…</p>}
      {shown && !shown.length && <p class="mg-dim">Nothing found.</p>}
      <ul class="mg-grid">
        {shown?.map((item) => (
          <li key={item.ratingKey} class="mg-tile">
            {item.thumb ? <img src={item.thumb} alt="" loading="lazy" /> : <div class="mg-noposter">{item.title}</div>}
            <div class="mg-tile-title">{item.title}</div>
            <div class="mg-dim small">
              {item.type === 'show' && `${item.count ?? '?'} episodes`}
              {item.type === 'collection' && `${item.count ?? '?'} items`}
              {item.type === 'movie' && [item.year, item.durationMin && `${item.durationMin} min`].filter(Boolean).join(' · ')}
            </div>
            <AddButton source={sourceFor(item)} onAdd={onAdd} isAdded={isAdded} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const IA_COLLECTIONS = [
  ['', 'All of the Internet Archive'],
  ['classic_tv', 'Classic TV'],
  ['classic_cartoons', 'Classic cartoons'],
  ['feature_films', 'Feature films'],
  ['prelinger', 'Prelinger Archives (industrial & educational)'],
  ['classic_tv_commercials', 'Classic TV commercials'],
  ['SciFi_Horror', 'Sci-fi & horror'],
  ['Film_Noir', 'Film noir'],
  ['silent_films', 'Silent films'],
] as const;

function IaPicker({ onAdd, isAdded }: PickerProps) {
  const [q, setQ] = useState('');
  const [collection, setCollection] = useState('classic_tv');
  const [result, setResult] = useState<{ query: string; total: number; link?: boolean; results: IaResult[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(20);

  async function search(e?: Event) {
    e?.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResult(await api.iaSearch(q, collection));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const label = [q && `“${q}”`, IA_COLLECTIONS.find(([k]) => k === collection)?.[1]].filter(Boolean).join(' in ');

  return (
    <div>
      <form class="mg-toolbar" onSubmit={(e) => void search(e)}>
        <select value={collection} onChange={(e) => setCollection((e.target as HTMLSelectElement).value)}>
          {IA_COLLECTIONS.map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Search, e.g. western, Popeye, 1950s, or paste an archive.org link" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <button class="mg-primary" type="submit" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <p class="mg-error">{error}</p>}
      {result?.link && !result.results.length && <p class="mg-error">No Internet Archive item found at that link.</p>}
      {result && !result.link && (
        <div class="mg-row mg-search-summary">
          <span>
            {result.total.toLocaleString()} results, most popular first.
          </span>
          <span class="mg-actions">
            <label class="inline small">
              Top
              <input type="number" min={1} max={200} value={items} onInput={(e) => setItems(Number((e.target as HTMLInputElement).value) || 20)} />
              items
            </label>
            <AddButton
              source={{ kind: 'ia-search', query: result.query, items, filesPerItem: 10, title: label || result.query }}
              label="Add this search (updates nightly)"
              onAdd={onAdd}
              isAdded={isAdded}
            />
          </span>
        </div>
      )}
      {result && (
        <ul class="mg-list">
          {result.results.map((r) => (
            <li key={r.identifier}>
              <img src={r.thumb} alt="" loading="lazy" />
              <div class="mg-list-body">
                <a href={`https://archive.org/details/${encodeURIComponent(r.identifier)}`} target="_blank" rel="noreferrer">
                  {r.title ?? r.identifier}
                </a>
                <div class="mg-dim small">
                  {[r.year, r.downloads !== undefined && `${r.downloads.toLocaleString()} views`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <AddButton source={{ kind: 'ia-item', identifier: r.identifier, title: r.title ?? r.identifier }} onAdd={onAdd} isAdded={isAdded} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
