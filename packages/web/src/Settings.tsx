export interface SettingRow {
  label: string;
  value: string;
  note: string;
  activate: () => void;
}

/** A D-pad friendly list: ▲▼ to move, OK to change, Back to close. */
export function Settings({ rows, focus }: { rows: SettingRow[]; focus: number }) {
  return (
    <div class="settings">
      <h2>Settings</h2>
      <ul>
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
      <div class="settings-hint">▲▼ choose · OK change · Back close</div>
    </div>
  );
}
