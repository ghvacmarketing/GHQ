import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { Resend } from "resend";
import { storage } from "./storage";
import { requireCrmAuth, getCurrentCrmUser } from "./crm-auth";
import { ObjectStorageService, ObjectNotFoundError } from "./replit_integrations/object_storage/objectStorage";
import { flattenSignedPdf, getPdfPageCount } from "./services/esign-pdf";
import { getUncachableStripeClient } from "./stripeClient";
import type { InsertSignatureField, SignatureDocument } from "@shared/schema";

const objectStorageService = new ObjectStorageService();

const FIELD_TYPES = ["signature", "initials", "date", "text", "name"];
const RECIPIENT_COLORS = ["#711419", "#1d4ed8", "#15803d", "#b45309", "#7c3aed", "#0e7490"];

function baseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}

function signingUrl(req: Request, token: string): string {
  return `${baseUrl(req)}/sign/${token}`;
}

async function sendSigningEmail(opts: {
  to: string;
  recipientName: string;
  documentTitle: string;
  message?: string | null;
  url: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[esign] RESEND_API_KEY not set - skipping email, link must be shared manually");
    return false;
  }
  // Must be on a Resend-verified domain. ghvacinc.com is the verified domain used
  // by the working quote/invoice emails; quotes@ghvac.work is NOT verified and is rejected.
  const from = process.env.SIGNATURE_FROM_EMAIL || "signatures@ghvacinc.com";
  const brand = process.env.BRAND_NAME || "Giesbrecht HVAC";
  const resend = new Resend(apiKey);
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <div style="background:#711419;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="color:#fff;font-size:18px;font-weight:700">${brand}</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 10px 10px">
      <p style="font-size:15px">Hi ${escapeHtml(opts.recipientName)},</p>
      <p style="font-size:15px;line-height:1.6">You have a document waiting for your signature:
        <strong>${escapeHtml(opts.documentTitle)}</strong>.</p>
      ${opts.message ? `<p style="font-size:14px;line-height:1.6;color:#444;background:#faf4f4;border-left:3px solid #711419;padding:10px 14px;border-radius:4px">${escapeHtml(opts.message)}</p>` : ""}
      <p style="text-align:center;margin:28px 0">
        <a href="${opts.url}" style="background:#711419;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block">Review &amp; Sign</a>
      </p>
      <p style="font-size:12px;color:#888;line-height:1.5">If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${opts.url}" style="color:#711419">${opts.url}</a></p>
    </div>
  </div>`;
  try {
    const { error } = await resend.emails.send({
      from,
      to: [opts.to],
      subject: `Signature requested: ${opts.documentTitle}`,
      html,
      text: `Hi ${opts.recipientName},\n\nYou have a document waiting for your signature: ${opts.documentTitle}.\n${opts.message ? "\n" + opts.message + "\n" : ""}\nReview & sign here: ${opts.url}\n`,
    });
    if (error) {
      console.error("[esign] Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[esign] email send failed:", err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Public-facing summary of a document's deposit request (null when none/zero).
function depositView(doc: SignatureDocument) {
  if (!doc.depositEnabled || !doc.depositAmountCents || doc.depositAmountCents <= 0) return null;
  return {
    enabled: true,
    amount: doc.depositAmountCents / 100,
    mode: doc.depositMode || "amount",
    percentage: doc.depositPercentage || null,
    paid: !!doc.depositPaidAt,
    paidAt: doc.depositPaidAt || null,
  };
}

export function registerEsignRoutes(app: Express): void {
  // ===================== CRM (authenticated) =====================

  // List all documents
  app.get("/api/crm/signature-documents", requireCrmAuth, async (_req, res) => {
    try {
      const docs = await storage.getAllSignatureDocuments();
      const withCounts = await Promise.all(docs.map(async (d) => {
        const recipients = await storage.getSignatureRecipients(d.id);
        return {
          ...d,
          recipientCount: recipients.length,
          signedCount: recipients.filter((r) => r.status === "signed").length,
        };
      }));
      res.json(withCounts);
    } catch (err) {
      console.error("[esign] list error:", err);
      res.status(500).json({ message: "Failed to load documents" });
    }
  });

  // Create a document (after the PDF has been uploaded to object storage)
  app.post("/api/crm/signature-documents", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const { title, originalObjectPath, message } = req.body || {};
      if (!title || !originalObjectPath) {
        return res.status(400).json({ message: "title and originalObjectPath are required" });
      }
      let pageCount = 1;
      try {
        pageCount = await getPdfPageCount(originalObjectPath);
      } catch (e) {
        console.error("[esign] could not read page count:", e);
        return res.status(400).json({ message: "Could not read the uploaded PDF" });
      }
      const user = await getCurrentCrmUser(req);
      const doc = await storage.createSignatureDocument({
        title: String(title).slice(0, 200),
        originalObjectPath,
        message: message ? String(message).slice(0, 2000) : null,
        pageCount,
        status: "draft",
        createdBy: user?.id ?? null,
      } as any);
      res.json(doc);
    } catch (err) {
      console.error("[esign] create error:", err);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  // Get a single document with recipients + fields
  app.get("/api/crm/signature-documents/:id", requireCrmAuth, async (req, res) => {
    try {
      const doc = await storage.getSignatureDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      const [recipients, fields] = await Promise.all([
        storage.getSignatureRecipients(doc.id),
        storage.getSignatureFields(doc.id),
      ]);
      res.json({ ...doc, recipients, fields });
    } catch (err) {
      console.error("[esign] get error:", err);
      res.status(500).json({ message: "Failed to load document" });
    }
  });

  // Update title / message (draft only)
  app.patch("/api/crm/signature-documents/:id", requireCrmAuth, async (req, res) => {
    try {
      const doc = await storage.getSignatureDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.status !== "draft") return res.status(400).json({ message: "Only draft documents can be edited" });
      const patch: any = {};
      if (typeof req.body.title === "string") patch.title = req.body.title.slice(0, 200);
      if (typeof req.body.message === "string") patch.message = req.body.message.slice(0, 2000);
      const updated = await storage.updateSignatureDocument(doc.id, patch);
      res.json(updated);
    } catch (err) {
      console.error("[esign] patch error:", err);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // Configure the optional deposit / payment request on a document.
  // Accepts either an exact amount or a percentage of a contract total; the
  // resolved amount is stored in cents. Changing it clears any existing link
  // so a fresh one is generated with the new amount.
  app.put("/api/crm/signature-documents/:id/deposit", requireCrmAuth, async (req, res) => {
    try {
      const doc = await storage.getSignatureDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.depositPaidAt) return res.status(400).json({ message: "A deposit has already been paid on this document." });

      const { enabled, mode, amountDollars, contractTotalDollars, percentage } = req.body || {};

      if (!enabled) {
        const updated = await storage.updateSignatureDocument(doc.id, {
          depositEnabled: false,
          stripePaymentLinkId: null,
          stripePaymentLinkUrl: null,
        } as any);
        return res.json(updated);
      }

      let depositAmountCents = 0;
      let contractTotalCents: number | null = null;
      let pct: number | null = null;
      const resolvedMode = mode === "percent" ? "percent" : "amount";

      if (resolvedMode === "percent") {
        const total = Number(contractTotalDollars);
        pct = Math.round(Number(percentage));
        if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ message: "Enter a valid contract total." });
        if (!Number.isFinite(pct) || pct < 1 || pct > 100) return res.status(400).json({ message: "Percentage must be between 1 and 100." });
        contractTotalCents = Math.round(total * 100);
        depositAmountCents = Math.round((contractTotalCents * pct) / 100);
      } else {
        const amt = Number(amountDollars);
        if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "Enter a valid deposit amount." });
        depositAmountCents = Math.round(amt * 100);
      }

      if (depositAmountCents < 50) return res.status(400).json({ message: "Deposit must be at least $0.50." });

      const updated = await storage.updateSignatureDocument(doc.id, {
        depositEnabled: true,
        depositMode: resolvedMode,
        contractTotalCents,
        depositPercentage: pct,
        depositAmountCents,
        // regenerate the link next time it's requested
        stripePaymentLinkId: null,
        stripePaymentLinkUrl: null,
      } as any);
      res.json(updated);
    } catch (err) {
      console.error("[esign] deposit config error:", err);
      res.status(500).json({ message: "Failed to save deposit settings" });
    }
  });

  // Delete a document
  app.delete("/api/crm/signature-documents/:id", requireCrmAuth, async (req, res) => {
    try {
      const ok = await storage.deleteSignatureDocument(req.params.id);
      res.json({ success: ok });
    } catch (err) {
      console.error("[esign] delete error:", err);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Add a recipient (draft only)
  app.post("/api/crm/signature-documents/:id/recipients", requireCrmAuth, async (req, res) => {
    try {
      const doc = await storage.getSignatureDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.status !== "draft") return res.status(400).json({ message: "Cannot add recipients after sending" });
      const { name, email, signingOrder } = req.body || {};
      if (!name || !email) return res.status(400).json({ message: "name and email are required" });
      const existing = await storage.getSignatureRecipients(doc.id);
      const color = RECIPIENT_COLORS[existing.length % RECIPIENT_COLORS.length];
      const recipient = await storage.createSignatureRecipient({
        documentId: doc.id,
        name: String(name).slice(0, 120),
        email: String(email).slice(0, 200),
        signingOrder: Number.isFinite(signingOrder) ? Number(signingOrder) : existing.length,
        color,
      } as any);
      res.json(recipient);
    } catch (err) {
      console.error("[esign] add recipient error:", err);
      res.status(500).json({ message: "Failed to add recipient" });
    }
  });

  // Delete a recipient (draft only) - also removes that recipient's fields (cascade)
  app.delete("/api/crm/signature-documents/:id/recipients/:recipientId", requireCrmAuth, async (req, res) => {
    try {
      const doc = await storage.getSignatureDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.status !== "draft") return res.status(400).json({ message: "Cannot remove recipients after sending" });
      const recipients = await storage.getSignatureRecipients(doc.id);
      if (!recipients.some((r) => r.id === req.params.recipientId)) {
        return res.status(404).json({ message: "Recipient not found on this document" });
      }
      const ok = await storage.deleteSignatureRecipient(req.params.recipientId);
      res.json({ success: ok });
    } catch (err) {
      console.error("[esign] delete recipient error:", err);
      res.status(500).json({ message: "Failed to remove recipient" });
    }
  });

  // Replace all fields (draft only)
  app.put("/api/crm/signature-documents/:id/fields", requireCrmAuth, async (req, res) => {
    try {
      const doc = await storage.getSignatureDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.status !== "draft") return res.status(400).json({ message: "Cannot edit fields after sending" });
      const recipients = await storage.getSignatureRecipients(doc.id);
      const recipientIds = new Set(recipients.map((r) => r.id));
      const incoming = Array.isArray(req.body?.fields) ? req.body.fields : [];
      const fields: InsertSignatureField[] = [];
      for (const f of incoming) {
        if (!recipientIds.has(f.recipientId)) continue;
        if (!FIELD_TYPES.includes(f.type)) continue;
        const page = Math.max(1, Math.min(Number(f.page) || 1, doc.pageCount));
        const clamp = (n: any) => Math.max(0, Math.min(1, Number(n) || 0));
        fields.push({
          documentId: doc.id,
          recipientId: f.recipientId,
          page,
          type: f.type,
          x: clamp(f.x),
          y: clamp(f.y),
          width: clamp(f.width),
          height: clamp(f.height),
          required: f.required !== false,
          value: null,
        } as any);
      }
      const saved = await storage.replaceSignatureFields(doc.id, fields);
      res.json(saved);
    } catch (err) {
      console.error("[esign] save fields error:", err);
      res.status(500).json({ message: "Failed to save fields" });
    }
  });

  // Send the document for signing
  app.post("/api/crm/signature-documents/:id/send", requireCrmAuth, async (req, res) => {
    try {
      const doc = await storage.getSignatureDocument(req.params.id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.status === "completed") return res.status(400).json({ message: "Document already completed" });
      const recipients = await storage.getSignatureRecipients(doc.id);
      if (recipients.length === 0) return res.status(400).json({ message: "Add at least one recipient before sending" });
      const fields = await storage.getSignatureFields(doc.id);
      if (fields.length === 0) return res.status(400).json({ message: "Place at least one field before sending" });
      const recipientsWithFields = new Set(fields.map((f) => f.recipientId));
      const missing = recipients.filter((r) => !recipientsWithFields.has(r.id));
      if (missing.length > 0) {
        return res.status(400).json({ message: `Each recipient needs at least one field. Missing: ${missing.map((m) => m.name).join(", ")}` });
      }

      const results: Array<{ recipientId: string; email: string; emailed: boolean; url: string }> = [];
      for (const r of recipients) {
        const token = r.token || nanoid(36);
        const url = signingUrl(req, token);
        const emailed = await sendSigningEmail({
          to: r.email,
          recipientName: r.name,
          documentTitle: doc.title,
          message: doc.message,
          url,
        });
        await storage.updateSignatureRecipient(r.id, { token, status: "sent" });
        results.push({ recipientId: r.id, email: r.email, emailed, url });
      }
      await storage.updateSignatureDocument(doc.id, { status: "sent", sentAt: new Date() });
      res.json({ success: true, recipients: results });
    } catch (err) {
      console.error("[esign] send error:", err);
      res.status(500).json({ message: "Failed to send document" });
    }
  });

  // ===================== Public signing (token-based) =====================

  // Get the signing payload for a recipient
  app.get("/api/sign/:token", async (req, res) => {
    try {
      const recipient = await storage.getSignatureRecipientByToken(req.params.token);
      if (!recipient) return res.status(404).json({ message: "This signing link is invalid or has expired." });
      const doc = await storage.getSignatureDocument(recipient.documentId);
      if (!doc) return res.status(404).json({ message: "Document not found." });
      const allFields = await storage.getSignatureFields(doc.id);
      const myFields = allFields.filter((f) => f.recipientId === recipient.id);
      if (recipient.status === "sent") {
        await storage.updateSignatureRecipient(recipient.id, { status: "viewed", viewedAt: new Date() });
      }
      res.json({
        document: { id: doc.id, title: doc.title, message: doc.message, pageCount: doc.pageCount, status: doc.status },
        recipient: { id: recipient.id, name: recipient.name, email: recipient.email, status: recipient.status, color: recipient.color },
        fields: myFields,
        alreadySigned: recipient.status === "signed",
        deposit: depositView(doc),
      });
    } catch (err) {
      console.error("[esign] sign get error:", err);
      res.status(500).json({ message: "Failed to load signing session" });
    }
  });

  // Stream the PDF bytes for a signing session
  app.get("/api/sign/:token/file", async (req, res) => {
    try {
      const recipient = await storage.getSignatureRecipientByToken(req.params.token);
      if (!recipient) return res.status(404).json({ message: "Invalid link" });
      const doc = await storage.getSignatureDocument(recipient.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });
      const path = doc.signedObjectPath || doc.originalObjectPath;
      await objectStorageService.serveObject(path, res);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return res.status(404).json({ message: "File not found" });
      console.error("[esign] sign file error:", err);
      res.status(500).json({ message: "Failed to load document file" });
    }
  });

  // Save in-progress field values WITHOUT finalizing. Lets the signer step out
  // to pay the deposit without losing the signatures they've already drawn.
  app.post("/api/sign/:token/save-draft", async (req, res) => {
    try {
      const recipient = await storage.getSignatureRecipientByToken(req.params.token);
      if (!recipient) return res.status(404).json({ message: "Invalid link" });
      if (recipient.status === "signed") return res.json({ success: true });
      const values: Record<string, string> = req.body?.values || {};
      const myFields = await storage.getSignatureFieldsByRecipient(recipient.id);
      const isImageDataUrl = (v: string) =>
        /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=\s]+$/.test(v) && v.length < 5 * 1024 * 1024;
      const now = new Date();
      for (const f of myFields) {
        const raw = values[f.id];
        if (raw == null || String(raw).trim().length === 0) continue;
        const v = String(raw);
        if (f.type === "signature" || f.type === "initials") {
          if (!isImageDataUrl(v)) continue;
          await storage.updateSignatureField(f.id, { value: v, completedAt: now });
        } else {
          await storage.updateSignatureField(f.id, { value: v.trim().slice(0, 500), completedAt: now });
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[esign] save-draft error:", err);
      res.status(500).json({ message: "Failed to save progress" });
    }
  });

  // Submit signed field values
  app.post("/api/sign/:token/submit", async (req, res) => {
    try {
      const recipient = await storage.getSignatureRecipientByToken(req.params.token);
      if (!recipient) return res.status(404).json({ message: "Invalid link" });
      if (recipient.status === "signed") return res.status(400).json({ message: "You have already signed this document." });
      const doc = await storage.getSignatureDocument(recipient.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });

      // When a deposit is required, it must be paid before the document can be
      // completed. Signing alone is not enough.
      if (doc.depositEnabled && (doc.depositAmountCents ?? 0) > 0 && !doc.depositPaidAt) {
        return res.status(400).json({ message: "Please pay the required deposit before completing.", requiresPayment: true });
      }

      const values: Record<string, string> = req.body?.values || {};
      const myFields = await storage.getSignatureFieldsByRecipient(recipient.id);

      const isImageDataUrl = (v: string) =>
        /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=\s]+$/.test(v) && v.length < 5 * 1024 * 1024;

      // Validate each field by type; clean the values we will persist
      const clean: Record<string, string> = {};
      for (const f of myFields) {
        const raw = values[f.id];
        const provided = raw != null && String(raw).trim().length > 0;
        if (!provided) {
          if (f.required) {
            return res.status(400).json({ message: "Please complete all required fields before submitting." });
          }
          continue;
        }
        const v = String(raw);
        if (f.type === "signature" || f.type === "initials") {
          if (!isImageDataUrl(v)) {
            return res.status(400).json({ message: "Signature fields must contain a drawn signature." });
          }
          clean[f.id] = v;
        } else {
          // text | date | name — store trimmed, length-bounded plain text
          clean[f.id] = v.trim().slice(0, 500);
          if (f.required && clean[f.id].length === 0) {
            return res.status(400).json({ message: "Please complete all required fields before submitting." });
          }
        }
      }

      // Persist values
      const now = new Date();
      for (const f of myFields) {
        const v = clean[f.id];
        if (v) {
          await storage.updateSignatureField(f.id, { value: v, completedAt: now });
        }
      }
      await storage.updateSignatureRecipient(recipient.id, { status: "signed", signedAt: now });

      // If everyone has signed, flatten and complete
      const recipients = await storage.getSignatureRecipients(doc.id);
      const allSigned = recipients.every((r) => (r.id === recipient.id ? true : r.status === "signed"));
      if (allSigned) {
        try {
          const allFields = await storage.getSignatureFields(doc.id);
          const signedPath = await flattenSignedPdf(doc.originalObjectPath, allFields);
          await storage.updateSignatureDocument(doc.id, { status: "completed", completedAt: now, signedObjectPath: signedPath });
        } catch (e) {
          console.error("[esign] flatten failed:", e);
          // Still mark completed even if flattening fails; signed values are stored.
          await storage.updateSignatureDocument(doc.id, { status: "completed", completedAt: now });
        }
      }
      res.json({ success: true, allSigned });
    } catch (err) {
      console.error("[esign] submit error:", err);
      res.status(500).json({ message: "Failed to submit signature" });
    }
  });

  // Generate (or reuse) the Stripe deposit payment link for a signed document.
  // Signing is required first: the recipient must have completed their signature.
  app.post("/api/sign/:token/payment-link", async (req, res) => {
    try {
      const recipient = await storage.getSignatureRecipientByToken(req.params.token);
      if (!recipient) return res.status(404).json({ message: "Invalid link" });
      const doc = await storage.getSignatureDocument(recipient.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });

      if (!doc.depositEnabled || !doc.depositAmountCents || doc.depositAmountCents <= 0) {
        return res.status(400).json({ message: "No deposit is requested on this document." });
      }
      // Signing must be complete first: every required field needs a value
      // (persisted via save-draft before the signer is redirected to pay).
      const myFields = await storage.getSignatureFieldsByRecipient(recipient.id);
      const missing = myFields.filter((f) => f.required && (!f.value || String(f.value).trim().length === 0));
      if (missing.length > 0) {
        return res.status(400).json({ message: "Please complete all required fields before paying.", requiresSignature: true });
      }
      if (doc.depositPaidAt) {
        return res.json({ paid: true, paymentLinkUrl: null });
      }
      if (doc.stripePaymentLinkUrl) {
        return res.json({ paymentLinkUrl: doc.stripePaymentLinkUrl, amount: doc.depositAmountCents / 100 });
      }

      const stripe = await getUncachableStripeClient();
      const amount = Math.max(50, doc.depositAmountCents);
      const link = await stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Deposit — ${doc.title}`.slice(0, 250),
                description: doc.depositMode === "percent" && doc.depositPercentage
                  ? `${doc.depositPercentage}% deposit`
                  : "Contract deposit",
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        metadata: { type: "esign_deposit", documentId: doc.id },
        after_completion: {
          type: "redirect",
          redirect: { url: `${signingUrl(req, req.params.token)}?paid=1` },
        },
      });

      await storage.updateSignatureDocument(doc.id, {
        stripePaymentLinkId: link.id,
        stripePaymentLinkUrl: link.url,
      } as any);

      res.json({ paymentLinkUrl: link.url, amount: amount / 100 });
    } catch (err: any) {
      console.error("[esign] payment-link error:", err);
      res.status(500).json({ message: err?.message || "Failed to create payment link" });
    }
  });

  // Verify a deposit payment on return from Stripe and mark it paid.
  app.post("/api/sign/:token/verify-payment", async (req, res) => {
    try {
      const recipient = await storage.getSignatureRecipientByToken(req.params.token);
      if (!recipient) return res.status(404).json({ message: "Invalid link" });
      const doc = await storage.getSignatureDocument(recipient.documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });

      if (doc.depositPaidAt) {
        return res.json({ paid: true, paidAt: doc.depositPaidAt, amount: (doc.depositAmountCents || 0) / 100 });
      }
      if (!doc.stripePaymentLinkId) {
        return res.json({ paid: false });
      }

      const stripe = await getUncachableStripeClient();
      const sessions = await stripe.checkout.sessions.list({ payment_link: doc.stripePaymentLinkId, limit: 10 });
      for (const session of sessions.data) {
        if (session.payment_status !== "paid" || session.status !== "complete") continue;
        const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
        if (!piId) continue;
        const pi: any = await stripe.paymentIntents.retrieve(piId, { expand: ["charges.data"] });
        if (pi.status !== "succeeded" || (pi.amount_received ?? 0) <= 0) continue;
        const wasRefunded =
          (pi.amount_refunded ?? 0) > 0 ||
          pi.charges?.data?.some((c: any) => c.refunded || (c.amount_refunded ?? 0) > 0 || c.status !== "succeeded");
        if (wasRefunded) continue;

        const now = new Date();
        await storage.updateSignatureDocument(doc.id, {
          depositPaidAt: now,
          depositAmountCents: pi.amount_received ?? doc.depositAmountCents,
          stripePaymentIntentId: piId,
        } as any);
        return res.json({ paid: true, paidAt: now, amount: (pi.amount_received ?? doc.depositAmountCents ?? 0) / 100 });
      }

      res.json({ paid: false });
    } catch (err: any) {
      console.error("[esign] verify-payment error:", err);
      res.status(500).json({ message: err?.message || "Failed to verify payment" });
    }
  });
}
