/**
 * Remote/keyboard input normalised to a few actions. The Chromecast with Google
 * TV remote has a D-pad, OK and Back (no channel or number keys), but other
 * remotes and keyboards do, and Android WebView sometimes only gives keyCodes.
 */

export type Action =
  | { type: 'channelUp' }
  | { type: 'channelDown' }
  | { type: 'ok' }
  | { type: 'back' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'digit'; digit: number };

export interface KeyInfo {
  key: string;
  code: string;
  keyCode: number;
}

export function lastKeyInfo(e: KeyboardEvent): KeyInfo {
  return { key: e.key, code: e.code, keyCode: e.keyCode };
}

export function toAction(e: KeyboardEvent): Action | null {
  const { key, keyCode } = e;
  if (key === 'ArrowUp' || key === 'ChannelUp' || key === 'PageUp' || keyCode === 166 || keyCode === 33) return { type: 'channelUp' };
  if (key === 'ArrowDown' || key === 'ChannelDown' || key === 'PageDown' || keyCode === 167 || keyCode === 34) return { type: 'channelDown' };
  if (key === 'Enter' || key === ' ' || keyCode === 13 || keyCode === 23) return { type: 'ok' };
  if (key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'BrowserBack' || keyCode === 4 || keyCode === 27) return { type: 'back' };
  if (key === 'ArrowLeft') return { type: 'left' };
  if (key === 'ArrowRight') return { type: 'right' };
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: Number(key) };
  return null;
}
