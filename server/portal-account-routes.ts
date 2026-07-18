import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID, randomInt } from "crypto";
import { db } from "./db";
import {
  crmCustomers,
  crmProperties,
  crmUsers,
  crmNotifications,
  customerPortalAccounts,
  customerPortalSessions,
  customerPortalOtpCodes,
  type CustomerPortalAccount,
  type CustomerPortalOtpPurpose,
} from "@shared/schema";
import { and, eq, gt, desc, inArray, isNotNull, sql } from "drizzle-orm";
import {
  hashPassword,
  comparePasswords,
  requireCrmAuth,
  requireCrmAdmin,
  logCrmAudit,
} from "./crm-auth-middleware";
import { storage } from "./storage";
import { textlineClient } from "./textlineClient";

const PORTAL_SESSION_COOKIE = "portal_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const LOGIN_MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

export const PORTAL_SYNC_EDITS_SETTING = "customer_portal_sync_edits";

// Generic messages - never reveal whether a phone/email exists in the system
const GENERIC_LOGIN_ERROR = "Invalid phone/email or password";
const GENERIC_OTP_SENT =
  "If we found a matching account, a verification code was texted to that number.";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Digits only, US-centric: strips a leading 1 from 11-digit numbers. */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes("@");
}

// Simple in-memory rate limiter (per-process; fine for a single Render instance)
const rateBuckets = new Map<string, number[]>();
function rateLimitExceeded(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}
// Keep the bucket map from growing unbounded
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of Array.from(rateBuckets.entries())) {
    const fresh = hits.filter((t) => now - t < 60 * 60 * 1000);
    if (fresh.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, fresh);
  }
}, 10 * 60 * 1000).unref?.();

function clientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

async function sendOtpSms(normalizedPhone: string, code: string): Promise<boolean> {
  const body = `Your Giesbrecht HVAC verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this text.`;
  if (process.env.NODE_ENV !== "production" || !textlineClient.isConfigured()) {
    console.log(`[DEV] Portal OTP for ${normalizedPhone}: ${code}`);
    return true;
  }
  const result = await textlineClient.sendMessage({ phoneNumber: normalizedPhone, body });
  if (!result.success) {
    console.error("[Portal] Failed to send OTP SMS:", result.errorMessage);
  }
  return result.success;
}

async function createOtp(
  normalizedPhone: string,
  purpose: CustomerPortalOtpPurpose,
  accountId?: string,
): Promise<string> {
  const code = randomInt(100000, 1000000).toString();
  // Invalidate previous outstanding codes for the same phone+purpose
  await db.update(customerPortalOtpCodes)
    .set({ consumedAt: new Date() })
    .where(and(
      eq(customerPortalOtpCodes.normalizedPhone, normalizedPhone),
      eq(customerPortalOtpCodes.purpose, purpose),
      sql`${customerPortalOtpCodes.consumedAt} IS NULL`,
    ));
  await db.insert(customerPortalOtpCodes).values({
    normalizedPhone,
    code,
    purpose,
    accountId: accountId || null,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  return code;
}

/**
 * Check an OTP code. Increments the attempt counter on mismatch and marks the
 * row verified on success. Returns the OTP row id on success, null otherwise.
 */
async function verifyOtp(
  normalizedPhone: string,
  code: string,
  purpose: CustomerPortalOtpPurpose,
): Promise<{ id: string; accountId: string | null } | null> {
  const [otp] = await db.select()
    .from(customerPortalOtpCodes)
    .where(and(
      eq(customerPortalOtpCodes.normalizedPhone, normalizedPhone),
      eq(customerPortalOtpCodes.purpose, purpose),
      sql`${customerPortalOtpCodes.consumedAt} IS NULL`,
      gt(customerPortalOtpCodes.expiresAt, new Date()),
    ))
    .orderBy(desc(customerPortalOtpCodes.createdAt))
    .limit(1);

  if (!otp) return null;
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return null;

  if (otp.code !== code.trim()) {
    await db.update(customerPortalOtpCodes)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(customerPortalOtpCodes.id, otp.id));
    return null;
  }

  await db.update(customerPortalOtpCodes)
    .set({ verifiedAt: new Date() })
    .where(eq(customerPortalOtpCodes.id, otp.id));
  return { id: otp.id, accountId: otp.accountId };
}

async function consumeOtp(otpId: string): Promise<void> {
  await db.update(customerPortalOtpCodes)
    .set({ consumedAt: new Date() })
    .where(eq(customerPortalOtpCodes.id, otpId));
}

/** CRM customers whose phone ends with the given 10-digit key. */
async function findCustomersByPhone(normalizedPhone: string) {
  if (normalizedPhone.length < 10) return [];
  const last10 = normalizedPhone.slice(-10);
  return db.select({
    id: crmCustomers.id,
    name: crmCustomers.name,
    companyName: crmCustomers.companyName,
    email: crmCustomers.email,
    phone: crmCustomers.phone,
    fullAddress: crmCustomers.fullAddress,
    portalEnabled: crmCustomers.portalEnabled,
  })
    .from(crmCustomers)
    .where(sql`regexp_replace(COALESCE(${crmCustomers.phone}, ''), '[^0-9]', '', 'g') LIKE ${"%" + last10}`)
    .limit(10);
}

/**
 * Signup candidates for a verified phone: matching customers that don't
 * already have a claimed (password-bearing) portal account.
 */
async function findSignupCandidates(normalizedPhone: string) {
  const customers = await findCustomersByPhone(normalizedPhone);
  if (customers.length === 0) return [];

  const accounts = await db.select({
    customerId: customerPortalAccounts.customerId,
    passwordHash: customerPortalAccounts.passwordHash,
  })
    .from(customerPortalAccounts)
    .where(inArray(customerPortalAccounts.customerId, customers.map((c) => c.id)));

  const claimed = new Set(
    accounts.filter((a) => !!a.passwordHash).map((a) => a.customerId),
  );
  return customers.filter((c) => !claimed.has(c.id));
}

async function createPortalSession(res: Response, accountId: string) {
  const sessionToken = randomUUID();
  await db.insert(customerPortalSessions).values({
    accountId,
    sessionToken,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  await db.update(customerPortalAccounts)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(customerPortalAccounts.id, accountId));
  res.cookie(PORTAL_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });
}

async function isSyncEditsEnabled(): Promise<boolean> {
  const setting = await storage.getSetting(PORTAL_SYNC_EDITS_SETTING);
  return setting ? setting.value !== "false" : true;
}

/** Notify all active owner/admin CRM users about a portal-originated event. */
async function notifyAdmins(title: string, preview: string, customerId: string) {
  try {
    const admins = await db.select({ id: crmUsers.id })
      .from(crmUsers)
      .where(and(
        inArray(crmUsers.role, ["owner", "admin"]),
        eq(crmUsers.isActive, true),
      ));
    if (admins.length === 0) return;
    await db.insert(crmNotifications).values(
      admins.map((a) => ({
        userId: a.id,
        type: "system" as const,
        title,
        preview,
        entityType: "customer",
        entityId: customerId,
      })),
    );
  } catch (error) {
    console.error("[Portal] Failed to create admin notifications:", error);
  }
}

// Same session model as the legacy magic-link flow in routes.ts, but scoped to
// this module so the new endpoints don't depend on the routes.ts closure.
async function requirePortalAccountAuth(req: any, res: Response, next: NextFunction) {
  const sessionToken = req.cookies?.[PORTAL_SESSION_COOKIE];
  if (!sessionToken) {
    return res.status(401).json({ message: "Unauthorized - Portal login required" });
  }
  try {
    const [session] = await db.select()
      .from(customerPortalSessions)
      .where(and(
        eq(customerPortalSessions.sessionToken, sessionToken),
        gt(customerPortalSessions.expiresAt, new Date()),
      ))
      .limit(1);
    if (!session) {
      res.clearCookie(PORTAL_SESSION_COOKIE);
      return res.status(401).json({ message: "Session expired or invalid" });
    }
    const [account] = await db.select()
      .from(customerPortalAccounts)
      .where(and(
        eq(customerPortalAccounts.id, session.accountId),
        eq(customerPortalAccounts.isActive, true),
      ))
      .limit(1);
    if (!account) {
      return res.status(401).json({ message: "Account not found or inactive" });
    }
    const [customer] = await db.select()
      .from(crmCustomers)
      .where(eq(crmCustomers.id, account.customerId))
      .limit(1);
    if (!customer) {
      return res.status(401).json({ message: "Customer not found" });
    }
    req.portalAccount = account;
    req.portalCustomer = customer;
    next();
  } catch (error) {
    console.error("Portal auth error:", error);
    res.status(500).json({ message: "Authentication error" });
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

export function registerPortalAccountRoutes(app: Express) {
  // POST /api/portal/auth/login - phone-or-email + password
  app.post("/api/portal/auth/login", async (req, res) => {
    try {
      const { identifier, password } = req.body || {};
      if (!identifier || typeof identifier !== "string" || !password || typeof password !== "string") {
        return res.status(400).json({ message: "Phone/email and password are required" });
      }
      if (rateLimitExceeded(`login:${clientIp(req)}`, 20, 15 * 60 * 1000) ||
          rateLimitExceeded(`login:${identifier.trim().toLowerCase()}`, 10, 15 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many login attempts. Please try again in a few minutes." });
      }

      let accounts: CustomerPortalAccount[];
      if (isEmailIdentifier(identifier)) {
        accounts = await db.select()
          .from(customerPortalAccounts)
          .where(and(
            sql`LOWER(${customerPortalAccounts.email}) = ${normalizeEmail(identifier)}`,
            eq(customerPortalAccounts.isActive, true),
            isNotNull(customerPortalAccounts.passwordHash),
          ))
          .limit(5);
      } else {
        const normalized = normalizePhoneDigits(identifier);
        if (normalized.length < 10) {
          return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
        }
        accounts = await db.select()
          .from(customerPortalAccounts)
          .where(and(
            eq(customerPortalAccounts.normalizedPhone, normalized),
            eq(customerPortalAccounts.isActive, true),
            isNotNull(customerPortalAccounts.passwordHash),
          ))
          .limit(5);
      }

      if (accounts.length === 0) {
        return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
      }

      // Rare case: several accounts share a phone - accept whichever password matches
      let matched: CustomerPortalAccount | null = null;
      let lockedAccount = false;
      for (const account of accounts) {
        if (account.lockedUntil && account.lockedUntil > new Date()) {
          lockedAccount = true;
          continue;
        }
        if (await comparePasswords(password, account.passwordHash!)) {
          matched = account;
          break;
        }
      }

      if (!matched) {
        if (lockedAccount && accounts.length === 1) {
          return res.status(429).json({ message: "Account temporarily locked after too many attempts. Try again in 15 minutes or reset your password." });
        }
        // Record the failure on all candidate accounts
        for (const account of accounts) {
          const failures = (account.failedLoginAttempts || 0) + 1;
          await db.update(customerPortalAccounts)
            .set({
              failedLoginAttempts: failures,
              lockedUntil: failures >= LOGIN_MAX_FAILURES ? new Date(Date.now() + LOCKOUT_MS) : account.lockedUntil,
              updatedAt: new Date(),
            })
            .where(eq(customerPortalAccounts.id, account.id));
        }
        return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
      }

      const [customer] = await db.select()
        .from(crmCustomers)
        .where(eq(crmCustomers.id, matched.customerId))
        .limit(1);
      if (!customer) {
        return res.status(401).json({ message: GENERIC_LOGIN_ERROR });
      }
      if (!customer.portalEnabled) {
        return res.status(403).json({ message: "Portal access is not enabled for this account. Please contact us." });
      }

      await db.update(customerPortalAccounts)
        .set({ failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(customerPortalAccounts.id, matched.id));

      await createPortalSession(res, matched.id);
      res.json({
        success: true,
        customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
      });
    } catch (error) {
      console.error("Portal login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // POST /api/portal/auth/signup/start - request an OTP for account creation
  app.post("/api/portal/auth/signup/start", async (req, res) => {
    try {
      const { phone } = req.body || {};
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ message: "Phone number is required" });
      }
      const normalized = normalizePhoneDigits(phone);
      if (normalized.length < 10) {
        return res.status(400).json({ message: "Please enter a valid 10-digit phone number" });
      }
      if (rateLimitExceeded(`otp:${normalized}`, 3, 60 * 60 * 1000) ||
          rateLimitExceeded(`otp-ip:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many code requests. Please try again later." });
      }

      // Only send a code when the phone matches a customer, but always return
      // the same response so the endpoint can't be used to probe the CRM.
      const candidates = await findSignupCandidates(normalized);
      if (candidates.length > 0) {
        const code = await createOtp(normalized, "signup");
        await sendOtpSms(normalized, code);
      }
      res.json({ success: true, message: GENERIC_OTP_SENT });
    } catch (error) {
      console.error("Portal signup start error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  // POST /api/portal/auth/signup/verify - verify OTP, list claimable accounts
  app.post("/api/portal/auth/signup/verify", async (req, res) => {
    try {
      const { phone, code } = req.body || {};
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone and code are required" });
      }
      if (rateLimitExceeded(`otp-verify:${clientIp(req)}`, 15, 15 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many attempts. Please try again later." });
      }
      const normalized = normalizePhoneDigits(phone);
      const otp = await verifyOtp(normalized, String(code), "signup");
      if (!otp) {
        return res.status(401).json({ message: "Invalid or expired code" });
      }

      // Phone ownership proven - safe to show matching account names/addresses
      const candidates = await findSignupCandidates(normalized);
      res.json({
        success: true,
        verifyToken: otp.id,
        candidates: candidates.map((c) => ({
          customerId: c.id,
          name: c.companyName || c.name,
          address: c.fullAddress || null,
        })),
      });
    } catch (error) {
      console.error("Portal signup verify error:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  // POST /api/portal/auth/signup/complete - pick account + set password
  app.post("/api/portal/auth/signup/complete", async (req, res) => {
    try {
      const { verifyToken, customerId, password } = req.body || {};
      if (!verifyToken || !customerId || !password) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }

      const [otp] = await db.select()
        .from(customerPortalOtpCodes)
        .where(and(
          eq(customerPortalOtpCodes.id, String(verifyToken)),
          eq(customerPortalOtpCodes.purpose, "signup"),
          isNotNull(customerPortalOtpCodes.verifiedAt),
          sql`${customerPortalOtpCodes.consumedAt} IS NULL`,
          gt(customerPortalOtpCodes.expiresAt, new Date()),
        ))
        .limit(1);
      if (!otp) {
        return res.status(401).json({ message: "Verification expired. Please start over." });
      }

      // Re-check the chosen customer is a legit candidate for this phone
      const candidates = await findSignupCandidates(otp.normalizedPhone);
      const chosen = candidates.find((c) => c.id === customerId);
      if (!chosen) {
        return res.status(400).json({ message: "Invalid account selection. Please start over." });
      }

      const passwordHash = await hashPassword(password);
      const now = new Date();

      const [existingAccount] = await db.select()
        .from(customerPortalAccounts)
        .where(eq(customerPortalAccounts.customerId, chosen.id))
        .limit(1);

      let accountId: string;
      if (existingAccount) {
        accountId = existingAccount.id;
        await db.update(customerPortalAccounts)
          .set({
            passwordHash,
            phone: otp.normalizedPhone,
            normalizedPhone: otp.normalizedPhone,
            phoneVerifiedAt: now,
            email: existingAccount.email || chosen.email,
            isActive: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(eq(customerPortalAccounts.id, existingAccount.id));
      } else {
        const [created] = await db.insert(customerPortalAccounts)
          .values({
            customerId: chosen.id,
            email: chosen.email,
            phone: otp.normalizedPhone,
            normalizedPhone: otp.normalizedPhone,
            passwordHash,
            phoneVerifiedAt: now,
            isActive: true,
          })
          .returning();
        accountId = created.id;
      }

      // Self-signup implies portal access; keep the CRM toggle as a kill-switch
      if (!chosen.portalEnabled) {
        await db.update(crmCustomers)
          .set({ portalEnabled: true, updatedAt: now })
          .where(eq(crmCustomers.id, chosen.id));
        await logCrmAudit(null, "portal_access_toggled", "customer", chosen.id, {
          portalEnabled: true,
          reason: "self_signup_verified_phone",
        });
      }
      await logCrmAudit(null, "portal_account_created", "customer", chosen.id, {
        accountId,
        method: "self_signup_sms_otp",
      });
      await notifyAdmins(
        "New customer portal signup",
        `${chosen.companyName || chosen.name} created a portal account`,
        chosen.id,
      );

      await consumeOtp(otp.id);
      await createPortalSession(res, accountId);
      res.json({ success: true, customer: { id: chosen.id, name: chosen.name } });
    } catch (error) {
      console.error("Portal signup complete error:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // POST /api/portal/auth/forgot/start - request a password-reset OTP
  app.post("/api/portal/auth/forgot/start", async (req, res) => {
    try {
      const { phone } = req.body || {};
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ message: "Phone number is required" });
      }
      const normalized = normalizePhoneDigits(phone);
      if (normalized.length < 10) {
        return res.status(400).json({ message: "Please enter a valid 10-digit phone number" });
      }
      if (rateLimitExceeded(`otp:${normalized}`, 3, 60 * 60 * 1000) ||
          rateLimitExceeded(`otp-ip:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many code requests. Please try again later." });
      }

      const [account] = await db.select()
        .from(customerPortalAccounts)
        .where(and(
          eq(customerPortalAccounts.normalizedPhone, normalized),
          eq(customerPortalAccounts.isActive, true),
        ))
        .limit(1);
      if (account) {
        const code = await createOtp(normalized, "reset", account.id);
        await sendOtpSms(normalized, code);
      }
      res.json({ success: true, message: GENERIC_OTP_SENT });
    } catch (error) {
      console.error("Portal forgot start error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  // POST /api/portal/auth/forgot/complete - verify OTP + set new password
  app.post("/api/portal/auth/forgot/complete", async (req, res) => {
    try {
      const { phone, code, newPassword } = req.body || {};
      if (!phone || !code || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      if (rateLimitExceeded(`otp-verify:${clientIp(req)}`, 15, 15 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many attempts. Please try again later." });
      }
      const normalized = normalizePhoneDigits(phone);
      const otp = await verifyOtp(normalized, String(code), "reset");
      if (!otp || !otp.accountId) {
        return res.status(401).json({ message: "Invalid or expired code" });
      }

      const [account] = await db.select()
        .from(customerPortalAccounts)
        .where(and(
          eq(customerPortalAccounts.id, otp.accountId),
          eq(customerPortalAccounts.isActive, true),
        ))
        .limit(1);
      if (!account) {
        return res.status(401).json({ message: "Invalid or expired code" });
      }

      const passwordHash = await hashPassword(newPassword);
      await db.update(customerPortalAccounts)
        .set({
          passwordHash,
          phoneVerifiedAt: account.phoneVerifiedAt || new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(customerPortalAccounts.id, account.id));

      // Rotate: kill all existing sessions, then start a fresh one
      await db.delete(customerPortalSessions)
        .where(eq(customerPortalSessions.accountId, account.id));
      await consumeOtp(otp.id);
      await logCrmAudit(null, "portal_password_reset", "customer", account.customerId, { accountId: account.id });

      await createPortalSession(res, account.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Portal forgot complete error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // POST /api/portal/auth/set-password - first-time password for invited
  // (magic-link) users who are already logged in but have no password yet
  app.post("/api/portal/auth/set-password", requirePortalAccountAuth, async (req: any, res) => {
    try {
      const { password } = req.body || {};
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      const account: CustomerPortalAccount = req.portalAccount;
      if (account.passwordHash) {
        return res.status(400).json({ message: "Password already set. Use change password instead." });
      }
      const customer = req.portalCustomer;
      const normalized = normalizePhoneDigits(account.phone || customer.phone);
      await db.update(customerPortalAccounts)
        .set({
          passwordHash: await hashPassword(password),
          phone: account.phone || customer.phone,
          normalizedPhone: account.normalizedPhone || (normalized.length >= 10 ? normalized : null),
          email: account.email || customer.email,
          updatedAt: new Date(),
        })
        .where(eq(customerPortalAccounts.id, account.id));
      await logCrmAudit(null, "portal_password_set", "customer", customer.id, { accountId: account.id });
      res.json({ success: true });
    } catch (error) {
      console.error("Portal set-password error:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // POST /api/portal/auth/change-password
  app.post("/api/portal/auth/change-password", requirePortalAccountAuth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      const account: CustomerPortalAccount = req.portalAccount;
      if (!account.passwordHash) {
        return res.status(400).json({ message: "No password set yet" });
      }
      if (!currentPassword || !(await comparePasswords(String(currentPassword), account.passwordHash))) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      await db.update(customerPortalAccounts)
        .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
        .where(eq(customerPortalAccounts.id, account.id));
      // Keep this session, kill the others
      const currentToken = req.cookies?.[PORTAL_SESSION_COOKIE];
      await db.delete(customerPortalSessions)
        .where(and(
          eq(customerPortalSessions.accountId, account.id),
          sql`${customerPortalSessions.sessionToken} <> ${currentToken}`,
        ));
      res.json({ success: true });
    } catch (error) {
      console.error("Portal change-password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // ── Profile ──────────────────────────────────────────────────────────────

  // GET /api/portal/profile
  app.get("/api/portal/profile", requirePortalAccountAuth, async (req: any, res) => {
    try {
      const account: CustomerPortalAccount = req.portalAccount;
      const customer = req.portalCustomer;
      const properties = await db.select({
        id: crmProperties.id,
        address1: crmProperties.address1,
        address2: crmProperties.address2,
        city: crmProperties.city,
        state: crmProperties.state,
        zip: crmProperties.zip,
      })
        .from(crmProperties)
        .where(eq(crmProperties.customerId, customer.id));

      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          companyName: customer.companyName,
          email: customer.email,
          phone: customer.phone,
          fullAddress: customer.fullAddress,
        },
        account: {
          email: account.email,
          phone: account.phone,
          hasPassword: !!account.passwordHash,
          phoneVerified: !!account.phoneVerifiedAt,
          lastLoginAt: account.lastLoginAt,
        },
        properties,
      });
    } catch (error) {
      console.error("Portal profile error:", error);
      res.status(500).json({ message: "Failed to load profile" });
    }
  });

  // PATCH /api/portal/profile - name/email edits (phone has its own OTP flow)
  app.patch("/api/portal/profile", requirePortalAccountAuth, async (req: any, res) => {
    try {
      const { name, email } = req.body || {};
      const account: CustomerPortalAccount = req.portalAccount;
      const customer = req.portalCustomer;

      const newName = typeof name === "string" && name.trim() ? name.trim() : null;
      const newEmail = typeof email === "string" ? normalizeEmail(email) : null;
      if (!newName && newEmail === null) {
        return res.status(400).json({ message: "Nothing to update" });
      }
      if (newEmail !== null && newEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }

      // Don't let one account claim an email another portal account logs in with
      if (newEmail) {
        const [conflict] = await db.select({ id: customerPortalAccounts.id })
          .from(customerPortalAccounts)
          .where(and(
            sql`LOWER(${customerPortalAccounts.email}) = ${newEmail}`,
            sql`${customerPortalAccounts.id} <> ${account.id}`,
            isNotNull(customerPortalAccounts.passwordHash),
          ))
          .limit(1);
        if (conflict) {
          return res.status(400).json({ message: "That email is already in use on another portal account" });
        }
      }

      const changes: Record<string, { from: string | null; to: string | null }> = {};
      if (newEmail !== null && newEmail !== (account.email || "")) {
        changes.email = { from: account.email, to: newEmail || null };
      }
      if (newName && newName !== customer.name) {
        changes.name = { from: customer.name, to: newName };
      }
      if (Object.keys(changes).length === 0) {
        return res.json({ success: true, synced: false });
      }

      await db.update(customerPortalAccounts)
        .set({
          ...(changes.email ? { email: newEmail || null, emailVerifiedAt: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(customerPortalAccounts.id, account.id));

      const syncEnabled = await isSyncEditsEnabled();
      if (syncEnabled) {
        await db.update(crmCustomers)
          .set({
            ...(changes.name ? { name: newName! } : {}),
            ...(changes.email ? { email: newEmail || null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(crmCustomers.id, customer.id));
      }

      await logCrmAudit(null, "portal_profile_updated", "customer", customer.id, {
        accountId: account.id,
        changes,
        syncedToCrm: syncEnabled,
      });
      await notifyAdmins(
        syncEnabled ? "Customer updated their info via portal" : "Portal profile edit (not synced to CRM)",
        `${customer.name}: ${Object.entries(changes).map(([k, v]) => `${k} → ${v.to || "(cleared)"}`).join(", ")}`,
        customer.id,
      );

      res.json({ success: true, synced: syncEnabled });
    } catch (error) {
      console.error("Portal profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // POST /api/portal/profile/phone/start - OTP to the NEW number
  app.post("/api/portal/profile/phone/start", requirePortalAccountAuth, async (req: any, res) => {
    try {
      const { phone } = req.body || {};
      const normalized = normalizePhoneDigits(phone);
      if (normalized.length < 10) {
        return res.status(400).json({ message: "Please enter a valid 10-digit phone number" });
      }
      if (rateLimitExceeded(`otp:${normalized}`, 3, 60 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many code requests. Please try again later." });
      }
      const account: CustomerPortalAccount = req.portalAccount;
      // A password account already logs in with this number - block the takeover
      const [conflict] = await db.select({ id: customerPortalAccounts.id })
        .from(customerPortalAccounts)
        .where(and(
          eq(customerPortalAccounts.normalizedPhone, normalized),
          sql`${customerPortalAccounts.id} <> ${account.id}`,
          isNotNull(customerPortalAccounts.passwordHash),
        ))
        .limit(1);
      if (conflict) {
        return res.status(400).json({ message: "That phone number is already in use on another portal account" });
      }
      const code = await createOtp(normalized, "phone_change", account.id);
      await sendOtpSms(normalized, code);
      res.json({ success: true, message: "We texted a verification code to the new number." });
    } catch (error) {
      console.error("Portal phone change start error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  // POST /api/portal/profile/phone/verify - confirm code, apply the change
  app.post("/api/portal/profile/phone/verify", requirePortalAccountAuth, async (req: any, res) => {
    try {
      const { phone, code } = req.body || {};
      if (rateLimitExceeded(`otp-verify:${clientIp(req)}`, 15, 15 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many attempts. Please try again later." });
      }
      const account: CustomerPortalAccount = req.portalAccount;
      const customer = req.portalCustomer;
      const normalized = normalizePhoneDigits(phone);
      const otp = await verifyOtp(normalized, String(code || ""), "phone_change");
      if (!otp || otp.accountId !== account.id) {
        return res.status(401).json({ message: "Invalid or expired code" });
      }

      const oldPhone = account.phone;
      await db.update(customerPortalAccounts)
        .set({
          phone: normalized,
          normalizedPhone: normalized,
          phoneVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customerPortalAccounts.id, account.id));

      const syncEnabled = await isSyncEditsEnabled();
      if (syncEnabled) {
        await db.update(crmCustomers)
          .set({ phone: normalized, updatedAt: new Date() })
          .where(eq(crmCustomers.id, customer.id));
      }

      await consumeOtp(otp.id);
      await logCrmAudit(null, "portal_phone_changed", "customer", customer.id, {
        accountId: account.id,
        from: oldPhone,
        to: normalized,
        syncedToCrm: syncEnabled,
      });
      await notifyAdmins(
        syncEnabled ? "Customer changed their phone via portal" : "Portal phone change (not synced to CRM)",
        `${customer.name}: ${oldPhone || "(none)"} → ${normalized}`,
        customer.id,
      );
      res.json({ success: true, synced: syncEnabled });
    } catch (error) {
      console.error("Portal phone change verify error:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  // POST /api/portal/profile/address-request - office handles address changes
  app.post("/api/portal/profile/address-request", requirePortalAccountAuth, async (req: any, res) => {
    try {
      const { message } = req.body || {};
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "Please describe the address change" });
      }
      if (rateLimitExceeded(`addr-req:${req.portalAccount.id}`, 5, 60 * 60 * 1000)) {
        return res.status(429).json({ message: "Too many requests. Please call us instead." });
      }
      const customer = req.portalCustomer;
      await notifyAdmins(
        `Address change request from ${customer.name}`,
        message.trim().slice(0, 500),
        customer.id,
      );
      await logCrmAudit(null, "portal_address_change_requested", "customer", customer.id, {
        message: message.trim().slice(0, 1000),
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Portal address request error:", error);
      res.status(500).json({ message: "Failed to submit request" });
    }
  });

  // ── CRM-side endpoints ───────────────────────────────────────────────────

  // GET /api/crm/customers/:id/portal-account - portal breakdown for a customer
  app.get("/api/crm/customers/:id/portal-account", requireCrmAuth, async (req, res) => {
    try {
      const customerId = req.params.id;
      const [customer] = await db.select({
        id: crmCustomers.id,
        portalEnabled: crmCustomers.portalEnabled,
      })
        .from(crmCustomers)
        .where(eq(crmCustomers.id, customerId))
        .limit(1);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const [account] = await db.select()
        .from(customerPortalAccounts)
        .where(eq(customerPortalAccounts.customerId, customerId))
        .limit(1);

      let activeSessions = 0;
      if (account) {
        const [row] = await db.select({ count: sql<number>`count(*)::int` })
          .from(customerPortalSessions)
          .where(and(
            eq(customerPortalSessions.accountId, account.id),
            gt(customerPortalSessions.expiresAt, new Date()),
          ));
        activeSessions = row?.count || 0;
      }

      res.json({
        portalEnabled: customer.portalEnabled,
        account: account
          ? {
              id: account.id,
              email: account.email,
              phone: account.phone,
              isActive: account.isActive,
              hasPassword: !!account.passwordHash,
              phoneVerifiedAt: account.phoneVerifiedAt,
              emailVerifiedAt: account.emailVerifiedAt,
              lastLoginAt: account.lastLoginAt,
              createdAt: account.createdAt,
              lockedUntil: account.lockedUntil,
              activeSessions,
            }
          : null,
      });
    } catch (error) {
      console.error("Portal account breakdown error:", error);
      res.status(500).json({ message: "Failed to load portal account" });
    }
  });

  // GET /api/admin/settings/customer-portal - settings + stats
  app.get("/api/admin/settings/customer-portal", requireCrmAuth, requireCrmAdmin, async (req, res) => {
    try {
      const syncCustomerEdits = await isSyncEditsEnabled();
      const [stats] = await db.select({
        totalAccounts: sql<number>`count(*)::int`,
        withPassword: sql<number>`count(*) FILTER (WHERE ${customerPortalAccounts.passwordHash} IS NOT NULL)::int`,
        activeLast30d: sql<number>`count(*) FILTER (WHERE ${customerPortalAccounts.lastLoginAt} > now() - interval '30 days')::int`,
      }).from(customerPortalAccounts);
      const [enabledRow] = await db.select({ count: sql<number>`count(*)::int` })
        .from(crmCustomers)
        .where(eq(crmCustomers.portalEnabled, true));

      res.json({
        syncCustomerEdits,
        stats: {
          totalAccounts: stats?.totalAccounts || 0,
          withPassword: stats?.withPassword || 0,
          activeLast30d: stats?.activeLast30d || 0,
          portalEnabledCustomers: enabledRow?.count || 0,
        },
      });
    } catch (error) {
      console.error("Customer portal settings error:", error);
      res.status(500).json({ message: "Failed to load settings" });
    }
  });

  // PUT /api/admin/settings/customer-portal - update sync toggle
  app.put("/api/admin/settings/customer-portal", requireCrmAuth, requireCrmAdmin, async (req: any, res) => {
    try {
      const { syncCustomerEdits } = req.body || {};
      if (typeof syncCustomerEdits !== "boolean") {
        return res.status(400).json({ message: "syncCustomerEdits must be a boolean" });
      }
      await storage.setSetting(PORTAL_SYNC_EDITS_SETTING, syncCustomerEdits ? "true" : "false");
      await logCrmAudit(req.crmUser?.id || null, "portal_settings_updated", "setting", PORTAL_SYNC_EDITS_SETTING, {
        syncCustomerEdits,
      });
      res.json({ syncCustomerEdits });
    } catch (error) {
      console.error("Customer portal settings update error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });
}
