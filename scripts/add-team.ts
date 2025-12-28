import { db } from "../server/db";
import { crmUsers } from "../shared/schema";
import { hashPassword } from "../server/crm-auth";
import { eq } from "drizzle-orm";

async function addTeam() {
  const users = [
    { name: "Kylee", email: "kylee@ghvacinc.com", role: "owner" },
    { name: "Chandler", email: "chandler@ghvacinc.com", role: "manager" },
    { name: "Earnest", email: "earnest@ghvacinc.com", role: "manager" },
    { name: "Brian", email: "brian@ghvacinc.com", role: "tech" },
    { name: "Tucker", email: "tucker@ghvacinc.com", role: "tech" },
    { name: "Christopher", email: "christopher@ghvacinc.com", role: "tech" },
  ];

  for (const u of users) {
    const [existing] = await db.select().from(crmUsers).where(eq(crmUsers.email, u.email)).limit(1);
    if (existing) {
      console.log("Already exists:", u.email);
      continue;
    }
    const hash = await hashPassword("ghvac2024");
    await db.insert(crmUsers).values({
      name: u.name,
      email: u.email,
      role: u.role as "owner" | "manager" | "dispatcher" | "sales" | "tech" | "viewer",
      passwordHash: hash,
      isActive: true,
    });
    console.log("Created:", u.name, "-", u.email, "(" + u.role + ")");
  }
  
  console.log("\n=== Team Created ===");
  console.log("Password for all: ghvac2024");
  console.log("\nAdmins: Kylee, Chandler, Earnest");
  console.log("Technicians: Brian, Tucker, Christopher");
}

addTeam().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
