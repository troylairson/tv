import { useEffect, useState } from 'preact/hooks';
import { api, sameSource, type ChannelStatus, type PlexLibraryProposals, type PlexProposal } from './api';
import { VideoSourcesPicker } from './house';

/** "Build channels from my Plex": proposals from the libraries, ticked ones become channels. */
export function PlexBuilder({ onDone }: { onDone: () => void }) {
  const [libraries, setLibraries] = useState<PlexLibraryProposals[] | null>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    void api.channels().then((r) => setChannels(r.channels));
    api
      .plexProposals()
      .then((r) => setLibraries(r.libraries))
      .catch((e: Error) => setError(e.message));
  }, []);

  const existing = (p: PlexProposal) => channels.find((c) => c.sources.length === p.sources.length && c.sources.every((s, i) => sameSource(s, p.sources[i]!)));
  const all = libraries?.flatMap((l) => l.proposals) ?? [];
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function create() {
    const chosen = all.filter((p) => picked.has(p.id) && !existing(p));
    try {
      for (const [i, p] of chosen.entries()) {
        setCreating(`Creating ${i + 1} of ${chosen.length}: ${p.name}…`);
        await api.create({ name: p.name, mode: p.mode, breaks: true, sources: p.sources });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setCreating(null);
    }
  }

  return (
    <section class="mg-plexgen">
      <div class="mg-titlebar">
        <h1>Build channels from Plex</h1>
      </div>
      <p class="mg-dim">
        Channel ideas from your own libraries, by era and genre, network, collection and more. Tick the ones you want. They follow your library: new shows and
        movies that match join them by themselves.
      </p>
      <VideoSourcesPicker />
      {error && <p class="mg-error">{error}</p>}
      {!libraries && !error && <p class="mg-dim">Reading your Plex libraries… (a big library can take a minute)</p>}
      {libraries?.length === 0 && <p class="mg-dim">No movie or TV libraries found in Plex.</p>}
      {libraries?.map((lib) => {
        const groups = [...new Set(lib.proposals.map((p) => p.group))];
        return (
          <div key={lib.library}>
            <h2>
              {lib.library} <span class="mg-dim small">· {lib.type === 'show' ? 'TV library' : 'movie library'}</span>
            </h2>
            {!lib.proposals.length && <p class="mg-dim small">Not enough here to suggest channels (Plex needs genres and years for its titles).</p>}
            {groups.map((g) => (
              <div key={g} class="mg-card mg-plexgen-group">
                <h3>{g}</h3>
                <ul>
                  {lib.proposals
                    .filter((p) => p.group === g)
                    .map((p) => {
                      const have = existing(p);
                      return (
                        <li key={p.id} class={have ? 'have' : ''}>
                          <label>
                            <input type="checkbox" disabled={!!have} checked={!!have || picked.has(p.id)} onChange={() => toggle(p.id)} />
                            <span class="mg-plexgen-body">
                              <span class="mg-plexgen-title">
                                <b>{p.name}</b>
                                {have && <span class="mg-badge">Channel {have.number}</span>}
                                {p.mode === 'loop' && <span class="mg-badge">in order</span>}
                              </span>
                              <span class="mg-dim small">{p.summary}</span>
                              {p.examples.length > 0 && <span class="mg-dim small mg-plexgen-examples">{p.examples.join(' · ')}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
      {libraries && libraries.some((l) => l.proposals.length) && (
        <div class="mg-savebar">
          {creating && <span class="mg-notice">{creating}</span>}
          <button class="mg-primary" disabled={!picked.size || !!creating} onClick={() => void create()}>
            {picked.size ? `Create ${picked.size} channel${picked.size === 1 ? '' : 's'}` : 'Tick channels to create'}
          </button>
        </div>
      )}
    </section>
  );
}
