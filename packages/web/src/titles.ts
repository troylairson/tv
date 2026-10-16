/** One-line title: "Green Acres – Ep. 6 · Furniture, Furniture…" for episodes, the plain title otherwise. */
export const fullTitle = (i: { title: string; show?: string; episode?: string }) => (i.show && i.episode ? `${i.show} – ${i.episode}` : i.title);
