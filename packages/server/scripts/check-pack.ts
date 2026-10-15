/**
 * Resolve a channel pack against the live Internet Archive exactly as the server
 * would, and list what it would play, so a new pack can be screened before it ships.
 *
 *   pnpm --filter @retro-tv/server exec tsx scripts/check-pack.ts src/packs/<pack>.json
 */
import fs from 'node:fs';
import { resolveSources } from '../src/sources';
import type { ChannelPack } from '../src/packs';

const fmt = (sec: number) => { const m = Math.round(sec / 60); return `${Math.floor(m / 60)} h ${m % 60} min`; };

async function main() {
  const pack = JSON.parse(fs.readFileSync(process.argv[2]!, 'utf8')) as ChannelPack;
  const regular = await resolveSources(pack.sources, []);
  console.log(`# ${pack.name}: ${regular.items.length} items, ${fmt(regular.items.reduce((s, i) => s + i.durationSec, 0))}`);
  for (const e of regular.errors) console.log(`! ${e}`);
  for (const i of regular.items) console.log(`${Math.round(i.durationSec / 60).toString().padStart(4)} min  ${i.title}  [${i.ref}]`);
  for (const slot of pack.slots) {
    const r = await resolveSources([slot.source], []);
    console.log(`\n## Slot ${slot.days.join(',')} ${slot.start} ${slot.durationMin} min: ${slot.source.title}: ${r.items.length} items, ${fmt(r.items.reduce((s, i) => s + i.durationSec, 0))}`);
    for (const e of r.errors) console.log(`! ${e}`);
    for (const i of r.items.slice(0, 40)) console.log(`${Math.round(i.durationSec / 60).toString().padStart(4)} min  ${i.title}`);
  }
}
void main();
