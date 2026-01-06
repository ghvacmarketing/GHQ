import { Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { crmUsers, crmSessions, crmAuditLog, type CrmUser, type CrmSession } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

const CRM_SESSION_COOKIE = "crm_session_id";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

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

export function verifyGatePassword(supplied: string): boolean {
  const expected = "Giesbrecht";
  if (supplied.length !== expected.length) return false;
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  return timingSafeEqual(suppliedBuf, expectedBuf);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createCrmSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<CrmSession> {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const [session] = await db
    .insert(crmSessions)
    .values({
      userId,
      sessionToken,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      expiresAt,
    })
    .returning();

  return session;
}

const lastSeenCache = new Map<string, number>();
const LAST_SEEN_THROTTLE_MS = 60000; // Only update lastSeenAt once per minute

export async function validateCrmSession(sessionToken: string): Promise<CrmSession | null> {
  const [session] = await db
    .select()
    .from(crmSessions)
    .where(
      and(
        eq(crmSessions.sessionToken, sessionToken),
        gt(crmSessions.expiresAt, new Date())
      )
    );

  if (!session) return null;

  // Throttle lastSeenAt updates to reduce DB writes
  const now = Date.now();
  const lastUpdate = lastSeenCache.get(session.id) || 0;
  if (now - lastUpdate > LAST_SEEN_THROTTLE_MS) {
    lastSeenCache.set(session.id, now);
    db.update(crmSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(crmSessions.id, session.id))
      .then(() => {})
      .catch((err) => console.error("lastSeenAt update failed:", err));
  }

  return session;
}

export async function destroyCrmSession(sessionToken: string): Promise<boolean> {
  const result = await db
    .delete(crmSessions)
    .where(eq(crmSessions.sessionToken, sessionToken))
    .returning();

  return result.length > 0;
}

export async function getCrmUserById(userId: string): Promise<CrmUser | null> {
  const [user] = await db.select().from(crmUsers).where(eq(crmUsers.id, userId));
  return user || null;
}

export async function getCrmUserByEmail(email: string): Promise<CrmUser | null> {
  const [user] = await db.select().from(crmUsers).where(eq(crmUsers.email, email.toLowerCase()));
  return user || null;
}

export async function createCrmUser(data: {
  name: string;
  email: string;
  password: string;
  role?: "owner" | "admin" | "sales" | "tech";
  phone?: string;
}): Promise<CrmUser> {
  const passwordHash = await hashPassword(data.password);
  
  const [user] = await db
    .insert(crmUsers)
    .values({
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role || "tech",
      phone: data.phone || null,
    })
    .returning();

  return user;
}

export async function ensureDefaultAdminExists(): Promise<void> {
  const existingAdmin = await getCrmUserByEmail("admin@ghvac.com");
  if (!existingAdmin) {
    await createCrmUser({
      name: "Admin",
      email: "admin@ghvac.com",
      password: "Giesbrecht",
      role: "admin",
    });
    console.log("Created default CRM admin user: admin@ghvac.com");
  }
}

export async function ensureCrmUsersExist(): Promise<void> {
  // Define all CRM users with their correct roles:
  // - owner: Full access (desktop CRM + mobile)
  // - admin: Desktop CRM only
  // - sales: Desktop CRM + mobile (manager-level access)
  // - tech: Mobile only
  const crmUsers = [
    { name: "Ryo", email: "ghvacmarketing@gmail.com", role: "owner" as const },
    { name: "Kylee", email: "kylee@ghvacinc.com", role: "admin" as const },
    { name: "Chandler", email: "chandler@ghvacinc.com", role: "sales" as const },
    { name: "Earnest", email: "earnest@ghvacinc.com", role: "sales" as const },
    { name: "Tucker", email: "tucker@ghvacinc.com", role: "tech" as const },
    { name: "Brian", email: "brian@ghvacinc.com", role: "tech" as const },
    { name: "Christopher", email: "christopher@ghvacinc.com", role: "tech" as const },
  ];

  for (const user of crmUsers) {
    const existingUser = await getCrmUserByEmail(user.email);
    if (!existingUser) {
      await createCrmUser({
        name: user.name,
        email: user.email,
        password: "Giesbrecht",
        role: user.role,
      });
      console.log(`Created CRM user: ${user.email} (${user.role})`);
    }
  }
}

// Keep for backward compatibility
export async function ensureTechniciansExist(): Promise<void> {
  await ensureCrmUsersExist();
}

declare global {
  namespace Express {
    interface Request {
      crmUser?: CrmUser;
      crmSession?: CrmSession;
    }
  }
}

export function getCrmSessionToken(req: Request): string | null {
  // Check Authorization header first (for localStorage-based auth)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }
  // Fall back to cookie
  return req.cookies?.[CRM_SESSION_COOKIE] || null;
}

export async function getCurrentCrmUser(req: Request): Promise<CrmUser | null> {
  if (req.crmUser) return req.crmUser;

  const sessionToken = getCrmSessionToken(req);
  if (!sessionToken) return null;

  const session = await validateCrmSession(sessionToken);
  if (!session) return null;

  const user = await getCrmUserById(session.userId);
  if (!user || !user.isActive) return null;

  req.crmSession = session;
  req.crmUser = user;
  return user;
}

export function requireCrmAuth(req: Request, res: Response, next: NextFunction) {
  getCurrentCrmUser(req)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ message: "Unauthorized - CRM authentication required" });
      }
      next();
    })
    .catch((error) => {
      console.error("CRM auth error:", error);
      return res.status(500).json({ message: "Authentication error" });
    });
}

export function requireCrmRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    getCurrentCrmUser(req)
      .then((user) => {
        if (!user) {
          return res.status(401).json({ message: "Unauthorized - CRM authentication required" });
        }
        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({ message: "Forbidden - Insufficient permissions" });
        }
        next();
      })
      .catch((error) => {
        console.error("CRM auth error:", error);
        return res.status(500).json({ message: "Authentication error" });
      });
  };
}

// Role access groups
// Admin roles have full CRM management access
const ADMIN_ROLES = ["owner", "admin"];
// Sales roles have manager-level features (desktop + mobile)
const SALES_ROLES = ["owner", "admin", "sales"];
// Tech roles can create invoices and quotes (all CRM users)
const TECH_ROLES = ["owner", "admin", "sales", "tech"];
// Mobile roles can access the mobile app
const MOBILE_ROLES = ["owner", "sales", "tech"];

export function isAdmin(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isSalesOrAbove(role: string): boolean {
  return SALES_ROLES.includes(role);
}

export function isTechOrAbove(role: string): boolean {
  return TECH_ROLES.includes(role);
}

export function canAccessMobile(role: string): boolean {
  return MOBILE_ROLES.includes(role);
}

export function requireCrmAdmin(req: Request, res: Response, next: NextFunction) {
  getCurrentCrmUser(req)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ message: "Unauthorized - CRM authentication required" });
      }
      if (!isAdmin(user.role)) {
        return res.status(403).json({ message: "Forbidden - Admin role required" });
      }
      next();
    })
    .catch((error) => {
      console.error("CRM auth error:", error);
      return res.status(500).json({ message: "Authentication error" });
    });
}

export function requireCrmSalesOrAbove(req: Request, res: Response, next: NextFunction) {
  getCurrentCrmUser(req)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ message: "Unauthorized - CRM authentication required" });
      }
      if (!isSalesOrAbove(user.role)) {
        return res.status(403).json({ message: "Forbidden - Sales role or above required" });
      }
      next();
    })
    .catch((error) => {
      console.error("CRM auth error:", error);
      return res.status(500).json({ message: "Authentication error" });
    });
}

export function requireCrmTechOrAbove(req: Request, res: Response, next: NextFunction) {
  getCurrentCrmUser(req)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ message: "Unauthorized - CRM authentication required" });
      }
      if (!isTechOrAbove(user.role)) {
        return res.status(403).json({ message: "Forbidden - Tech role or above required" });
      }
      next();
    })
    .catch((error) => {
      console.error("CRM auth error:", error);
      return res.status(500).json({ message: "Authentication error" });
    });
}

export async function logCrmAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  try {
    await db.insert(crmAuditLog).values({
      actorUserId: userId,
      actorType: userId ? "user" : "system",
      action,
      entityType,
      entityId,
      metadata,
      ipAddress: ipAddress || null,
    });
  } catch (error) {
    console.error("Failed to log audit entry:", error);
  }
}

export { CRM_SESSION_COOKIE };
