import fs from 'node:fs';
import { Readable } from 'node:stream';

/** Serve a local video file with HTTP Range support, so players can seek (and join mid-commercial). */
export async function serveFile(filePath: string, rangeHeader: string | undefined, contentType = 'video/mp4'): Promise<Response> {
  let size: number;
  try {
    size = (await fs.promises.stat(filePath)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers: Record<string, string> = {
    'content-type': contentType,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=86400',
  };

  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    headers['content-length'] = String(size);
    return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, { status: 200, headers });
  }

  let start: number;
  let end: number;
  if (m[1] === '') {
    // "bytes=-N": the last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  }
  headers['content-range'] = `bytes ${start}-${end}/${size}`;
  headers['content-length'] = String(end - start + 1);
  return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream, { status: 206, headers });
}

/**
 * Relay a video from another server (the Internet Archive), passing Range through so
 * the TV can seek. Some TVs' web views won't play archive.org links directly; from
 * here they look like any other file on this server.
 */
export async function relayVideo(url: string, rangeHeader: string | undefined, clientGone: AbortSignal): Promise<Response> {
  const upstream = new AbortController();
  const stop = () => upstream.abort();
  clientGone.addEventListener('abort', stop, { once: true });
  // Give up if the archive doesn't start answering; once it does, the stream can take as long as it needs.
  const slow = setTimeout(stop, 30_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...(rangeHeader && { range: rangeHeader }), 'user-agent': 'retro-tv/0.0 (home use)' },
      redirect: 'follow',
      signal: upstream.signal,
    });
  } catch (err) {
    clientGone.removeEventListener('abort', stop);
    console.warn(`relay ${url}: ${(err as Error).message}`);
    return new Response('Upstream unreachable', { status: 502 });
  } finally {
    clearTimeout(slow);
  }
  if (!res.ok) {
    console.warn(`relay ${url}: HTTP ${res.status}`);
    await res.body?.cancel().catch(() => undefined);
    return new Response(`Upstream HTTP ${res.status}`, { status: res.status === 416 ? 416 : res.status >= 500 ? 502 : res.status });
  }
  const headers: Record<string, string> = { 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  for (const h of ['content-type', 'content-length', 'content-range', 'last-modified', 'etag']) {
    const v = res.headers.get(h);
    if (v) headers[h] = v;
  }
  if (!headers['content-type'] || headers['content-type'] === 'application/octet-stream') headers['content-type'] = 'video/mp4';
  return new Response(res.body, { status: res.status, headers });
}
