import fs from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import {
  channelStatuses,
  createChannel,
  deleteChannel,
  getChannels,
  getConfig,
  initChannels,
  refreshAll,
  resolveChannel,
  resolvedItems,
  updateChannel,
  ValidationError,
} from './channels';
import { mediaPath, poolStatus, readyCommercials, startCommercialPool } from './commercials';
import { config, plexConfigured } from './config';
import { serveFile } from './media';
import * as ia from './ia';
import { getPack, PACKS } from './packs';
import * as plex from './plex';
import { airingsFor, ensureLineup, guideBlocks, loadLineups, referencedCommercials, regenerate } from './scheduler';
import { getSettings, loadSettings, SettingsError, updateSettings } from './settings';

const app = new Hono();

// Say UTF-8 explicitly: without it Safari shows raw JSON as Latin-1 ("â€“" for "–").
app.use('/api/*', async (c, next) => {
  await next();
  const type = c.res.headers.get('content-type');
  if (type?.startsWith('application/json') && !type.includes('charset')) c.res.headers.set('content-type', 'application/json; charset=utf-8');
});

app.onError((err, c) => {
  if (err instanceof ValidationError || err instanceof SettingsError) return c.json({ error: err.message }, 400);
  console.error(`${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: err.message }, 500);
});

/** Clients sample this a few times to correct for TV clock drift. */
app.get('/api/time', (c) => {
  c.header('cache-control', 'no-store');
  return c.json({ now: Date.now() });
});

app.get('/api/info', (c) => {
  const { channels, builtAt, building } = getChannels();
  return c.json({ version: config.version, plexConfigured: plexConfigured(), channels: channels.length, builtAt, building, commercials: poolStatus() });
});

/** Channel list without the (large) item lists; what's on comes from /airings. */
app.get('/api/channels', (c) => {
  const { channels, builtAt, building } = getChannels();
  return c.json({
    builtAt,
    building,
    channels: channels.map(({ items, ...channel }) => ({ ...channel, itemCount: items.length })),
  });
});

/** The stored schedule for one channel: shows and commercial breaks. */
app.get('/api/channels/:id/airings', (c) => {
  const channel = getChannels().channels.find((ch) => ch.id === c.req.param('id'));
  if (!channel) return c.json({ error: 'No such channel' }, 404);
  const now = Date.now();
  const from = Number(c.req.query('from')) || now - 10 * 60_000;
  const to = Math.min(Number(c.req.query('to')) || now + 3 * 3600_000, now + 48 * 3600_000);
  c.header('cache-control', 'no-store');
  return c.json({ airings: airingsFor(channel, from, to) });
});

/** Every channel's programmes for the guide grid, in one request. */
app.get('/api/guide', (c) => {
  const now = Date.now();
  const from = Number(c.req.query('from')) || now;
  const to = Math.min(Number(c.req.query('to')) || from + 3 * 3600_000, now + 48 * 3600_000);
  c.header('cache-control', 'no-store');
  const channels = getChannels()
    .channels.slice()
    .sort((a, b) => a.number - b.number)
    .map((ch) => ({ id: ch.id, number: ch.number, name: ch.name, blocks: guideBlocks(ch, from, to) }));
  return c.json({ from, to, channels });
});

// ── Settings (house-wide: they change the shared schedule) ──────────────────

app.get('/api/settings', (c) => c.json(getSettings()));

app.put('/api/settings', async (c) => {
  const before = getSettings();
  const after = await updateSettings((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
  if (before.commercialBreaks !== after.commercialBreaks) regenerate(getChannels().channels);
  return c.json(after);
});

// ── Commercials ──────────────────────────────────────────────────────────────

app.get('/api/commercials', (c) => c.json(poolStatus()));

/** A few random commercials, used by a TV to fill time when a show won't play. */
app.get('/api/commercials/random', (c) => {
  const count = Math.min(20, Number(c.req.query('count')) || 6);
  const pool = readyCommercials();
  const picks = [];
  for (let i = 0; i < count && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  return c.json({ commercials: picks });
});

app.get('/media/commercials/:file', (c) => {
  const file = mediaPath(c.req.param('file'));
  if (!file) return c.text('Not found', 404);
  return serveFile(file, c.req.header('range'));
});

app.post('/api/channels/rebuild', (c) => {
  void refreshAll().catch((err) => console.error('channel refresh failed', err));
  return c.json({ ok: true, building: true }, 202);
});

// ── Channel manager (the /manage page) ──────────────────────────────────────

app.get('/api/manage/channels', (c) => c.json({ channels: channelStatuses(), plexConfigured: plexConfigured() }));

app.post('/api/manage/channels', async (c) => {
  const created = await createChannel(await c.req.json());
  return c.json(created, 201);
});

/** Ready-made channels (see src/packs). */
app.get('/api/manage/packs', (c) => {
  const statuses = channelStatuses();
  return c.json({
    packs: PACKS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      curated: p.curated,
      sourceCount: p.sources.length,
      slotCount: p.slots.length,
      installed: statuses.filter((s) => s.packId === p.id).map((s) => ({ id: s.id, number: s.number, name: s.name })),
    })),
  });
});

app.post('/api/manage/packs/:id/install', async (c) => {
  const pack = getPack(c.req.param('id'));
  if (!pack) return c.json({ error: 'No such pack' }, 404);
  const created = await createChannel(
    { name: pack.name, mode: pack.mode, breaks: pack.breaks, sources: pack.sources, slots: pack.slots },
    { packId: pack.id },
  );
  return c.json(created, 201);
});

app.put('/api/manage/channels/:id', async (c) => {
  const result = await updateChannel(c.req.param('id'), await c.req.json());
  if (!result) return c.json({ error: 'No such channel' }, 404);
  // Commercials on/off changes the future schedule; regenerate it (the current airing finishes).
  if (result.breaksChanged) {
    const channel = getChannels().channels.find((ch) => ch.id === result.config.id);
    if (channel) regenerate([channel]);
  }
  return c.json(result.config);
});

app.delete('/api/manage/channels/:id', async (c) => {
  return (await deleteChannel(c.req.param('id'))) ? c.json({ ok: true }) : c.json({ error: 'No such channel' }, 404);
});

app.post('/api/manage/channels/:id/refresh', (c) => {
  if (!getConfig(c.req.param('id'))) return c.json({ error: 'No such channel' }, 404);
  void resolveChannel(c.req.param('id'));
  return c.json({ ok: true }, 202);
});

/** What the channel's sources produced (for listing and removing items). */
app.get('/api/manage/channels/:id/items', (c) => {
  if (!getConfig(c.req.param('id'))) return c.json({ error: 'No such channel' }, 404);
  return c.json({ items: resolvedItems(c.req.param('id')) });
});

/** The next N hours as the guide will show them. */
app.get('/api/manage/channels/:id/preview', (c) => {
  const channel = getChannels().channels.find((ch) => ch.id === c.req.param('id'));
  if (!channel) return c.json({ blocks: [] });
  const now = Date.now();
  const hours = Math.min(48, Number(c.req.query('hours')) || 24);
  return c.json({ blocks: guideBlocks(channel, now, now + hours * 3600_000) });
});

// ── Internet Archive search (for the channel manager) ───────────────────────

app.get('/api/ia/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const collection = (c.req.query('collection') ?? '').trim();
  // A pasted archive.org link goes straight to that item, whatever collection is picked.
  const linked = ia.identifierFromLink(q);
  const parts = linked ? [`identifier:"${linked}"`] : [q, collection && `collection:${collection}`].filter(Boolean);
  if (!parts.length) return c.json({ error: 'Enter a search or pick a collection' }, 400);
  const query = parts.map((p) => `(${p})`).join(' AND ');
  const { numFound, docs } = await ia.search(query, { rows: 40, page: Number(c.req.query('page')) || 1 });
  return c.json({
    query,
    link: Boolean(linked),
    total: numFound,
    results: docs.map((d) => ({ ...d, thumb: ia.thumbUrl(d.identifier) })),
  });
});

// ── Plex ─────────────────────────────────────────────────────────────────────

app.use('/api/plex/*', async (c, next) => {
  if (!plexConfigured()) return c.json({ error: 'Plex is not configured (set PLEX_URL and PLEX_TOKEN)' }, 404);
  await next();
});

app.get('/api/plex/status', async (c) => c.json(await plex.identity()));
app.get('/api/plex/sections', async (c) => c.json(await plex.sections()));
app.get('/api/plex/sections/:key/items', async (c) => c.json(await plex.browseSection(c.req.param('key'), c.req.query('q') ?? '')));
app.get('/api/plex/sections/:key/collections', async (c) => c.json(await plex.browseCollections(c.req.param('key'))));

/** Self-test of the whole Plex playback chain. Without an id, uses the first item on a Plex channel. */
app.get('/api/plex/test/:ratingKey?', async (c) => {
  let key = c.req.param('ratingKey');
  if (!key) {
    const item = getChannels().channels.flatMap((ch) => ch.items).find((i) => i.source === 'plex');
    if (!item) return c.json({ error: 'No Plex items on any channel yet' }, 404);
    key = item.ref;
  }
  return c.json(await plex.selfTest(key, Number(c.req.query('offset')) || 60));
});

app.get('/api/plex/play/:ratingKey', async (c) => {
  const offset = Number(c.req.query('offset') ?? 0) || 0;
  const asked = c.req.query('mode');
  const mode = asked === 'direct' || asked === 'transcode' ? asked : 'auto';
  return c.json(await plex.playback(c.req.param('ratingKey'), offset, mode));
});

app.post('/api/plex/stop/:session', async (c) => {
  await plex.stopTranscode(c.req.param('session'));
  return c.json({ ok: true });
});

app.all('/plex/*', (c) => {
  if (!plexConfigured()) return c.text('Plex is not configured', 404);
  return plex.proxy(c.req.raw);
});

// ── Diagnostics: the TV has no devtools, so it reports here ─────────────────

interface DiagEntry { at: string; from: string; [key: string]: unknown }
const diag: DiagEntry[] = [];

app.post('/api/diag', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const entry: DiagEntry = { ...body, at: new Date().toISOString(), from: c.req.header('user-agent') ?? '?' };
  diag.push(entry);
  if (diag.length > 500) diag.shift();
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.appendFile(path.join(config.dataDir, 'diag.log'), JSON.stringify(entry) + '\n').catch(() => undefined);
  return c.json({ ok: true });
});

app.get('/api/diag', (c) => c.json(diag.slice().reverse()));

// ── Web app ──────────────────────────────────────────────────────────────────

const webRoot = path.relative(process.cwd(), config.webDir) || '.';
// The page itself must always be re-checked so an update shows up; its assets have hashed names.
app.use('/*', async (c, next) => {
  await next();
  if (c.res.headers.get('content-type')?.startsWith('text/html')) c.res.headers.set('cache-control', 'no-cache');
});
app.use('/*', serveStatic({ root: webRoot }));
app.get('*', serveStatic({ root: webRoot, path: 'index.html' }));

await loadSettings();
await loadLineups();
await initChannels();
await startCommercialPool({
  onChange: () => regenerate(getChannels().channels),
  referenced: referencedCommercials,
});
// Keep every channel's lineup topped up (and pruned) even when nobody is watching it.
setInterval(() => {
  for (const channel of getChannels().channels) ensureLineup(channel);
}, 10 * 60_000);
serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, ({ port }) => {
  console.log(`retro-tv ${config.version} listening on http://0.0.0.0:${port} (web: ${config.webDir}, data: ${config.dataDir}, plex: ${plexConfigured() ? config.plexUrl : 'off'})`);
});
