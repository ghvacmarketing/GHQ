import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  getCrmUserByEmail,
  createCrmSession,
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

    res.cookie(STATE_COOKIE, state, {
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

export async function handleGoogleOAuthCallback(
  req: Request,
  res: Response
): Promise<void> {
  const cookieState = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: "/" });

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

    const dest = user.role === "tech" ? "/mobile" : "/crm";
    return res.redirect(dest) as unknown as void;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return res.redirect("/crm/login?error=google_failed") as unknown as void;
  }
}
