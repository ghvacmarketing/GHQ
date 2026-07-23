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
      if (!p.startsWith("/")) return res.status(400).json({ message: "path is required" });
      const includeResolved = req.query.all === "1";
      const r: any = await db.execute(sql`
        SELECT pc.*, u.name AS "createdByName"
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
        SELECT pc.*, u.name AS "createdByName"
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
      const { resolved } = req.body || {};
      const r: any = await db.execute(sql`
        UPDATE pin_comments
        SET resolved = ${!!resolved}, resolved_at = ${resolved ? sql`now()` : null}
        WHERE id = ${req.params.id}
        RETURNING *`);
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
