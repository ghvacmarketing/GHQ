import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  getCrmUserByEmail,
  createCrmSession,
  revokeOtherCrmSessions,
  logCrmAudit,
  CRM_SESSION_COOKIE,
} from "./crm-auth";

const STATE_COOKIE = "crm_google_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

function getRedirectUri(req: Request): string {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (configured) return configured;

  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ||
    req.protocol ||
    "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ||
    req.get("host") ||
    process.env.REPLIT_DOMAINS?.split(",")[0] ||
    "localhost:5000";
  return `${proto}://${host}/api/crm/auth/google/callback`;
}

function getOAuthClient(req: Request): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured");
  }
  return new OAuth2Client(clientId, clientSecret, getRedirectUri(req));
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function startGoogleOAuth(req: Request, res: Response): Promise<void> {
  if (!isGoogleOAuthConfigured()) {
    return res.redirect("/crm/login?error=google_not_configured") as unknown as void;
  }

  try {
    const client = getOAuthClient(req);
    const state = randomBytes(16).toString("hex");

    // The login page tells us where this device should land afterwards
    // (phones/native shell → the Field app). Ride it along in the state
    // cookie — the callback has no other way to know the viewport.
    const wantsMobile = req.query.dest === "mobile";
    res.cookie(STATE_COOKIE, `${state}:${wantsMobile ? "mobile" : "desktop"}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_MS,
    });

    const url = client.generateAuthUrl({
      access_type: "online",
      prompt: "select_account",
      scope: ["openid", "email", "profile"],
      state,
    });

    return res.redirect(url) as unknown as void;
  } catch (error) {
    console.error("Google OAuth start error:", error);
    return res.redirect("/crm/login?error=google_failed") as unknown as void;
  }
}

/** Native Google Sign-In (the iOS account sheet): the app sends the ID
 *  token it got from the on-device Google session; we verify it against our
 *  client IDs (web + optional iOS) and mint the SAME session the password
 *  login does — cookie for the webview plus a bearer token for crmFetch. */
export async function handleNativeGoogleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = (req.body || {}) as { idToken?: string };
    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" }) as unknown as void;
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "Google sign-in isn't configured" }) as unknown as void;
    }
    const audience = [clientId, process.env.GOOGLE_IOS_CLIENT_ID].filter(Boolean) as string[];
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ message: "Google didn't confirm your email address." }) as unknown as void;
    }

    const email = payload.email.trim().toLowerCase();
    const user = await getCrmUserByEmail(email);

    if (!user) {
      await logCrmAudit(null, "login_denied", "user", null, { method: "google_native", email, reason: "not_authorized" }, req.ip);
      return res.status(403).json({ message: "This Google account isn't authorized for GHQ. Ask an admin to add your email." }) as unknown as void;
    }
    if (!user.isActive) {
      await logCrmAudit(null, "login_denied", "user", user.id, { method: "google_native", email, reason: "inactive" }, req.ip);
      return res.status(403).json({ message: "This account has been deactivated." }) as unknown as void;
    }

    const userAgent = req.headers["user-agent"];
    const ipAddress = req.ip || req.socket.remoteAddress;
    const session = await createCrmSession(user.id, userAgent, ipAddress);
    const kicked = await revokeOtherCrmSessions(user.id, session.sessionToken, session.deviceClass === "mobile" ? "mobile" : "desktop").catch(() => 0);
    if (kicked > 0) {
      await logCrmAudit(user.id, "sessions_displaced", "user", user.id, { count: kicked, method: "google_native", deviceClass: session.deviceClass, ip: ipAddress }, req.ip).catch(() => {});
    }

    res.cookie(CRM_SESSION_COOKIE, session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });

    await logCrmAudit(user.id, "login", "user", user.id, { method: "google_native" }, req.ip);

    const { passwordHash, ...userWithoutPassword } = user as any;
    return res.json({
      message: "Login successful",
      user: userWithoutPassword,
      token: session.sessionToken,
    }) as unknown as void;
  } catch (error) {
    console.error("Native Google login error:", error);
    return res.status(401).json({ message: "Google sign-in failed. Please try again." }) as unknown as void;
  }
}

export async function handleGoogleOAuthCallback(
  req: Request,
  res: Response
): Promise<void> {
  const rawCookieState = req.cookies?.[STATE_COOKIE] as string | undefined;
  res.clearCookie(STATE_COOKIE, { path: "/" });
  // Cookie carries "<state>:<dest>" — older cookies without the suffix still parse
  const [cookieState, wantedDest] = (rawCookieState || "").split(":");

  const { code, state, error: oauthError } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  if (oauthError) {
    return res.redirect("/crm/login?error=google_cancelled") as unknown as void;
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    return res.redirect("/crm/login?error=google_state") as unknown as void;
  }

  try {
    const client = getOAuthClient(req);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      return res.redirect("/crm/login?error=google_failed") as unknown as void;
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      return res.redirect("/crm/login?error=google_unverified") as unknown as void;
    }

    const email = payload.email.trim().toLowerCase();
    const user = await getCrmUserByEmail(email);

    if (!user) {
      await logCrmAudit(
        null,
        "login_denied",
        "user",
        null,
        { method: "google", email, reason: "not_authorized" },
        req.ip
      );
      return res.redirect("/crm/login?error=google_not_authorized") as unknown as void;
    }

    if (!user.isActive) {
      await logCrmAudit(
        null,
        "login_denied",
        "user",
        user.id,
        { method: "google", email, reason: "inactive" },
        req.ip
      );
      return res.redirect("/crm/login?error=google_inactive") as unknown as void;
    }

    const userAgent = req.headers["user-agent"];
    const ipAddress = req.ip || req.socket.remoteAddress;
    const session = await createCrmSession(user.id, userAgent, ipAddress);

    // One active session per device class: displace this account's other
    // sessions of the same kind (phone kicks phone, desktop kicks desktop).
    const kicked = await revokeOtherCrmSessions(user.id, session.sessionToken, session.deviceClass === "mobile" ? "mobile" : "desktop").catch(() => 0);
    if (kicked > 0) {
      await logCrmAudit(user.id, "sessions_displaced", "user", user.id, { count: kicked, method: "google", deviceClass: session.deviceClass, ip: ipAddress }, req.ip).catch(() => {});
    }

    res.cookie(CRM_SESSION_COOKIE, session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });

    await logCrmAudit(
      user.id,
      "login",
      "user",
      user.id,
      { method: "google" },
      req.ip
    );

    // Phones and the native shell land in the Field app no matter the role —
    // same rule as the password login. wantedDest is what the login page
    // asked for; deviceClass (user-agent) catches anything that lost it.
    const isMobileDevice = wantedDest === "mobile" || session.deviceClass === "mobile";
    const dest = user.role === "tech" || isMobileDevice ? "/mobile" : "/crm";
    return res.redirect(dest) as unknown as void;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return res.redirect("/crm/login?error=google_failed") as unknown as void;
  }
}
