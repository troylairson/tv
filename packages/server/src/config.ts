import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 8420),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  webDir: path.resolve(process.env.WEB_DIR ?? '../web/dist'),
  plexUrl: (process.env.PLEX_URL ?? '').replace(/\/+$/, ''),
  plexToken: process.env.PLEX_TOKEN ?? '',
  /** Identifies this app to Plex; stable so Plex doesn't list a new device every restart. */
  plexClientId: process.env.PLEX_CLIENT_ID ?? 'retro-tv-server',
};

export const plexConfigured = () => Boolean(config.plexUrl && config.plexToken);
