/**
 * "Remind me" from the guide: when a show is about to start, the TV puts up a notice
 * (OK to watch it). Kept on this TV.
 */
export interface Reminder {
  channelNumber: number;
  channelName: string;
  title: string;
  show?: string;
  episode?: string;
  startMs: number;
}

const KEY = 'retro-tv:reminders';
/** The notice goes up this long before the show starts... */
export const REMIND_BEFORE_MS = 60_000;
/** ...and stays up until this long after, unless dismissed. */
const REMIND_AFTER_MS = 5 * 60_000;

const idOf = (r: Pick<Reminder, 'channelNumber' | 'startMs'>) => `${r.channelNumber}@${r.startMs}`;

export function reminders(): Reminder[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Reminder[];
    return Array.isArray(list) ? list.filter((r) => r.startMs + REMIND_AFTER_MS > Date.now()) : [];
  } catch {
    return [];
  }
}

function save(list: Reminder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: no reminders.
  }
}

export const hasReminder = (r: Pick<Reminder, 'channelNumber' | 'startMs'>) => reminders().some((x) => idOf(x) === idOf(r));

export function addReminder(r: Reminder): void {
  save([...reminders().filter((x) => idOf(x) !== idOf(r)), r].sort((a, b) => a.startMs - b.startMs));
}

export function removeReminder(r: Pick<Reminder, 'channelNumber' | 'startMs'>): void {
  save(reminders().filter((x) => idOf(x) !== idOf(r)));
}

/** The reminder to show now, if any. */
export function dueReminder(nowMs = Date.now()): Reminder | undefined {
  return reminders().find((r) => r.startMs - REMIND_BEFORE_MS <= nowMs);
}
