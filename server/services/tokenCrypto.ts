import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// AES-256-GCM encryption for OAuth refresh tokens at rest. The key is derived
// from GMAIL_TOKEN_KEY (or SESSION_SECRET as a fallback) so tokens in the DB
// are useless without the server's secret. Format: base64(iv).base64(tag).base64(ct)

function getKey(): Buffer {
  const secret = process.env.GMAIL_TOKEN_KEY || process.env.SESSION_SECRET || "";
  if (!secret) throw new Error("GMAIL_TOKEN_KEY / SESSION_SECRET not set — cannot encrypt tokens");
  // Static salt is fine here: the secret is the real entropy, and we need a
  // deterministic key so previously-stored tokens decrypt across restarts.
  return scryptSync(secret, "ghq-gmail-token-v1", 32);
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptToken(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
