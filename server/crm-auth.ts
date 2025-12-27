import { Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { crmUsers, crmSessions, type CrmUser, type CrmSession } from "@shared/schema";
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

  await db
    .update(crmSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(crmSessions.id, session.id));

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
  role?: "owner" | "manager" | "dispatcher" | "sales" | "tech" | "viewer";
  phone?: string;
}): Promise<CrmUser> {
  const passwordHash = await hashPassword(data.password);
  
  const [user] = await db
    .insert(crmUsers)
    .values({
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role || "viewer",
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
      role: "owner",
    });
    console.log("Created default CRM admin user: admin@ghvac.com");
  }
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

export { CRM_SESSION_COOKIE };
