/**
 * Server-corrected clock. TVs drift; the schedule only works if every screen
 * agrees on "now", so we take a few samples of the server's clock and keep the
 * offset from the lowest-latency one.
 */

let offsetMs = 0;
let rttMs: number | null = null;

export const now = () => Date.now() + offsetMs;

export function clockStats() {
  return { offsetMs, rttMs };
}

export async function syncClock(samples = 4): Promise<void> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < samples; i++) {
    try {
      const sent = Date.now();
      const res = await fetch('/api/time', { cache: 'no-store' });
      const { now: serverNow } = (await res.json()) as { now: number };
      const received = Date.now();
      const rtt = received - sent;
      const offset = serverNow - (sent + rtt / 2);
      if (!best || rtt < best.rtt) best = { rtt, offset };
    } catch {
      // Server unreachable: keep the local clock.
    }
  }
  if (best) {
    offsetMs = Math.round(best.offset);
    rttMs = best.rtt;
  }
}
