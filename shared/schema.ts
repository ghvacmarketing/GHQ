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
  tax: number;
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
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
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

export type InsertCallLogDay = z.infer<typeof insertCallLogDaySchema>;
export type CallLogDay = typeof callLogDays.$inferSelect;
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type CallLog = typeof callLogs.$inferSelect;

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
export const crmUserRoleEnum = ["owner", "manager", "dispatcher", "sales", "tech", "viewer"] as const;
export type CrmUserRole = typeof crmUserRoleEnum[number];

// CRM Users
export const crmUsers = pgTable("crm_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").$type<CrmUserRole>().notNull().default("viewer"),
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

// CRM Customers
export const crmCustomers = pgTable("crm_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  customerType: text("customer_type").$type<CrmCustomerType>().default("residential"),
  customerStatus: text("customer_status").$type<CrmCustomerStatus>().default("client"),
  tags: json("tags").$type<string[]>().default([]),
  notes: text("notes"),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
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

// Job Status Enum
export const crmJobStatusEnum = ["new", "scheduled", "dispatched", "en_route", "on_site", "completed", "invoiced", "paid", "cancelled"] as const;
export type CrmJobStatus = typeof crmJobStatusEnum[number];

// WorkOrder Status Enum  
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

// CRM Work Orders (scheduled visits linked to jobs)
export const crmWorkOrders = pgTable("crm_work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => crmJobs.id, { onDelete: "cascade" }),
  workOrderNumber: integer("work_order_number").notNull().default(1),
  assignedTechId: varchar("assigned_tech_id").references(() => crmUsers.id),
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  status: text("status").$type<WorkOrderStatus>().notNull().default("scheduled"),
  checklist: json("checklist").$type<{ item: string; completed: boolean }[]>(),
  partsUsed: json("parts_used").$type<{ partId: string; name: string; qty: number; price: number }[]>(),
  techNotes: text("tech_notes"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

// Invoice Status Enum
export const crmInvoiceStatusEnum = ["draft", "sent", "viewed", "partial", "paid", "void"] as const;
export type CrmInvoiceStatus = typeof crmInvoiceStatusEnum[number];

// CRM Invoices
export const crmInvoices = pgTable("crm_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  jobId: varchar("job_id").references(() => crmJobs.id),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id),
  customerId: varchar("customer_id").references(() => crmCustomers.id),
  // Standalone customer info (when not linked to crmCustomers)
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  serviceAddress: text("service_address"),
  description: text("description"),
  status: text("status").$type<CrmInvoiceStatus>().notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  balanceDue: decimal("balance_due", { precision: 10, scale: 2 }).notNull(),
  pdfUrl: text("pdf_url"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Invoice Line Items
export const crmInvoiceLineItems = pgTable("crm_invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => crmInvoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Payments
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
// CRM QUOTES (Separate from AI Quote Generator)
// =============================================

export const crmQuoteStatusEnum = ["draft", "sent", "viewed", "accepted", "declined", "expired"] as const;
export type CrmQuoteStatus = typeof crmQuoteStatusEnum[number];

export const crmQuotes = pgTable("crm_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteNumber: text("quote_number").notNull().unique(),
  jobId: varchar("job_id").references(() => crmJobs.id),
  accountId: varchar("account_id").references(() => crmAccounts.id),
  siteId: varchar("site_id").references(() => crmSites.id),
  contactId: varchar("contact_id").references(() => crmContacts.id),
  // Customer info (can be standalone without linked entities)
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  serviceAddress: text("service_address"),
  // Quote details
  title: text("title"),
  description: text("description"),
  lineItems: json("line_items").$type<CrmQuoteLineItem[]>().default([]),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).default("0.0825"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  laborTotal: decimal("labor_total", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  // Status and workflow
  status: text("status").$type<CrmQuoteStatus>().notNull().default("draft"),
  validUntil: timestamp("valid_until"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  // Assignment
  createdById: varchar("created_by_id").references(() => crmUsers.id),
  assignedToId: varchar("assigned_to_id").references(() => crmUsers.id),
  // Notes
  internalNotes: text("internal_notes"),
  customerNotes: text("customer_notes"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CrmQuoteLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  type: "part" | "labor" | "service" | "other";
  partNumber?: string;
};

export const insertCrmQuoteSchema = createInsertSchema(crmQuotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmQuote = z.infer<typeof insertCrmQuoteSchema>;
export type CrmQuote = typeof crmQuotes.$inferSelect;

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
