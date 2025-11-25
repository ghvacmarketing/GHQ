import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, boolean, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerName: text("customer_name").notNull(),
  technician: text("technician").notNull(),
  parts: json("parts").$type<Part[]>().notNull().default([]),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  labor: decimal("labor", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  ghvacInstalled: boolean("ghvac_installed").default(false),
  yearsSinceInstallation: text("years_since_installation"),
  laborHours: text("labor_hours"),
  status: text("status").default("draft"), // draft, pending, accepted
  quoteText: text("quote_text"),
  emailSent: boolean("email_sent").default(false),
  trelloCardId: text("trello_card_id"),
  pushedToTrello: boolean("pushed_to_trello").default(false),
  jobNotes: text("job_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const parts = pgTable("parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partNumber: text("part_number").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  availability: text("availability").notNull(),
  vendor: text("vendor"),
  warranty: boolean("warranty").default(false),
  isCustom: boolean("is_custom").default(false),
});

export const technicians = pgTable("technicians", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export type Part = {
  id: string;
  partNumber: string;
  description: string;
  category: string;
  price: string;
  availability: string;
  vendor?: string;
  warranty: boolean;
  isCustom: boolean;
  quantity?: number;
};

export type QuotePart = Part & {
  quantity: number;
};

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
});

export const insertPartSchema = createInsertSchema(parts).omit({
  id: true,
});

export const insertTechnicianSchema = createInsertSchema(technicians).omit({
  id: true,
});

export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;
export type PartData = typeof parts.$inferSelect;
export type InsertTechnician = z.infer<typeof insertTechnicianSchema>;
export type Technician = typeof technicians.$inferSelect;

export const processes = pgTable("processes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  rationale: text("rationale"),
  steps: json("steps").$type<ProcessStep[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ProcessStep = {
  id: string;
  stepNumber: number;
  instruction: string;
};

export const processAttachments = pgTable("process_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  processId: varchar("process_id").notNull(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: text("file_size").notNull(),
  fileData: text("file_data").notNull(),
  displayOrder: text("display_order").notNull().default("0"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertProcessSchema = createInsertSchema(processes).omit({
  id: true,
  createdAt: true,
});

export const insertProcessAttachmentSchema = createInsertSchema(processAttachments).omit({
  id: true,
  uploadedAt: true,
});

export type InsertProcess = z.infer<typeof insertProcessSchema>;
export type Process = typeof processes.$inferSelect;
export type InsertProcessAttachment = z.infer<typeof insertProcessAttachmentSchema>;
export type ProcessAttachment = typeof processAttachments.$inferSelect;

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  order: text("order").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

export const pdfFiles = pgTable("pdf_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  size: text("size").notNull(),
  data: text("data").notNull(), // Base64 encoded PDF data
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertPdfFileSchema = createInsertSchema(pdfFiles).omit({
  id: true,
  uploadedAt: true,
});

export type InsertPdfFile = z.infer<typeof insertPdfFileSchema>;
export type PdfFile = typeof pdfFiles.$inferSelect;

export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  message: text("message").notNull(),
  buttonText: text("button_text").notNull().default("Got it"),
  version: text("version").notNull().default("1"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcements.$inferSelect;

export const phoneWhitelist = pgTable("phone_whitelist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPhoneWhitelistSchema = createInsertSchema(phoneWhitelist).omit({
  id: true,
  createdAt: true,
});

export type InsertPhoneWhitelist = z.infer<typeof insertPhoneWhitelistSchema>;
export type PhoneWhitelist = typeof phoneWhitelist.$inferSelect;

export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
export type AuthToken = typeof authTokens.$inferSelect;

export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export type Session = typeof sessions.$inferSelect;

// Lead Management System
export type LeadAction = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
};

export type LeadTask = {
  id: string;
  text: string;
  scheduledDate: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
};

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("New"), // New, Contacted, Quote Sent, Negotiating, Won, Lost
  clientIssue: text("client_issue"),
  projectedCloseDate: timestamp("projected_close_date"),
  createdAt: timestamp("created_at").defaultNow(),
  won: boolean("won").notNull().default(false),
  lost: boolean("lost").notNull().default(false),
  closedAt: timestamp("closed_at"),
  nextActions: json("next_actions").$type<LeadAction[]>().notNull().default([]),
  scheduledTasks: json("scheduled_tasks").$type<LeadTask[]>().notNull().default([]),
  quoteDetails: text("quote_details"),
  quotePricing: text("quote_pricing"),
  customerType: text("customer_type"), // Residential, Commercial, etc.
  leadSource: text("lead_source"),
  assignedEmployeeId: varchar("assigned_employee_id"), // Optional employee assignment
  quoteId: varchar("quote_id"), // Reference to source quote if lead was created from quote
  // De-duplication and import tracking
  externalId: text("external_id"), // ID from Field Edge or other external system
  importSource: text("import_source"), // "fieldedge", "manual", etc.
  importBatchId: varchar("import_batch_id"),
  lastImportedAt: timestamp("last_imported_at"),
  dedupeHash: text("dedupe_hash"), // Hash of key fields for quick duplicate detection
  // Soft delete and audit
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
  tags: json("tags").$type<string[]>().notNull().default([]),
});

// Lead History / Audit Trail
export type LeadHistoryEntry = {
  id: string;
  leadId: string;
  actor: string;
  actionType: string; // created, updated, status_changed, deleted, restored, etc.
  payload: Record<string, any>; // snapshot of changes
  createdAt: string;
};

export const leadHistory = pgTable("lead_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  actor: text("actor").notNull(), // user phone or "system"
  actionType: text("action_type").notNull(),
  payload: json("payload").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const importBatches = pgTable("import_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(), // "fieldedge", "manual", etc.
  filename: text("filename"),
  importedAt: timestamp("imported_at").defaultNow(),
  status: text("status").notNull().default("completed"), // processing, completed, failed
  createdCount: text("created_count").default("0"),
  updatedCount: text("updated_count").default("0"),
  skippedCount: text("skipped_count").default("0"),
  errorCount: text("error_count").default("0"),
  summary: text("summary"),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
}).extend({
  projectedCloseDate: z.union([z.string(), z.date()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  closedAt: z.union([z.string(), z.date()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  lastImportedAt: z.union([z.string(), z.date()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
});

export const insertLeadHistorySchema = createInsertSchema(leadHistory).omit({
  id: true,
  createdAt: true,
});

export const insertImportBatchSchema = createInsertSchema(importBatches).omit({
  id: true,
  importedAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertLeadHistory = z.infer<typeof insertLeadHistorySchema>;
export type LeadHistory = typeof leadHistory.$inferSelect;
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type ImportBatch = typeof importBatches.$inferSelect;
