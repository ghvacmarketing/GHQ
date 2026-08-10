/**
 * Minimal Anthropic (Claude) client — plain fetch, no SDK dependency.
 * Set ANTHROPIC_API_KEY in the environment; ANTHROPIC_MODEL optionally
 * overrides the default model. When the key is present, the CRM's AI
 * features (Ask AI help, smart search) run on Claude instead of OpenAI.
 */

import { recordAiUsage } from "./ai-usage";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

/** Meter a successful Anthropic response (fire-and-forget). Cache reads and
 *  writes are split out so the tracker prices them at their REAL rates
 *  (reads 10%, writes 125% of the input rate) instead of full price. */
function meter(data: any, source: string, userId?: string | null) {
  const u = data?.usage;
  if (!u) return;
  recordAiUsage({
    provider: "anthropic",
    kind: "chat",
    model: String(data?.model || DEFAULT_MODEL),
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheReadTokens: u.cache_read_input_tokens || 0,
    cacheWriteTokens: u.cache_creation_input_tokens || 0,
    source,
    userId,
  });
}

/** System prompt as a cache-marked block: the whole prefix up to and
 *  including it (tools + system) is written to Anthropic's prompt cache and
 *  read back at 10% price on every later round of a tool loop — and on any
 *  request within 5 minutes that shares the prefix. Behavior is identical;
 *  only the billing changes. */
function cachedSystem(system: string) {
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

/** Mark the LAST tool as a cache breakpoint: the tools block is static
 *  across every exchange, so it stays cached even when the system prompt's
 *  live-data sections change between questions. */
function cacheMarkTools(tools: ClaudeTool[]): ClaudeTool[] {
  if (tools.length === 0) return tools;
  return tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t));
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
      system: cachedSystem(opts.system),
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
  /** Prompt-cache breakpoint marker (set internally by cacheMarkTools). */
  cache_control?: { type: "ephemeral" };
};

/** Streaming variant of a Messages API call: consumes the SSE stream,
 *  forwarding text deltas to onTextDelta as they generate, and returns a
 *  message object with the SAME shape as the non-streaming response
 *  (content blocks, stop_reason, usage, model) so callers can't tell the
 *  difference. */
async function claudeStreamRequest(body: Record<string, unknown>, onTextDelta: (text: string) => void): Promise<any> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    const data: any = await res.json().catch(() => ({}));
    const err: any = new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const message: any = { content: [], stop_reason: null, usage: {}, model: DEFAULT_MODEL };
  const blocks: any[] = message.content;
  const partialJson: string[] = []; // tool_use inputs stream as JSON fragments

  const handleEvent = (evt: any) => {
    switch (evt?.type) {
      case "message_start":
        if (evt.message?.model) message.model = evt.message.model;
        Object.assign(message.usage, evt.message?.usage || {});
        break;
      case "content_block_start":
        blocks[evt.index] = { ...evt.content_block };
        if (evt.content_block?.type === "text") blocks[evt.index].text = evt.content_block.text || "";
        if (evt.content_block?.type === "tool_use") {
          partialJson[evt.index] = "";
          blocks[evt.index].input = evt.content_block.input || {};
        }
        break;
      case "content_block_delta":
        if (evt.delta?.type === "text_delta" && typeof evt.delta.text === "string") {
          blocks[evt.index].text = (blocks[evt.index]?.text || "") + evt.delta.text;
          onTextDelta(evt.delta.text);
        } else if (evt.delta?.type === "input_json_delta") {
          partialJson[evt.index] = (partialJson[evt.index] || "") + (evt.delta.partial_json || "");
        } else if (evt.delta?.type === "thinking_delta" && typeof evt.delta.thinking === "string") {
          // Thinking blocks are replayed verbatim on the next tool round —
          // dropping their content made the API reject the whole request
          // ("each thinking block must contain thinking").
          blocks[evt.index].thinking = (blocks[evt.index]?.thinking || "") + evt.delta.thinking;
        } else if (evt.delta?.type === "signature_delta" && typeof evt.delta.signature === "string") {
          blocks[evt.index].signature = (blocks[evt.index]?.signature || "") + evt.delta.signature;
        }
        break;
      case "content_block_stop": {
        const b = blocks[evt.index];
        if (b?.type === "tool_use" && partialJson[evt.index]) {
          try { b.input = JSON.parse(partialJson[evt.index]); } catch { /* keep {} — the tool call will just fail softly */ }
        }
        break;
      }
      case "message_delta":
        if (evt.delta?.stop_reason) message.stop_reason = evt.delta.stop_reason;
        Object.assign(message.usage, evt.usage || {});
        break;
      case "error": {
        const err: any = new Error(evt.error?.message || "Anthropic stream error");
        throw err;
      }
    }
  };

  // SSE frames: "event: X\ndata: {json}\n\n"
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body as any) {
    buf += decoder.decode(chunk as Uint8Array, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          handleEvent(JSON.parse(payload));
        } catch (e) {
          if (e instanceof SyntaxError) continue; // malformed frame — skip
          throw e; // real stream error from handleEvent
        }
      }
    }
  }
  message.content = blocks.filter(Boolean);
  return message;
}

/** Agentic chat: Claude may call the provided read-only tools any number of
 *  times (executed server-side via executeTool) before its final answer.
 *  Returns the final text. When onTextDelta is provided, every round runs as
 *  a live stream and text deltas are forwarded as they generate (tool rounds
 *  included — callers filter for what they care about). */
export async function claudeChatWithTools(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string | unknown[] }[];
  tools: ClaudeTool[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  maxTokens?: number;
  maxIterations?: number;
  onTextDelta?: (text: string) => void;
  /** Attribute this exchange's token spend to a user (cost tracker). */
  meterUserId?: string | null;
}): Promise<string> {
  const messages: { role: "user" | "assistant"; content: string | unknown[] }[] = [...opts.messages];
  const maxIterations = opts.maxIterations ?? 8;

  for (let i = 0; i < maxIterations; i++) {
    // On the last allowed round, forbid further tool calls so the model must
    // answer with what it has — running out of lookups must NEVER surface as
    // an error to the user.
    const finalTurn = i === maxIterations - 1;
    const requestBody = {
      model: DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      system: cachedSystem(opts.system),
      tools: cacheMarkTools(opts.tools),
      ...(finalTurn ? { tool_choice: { type: "none" } } : {}),
      messages,
    };
    let data: any;
    if (opts.onTextDelta) {
      data = await claudeStreamRequest(requestBody, opts.onTextDelta);
    } else {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err: any = new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
    }
    meter(data, "gibbs", opts.meterUserId);

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
