import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { docFiles, docFolders } from "@shared/schema";
import { CRM_FUNCTIONALITY_KNOWLEDGE } from "./crm-knowledge";

/** Documents app → "Gibbs" folder: makes what Gibbs knows visible and
 *  ownable.
 *
 *  1. "Built-in CRM knowledge" — AUTO-REGENERATED from crm-knowledge.ts on
 *     every boot (a read-out of the exact feature knowledge in Gibbs' head;
 *     edits there are overwritten, by design — the code is the source).
 *  2. "Payments & fees policy" — seeded ONCE, then owned by the team: edit
 *     or replace it in the Documents app and Gibbs reads the live version
 *     through his company_docs tool. */

const FOLDER_NAME = "Gibbs";
const KB_DOC_NAME = "Gibbs — built-in CRM knowledge (auto-updated).md";
const KB_OBJECT_ID = "gibbs-knowledge-base-doc";
const POLICY_DOC_NAME = "Payments & fees policy.md";

const KB_HEADER = `# Gibbs — built-in CRM knowledge

AUTO-GENERATED on every deploy from the app itself (server/services/crm-knowledge.ts).
This is the exact feature knowledge Gibbs carries into every conversation.
Edits to THIS file are overwritten on the next deploy — company-specific
policies, SOPs, and brand voice belong in their own documents (like the
"Payments & fees policy" next to this one), which Gibbs reads live.

---

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

export async function seedGibbsDocs(): Promise<void> {
  try {
    let [folder] = await db
      .select()
      .from(docFolders)
      .where(and(eq(docFolders.name, FOLDER_NAME), isNull(docFolders.parentId)));
    if (!folder) {
      [folder] = await db.insert(docFolders).values({ name: FOLDER_NAME, parentId: null }).returning();
    }

    const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
    const svc = new ObjectStorageService();

    // 1. Knowledge read-out — stable object id so it updates in place.
    const kbBuf = Buffer.from(KB_HEADER + CRM_FUNCTIONALITY_KNOWLEDGE, "utf-8");
    let kbPath: string;
    if (svc.isLocal()) {
      await svc.saveUpload(KB_OBJECT_ID, kbBuf, "text/markdown");
      kbPath = `/objects/db/${KB_OBJECT_ID}`;
    } else {
      kbPath = await svc.writeObject(kbBuf, "text/markdown");
    }
    const [existingKb] = await db
      .select()
      .from(docFiles)
      .where(and(eq(docFiles.folderId, folder.id), eq(docFiles.name, KB_DOC_NAME)));
    if (existingKb) {
      await db
        .update(docFiles)
        .set({ url: kbPath, objectPath: kbPath, size: kbBuf.length, trashedAt: null, updatedAt: new Date() })
        .where(eq(docFiles.id, existingKb.id));
    } else {
      await db.insert(docFiles).values({
        folderId: folder.id,
        name: KB_DOC_NAME,
        url: kbPath,
        objectPath: kbPath,
        contentType: "text/markdown",
        size: kbBuf.length,
      });
    }

    // 2. Policy doc — create only if absent so the team's edits stick.
    const [existingPolicy] = await db
      .select()
      .from(docFiles)
      .where(and(eq(docFiles.folderId, folder.id), eq(docFiles.name, POLICY_DOC_NAME)));
    if (!existingPolicy) {
      const buf = Buffer.from(POLICY_SEED, "utf-8");
      const p = await svc.writeObject(buf, "text/markdown");
      await db.insert(docFiles).values({
        folderId: folder.id,
        name: POLICY_DOC_NAME,
        url: p,
        objectPath: p,
        contentType: "text/markdown",
        size: buf.length,
      });
      console.log("[GibbsDocs] Seeded the Payments & fees policy document");
    }
  } catch (e) {
    console.error("[GibbsDocs] seeding failed (non-fatal):", (e as Error).message);
  }
}
