import { db } from "../db";
import { sql } from "drizzle-orm";

/** Self-metered AI spend — every Anthropic response's token counts and every
 *  Whisper transcription's audio length get recorded here, priced by the
 *  rate map below. This is the tracker's ground truth for AI costs (works
 *  with zero external admin keys); the nightly provider snapshots layer the
 *  official billing numbers on top.
 *
 *  Costs are stored in MICROCENTS (1/1,000,000 of a dollar? no — 1e-4 cents)
 *  — precisely: costMicro = millionths of a DOLLAR, so $3.00 = 3_000_000.
 *  Small per-call costs stay exact; sum then divide for display. */

// $ per million tokens, matched by model-id prefix (first hit wins).
const TOKEN_RATES: Array<{ prefix: string; inPerM: number; outPerM: number }> = [
  { prefix: "claude-opus", inPerM: 15, outPerM: 75 },
  { prefix: "claude-sonnet", inPerM: 3, outPerM: 15 },
  { prefix: "claude-haiku", inPerM: 1, outPerM: 5 },
  { prefix: "claude-3-5-haiku", inPerM: 0.8, outPerM: 4 },
  { prefix: "claude", inPerM: 3, outPerM: 15 }, // unknown Claude → Sonnet rates
  { prefix: "gpt-4o-mini", inPerM: 0.15, outPerM: 0.6 },
  { prefix: "gpt", inPerM: 2.5, outPerM: 10 },
];
const WHISPER_PER_MINUTE = 0.006; // dollars

function tokenCostMicro(model: string, inputTokens: number, outputTokens: number): number {
  const rate = TOKEN_RATES.find((r) => model.startsWith(r.prefix)) || TOKEN_RATES[4];
  return Math.round((inputTokens * rate.inPerM + outputTokens * rate.outPerM));
  // tokens × $/Mtok = millionths of a dollar exactly — no further scaling needed.
}

/** Fire-and-forget: a metering failure must never break an AI feature. */
export function recordAiUsage(e: {
  provider: "anthropic" | "openai";
  kind: "chat" | "transcription";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  source?: string; // which feature: gibbs, search, voice, …
  userId?: string | null; // who ran it — powers the per-user cost breakdown
}): void {
  const costMicro =
    e.kind === "transcription"
      ? Math.round(((e.audioSeconds || 0) / 60) * WHISPER_PER_MINUTE * 1_000_000)
      : tokenCostMicro(e.model, e.inputTokens || 0, e.outputTokens || 0);
  db.execute(sql`
    INSERT INTO ai_usage_events (provider, kind, model, input_tokens, output_tokens, audio_seconds, cost_micro, source, user_id)
    VALUES (${e.provider}, ${e.kind}, ${e.model}, ${e.inputTokens ?? 0}, ${e.outputTokens ?? 0}, ${e.audioSeconds ?? 0}, ${costMicro}, ${e.source ?? "unknown"}, ${e.userId ?? null})
  `).catch((err) => console.error("[AI usage] record failed (non-fatal):", err?.message || err));
}
