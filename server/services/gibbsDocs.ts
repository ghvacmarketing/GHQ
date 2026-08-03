import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { docFiles, docFolders } from "@shared/schema";
import { CRM_FUNCTIONALITY_KNOWLEDGE } from "./crm-knowledge";

/** Documents app → "Gibbs" folder: makes what Gibbs knows visible and
 *  ownable, in two forms.
 *
 *  Gibbs/
 *    "Gibbs knowledge & policies (readable).html"  ← styled, comprehensive,
 *        regenerated every boot; opens rendered in the browser
 *    Markdown/
 *      "Gibbs — built-in CRM knowledge (auto-updated).md"  ← raw source,
 *          regenerated every boot (edits overwritten by design); includes
 *          the payments & fees policy section
 *      "Payments & fees policy.md"  ← seeded ONCE, then owned by the team:
 *          edit it in Documents and Gibbs reads the live version through
 *          his company_docs tool (it is also folded into the two generated
 *          docs on the next deploy) */

const FOLDER_NAME = "Gibbs";
const MD_FOLDER_NAME = "Markdown";
const KB_DOC_NAME = "Gibbs — built-in CRM knowledge (auto-updated).md";
const KB_OBJECT_ID = "gibbs-knowledge-base-doc";
const HTML_DOC_NAME = "Gibbs knowledge & policies (readable).html";
const HTML_OBJECT_ID = "gibbs-knowledge-readable-html";
const POLICY_DOC_NAME = "Payments & fees policy.md";

const KB_HEADER = `# Gibbs — built-in CRM knowledge

AUTO-GENERATED on every deploy from the app itself (server/services/crm-knowledge.ts),
with the live "Payments & fees policy" document folded in at the end.
This is the exact feature knowledge Gibbs carries into every conversation.
Edits to THIS file are overwritten on the next deploy — company-specific
policies, SOPs, and brand voice belong in their own documents (like the
payments policy next to this one), which Gibbs reads live.

---

`;

const BRAND_DOC_NAME = "Brand voice.md";
const BRAND_SEED = `# Brand voice — how Gibbs (and we) talk

## Who we are
Giesbrecht HVAC is a family HVAC company in Wrens, Georgia serving the
Augusta–Wrens area. We're neighbors first, technicians second, salespeople a
distant third.

## The voice
- Plain-spoken, warm, practical. Small-town Georgia professional.
- Direct answers with real numbers, names, and dates — no corporate fluff,
  no filler, no jargon when a plain word works.
- Talk to techs like techs; talk to the office like a helpful coworker;
  talk to customers like a trusted neighbor who happens to know HVAC.
- Confident, never pushy. We recommend what we'd put in our own homes and
  say why in concrete terms (comfort, power bills, equipment life).
- It's fine to open with a short conversational beat ("Looks like a busy
  morning —") when it fits. Never pad.

## Words we use / avoid
- Say "visit", "tune-up", "system" — not "service event", "PM", "unit
  asset".
- Say "we'll take care of it" — not "your request has been processed".
- Avoid ALL-CAPS urgency, exclamation stacking, and hard-sell phrasing.

## Customer messages (texts & emails)
- Lead with what matters to them: when we're coming, what it costs, what we
  found.
- Short sentences. One idea per sentence. Sign off as Giesbrecht HVAC.
- Always give a next step ("Reply here or call (706) 826-0644").

---
This document is owned by the team — edit it in the Documents app and Gibbs
reads the live version whenever voice matters.
`;

const POLICY_SEED = `# Payments & fees policy

## Quote deposits
- Standard deposit on an accepted quote is 50% of the quote total.
- The remaining balance is due on completion.

## Credit card convenience fee — 3%
- When a customer pays by credit card, a 3% convenience fee is added to the
  amount being charged to the card.
- On a quote deposit that means 3% of the deposit, not of the full quote:
  a $10,000 quote takes a $5,000 deposit; paid by card the charge is
  $5,000 + 3% = $5,150.
- Cash and check payments have no fee.

---
This document is owned by the team — edit it in the Documents app and Gibbs
answers from the live version.
`;

// ── Tiny markdown → HTML (headings, lists, bold, inline code, fences, hr) —
// covers exactly the flavor the knowledge base is written in. ──────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
}
function mdToHtml(md: string): { html: string; toc: Array<{ id: string; title: string }> } {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  const toc: Array<{ id: string; title: string }> = [];
  let list: "ul" | "ol" | null = null;
  let inFence = false;
  let para: string[] = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushPara = () => {
    if (para.length > 0) { out.push(`<p>${para.map(inlineMd).join(" ")}</p>`); para = []; }
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^```/.test(line)) {
      flushPara(); closeList();
      out.push(inFence ? "</code></pre>" : "<pre><code>");
      inFence = !inFence;
      continue;
    }
    if (inFence) { out.push(escapeHtml(raw)); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const level = h[1].length;
      const title = h[2].trim();
      const id = slugify(title);
      if (level === 2) toc.push({ id, title });
      out.push(`<h${level} id="${id}">${inlineMd(title)}</h${level}>`);
      continue;
    }
    if (/^---+\s*$/.test(line)) { flushPara(); closeList(); out.push("<hr/>"); continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? "ul" : "ol";
      if (list !== want) { closeList(); out.push(`<${want}>`); list = want as "ul" | "ol"; }
      out.push(`<li>${inlineMd((ul || ol)![1])}</li>`);
      continue;
    }
    if (line.trim() === "") { flushPara(); closeList(); continue; }
    para.push(line.trim());
  }
  flushPara(); closeList();
  if (inFence) out.push("</code></pre>");
  return { html: out.join("\n"), toc };
}

function buildReadableHtml(fullMd: string): string {
  const { html, toc } = mdToHtml(fullMd);
  const tocHtml = toc.map((t) => `<a href="#${t.id}">${escapeHtml(t.title)}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gibbs — knowledge &amp; policies</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f7; color: #0f172a;
    font: 16px/1.65 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .shell { max-width: 880px; margin: 0 auto; padding: 32px 20px 80px; }
  .masthead { border: 1px solid #d7d9de; background: #fff; padding: 22px 26px; margin-bottom: 18px; }
  .masthead h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.01em; }
  .masthead p { margin: 0; color: #475569; font-size: 14px; }
  .masthead .stamp { margin-top: 10px; font-size: 12px; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.08em; }
  nav.toc { border: 1px solid #d7d9de; background: #fff; padding: 14px 18px; margin-bottom: 18px;
    display: flex; flex-wrap: wrap; gap: 6px 14px; }
  nav.toc a { color: #711419; text-decoration: none; font-size: 13px; font-weight: 600; }
  nav.toc a:hover { text-decoration: underline; }
  article { border: 1px solid #d7d9de; background: #fff; padding: 10px 30px 30px; }
  article h1 { font-size: 22px; margin: 26px 0 8px; }
  article h2 { font-size: 19px; margin: 34px 0 8px; padding-bottom: 6px;
    border-bottom: 2px solid #711419; letter-spacing: -0.01em; }
  article h3 { font-size: 16px; margin: 22px 0 6px; color: #1e293b; }
  article h4 { font-size: 14px; margin: 18px 0 4px; color: #334155;
    text-transform: uppercase; letter-spacing: 0.05em; }
  article p { margin: 8px 0; }
  article ul, article ol { margin: 8px 0; padding-left: 24px; }
  article li { margin: 3px 0; }
  article hr { border: 0; border-top: 1px solid #e2e8f0; margin: 26px 0; }
  article code { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 1px 5px;
    font-size: 0.9em; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  article pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; overflow-x: auto; }
  article pre code { background: none; border: 0; color: inherit; padding: 0; }
  article strong { color: #0f172a; }
  @media (max-width: 640px) { article { padding: 6px 18px 22px; } }
</style>
</head>
<body>
<div class="shell">
  <div class="masthead">
    <h1>Gibbs — knowledge &amp; policies</h1>
    <p>Everything Gibbs carries into every conversation: how the CRM works, what exists (and what doesn't), and the company policies folded in below. Live business data — customers, schedules, balances — he looks up fresh each time and is not listed here.</p>
    <div class="stamp">Auto-generated on deploy · edit policies in Documents → Gibbs → Markdown</div>
  </div>
  <nav class="toc">${tocHtml}</nav>
  <article>
${html}
  </article>
</div>
</body>
</html>`;
}

async function ensureFolder(name: string, parentId: string | null): Promise<{ id: string }> {
  const cond = parentId
    ? and(eq(docFolders.name, name), eq(docFolders.parentId, parentId))
    : and(eq(docFolders.name, name), isNull(docFolders.parentId));
  const [existing] = await db.select().from(docFolders).where(cond);
  if (existing) return existing;
  const [created] = await db.insert(docFolders).values({ name, parentId }).returning();
  return created;
}

async function upsertDoc(opts: {
  folderId: string;
  name: string;
  path: string;
  contentType: string;
  size: number;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(docFiles)
    .where(and(eq(docFiles.folderId, opts.folderId), eq(docFiles.name, opts.name)));
  if (existing) {
    await db
      .update(docFiles)
      .set({ url: opts.path, objectPath: opts.path, size: opts.size, trashedAt: null, updatedAt: new Date() })
      .where(eq(docFiles.id, existing.id));
  } else {
    await db.insert(docFiles).values({
      folderId: opts.folderId,
      name: opts.name,
      url: opts.path,
      objectPath: opts.path,
      contentType: opts.contentType,
      size: opts.size,
    });
  }
}

export async function seedGibbsDocs(): Promise<void> {
  try {
    const gibbs = await ensureFolder(FOLDER_NAME, null);
    const mdFolder = await ensureFolder(MD_FOLDER_NAME, gibbs.id);

    const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
    const svc = new ObjectStorageService();

    // Earlier versions filed the .md docs directly in Gibbs/ — move them.
    await db
      .update(docFiles)
      .set({ folderId: mdFolder.id })
      .where(and(eq(docFiles.folderId, gibbs.id), eq(docFiles.name, KB_DOC_NAME)));
    await db
      .update(docFiles)
      .set({ folderId: mdFolder.id })
      .where(and(eq(docFiles.folderId, gibbs.id), eq(docFiles.name, POLICY_DOC_NAME)));

    // Policy doc: seed once; afterwards ALWAYS read the team's live version
    // so both generated docs carry current policy.
    let policyMd = POLICY_SEED;
    const [policyRow] = await db
      .select()
      .from(docFiles)
      .where(and(eq(docFiles.folderId, mdFolder.id), eq(docFiles.name, POLICY_DOC_NAME)));
    if (policyRow?.objectPath) {
      try {
        policyMd = (await svc.readObjectBytes(policyRow.objectPath)).toString("utf-8");
      } catch {
        /* unreadable — fall back to the seed text */
      }
    } else {
      const buf = Buffer.from(POLICY_SEED, "utf-8");
      const p = await svc.writeObject(buf, "text/markdown");
      await db.insert(docFiles).values({
        folderId: mdFolder.id,
        name: POLICY_DOC_NAME,
        url: p,
        objectPath: p,
        contentType: "text/markdown",
        size: buf.length,
      });
      console.log("[GibbsDocs] Seeded the Payments & fees policy document");
    }

    // Brand voice doc: seed once, then always read the team's live version.
    let brandMd = BRAND_SEED;
    const [brandRow] = await db
      .select()
      .from(docFiles)
      .where(and(eq(docFiles.folderId, mdFolder.id), eq(docFiles.name, BRAND_DOC_NAME)));
    if (brandRow?.objectPath) {
      try {
        brandMd = (await svc.readObjectBytes(brandRow.objectPath)).toString("utf-8");
      } catch {
        /* unreadable — fall back to the seed text */
      }
    } else {
      const buf = Buffer.from(BRAND_SEED, "utf-8");
      const p = await svc.writeObject(buf, "text/markdown");
      await db.insert(docFiles).values({
        folderId: mdFolder.id,
        name: BRAND_DOC_NAME,
        url: p,
        objectPath: p,
        contentType: "text/markdown",
        size: buf.length,
      });
      console.log("[GibbsDocs] Seeded the Brand voice document");
    }

    // Built-in knowledge md — folds the live brand voice + policy in at the
    // end so one document is the complete picture.
    const fullMd =
      KB_HEADER +
      CRM_FUNCTIONALITY_KNOWLEDGE +
      "\n\n---\n\n" +
      brandMd.replace(/^# /m, "## ") +
      "\n\n---\n\n" +
      policyMd.replace(/^# /m, "## ");
    const kbBuf = Buffer.from(fullMd, "utf-8");
    let kbPath: string;
    if (svc.isLocal()) {
      await svc.saveUpload(KB_OBJECT_ID, kbBuf, "text/markdown");
      kbPath = `/objects/db/${KB_OBJECT_ID}`;
    } else {
      kbPath = await svc.writeObject(kbBuf, "text/markdown");
    }
    await upsertDoc({ folderId: mdFolder.id, name: KB_DOC_NAME, path: kbPath, contentType: "text/markdown", size: kbBuf.length });

    // Readable HTML — the "regular viewing" copy in the Gibbs folder root;
    // opens rendered in the browser straight from Documents.
    const htmlBuf = Buffer.from(buildReadableHtml(fullMd), "utf-8");
    let htmlPath: string;
    if (svc.isLocal()) {
      await svc.saveUpload(HTML_OBJECT_ID, htmlBuf, "text/html; charset=utf-8");
      htmlPath = `/objects/db/${HTML_OBJECT_ID}`;
    } else {
      htmlPath = await svc.writeObject(htmlBuf, "text/html; charset=utf-8");
    }
    await upsertDoc({ folderId: gibbs.id, name: HTML_DOC_NAME, path: htmlPath, contentType: "text/html", size: htmlBuf.length });
  } catch (e) {
    console.error("[GibbsDocs] seeding failed (non-fatal):", (e as Error).message);
  }
}
