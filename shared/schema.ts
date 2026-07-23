import { sql } from "drizzle-orm";
import type {
  AutomationTrigger,
  AutomationCondition,
  AutomationAction,
  AutomationTiming,
  AutomationSafeguards,
} from "./automation";

import {
  pgTable,
  text,
  varchar,
  decimal,
  timestamp,
  boolean,
  json,
  integer,
  date,
  doublePrecision,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// Postgres bytea (raw binary) column type for storing uploaded file bytes.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// Uploaded objects (e-signature PDFs, etc.) stored directly in the app DB so
// file uploads work on any deployment without a separate object-storage service.
// See server/replit_integrations/object_storage/objectStorage.ts (DB backend).
export const objectStore = pgTable("object_store", {
  key: varchar("key").primaryKey(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  data: bytea("data").notNull(),
  size: integer("size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});


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
  // Parent/Sub-account relationship
  parentCustomerId: varchar("parent_customer_id"), // Reference to parent account (null = main account)
  billToParent: boolean("bill_to_parent").default(false), // If true, bill the parent account instead
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
// supervisor: Desktop CRM (admin-level) + enhanced mobile (view all techs, self-assign, edit own)
// tech: Mobile access only
export const crmUserRoleEnum = ["owner", "admin", "supervisor", "sales", "tech"] as const;
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
  // Dispatch-board membership override. null = role default (tech/supervisor
  // on, everyone else off); true/false forces membership either way.
  onDispatchBoard: boolean("on_dispatch_board"),
  // Gmail (Google Workspace) connection for sending/reading email in the CRM.
  // Refresh token is AES-256-GCM encrypted at rest.
  gmailAddress: text("gmail_address"),
  gmailRefreshTokenEnc: text("gmail_refresh_token_enc"),
  gmailConnectedAt: timestamp("gmail_connected_at"),
  gmailHistoryId: text("gmail_history_id"), // last synced Gmail historyId
  gmailSyncEnabled: boolean("gmail_sync_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Whether a user appears on the dispatch board (and mobile tech rosters). */
export function isOnDispatchBoard(u: { role: string; onDispatchBoard?: boolean | null }): boolean {
  if (u.onDispatchBoard != null) return u.onDispatchBoard;
  return u.role === "tech" || u.role === "supervisor";
}

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

// Bouncie OAuth Settings (stored in database for security)
export const bouncieSettings = pgTable("bouncie_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorizationCode: text("authorization_code"),
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  connectedAt: timestamp("connected_at"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bouncie Vehicle Tracking
export const bouncieVehicles = pgTable("bouncie_vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").references(() => crmUsers.id, { onDelete: "set null" }),
  technicianName: text("technician_name"),
  deviceId: text("device_id"),
  imei: text("imei"),
  vehicleName: text("vehicle_name").notNull(),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleYear: text("vehicle_year"),
  licensePlate: text("license_plate"),
  vin: text("vin"),
  nickname: text("nickname"),
  lastLatitude: decimal("last_latitude", { precision: 10, scale: 7 }),
  lastLongitude: decimal("last_longitude", { precision: 10, scale: 7 }),
  lastLocationUpdatedAt: timestamp("last_location_updated_at"),
  lastSpeed: decimal("last_speed", { precision: 5, scale: 1 }),
  lastHeading: integer("last_heading"),
  odometer: decimal("odometer", { precision: 10, scale: 1 }),
  fuelLevel: decimal("fuel_level", { precision: 5, scale: 2 }),
  isRunning: boolean("is_running").default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Customer Type and Status Enums
export const crmCustomerTypeEnum = ["residential", "commercial", "property_manager"] as const;
export type CrmCustomerType = typeof crmCustomerTypeEnum[number];

// A converted prospect is a "customer" (was previously "client" — renamed so the
// stored value matches the UI, which only ever labels it "Customer").
export const crmCustomerStatusEnum = ["prospect", "customer"] as const;
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
  customerStatus: text("customer_status").$type<CrmCustomerStatus>().default("customer"),
  fullAddress: text("full_address"),
  leadSource: text("lead_source"),
  tags: json("tags").$type<string[]>().default([]),
  notes: text("notes"),
  portalEnabled: boolean("portal_enabled").default(false).notNull(),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  // Parent/Sub-account relationship
  parentCustomerId: varchar("parent_customer_id"), // Reference to parent account (null = main account)
  billToParent: boolean("bill_to_parent").default(false), // If true, bill the parent account instead
  // Prospect funnel fields
  salesStage: text("sales_stage").$type<SalesStage>(),
  interestLevel: text("interest_level").$type<InterestLevel>(),
  potentialValue: integer("potential_value"),
  assignedSalesRepId: varchar("assigned_sales_rep_id"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastReviewRequestAt: timestamp("last_review_request_at"),
  // Protection Plan membership (set when a quote with a protection bundle is accepted)
  protectionPlanLevel: text("protection_plan_level"), // "basic" | "standard" | "advanced" | "elite" | null
  protectionPlanSince: timestamp("protection_plan_since"),
}, (table) => ({
  customerTypeIdx: index("crm_customers_customer_type_idx").on(table.customerType),
  customerStatusIdx: index("crm_customers_customer_status_idx").on(table.customerStatus),
  parentCustomerIdx: index("crm_customers_parent_customer_idx").on(table.parentCustomerId),
}));

// Property Type Enum - for QuickBooks class determination
export const propertyTypeEnum = ["residential", "commercial"] as const;
export type PropertyType = typeof propertyTypeEnum[number];

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
  // Property type for QuickBooks class determination (defaults from customer type)
  propertyType: text("property_type").$type<PropertyType>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Govee H5103 humidity/temperature sensors ────────────────────────────────
export const goveeSensorLocationEnum = [
  "crawlspace", "attic", "living_room", "basement", "garage", "kitchen", "bedroom", "mechanical_room", "other",
] as const;
export type GoveeSensorLocation = (typeof goveeSensorLocationEnum)[number];

// One durable row per Govee device, mapped (manually) to a CRM property/customer.
export const goveeSensors = pgTable("govee_sensors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  device: text("device").notNull().unique(), // Govee MAC-style device id
  sku: text("sku").notNull(), // e.g. "H5103"
  deviceName: text("device_name"), // name from Govee cloud
  label: text("label"), // user-facing label, e.g. "Crawlspace Sensor"
  locationType: text("location_type").$type<GoveeSensorLocation>(),
  propertyId: varchar("property_id").references(() => crmProperties.id, { onDelete: "set null" }),
  customerId: varchar("customer_id").references(() => crmCustomers.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  // Cached latest state (so cards render without scanning readings)
  lastTemperatureF: decimal("last_temperature_f", { precision: 6, scale: 2 }),
  lastHumidity: decimal("last_humidity", { precision: 5, scale: 2 }),
  lastOnline: boolean("last_online"),
  lastReadingAt: timestamp("last_reading_at"),
  // Per-sensor alert thresholds (spec defaults)
  humidityWatch: decimal("humidity_watch", { precision: 5, scale: 2 }).default("60"),
  humidityHigh: decimal("humidity_high", { precision: 5, scale: 2 }).default("65"),
  humidityCritical: decimal("humidity_critical", { precision: 5, scale: 2 }).default("75"),
  tempLowF: decimal("temp_low_f", { precision: 6, scale: 2 }).default("40"),
  tempHighF: decimal("temp_high_f", { precision: 6, scale: 2 }), // configurable; null = disabled
  // Calibration offsets — the Govee Platform API returns the RAW reading, while
  // the Govee app can show a user-calibrated value. These offsets are added to
  // the raw reading so the CRM matches the app exactly.
  tempOffsetF: decimal("temp_offset_f", { precision: 5, scale: 2 }).notNull().default("0"),
  humidityOffset: decimal("humidity_offset", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  propertyIdx: index("govee_sensors_property_idx").on(table.propertyId),
  customerIdx: index("govee_sensors_customer_idx").on(table.customerId),
}));

// Time-series readings for graphs (polled every few minutes).
export const goveeSensorReadings = pgTable("govee_sensor_readings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sensorId: varchar("sensor_id").notNull().references(() => goveeSensors.id, { onDelete: "cascade" }),
  temperatureF: decimal("temperature_f", { precision: 6, scale: 2 }),
  humidity: decimal("humidity", { precision: 5, scale: 2 }),
  online: boolean("online").notNull().default(true),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
}, (table) => ({
  sensorTimeIdx: index("govee_readings_sensor_time_idx").on(table.sensorId, table.recordedAt),
}));

// Alert events (open/acknowledged/resolved) for dedup + history.
export const goveeSensorAlerts = pgTable("govee_sensor_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sensorId: varchar("sensor_id").notNull().references(() => goveeSensors.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // humidity_critical | humidity_high_sustained | offline | temp_low | temp_high
  severity: text("severity").notNull(), // watch | high | critical
  message: text("message").notNull(),
  value: decimal("value", { precision: 6, scale: 2 }),
  status: text("status").notNull().default("open"), // open | acknowledged | resolved
  recommendedAction: text("recommended_action"),
  notificationId: varchar("notification_id"),
  openedAt: timestamp("opened_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  sensorStatusIdx: index("govee_alerts_sensor_status_idx").on(table.sensorId, table.status),
}));

export const insertGoveeSensorSchema = createInsertSchema(goveeSensors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertGoveeSensorReadingSchema = createInsertSchema(goveeSensorReadings).omit({ id: true });
export const insertGoveeSensorAlertSchema = createInsertSchema(goveeSensorAlerts).omit({
  id: true,
  openedAt: true,
  resolvedAt: true,
});
export type GoveeSensor = typeof goveeSensors.$inferSelect;
export type InsertGoveeSensor = z.infer<typeof insertGoveeSensorSchema>;
export type GoveeSensorReading = typeof goveeSensorReadings.$inferSelect;
export type GoveeSensorAlert = typeof goveeSensorAlerts.$inferSelect;

// CRM Lead Types (configurable lead/opportunity types)
export const crmLeadTypes = pgTable("crm_lead_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lead Temperature Options (admin-configurable 1-5 scale)
export const crmLeadTempOptions = pgTable("crm_lead_temp_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numericValue: integer("numeric_value").notNull().unique(), // 1-5
  label: text("label").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Customer Driver Options (admin-configurable categories)
export const crmLeadDriverOptions = pgTable("crm_lead_driver_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Leads (multiple leads/opportunities per customer)
export const crmLeads = pgTable("crm_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
  leadTypeId: varchar("lead_type_id").references(() => crmLeadTypes.id),
  leadTempId: varchar("lead_temp_id").references(() => crmLeadTempOptions.id),
  leadDriverId: varchar("lead_driver_id").references(() => crmLeadDriverOptions.id),
  potentialValue: integer("potential_value"),
  assignedSalesRepId: varchar("assigned_sales_rep_id").references(() => crmUsers.id),
  interestLevel: text("interest_level").$type<InterestLevel>(),
  salesStage: text("sales_stage").$type<SalesStage>().notNull().default("new"),
  notes: text("notes"),
  wonAt: timestamp("won_at"),
  lostAt: timestamp("lost_at"),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  customerIdIdx: index("crm_leads_customer_id_idx").on(table.customerId),
  salesStageIdx: index("crm_leads_sales_stage_idx").on(table.salesStage),
}));

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
export const projectStatusEnum = ["lead", "proposal_sent", "equipment_ordered", "equipment_arrived", "in_progress", "completed", "closed", "cancelled", "archived"] as const;
export type ProjectStatus = typeof projectStatusEnum[number];

// Project Type Enum
export const projectTypeEnum = ["INSTALL", "DUCT", "COMMERCIAL", "CRAWLSPACE", "MAJOR_REPAIR"] as const;
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
  priority: text("priority").$type<"low" | "normal" | "high">().default("normal"),
  description: text("description"),
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  customerIdIdx: index("crm_jobs_customer_id_idx").on(table.customerId),
  statusIdx: index("crm_jobs_status_idx").on(table.status),
}));

// CRM Projects (big-ticket scope containers - $5k+ jobs)
// Equipment/Materials item type for projects (used for job costing)
export type ProjectEquipmentItem = {
  id: string;
  name: string;
  quantity: number;
  modelNumber?: string;
  notes?: string;
  unitCost?: number; // Cost per unit in dollars
  vendor?: string;
  purchaseOrder?: string;
  date?: string; // ISO date string
  itemType?: "material" | "equipment"; // For categorization
};

export const crmProjects = pgTable("crm_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectNumber: integer("project_number").unique(),
  customerId: varchar("customer_id"),
  propertyId: varchar("property_id"),
  projectType: text("project_type").$type<ProjectType>().notNull(),
  status: text("status").$type<ProjectStatus>().notNull().default("lead"),
  title: text("title").notNull(),
  description: text("description"),
  expectedValue: decimal("expected_value", { precision: 10, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 10, scale: 2 }),
  priority: text("priority").$type<"low" | "normal" | "high">().default("normal"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  equipmentInfo: text("equipment_info"),
  scopeOfWork: text("scope_of_work"),
  challengePoints: text("challenge_points"),
  equipmentMaterials: json("equipment_materials").$type<ProjectEquipmentItem[]>().default([]),
  overheadPercent: decimal("overhead_percent", { precision: 5, scale: 2 }),
  commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }),
  proposalSentAt: timestamp("proposal_sent_at"),
  approvedAt: timestamp("approved_at"),
  completedAt: timestamp("completed_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Install Planner — tentative pre-sale "pencil-in" blocks ──────────────────
// A lightweight, all-day capacity hold placed on the planner BEFORE a job is
// sold. Minimum is just a title + date range; optionally linked to a customer/
// quote. When the job sells it converts into (or links to) a real crm_project.
export const installPlanStatusEnum = ["tentative", "sold", "lost"] as const;
export type InstallPlanStatus = typeof installPlanStatusEnum[number];

export const installPlanBlocks = pgTable("install_plan_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  status: text("status").$type<InstallPlanStatus>().notNull().default("tentative"),
  startDate: date("start_date").notNull(), // YYYY-MM-DD, all-day
  endDate: date("end_date").notNull(),
  customerId: varchar("customer_id"), // optional (no FK, mirrors crm_projects)
  quoteId: varchar("quote_id"), // optional link to the quote/proposal
  projectId: varchar("project_id"), // set when sold → the created/linked project
  crewId: varchar("crew_id"), // dispatch-board user assigned to run the install; null = unassigned
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  confidence: text("confidence").$type<"high" | "medium" | "low">(),
  notes: text("notes"),
  color: text("color"),
  createdBy: varchar("created_by"),
  soldAt: timestamp("sold_at"),
  lostAt: timestamp("lost_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  dateIdx: index("install_plan_blocks_date_idx").on(table.startDate, table.endDate),
}));

export const insertInstallPlanBlockSchema = createInsertSchema(installPlanBlocks).omit({
  id: true, createdAt: true, updatedAt: true, soldAt: true, lostAt: true,
});
export type InstallPlanBlock = typeof installPlanBlocks.$inferSelect;
export type InsertInstallPlanBlock = z.infer<typeof insertInstallPlanBlockSchema>;

// Install crews — planner-specific crew list managed inside the Install
// Planner (separate from dispatch-board users/technicians).
export const installCrews = pgTable("install_crews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export type InstallCrew = typeof installCrews.$inferSelect;

// Dispatch blackouts — painted time blocks on the dispatch board that reserve a
// technician's time so no work order can be scheduled or dragged into them.
export const dispatchBlackouts = pgTable("dispatch_blackouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  techId: varchar("tech_id").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  reason: text("reason"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  techIdx: index("dispatch_blackouts_tech_idx").on(table.techId, table.startAt),
}));
export type DispatchBlackout = typeof dispatchBlackouts.$inferSelect;

// CRM Project Tasks (admin task list for project management)
export const crmProjectTasks = pgTable("crm_project_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => crmProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  assignedUserId: varchar("assigned_user_id").references(() => crmUsers.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  sortOrder: integer("sort_order").default(0),
  createdBy: varchar("created_by").references(() => crmUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("crm_project_tasks_project_id_idx").on(table.projectId),
  assignedUserIdIdx: index("crm_project_tasks_assigned_user_id_idx").on(table.assignedUserId),
  dueDateIdx: index("crm_project_tasks_due_date_idx").on(table.dueDate),
}));

export const insertCrmProjectTaskSchema = createInsertSchema(crmProjectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCrmProjectTask = z.infer<typeof insertCrmProjectTaskSchema>;
export type CrmProjectTask = typeof crmProjectTasks.$inferSelect;

// CRM Work Orders (standalone scheduled visits - can optionally link to projects)
// Work Order Visit Types (appointment purpose)
export const workOrderVisitTypeEnum = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;
export type WorkOrderVisitType = typeof workOrderVisitTypeEnum[number];

// Work Order Subtypes - dynamic configuration stored in database
export const workOrderSubtypes = pgTable("work_order_subtypes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitType: text("visit_type").$type<WorkOrderVisitType>().notNull(),
  subtype: text("subtype").notNull(),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkOrderSubtypeSchema = createInsertSchema(workOrderSubtypes).omit({
  id: true,
  createdAt: true,
});
export type InsertWorkOrderSubtype = z.infer<typeof insertWorkOrderSubtypeSchema>;
export type WorkOrderSubtype = typeof workOrderSubtypes.$inferSelect;

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
  "CallbackPriority",
  "PartsNeeded",
  "PartsOrdered",
  "PartsArrived",
  "Scheduled"
] as const;
export type DispatchQueueStage = typeof dispatchQueueStageEnum[number];

export const immediateActionEnum = ["create_now", "schedule_later"] as const;
export type ImmediateAction = typeof immediateActionEnum[number];

// Pending Reason - why a tech is waiting during a job
export const pendingReasonEnum = [
  "waiting_on_parts",
  "waiting_on_customer", 
  "waiting_for_next_job",
  "lunch_break",
  "other"
] as const;
export type PendingReason = typeof pendingReasonEnum[number];

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
  priority: text("priority").$type<"low" | "normal" | "high">().default("normal"),
  dispatchQueueStage: text("dispatch_queue_stage").$type<DispatchQueueStage>(),
  checklist: json("checklist").$type<{ item: string; completed: boolean }[]>(),
  // Template the tech fills in the field; null = dispatcher toggled it off
  assignedChecklistId: varchar("assigned_checklist_id"),
  partsUsed: json("parts_used").$type<{ partId: string; name: string; qty: number; price: number }[]>(),
  techNotes: text("tech_notes"),
  completionSummary: text("completion_summary"),
  photos: json("photos").$type<{ id: string; url: string; objectPath: string; filename: string; uploadedAt: string }[]>(),
  billingDisposition: text("billing_disposition").$type<BillingDisposition>(),
  billingNotes: text("billing_notes"),
  dispatchNotes: text("dispatch_notes"),
  invoiceId: varchar("invoice_id"),
  sourceQuoteId: varchar("source_quote_id").references(() => crmQuotes.id, { onDelete: "set null" }),
  dispatchedAt: timestamp("dispatched_at"),
  enRouteAt: timestamp("en_route_at"),
  onSiteAt: timestamp("on_site_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  finalizedAt: timestamp("finalized_at"),
  isPending: boolean("is_pending").default(false),
  pendingReason: text("pending_reason").$type<PendingReason>(),
  pendingStartedAt: timestamp("pending_started_at"),
  totalPendingMinutes: integer("total_pending_minutes").default(0),
  isHistorical: boolean("is_historical").default(false),
  fieldEdgeWoNumber: text("field_edge_wo_number"),
  bookingSource: text("booking_source").$type<"phone" | "online" | "walk_in" | "referral">(),
  preferredTimeSlot: text("preferred_time_slot"),
  bookingConfirmationSentAt: timestamp("booking_confirmation_sent_at"),
  bookingReminderSentAt: timestamp("booking_reminder_sent_at"),
  immediateAction: text("immediate_action").$type<ImmediateAction>(),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assignedTechIdIdx: index("crm_work_orders_assigned_tech_id_idx").on(table.assignedTechId),
  statusIdx: index("crm_work_orders_status_idx").on(table.status),
  scheduledStartIdx: index("crm_work_orders_scheduled_start_idx").on(table.scheduledStart),
  customerIdIdx: index("crm_work_orders_customer_id_idx").on(table.customerId),
  projectIdIdx: index("crm_work_orders_project_id_idx").on(table.projectId),
  createdAtIdx: index("crm_work_orders_created_at_idx").on(table.createdAt),
}));

// CRM Quote Status and Scope
export const crmQuoteStatusEnum = ["draft", "sent", "accepted", "declined", "expired", "converted"] as const;
export type CrmQuoteStatus = typeof crmQuoteStatusEnum[number];

export const crmQuoteScopeEnum = ["work_order", "project", "standalone"] as const;
export type CrmQuoteScope = typeof crmQuoteScopeEnum[number];

export const crmQuoteTypeEnum = ["quick", "proposal", "custom_install", "custom_service"] as const;
export type CrmQuoteType = typeof crmQuoteTypeEnum[number];

// Quote Category for email routing (install = sales assigned, service = admin assigned)
export const quoteCategoryEnum = ["install", "service"] as const;
export type QuoteCategory = typeof quoteCategoryEnum[number];

// Quote Source Type - tracks where the quote was created from
export const quoteSourceTypeEnum = ["lead", "customer", "work_order", "project"] as const;
export type QuoteSourceType = typeof quoteSourceTypeEnum[number];

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
  viewCount: integer("view_count").default(0),
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
  sourceType: text("source_type").$type<QuoteSourceType>(),
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
  quoteType: text("quote_type").$type<CrmQuoteType>(),
  // Customer viewing and e-signature fields
  viewToken: text("view_token"),
  // Portal exposure: listed in the customer portal at all, and whether the
  // customer may open the full quote (and sign it) from the portal
  portalVisible: boolean("portal_visible").notNull().default(true),
  portalCanView: boolean("portal_can_view").notNull().default(false),
  signatureImage: text("signature_image"),
  signerName: text("signer_name"),
  signerIp: text("signer_ip"),
  signedAt: timestamp("signed_at"),
  // Email routing fields
  quoteCategory: text("quote_category").$type<QuoteCategory>(),
  // Deposit payment tracking
  depositPaidAt: timestamp("deposit_paid_at"),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripePaymentLinkId: text("stripe_payment_link_id"),
  // Link to auto-generated deposit invoice
  depositInvoiceId: varchar("deposit_invoice_id"),
}, (table) => ({
  statusIdx: index("crm_quotes_status_idx").on(table.status),
  customerIdIdx: index("crm_quotes_customer_id_idx").on(table.customerId),
  createdAtIdx: index("crm_quotes_created_at_idx").on(table.createdAt),
}));


// CRM Quote Line Items
export const crmQuoteLineItems = pgTable("crm_quote_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => crmQuotes.id, { onDelete: "cascade" }),
  lineType: text("line_type").$type<"part" | "labor" | "service" | "other" | "discount" | "install" | "maintenance" | "protection">().notNull().default("part"),
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
  imageUrl: text("image_url"),
  // QuickBooks sub-account override - if null, calculated from item category + property type
  quickbooksSubAccountId: varchar("quickbooks_sub_account_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Quote Email Logs - tracks email sends for quotes
export const quoteEmailLogsStatusEnum = ["pending", "sent", "failed", "bounced", "received"] as const;
export type QuoteEmailLogStatus = typeof quoteEmailLogsStatusEnum[number];

export const quoteEmailDirectionEnum = ["outgoing", "incoming", "system"] as const;
export type QuoteEmailDirection = typeof quoteEmailDirectionEnum[number];

export const quoteEmailLogs = pgTable("quote_email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => crmQuotes.id, { onDelete: "cascade" }),
  direction: text("direction").$type<QuoteEmailDirection>().notNull().default("outgoing"),
  fromEmail: text("from_email"),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  subject: text("subject").notNull(),
  htmlContent: text("html_content"),
  textContent: text("text_content"),
  status: text("status").$type<QuoteEmailLogStatus>().notNull().default("pending"),
  errorMessage: text("error_message"),
  sentBy: varchar("sent_by"),
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  personalMessage: text("personal_message"),
  isManual: boolean("is_manual").default(false),
  resendMessageId: text("resend_message_id"),
  replyToEmail: text("reply_to_email"),
});

export const insertQuoteEmailLogSchema = createInsertSchema(quoteEmailLogs).omit({
  id: true,
  sentAt: true,
});

export type InsertQuoteEmailLog = z.infer<typeof insertQuoteEmailLogSchema>;
export type QuoteEmailLog = typeof quoteEmailLogs.$inferSelect;

// CRM Invoice Status
export const crmInvoiceStatusEnum = ["draft", "sent", "viewed", "paid", "void", "partial"] as const;
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
  stripePaymentLinkId: text("stripe_payment_link_id"),
  stripePaymentLinkUrl: text("stripe_payment_link_url"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => crmUsers.id),
  // Deposit invoice tracking
  isDepositInvoice: boolean("is_deposit_invoice").default(false),
  quoteId: varchar("quote_id"),
  // Whether this invoice appears in the customer portal
  portalVisible: boolean("portal_visible").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  viewedAt: timestamp("viewed_at"),
  viewCount: integer("view_count").default(0),
  // Payment link click tracking
  paymentLinkClickCount: integer("payment_link_click_count").default(0),
  lastPaymentLinkClickedAt: timestamp("last_payment_link_clicked_at"),
  // FieldEdge import tracking
  isHistorical: boolean("is_historical").default(false),
  fieldEdgeInvoiceNumber: text("field_edge_invoice_number"),
  fieldEdgeWoNumber: text("field_edge_wo_number"),
  // Short public view token for client-facing links
  viewToken: text("view_token"),
}, (table) => ({
  statusIdx: index("crm_invoices_status_idx").on(table.status),
  customerIdIdx: index("crm_invoices_customer_id_idx").on(table.customerId),
  workOrderIdIdx: index("crm_invoices_work_order_id_idx").on(table.workOrderId),
  createdAtIdx: index("crm_invoices_created_at_idx").on(table.createdAt),
}));

// CRM Invoice Line Items
export const crmInvoiceLineItems = pgTable("crm_invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => crmInvoices.id, { onDelete: "cascade" }),
  lineType: text("line_type").$type<"part" | "labor" | "service" | "other" | "discount" | "install" | "maintenance" | "protection">().notNull().default("part"),
  description: text("description").notNull(),
  partNumber: text("part_number"),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  itemId: varchar("item_id").references(() => crmItems.id, { onDelete: "set null" }),
  isDiscountLine: boolean("is_discount_line").default(false),
  discountKind: text("discount_kind").$type<DiscountKind>(),
  // QuickBooks sub-account override - if null, calculated from item category + property type
  quickbooksSubAccountId: varchar("quickbooks_sub_account_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Invoice Email Logs - tracks email sends for invoices
export const invoiceEmailLogsStatusEnum = ["pending", "sent", "failed", "bounced", "received"] as const;
export type InvoiceEmailLogStatus = typeof invoiceEmailLogsStatusEnum[number];

export const invoiceEmailDirectionEnum = ["outgoing", "incoming", "system"] as const;
export type InvoiceEmailDirection = typeof invoiceEmailDirectionEnum[number];

export const invoiceEmailLogs = pgTable("invoice_email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => crmInvoices.id, { onDelete: "cascade" }),
  direction: text("direction").$type<InvoiceEmailDirection>().notNull().default("outgoing"),
  fromEmail: text("from_email"),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  subject: text("subject").notNull(),
  htmlContent: text("html_content"),
  textContent: text("text_content"),
  status: text("status").$type<InvoiceEmailLogStatus>().notNull().default("pending"),
  errorMessage: text("error_message"),
  sentBy: varchar("sent_by"),
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  personalMessage: text("personal_message"),
  isManual: boolean("is_manual").default(false),
  resendMessageId: text("resend_message_id"),
  replyToEmail: text("reply_to_email"),
});

export const insertInvoiceEmailLogSchema = createInsertSchema(invoiceEmailLogs).omit({
  id: true,
  sentAt: true,
});

export type InsertInvoiceEmailLog = z.infer<typeof insertInvoiceEmailLogSchema>;
export type InvoiceEmailLog = typeof invoiceEmailLogs.$inferSelect;

// CRM Items (parts, services, materials catalog)
// itemType = what it IS (controls quote section placement)
export const crmItemTypeEnum = ["parts", "equipment", "material", "service", "discount", "agreement", "residential", "commercial", "crawlspace"] as const;
export type CrmItemType = typeof crmItemTypeEnum[number];

// category = where it belongs (navigation/filtering)
export const crmItemCategoryEnum = ["install", "service", "maintenance", "discount", "protection", "field_edge"] as const;
export type CrmItemCategory = typeof crmItemCategoryEnum[number];

export const discountKindEnum = ["promotion", "maintenance", "protection"] as const;
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
}, (table) => ({
  techUserIdIdx: index("crm_job_assignments_tech_user_id_idx").on(table.techUserId),
  jobIdIdx: index("crm_job_assignments_job_id_idx").on(table.jobId),
}));

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
export const projectActivityTypeEnum = ["equipment_status", "photo", "file", "financial_update", "approval", "work_order_created", "work_order_completed", "quote_sent", "quote_accepted", "invoice_sent", "invoice_paid"] as const;
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
export const crmAgreementStatusEnum = ["pending", "active", "grace_period", "expired", "cancelled"] as const;
export type CrmAgreementStatus = typeof crmAgreementStatusEnum[number];

// Billing Preference Enum (how customer wants to be billed)
export const billingPreferenceEnum = ["auto_invoice", "pay_on_visit"] as const;
export type BillingPreference = typeof billingPreferenceEnum[number];

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
  // Billing cadence ("frequency") is decoupled from how scheduled visits are spread.
  // When null, visit spacing falls back to "frequency". Care plans bill monthly but
  // spread their tune-up visits across the year (visitFrequency = "annual").
  visitFrequency: text("visit_frequency").$type<AgreementFrequency>(),
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
  // Client-facing terms/details — printed on the formal agreement document
  details: text("details"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  contractDate: date("contract_date"),
  appointmentDate: date("appointment_date"),
  numberOfSystems: integer("number_of_systems").notNull().default(1),
  price: decimal("price", { precision: 10, scale: 2 }).default("229.00"),
  frequency: text("frequency").$type<AgreementFrequency>().notNull().default("annual"),
  // Cadence used to space scheduled maintenance visits. Decoupled from "frequency"
  // (billing cadence) so e.g. a monthly-billed Care plan can spread its yearly
  // tune-ups across 12 months. When null, visit spacing falls back to "frequency".
  visitFrequency: text("visit_frequency").$type<AgreementFrequency>(),
  visitsPerPeriod: integer("visits_per_period").notNull().default(2),
  autoRenew: boolean("auto_renew").notNull().default(true),
  regionId: varchar("region_id").references(() => maintenanceRegions.id),
  agreementType: text("agreement_type").$type<AgreementType>().notNull().default("standard"),
  customAgreementTypeId: varchar("custom_agreement_type_id").references(() => customAgreementTypes.id),
  billingPreference: text("billing_preference").$type<BillingPreference>().notNull().default("auto_invoice"),
  activationDate: date("activation_date"),
  graceExpiresAt: date("grace_expires_at"),
  isInitialCycle: boolean("is_initial_cycle").notNull().default(true),
  firstInvoiceSentAt: timestamp("first_invoice_sent_at"),
  initialInvoiceId: varchar("initial_invoice_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCrmAgreementSchema = createInsertSchema(crmAgreements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Renewal status for pay-on-visit agreement visits
// none = not a renewal visit or renewal not applicable
// pending = renewal due, technician needs to collect payment
// pending_payment = invoice created, awaiting payment
// collected = payment received, agreement renewed
// declined = customer declined renewal, agreement will expire
export const visitRenewalStatusEnum = ["none", "pending", "pending_payment", "collected", "declined"] as const;
export type VisitRenewalStatus = typeof visitRenewalStatusEnum[number];

// Maintenance Visits (track the 2 visits per year for each agreement)
export const maintenanceVisits = pgTable("maintenance_visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agreementId: varchar("agreement_id").notNull().references(() => crmAgreements.id, { onDelete: "cascade" }),
  visitNumber: integer("visit_number").notNull(),
  totalVisitsInCycle: integer("total_visits_in_cycle").notNull().default(2),
  cycleYear: integer("cycle_year").notNull(),
  targetDate: date("target_date").notNull(),
  reminderSentAt: timestamp("reminder_sent_at"),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id),
  completedAt: timestamp("completed_at"),
  status: text("status").$type<"pending" | "scheduled" | "completed" | "cancelled">().notNull().default("pending"),
  isRenewalTrigger: boolean("is_renewal_trigger").notNull().default(false),
  renewalStatus: text("renewal_status").$type<VisitRenewalStatus>().notNull().default("none"),
  renewalInvoiceId: varchar("renewal_invoice_id").references(() => crmInvoices.id),
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

// Visit types for checklists (top-level work order type)
export const checklistVisitTypeEnum = ["SERVICE", "INSTALL", "SALES", "MAINTENANCE"] as const;
export type ChecklistVisitType = typeof checklistVisitTypeEnum[number];

// Subtypes for each visit type
export const serviceCallTypeEnum = [
  "NO_HEAT", "NO_AC", "WATER_LEAK", "STRANGE_NOISE", "THERMOSTAT_ISSUE",
  "MAINTENANCE", "INSTALL", "DUCT_WORK", "OTHER"
] as const;
export type ServiceCallType = typeof serviceCallTypeEnum[number];

// Subtype mappings for each visit type
export const checklistSubtypesByVisitType: Record<ChecklistVisitType, readonly string[]> = {
  SERVICE: ["NO_HEAT", "NO_AC", "WATER_LEAK", "STRANGE_NOISE", "THERMOSTAT_ISSUE", "OTHER"],
  INSTALL: ["NEW_SYSTEM", "REPLACEMENT", "DUCT_WORK", "OTHER"],
  SALES: ["ESTIMATE", "CONSULTATION", "FOLLOW_UP", "OTHER"],
  MAINTENANCE: ["PREVENTATIVE", "INSPECTION", "TUNE_UP", "OTHER"],
};

// Question types for checklist questions
export const checklistQuestionTypeEnum = ["yes_no", "text", "number", "select", "multi_select"] as const;
export type ChecklistQuestionType = typeof checklistQuestionTypeEnum[number];

// Service Call Checklist Templates
export const serviceCallChecklists = pgTable("service_call_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitType: text("visit_type").$type<ChecklistVisitType>().notNull().default("SERVICE"),
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
  // Steps sharing a section name group into a collapsible phase on the canvas
  section: text("section"),
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

// Checklist Photo Steps — required image captures for a checklist. Each photo
// step can be linked to a specific question ("check capacitor" → capacitor
// photo) which the builder renders as an arrow in the flow canvas.
export const checklistPhotoSteps = pgTable("checklist_photo_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checklistId: varchar("checklist_id").notNull().references(() => serviceCallChecklists.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  instructions: text("instructions"),
  isRequired: boolean("is_required").notNull().default(true),
  linkedQuestionId: varchar("linked_question_id").references(() => checklistQuestions.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChecklistPhotoStepSchema = createInsertSchema(checklistPhotoSteps).omit({
  id: true,
  createdAt: true,
});

export type InsertChecklistPhotoStep = z.infer<typeof insertChecklistPhotoStepSchema>;
export type ChecklistPhotoStep = typeof checklistPhotoSteps.$inferSelect;

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
  billToParent: boolean("bill_to_parent").default(false), // If true, bill the parent account instead
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

export const insertBouncieVehicleSchema = createInsertSchema(bouncieVehicles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

export const insertCrmLeadTypeSchema = createInsertSchema(crmLeadTypes).omit({
  id: true,
  createdAt: true,
});

export const insertCrmLeadTempOptionSchema = createInsertSchema(crmLeadTempOptions).omit({
  id: true,
  createdAt: true,
});

export const insertCrmLeadDriverOptionSchema = createInsertSchema(crmLeadDriverOptions).omit({
  id: true,
  createdAt: true,
});

export const insertCrmLeadSchema = createInsertSchema(crmLeads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type InsertBouncieVehicle = z.infer<typeof insertBouncieVehicleSchema>;
export type BouncieVehicle = typeof bouncieVehicles.$inferSelect;
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
export type InsertCrmLeadType = z.infer<typeof insertCrmLeadTypeSchema>;
export type CrmLeadType = typeof crmLeadTypes.$inferSelect;
export type InsertCrmLeadTempOption = z.infer<typeof insertCrmLeadTempOptionSchema>;
export type CrmLeadTempOption = typeof crmLeadTempOptions.$inferSelect;
export type InsertCrmLeadDriverOption = z.infer<typeof insertCrmLeadDriverOptionSchema>;
export type CrmLeadDriverOption = typeof crmLeadDriverOptions.$inferSelect;
export type InsertCrmLead = z.infer<typeof insertCrmLeadSchema>;
export type CrmLead = typeof crmLeads.$inferSelect;
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

// =============================================
// CUSTOMER PORTAL TABLES
// =============================================

// Customer portal accounts - for customer-facing portal (separate from employee portal)
export const customerPortalAccounts = pgTable("customer_portal_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
  email: text("email"),
  phone: text("phone"),
  // Login credentials (phone-or-email + password). All nullable so legacy
  // magic-link-only accounts keep working until they set a password.
  passwordHash: text("password_hash"),
  normalizedPhone: text("normalized_phone"), // digits-only, for login matching
  phoneVerifiedAt: timestamp("phone_verified_at"),
  emailVerifiedAt: timestamp("email_verified_at"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  normalizedPhoneIdx: index("customer_portal_accounts_normalized_phone_idx").on(table.normalizedPhone),
  customerIdIdx: index("customer_portal_accounts_customer_id_idx").on(table.customerId),
}));

// One-time SMS codes for portal signup, password reset, and phone changes
export const customerPortalOtpPurposeEnum = ["signup", "reset", "phone_change"] as const;
export type CustomerPortalOtpPurpose = typeof customerPortalOtpPurposeEnum[number];

export const customerPortalOtpCodes = pgTable("customer_portal_otp_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  normalizedPhone: text("normalized_phone").notNull(),
  code: text("code").notNull(),
  purpose: text("purpose").$type<CustomerPortalOtpPurpose>().notNull(),
  // For phone_change: the account requesting the change
  accountId: varchar("account_id").references(() => customerPortalAccounts.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  verifiedAt: timestamp("verified_at"),
  consumedAt: timestamp("consumed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  phonePurposeIdx: index("customer_portal_otp_phone_purpose_idx").on(table.normalizedPhone, table.purpose),
}));

// Customer portal login tokens - for magic link authentication
export const customerPortalLoginTokens = pgTable("customer_portal_login_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => customerPortalAccounts.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Customer portal sessions - authenticated sessions for customer portal users
export const customerPortalSessions = pgTable("customer_portal_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => customerPortalAccounts.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerPortalAccountSchema = createInsertSchema(customerPortalAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerPortalLoginTokenSchema = createInsertSchema(customerPortalLoginTokens).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerPortalSessionSchema = createInsertSchema(customerPortalSessions).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomerPortalAccount = z.infer<typeof insertCustomerPortalAccountSchema>;
export type CustomerPortalAccount = typeof customerPortalAccounts.$inferSelect;
export type InsertCustomerPortalLoginToken = z.infer<typeof insertCustomerPortalLoginTokenSchema>;
export type CustomerPortalLoginToken = typeof customerPortalLoginTokens.$inferSelect;
export type InsertCustomerPortalSession = z.infer<typeof insertCustomerPortalSessionSchema>;
export type CustomerPortalSession = typeof customerPortalSessions.$inferSelect;

export const insertCustomerPortalOtpCodeSchema = createInsertSchema(customerPortalOtpCodes).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomerPortalOtpCode = z.infer<typeof insertCustomerPortalOtpCodeSchema>;
export type CustomerPortalOtpCode = typeof customerPortalOtpCodes.$inferSelect;

// ============================================
// CRM Messaging Module
// ============================================

// Messaging module enums
export const messagingConversationStatusEnum = ["open", "snoozed", "resolved", "archived"] as const;
export type MessagingConversationStatus = typeof messagingConversationStatusEnum[number];

export const messagingSourceEnum = ["internal", "textline"] as const;
export type MessagingSource = typeof messagingSourceEnum[number];

export const messagingDirectionEnum = ["inbound", "outbound", "system"] as const;
export type MessagingDirection = typeof messagingDirectionEnum[number];

export const messagingChannelEnum = ["sms", "mms", "email", "call", "note"] as const;
export type MessagingChannel = typeof messagingChannelEnum[number];

export const messagingStatusEnum = ["queued", "sent", "delivered", "failed", "received", "read"] as const;
export type MessagingStatus = typeof messagingStatusEnum[number];

// Attachment type for messages
export type MessageAttachment = {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
};

// CRM Messaging Conversations
export const crmMessagingConversations = pgTable("crm_messaging_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => crmCustomers.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull(),
  customerName: text("customer_name"),
  source: text("source"),
  subject: text("subject"),
  externalSource: text("external_source").$type<MessagingSource>().default("internal"),
  externalConversationId: text("external_conversation_id"),
  status: text("status").$type<MessagingConversationStatus>().default("open"),
  lastMessageAt: timestamp("last_message_at"),
  lastOutboundAt: timestamp("last_outbound_at"),
  unreadInboundCount: integer("unread_inbound_count").default(0),
  unreadCount: integer("unread_count").default(0),
  assignedToId: varchar("assigned_to_id").references(() => crmUsers.id),
  snoozeUntil: timestamp("snooze_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CRM Messaging Messages
export const crmMessagingMessages = pgTable("crm_messaging_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => crmMessagingConversations.id, { onDelete: "cascade" }),
  direction: text("direction").$type<MessagingDirection>().default("outbound"),
  channel: text("channel").$type<MessagingChannel>().default("sms"),
  body: text("body"),
  attachments: json("attachments").$type<MessageAttachment[]>(),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  authorUserId: varchar("author_user_id").references(() => crmUsers.id),
  externalMessageId: text("external_message_id"),
  status: text("status").$type<MessagingStatus>().default("queued"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CRM Messaging Conversation Tags (join table)
export const crmMessagingConversationTags = pgTable("crm_messaging_conversation_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => crmMessagingConversations.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrmMessagingConversationSchema = createInsertSchema(crmMessagingConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrmMessagingMessageSchema = createInsertSchema(crmMessagingMessages).omit({
  id: true,
  createdAt: true,
});

export const insertCrmMessagingConversationTagSchema = createInsertSchema(crmMessagingConversationTags).omit({
  id: true,
  createdAt: true,
});

export type InsertCrmMessagingConversation = z.infer<typeof insertCrmMessagingConversationSchema>;
export type CrmMessagingConversation = typeof crmMessagingConversations.$inferSelect;
export type InsertCrmMessagingMessage = z.infer<typeof insertCrmMessagingMessageSchema>;
export type CrmMessagingMessage = typeof crmMessagingMessages.$inferSelect;
export type InsertCrmMessagingConversationTag = z.infer<typeof insertCrmMessagingConversationTagSchema>;
export type CrmMessagingConversationTag = typeof crmMessagingConversationTags.$inferSelect;

// =============================================
// CRM EMAIL (Gmail / Google Workspace two-way inbox)
// =============================================
// One row per Gmail thread, scoped to the connected user's mailbox.
export const crmEmailThreads = pgTable("crm_email_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  gmailThreadId: text("gmail_thread_id").notNull(),
  subject: text("subject"),
  snippet: text("snippet"),
  // Distinct participant emails on the thread (for display + customer matching)
  participants: json("participants").$type<string[]>().default([]),
  // Display names aligned index-wise with `participants` (null when unknown)
  participantNames: json("participant_names").$type<(string | null)[]>().default([]),
  lastMessageAt: timestamp("last_message_at"),
  isUnread: boolean("is_unread").notNull().default(false),
  inInbox: boolean("in_inbox").notNull().default(true),
  isSent: boolean("is_sent").notNull().default(false),
  customerId: varchar("customer_id").references(() => crmCustomers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userThreadIdx: uniqueIndex("crm_email_threads_user_thread_idx").on(table.userId, table.gmailThreadId),
  userLastMsgIdx: index("crm_email_threads_user_last_idx").on(table.userId, table.lastMessageAt),
}));

// One row per Gmail message within a thread.
export const crmEmailMessages = pgTable("crm_email_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull().references(() => crmEmailThreads.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  gmailMessageId: text("gmail_message_id").notNull(),
  gmailThreadId: text("gmail_thread_id").notNull(),
  direction: text("direction").$type<"inbound" | "outbound">().notNull(),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  toEmails: json("to_emails").$type<string[]>().default([]),
  ccEmails: json("cc_emails").$type<string[]>().default([]),
  bccEmails: json("bcc_emails").$type<string[]>().default([]),
  subject: text("subject"),
  snippet: text("snippet"),
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  attachments: json("attachments").$type<{ filename: string; mimeType: string; size: number; attachmentId: string }[]>().default([]),
  isUnread: boolean("is_unread").notNull().default(false),
  messageIdHeader: text("message_id_header"), // RFC822 Message-ID, for threading replies
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  msgUniqueIdx: uniqueIndex("crm_email_messages_gmail_idx").on(table.userId, table.gmailMessageId),
  threadIdx: index("crm_email_messages_thread_idx").on(table.threadId),
}));

export const insertCrmEmailThreadSchema = createInsertSchema(crmEmailThreads).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCrmEmailMessageSchema = createInsertSchema(crmEmailMessages).omit({ id: true, createdAt: true });
export type CrmEmailThread = typeof crmEmailThreads.$inferSelect;
export type CrmEmailMessage = typeof crmEmailMessages.$inferSelect;
export type InsertCrmEmailThread = z.infer<typeof insertCrmEmailThreadSchema>;
export type InsertCrmEmailMessage = z.infer<typeof insertCrmEmailMessageSchema>;

// Time Entry Source Types
export type TimeEntrySource = "mobile" | "manual" | "system";

// CRM Time Entries (tech clock in/out)
export const crmTimeEntries = pgTable("crm_time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id, { onDelete: "set null" }),
  clockInAt: timestamp("clock_in_at").notNull(),
  clockOutAt: timestamp("clock_out_at"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  source: text("source").$type<TimeEntrySource>().default("mobile"),
  createdById: varchar("created_by_id").references(() => crmUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCrmTimeEntrySchema = createInsertSchema(crmTimeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmTimeEntry = z.infer<typeof insertCrmTimeEntrySchema>;
export type CrmTimeEntry = typeof crmTimeEntries.$inferSelect;

// =============================================
// SMS NOTIFICATION LOG
// =============================================

// Notification types for tracking sent SMS
export const smsNotificationTypeEnum = [
  "maintenance_reminder_10_day",
  "maintenance_reminder_5_day", 
  "work_order_en_route",
  "work_order_on_site",
  "invoice_sms",
  "review_request",
  "quote_sent",
  "invoice_sent",
] as const;
export type SmsNotificationType = typeof smsNotificationTypeEnum[number];

// SMS Notification Log - tracks all automated SMS notifications to prevent duplicates
export const smsNotificationLog = pgTable("sms_notification_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => crmCustomers.id, { onDelete: "cascade" }),
  notificationType: text("notification_type").$type<SmsNotificationType>().notNull(),
  // Reference IDs based on notification type
  maintenanceVisitId: varchar("maintenance_visit_id").references(() => maintenanceVisits.id, { onDelete: "cascade" }),
  workOrderId: varchar("work_order_id").references(() => crmWorkOrders.id, { onDelete: "cascade" }),
  invoiceId: varchar("invoice_id").references(() => crmInvoices.id, { onDelete: "cascade" }),
  quoteId: varchar("quote_id").references(() => crmQuotes.id, { onDelete: "cascade" }),
  // Message tracking
  messageId: varchar("message_id"), // External message ID from Textline
  conversationId: varchar("conversation_id").references(() => crmMessagingConversations.id),
  phoneNumber: text("phone_number"),
  messageBody: text("message_body"),
  status: text("status").$type<"sent" | "failed" | "pending">().default("pending"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSmsNotificationLogSchema = createInsertSchema(smsNotificationLog).omit({
  id: true,
  createdAt: true,
});

export type InsertSmsNotificationLog = z.infer<typeof insertSmsNotificationLogSchema>;
export type SmsNotificationLog = typeof smsNotificationLog.$inferSelect;

// =============================================
// MARKETING CAMPAIGNS
// =============================================

export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").$type<"review_request" | "follow_up" | "promotion">().notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  totalSent: integer("total_sent").default(0).notNull(),
  totalDelivered: integer("total_delivered").default(0),
  totalClicked: integer("total_clicked").default(0),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;

// Marketing automation campaigns (trigger → conditions → actions → timing →
// safeguards). Config pieces are stored as JSON; shapes live in ./automation.
export const automationCampaigns = pgTable("automation_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(false),
  trigger: json("trigger").$type<AutomationTrigger>().notNull(),
  conditions: json("conditions").$type<AutomationCondition[]>().default([]),
  actions: json("actions").$type<AutomationAction[]>().notNull(),
  timing: json("timing").$type<AutomationTiming>(),
  safeguards: json("safeguards").$type<AutomationSafeguards>(),
  totalTriggered: integer("total_triggered").notNull().default(0),
  totalCompleted: integer("total_completed").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
  createdById: varchar("created_by_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAutomationCampaignSchema = createInsertSchema(automationCampaigns).omit({
  id: true,
  totalTriggered: true,
  totalCompleted: true,
  lastRunAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAutomationCampaign = z.infer<typeof insertAutomationCampaignSchema>;
export type AutomationCampaign = typeof automationCampaigns.$inferSelect;

// Queue + history for automation runs. Each triggered run is enqueued with a
// dueAt (trigger time + timing delay); a scheduler processes due rows. Also
// serves as the send-log used by cooldown / max-per-month safeguards.
export const automationRuns = pgTable("automation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull(),
  triggerType: text("trigger_type").notNull(),
  customerId: varchar("customer_id"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  dueAt: timestamp("due_at").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | skipped | failed
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  dueStatusIdx: index("automation_runs_due_status_idx").on(table.status, table.dueAt),
  campaignCustomerIdx: index("automation_runs_campaign_customer_idx").on(table.campaignId, table.customerId),
}));
export type AutomationRun = typeof automationRuns.$inferSelect;

// =============================================
// QUICKBOOKS INTEGRATION
// =============================================

// QuickBooks OAuth state (for CSRF protection during OAuth flow)
export const quickbooksOauthStates = pgTable("quickbooks_oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: varchar("state").notNull().unique(),
  environment: text("environment").$type<"sandbox" | "production">().default("sandbox"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// QuickBooks OAuth connection tokens
export const quickbooksConnection = pgTable("quickbooks_connection", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  realmId: varchar("realm_id").notNull().unique(), // QuickBooks company ID
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at").notNull(),
  environment: text("environment").$type<"sandbox" | "production">().default("sandbox"),
  companyName: text("company_name"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksConnectionSchema = createInsertSchema(quickbooksConnection).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksConnection = z.infer<typeof insertQuickbooksConnectionSchema>;
export type QuickbooksConnection = typeof quickbooksConnection.$inferSelect;

// Customer sync mapping - links CRM customers to QuickBooks customers
export const quickbooksCustomerSync = pgTable("quickbooks_customer_sync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crmCustomerId: varchar("crm_customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
  quickbooksCustomerId: varchar("quickbooks_customer_id").notNull(),
  realmId: varchar("realm_id").notNull(),
  syncStatus: text("sync_status").$type<"synced" | "pending" | "error">().default("synced"),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksCustomerSyncSchema = createInsertSchema(quickbooksCustomerSync).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksCustomerSync = z.infer<typeof insertQuickbooksCustomerSyncSchema>;
export type QuickbooksCustomerSync = typeof quickbooksCustomerSync.$inferSelect;

// Invoice sync mapping - links CRM invoices to QuickBooks invoices
// Unique constraint on (crmInvoiceId, realmId) prevents race condition duplicates
export const quickbooksInvoiceSync = pgTable("quickbooks_invoice_sync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crmInvoiceId: varchar("crm_invoice_id").notNull().references(() => crmInvoices.id, { onDelete: "cascade" }),
  quickbooksInvoiceId: varchar("quickbooks_invoice_id").notNull(),
  realmId: varchar("realm_id").notNull(),
  syncStatus: text("sync_status").$type<"synced" | "pending" | "error">().default("synced"),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_quickbooks_invoice_sync_unique").on(table.crmInvoiceId, table.realmId),
]);

export const insertQuickbooksInvoiceSyncSchema = createInsertSchema(quickbooksInvoiceSync).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksInvoiceSync = z.infer<typeof insertQuickbooksInvoiceSyncSchema>;
export type QuickbooksInvoiceSync = typeof quickbooksInvoiceSync.$inferSelect;

// Payment sync mapping - links CRM payments to QuickBooks payments
export const quickbooksPaymentSync = pgTable("quickbooks_payment_sync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crmInvoiceId: varchar("crm_invoice_id").notNull().references(() => crmInvoices.id, { onDelete: "cascade" }),
  quickbooksPaymentId: varchar("quickbooks_payment_id").notNull(),
  realmId: varchar("realm_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  syncStatus: text("sync_status").$type<"synced" | "pending" | "error">().default("synced"),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksPaymentSyncSchema = createInsertSchema(quickbooksPaymentSync).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksPaymentSync = z.infer<typeof insertQuickbooksPaymentSyncSchema>;
export type QuickbooksPaymentSync = typeof quickbooksPaymentSync.$inferSelect;

// Sync log for tracking all sync operations
export const quickbooksSyncLog = pgTable("quickbooks_sync_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  realmId: varchar("realm_id").notNull(),
  syncType: text("sync_type").$type<"customer" | "invoice" | "payment" | "full">().notNull(),
  direction: text("direction").$type<"push" | "pull">().notNull(),
  status: text("status").$type<"started" | "completed" | "failed">().notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertQuickbooksSyncLogSchema = createInsertSchema(quickbooksSyncLog).omit({
  id: true,
});

export type InsertQuickbooksSyncLog = z.infer<typeof insertQuickbooksSyncLogSchema>;
export type QuickbooksSyncLog = typeof quickbooksSyncLog.$inferSelect;

// QuickBooks Classes - maps to QuickBooks Class entity for item classification
export const quickbooksClasses = pgTable("quickbooks_classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Service - Residential"
  classType: text("class_type").$type<"Service" | "Install" | "Maintenance" | "Discount">().notNull(),
  subType: text("sub_type").$type<"Residential" | "Commercial" | "Crawlspace" | "Promotional" | "Maintenance">().notNull(),
  quickbooksClassId: varchar("quickbooks_class_id"), // QuickBooks Class.Id
  realmId: varchar("realm_id"), // QuickBooks company ID
  syncToken: varchar("sync_token"), // Required for QuickBooks updates
  isActive: boolean("is_active").default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksClassSchema = createInsertSchema(quickbooksClasses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksClass = z.infer<typeof insertQuickbooksClassSchema>;
export type QuickbooksClass = typeof quickbooksClasses.$inferSelect;

// Category to Class mapping - links categories to QuickBooks classes
export const quickbooksCategoryClassMap = pgTable("quickbooks_category_class_map", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryName: varchar("category_name", { length: 255 }).notNull(), // The category name (e.g., "HVAC Parts")
  quickbooksClassId: varchar("quickbooks_class_id").references(() => quickbooksClasses.id),
  realmId: varchar("realm_id").notNull(), // QuickBooks company ID
  isDefault: boolean("is_default").default(false), // If true, this class applies to all unmapped categories
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksCategoryClassMapSchema = createInsertSchema(quickbooksCategoryClassMap).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksCategoryClassMap = z.infer<typeof insertQuickbooksCategoryClassMapSchema>;
export type QuickbooksCategoryClassMap = typeof quickbooksCategoryClassMap.$inferSelect;

// QuickBooks Accounts - maps to QuickBooks Chart of Accounts for income tracking
// Supports hierarchical parent/child structure (e.g., Service > Residential, Install > Commercial)
export const quickbooksAccounts = pgTable("quickbooks_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "Service" or "Residential"
  fullyQualifiedName: varchar("fully_qualified_name", { length: 500 }), // e.g., "Service:Residential"
  accountType: text("account_type").$type<"Income" | "Expense" | "Other Income" | "Other Expense">().default("Income"), // QuickBooks account type
  accountSubType: varchar("account_sub_type", { length: 100 }), // QuickBooks detail type (e.g., "ServiceFeeIncome")
  // Category mapping - which CRM item category this account handles
  categoryType: text("category_type").$type<"Service" | "Install" | "Maintenance" | "Discount">(), // null for parent accounts
  // Property type mapping - which property type this sub-account handles  
  propertyType: text("property_type").$type<"Residential" | "Commercial">(), // null for parent accounts
  isParent: boolean("is_parent").default(false), // true for parent accounts (Service, Install, etc.)
  parentAccountId: varchar("parent_account_id"), // references id of parent account in this table
  quickbooksAccountId: varchar("quickbooks_account_id"), // QuickBooks Account.Id
  quickbooksParentAccountId: varchar("quickbooks_parent_account_id"), // QuickBooks parent Account.Id
  realmId: varchar("realm_id"), // QuickBooks company ID
  syncToken: varchar("sync_token"), // Required for QuickBooks updates
  isActive: boolean("is_active").default(true),
  currentBalance: varchar("current_balance"), // Current balance from QuickBooks
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksAccountSchema = createInsertSchema(quickbooksAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksAccount = z.infer<typeof insertQuickbooksAccountSchema>;
export type QuickbooksAccount = typeof quickbooksAccounts.$inferSelect;

// QuickBooks Items (Products & Services) - maps to QuickBooks Items for invoice line items
// Each item is linked to an income account for proper P&L routing
export const quickbooksItems = pgTable("quickbooks_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "HVAC Service - Residential"
  description: text("description"), // Item description for invoice lines
  // Category mapping - which CRM item category this item handles
  categoryType: text("category_type").$type<"Service" | "Install" | "Maintenance" | "Discount">().notNull(),
  // Property type mapping - which property type this item handles  
  propertyType: text("property_type").$type<"Residential" | "Commercial">().notNull(),
  // Linked income account in CRM (references quickbooksAccounts)
  incomeAccountId: varchar("income_account_id").references(() => quickbooksAccounts.id),
  // QuickBooks Item data
  quickbooksItemId: varchar("quickbooks_item_id"), // QuickBooks Item.Id
  quickbooksIncomeAccountId: varchar("quickbooks_income_account_id"), // QuickBooks Account.Id for IncomeAccountRef
  realmId: varchar("realm_id"), // QuickBooks company ID
  syncToken: varchar("sync_token"), // Required for QuickBooks updates
  itemType: text("item_type").$type<"Service" | "NonInventory" | "Inventory">().default("Service"),
  isActive: boolean("is_active").default(true),
  unitPrice: varchar("unit_price"), // Default unit price
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuickbooksItemSchema = createInsertSchema(quickbooksItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQuickbooksItem = z.infer<typeof insertQuickbooksItemSchema>;
export type QuickbooksItem = typeof quickbooksItems.$inferSelect;

// App Settings - key-value store for application configuration
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAppSettingSchema = createInsertSchema(appSettings);
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type AppSetting = typeof appSettings.$inferSelect;

// Pricebook Packages - HVAC proposal builder packages
// Stores package data that was previously in pricebook-packages.json
export const pricebookPackages = pgTable("pricebook_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitType: varchar("unit_type", { length: 50 }).notNull(), // PHP, GP, SGA, SHP, Mini-Split, Ducting, Water Heater
  tier: varchar("tier", { length: 50 }).notNull(), // Packaged, Essential, Premium, Ultimate, Standard
  tonnage: varchar("tonnage", { length: 20 }).notNull(), // 2, 2.5, 3, 3.5, 4, 5
  packageLevel: varchar("package_level", { length: 50 }).notNull(), // Best, Better, Good, Budget
  monthlyPayment: integer("monthly_payment").notNull(), // Monthly payment amount (cents)
  totalInvestment: integer("total_investment").notNull(), // Total price (cents)
  outdoorBrand: varchar("outdoor_brand", { length: 100 }),
  outdoorModel: varchar("outdoor_model", { length: 100 }),
  outdoorName: text("outdoor_name"),
  coilModel: varchar("coil_model", { length: 100 }),
  coilName: text("coil_name"),
  indoorHeatModel: varchar("indoor_heat_model", { length: 100 }),
  indoorHeatName: text("indoor_heat_name"),
  thermostatModel: varchar("thermostat_model", { length: 100 }),
  thermostatName: text("thermostat_name"),
  accessoryModels: text("accessory_models"),
  outdoorImageUrl: text("outdoor_image_url"),
  coilImageUrl: text("coil_image_url"),
  thermostatImageUrl: text("thermostat_image_url"),
  furnaceImageUrl: text("furnace_image_url"),
  // Base prices from Google Sheets (master source). NULL until first sync after migration.
  baseMonthlyPayment: integer("base_monthly_payment"),
  baseTotalInvestment: integer("base_total_investment"),
  // Cumulative adjustment in basis points (500 = +5%, -200 = -2%). Default 0 = no adjustment.
  adjustmentBasisPoints: integer("adjustment_basis_points").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPricebookPackageSchema = createInsertSchema(pricebookPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPricebookPackage = z.infer<typeof insertPricebookPackageSchema>;
export type PricebookPackage = typeof pricebookPackages.$inferSelect;

// Crawlspace Tiers - Stores crawlspace encapsulation tier pricing
export const crawlspaceTiers = pgTable("crawlspace_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull(), // Essential, Premium, Ultimate
  milThickness: integer("mil_thickness").notNull(), // 10, 12, 20
  rollPrice: integer("roll_price").notNull(), // Price in cents per roll
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCrawlspaceTierSchema = createInsertSchema(crawlspaceTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrawlspaceTier = z.infer<typeof insertCrawlspaceTierSchema>;
export type CrawlspaceTier = typeof crawlspaceTiers.$inferSelect;

// Package Price Adjustments - Audit log for bulk price changes
export const packagePriceAdjustments = pgTable("package_price_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adjustmentType: text("adjustment_type").$type<"hvac" | "crawlspace">().notNull(),
  // For HVAC: can filter by unitType, tier, or apply to all
  unitTypeFilter: varchar("unit_type_filter", { length: 50 }), // null = all unit types
  tierFilter: varchar("tier_filter", { length: 50 }), // null = all tiers
  percentageChange: integer("percentage_change").notNull(), // +5 = 5% increase, -10 = 10% decrease
  packagesAffected: integer("packages_affected").notNull(),
  appliedBy: varchar("applied_by", { length: 100 }),
  appliedAt: timestamp("applied_at").defaultNow(),
});

export const insertPackagePriceAdjustmentSchema = createInsertSchema(packagePriceAdjustments).omit({
  id: true,
  appliedAt: true,
});

export type InsertPackagePriceAdjustment = z.infer<typeof insertPackagePriceAdjustmentSchema>;
export type PackagePriceAdjustment = typeof packagePriceAdjustments.$inferSelect;

// Default financing link for install quotes
export const DEFAULT_FINANCING_LINK = "https://projects.greensky.com/merchantloanapplication?apptype=short&merchant=81087766&dealerplan=2832&channel=External-Button-03";

// Materials Catalog - CSV-uploaded duct materials and other items for quick selection
export const materialsCatalog = pgTable("materials_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // e.g., "Duct", "Fitting", "Insulation", "Equipment"
  partNumber: text("part_number"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(), // Cost in dollars
  unit: text("unit").default("each"), // each, ft, roll, etc.
  vendor: text("vendor"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMaterialsCatalogSchema = createInsertSchema(materialsCatalog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMaterialsCatalog = z.infer<typeof insertMaterialsCatalogSchema>;
export type MaterialsCatalogItem = typeof materialsCatalog.$inferSelect;

// Project Labor Entries - Track labor costs for job costing
export const projectLaborEntries = pgTable("project_labor_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => crmProjects.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  contractor: text("contractor").notNull(), // Contractor or employee name
  description: text("description"),
  laborType: text("labor_type"), // e.g., "Install", "Service", "Supervision"
  hours: decimal("hours", { precision: 5, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Total labor cost
  createdBy: varchar("created_by").references(() => crmUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("project_labor_entries_project_id_idx").on(table.projectId),
  dateIdx: index("project_labor_entries_date_idx").on(table.date),
}));

export const insertProjectLaborEntrySchema = createInsertSchema(projectLaborEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectLaborEntry = z.infer<typeof insertProjectLaborEntrySchema>;
export type ProjectLaborEntry = typeof projectLaborEntries.$inferSelect;

// CRM Notifications - User notifications for mentions, assignments, etc.
export const notificationTypeEnum = ["mention", "task_assigned", "task_due", "comment", "status_change", "system", "tagged_comment"] as const;
export type NotificationType = typeof notificationTypeEnum[number];

export const crmNotifications = pgTable("crm_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  type: text("type").$type<NotificationType>().notNull(),
  title: text("title").notNull(),
  preview: text("preview"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  actorId: varchar("actor_id").references(() => crmUsers.id, { onDelete: "set null" }),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrmNotificationSchema = createInsertSchema(crmNotifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

export type InsertCrmNotification = z.infer<typeof insertCrmNotificationSchema>;
export type CrmNotification = typeof crmNotifications.$inferSelect;

// =============================================
// TASK MANAGEMENT MODULE
// =============================================

// Task Status Enum
export const taskStatusEnum = ["pending", "in_progress", "completed", "cancelled"] as const;
export type TaskStatus = typeof taskStatusEnum[number];

// Task Priority Enum
export const taskPriorityEnum = ["low", "normal", "high"] as const;
export type TaskPriority = typeof taskPriorityEnum[number];

// Task Related Entity Type Enum
export const taskRelatedEntityTypeEnum = ["customer", "lead", "project", "work_order", "invoice", "rebate_case", "none"] as const;
export type TaskRelatedEntityType = typeof taskRelatedEntityTypeEnum[number];

// Task List Enum - Google Tasks-style columns
export const taskListEnum = ["inbox", "projects", "next_actions", "waiting_on", "follow_up"] as const;
export type TaskList = typeof taskListEnum[number];

// Task Types - Configurable task templates
export const taskTypes = pgTable("task_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  icon: text("icon"),
  defaultDurationMinutes: integer("default_duration_minutes"),
  defaultPriority: text("default_priority").$type<"low" | "normal" | "high">(),
  isCustomerActionable: boolean("is_customer_actionable").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTaskTypeSchema = createInsertSchema(taskTypes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTaskType = z.infer<typeof insertTaskTypeSchema>;
export type TaskType = typeof taskTypes.$inferSelect;

// Tasks - Main task records
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<TaskStatus>().notNull().default("pending"),
  priority: text("priority").$type<TaskPriority>().notNull().default("normal"),
  taskList: text("task_list").$type<TaskList>().notNull().default("inbox"),
  typeId: varchar("type_id").references(() => taskTypes.id),
  assignedToUserId: varchar("assigned_to_user_id").references(() => crmUsers.id),
  createdByUserId: varchar("created_by_user_id").references(() => crmUsers.id).notNull(),
  dueAt: timestamp("due_at"),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  completedAt: timestamp("completed_at"),
  remindAt: timestamp("remind_at"),
  isAllDay: boolean("is_all_day").default(false),
  relatedEntityType: text("related_entity_type").$type<TaskRelatedEntityType>().default("none"),
  relatedEntityId: varchar("related_entity_id"),
  customerId: varchar("customer_id").references(() => crmCustomers.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Helper schema to coerce date strings to Date objects for JSON API compatibility
const coerceDateOrNull = z.union([
  z.string().transform((val) => val ? new Date(val) : null),
  z.date(),
  z.null(),
]).nullable().optional();

export const insertTaskSchema = createInsertSchema(tasks)
  .omit({ id: true, createdAt: true, updatedAt: true, completedAt: true })
  .extend({
    dueAt: coerceDateOrNull,
    startAt: coerceDateOrNull,
    endAt: coerceDateOrNull,
    remindAt: coerceDateOrNull,
  });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Task Activity - Audit trail for task changes
export const taskActivity = pgTable("task_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  userId: varchar("user_id").references(() => crmUsers.id).notNull(),
  action: text("action").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskActivitySchema = createInsertSchema(taskActivity).omit({ id: true, createdAt: true });
export type InsertTaskActivity = z.infer<typeof insertTaskActivitySchema>;
export type TaskActivity = typeof taskActivity.$inferSelect;

// Task Subtasks - Checklist items within a task
export const taskSubtasks = pgTable("task_subtasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  dueAt: timestamp("due_at"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

const coerceSubtaskDate = z.union([
  z.string().transform((val) => val ? new Date(val) : null),
  z.date(),
  z.null(),
]).nullable().optional();

export const insertTaskSubtaskSchema = createInsertSchema(taskSubtasks)
  .omit({ id: true, createdAt: true })
  .extend({ dueAt: coerceSubtaskDate });
export type InsertTaskSubtask = z.infer<typeof insertTaskSubtaskSchema>;
export type TaskSubtask = typeof taskSubtasks.$inferSelect;

// CRM Comments - Comments on any entity (leads, projects, work orders, tasks, customers)
export const crmComments = pgTable("crm_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  authorId: varchar("author_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrmCommentSchema = createInsertSchema(crmComments).omit({
  id: true,
  createdAt: true,
  editedAt: true,
});

export type InsertCrmComment = z.infer<typeof insertCrmCommentSchema>;
export type CrmComment = typeof crmComments.$inferSelect;

// CRM Comment Mentions - Junction table for tracking mentions in comments
export const crmCommentMentions = pgTable("crm_comment_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => crmComments.id, { onDelete: "cascade" }),
  mentionedUserId: varchar("mentioned_user_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrmCommentMentionSchema = createInsertSchema(crmCommentMentions).omit({
  id: true,
  createdAt: true,
});

export type InsertCrmCommentMention = z.infer<typeof insertCrmCommentMentionSchema>;
export type CrmCommentMention = typeof crmCommentMentions.$inferSelect;

export const crmTaggedComments = pgTable("crm_tagged_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  pageRoute: text("page_route").notNull(),
  body: text("body").notNull(),
  authorDismissed: boolean("author_dismissed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const crmTaggedCommentRecipients = pgTable("crm_tagged_comment_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => crmTaggedComments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => crmUsers.id, { onDelete: "cascade" }),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedById: varchar("resolved_by_id"),
  dismissed: boolean("dismissed").notNull().default(false),
  notificationId: varchar("notification_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrmTaggedCommentSchema = createInsertSchema(crmTaggedComments).omit({
  id: true,
  createdAt: true,
});

export const insertCrmTaggedCommentRecipientSchema = createInsertSchema(crmTaggedCommentRecipients).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export type InsertCrmTaggedComment = z.infer<typeof insertCrmTaggedCommentSchema>;
export type CrmTaggedComment = typeof crmTaggedComments.$inferSelect;
export type InsertCrmTaggedCommentRecipient = z.infer<typeof insertCrmTaggedCommentRecipientSchema>;
export type CrmTaggedCommentRecipient = typeof crmTaggedCommentRecipients.$inferSelect;

export const salesbookBookmarks = pgTable("salesbook_bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  pageNumber: integer("page_number").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSalesbookBookmarkSchema = createInsertSchema(salesbookBookmarks).omit({
  id: true,
  createdAt: true,
});

export type InsertSalesbookBookmark = z.infer<typeof insertSalesbookBookmarkSchema>;
export type SalesbookBookmark = typeof salesbookBookmarks.$inferSelect;

export const proposalTemplates = pgTable("proposal_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  body: text("body").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProposalTemplateSchema = createInsertSchema(proposalTemplates).omit({
  id: true,
  createdAt: true,
});

export type InsertProposalTemplate = z.infer<typeof insertProposalTemplateSchema>;
export type ProposalTemplate = typeof proposalTemplates.$inferSelect;

export const proposalTemplateImages = pgTable("proposal_template_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProposalTemplateImageSchema = createInsertSchema(proposalTemplateImages).omit({
  id: true,
  createdAt: true,
});

export type InsertProposalTemplateImage = z.infer<typeof insertProposalTemplateImageSchema>;
export type ProposalTemplateImage = typeof proposalTemplateImages.$inferSelect;

export const customerFiles = pgTable("customer_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  objectPath: text("object_path"),
  contentType: text("content_type"),
  size: integer("size"),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerFileSchema = createInsertSchema(customerFiles).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomerFile = z.infer<typeof insertCustomerFileSchema>;
export type CustomerFile = typeof customerFiles.$inferSelect;

// ============================================================================
// DOCUMENTS APP (company Drive: folders + files on the Neon object store)
// ============================================================================

export const docFolders = pgTable("doc_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id"), // null = root ("Company Drive")
  category: text("category"), // set = protected root folder backing a Documents category tab
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Category tabs in the Documents app; each is backed by a protected root folder. */
export const DOC_CATEGORIES = [
  { key: "sops", label: "SOPs" },
  { key: "policies", label: "Policies" },
  { key: "training", label: "Training" },
  { key: "templates", label: "Templates" },
  { key: "hr", label: "HR Documents" },
  { key: "sales", label: "Sales Documents" },
  { key: "safety", label: "Safety" },
  { key: "system", label: "System Management" },
  { key: "vendor", label: "Vendor Documents" },
  { key: "subcontractor", label: "Subcontractor Documents" },
] as const;
export type DocCategoryKey = typeof DOC_CATEGORIES[number]["key"];

export const docFiles = pgTable("doc_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  folderId: varchar("folder_id"), // null = root
  name: text("name").notNull(),
  url: text("url").notNull(),
  objectPath: text("object_path"),
  contentType: text("content_type"),
  size: integer("size"),
  starred: boolean("starred").notNull().default(false),
  trashedAt: timestamp("trashed_at"), // soft delete → Trash view
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DocFolder = typeof docFolders.$inferSelect;
export type DocFile = typeof docFiles.$inferSelect;

// ============================================================================
// ACCOUNTING APP (chart of accounts + expenses; revenue reads crm_invoices)
// ============================================================================

export const acctAccountTypeEnum = ["income", "expense", "asset", "liability", "equity"] as const;
export type AcctAccountType = typeof acctAccountTypeEnum[number];

export const acctAccounts = pgTable("acct_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code"),
  name: text("name").notNull(),
  type: text("type").$type<AcctAccountType>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const acctExpenses = pgTable("acct_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseDate: timestamp("expense_date").notNull(),
  vendor: text("vendor").notNull(),
  accountId: varchar("account_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").$type<"card" | "check" | "cash" | "ach" | "other">().default("card"),
  memo: text("memo"),
  receiptUrl: text("receipt_url"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AcctAccount = typeof acctAccounts.$inferSelect;
export type AcctExpense = typeof acctExpenses.$inferSelect;

// ============================================================================
// Rebate Programs Module (HEAR / HER case management)
// ============================================================================

export const rebateProgramTypeEnum = ["HEAR", "HER"] as const;
export type RebateProgramType = typeof rebateProgramTypeEnum[number];

export const rebateApplicationStatusEnum = [
  "not_started",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_neighborly",
  "waiting_on_utility",
  "scope_needed",
  "scope_submitted",
  "scope_approved",
  "completion_submitted",
  "completion_approved",
  "approved",
  "paid",
  "declined",
  "not_interested",
  "on_hold",
  "closed",
] as const;
export type RebateApplicationStatus = typeof rebateApplicationStatusEnum[number];

export const rebateWorkflowStepEnum = [
  "program_overview",
  "rebate_request",
  "head_of_household",
  "scope_of_work",
  "contractor_pre_approval",
  "project_completion",
  "completion_attestations",
  "reservation_summary",
] as const;
export type RebateWorkflowStep = typeof rebateWorkflowStepEnum[number];

export const rebateWorkflowStepStatusEnum = [
  "not_started",
  "in_progress",
  "complete",
  "waiting",
  "blocked",
] as const;
export type RebateWorkflowStepStatus = typeof rebateWorkflowStepStatusEnum[number];

export const rebatePriorityEnum = ["low", "normal", "high", "urgent"] as const;
export type RebatePriority = typeof rebatePriorityEnum[number];

export const rebateDocumentCategoryEnum = [
  "rebate_request",
  "head_of_household",
  "scope_of_work",
  "electrical_wiring_pre_retrofit",
  "ahri_certificate",
  "snugg_pro_pdf",
  "fuel_switching_calculator",
  "manual_j_report",
  "quality_install_address_photo",
  "quality_install_hp_post_retrofit",
  "quality_install_elec_wiring_post_retrofit",
  "project_invoices_post",
  "permit_post",
  "contractor_pre_approval",
  "project_completion",
  "completion_attestations",
  "reservation_summary",
  "other",
] as const;
export type RebateDocumentCategory = typeof rebateDocumentCategoryEnum[number];

// Main rebate case record
export const rebateCases = pgTable("rebate_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Summary
  caseNumber: text("case_number"),
  programType: text("program_type").$type<RebateProgramType>().notNull().default("HEAR"),
  applicationStatus: text("application_status").$type<RebateApplicationStatus>().notNull().default("not_started"),
  priority: text("priority").$type<RebatePriority>().notNull().default("normal"),
  assignedToUserId: varchar("assigned_to_user_id").references(() => crmUsers.id, { onDelete: "set null" }),
  customerId: varchar("customer_id").references(() => crmCustomers.id, { onDelete: "set null" }),
  applicationDate: timestamp("application_date"),
  reservationDate: timestamp("reservation_date"),
  approvalDate: timestamp("approval_date"),
  paidDate: timestamp("paid_date"),
  rebateAmount: text("rebate_amount"),
  notes: text("notes"),

  // Client
  clientFirstName: text("client_first_name"),
  clientLastName: text("client_last_name"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  clientDob: text("client_dob"),
  householdSize: integer("household_size"),
  householdIncome: text("household_income"),
  amiBracket: text("ami_bracket"),

  // Rebate Request — Section A: Contractor/Initiator Info (Neighborly form fields)
  initiatorType: text("initiator_type"),           // A.1 Who is initiating
  initiatorCompanyName: text("initiator_company_name"), // A.2 Company name
  initiatorFirstName: text("initiator_first_name"), // A.3a
  initiatorLastName: text("initiator_last_name"),   // A.3b
  initiatorPhone: text("initiator_phone"),           // A.3c
  initiatorEmail: text("initiator_email"),           // A.3d

  // Property
  propertyAddress: text("property_address"),
  propertyAddressLine2: text("property_address_line2"), // A.4 line 2
  propertyCity: text("property_city"),
  propertyState: text("property_state"),
  propertyZip: text("property_zip"),
  addressCertified: boolean("address_certified").default(false), // A.4 certification
  constructionType: text("construction_type"),      // A.5 new/existing
  buildingType: text("building_type"),              // A.6 building type
  buildingSubtype: text("building_subtype"),        // A.6a single family subtype
  isRented: boolean("is_rented"),                   // A.7
  bedroomCount: integer("bedroom_count"),           // A.8
  sqftRange: text("sqft_range"),                    // A.9 conditioned sqft range
  propertyType: text("property_type"),
  ownershipStatus: text("ownership_status"),
  yearBuilt: integer("year_built"),
  squareFootage: integer("square_footage"),

  // Utility
  electricUtility: text("electric_utility"),
  electricAccountNumber: text("electric_account_number"),
  gasUtility: text("gas_utility"),
  gasAccountNumber: text("gas_account_number"),

  // Existing equipment
  existingHeatingType: text("existing_heating_type"),
  existingHeatingAge: integer("existing_heating_age"),
  existingCoolingType: text("existing_cooling_type"),
  existingCoolingAge: integer("existing_cooling_age"),
  existingWaterHeaterType: text("existing_water_heater_type"),
  existingWaterHeaterAge: integer("existing_water_heater_age"),

  // New equipment
  newHeatingType: text("new_heating_type"),
  newHeatingBrand: text("new_heating_brand"),
  newHeatingModel: text("new_heating_model"),
  newHeatingSerial: text("new_heating_serial"),
  newHeatingSeer: text("new_heating_seer"),
  newHeatingHspf: text("new_heating_hspf"),
  newCoolingType: text("new_cooling_type"),
  newCoolingBrand: text("new_cooling_brand"),
  newCoolingModel: text("new_cooling_model"),
  newCoolingSerial: text("new_cooling_serial"),
  newWaterHeaterType: text("new_water_heater_type"),
  newWaterHeaterBrand: text("new_water_heater_brand"),
  newWaterHeaterModel: text("new_water_heater_model"),

  // Scope summary
  scopeSummary: text("scope_summary"),
  installCost: text("install_cost"),
  installDate: timestamp("install_date"),
  installCompletedDate: timestamp("install_completed_date"),

  // Rebate request
  utilityRebateAmount: text("utility_rebate_amount"),
  federalRebateAmount: text("federal_rebate_amount"),
  rebateRequestNotes: text("rebate_request_notes"),

  // Scope of Work — Section C fields
  scopeCounty: text("scope_county"),
  scopeExpectedCompletionDate: text("scope_expected_completion_date"),
  scopeIsDiy: boolean("scope_is_diy").default(false),
  scopeAssociatedHerApp: boolean("scope_associated_her_app").default(false),
  scopeAssociatedDiyApp: boolean("scope_associated_diy_app").default(false),
  electricUtilityType: text("electric_utility_type"),
  electricMunicipalProvider: text("electric_municipal_provider"),
  electricCompanyName: text("electric_company_name"),
  electricMeterNumber: text("electric_meter_number"),
  electricAccountCertified: boolean("electric_account_certified").default(false),
  hasGas: boolean("has_gas"),
  gasCertifiedNoGas: boolean("gas_certified_no_gas").default(false),
  gasProviderType: text("gas_provider_type"),
  gasLocalDistCompany: text("gas_local_dist_company"),
  gasCompanyName: text("gas_company_name"),
  gasMeterNumber: text("gas_meter_number"),
  gasAccountNumberScope: text("gas_account_number_scope"),
  gasAccountCertified: boolean("gas_account_certified").default(false),
  hasDeliveredFuel: boolean("has_delivered_fuel"),
  deliveredFuelCompany: text("delivered_fuel_company"),
  deliveredFuelType: text("delivered_fuel_type"),
  deliveredFuelAccountNumber: text("delivered_fuel_account_number"),
  deliveredFuelAccountCertified: boolean("delivered_fuel_account_certified").default(false),

  // Project Details — Appliances (C.6–C.9)
  scopeIncludesStove: boolean("scope_includes_stove").default(false),
  scopeIncludesDryer: boolean("scope_includes_dryer").default(false),
  scopeIncludesWaterHeater: boolean("scope_includes_water_heater").default(false),
  scopeIncludesHeatPump: boolean("scope_includes_heat_pump").default(false),

  // Heat Pump details (C.9 sub-questions)
  hpRebateRecipient: text("hp_rebate_recipient"),
  hpType: text("hp_type"),
  hpDucted: text("hp_ducted"),
  hpPrimarySource: boolean("hp_primary_source"),
  hpExistingDistributionType: text("hp_existing_distribution_type"),
  hpEnergyStarColdClimate: text("hp_energy_star_cold_climate"),
  hpHeatingLoadPercent: text("hp_heating_load_percent"),
  hpHeatingCapacityBtu: text("hp_heating_capacity_btu"),
  hpCoolingCapacityBtu: text("hp_cooling_capacity_btu"),
  hpMake: text("hp_make"),
  hpModel: text("hp_model"),
  hpExternalRebates: boolean("hp_external_rebates"),
  hpMaterialCost: text("hp_material_cost"),
  hpInstallCost: text("hp_install_cost"),
  hpFuelSwitching: boolean("hp_fuel_switching"),

  // Limited Assessment (existing construction heat pump)
  assessmentDate: text("assessment_date"),
  assessmentYearBuilt: text("assessment_year_built"),
  ceilingInsulationKnown: boolean("ceiling_insulation_known"),
  ceilingInsulationRValue: text("ceiling_insulation_r_value"),
  ceilingInsulationType: text("ceiling_insulation_type"),
  ductsInsulated: text("ducts_insulated"),
  ductsSealed: text("ducts_sealed"),
  envelopeAirSealed: text("envelope_air_sealed"),
  ventilationCfmKnown: boolean("ventilation_cfm_known"),
  ventilationCfm: text("ventilation_cfm"),
  ventilationSystemType: text("ventilation_system_type"),
  coolingSystemType: text("cooling_system_type"),

  // Cooling Systems (limited assessment)
  coolingEfficiencyKnown: boolean("cooling_efficiency_known"),
  coolingEfficiencySeer: text("cooling_efficiency_seer"),
  coolingFloorAreaKnown: boolean("cooling_floor_area_known"),
  coolingFloorAreaPct: text("cooling_floor_area_pct"),

  // Heating System (limited assessment)
  heatingSystemFuelType: text("heating_system_fuel_type"),
  heatingEfficiencyKnown: boolean("heating_efficiency_known"),
  heatingHspf: text("heating_hspf"),
  heatingAfue: text("heating_afue"),
  heatingFloorAreaKnown: boolean("heating_floor_area_known"),
  heatingFloorAreaPct: text("heating_floor_area_pct"),
  electricalPanelAmps: text("electrical_panel_amps"),

  // Electrical Upgrades (C.10–C.11)
  scopeIncludesPanel: boolean("scope_includes_panel").default(false),
  scopeIncludesWiring: boolean("scope_includes_wiring").default(false),
  wiringExternalRebates: boolean("wiring_external_rebates"),
  wiringMaterialCost: text("wiring_material_cost"),
  wiringInstallCost: text("wiring_install_cost"),

  // Insulation / air sealing / ventilation
  scopeIncludesInsulation: boolean("scope_includes_insulation"),

  // Estimated Project Financials
  totalExternalRebate: text("total_external_rebate"),
  totalEstimatedProjectCost: text("total_estimated_project_cost"),
  estimatedRebate50Pct: text("estimated_rebate_50_pct"),
  estimatedRebate100Pct: text("estimated_rebate_100_pct"),

  // Head of Household confirmation
  hohConfirmed: boolean("hoh_confirmed").default(false),
  hohConfirmedDate: text("hoh_confirmed_date"),
  hohNotes: text("hoh_notes"),

  // Contractor pre-approval
  contractorName: text("contractor_name"),
  contractorLicenseNumber: text("contractor_license_number"),
  preApprovalStatus: text("pre_approval_status"),
  preApprovalSubmittedDate: timestamp("pre_approval_submitted_date"),
  preApprovalApprovedDate: timestamp("pre_approval_approved_date"),
  preApprovalNotes: text("pre_approval_notes"),

  // Project completion
  completionNotes: text("completion_notes"),

  // Post-Installation Information (heat pump)
  postHpType: text("post_hp_type"),
  postHpEnergyStarColdClimate: text("post_hp_energy_star_cold_climate"),
  postHpHeatingLoadPercent: text("post_hp_heating_load_percent"),
  postHpHeatingCapacityBtu: text("post_hp_heating_capacity_btu"),
  postHpCoolingCapacityBtu: text("post_hp_cooling_capacity_btu"),
  postHpModelNumber: text("post_hp_model_number"),
  postHpCount: integer("post_hp_count"),
  postHpSerialNumber: text("post_hp_serial_number"),
  postHpMake: text("post_hp_make"),
  postHpExternalRebates: boolean("post_hp_external_rebates"),
  postHpFinalMaterialCost: text("post_hp_final_material_cost"),
  postHpFinalInstallCost: text("post_hp_final_install_cost"),
  postElecCount: integer("post_elec_count"),
  postElecModelNumber: text("post_elec_model_number"),
  postElecExternalRebates: boolean("post_elec_external_rebates"),
  postElecFinalMaterialCost: text("post_elec_final_material_cost"),
  postElecFinalInstallCost: text("post_elec_final_install_cost"),

  // Completion attestations
  customerAttestationSigned: boolean("customer_attestation_signed").default(false),
  customerAttestationDate: timestamp("customer_attestation_date"),
  contractorAttestationSigned: boolean("contractor_attestation_signed").default(false),
  contractorAttestationDate: timestamp("contractor_attestation_date"),
  attestationNotes: text("attestation_notes"),

  // Reservation summary
  reservationNumber: text("reservation_number"),
  paymentReleaseAmount: text("payment_release_amount"),
  caseCloseoutDate: timestamp("case_closeout_date"),
  caseCloseoutNotes: text("case_closeout_notes"),

  createdByUserId: varchar("created_by_user_id").references(() => crmUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const coerceRebateDate = z.union([
  z.string().transform((val) => val ? new Date(val) : null),
  z.date(),
  z.null(),
]).nullable().optional();

export const insertRebateCaseSchema = createInsertSchema(rebateCases)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    applicationDate: coerceRebateDate,
    reservationDate: coerceRebateDate,
    approvalDate: coerceRebateDate,
    paidDate: coerceRebateDate,
    installDate: coerceRebateDate,
    installCompletedDate: coerceRebateDate,
    preApprovalSubmittedDate: coerceRebateDate,
    preApprovalApprovedDate: coerceRebateDate,
    customerAttestationDate: coerceRebateDate,
    contractorAttestationDate: coerceRebateDate,
    caseCloseoutDate: coerceRebateDate,
  });
export type InsertRebateCase = z.infer<typeof insertRebateCaseSchema>;
export type RebateCase = typeof rebateCases.$inferSelect;

// Workflow steps - 8 seeded per case
export const rebateCaseWorkflowSteps = pgTable("rebate_case_workflow_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => rebateCases.id, { onDelete: "cascade" }),
  step: text("step").$type<RebateWorkflowStep>().notNull(),
  status: text("status").$type<RebateWorkflowStepStatus>().notNull().default("not_started"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id").references(() => crmUsers.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRebateCaseWorkflowStepSchema = createInsertSchema(rebateCaseWorkflowSteps).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertRebateCaseWorkflowStep = z.infer<typeof insertRebateCaseWorkflowStepSchema>;
export type RebateCaseWorkflowStep = typeof rebateCaseWorkflowSteps.$inferSelect;

// Scope checklist - 12 seeded items per case
export const rebateCaseScopeChecklist = pgTable("rebate_case_scope_checklist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => rebateCases.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  isChecked: boolean("is_checked").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id").references(() => crmUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRebateCaseScopeChecklistSchema = createInsertSchema(rebateCaseScopeChecklist).omit({
  id: true, createdAt: true,
});
export type InsertRebateCaseScopeChecklist = z.infer<typeof insertRebateCaseScopeChecklistSchema>;
export type RebateCaseScopeChecklist = typeof rebateCaseScopeChecklist.$inferSelect;

// Documents
export const rebateCaseDocuments = pgTable("rebate_case_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => rebateCases.id, { onDelete: "cascade" }),
  category: text("category").$type<RebateDocumentCategory>().notNull().default("other"),
  name: text("name").notNull(),
  url: text("url").notNull(),
  objectPath: text("object_path"),
  contentType: text("content_type"),
  size: integer("size"),
  notes: text("notes"),
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => crmUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRebateCaseDocumentSchema = createInsertSchema(rebateCaseDocuments).omit({
  id: true, createdAt: true,
});
export type InsertRebateCaseDocument = z.infer<typeof insertRebateCaseDocumentSchema>;
export type RebateCaseDocument = typeof rebateCaseDocuments.$inferSelect;

// Activity log (timeline per case)
export const rebateCaseActivityLog = pgTable("rebate_case_activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => rebateCases.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => crmUsers.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  description: text("description"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRebateCaseActivityLogSchema = createInsertSchema(rebateCaseActivityLog).omit({
  id: true, createdAt: true,
});
export type InsertRebateCaseActivityLog = z.infer<typeof insertRebateCaseActivityLogSchema>;
export type RebateCaseActivityLog = typeof rebateCaseActivityLog.$inferSelect;

// ============================================================
// E-Signature (DocuSign-like) module
// ============================================================

// A document to be signed (an uploaded PDF + its workflow state)
export const signatureDocuments = pgTable("signature_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"), // draft | sent | completed | voided
  originalObjectPath: text("original_object_path").notNull(), // /objects/... of uploaded pdf
  signedObjectPath: text("signed_object_path"), // /objects/... of flattened, signed pdf
  pageCount: integer("page_count").notNull().default(1),
  message: text("message"), // optional message included in the signing email
  createdBy: varchar("created_by").references(() => crmUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  voidedAt: timestamp("voided_at"),
  // Optional deposit / payment request attached to the document. The admin
  // sets it up before sending; the customer can pay after they finish signing.
  // The entered value (percent-of-total or exact amount) is resolved to
  // depositAmountCents at save time so the public side just charges that.
  depositEnabled: boolean("deposit_enabled").notNull().default(false),
  depositMode: text("deposit_mode"), // "amount" | "percent"
  contractTotalCents: integer("contract_total_cents"), // percent mode only
  depositPercentage: integer("deposit_percentage"), // percent mode only
  depositAmountCents: integer("deposit_amount_cents"), // resolved amount to charge
  stripePaymentLinkId: text("stripe_payment_link_id"),
  stripePaymentLinkUrl: text("stripe_payment_link_url"),
  depositPaidAt: timestamp("deposit_paid_at"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
});

export const insertSignatureDocumentSchema = createInsertSchema(signatureDocuments).omit({
  id: true, createdAt: true, sentAt: true, completedAt: true, voidedAt: true,
});
export type InsertSignatureDocument = z.infer<typeof insertSignatureDocumentSchema>;
export type SignatureDocument = typeof signatureDocuments.$inferSelect;

// A person who must sign / fill fields on a document
export const signatureRecipients = pgTable("signature_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => signatureDocuments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  signingOrder: integer("signing_order").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | sent | viewed | signed
  token: varchar("token"), // unique public signing token (set on send)
  color: text("color").notNull().default("#711419"), // UI color for this recipient's fields
  viewedAt: timestamp("viewed_at"),
  signedAt: timestamp("signed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tokenIdx: uniqueIndex("signature_recipients_token_idx").on(table.token),
  docIdx: index("signature_recipients_doc_idx").on(table.documentId),
}));

export const insertSignatureRecipientSchema = createInsertSchema(signatureRecipients).omit({
  id: true, createdAt: true, viewedAt: true, signedAt: true, token: true, status: true,
});
export type InsertSignatureRecipient = z.infer<typeof insertSignatureRecipientSchema>;
export type SignatureRecipient = typeof signatureRecipients.$inferSelect;

// A field placed on the document, assigned to a recipient.
// Coordinates are fractions (0..1) of the page size, measured from the TOP-LEFT.
export const signatureFields = pgTable("signature_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => signatureDocuments.id, { onDelete: "cascade" }),
  recipientId: varchar("recipient_id").notNull().references(() => signatureRecipients.id, { onDelete: "cascade" }),
  page: integer("page").notNull().default(1),
  type: text("type").notNull(), // signature | initials | date | text | name
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  width: doublePrecision("width").notNull(),
  height: doublePrecision("height").notNull(),
  required: boolean("required").notNull().default(true),
  value: text("value"), // filled value: signature image data-URL, or typed text/date/name
  completedAt: timestamp("completed_at"),
}, (table) => ({
  docIdx: index("signature_fields_doc_idx").on(table.documentId),
  recipientIdx: index("signature_fields_recipient_idx").on(table.recipientId),
}));

export const insertSignatureFieldSchema = createInsertSchema(signatureFields).omit({
  id: true, completedAt: true,
});
export type InsertSignatureField = z.infer<typeof insertSignatureFieldSchema>;
export type SignatureField = typeof signatureFields.$inferSelect;
