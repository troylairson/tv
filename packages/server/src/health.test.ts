import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChannelItem } from './types';

/** Which "archive" files exist (200) and which are gone (404); anything else is a 503. */
const files: Record<string, number> = {};
const server = http.createServer((req, res) => {
  res.writeHead(files[req.url ?? ''] ?? 503);
  res.end('x');
});
let base = '';
let health: typeof import('./health');

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'health-'));
  health = await import('./health');
});
afterAll(() => void server.close());

const item = (name: string): ChannelItem => ({ id: `ia:x/${name}`, source: 'ia', ref: `x/${name}`, title: name, durationSec: 60, url: `${base}/${name}` });

describe('health checks', () => {
  it('drops an item after two failed checks and brings it back when it returns', async () => {
    files['/ok.mp4'] = 200;
    files['/gone.mp4'] = 404;
    const list = [item('ok.mp4'), item('gone.mp4')];
    await health.checkItems(list);
    expect(health.isUnavailable('ia:x/gone.mp4')).toBe(false);
    const v = health.healthVersion();
    await health.checkItems(list);
    expect(health.isUnavailable('ia:x/gone.mp4')).toBe(true);
    expect(health.isUnavailable('ia:x/ok.mp4')).toBe(false);
    expect(health.unavailableError('ia:x/gone.mp4')).toContain('404');
    expect(health.healthVersion()).toBe(v + 1);

    files['/gone.mp4'] = 200;
    await health.checkItems(list);
    expect(health.isUnavailable('ia:x/gone.mp4')).toBe(false);
    expect(health.healthVersion()).toBe(v + 2);
  });

  it("doesn't count server errors or network failures", async () => {
    const flaky = item('flaky.mp4'); // 503
    const offline: ChannelItem = { ...item('offline.mp4'), id: 'ia:x/offline.mp4', url: 'http://127.0.0.1:1/offline.mp4' };
    for (let i = 0; i < 3; i++) await health.checkItems([flaky, offline]);
    expect(health.isUnavailable(flaky.id)).toBe(false);
    expect(health.isUnavailable(offline.id)).toBe(false);
  });

  it('ignores a run where most things fail at once (an outage, not dead videos)', async () => {
    const list = Array.from({ length: 12 }, (_, i) => item(`batch${i}.mp4`));
    for (const [i, it] of list.entries()) files[`/${it.title}`] = i < 2 ? 200 : 404;
    await health.checkItems(list);
    const run = await health.checkItems(list);
    expect(run.ignored).toBe(true);
    expect(list.some((it) => health.isUnavailable(it.id))).toBe(false);
  });

  it('saves what it found', async () => {
    const saved = JSON.parse(await fs.readFile(path.join(process.env.DATA_DIR!, 'health.json'), 'utf8'));
    expect(saved.lastRun.checked).toBeGreaterThan(0);
  });
});
