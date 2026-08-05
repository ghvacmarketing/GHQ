// One-off local verification for the no-cool checklist seed (dev DB).
// Usage: npx tsx scripts/run-no-cool-seed.ts
import { seedNoCoolChecklist } from "../server/seed-no-cool-checklist";
import { db } from "../server/db";
import { serviceCallChecklists, checklistQuestions, checklistPhotoSteps } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  await seedNoCoolChecklist();
  const [c] = await db
    .select()
    .from(serviceCallChecklists)
    .where(eq(serviceCallChecklists.name, "No Cool — Service Call"));
  if (!c) {
    console.log("NOT CREATED");
    process.exit(1);
  }
  const qs = await db.select().from(checklistQuestions).where(eq(checklistQuestions.checklistId, c.id));
  const ps = await db.select().from(checklistPhotoSteps).where(eq(checklistPhotoSteps.checklistId, c.id));
  console.log(
    `created: ${c.id} | visit: ${c.visitType}/${c.serviceType} | questions: ${qs.length} | photoSteps: ${ps.length} | linked: ${ps.filter((p) => p.linkedQuestionId).length}`,
  );
  const sections = [...new Set(qs.sort((a, b) => a.sortOrder - b.sortOrder).map((q) => q.section))];
  console.log("sections:", sections.join(" | "));
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
