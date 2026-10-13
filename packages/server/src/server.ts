import fs from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { getChannels, initChannels, rebuild } from './channels';
import { config, plexConfigured } from './config';
import * as plex from './plex';

const app = new Hono();

app.onError((err, c) => {
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
  return c.json({ plexConfigured: plexConfigured(), channels: channels.length, builtAt, building });
});

app.get('/api/channels', (c) => c.json(getChannels()));

app.post('/api/channels/rebuild', (c) => {
  void rebuild().catch((err) => console.error('channel build failed', err));
  return c.json({ ok: true, building: true }, 202);
});

// ── Plex ─────────────────────────────────────────────────────────────────────

app.use('/api/plex/*', async (c, next) => {
  if (!plexConfigured()) return c.json({ error: 'Plex is not configured (set PLEX_URL and PLEX_TOKEN)' }, 404);
  await next();
});

app.get('/api/plex/status', async (c) => c.json(await plex.identity()));
app.get('/api/plex/sections', async (c) => c.json(await plex.sections()));

app.get('/api/plex/play/:ratingKey', async (c) => {
  const offset = Number(c.req.query('offset') ?? 0) || 0;
  const mode = c.req.query('mode') === 'direct' ? 'direct' : 'transcode';
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
app.use('/*', serveStatic({ root: webRoot }));
app.get('*', serveStatic({ root: webRoot, path: 'index.html' }));

await initChannels();
serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, ({ port }) => {
  console.log(`retro-tv listening on http://0.0.0.0:${port} (web: ${config.webDir}, data: ${config.dataDir}, plex: ${plexConfigured() ? config.plexUrl : 'off'})`);
});
