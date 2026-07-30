/**
 * Minimal Anthropic (Claude) client — plain fetch, no SDK dependency.
 * Set ANTHROPIC_API_KEY in the environment; ANTHROPIC_MODEL optionally
 * overrides the default model. When the key is present, the CRM's AI
 * features (Ask AI help, smart search) run on Claude instead of OpenAI.
 */

import { recordAiUsage } from "./ai-usage";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

/** Meter a successful Anthropic response (fire-and-forget). */
function meter(data: any, source: string) {
  const u = data?.usage;
  if (!u) return;
  recordAiUsage({
    provider: "anthropic",
    kind: "chat",
    model: String(data?.model || DEFAULT_MODEL),
    inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    outputTokens: u.output_tokens || 0,
    source,
  });
}

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
  meter(data, "claude-chat");
  return (data?.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("");
}

export type ClaudeTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** Agentic chat: Claude may call the provided read-only tools any number of
 *  times (executed server-side via executeTool) before its final answer.
 *  Returns the final text. */
export async function claudeChatWithTools(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  tools: ClaudeTool[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  maxTokens?: number;
  maxIterations?: number;
}): Promise<string> {
  const messages: { role: "user" | "assistant"; content: string | unknown[] }[] = [...opts.messages];
  const maxIterations = opts.maxIterations ?? 8;

  for (let i = 0; i < maxIterations; i++) {
    // On the last allowed round, forbid further tool calls so the model must
    // answer with what it has — running out of lookups must NEVER surface as
    // an error to the user.
    const finalTurn = i === maxIterations - 1;
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
        tools: opts.tools,
        ...(finalTurn ? { tool_choice: { type: "none" } } : {}),
        messages,
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    meter(data, "gibbs");

    if (!finalTurn && data.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: data.content });
      const results: unknown[] = [];
      for (const block of data.content || []) {
        if (block?.type !== "tool_use") continue;
        let output = "";
        try {
          output = await opts.executeTool(block.name, block.input || {});
        } catch (e: any) {
          output = `Error: ${e?.message || "tool failed"}`;
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: output.slice(0, 15000) });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    return (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  // Unreachable (the final turn always returns), but never throw at the user.
  return "";
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
