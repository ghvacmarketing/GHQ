import { db } from "./db";
import { serviceCallChecklists, checklistQuestions, checklistPhotoSteps } from "@shared/schema";
import { and, eq } from "drizzle-orm";

/** One-time seed: the "No Cool — Service Call" checklist, transcribed from
 *  the CompanyCam original (2026-08-05, 16 screenshots, deduped). Runs at
 *  startup, inserts ONLY if a checklist with this name doesn't exist yet —
 *  after that the canvas owns it and this never touches it again. */

const NAME = "No Cool — Service Call";

const YNA = ["Yes", "No", "N/A"];

type Q = {
  section: string;
  question: string;
  type: "yes_no" | "text" | "number" | "select" | "multi_select";
  options?: string[];
  required?: boolean;
  help?: string;
  /** key for photo-step linking */
  key?: string;
};

const QUESTIONS: Q[] = [
  // ── Client Greeting and Diagnosis ─────────────────────────────────────
  { section: "Client Greeting & Diagnosis", question: "Introduce yourself to the client", type: "yes_no", required: true,
    help: "“Hello, I am (name). I will be servicing your system today. Do you have any questions or concerns you would like me to address while I am here today?”" },
  { section: "Client Greeting & Diagnosis", question: "Issue with system as stated by client", type: "text", required: true },
  { section: "Client Greeting & Diagnosis", question: "Notes from client introduction", type: "text" },
  { section: "Client Greeting & Diagnosis", question: "Present client with our accessory items list", type: "yes_no" },
  { section: "Client Greeting & Diagnosis", question: "Set thermostat 5 degrees below current room temp", type: "yes_no", required: true },
  { section: "Client Greeting & Diagnosis", question: "Filter size or type of air cleaner", type: "text", help: "e.g. 20x25x1, or the air cleaner model" },
  { section: "Client Greeting & Diagnosis", question: "Calling for correct function", type: "select", options: YNA, required: true },
  { section: "Client Greeting & Diagnosis", question: "Thermostat display", type: "select", options: ["Normal", "Error Code", "Dead"], required: true },
  { section: "Client Greeting & Diagnosis", question: "Filter condition (1 = clogged, 5 = new)", type: "select", options: ["1", "2", "3", "4", "5", "N/A"], required: true, key: "filter_condition" },
  { section: "Client Greeting & Diagnosis", question: "Filter size fit", type: "select", options: ["Correct", "Wrong", "Missing"] },
  { section: "Client Greeting & Diagnosis", question: "Airflow", type: "select", options: ["Strong", "Moderate", "Weak", "None"], required: true },
  { section: "Client Greeting & Diagnosis", question: "Blower", type: "select", options: ["Running", "Not Running", "Unusual Noise"], required: true },

  // ── Diagnostics — Indoor Unit ─────────────────────────────────────────
  { section: "Diagnostics — Indoor Unit", question: "Transformer secondary (V)", type: "text",
    help: "Follow the items in this section to diagnose issues with the indoor unit." },
  { section: "Diagnostics — Indoor Unit", question: "Indoor unit type", type: "select", options: ["Split System — Indoor Unit", "Package Unit", "Other"], required: true },
  { section: "Diagnostics — Indoor Unit", question: "Is the indoor fan operating?", type: "select",
    options: ["Yes — go to the outdoor unit", "No — check 120/240 VAC high-voltage power, then 24 V G-to-Common for the fan signal"], required: true },
  { section: "Diagnostics — Indoor Unit", question: "Control board has power", type: "select", options: YNA },
  { section: "Diagnostics — Indoor Unit", question: "Control board fuse", type: "select", options: ["Good", "Blown"] },
  { section: "Diagnostics — Indoor Unit", question: "Indoor disconnect (high V)", type: "text" },
  { section: "Diagnostics — Indoor Unit", question: "Breaker", type: "select", options: ["On", "Tripped", "Off"] },
  { section: "Diagnostics — Indoor Unit", question: "Blower motor voltage", type: "text" },

  // ── Diagnostics — Outdoor / Package Unit ──────────────────────────────
  { section: "Diagnostics — Outdoor / Package Unit", question: "Connect refrigerant gauges to the system", type: "select", options: YNA },
  { section: "Diagnostics — Outdoor / Package Unit", question: "High voltage (240 V) at field connections?", type: "select",
    options: ["Yes — move to next step", "No — check power supply, disconnect, breaker box"], required: true },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Low voltage (24 V) at R & Common?", type: "select",
    options: ["Yes — move to next step", "No — go back to the indoor unit and verify low-voltage power"] },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Low voltage (24 V) at Y & Common?", type: "select",
    options: ["Yes — move to next step", "No — verify low voltage between Y & Common coming from the thermostat"] },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Gauges connected at outdoor service ports", type: "select", options: YNA },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Time installed", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Ambient temperature", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Standing/idle pressure (PSIG)", type: "text",
    help: "Expected: 70°F ≈ 100 | 80°F ≈ 120 | 90°F ≈ 140 | 100°F ≈ 165 PSIG" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Standing pressure", type: "select", options: ["Normal", "Low", "High", "Zero"] },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Voltage at contactor coil", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Getting call signal", type: "select", options: YNA },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Contactor energizes", type: "select", options: YNA },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Outdoor disconnect (V)", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Contactor line (L1/L2)", type: "text", help: "e.g. 12/13" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "When running — load (T1/T2)", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Compressor | Fan (V1/V2)", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Suction | Liquid (PSIG/PSIG)", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Supply | Return | Split (°F/°F/°F)", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Compressor capacitor (rated/tested)", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Capacitor condition", type: "select", options: ["Good", "Weak", "Failed", "Bulging", "Leaking"] },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Safety switches — high pressure", type: "select", options: ["Closed", "Open", "N/A"] },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Safety switches — low pressure", type: "select", options: ["Closed", "Open", "N/A"] },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Safety switch — float switch", type: "select", options: ["Closed", "Open", "Not Present"] },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Other safeties — status (open/closed)", type: "text" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Final diagnosis (from annotated pictures)", type: "text", key: "final_diagnosis" },
  { section: "Diagnostics — Outdoor / Package Unit", question: "Other diagnosis", type: "text" },

  // ── Diagnostics — Summary ─────────────────────────────────────────────
  { section: "Diagnostics — Summary", question: "Time to complete sequence", type: "text" },
  { section: "Diagnostics — Summary", question: "Based on my findings, my diagnosis is:", type: "text", required: true },
  { section: "Diagnostics — Summary", question: "Components needing attention", type: "multi_select",
    options: ["Filter", "Refrigerant", "Electrical", "Airflow", "Failed Component"] },

  // ── Repairs on System ─────────────────────────────────────────────────
  { section: "Repairs on System", question: "Verify if the unit is under warranty", type: "yes_no",
    help: "Take a screenshot of the warranty registration if possible." },
  { section: "Repairs on System", question: "Compile an estimate and present it to the client", type: "yes_no",
    help: "Present a general overview of the problem, then the solutions. Finish with: “Would you like to move forward with the repairs today?”" },
  { section: "Repairs on System", question: "List out all work performed", type: "text", required: true },
  { section: "Repairs on System", question: "Does the system require refrigerant to be adjusted?", type: "select", options: YNA },
  { section: "Repairs on System", question: "After adding refrigerant — data", type: "text" },
  { section: "Repairs on System", question: "Amount of refrigerant added", type: "text" },
  { section: "Repairs on System", question: "Check capacitors & record values", type: "text" },
  { section: "Repairs on System", question: "Indoor fan amp draw", type: "text" },
  { section: "Repairs on System", question: "Compressor amp draw", type: "text" },
  { section: "Repairs on System", question: "Outdoor fan amp draw", type: "text" },

  // ── Visit Wrap-Up ─────────────────────────────────────────────────────
  { section: "Visit Wrap-Up", question: "Return temp", type: "text", required: true },
  { section: "Visit Wrap-Up", question: "Supply temp", type: "text", required: true },
  { section: "Visit Wrap-Up", question: "Delta T", type: "text", required: true },
  { section: "Visit Wrap-Up", question: "Leave an accessory sheet for the customer if unable to present", type: "yes_no" },
  { section: "Visit Wrap-Up", question: "System operating? Verify before leaving", type: "select", options: YNA, required: true,
    help: "NEVER leave the client's home without verifying the system is operating — after having put away all your tools!" },
  { section: "Visit Wrap-Up", question: "Invoice presented to client?", type: "select", options: YNA, required: true },
  { section: "Visit Wrap-Up", question: "Payment collected?", type: "select", options: YNA, required: true },
  { section: "Visit Wrap-Up", question: "Offered Preventive Maintenance Program?", type: "select", options: YNA, required: true },
  { section: "Visit Wrap-Up", question: "Additional comments or notes", type: "text" },
];

const PHOTO_STEPS: Array<{ label: string; instructions?: string; linkKey?: string }> = [
  { label: "Thermostat — current setting" },
  { label: "Filter" },
  { label: "Filter condition", linkKey: "filter_condition" },
  { label: "Additional diagnosis — annotate pictures", instructions: "Annotate what you found; these back up the final diagnosis.", linkKey: "final_diagnosis" },
  { label: "Work performed, old parts & new parts", instructions: "Include current refrigerant data." },
  { label: "Refrigerant canister serial #", instructions: "Take a picture of the serial number on the canister the refrigerant was added from." },
  { label: "Indoor unit" },
  { label: "Indoor unit data plate" },
  { label: "Outdoor unit" },
  { label: "Outdoor unit data plate" },
  { label: "Thermostat — after service" },
];

export async function seedNoCoolChecklist(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: serviceCallChecklists.id })
      .from(serviceCallChecklists)
      .where(and(eq(serviceCallChecklists.name, NAME), eq(serviceCallChecklists.serviceType, "NO_AC")));
    if (existing) return; // seeded once — the canvas owns it from then on

    const [checklist] = await db
      .insert(serviceCallChecklists)
      .values({
        visitType: "SERVICE",
        serviceType: "NO_AC",
        name: NAME,
        description:
          "Full no-cool service call flow: client greeting & first-look diagnosis, indoor and outdoor diagnostics, repairs, and visit wrap-up. Transcribed from the CompanyCam checklist.",
        isActive: true,
      })
      .returning({ id: serviceCallChecklists.id });

    const keyIds = new Map<string, string>();
    let sort = 0;
    for (const q of QUESTIONS) {
      sort += 10;
      const [row] = await db
        .insert(checklistQuestions)
        .values({
          checklistId: checklist.id,
          section: q.section,
          question: q.question,
          questionType: q.type,
          options: q.options ?? null,
          isRequired: q.required ?? false,
          sortOrder: sort,
          helpText: q.help ?? null,
        })
        .returning({ id: checklistQuestions.id });
      if (q.key) keyIds.set(q.key, row.id);
    }

    let psort = 0;
    for (const ps of PHOTO_STEPS) {
      psort += 10;
      await db.insert(checklistPhotoSteps).values({
        checklistId: checklist.id,
        label: ps.label,
        instructions: ps.instructions ?? null,
        isRequired: true,
        linkedQuestionId: ps.linkKey ? keyIds.get(ps.linkKey) ?? null : null,
        sortOrder: psort,
      });
    }
    console.log(`[seed] "${NAME}" checklist created (${QUESTIONS.length} questions, ${PHOTO_STEPS.length} photo steps)`);
  } catch (err) {
    console.error("No-cool checklist seed error (non-fatal):", err);
  }
}
