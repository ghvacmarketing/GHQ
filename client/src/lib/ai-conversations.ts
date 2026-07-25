// Shared plumbing for the persistent GHQ assistant threads — used by both
// the desktop Ask AI dialog and the mobile assistant overlay so a
// conversation started on one surface resumes on the other.

export type AiProposedAction = {
  type: "create_task" | "create_work_order";
  summary: string;
  params: Record<string, unknown>;
};

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Image data URLs attached to a user message. */
  attachments?: string[] | null;
  relatedTopics?: string[];
  proposedAction?: AiProposedAction | null;
  actionState?: "pending" | "executing" | "done" | "dismissed" | "error" | "choose";
  actionResult?: { label: string; url: string } | null;
  actionError?: string | null;
  actionCandidates?: { id: string; name: string }[] | null;
  /** Which param a picked candidate fills — "customerId" (default) or
   *  "assignedTechId". Sent by the server alongside candidates. */
  actionCandidateParam?: string;
  /** Server id of the stored assistant message — lets approvals/dismissals
   *  land on the right row. Absent on error bubbles. */
  messageId?: string;
};

export type AiConversationSummary = {
  id: string;
  title: string | null;
  spaceId?: string | null;
  updatedAt: string | null;
};

/** A named group of conversations (like ChatGPT projects — called "spaces"
 *  because "projects" already means CRM projects in GHQ). */
export type AiSpace = {
  id: string;
  name: string;
};

export async function createAiSpace(name: string): Promise<AiSpace | null> {
  try {
    const res = await fetch("/api/crm/ai/spaces", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function deleteAiSpace(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/crm/ai/spaces/${id}`, { method: "DELETE", credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function moveAiConversation(id: string, spaceId: string | null): Promise<boolean> {
  try {
    const res = await fetch(`/api/crm/ai/conversations/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type AiServerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: string[] | null;
  relatedTopics?: string[] | null;
  proposedAction?: AiProposedAction | null;
  actionStatus?: string | null;
  actionResult?: { entity: string; id: string; label: string; url: string } | null;
};

export function mapServerAiMessage(m: AiServerMessage): AiChatMessage {
  const hasAction = !!m.proposedAction;
  return {
    role: m.role,
    content: m.content,
    attachments: m.attachments ?? null,
    relatedTopics: m.relatedTopics ?? undefined,
    proposedAction: m.proposedAction ?? null,
    actionState: hasAction
      ? m.actionStatus === "approved"
        ? "done"
        : m.actionStatus === "dismissed"
          ? "dismissed"
          : "pending"
      : undefined,
    actionResult: m.actionResult ? { label: m.actionResult.label, url: m.actionResult.url } : null,
    messageId: m.id,
  };
}

export async function fetchLatestAiConversation(): Promise<{ id: string; messages: AiChatMessage[] } | null> {
  try {
    const res = await fetch("/api/crm/ai/conversations/latest", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.conversation || !Array.isArray(data.messages) || data.messages.length === 0) return null;
    return { id: data.conversation.id, messages: data.messages.map(mapServerAiMessage) };
  } catch {
    return null;
  }
}

export async function fetchAiConversation(id: string): Promise<{ id: string; messages: AiChatMessage[] } | null> {
  try {
    const res = await fetch(`/api/crm/ai/conversations/${id}`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.conversation) return null;
    return { id: data.conversation.id, messages: (data.messages || []).map(mapServerAiMessage) };
  } catch {
    return null;
  }
}

export async function deleteAiConversation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/crm/ai/conversations/${id}`, { method: "DELETE", credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fire-and-forget: mark a proposed action as dismissed on the stored row. */
export function dismissAiAction(messageId?: string) {
  if (!messageId) return;
  fetch(`/api/crm/ai/messages/${messageId}/dismiss`, { method: "POST", credentials: "include" }).catch(() => {});
}

/** Downscale + re-encode a picked image to a JPEG data URL the AI can read.
 *  Always re-encodes (iPhone HEIC won't be accepted upstream as-is) and caps
 *  the long edge so a 12MP camera shot becomes a few hundred KB. */
export async function compressImageForAi(file: File, maxDim = 1400): Promise<string> {
  const originalUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That file isn't a readable image"));
    el.src = originalUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function formatConversationWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
