import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { crmUsers } from "@shared/schema";
import { getCurrentCrmUser } from "./crm-auth";
import { encryptToken } from "./services/tokenCrypto";
import { GMAIL_SCOPES, isGmailOAuthConfigured } from "./services/gmailService";

const STATE_COOKIE = "crm_gmail_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

// Dedicated redirect URI for the Gmail connect flow (distinct from login).
function getRedirectUri(req: Request): string {
  const configured = process.env.GMAIL_OAUTH_REDIRECT_URI;
  if (configured) return configured;
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || req.protocol || "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ||
    req.get("host") ||
    "localhost:5000";
  return `${proto}://${host}/api/crm/gmail/callback`;
}

function client(req: Request): OAuth2Client {
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, getRedirectUri(req));
}

export async function startGmailConnect(req: Request, res: Response): Promise<void> {
  if (!isGmailOAuthConfigured()) {
    return res.redirect("/crm/mail?error=not_configured") as unknown as void;
  }
  const user = await getCurrentCrmUser(req);
  if (!user) return res.redirect("/crm/login") as unknown as void;

  const state = randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_MS,
  });

  const url = client(req).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh token even on re-connect
    include_granted_scopes: true,
    login_hint: user.email,
    scope: GMAIL_SCOPES,
    state,
  });
  return res.redirect(url) as unknown as void;
}

export async function handleGmailConnectCallback(req: Request, res: Response): Promise<void> {
  const cookieState = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: "/" });

  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  if (error) return res.redirect("/crm/mail?error=cancelled") as unknown as void;
  if (!code || !state || !cookieState || state !== cookieState) {
    return res.redirect("/crm/mail?error=state") as unknown as void;
  }

  const user = await getCurrentCrmUser(req);
  if (!user) return res.redirect("/crm/login") as unknown as void;

  try {
    const c = client(req);
    const { tokens } = await c.getToken(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent; prompt=consent
      // forces it, so this means the grant was incomplete.
      return res.redirect("/crm/mail?error=no_refresh_token") as unknown as void;
    }

    // Resolve which Google address they actually granted
    let gmailAddress = user.email;
    try {
      if (tokens.id_token) {
        const ticket = await c.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
        const email = ticket.getPayload()?.email;
        if (email) gmailAddress = email.trim().toLowerCase();
      }
    } catch {
      /* fall back to user.email */
    }

    await db
      .update(crmUsers)
      .set({
        gmailAddress,
        gmailRefreshTokenEnc: encryptToken(tokens.refresh_token),
        gmailConnectedAt: new Date(),
        gmailSyncEnabled: true,
      })
      .where(eq(crmUsers.id, user.id));

    return res.redirect("/crm/mail?connected=1") as unknown as void;
  } catch (e) {
    console.error("[Gmail] connect callback error:", (e as Error).message);
    return res.redirect("/crm/mail?error=failed") as unknown as void;
  }
}
