import { useEffect, useRef } from 'preact/hooks';

export interface SettingRow {
  label: string;
  value: string;
  note: string;
  activate: () => void;
}

/** A D-pad friendly list: ▲▼ to move, OK to change, Back to close. Scrolls when it's taller than the screen. */
export function Settings({ rows, focus }: { rows: SettingRow[]; focus: number }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    // Scroll the list itself (scrollIntoView would also nudge the overflow-hidden TV screen).
    const ul = list.current;
    const el = ul?.children[focus] as HTMLElement | undefined;
    if (!ul || !el) return;
    // Keep clear of the faded edges (styles.css) too.
    const margin = window.innerHeight * 0.02;
    const top = el.offsetTop - ul.offsetTop - margin;
    const bottom = el.offsetTop - ul.offsetTop + el.offsetHeight + margin;
    if (top < ul.scrollTop) ul.scrollTop = top;
    else if (bottom > ul.scrollTop + ul.clientHeight) ul.scrollTop = bottom - ul.clientHeight;
  }, [focus, rows.length]);
  return (
    <div class="settings panel">
      <h2 class="heading">Settings</h2>
      <ul ref={list}>
        {rows.map((row, i) => (
          <li key={row.label} class={i === focus ? 'focused' : ''}>
            <div class="settings-row">
              <span>{row.label}</span>
              <span class="settings-value">{row.value}</span>
            </div>
            <div class="settings-note">{row.note}</div>
          </li>
        ))}
      </ul>
      <div class="settings-hint">
        {focus + 1} of {rows.length} · ▲▼ choose · OK change · Back close
      </div>
    </div>
  );
}
