#!/usr/bin/env node
/**
 * Check admin user status in the database
 * Run this from Replit shell: npm run check-admin
 */
import { db } from "../server/db.js";
import { crmUsers } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { comparePasswords } from "../server/crm-auth.js";

async function checkAdmin() {
  try {
    console.log("🔍 Checking admin user status...\n");

    const [user] = await db
      .select()
      .from(crmUsers)
      .where(eq(crmUsers.email, "admin@ghvac.com"));

    if (!user) {
      console.log("❌ Admin user does NOT exist in database");
      console.log("\n📝 Solution: Start the server to auto-create admin user");
      console.log("   The ensureDefaultAdminExists() function will create it on startup\n");
      process.exit(1);
    }

    console.log("✅ Admin user exists in database\n");
    console.log("📋 User Details:");
    console.log("   ID:", user.id);
    console.log("   Email:", user.email);
    console.log("   Name:", user.name);
    console.log("   Role:", user.role);
    console.log("   Is Active:", user.isActive);
    console.log("   Created:", user.createdAt);
    console.log("   Has Password Hash:", !!user.passwordHash);

    if (!user.isActive) {
      console.log("\n⚠️  WARNING: User is INACTIVE!");
      console.log("   This will cause 'Account is disabled' error on login");
      console.log("\n📝 Solution: Update user.isActive to true in database\n");
      process.exit(1);
    }

    // Test password
    console.log("\n🔐 Testing password 'Giesbrecht'...");
    const passwordMatch = await comparePasswords("Giesbrecht", user.passwordHash);

    if (passwordMatch) {
      console.log("✅ Password matches!\n");
      console.log("✨ Admin user is properly configured");
      console.log("   You should be able to login with:");
      console.log("   Email: admin@ghvac.com");
      console.log("   Password: Giesbrecht\n");
    } else {
      console.log("❌ Password does NOT match!");
      console.log("\n📝 Solution: The password hash in database doesn't match 'Giesbrecht'");
      console.log("   You may need to reset the password or recreate the user\n");
      process.exit(1);
    }

  } catch (error) {
    console.error("❌ Error checking admin:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkAdmin();
