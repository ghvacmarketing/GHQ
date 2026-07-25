/**
 * Gibbs knowledge-base drift auditor.
 *
 * Cross-checks the assistant's feature knowledge base
 * (server/services/crm-knowledge.ts) against what the app actually ships:
 * the CRM sidebar nav (crm-layout.tsx) and the registered routes (App.tsx).
 * Any page the app has but the KB never mentions is flagged — that's a page
 * Gibbs will deny exists.
 *
 * Run: npm run audit:gibbs   (safe: report-only, exit 0 with warnings)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf-8");

const kb = read("server/services/crm-knowledge.ts").toLowerCase();
const layout = read("client/src/components/crm/crm-layout.tsx");
const app = read("client/src/App.tsx");

const missing: string[] = [];

// 1. Every sidebar nav entry should be mentioned by label or href.
for (const m of layout.matchAll(/label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)) {
  const [, label, href] = m;
  if (!kb.includes(label.toLowerCase()) && !kb.includes(href.toLowerCase())) {
    missing.push(`Sidebar entry "${label}" (${href})`);
  }
}

// 2. Every top-level /crm route (ignore params and settings sub-pages, which
//    are covered by the Settings section check below).
const seenRoutes = new Set<string>();
for (const m of app.matchAll(/path="(\/crm\/[a-z0-9-]+)"/g)) {
  const route = m[1];
  if (seenRoutes.has(route) || route === "/crm/login" || route === "/crm/phone-pop" || route === "/crm/proposal-preview" || route === "/crm/add-prospect") continue;
  seenRoutes.add(route);
  if (!kb.includes(route.toLowerCase())) {
    missing.push(`Route ${route}`);
  }
}

// 3. Settings sub-pages.
for (const m of app.matchAll(/path="(\/crm\/settings\/[a-z0-9-]+)"/g)) {
  const route = m[1];
  const slug = route.split("/").pop() || "";
  const words = slug.replace(/-/g, " ");
  if (!kb.includes(route.toLowerCase()) && !kb.includes(words)) {
    missing.push(`Settings page ${route}`);
  }
}

// 4. Suite apps.
for (const route of ["/documents", "/accounting", "/marketing", "/mobile"]) {
  if (!kb.includes(route)) missing.push(`Suite app ${route}`);
}

const unique = Array.from(new Set(missing));
if (unique.length === 0) {
  console.log("✅ Gibbs KB audit: every shipped page is mentioned in the knowledge base.");
} else {
  console.log(`⚠️  Gibbs KB audit: ${unique.length} page(s) exist in the app but are NOT in the knowledge base.`);
  console.log("   Gibbs will deny these exist until server/services/crm-knowledge.ts documents them:\n");
  for (const item of unique) console.log(`   - ${item}`);
  console.log("\n   Fix: add a section (or a navigation-table row) for each to server/services/crm-knowledge.ts.");
}
