import { useEffect, useState } from 'preact/hooks';

/** Where shows and movies come from (a house setting, shared by every TV). Commercials always come from the Archive. */
export type VideoSources = 'both' | 'plex' | 'ia';

export const VIDEO_SOURCE_NAMES: Record<VideoSources, string> = {
  both: 'Plex and Internet Archive',
  plex: 'Plex only',
  ia: 'Internet Archive only',
};

let current: VideoSources = 'both';
let loaded: Promise<void> | null = null;
const listeners = new Set<(v: VideoSources) => void>();

function load() {
  loaded ??= fetch('/api/settings')
    .then((r) => r.json())
    .then((s: { videoSources?: VideoSources }) => {
      current = s.videoSources ?? 'both';
      for (const l of listeners) l(current);
    })
    .catch(() => undefined);
  return loaded;
}

export async function setVideoSources(v: VideoSources): Promise<void> {
  const res = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoSources: v }) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  current = v;
  for (const l of listeners) l(current);
}

export function useVideoSources(): VideoSources {
  const [v, setV] = useState(current);
  useEffect(() => {
    listeners.add(setV);
    void load();
    return () => void listeners.delete(setV);
  }, []);
  return v;
}

/** The setting as a picker, with what it means. */
export function VideoSourcesPicker() {
  const v = useVideoSources();
  const [error, setError] = useState<string | null>(null);
  return (
    <div class="mg-card mg-sources-setting">
      <label>
        <b>Video sources</b>
        <select
          value={v}
          onChange={(e) => {
            setError(null);
            void setVideoSources((e.target as HTMLSelectElement).value as VideoSources).catch((err: Error) => setError(err.message));
          }}
        >
          {(Object.keys(VIDEO_SOURCE_NAMES) as VideoSources[]).map((k) => (
            <option key={k} value={k}>
              {VIDEO_SOURCE_NAMES[k]}
            </option>
          ))}
        </select>
      </label>
      <span class="mg-dim small">
        {v === 'plex'
          ? 'Channels play only your Plex videos; Internet Archive channels are hidden (not deleted). Commercials still come from the Archive.'
          : v === 'ia'
            ? 'Channels play only Internet Archive videos; Plex channels are hidden (not deleted).'
            : 'Channels can mix both. Applies to every TV in the house.'}
      </span>
      {error && <span class="mg-error small">{error}</span>}
    </div>
  );
}
