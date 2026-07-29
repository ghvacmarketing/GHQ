// Fuzzy customer-name scoring shared by Gibbs' lookup tool (proposal time)
// and the AI action executor (approval time) — voice transcription mangles
// names ("Rio Martin" for "Ryo Martin", "Blue Water Kafe"), so exact/ILIKE
// matching isn't enough. Combines token overlap with an edit-distance ratio;
// both are case-insensitive. Returns 0..1 (1 = exact after normalization).
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const ta = na.split(" ");
  const tb = new Set(nb.split(" "));
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  const tokenScore = (2 * overlap) / (ta.length + tb.size);
  const sa = na.replace(/ /g, "");
  const sb = nb.replace(/ /g, "");
  const m = sa.length;
  const n = sb.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (sa[i - 1] === sb[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  const levScore = 1 - dp[n] / Math.max(m, n);
  return Math.max(tokenScore, levScore) * 0.98;
}

/** True when two names are the same after normalization (case, punctuation,
 *  extra spaces) — the "refuse outright" duplicate case. */
export function sameNormalizedName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b) && norm(a) !== "";
}
