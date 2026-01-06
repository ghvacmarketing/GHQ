import { db } from "../server/db";
import { crmUsers } from "../shared/schema";
import { hashPassword } from "../server/crm-auth";
import { eq } from "drizzle-orm";

async function addOwner() {
  const email = "shelbgies@gmail.com";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error("ADMIN_PASSWORD secret is not set");
    process.exit(1);
  }

  // Check if user already exists
  const [existing] = await db.select().from(crmUsers).where(eq(crmUsers.email, email));
  
  if (existing) {
    // Update existing user to owner role and reset password
    const passwordHash = await hashPassword(password);
    await db.update(crmUsers)
      .set({ role: "owner", passwordHash, isActive: true })
      .where(eq(crmUsers.id, existing.id));
    console.log(`Updated existing user ${email} to owner role`);
  } else {
    // Create new user
    const passwordHash = await hashPassword(password);
    await db.insert(crmUsers).values({
      name: "Shelby Giesbrecht",
      email,
      role: "owner",
      passwordHash,
      isActive: true,
    });
    console.log(`Created owner user: ${email}`);
  }

  process.exit(0);
}

addOwner().catch((err) => {
  console.error("Failed to add owner:", err);
  process.exit(1);
});
