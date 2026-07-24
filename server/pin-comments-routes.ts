import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { requireCrmAuth, getCurrentCrmUser } from "./crm-auth";

/**
 * Pin comments — "comment mode" annotations. A pin is dropped at an exact
 * point on any CRM page: anchored to the nearest [data-testid] element with a
 * fractional offset inside it (survives layout/resolution changes), plus
 * absolute page coordinates as a fallback. Tagged users get a notification
 * that deep-links back to the exact page and spot.
 */
export function registerPinCommentRoutes(app: Express): void {
  app.get("/api/crm/pins", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const p = String(req.query.path || "");
      const includeResolved = req.query.all === "1";
      // No path → every open pin across the CRM (the Tasks "Comments" view)
      if (!p) {
        const r: any = await db.execute(sql`
          SELECT pc.*, u.name AS "createdByName", to_char(pc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
          FROM pin_comments pc LEFT JOIN crm_users u ON u.id = pc.created_by
          ${includeResolved ? sql`` : sql`WHERE pc.resolved = false`}
          ORDER BY pc.created_at DESC LIMIT 200`);
        return res.json(r.rows ?? []);
      }
      if (!p.startsWith("/")) return res.status(400).json({ message: "path is required" });
      const r: any = await db.execute(sql`
        SELECT pc.*, u.name AS "createdByName", to_char(pc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        FROM pin_comments pc LEFT JOIN crm_users u ON u.id = pc.created_by
        WHERE pc.path = ${p} ${includeResolved ? sql`` : sql`AND pc.resolved = false`}
        ORDER BY pc.created_at ASC`);
      res.json(r.rows ?? []);
    } catch (e) {
      console.error("pins GET", e);
      res.status(500).json({ message: "Failed to load pins" });
    }
  });

  app.get("/api/crm/pins/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const r: any = await db.execute(sql`
        SELECT pc.*, u.name AS "createdByName", to_char(pc.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        FROM pin_comments pc LEFT JOIN crm_users u ON u.id = pc.created_by
        WHERE pc.id = ${req.params.id}`);
      if (!r.rows?.length) return res.status(404).json({ message: "Not found" });
      res.json(r.rows[0]);
    } catch (e) {
      console.error("pins GET :id", e);
      res.status(500).json({ message: "Failed to load pin" });
    }
  });

  app.post("/api/crm/pins", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { path, anchorTestId, anchorIndex, xPct, yPct, absX, absY, body, mentions } = req.body || {};
      if (!path || !String(path).startsWith("/") || !body?.trim()) {
        return res.status(400).json({ message: "path and body are required" });
      }
      const mentionIds: string[] = Array.isArray(mentions) ? mentions.map(String).slice(0, 20) : [];
      const r: any = await db.execute(sql`
        INSERT INTO pin_comments (path, anchor_testid, anchor_index, x_pct, y_pct, abs_x, abs_y, body, mentions, created_by)
        VALUES (${String(path).slice(0, 300)}, ${anchorTestId ? String(anchorTestId).slice(0, 200) : null},
                ${Number.isFinite(Number(anchorIndex)) ? Number(anchorIndex) : 0},
                ${Number(xPct) || 0}, ${Number(yPct) || 0}, ${Number(absX) || 0}, ${Number(absY) || 0},
                ${String(body).slice(0, 4000)}, ${JSON.stringify(mentionIds)}::jsonb, ${user.id})
        RETURNING *`);
      const pin = r.rows?.[0];

      // Notify tagged users — the notification deep-links to the exact spot
      for (const uid of mentionIds) {
        if (uid === user.id) continue;
        try {
          await db.execute(sql`
            INSERT INTO crm_notifications (user_id, type, title, preview, entity_type, entity_id, actor_id)
            VALUES (${uid}, 'mention', ${`${user.name} tagged you in a comment`},
                    ${String(body).slice(0, 160)}, 'pin_comment', ${pin.id}, ${user.id})`);
        } catch (e) {
          console.error("pin mention notify", e);
        }
      }
      res.status(201).json(pin);
    } catch (e) {
      console.error("pins POST", e);
      res.status(500).json({ message: "Failed to create pin" });
    }
  });

  app.patch("/api/crm/pins/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const { resolved, body } = req.body || {};

      // Body edit — only the author (or owner/admin) may rewrite a comment.
      if (typeof body === "string") {
        if (!body.trim()) return res.status(400).json({ message: "Comment can't be empty" });
        const user = await getCurrentCrmUser(req);
        if (!user) return res.status(401).json({ message: "Unauthorized" });
        const r: any = await db.execute(sql`
          UPDATE pin_comments
          SET body = ${String(body).trim().slice(0, 4000)}, edited_at = now()
          WHERE id = ${req.params.id} AND (created_by = ${user.id} OR ${user.role} IN ('owner', 'admin'))
          RETURNING *, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`);
        if (!r.rows?.length) return res.status(403).json({ message: "Only the author can edit this comment" });
        return res.json(r.rows[0]);
      }

      const r: any = await db.execute(sql`
        UPDATE pin_comments
        SET resolved = ${!!resolved}, resolved_at = ${resolved ? sql`now()` : null}
        WHERE id = ${req.params.id}
        RETURNING *, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`);
      if (!r.rows?.length) return res.status(404).json({ message: "Not found" });
      res.json(r.rows[0]);
    } catch (e) {
      console.error("pins PATCH", e);
      res.status(500).json({ message: "Failed to update pin" });
    }
  });

  app.delete("/api/crm/pins/:id", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const r: any = await db.execute(sql`
        DELETE FROM pin_comments
        WHERE id = ${req.params.id} AND (created_by = ${user.id} OR ${user.role} IN ('owner', 'admin'))
        RETURNING id`);
      if (!r.rows?.length) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("pins DELETE", e);
      res.status(500).json({ message: "Failed to delete pin" });
    }
  });
}
