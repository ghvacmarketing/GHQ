// Renew the iOS App Store signing pair (certificate + provisioning profile).
//
// Apple caps distribution certificates and provisioning profiles at 1 year —
// when Codemagic builds start failing with an expired-signing error (next due
// ~2027-07-30), run this from Git Bash at the repo root:
//
//   node scripts/renew-ios-signing.mjs
//
// It creates a fresh Apple Distribution certificate + "GHQ App Store" profile
// via the App Store Connect API, rewrites ios/certs/, saves the new private
// key to Downloads, and tells you what to paste into Codemagic. Then commit
// ios/certs/ and push.
//
// Requirements: the ASC API key .p8 in Downloads (AuthKey_5VG22AT57Q.p8) and
// openssl on PATH (Git Bash has it).

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import crypto from "crypto";

const KEY_ID = process.env.ASC_KEY_ID || "5VG22AT57Q";
const ISSUER = process.env.ASC_ISSUER_ID || "a6c12d1a-f526-41d8-9480-0d76904a6db7";
const P8_PATH = process.env.ASC_KEY_PATH || join(homedir(), "Downloads", `AuthKey_${KEY_ID}.p8`);
const BUNDLE_ID_RESOURCE = "WTTLWK9TZ3"; // app.ghvac.tools
const PROFILE_NAME = "GHQ App Store";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function ascToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" }));
  const key = crypto.createPrivateKey(readFileSync(P8_PATH, "utf8"));
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(sig)}`;
}
async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${ascToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok && res.status !== 204) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  return json;
}

console.log("1/6 Generating new RSA key + CSR…");
const work = join(tmpdir(), `ios-signing-${Date.now()}`);
mkdirSync(work, { recursive: true });
const keyPath = join(work, "key.pem");
const csrPath = join(work, "req.csr");
execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: "pipe" });
try {
  execSync(`openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "//CN=Giesbrecht HVAC"`, { stdio: "pipe" });
} catch {
  execSync(`openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "/CN=Giesbrecht HVAC"`, { stdio: "pipe" });
}

console.log("2/6 Cleaning up expired certificates…");
const existing = await asc("GET", "/v1/certificates?limit=50&fields[certificates]=certificateType,expirationDate");
for (const c of existing?.data ?? []) {
  if (c.attributes.certificateType === "DISTRIBUTION" && new Date(c.attributes.expirationDate) < new Date()) {
    await asc("DELETE", `/v1/certificates/${c.id}`).catch(() => {});
    console.log(`   revoked expired certificate ${c.id}`);
  }
}

console.log("3/6 Creating new Apple Distribution certificate…");
const cert = await asc("POST", "/v1/certificates", {
  data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: readFileSync(csrPath, "utf8") } },
});
const certId = cert.data.id;
console.log(`   created ${certId}, expires ${cert.data.attributes.expirationDate}`);

console.log("4/6 Replacing provisioning profile…");
const profiles = await asc("GET", `/v1/profiles?filter[name]=${encodeURIComponent(PROFILE_NAME)}`);
for (const p of profiles?.data ?? []) {
  await asc("DELETE", `/v1/profiles/${p.id}`).catch(() => {});
  console.log(`   deleted old profile ${p.id}`);
}
const profile = await asc("POST", "/v1/profiles", {
  data: {
    type: "profiles",
    attributes: { name: PROFILE_NAME, profileType: "IOS_APP_STORE" },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: BUNDLE_ID_RESOURCE } },
      certificates: { data: [{ type: "certificates", id: certId }] },
    },
  },
});
console.log(`   created profile ${profile.data.id}, expires ${profile.data.attributes.expirationDate}`);

console.log("5/6 Writing ios/certs/…");
writeFileSync("ios/certs/distribution.cer", Buffer.from(cert.data.attributes.certificateContent, "base64"));
writeFileSync("ios/certs/GHQ_App_Store.mobileprovision", Buffer.from(profile.data.attributes.profileContent, "base64"));

const keyOut = join(homedir(), "Downloads", "apple-distribution-cert-private-key.pem");
writeFileSync(keyOut, readFileSync(keyPath));
console.log(`6/6 New private key saved to ${keyOut}`);

console.log(`
DONE. Two follow-ups:
  1. Paste the contents of ${keyOut}
     into the Codemagic env var CERTIFICATE_PRIVATE_KEY (group appstore_credentials).
  2. git add ios/certs && git commit -m "Renew iOS signing" && git push
`);
