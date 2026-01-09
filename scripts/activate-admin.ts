#!/usr/bin/env node
/**
 * Activate the admin user account
 * Run this to enable login for admin@ghvac.com
 */
import { db } from "../server/db.js";
import { crmUsers } from "../shared/schema.js";
import { eq } from "drizzle-orm";

async function activateAdmin() {
  try {
    console.log("🔧 Activating admin user...\n");

    const [user] = await db
      .select()
      .from(crmUsers)
      .where(eq(crmUsers.email, "admin@ghvac.com"));

    if (!user) {
      console.log("❌ Admin user does not exist");
      console.log("   Run the server first to create it\n");
      process.exit(1);
    }

    if (user.isActive) {
      console.log("✅ Admin user is already active!");
      console.log("   You should be able to login with:");
      console.log("   Email: admin@ghvac.com");
      console.log("   Password: Giesbrecht\n");
      process.exit(0);
    }

    // Activate the user
    await db
      .update(crmUsers)
      .set({ isActive: true })
      .where(eq(crmUsers.email, "admin@ghvac.com"));

    console.log("✅ Admin user activated successfully!\n");
    console.log("📋 You can now login with:");
    console.log("   Email: admin@ghvac.com");
    console.log("   Password: Giesbrecht\n");

  } catch (error) {
    console.error("❌ Error activating admin:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

activateAdmin();
