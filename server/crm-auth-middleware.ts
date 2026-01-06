import { Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { crmUsers, crmSessions, crmAuditLog, CrmUser, CrmUserRole } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

declare global {
  namespace Express {
    interface Request {
      crmUser?: CrmUser;
      crmSessionId?: string;
    }
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  if (!hashedPassword || !salt) return false;
  const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
  const suppliedPasswordBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

const ROLE_HIERARCHY: Record<CrmUserRole, number> = {
  owner: 100,
  admin: 80,
  sales: 60,
  tech: 40,
};

// Roles that can access desktop CRM
const DESKTOP_ROLES: CrmUserRole[] = ["owner", "admin", "sales"];

// Roles that can access mobile app
const MOBILE_ROLES: CrmUserRole[] = ["owner", "sales", "tech"];

// Admin-level roles (owner and admin)
const ADMIN_ROLES: CrmUserRole[] = ["owner", "admin"];

// Sales-level and above (for manager-level features)
const SALES_ROLES: CrmUserRole[] = ["owner", "admin", "sales"];

// All authenticated roles (for basic access)
const ALL_ROLES: CrmUserRole[] = ["owner", "admin", "sales", "tech"];

export function isAdmin(role: CrmUserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isSalesOrAbove(role: CrmUserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canAccessDesktop(role: CrmUserRole): boolean {
  return DESKTOP_ROLES.includes(role);
}

export function canAccessMobile(role: CrmUserRole): boolean {
  return MOBILE_ROLES.includes(role);
}

// Throttle lastSeenAt updates to reduce DB writes
const lastSeenCache = new Map<string, number>();
const LAST_SEEN_THROTTLE_MS = 60000; // Only update lastSeenAt once per minute

export async function requireCrmAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.crm_session;
  const sessionToken = authHeader?.replace("Bearer ", "") || cookieToken;

  // Debug logging
  console.log("[CRM Auth Debug]", {
    hasAuthHeader: !!authHeader,
    hasCookieToken: !!cookieToken,
    tokenFound: !!sessionToken,
  });

  if (!sessionToken) {
    return res.status(401).json({ message: "Unauthorized - No session token" });
  }

  try {
    // Single JOIN query for session + user validation
    const result = await db
      .select({
        session: crmSessions,
        user: crmUsers,
      })
      .from(crmSessions)
      .innerJoin(crmUsers, eq(crmSessions.userId, crmUsers.id))
      .where(
        and(
          eq(crmSessions.sessionToken, sessionToken),
          gt(crmSessions.expiresAt, new Date()),
          eq(crmUsers.isActive, true)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return res.status(401).json({ message: "Unauthorized - Invalid or expired session" });
    }

    const { session, user } = result[0];

    // Throttle lastSeenAt updates - fire and forget
    const now = Date.now();
    const lastUpdate = lastSeenCache.get(session.id) || 0;
    if (now - lastUpdate > LAST_SEEN_THROTTLE_MS) {
      lastSeenCache.set(session.id, now);
      db.update(crmSessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(crmSessions.id, session.id))
        .catch((err) => console.error("lastSeenAt update failed:", err));
    }

    req.crmUser = user;
    req.crmSessionId = session.id;
    next();
  } catch (error) {
    console.error("CRM auth error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export function requireCrmRole(...allowedRoles: CrmUserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.crmUser) {
      return res.status(401).json({ message: "Unauthorized - Not authenticated" });
    }

    if (!allowedRoles.includes(req.crmUser.role)) {
      return res.status(403).json({ 
        message: `Forbidden - Required roles: ${allowedRoles.join(", ")}` 
      });
    }

    next();
  };
}

export function requireCrmAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.crmUser) {
    return res.status(401).json({ message: "Unauthorized - Not authenticated" });
  }

  if (!isAdmin(req.crmUser.role)) {
    return res.status(403).json({ message: "Forbidden - Admin role required" });
  }

  next();
}

export function requireCrmSalesOrAbove(req: Request, res: Response, next: NextFunction) {
  if (!req.crmUser) {
    return res.status(401).json({ message: "Unauthorized - Not authenticated" });
  }

  if (!isSalesOrAbove(req.crmUser.role)) {
    return res.status(403).json({ message: "Forbidden - Sales role or above required" });
  }

  next();
}

export function requireDesktopAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.crmUser) {
    return res.status(401).json({ message: "Unauthorized - Not authenticated" });
  }

  if (!canAccessDesktop(req.crmUser.role)) {
    return res.status(403).json({ message: "Forbidden - Desktop CRM access required" });
  }

  next();
}

export function requireMobileAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.crmUser) {
    return res.status(401).json({ message: "Unauthorized - Not authenticated" });
  }

  if (!canAccessMobile(req.crmUser.role)) {
    return res.status(403).json({ message: "Forbidden - Mobile app access required" });
  }

  next();
}

export async function logCrmAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
  ipAddress?: string
) {
  try {
    await db.insert(crmAuditLog).values({
      actorUserId: userId,
      actorType: userId ? "user" : "system",
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
    });
  } catch (error) {
    console.error("Failed to log audit entry:", error);
  }
}
