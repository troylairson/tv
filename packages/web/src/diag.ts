/** Diagnostics: the TV has no devtools, so we report to the server (view at /api/diag). */

export function report(type: string, data: Record<string, unknown> = {}): void {
  void fetch('/api/diag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, ...data }),
    keepalive: true,
  }).catch(() => undefined);
}

const PROBES: Record<string, string> = {
  'H.264 (MP4)': 'video/mp4; codecs="avc1.640028"',
  'HEVC (MP4)': 'video/mp4; codecs="hvc1.1.6.L120.90"',
  'VP9 (WebM)': 'video/webm; codecs="vp9"',
  'AV1 (MP4)': 'video/mp4; codecs="av01.0.08M.08"',
  'AAC': 'audio/mp4; codecs="mp4a.40.2"',
  'AC-3': 'audio/mp4; codecs="ac-3"',
  'E-AC-3': 'audio/mp4; codecs="ec-3"',
  'MPEG-2 TS (H.264)': 'video/mp2t; codecs="avc1.640028,mp4a.40.2"',
};

export interface Capabilities {
  userAgent: string;
  screen: string;
  nativeHls: boolean;
  mse: boolean;
  codecs: Record<string, { video: string; mse: boolean }>;
}

export function capabilities(): Capabilities {
  const video = document.createElement('video');
  const mse = typeof MediaSource !== 'undefined';
  const codecs: Capabilities['codecs'] = {};
  for (const [name, mime] of Object.entries(PROBES)) {
    codecs[name] = { video: video.canPlayType(mime) || 'no', mse: mse && MediaSource.isTypeSupported(mime) };
  }
  return {
    userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height} @${devicePixelRatio}x, viewport ${innerWidth}x${innerHeight}`,
    nativeHls: Boolean(video.canPlayType('application/vnd.apple.mpegurl')),
    mse,
    codecs,
  };
}
