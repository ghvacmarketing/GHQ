/**
 * Minimal Anthropic (Claude) client — plain fetch, no SDK dependency.
 * Set ANTHROPIC_API_KEY in the environment; ANTHROPIC_MODEL optionally
 * overrides the default model. When the key is present, the CRM's AI
 * features (Ask AI help, smart search) run on Claude instead of OpenAI.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// content can be a plain string or an array of Anthropic content blocks
// (e.g. image blocks + a text block for vision requests).
export async function claudeChat(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: opts.messages,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (data?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("");
}

/** Strip optional ```json fences so responses parse cleanly. */
export function stripJsonFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

/** Cheap live probe (models list — no tokens spent). Returns null when OK,
 *  otherwise the upstream error text. */
export async function claudeProbe(): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.ok) return null;
    const data: any = await res.json().catch(() => ({}));
    return `HTTP ${res.status}: ${data?.error?.message || "unknown error"}`;
  } catch (e: any) {
    return e?.message || "network error";
  }
}

/** Actionable hint for the most common Anthropic API failures. */
export function claudeErrorHint(status: number | undefined, detail: string): string | null {
  if (status === 401) return "Anthropic rejected the API key — double-check ANTHROPIC_API_KEY in Render (no quotes or spaces).";
  if (status === 400 && /credit/i.test(detail)) return "The Anthropic account needs credits — add billing at console.anthropic.com.";
  if (status === 429) return "Anthropic rate limit hit — try again in a moment.";
  if (status === 404 && /model/i.test(detail)) return "This model name isn't available to the key — set ANTHROPIC_MODEL to a model you have access to.";
  return null;
}
