import { db } from "../server/db";
import { crmUsers, crmCustomers, crmJobs, crmJobAssignments, crmProperties } from "../shared/schema";
import { hashPassword } from "../server/crm-auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Starting CRM seed...");

  // Check if admin already exists
  const [existingAdmin] = await db
    .select()
    .from(crmUsers)
    .where(eq(crmUsers.email, "admin@ghvac.com"))
    .limit(1);

  let adminId: string;

  if (existingAdmin) {
    console.log("Admin user already exists:", existingAdmin.email);
    adminId = existingAdmin.id;
  } else {
    // Create admin user
    const adminPasswordHash = await hashPassword("admin123");
    const [admin] = await db
      .insert(crmUsers)
      .values({
        name: "Admin User",
        email: "admin@ghvac.com",
        phone: "+17065551000",
        role: "owner",
        passwordHash: adminPasswordHash,
        isActive: true,
      })
      .returning();
    console.log("Created admin user:", admin.email);
    adminId = admin.id;
  }

  // Check if tech already exists
  const [existingTech] = await db
    .select()
    .from(crmUsers)
    .where(eq(crmUsers.email, "tech@ghvac.com"))
    .limit(1);

  let techId: string;

  if (existingTech) {
    console.log("Tech user already exists:", existingTech.email);
    techId = existingTech.id;
  } else {
    // Create tech user
    const techPasswordHash = await hashPassword("tech123");
    const [tech] = await db
      .insert(crmUsers)
      .values({
        name: "John Technician",
        email: "tech@ghvac.com",
        phone: "+17065551001",
        role: "tech",
        passwordHash: techPasswordHash,
        isActive: true,
      })
      .returning();
    console.log("Created tech user:", tech.email);
    techId = tech.id;
  }

  // Check if sales already exists
  const [existingSales] = await db
    .select()
    .from(crmUsers)
    .where(eq(crmUsers.email, "sales@ghvac.com"))
    .limit(1);

  let salesId: string;

  if (existingSales) {
    console.log("Sales user already exists:", existingSales.email);
    salesId = existingSales.id;
  } else {
    // Create sales user
    const salesPasswordHash = await hashPassword("sales123");
    const [sales] = await db
      .insert(crmUsers)
      .values({
        name: "Sarah Sales",
        email: "sales@ghvac.com",
        phone: "+17065551002",
        role: "sales",
        passwordHash: salesPasswordHash,
        isActive: true,
      })
      .returning();
    console.log("Created sales user:", sales.email);
    salesId = sales.id;
  }

  // Check if test customer already exists
  const [existingCustomer] = await db
    .select()
    .from(crmCustomers)
    .where(eq(crmCustomers.email, "testcustomer@example.com"))
    .limit(1);

  let customerId: string;

  if (existingCustomer) {
    console.log("Test customer already exists:", existingCustomer.name);
    customerId = existingCustomer.id;
  } else {
    // Create test customer
    const [customer] = await db
      .insert(crmCustomers)
      .values({
        name: "Test Customer",
        email: "testcustomer@example.com",
        phone: "+17065559999",
        notes: "Seed data test customer",
      })
      .returning();
    console.log("Created test customer:", customer.name);
    customerId = customer.id;

    // Create property for customer
    const [property] = await db
      .insert(crmProperties)
      .values({
        customerId: customer.id,
        address1: "123 Test Street",
        city: "Augusta",
        state: "GA",
        zip: "30901",
        notes: "Test property",
      })
      .returning();
    console.log("Created test property:", property.address1);
  }

  // Check if test job already exists
  const existingJobs = await db
    .select()
    .from(crmJobs)
    .where(eq(crmJobs.customerId, customerId))
    .limit(1);

  if (existingJobs.length > 0) {
    console.log("Test job already exists for customer");
  } else {
    // Create test job assigned to tech
    const [job] = await db
      .insert(crmJobs)
      .values({
        customerId,
        jobType: "SERVICE",
        status: "scheduled",
        priority: "normal",
        description: "Test service call - seed data",
        scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      })
      .returning();
    console.log("Created test job:", job.id);

    // Assign tech to job
    await db.insert(crmJobAssignments).values({
      jobId: job.id,
      techUserId: techId,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    console.log("Assigned tech to job");
  }

  console.log("\n=== CRM Seed Complete ===");
  console.log("\nTest Users:");
  console.log("  Admin: admin@ghvac.com / admin123");
  console.log("  Tech:  tech@ghvac.com / tech123");
  console.log("  Sales: sales@ghvac.com / sales123");
  console.log("");
}

seed()
  .then(() => {
    console.log("Seed completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
