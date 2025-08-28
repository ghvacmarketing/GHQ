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
  status: text("status").default("draft"), // draft, pending, accepted
  quoteText: text("quote_text"),
  emailSent: boolean("email_sent").default(false),
  trelloCardId: text("trello_card_id"),
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
