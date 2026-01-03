import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, boolean, json, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerName: text("customer_name").notNull(),
  technician: text("technician").notNull(),
  parts: json("parts").$type<Part[]>().notNull().default([]),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  labor: decimal("labor", { precision: 10, scale: 2 }).notNull(),
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
  jobType: text("job_type"), // Installation, Service, Maintenance, etc.
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
  // Installation pipeline fields
  installStep: text("install_step"), // Kanban column for installation tracking
  installOrder: integer("install_order").default(0), // Order within column
  installDate: timestamp("install_date"), // Scheduled installation start date (required at Assign to Sub-Contractor)
  installEndDate: timestamp("install_end_date"), // Optional end date for multi-day installations
  installEnteredAt: timestamp("install_entered_at"), // When lead entered installation board (marked Won)
  installSubcontractor: text("install_subcontractor"), // Subcontractor assigned to this installation (Dustin, Baltezar, etc.)
  // Service pipeline fields
  serviceStep: text("service_step"), // Kanban column for service tracking
  serviceOrder: integer("service_order").default(0), // Order within column
  serviceEnteredAt: timestamp("service_entered_at"), // When lead entered service board
  repairDate: timestamp("repair_date"), // Scheduled repair date for service jobs (single day, not range)
  // Pipeline transfer tracking
  currentPipeline: text("current_pipeline"), // 'service' or 'installation' - tracks which board lead is currently on
  transferredFromPipeline: text("transferred_from_pipeline"), // If transferred, which pipeline it came from
  transferredAt: timestamp("transferred_at"), // When the transfer occurred
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
  repairDate: z.union([z.string(), z.date()]).optional().transform((val) => {
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

// Customer Database (imported from FieldEdge CSV)
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: text("display_name").notNull(),
  customerType: text("customer_type"), // Residential, Commercial, Property Manager
  customerStatus: text("customer_status"), // Customer, Prospect
  fullAddress: text("full_address"),
  phone: text("phone"),
  email: text("email"),
  leadSource: text("lead_source"),
  // Import tracking
  checksum: text("checksum"), // Hash of row data for change detection
  importBatchId: varchar("import_batch_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  // Archive support (soft delete)
  archived: boolean("archived").default(false),
  archivedAt: timestamp("archived_at"),
  archivedBy: varchar("archived_by"),
  archiveReason: text("archive_reason"),
});

export const customerImportBatches = pgTable("customer_import_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename"),
  fileHash: text("file_hash"), // Hash of entire file to detect duplicate uploads
  importedAt: timestamp("imported_at").defaultNow(),
  status: text("status").notNull().default("processing"), // processing, completed, failed
  totalRows: text("total_rows").default("0"),
  createdCount: text("created_count").default("0"),
  updatedCount: text("updated_count").default("0"),
  skippedCount: text("skipped_count").default("0"),
  errorCount: text("error_count").default("0"),
  errorDetails: text("error_details"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  lastSyncedAt: true,
});

export const insertCustomerImportBatchSchema = createInsertSchema(customerImportBatches).omit({
  id: true,
  importedAt: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomerImportBatch = z.infer<typeof insertCustomerImportBatchSchema>;
export type CustomerImportBatch = typeof customerImportBatches.$inferSelect;

// Quote Conversations for AI memory
export const quoteConversations = pgTable("quote_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"),
  customerName: text("customer_name").notNull(),
  rollingSummary: text("rolling_summary"),
  cartSnapshot: json("cart_snapshot"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const quoteMessages = pgTable("quote_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQuoteConversationSchema = createInsertSchema(quoteConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteMessageSchema = createInsertSchema(quoteMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertQuoteConversation = z.infer<typeof insertQuoteConversationSchema>;
export type QuoteConversation = typeof quoteConversations.$inferSelect;
export type InsertQuoteMessage = z.infer<typeof insertQuoteMessageSchema>;
export type QuoteMessage = typeof quoteMessages.$inferSelect;

// Voicemails table (Trello webhook integration)
export const voicemails = pgTable("voicemails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trelloCardId: text("trello_card_id").unique().notNull(),
  trelloListId: text("trello_list_id"),
  title: text("title"),
  description: text("description"),
  status: text("status").notNull().default("NEW"), // NEW, UNRESOLVED, RESOLVED
  caller: text("caller"),
  receivedAt: timestamp("received_at"),
  mp3Filename: text("mp3_filename"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVoicemailSchema = createInsertSchema(voicemails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVoicemail = z.infer<typeof insertVoicemailSchema>;
export type Voicemail = typeof voicemails.$inferSelect;

// Structured AI Quote Response Schema - Professional Proposal Format
export const AIQuoteResponseSchema = z.object({
  quote_title: z.string(),
  package_description: z.string(),
  whats_included: z.array(z.object({
    category: z.string(),
    items: z.array(z.string()),
  })),
  best_for: z.string(),
  line_items: z.array(z.object({
    name: z.string(),
    qty: z.number(),
    price: z.number(),
    description: z.string(),
  })),
  subtotal: z.number(),
  elite_discount_active: z.boolean(),
  elite_discount_percent: z.number(),
  elite_discount_amount: z.number(),
  elite_warning: z.string(),
  discount_percent: z.number(),
  discount_amount: z.number(),
  total: z.number(),
  savings_note: z.string(),
  financing_text: z.string().optional().default(""),
  warranties_and_terms: z.array(z.string()),
  next_steps: z.array(z.string()),
  additional_enhancements: z.array(z.object({
    name: z.string(),
    price: z.number(),
    description: z.string(),
    whats_included: z.array(z.string()),
    recommended_for: z.string(),
  })),
});
export type AIQuoteResponse = z.infer<typeof AIQuoteResponseSchema>;

// Equipment types for Proposal Builder (sourced from Google Sheets)
export type Equipment = {
  id: string;
  category: string; // e.g., "Air Conditioners", "Heat Pumps", "Furnaces", "Package Units", "Mini Splits"
  subcategory?: string; // e.g., "Single Stage", "Two Stage", "Variable Speed"
  brand: string;
  model: string;
  description: string;
  tonnage?: string; // e.g., "2 Ton", "3 Ton", "4 Ton"
  btu?: string; // e.g., "24000 BTU"
  seer?: string; // e.g., "14 SEER", "18 SEER"
  afue?: string; // For furnaces - e.g., "80%", "96%"
  hspf?: string; // For heat pumps
  voltage?: string; // e.g., "208/230V"
  price: number;
  laborHours?: number;
  warranty?: string;
  notes?: string;
};

export type EquipmentCategory = {
  name: string;
  subcategories: string[];
  equipment: Equipment[];
};

// Proposal types for the proposal builder
export type ProposalEquipment = Equipment & {
  quantity: number;
};

export type Proposal = {
  id: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  salesPerson: string;
  equipment: ProposalEquipment[];
  accessories?: ProposalEquipment[];
  laborHours: number;
  subtotal: number;
  laborCost: number;
  total: number;
  notes?: string;
  isLocked: boolean; // Whether this is a guaranteed quote or preliminary proposal
  createdAt: Date;
};

// Saved Proposals table for proposal history
export const savedProposals = pgTable("saved_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  quoteTitle: text("quote_title").notNull(),
  packageDescription: text("package_description"),
  total: text("total").notNull(),
  quoteData: text("quote_data").notNull(), // JSON stringified AI quote response
  status: text("status").notNull().default("saved"), // saved, accepted, expired
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSavedProposalSchema = createInsertSchema(savedProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSavedProposal = z.infer<typeof insertSavedProposalSchema>;
export type SavedProposal = typeof savedProposals.$inferSelect;

// Daily Call Log tables
export const callLogDays = pgTable("call_log_days", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull().unique(), // YYYY-MM-DD format
  createdAt: timestamp("created_at").defaultNow(),
});

export const callLogs = pgTable("call_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayId: varchar("day_id").notNull().references(() => callLogDays.id, { onDelete: "cascade" }),
  clientName: text("client_name").notNull(),
  description: text("description").notNull(),
  phone: text("phone"),
  tag: text("tag"), // service, install, sales, etc.
  billable: boolean("billable").notNull().default(false),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const callLogTasks = pgTable("call_log_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callLogId: varchar("call_log_id").notNull().references(() => callLogs.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  dueDate: text("due_date"), // YYYY-MM-DD format, optional
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertCallLogDaySchema = createInsertSchema(callLogDays).omit({
  id: true,
  createdAt: true,
});

export const insertCallLogSchema = createInsertSchema(callLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCallLogTaskSchema = createInsertSchema(callLogTasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertCallLogDay = z.infer<typeof insertCallLogDaySchema>;
export type CallLogDay = typeof callLogDays.$inferSelect;
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLogTask = z.infer<typeof insertCallLogTaskSchema>;
export type CallLogTask = typeof callLogTasks.$inferSelect;

// Employee Portal Tables
export const portalUsers = pgTable("portal_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"),
  isActive: boolean("is_active").notNull().default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const employeeProfiles = pgTable("employee_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  address: text("address"),
  hireDate: date("hire_date"),
  department: text("department"),
  position: text("position"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const compensations = pgTable("compensations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  payType: text("pay_type").notNull(),
  rate: text("rate").notNull(),
  commissionRate: text("commission_rate"),
  paySchedule: text("pay_schedule").notNull().default("biweekly"),
  effectiveDate: date("effective_date").notNull(),
  endDate: date("end_date"),
  createdBy: varchar("created_by").references(() => portalUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paystubs = pgTable("paystubs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  payDate: date("pay_date").notNull(),
  grossPay: text("gross_pay").notNull(),
  netPay: text("net_pay").notNull(),
  hoursWorked: text("hours_worked"),
  deductions: text("deductions"),
  fileUrl: text("file_url"),
  uploadedBy: varchar("uploaded_by").references(() => portalUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const compensationAuditLog = pgTable("compensation_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  compensationId: varchar("compensation_id").references(() => compensations.id),
  action: text("action").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  changedBy: varchar("changed_by").notNull().references(() => portalUsers.id),
  changedAt: timestamp("changed_at").defaultNow(),
});

export const employeeDocuments = pgTable("employee_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => portalUsers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  category: text("category").notNull(),
  uploadedBy: varchar("uploaded_by").references(() => portalUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPortalUserSchema = createInsertSchema(portalUsers).omit({
  id: true,
  createdAt: true,
});

export const insertEmployeeProfileSchema = createInsertSchema(employeeProfiles).omit({
  id: true,
  createdAt: true,
});

export const insertCompensationSchema = createInsertSchema(compensations).omit({
  id: true,
  createdAt: true,
});

export const insertPaystubSchema = createInsertSchema(paystubs).omit({
  id: true,
  createdAt: true,
});

export const insertCompensationAuditLogSchema = createInsertSchema(compensationAuditLog).omit({
  id: true,
});

export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments).omit({
  id: true,
  createdAt: true,
});

export type InsertPortalUser = z.infer<typeof insertPortalUserSchema>;
export type PortalUser = typeof portalUsers.$inferSelect;
export type InsertEmployeeProfile = z.infer<typeof insertEmployeeProfileSchema>;
export type EmployeeProfile = typeof employeeProfiles.$inferSelect;
export type InsertCompensation = z.infer<typeof insertCompensationSchema>;
export type Compensation = typeof compensations.$inferSelect;
export type InsertPaystub = z.infer<typeof insertPaystubSchema>;
export type Paystub = typeof paystubs.$inferSelect;
export type InsertCompensationAuditLog = z.infer<typeof insertCompensationAuditLogSchema>;
export type CompensationAuditLog = typeof compensationAuditLog.$inferSelect;
export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;

// ============================================
// GHVAC CRM Tables (FieldEdge Replacement)
// ============================================

// CRM User Roles
// owner: Full access to everything (desktop CRM + mobile)
// admin: Desktop CRM access only
// sales: Desktop CRM + mobile access (manager-level features)
// tech: Mobile access only
export const crmUserRoleEnum = ["owner", "admin", "sales", "tech"] as const;
export type CrmUserRole = typeof crmUserRoleEnum[number];

// CRM Users
export const crmUsers = pgTable("crm_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").$type<CrmUserRole>().notNull().default("tech"),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Sessions
export const crmSessions = pgTable("crm_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
});

// CRM Audit Log
export const crmAuditLog = pgTable("crm_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id").references(() => crmUsers.id),
  actorType: text("actor_type").$type<"user" | "system">().notNull().default("user"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Customer Type and Status Enums
export const crmCustomerTypeEnum = ["residential", "commercial", "property_manager"] as const;
export type CrmCustomerType = typeof crmCustomerTypeEnum[number];

export const crmCustomerStatusEnum = ["prospect", "client"] as const;
export type CrmCustomerStatus = typeof crmCustomerStatusEnum[number];

// Sales Stage Enum for prospect funnel
export const salesStageEnum = ["new", "contacted", "quote_sent", "negotiating", "won", "lost"] as const;
export type SalesStage = typeof salesStageEnum[number];

// Interest Level Enum
export const interestLevelEnum = ["hot", "warm", "cold"] as const;
export type InterestLevel = typeof interestLevelEnum[number];

// Follow-up Type Enum
export const followUpTypeEnum = ["call", "email", "visit", "text"] as const;
export type FollowUpType = typeof followUpTypeEnum[number];

// Follow-up Outcome Enum
export const followUpOutcomeEnum = ["interested", "not_ready", "declined", "no_answer", "left_message", "scheduled", "other"] as const;
export type FollowUpOutcome = typeof followUpOutcomeEnum[number];

// CRM Customers
export const crmCustomers = pgTable("crm_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  customerType: text("customer_type").$type<CrmCustomerType>().default("residential"),
  customerStatus: text("customer_status").$type<CrmCustomerStatus>().default("client"),
  fullAddress: text("full_address"),
  leadSource: text("lead_source"),
  tags: json("tags").$type<string[]>().default([]),
  notes: text("notes"),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  // Prospect funnel fields
  salesStage: text("sales_stage").$type<SalesStage>(),
  interestLevel: text("interest_level").$type<InterestLevel>(),
  potentialValue: integer("potential_value"),
  assignedSalesRepId: varchar("assigned_sales_rep_id"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Properties (addresses linked to customers)
export const crmProperties = pgTable("crm_properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
  address1: text("address1").notNull(),
  address2: text("address2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  notes: text("notes"),
  tenantName: text("tenant_name"),
  tenantPhone: text("tenant_phone"),
  tenantEmail: text("tenant_email"),
  // Owner contact fields (for billing to owner)
  ownerName: text("owner_name"),
  ownerPhone: text("owner_phone"),
  ownerEmail: text("owner_email"),
  // Quick toggle for preferred payment method (visible without billing override)
  preferredPaymentMethod: text("preferred_payment_method"), // e.g., "check", "cash", "credit_card"
  // Billing fields - if billingOverride is false, use PM defaults
  billingOverride: boolean("billing_override").default(false),
  billedTo: text("billed_to").$type<"property_manager" | "tenant" | "owner">().default("property_manager"),
  paymentTerms: text("payment_terms"), // e.g., "net_30", "due_on_receipt", "net_15"
  paymentMethod: text("payment_method"), // e.g., "invoice", "credit_card", "check"
  approvalRule: text("approval_rule"), // e.g., "pm_approval_required", "tenant_direct", "auto_approve"
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Follow-Ups (scheduled follow-ups for prospects)
export const crmFollowUps = pgTable("crm_follow_ups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
  followUpType: text("follow_up_type").$type<FollowUpType>().notNull().default("call"),
  dueAt: timestamp("due_at").notNull(),
  completedAt: timestamp("completed_at"),
  outcome: text("outcome").$type<FollowUpOutcome>(),
  notes: text("notes"),
  assignedUserId: varchar("assigned_user_id").references(() => crmUsers.id),
  createdBy: varchar("created_by").references(() => crmUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Equipment
export const crmEquipment = pgTable("crm_equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => crmProperties.id, { onDelete: "cascade" }),
  equipmentType: text("equipment_type").notNull(),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  installDate: date("install_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Job Status Enum (legacy - kept for compatibility)
export const crmJobStatusEnum = ["new", "scheduled", "dispatched", "en_route", "on_site", "completed", "invoiced", "paid", "cancelled"] as const;
export type CrmJobStatus = typeof crmJobStatusEnum[number];

// Project Status Enum (pipeline-style)
export const projectStatusEnum = ["lead", "proposal_sent", "approved", "in_progress", "completed", "closed", "archived"] as const;
export type ProjectStatus = typeof projectStatusEnum[number];

// Project Type Enum
export const projectTypeEnum = ["INSTALL", "DUCT", "COMMERCIAL", "MAINTENANCE_AGREEMENT", "MAJOR_REPAIR"] as const;
export type ProjectType = typeof projectTypeEnum[number];

// WorkOrder Status Enum (dispatch-style)
export const workOrderStatusEnum = ["scheduled", "dispatched", "en_route", "on_site", "completed", "cancelled"] as const;
export type WorkOrderStatus = typeof workOrderStatusEnum[number];

// CRM Jobs
export const crmJobs = pgTable("crm_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => crmCustomers.id),
  propertyId: varchar("property_id").references(() => crmProperties.id),
  accountId: varchar("account_id").references(() => crmAccounts.id),
  siteId: varchar("site_id").references(() => crmSites.id),
  jobType: text("job_type").notNull(),
  status: text("status").$type<CrmJobStatus>().notNull().default("new"),
  priority: text("priority").$type<"low" | "normal" | "high" | "urgent">().default("normal"),
  description: text("description"),
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Projects (big-ticket scope containers - $5k+ jobs)
export const crmProjects = pgTable("crm_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id"),
  propertyId: varchar("property_id"),
  projectType: text("project_type").$type<ProjectType>().notNull(),
  status: text("status").$type<ProjectStatus>().notNull().default("lead"),
  title: text("title").notNull(),
  description: text("description"),
  expectedValue: decimal("expected_value", { precision: 10, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 10, scale: 2 }),
  priority: text("priority").$type<"low" | "normal" | "high" | "urgent">().default("normal"),
  proposalSentAt: timestamp("proposal_sent_at"),
  approvedAt: timestamp("approved_at"),
  completedAt: timestamp("completed_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Work Orders (standalone scheduled visits - can optionally link to projects)
// Work Order Visit Types (appointment purpose)
export const workOrderVisitTypeEnum = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;
export type WorkOrderVisitType = typeof workOrderVisitTypeEnum[number];

// Work Category - DEPRECATED: Now derived from Visit Type
export const workCategoryEnum = ["Service", "Maintenance", "Sales", "Install"] as const;
export type WorkCategory = typeof workCategoryEnum[number];

// Work Subtype options by Visit Type (direct mapping)
// Note: MAINTENANCE subtypes are dynamic - "Preventative Maintenance" is the default,
// additional subtypes come from custom_agreement_types table
export const workSubtypeByVisitType = {
  SERVICE: ["No Cool", "No Heat", "Water Leak", "Electrical", "Thermostat", "Airflow", "Noise", "IAQ", "Other"] as const,
  MAINTENANCE: ["Preventative Maintenance"] as const,
  SALES: ["Comfort Consultation", "HEAR Program", "HER Program"] as const,
  INSTALL: ["Full System", "Changeout", "Add Ducts", "Replace Ducts", "IAQ Install", "Mini-split", "Crawlspace"] as const,
} as const;

// Legacy mapping - DEPRECATED, use workSubtypeByVisitType instead
export const workSubtypeByCategory = {
  Service: workSubtypeByVisitType.SERVICE,
  Maintenance: workSubtypeByVisitType.MAINTENANCE,
  Sales: workSubtypeByVisitType.SALES,
  Install: workSubtypeByVisitType.INSTALL,
} as const;

// WorkSubtype includes static subtypes plus any string for dynamic maintenance subtypes
export type WorkSubtype = 
  | typeof workSubtypeByVisitType.SERVICE[number]
  | typeof workSubtypeByVisitType.MAINTENANCE[number]
  | typeof workSubtypeByVisitType.SALES[number]
  | typeof workSubtypeByVisitType.INSTALL[number]
  | string; // Allow dynamic subtypes from custom agreement types

// Billing Disposition - how a completed work order was billed
export const billingDispositionEnum = ["invoice_created", "no_charge", "billed_elsewhere"] as const;
export type BillingDisposition = typeof billingDispositionEnum[number];

// Dispatch Queue Stage - for organizing unassigned work orders
export const dispatchQueueStageEnum = [
  "NeedsScheduling",
  "ReadyToDispatch", 
  "WaitingOnParts",
  "NeedsApproval",
  "OnHold",
  "CallbackPriority"
] as const;
export type DispatchQueueStage = typeof dispatchQueueStageEnum[number];

export const crmWorkOrders = pgTable("crm_work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => crmCustomers.id),
  propertyId: varchar("property_id").references(() => crmProperties.id),
  projectId: varchar("project_id").references(() => crmProjects.id, { onDelete: "set null" }),
  jobId: varchar("job_id").references(() => crmJobs.id, { onDelete: "set null" }),
  agreementId: varchar("agreement_id"),
  workOrderNumber: integer("work_order_number").notNull().default(1),
  assignedTechId: varchar("assigned_tech_id").references(() => crmUsers.id),
  visitType: text("visit_type").$type<WorkOrderVisitType>().default("SERVICE"),
  workCategory: text("work_category").$type<WorkCategory>(),
  workSubtype: text("work_subtype").$type<WorkSubtype>().notNull(),
  title: text("title"),
  description: text("description"),
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  status: text("status").$type<WorkOrderStatus>().notNull().default("scheduled"),
  priority: text("priority").$type<"low" | "normal" | "high" | "urgent">().default("normal"),
  dispatchQueueStage: text("dispatch_queue_stage").$type<DispatchQueueStage>(),
  checklist: json("checklist").$type<{ item: string; completed: boolean }[]>(),
  partsUsed: json("parts_used").$type<{ partId: string; name: string; qty: number; price: number }[]>(),
  techNotes: text("tech_notes"),
  completionSummary: text("completion_summary"),
  photos: json("photos").$type<{ id: string; url: string; objectPath: string; filename: string; uploadedAt: string }[]>(),
  billingDisposition: text("billing_disposition").$type<BillingDisposition>(),
  billingNotes: text("billing_notes"),
  invoiceId: varchar("invoice_id"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Quote Status and Scope
export const crmQuoteStatusEnum = ["draft", "sent", "accepted", "declined", "expired", "converted"] as const;
export type CrmQuoteStatus = typeof crmQuoteStatusEnum[number];

export const crmQuoteScopeEnum = ["work_order", "project", "standalone"] as const;
export type CrmQuoteScope = typeof crmQuoteScopeEnum[number];

// CRM Quotes (proposals attached to either a Work Order or Project)
export const crmQuotes = pgTable("crm_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteNumber: text("quote_number").notNull(),
  jobId: varchar("job_id"),
  accountId: varchar("account_id"),
  siteId: varchar("site_id"),
  contactId: varchar("contact_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  serviceAddress: text("service_address"),
  title: text("title"),
  description: text("description"),
  lineItems: json("line_items").default([]),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  laborTotal: decimal("labor_total", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").$type<CrmQuoteStatus>().notNull().default("draft"),
  validUntil: timestamp("valid_until"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdById: varchar("created_by_id"),
  assignedToId: varchar("assigned_to_id"),
  internalNotes: text("internal_notes"),
  customerNotes: text("customer_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  customerId: varchar("customer_id"),
  propertyId: varchar("property_id"),
  workOrderId: varchar("work_order_id"),
  projectId: varchar("project_id"),
  scope: text("scope").$type<CrmQuoteScope>(),
  acceptedBy: text("accepted_by"),
  declineReason: text("decline_reason"),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  // AI-generated proposal content from Proposal Builder
  aiGeneratedQuote: json("ai_generated_quote").$type<{
    quote_title?: string;
    package_description?: string;
    whats_included?: Array<{ category: string; items: string[] }>;
    best_for?: string;
    line_items?: Array<{ name: string; qty: number; price: number; description: string }>;
    financing_text?: string;
    warranties_and_terms?: string[];
    next_steps?: string[];
  }>(),
  quoteMode: text("quote_mode").$type<"single" | "options">(),
  selectedOption: text("selected_option"),
});

// CRM Quote Line Items
export const crmQuoteLineItems = pgTable("crm_quote_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => crmQuotes.id, { onDelete: "cascade" }),
  lineType: text("line_type").$type<"part" | "labor" | "service" | "other" | "discount">().notNull().default("part"),
  description: text("description").notNull(),
  partNumber: text("part_number"),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  itemId: varchar("item_id").references(() => crmItems.id, { onDelete: "set null" }),
  isDiscountLine: boolean("is_discount_line").default(false),
  discountKind: text("discount_kind").$type<DiscountKind>(),
  optionTag: text("option_tag"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Quote Email Logs - tracks email sends for quotes
export const quoteEmailLogsStatusEnum = ["pending", "sent", "failed", "bounced"] as const;
export type QuoteEmailLogStatus = typeof quoteEmailLogsStatusEnum[number];

export const quoteEmailLogs = pgTable("quote_email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => crmQuotes.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  subject: text("subject").notNull(),
  status: text("status").$type<QuoteEmailLogStatus>().notNull().default("pending"),
  errorMessage: text("error_message"),
  sentBy: varchar("sent_by"),
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  personalMessage: text("personal_message"),
  isManual: boolean("is_manual").default(false),
});

export const insertQuoteEmailLogSchema = createInsertSchema(quoteEmailLogs).omit({
  id: true,
  sentAt: true,
});

export type InsertQuoteEmailLog = z.infer<typeof insertQuoteEmailLogSchema>;
export type QuoteEmailLog = typeof quoteEmailLogs.$inferSelect;

// CRM Invoice Status
export const crmInvoiceStatusEnum = ["draft", "sent", "paid", "void", "partial"] as const;
export type CrmInvoiceStatus = typeof crmInvoiceStatusEnum[number];

// CRM Invoices (can be tied to a Work Order, Project, or standalone)
export const crmInvoices = pgTable("crm_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: varchar("customer_id"),
  propertyId: varchar("property_id"),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").references(() => crmProjects.id, { onDelete: "set null" }),
  status: text("status").$type<CrmInvoiceStatus>().notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  laborTotal: decimal("labor_total", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0"),
  balanceDue: decimal("balance_due", { precision: 10, scale: 2 }).default("0"),
  dueDate: timestamp("due_date"),
  sentAt: timestamp("sent_at"),
  paidAt: timestamp("paid_at"),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => crmUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Invoice Line Items
export const crmInvoiceLineItems = pgTable("crm_invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => crmInvoices.id, { onDelete: "cascade" }),
  lineType: text("line_type").$type<"part" | "labor" | "service" | "other" | "discount">().notNull().default("part"),
  description: text("description").notNull(),
  partNumber: text("part_number"),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  itemId: varchar("item_id").references(() => crmItems.id, { onDelete: "set null" }),
  isDiscountLine: boolean("is_discount_line").default(false),
  discountKind: text("discount_kind").$type<DiscountKind>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Items (parts, services, materials catalog)
// itemType = what it IS (controls quote section placement)
export const crmItemTypeEnum = ["parts", "equipment", "material", "service", "discount", "agreement", "residential", "commercial", "crawlspace"] as const;
export type CrmItemType = typeof crmItemTypeEnum[number];

// category = where it belongs (navigation/filtering)
export const crmItemCategoryEnum = ["install", "service", "maintenance", "discount"] as const;
export type CrmItemCategory = typeof crmItemCategoryEnum[number];

export const discountKindEnum = ["promotion", "maintenance"] as const;
export type DiscountKind = typeof discountKindEnum[number];

export const crmItems = pgTable("crm_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").$type<CrmItemCategory>().default("install"),
  itemType: text("item_type").$type<CrmItemType>().default("parts"),
  partNumber: text("part_number"),
  rate: decimal("rate", { precision: 10, scale: 2 }).default("0"),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  unit: text("unit").default("each"),
  inStock: boolean("in_stock").default(true),
  isActive: boolean("is_active").default(true),
  isVariableRate: boolean("is_variable_rate").default(false),
  isDiscount: boolean("is_discount").default(false),
  discountKind: text("discount_kind").$type<DiscountKind>(),
  isSystemItem: boolean("is_system_item").default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCrmItemSchema = createInsertSchema(crmItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmItem = z.infer<typeof insertCrmItemSchema>;
export type CrmItem = typeof crmItems.$inferSelect;

// CRM Job Assignments (techs assigned to jobs)
export const crmJobAssignments = pgTable("crm_job_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => crmJobs.id, { onDelete: "cascade" }),
  techUserId: varchar("tech_user_id").notNull().references(() => crmUsers.id),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Job Status Events (timeline)
export const crmJobStatusEvents = pgTable("crm_job_status_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => crmJobs.id, { onDelete: "cascade" }),
  status: text("status").$type<CrmJobStatus>().notNull(),
  userId: varchar("user_id").references(() => crmUsers.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Job Notes
export const crmJobNotes = pgTable("crm_job_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => crmJobs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => crmUsers.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Customer Notes
export const crmCustomerNotes = pgTable("crm_customer_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => crmUsers.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Activity Types for Timeline
export const projectActivityTypeEnum = ["note", "photo", "file", "financial_update", "approval", "work_order_created", "work_order_completed", "quote_sent", "quote_accepted", "invoice_sent", "invoice_paid"] as const;
export type ProjectActivityType = typeof projectActivityTypeEnum[number];

// Project Activities (Timeline entries aggregating work order activities)
export const projectActivities = pgTable("project_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => crmProjects.id, { onDelete: "cascade" }),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id, { onDelete: "set null" }),
  userId: varchar("user_id").references(() => crmUsers.id),
  activityType: text("activity_type").$type<ProjectActivityType>().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  metadata: json("metadata").$type<Record<string, any>>(), // For storing additional context like file URLs, old/new status, amounts, etc.
  isPinned: boolean("is_pinned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectActivitySchema = createInsertSchema(projectActivities).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;
export type ProjectActivity = typeof projectActivities.$inferSelect;

// Activity Metadata Schemas (type-specific payloads stored in metadata JSON)
export const activityAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
  tag: z.string().optional(), // For photos: before/after/indoor/outdoor
  category: z.string().optional(), // For files: proposal/invoice/permit/manual/other
});
export type ActivityAttachment = z.infer<typeof activityAttachmentSchema>;

export const noteMetadataSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});
export type NoteMetadata = z.infer<typeof noteMetadataSchema>;

export const photoMetadataSchema = z.object({
  photos: z.array(activityAttachmentSchema).min(1, "At least one photo is required"),
  caption: z.string().optional(),
});
export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;

export const fileMetadataSchema = z.object({
  files: z.array(activityAttachmentSchema).min(1, "At least one file is required"),
  category: z.enum(["proposal", "invoice", "permit", "manual", "other"]).optional(),
  note: z.string().optional(),
});
export type FileMetadata = z.infer<typeof fileMetadataSchema>;

export const financialSubtypeEnum = ["estimate", "invoice", "payment", "credit", "change_order"] as const;
export type FinancialSubtype = typeof financialSubtypeEnum[number];

export const financialMetadataSchema = z.object({
  subtype: z.enum(financialSubtypeEnum),
  amount: z.number(),
  status: z.enum(["pending", "approved", "paid", "cancelled"]).optional(),
  date: z.string().optional(), // ISO date string
  attachments: z.array(activityAttachmentSchema).optional(),
  note: z.string().optional(),
});
export type FinancialMetadata = z.infer<typeof financialMetadataSchema>;

export const approvalStatusEnum = ["requested", "approved", "denied"] as const;
export type ApprovalStatus = typeof approvalStatusEnum[number];

export const approvalMetadataSchema = z.object({
  approverType: z.enum(["pm", "tenant", "owner", "other"]),
  approverName: z.string().optional(),
  status: z.enum(approvalStatusEnum),
  amount: z.number().optional(),
  attachments: z.array(activityAttachmentSchema).optional(),
  note: z.string().optional(),
  previousActivityId: z.string().optional(), // For audit trail
});
export type ApprovalMetadata = z.infer<typeof approvalMetadataSchema>;


// CRM Agreements Status Enum
export const crmAgreementStatusEnum = ["active", "expiring", "expired", "cancelled"] as const;
export type CrmAgreementStatus = typeof crmAgreementStatusEnum[number];

// Agreement Type Enum (standard HVAC maintenance vs custom agreement types)
export const agreementTypeEnum = ["standard", "custom"] as const;
export type AgreementType = typeof agreementTypeEnum[number];

// Agreement Frequency Enum (billing/service period)
export const agreementFrequencyEnum = ["weekly", "monthly", "annual"] as const;
export type AgreementFrequency = typeof agreementFrequencyEnum[number];

// Maintenance Regions (for reminder scheduling by county)
export const maintenanceRegions = pgTable("maintenance_regions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  reminderDayOfMonth: integer("reminder_day_of_month").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaintenanceRegionSchema = createInsertSchema(maintenanceRegions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMaintenanceRegion = z.infer<typeof insertMaintenanceRegionSchema>;
export type MaintenanceRegion = typeof maintenanceRegions.$inferSelect;

// Custom Agreement Types (reusable templates for custom maintenance services)
export const customAgreementTypes = pgTable("custom_agreement_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  frequency: text("frequency").$type<AgreementFrequency>().notNull().default("annual"),
  visitsPerPeriod: integer("visits_per_period").notNull().default(2),
  defaultPrice: decimal("default_price", { precision: 10, scale: 2 }).default("0.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomAgreementTypeSchema = createInsertSchema(customAgreementTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomAgreementType = z.infer<typeof insertCustomAgreementTypeSchema>;
export type CustomAgreementType = typeof customAgreementTypes.$inferSelect;

// CRM Agreements (service/maintenance agreements with customers)
export const crmAgreements = pgTable("crm_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agreementNumber: text("agreement_number").notNull(),
  customerId: varchar("customer_id").references(() => crmCustomers.id),
  propertyId: varchar("property_id").references(() => crmProperties.id),
  customerName: text("customer_name").notNull(),
  agreementPlan: text("agreement_plan").notNull().default("Preventative Maintenance"),
  nextServiceDate: date("next_service_date"),
  nextInvoiceDate: date("next_invoice_date"),
  address: text("address"),
  status: text("status").$type<CrmAgreementStatus>().notNull().default("active"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  contractDate: date("contract_date"),
  appointmentDate: date("appointment_date"),
  numberOfSystems: integer("number_of_systems").notNull().default(1),
  price: decimal("price", { precision: 10, scale: 2 }).default("229.00"),
  frequency: text("frequency").$type<AgreementFrequency>().notNull().default("annual"),
  visitsPerPeriod: integer("visits_per_period").notNull().default(2),
  autoRenew: boolean("auto_renew").notNull().default(true),
  regionId: varchar("region_id").references(() => maintenanceRegions.id),
  agreementType: text("agreement_type").$type<AgreementType>().notNull().default("standard"),
  customAgreementTypeId: varchar("custom_agreement_type_id").references(() => customAgreementTypes.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCrmAgreementSchema = createInsertSchema(crmAgreements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Maintenance Visits (track the 2 visits per year for each agreement)
export const maintenanceVisits = pgTable("maintenance_visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agreementId: varchar("agreement_id").notNull().references(() => crmAgreements.id, { onDelete: "cascade" }),
  visitNumber: integer("visit_number").notNull(),
  cycleYear: integer("cycle_year").notNull(),
  targetDate: date("target_date").notNull(),
  reminderSentAt: timestamp("reminder_sent_at"),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id),
  completedAt: timestamp("completed_at"),
  status: text("status").$type<"pending" | "scheduled" | "completed" | "cancelled">().notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaintenanceVisitSchema = createInsertSchema(maintenanceVisits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMaintenanceVisit = z.infer<typeof insertMaintenanceVisitSchema>;
export type MaintenanceVisit = typeof maintenanceVisits.$inferSelect;

// =============================================
// FLEXIBLE MAINTENANCE AGREEMENT TASKS
// =============================================

// Maintenance Frequency Enum
export const maintenanceFrequencyEnum = ["weekly", "monthly", "quarterly", "yearly", "custom"] as const;
export type MaintenanceFrequency = typeof maintenanceFrequencyEnum[number];

// Maintenance Agreement Tasks - Individual tasks within an agreement
export const maintenanceAgreementTasks = pgTable("maintenance_agreement_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agreementId: varchar("agreement_id").notNull().references(() => crmAgreements.id, { onDelete: "cascade" }),
  taskName: text("task_name").notNull(),
  duration: integer("duration").default(60),
  amount: decimal("amount", { precision: 10, scale: 2 }).default("0.00"),
  requiresConfirmation: boolean("requires_confirmation").default(true),
  allowUpgrade: boolean("allow_upgrade").default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaintenanceAgreementTaskSchema = createInsertSchema(maintenanceAgreementTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMaintenanceAgreementTask = z.infer<typeof insertMaintenanceAgreementTaskSchema>;
export type MaintenanceAgreementTask = typeof maintenanceAgreementTasks.$inferSelect;

// Maintenance Task Schedules - Flexible scheduling rules per task
export const maintenanceTaskSchedules = pgTable("maintenance_task_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => maintenanceAgreementTasks.id, { onDelete: "cascade" }),
  frequency: text("frequency").$type<MaintenanceFrequency>().notNull(),
  intervalValue: integer("interval_value").default(1),
  dayOfMonth: integer("day_of_month"),
  dayOfWeek: integer("day_of_week"),
  activeMonths: integer("active_months").array(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaintenanceTaskScheduleSchema = createInsertSchema(maintenanceTaskSchedules).omit({
  id: true,
  createdAt: true,
});

export type InsertMaintenanceTaskSchedule = z.infer<typeof insertMaintenanceTaskScheduleSchema>;
export type MaintenanceTaskSchedule = typeof maintenanceTaskSchedules.$inferSelect;

// Maintenance Task Equipment - Equipment linked to tasks
export const maintenanceTaskEquipment = pgTable("maintenance_task_equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => maintenanceAgreementTasks.id, { onDelete: "cascade" }),
  equipmentName: text("equipment_name").notNull(),
  make: text("make"),
  model: text("model"),
  serialNumber: text("serial_number"),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaintenanceTaskEquipmentSchema = createInsertSchema(maintenanceTaskEquipment).omit({
  id: true,
  createdAt: true,
});

export type InsertMaintenanceTaskEquipment = z.infer<typeof insertMaintenanceTaskEquipmentSchema>;
export type MaintenanceTaskEquipment = typeof maintenanceTaskEquipment.$inferSelect;

// Maintenance Task Parts - Parts (billable and non-billable) per task
export const maintenanceTaskParts = pgTable("maintenance_task_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => maintenanceAgreementTasks.id, { onDelete: "cascade" }),
  partName: text("part_name").notNull(),
  partNumber: text("part_number"),
  quantity: integer("quantity").default(1),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).default("0.00"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).default("0.00"),
  isBillable: boolean("is_billable").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaintenanceTaskPartSchema = createInsertSchema(maintenanceTaskParts).omit({
  id: true,
  createdAt: true,
});

export type InsertMaintenanceTaskPart = z.infer<typeof insertMaintenanceTaskPartSchema>;
export type MaintenanceTaskPart = typeof maintenanceTaskParts.$inferSelect;

// =============================================
// SERVICE CALL CHECKLISTS
// =============================================

// Service types for checklists
export const serviceCallTypeEnum = [
  "NO_HEAT", "NO_AC", "WATER_LEAK", "STRANGE_NOISE", "THERMOSTAT_ISSUE",
  "MAINTENANCE", "INSTALL", "DUCT_WORK", "OTHER"
] as const;
export type ServiceCallType = typeof serviceCallTypeEnum[number];

// Question types for checklist questions
export const checklistQuestionTypeEnum = ["yes_no", "text", "number", "select"] as const;
export type ChecklistQuestionType = typeof checklistQuestionTypeEnum[number];

// Service Call Checklist Templates
export const serviceCallChecklists = pgTable("service_call_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceType: text("service_type").$type<ServiceCallType>().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertServiceCallChecklistSchema = createInsertSchema(serviceCallChecklists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertServiceCallChecklist = z.infer<typeof insertServiceCallChecklistSchema>;
export type ServiceCallChecklist = typeof serviceCallChecklists.$inferSelect;

// Checklist Questions (linked to checklist templates)
export const checklistQuestions = pgTable("checklist_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checklistId: varchar("checklist_id").notNull().references(() => serviceCallChecklists.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  questionType: text("question_type").$type<ChecklistQuestionType>().notNull().default("text"),
  options: json("options").$type<string[]>(),
  isRequired: boolean("is_required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  helpText: text("help_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChecklistQuestionSchema = createInsertSchema(checklistQuestions).omit({
  id: true,
  createdAt: true,
});

export type InsertChecklistQuestion = z.infer<typeof insertChecklistQuestionSchema>;
export type ChecklistQuestion = typeof checklistQuestions.$inferSelect;

// Work Order Checklist Responses (completed checklists linked to work orders)
export const workOrderChecklistResponses = pgTable("work_order_checklist_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar("work_order_id").notNull().references(() => crmWorkOrders.id, { onDelete: "cascade" }),
  checklistId: varchar("checklist_id").notNull().references(() => serviceCallChecklists.id),
  answers: json("answers").$type<Record<string, string | boolean | number>>().notNull(),
  summary: text("summary"),
  completedBy: varchar("completed_by").references(() => crmUsers.id),
  completedAt: timestamp("completed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkOrderChecklistResponseSchema = createInsertSchema(workOrderChecklistResponses).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkOrderChecklistResponse = z.infer<typeof insertWorkOrderChecklistResponseSchema>;
export type WorkOrderChecklistResponse = typeof workOrderChecklistResponses.$inferSelect;

// CRM Payments (references crmInvoices from above)
export const crmPayments = pgTable("crm_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => crmInvoices.id),
  provider: text("provider").$type<"stripe" | "check" | "cash" | "other">().notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<"pending" | "completed" | "failed" | "refunded">().notNull().default("pending"),
  providerPaymentId: text("provider_payment_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// =============================================
// NEW ACCOUNT + SITE + CONTACT MODEL
// =============================================

// Account Type Enum
export const accountTypeEnum = ["RESIDENTIAL", "PROPERTY_MANAGER", "COMMERCIAL"] as const;
export type AccountType = typeof accountTypeEnum[number];

// Account Status Enum  
export const accountStatusEnum = ["PROSPECT", "ACTIVE", "INACTIVE", "DO_NOT_SERVICE"] as const;
export type AccountStatus = typeof accountStatusEnum[number];

// Contact Role Enum
export const contactRoleEnum = [
  "OWNER", "PM", "TENANT", "AP", "FACILITIES", 
  "DECISION_MAKER", "BILLING", "PRIMARY", "EMERGENCY", "OTHER"
] as const;
export type ContactRole = typeof contactRoleEnum[number];

// Lead Source Enum
export const leadSourceEnum = [
  "WEBSITE", "REFERRAL", "GOOGLE", "FACEBOOK", "YELP", 
  "HOME_ADVISOR", "ANGI", "THUMBTACK", "WALK_IN", "PHONE", 
  "REPEAT_CUSTOMER", "FIELDEDGE", "OTHER"
] as const;
export type LeadSource = typeof leadSourceEnum[number];

// CRM Accounts (replaces crmCustomers conceptually)
export const crmAccounts = pgTable("crm_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: text("display_name").notNull(),
  companyName: text("company_name"),
  accountType: text("account_type").$type<AccountType>().notNull().default("RESIDENTIAL"),
  accountStatus: text("account_status").$type<AccountStatus>().notNull().default("PROSPECT"),
  leadSource: text("lead_source").$type<LeadSource>(),
  parentAccountId: varchar("parent_account_id").references((): any => crmAccounts.id),
  customerSince: date("customer_since"),
  pinnedNote: text("pinned_note"),
  noCallRecording: boolean("no_call_recording").default(false),
  tags: json("tags").$type<string[]>().default([]),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Sites (addresses/locations linked to accounts)
export const crmSites = pgTable("crm_sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => crmAccounts.id, { onDelete: "cascade" }),
  siteName: text("site_name"),
  address1: text("address1").notNull(),
  address2: text("address2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  isPrimary: boolean("is_primary").default(false),
  accessInstructions: text("access_instructions"),
  gateCode: text("gate_code"),
  notes: text("notes"),
  tenantName: text("tenant_name"),
  tenantPhone: text("tenant_phone"),
  tenantEmail: text("tenant_email"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Contacts (people linked to accounts and/or sites)
export const crmContacts = pgTable("crm_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => crmAccounts.id, { onDelete: "cascade" }),
  siteId: varchar("site_id").references(() => crmSites.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  contactRole: text("contact_role").$type<ContactRole>().notNull().default("PRIMARY"),
  isPrimary: boolean("is_primary").default(false),
  isPreferred: boolean("is_preferred").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Residential Profile (one-to-one with account)
export const residentialProfiles = pgTable("residential_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().unique().references(() => crmAccounts.id, { onDelete: "cascade" }),
  membershipPlan: text("membership_plan"),
  membershipStartDate: date("membership_start_date"),
  membershipEndDate: date("membership_end_date"),
  preferredServiceDay: text("preferred_service_day"),
  preferredTimeSlot: text("preferred_time_slot"),
  specialInstructions: text("special_instructions"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Property Manager Profile (one-to-one with account)
export const propertyManagerProfiles = pgTable("property_manager_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().unique().references(() => crmAccounts.id, { onDelete: "cascade" }),
  requiresApprovalBefore: boolean("requires_approval_before").default(false),
  approvalThreshold: decimal("approval_threshold", { precision: 10, scale: 2 }),
  defaultBillingMethod: text("default_billing_method"),
  netTerms: integer("net_terms").default(30),
  managementCompanyName: text("management_company_name"),
  portfolioSize: integer("portfolio_size"),
  billingTerms: text("billing_terms").default("NET_30"), // DUE_ON_RECEIPT, NET_15, NET_30, NET_45, NET_60
  defaultBillTo: text("default_bill_to").default("PM"), // PM, OWNER, TENANT
  mainOfficePhone: text("main_office_phone"),
  mainOfficeEmail: text("main_office_email"),
  billingApEmail: text("billing_ap_email"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Commercial Profile (one-to-one with account)
export const commercialProfiles = pgTable("commercial_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().unique().references(() => crmAccounts.id, { onDelete: "cascade" }),
  taxExempt: boolean("tax_exempt").default(false),
  taxExemptNumber: text("tax_exempt_number"),
  requiresPO: boolean("requires_po").default(false),
  poPrefix: text("po_prefix"),
  netTerms: integer("net_terms").default(30),
  billingAddress: text("billing_address"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingZip: text("billing_zip"),
  w9OnFile: boolean("w9_on_file").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for new Account model
export const insertCrmAccountSchema = createInsertSchema(crmAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmSiteSchema = createInsertSchema(crmSites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmContactSchema = createInsertSchema(crmContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertResidentialProfileSchema = createInsertSchema(residentialProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPropertyManagerProfileSchema = createInsertSchema(propertyManagerProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommercialProfileSchema = createInsertSchema(commercialProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for new Account model
export type InsertCrmAccount = z.infer<typeof insertCrmAccountSchema>;
export type CrmAccount = typeof crmAccounts.$inferSelect;
export type InsertCrmSite = z.infer<typeof insertCrmSiteSchema>;
export type CrmSite = typeof crmSites.$inferSelect;
export type InsertCrmContact = z.infer<typeof insertCrmContactSchema>;
export type CrmContact = typeof crmContacts.$inferSelect;
export type InsertResidentialProfile = z.infer<typeof insertResidentialProfileSchema>;
export type ResidentialProfile = typeof residentialProfiles.$inferSelect;
export type InsertPropertyManagerProfile = z.infer<typeof insertPropertyManagerProfileSchema>;
export type PropertyManagerProfile = typeof propertyManagerProfiles.$inferSelect;
export type InsertCommercialProfile = z.infer<typeof insertCommercialProfileSchema>;
export type CommercialProfile = typeof commercialProfiles.$inferSelect;

// =============================================
// END NEW ACCOUNT MODEL
// =============================================

// Insert schemas for CRM
export const insertCrmUserSchema = createInsertSchema(crmUsers).omit({
  id: true,
  createdAt: true,
});

export const insertCrmCustomerSchema = createInsertSchema(crmCustomers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmPropertySchema = createInsertSchema(crmProperties).omit({
  id: true,
  createdAt: true,
});

export const insertCrmEquipmentSchema = createInsertSchema(crmEquipment).omit({
  id: true,
  createdAt: true,
});

export const insertCrmJobSchema = createInsertSchema(crmJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmProjectSchema = createInsertSchema(crmProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmInvoiceSchema = createInsertSchema(crmInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmPaymentSchema = createInsertSchema(crmPayments).omit({
  id: true,
  createdAt: true,
});

export const insertCrmAuditLogSchema = createInsertSchema(crmAuditLog).omit({
  id: true,
  createdAt: true,
});

export const insertCrmWorkOrderSchema = createInsertSchema(crmWorkOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmInvoiceLineItemSchema = createInsertSchema(crmInvoiceLineItems).omit({
  id: true,
  createdAt: true,
});

export const insertCrmQuoteSchema = createInsertSchema(crmQuotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmFollowUpSchema = createInsertSchema(crmFollowUps).omit({
  id: true,
  createdAt: true,
});

export const insertCrmQuoteLineItemSchema = createInsertSchema(crmQuoteLineItems).omit({
  id: true,
  createdAt: true,
});

// CRM Types
export type InsertCrmUser = z.infer<typeof insertCrmUserSchema>;
export type CrmUser = typeof crmUsers.$inferSelect;
export type CrmSession = typeof crmSessions.$inferSelect;
export type InsertCrmAuditLog = z.infer<typeof insertCrmAuditLogSchema>;
export type CrmAuditLogEntry = typeof crmAuditLog.$inferSelect;
export type InsertCrmCustomer = z.infer<typeof insertCrmCustomerSchema>;
export type CrmCustomer = typeof crmCustomers.$inferSelect;
export type InsertCrmProperty = z.infer<typeof insertCrmPropertySchema>;
export type CrmProperty = typeof crmProperties.$inferSelect;
export type InsertCrmEquipment = z.infer<typeof insertCrmEquipmentSchema>;
export type CrmEquipmentItem = typeof crmEquipment.$inferSelect;
export type InsertCrmJob = z.infer<typeof insertCrmJobSchema>;
export type CrmJob = typeof crmJobs.$inferSelect;
export type InsertCrmProject = z.infer<typeof insertCrmProjectSchema>;
export type CrmProject = typeof crmProjects.$inferSelect;
export type CrmJobAssignment = typeof crmJobAssignments.$inferSelect;
export type CrmJobStatusEvent = typeof crmJobStatusEvents.$inferSelect;
export type CrmJobNote = typeof crmJobNotes.$inferSelect;
export type CrmCustomerNote = typeof crmCustomerNotes.$inferSelect;
export type InsertCrmCustomerNote = typeof crmCustomerNotes.$inferInsert;
export type InsertCrmInvoice = z.infer<typeof insertCrmInvoiceSchema>;
export type CrmInvoice = typeof crmInvoices.$inferSelect;
export type InsertCrmPayment = z.infer<typeof insertCrmPaymentSchema>;
export type CrmPayment = typeof crmPayments.$inferSelect;
export type InsertCrmWorkOrder = z.infer<typeof insertCrmWorkOrderSchema>;
export type CrmWorkOrder = typeof crmWorkOrders.$inferSelect;
export type InsertCrmInvoiceLineItem = z.infer<typeof insertCrmInvoiceLineItemSchema>;
export type CrmInvoiceLineItem = typeof crmInvoiceLineItems.$inferSelect;
export type InsertCrmQuote = z.infer<typeof insertCrmQuoteSchema>;
export type CrmQuote = typeof crmQuotes.$inferSelect;
export type InsertCrmQuoteLineItem = z.infer<typeof insertCrmQuoteLineItemSchema>;
export type CrmQuoteLineItem = typeof crmQuoteLineItems.$inferSelect;
export type InsertCrmFollowUp = z.infer<typeof insertCrmFollowUpSchema>;
export type CrmFollowUp = typeof crmFollowUps.$inferSelect;
export type InsertCrmAgreement = z.infer<typeof insertCrmAgreementSchema>;
export type CrmAgreement = typeof crmAgreements.$inferSelect;

// Weather Cache table for storing weather.gov API data
export const weatherCache = pgTable("weather_cache", {
  id: integer("id").primaryKey().default(1),
  lat: decimal("lat", { precision: 10, scale: 6 }).notNull(),
  lon: decimal("lon", { precision: 10, scale: 6 }).notNull(),
  forecastJson: json("forecast_json").$type<any>(),
  hourlyJson: json("hourly_json").$type<any>(),
  alertsJson: json("alerts_json").$type<any>(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const insertWeatherCacheSchema = createInsertSchema(weatherCache).omit({
  fetchedAt: true,
});

export type InsertWeatherCache = z.infer<typeof insertWeatherCacheSchema>;
export type WeatherCache = typeof weatherCache.$inferSelect;

export const callDaily = pgTable("call_daily", {
  date: date("date").primaryKey(),
  inboundCalls: integer("inbound_calls").notNull().default(0),
  missedCalls: integer("missed_calls").default(0),
  answeredCalls: integer("answered_calls").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const weatherDaily = pgTable("weather_daily", {
  date: date("date").primaryKey(),
  avgTempF: decimal("avg_temp_f", { precision: 5, scale: 2 }),
  maxTempF: decimal("max_temp_f", { precision: 5, scale: 2 }),
  minTempF: decimal("min_temp_f", { precision: 5, scale: 2 }),
  cdd: decimal("cdd", { precision: 5, scale: 2 }).default("0"),
  hdd: decimal("hdd", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CallDaily = typeof callDaily.$inferSelect;
export type WeatherDaily = typeof weatherDaily.$inferSelect;

// Webhook Event table for idempotency (Stripe, Textline, QBO, etc.)
export const webhookProviderEnum = ["stripe", "textline", "qbo", "other"] as const;
export type WebhookProvider = typeof webhookProviderEnum[number];

export const crmWebhookEvents = pgTable("crm_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").$type<WebhookProvider>().notNull(),
  providerEventId: text("provider_event_id").notNull().unique(),
  payloadJson: json("payload_json").$type<Record<string, unknown>>(),
  receivedAt: timestamp("received_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const insertCrmWebhookEventSchema = createInsertSchema(crmWebhookEvents).omit({
  id: true,
  receivedAt: true,
});

export type InsertCrmWebhookEvent = z.infer<typeof insertCrmWebhookEventSchema>;
export type CrmWebhookEvent = typeof crmWebhookEvents.$inferSelect;

// Insert schema for job assignments and notes
export const insertCrmJobAssignmentSchema = createInsertSchema(crmJobAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertCrmJobNoteSchema = createInsertSchema(crmJobNotes).omit({
  id: true,
  createdAt: true,
});

export const insertCrmJobStatusEventSchema = createInsertSchema(crmJobStatusEvents).omit({
  id: true,
  createdAt: true,
});

export const insertCrmSessionSchema = createInsertSchema(crmSessions).omit({
  id: true,
  createdAt: true,
});

export type InsertCrmJobAssignment = z.infer<typeof insertCrmJobAssignmentSchema>;
export type InsertCrmJobNote = z.infer<typeof insertCrmJobNoteSchema>;
export type InsertCrmJobStatusEvent = z.infer<typeof insertCrmJobStatusEventSchema>;
export type InsertCrmSession = z.infer<typeof insertCrmSessionSchema>;

// Attachments table for App Storage files (replaces filesystem storage)
export const attachments = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  projectId: varchar("project_id").references(() => crmProjects.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id").references(() => projectActivities.id, { onDelete: "cascade" }),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: varchar("uploaded_by").references(() => crmUsers.id),
  thumbnailKey: text("thumbnail_key"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  createdAt: true,
});

export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;

// Proposal Builder Sessions (autosave)
export const proposalSessions = pgTable("proposal_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => crmCustomers.id, { onDelete: "cascade" }),
  siteId: varchar("site_id").references(() => crmProperties.id, { onDelete: "set null" }),
  selectionsJson: json("selections_json").$type<{
    systemType?: string;
    tier?: string;
    tonnage?: string;
  }>(),
  cartJson: json("cart_json").$type<unknown[]>(),
  pricingTotalsJson: json("pricing_totals_json").$type<{
    subtotal?: number;
    savings?: number;
    total?: number;
    monthlyPayment?: number;
  }>(),
  aiNotes: text("ai_notes"),
  createdBy: varchar("created_by").references(() => crmUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProposalSessionSchema = createInsertSchema(proposalSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProposalSession = z.infer<typeof insertProposalSessionSchema>;
export type ProposalSession = typeof proposalSessions.$inferSelect;

// Monthly Goals for revenue tracking
export const monthlyGoals = pgTable("monthly_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  dailyServiceGoal: decimal("daily_service_goal", { precision: 10, scale: 2 }).notNull().default("0"),
  dailyInstallGoal: decimal("daily_install_goal", { precision: 10, scale: 2 }).notNull().default("0"),
  dailyMaintenanceGoal: decimal("daily_maintenance_goal", { precision: 10, scale: 2 }).notNull().default("0"),
  monthlyServiceGoal: decimal("monthly_service_goal", { precision: 10, scale: 2 }).notNull().default("0"),
  monthlyInstallGoal: decimal("monthly_install_goal", { precision: 10, scale: 2 }).notNull().default("0"),
  monthlyMaintenanceGoal: decimal("monthly_maintenance_goal", { precision: 10, scale: 2 }).notNull().default("0"),
  monthlySalesGoal: decimal("monthly_sales_goal", { precision: 10, scale: 2 }).notNull().default("0"),
  budgetedMonthlySalesGoal: decimal("budgeted_monthly_sales_goal", { precision: 12, scale: 2 }).notNull().default("0"),
  serviceWorkDays: integer("service_work_days").notNull().default(22),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMonthlyGoalSchema = createInsertSchema(monthlyGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMonthlyGoal = z.infer<typeof insertMonthlyGoalSchema>;
export type MonthlyGoal = typeof monthlyGoals.$inferSelect;
