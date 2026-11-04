/** Which segments light up for each digit (a top, b top-right, c bottom-right, d bottom, e bottom-left, f top-left, g middle). */
const SEGMENTS: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
const SHAPES: Record<string, string> = {
  a: '12,4 52,4 44,12 20,12',
  b: '54,6 54,44 46,40 46,14',
  c: '54,52 54,90 46,82 46,56',
  d: '12,92 52,92 44,84 20,84',
  e: '10,52 10,90 18,82 18,56',
  f: '10,6 10,44 18,40 18,14',
  g: '14,48 20,43 44,43 50,48 44,53 20,53',
};

/**
 * A seven-segment LED readout, like the channel display on a 1980s cable box.
 * Unlit segments stay faintly visible; themes that don't use it hide it.
 */
export function Led({ value, digits = 2, class: cls = '' }: { value: number | string | undefined; digits?: number; class?: string }) {
  const text = String(value ?? '').replace(/\D/g, '').slice(-3).padStart(digits, '0');
  return (
    <div class={`led ${cls}`} aria-hidden="true">
      <div class="led-window">
        {text.split('').map((d, i) => (
          <svg key={i} class="led-digit" viewBox="0 0 64 96">
            {Object.entries(SHAPES).map(([seg, points]) => (
              <polygon key={seg} points={points} class={SEGMENTS[d]?.includes(seg) ? 'on' : 'off'} />
            ))}
          </svg>
        ))}
      </div>
      <div class="led-brand">
        CABLE
        <i />
        <i />
      </div>
    </div>
  );
}
