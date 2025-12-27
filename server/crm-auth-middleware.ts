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
  manager: 80,
  dispatcher: 60,
  sales: 40,
  tech: 20,
  viewer: 10,
};

const ADMIN_ROLES: CrmUserRole[] = ["owner", "manager"];
const SALES_ROLES: CrmUserRole[] = ["owner", "manager", "dispatcher", "sales"];
const TECH_ROLES: CrmUserRole[] = ["owner", "manager", "dispatcher", "sales", "tech"];

export function isAdmin(role: CrmUserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isSalesOrAbove(role: CrmUserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function isTechOrAbove(role: CrmUserRole): boolean {
  return TECH_ROLES.includes(role);
}

export async function requireCrmAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const sessionToken = authHeader?.replace("Bearer ", "") || req.cookies?.crm_session;

  if (!sessionToken) {
    return res.status(401).json({ message: "Unauthorized - No session token" });
  }

  try {
    const [session] = await db
      .select()
      .from(crmSessions)
      .where(
        and(
          eq(crmSessions.sessionToken, sessionToken),
          gt(crmSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      return res.status(401).json({ message: "Unauthorized - Invalid or expired session" });
    }

    const [user] = await db
      .select()
      .from(crmUsers)
      .where(eq(crmUsers.id, session.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Unauthorized - User not found or inactive" });
    }

    await db
      .update(crmSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(crmSessions.id, session.id));

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
