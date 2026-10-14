import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 8420),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  webDir: path.resolve(process.env.WEB_DIR ?? '../web/dist'),
  plexUrl: (process.env.PLEX_URL ?? '').replace(/\/+$/, ''),
  plexToken: process.env.PLEX_TOKEN ?? '',
  /** Identifies this app to Plex; stable so Plex doesn't list a new device every restart. */
  plexClientId: process.env.PLEX_CLIENT_ID ?? 'retro-tv-server',
  /** Git commit the image was built from (set by the Docker build). */
  version: (process.env.RETRO_TV_VERSION ?? 'dev').slice(0, 7),
};

export const plexConfigured = () => Boolean(config.plexUrl && config.plexToken);
