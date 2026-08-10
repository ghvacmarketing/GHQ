import { Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { crmUsers, crmSessions, crmAuditLog, type CrmUser, type CrmSession } from "@shared/schema";
import { eq, and, gt, ne, isNull, or } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

const CRM_SESSION_COOKIE = "crm_session_id";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // desktop: 8 hours
// Phones stay signed in unless the app sits UNUSED for a week — the expiry
// slides forward on every authenticated request (see validateCrmSession).
const MOBILE_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export function sessionDurationFor(deviceClass: string | null | undefined): number {
  return deviceClass === "mobile" ? MOBILE_SESSION_DURATION_MS : SESSION_DURATION_MS;
}

// The COOKIE must outlive the sliding server expiry: stamped only at login,
// a 7-day cookie logged phones out on day 7 even when used daily. The server
// session (7d sliding) stays the authority on when access actually ends.
export function cookieMaxAgeFor(deviceClass: string | null | undefined): number {
  return deviceClass === "mobile" ? 30 * 24 * 60 * 60 * 1000 : SESSION_DURATION_MS;
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

/** Phone/tablet vs desktop, from the login's user agent. Displacement is
 *  scoped by this so one mobile and one desktop session can coexist. */
export function classifyDevice(userAgent?: string | null): "mobile" | "desktop" {
  return userAgent && /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent) ? "mobile" : "desktop";
}

export async function createCrmSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<CrmSession> {
  const sessionToken = generateSessionToken();
  const deviceClass = classifyDevice(userAgent);
  const expiresAt = new Date(Date.now() + sessionDurationFor(deviceClass));

  const [session] = await db
    .insert(crmSessions)
    .values({
      userId,
      sessionToken,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      deviceClass,
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
        gt(crmSessions.expiresAt, new Date()),
        isNull(crmSessions.revokedAt)
      )
    );

  if (!session) return null;

  // Throttle lastSeenAt updates to reduce DB writes. Mobile sessions SLIDE:
  // every active minute pushes expiry a full week out, so a phone only logs
  // out after seven days genuinely off the app.
  const now = Date.now();
  const lastUpdate = lastSeenCache.get(session.id) || 0;
  if (now - lastUpdate > LAST_SEEN_THROTTLE_MS) {
    lastSeenCache.set(session.id, now);
    const patch: { lastSeenAt: Date; expiresAt?: Date } = { lastSeenAt: new Date() };
    if (session.deviceClass === "mobile") {
      patch.expiresAt = new Date(now + sessionDurationFor("mobile"));
    }
    db.update(crmSessions)
      .set(patch)
      .where(eq(crmSessions.id, session.id))
      .then(() => {})
      .catch((err) => console.error("lastSeenAt update failed:", err));
  }

  return session;
}

/** One active session PER DEVICE CLASS: a fresh login displaces the user's
 *  other live sessions of the same class (phone kicks phone, desktop kicks
 *  desktop), so one mobile and one desktop can stay signed in together. The
 *  displaced rows are MARKED (not deleted) so the old device's next request
 *  can be answered with a "someone signed in to your account" 401 instead of
 *  a silent one. Legacy rows with no recorded class are treated as matching.
 *  Returns how many were kicked. */
export async function revokeOtherCrmSessions(
  userId: string,
  keepSessionToken: string,
  deviceClass: "mobile" | "desktop"
): Promise<number> {
  const revoked = await db
    .update(crmSessions)
    .set({ revokedAt: new Date(), revokedReason: "new_login" })
    .where(
      and(
        eq(crmSessions.userId, userId),
        ne(crmSessions.sessionToken, keepSessionToken),
        isNull(crmSessions.revokedAt),
        gt(crmSessions.expiresAt, new Date()),
        or(eq(crmSessions.deviceClass, deviceClass), isNull(crmSessions.deviceClass))
      )
    )
    .returning({ id: crmSessions.id });
  return revoked.length;
}

/** A session that was displaced by a newer login (still unexpired). Used to
 *  turn the old device's 401 into an explicit security notice. */
export async function findRevokedCrmSession(sessionToken: string): Promise<CrmSession | null> {
  const [session] = await db
    .select()
    .from(crmSessions)
    .where(
      and(
        eq(crmSessions.sessionToken, sessionToken),
        gt(crmSessions.expiresAt, new Date())
      )
    );
  return session?.revokedAt ? session : null;
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
  role?: "owner" | "admin" | "supervisor" | "sales" | "tech";
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

// Dev-only auth bypass: when NODE_ENV !== "production", auto-authenticate as
// the first active owner (falling back to admin) so the CRM is usable without
// signing in. Disabled automatically in production. Opt out with
// DISABLE_DEV_AUTH_BYPASS=1.
let cachedDevBypassUser: CrmUser | null | undefined = undefined;
async function getDevBypassUser(): Promise<CrmUser | null> {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.DISABLE_DEV_AUTH_BYPASS === "1") return null;
  if (cachedDevBypassUser !== undefined) return cachedDevBypassUser;
  try {
    const [owner] = await db
      .select()
      .from(crmUsers)
      .where(and(eq(crmUsers.role, "owner"), eq(crmUsers.isActive, true)));
    if (owner) {
      cachedDevBypassUser = owner;
      console.log(`[dev-auth-bypass] Auto-authenticating as ${owner.email} (${owner.role})`);
      return owner;
    }
    const [admin] = await db
      .select()
      .from(crmUsers)
      .where(and(eq(crmUsers.role, "admin"), eq(crmUsers.isActive, true)));
    cachedDevBypassUser = admin || null;
    if (admin) {
      console.log(`[dev-auth-bypass] Auto-authenticating as ${admin.email} (${admin.role})`);
    }
    return cachedDevBypassUser;
  } catch (err) {
    console.error("[dev-auth-bypass] Failed to load dev user:", err);
    return null;
  }
}

export async function getCurrentCrmUser(req: Request): Promise<CrmUser | null> {
  if (req.crmUser) return req.crmUser;

  // Try Bearer token first, then fall back to cookie if Bearer is invalid.
  // This prevents a stale localStorage token from blocking a valid cookie
  // session (e.g. after Google OAuth, which can only set the cookie).
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : null;
  const cookieToken = req.cookies?.[CRM_SESSION_COOKIE] || null;

  const tokensToTry: string[] = [];
  if (bearerToken) tokensToTry.push(bearerToken);
  if (cookieToken && cookieToken !== bearerToken) tokensToTry.push(cookieToken);

  for (const token of tokensToTry) {
    const session = await validateCrmSession(token);
    if (!session) continue;
    const user = await getCrmUserById(session.userId);
    if (!user || !user.isActive) continue;
    req.crmSession = session;
    req.crmUser = user;
    return user;
  }

  // Dev-only fallback: no valid session, but we're not in production.
  const devUser = await getDevBypassUser();
  if (devUser) {
    req.crmUser = devUser;
    return devUser;
  }

  return null;
}

export function requireCrmAuth(req: Request, res: Response, next: NextFunction) {
  getCurrentCrmUser(req)
    .then(async (user) => {
      if (!user) {
        // Was this session displaced by a newer login? Tell the device so —
        // the client shows a "someone signed in to your account" notice
        // instead of silently bouncing to the login page.
        const token = getCrmSessionToken(req);
        if (token) {
          const revoked = await findRevokedCrmSession(token).catch(() => null);
          if (revoked) {
            return res.status(401).json({
              message: "You were signed out because your account was just signed in on another device.",
              code: "SESSION_REPLACED",
              revokedAt: revoked.revokedAt,
            });
          }
        }
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
const ADMIN_ROLES = ["owner", "admin", "supervisor"];
// Sales roles have manager-level features (desktop + mobile)
const SALES_ROLES = ["owner", "admin", "supervisor", "sales"];
// Tech roles can create invoices and quotes (all CRM users)
const TECH_ROLES = ["owner", "admin", "supervisor", "sales", "tech"];
// Mobile roles can access the mobile app
const MOBILE_ROLES = ["owner", "supervisor", "sales", "tech"];

// Helper to check if user is a supervisor (enhanced mobile view)
export function isSupervisor(role: string): boolean {
  return role === "supervisor";
}

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

export function requireCrmOwner(req: Request, res: Response, next: NextFunction) {
  getCurrentCrmUser(req)
    .then((user) => {
      if (!user) {
        return res.status(401).json({ message: "Unauthorized - CRM authentication required" });
      }
      if (user.role !== "owner") {
        return res.status(403).json({ message: "Forbidden - Owner role required" });
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
