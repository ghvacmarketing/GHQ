import { db } from "./server/db";
import { crmUsers } from "./shared/schema";
import { eq } from "drizzle-orm";

async function checkAdmin() {
  try {
    const [user] = await db
      .select()
      .from(crmUsers)
      .where(eq(crmUsers.email, "admin@ghvac.com"));

    if (!user) {
      console.log("❌ Admin user does NOT exist in database");
      return;
    }

    console.log("✅ Admin user exists:");
    console.log("   ID:", user.id);
    console.log("   Email:", user.email);
    console.log("   Name:", user.name);
    console.log("   Role:", user.role);
    console.log("   Is Active:", user.isActive);
    console.log("   Has Password Hash:", !!user.passwordHash);

    if (!user.isActive) {
      console.log("\n⚠️  WARNING: User is INACTIVE - this will prevent login!");
    }
  } catch (error) {
    console.error("Error checking admin:", error);
  } finally {
    process.exit(0);
  }
}

checkAdmin();
