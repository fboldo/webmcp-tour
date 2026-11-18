/** NFKC, whitespace collapse, trailing punctuation and ellipsis stripped. */
export const clean = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\s*(\.\.\.|…|[.,:;!?]))+$/u, "")
    .trim();

/** Case-insensitive, no locale rules. */
export const norm = (s: string | null | undefined): string => clean(s).toLowerCase();

export const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const WORD = /[\p{L}\p{N}_]/u;

/** 0 = exact, 1 = substring on word boundaries, null = no match. `q` is already `norm`ed. */
export function matchTier(name: string, q: string): { tier: 0 | 1; ratio: number } | null {
  const n = norm(name);
  if (!n) return null;
  if (n === q) return { tier: 0, ratio: 1 };
  for (let i = n.indexOf(q); i !== -1; i = n.indexOf(q, i + 1)) {
    if (!WORD.test(n[i - 1] ?? "") && !WORD.test(n[i + q.length] ?? "")) return { tier: 1, ratio: q.length / n.length };
  }
  return null;
}
