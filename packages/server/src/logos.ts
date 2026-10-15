/**
 * Channel logos uploaded from the manager: one image per channel in
 * <data dir>/logos, served at /logos/<channel id>. The channel's `logo` setting
 * becomes "upload:<timestamp>", which also busts the TV's image cache.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export class LogoError extends Error {}

const dir = () => path.join(config.dataDir, 'logos');
const safeId = (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new LogoError('Bad channel id');
  return id;
};

/** What the bytes actually are (never trust the declared type). */
export function sniffImage(bytes: Uint8Array): keyof typeof TYPES | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (starts(0xff, 0xd8, 0xff)) return 'jpg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp';
  const head = new TextDecoder().decode(bytes.slice(0, 2048)).trimStart().toLowerCase();
  if ((head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--')) && head.includes('<svg')) return 'svg';
  return null;
}

async function existing(id: string): Promise<{ file: string; type: string } | null> {
  for (const ext of Object.keys(TYPES)) {
    const file = path.join(dir(), `${id}.${ext}`);
    try {
      await fs.access(file);
      return { file, type: TYPES[ext]! };
    } catch {
      // not this one
    }
  }
  return null;
}

/** Store a channel's logo, replacing any earlier one. Returns the logo setting to save. */
export async function saveLogo(channelId: string, bytes: Uint8Array): Promise<string> {
  const id = safeId(channelId);
  if (!bytes.length) throw new LogoError('The file is empty');
  if (bytes.length > MAX_LOGO_BYTES) throw new LogoError('The image is too big (2 MB at most)');
  const ext = sniffImage(bytes);
  if (!ext) throw new LogoError('Use a PNG, JPEG, WebP, GIF or SVG image');
  await deleteLogo(id);
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), `${id}.${ext}`), bytes);
  return `upload:${Date.now()}`;
}

export async function deleteLogo(channelId: string): Promise<void> {
  const found = await existing(safeId(channelId));
  if (found) await fs.rm(found.file, { force: true });
}

export async function readLogo(channelId: string): Promise<{ bytes: Buffer; type: string } | null> {
  let id: string;
  try {
    id = safeId(channelId);
  } catch {
    return null;
  }
  const found = await existing(id);
  return found ? { bytes: await fs.readFile(found.file), type: found.type } : null;
}
