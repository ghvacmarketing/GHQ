import { type Quote, type InsertQuote, type PartData, type InsertPart, type Technician, type InsertTechnician, type Process, type InsertProcess, type ProcessAttachment, type InsertProcessAttachment, type Category, type InsertCategory, type Setting, type InsertSetting, type PdfFile, type InsertPdfFile, type Announcement, type InsertAnnouncement, type PhoneWhitelist, type InsertPhoneWhitelist, type AuthToken, type InsertAuthToken, type Lead, type InsertLead, type InsertLeadHistory, type LeadHistory, type ImportBatch, type InsertImportBatch, type Customer, type InsertCustomer, type CustomerImportBatch, type InsertCustomerImportBatch, quotes, parts, technicians, processes, processAttachments, categories, settings, pdfFiles, announcements, phoneWhitelist, authTokens, leads, leadHistory, importBatches, customers, customerImportBatches } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, or, and, ilike, sql } from "drizzle-orm";

export interface IStorage {
  // Quote operations
  getQuote(id: string): Promise<Quote | undefined>;
  getAllQuotes(): Promise<Quote[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, quote: Partial<Quote>): Promise<Quote | undefined>;
  deleteQuote(id: string): Promise<boolean>;
  
  // Part operations
  getPart(id: string): Promise<PartData | undefined>;
  getAllParts(): Promise<PartData[]>;
  getPartsByCategory(category: string): Promise<PartData[]>;
  createPart(part: InsertPart): Promise<PartData>;
  
  // Technician operations
  getTechnician(id: string): Promise<Technician | undefined>;
  getAllTechnicians(): Promise<Technician[]>;
  createTechnician(technician: InsertTechnician): Promise<Technician>;
  
  // Process operations
  getProcess(id: string): Promise<Process | undefined>;
  getAllProcesses(): Promise<Process[]>;
  getProcessesByCategory(category: string): Promise<Process[]>;
  createProcess(process: InsertProcess): Promise<Process>;
  updateProcess(id: string, process: Partial<Process>): Promise<Process | undefined>;
  deleteProcess(id: string): Promise<boolean>;
  
  // Process Attachment operations
  getProcessAttachment(id: string): Promise<ProcessAttachment | undefined>;
  getProcessAttachments(processId: string): Promise<ProcessAttachment[]>;
  createProcessAttachment(attachment: InsertProcessAttachment): Promise<ProcessAttachment>;
  deleteProcessAttachment(id: string): Promise<boolean>;
  updateAttachmentOrder(id: string, displayOrder: string): Promise<ProcessAttachment | undefined>;
  
  // Category operations
  getAllCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<Category>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  
  // Settings operations
  getSetting(key: string): Promise<Setting | undefined>;
  getAllSettings(): Promise<Setting[]>;
  setSetting(key: string, value: string): Promise<Setting>;
  updateSetting(key: string, value: string): Promise<Setting>;
  deleteSetting(key: string): Promise<boolean>;
  
  // PDF File operations
  getPriceBookPdf(): Promise<PdfFile | undefined>;
  getAllPdfFiles(): Promise<PdfFile[]>;
  uploadPriceBookPdf(pdfData: InsertPdfFile): Promise<PdfFile>;
  createPdfFile(pdfData: InsertPdfFile): Promise<PdfFile>;
  deletePriceBookPdf(): Promise<boolean>;
  
  // Announcement operations
  getActiveAnnouncement(): Promise<Announcement | undefined>;
  getAllAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: string, announcement: Partial<Announcement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: string): Promise<boolean>;
  
  // Phone Whitelist operations
  getPhoneWhitelistEntry(phoneNumber: string): Promise<PhoneWhitelist | undefined>;
  getAllPhoneWhitelist(): Promise<PhoneWhitelist[]>;
  createPhoneWhitelistEntry(entry: InsertPhoneWhitelist): Promise<PhoneWhitelist>;
  deletePhoneWhitelistEntry(id: string): Promise<boolean>;
  
  // Auth Token operations
  createAuthToken(token: InsertAuthToken): Promise<AuthToken>;
  getAuthToken(token: string): Promise<AuthToken | undefined>;
  deleteAuthToken(token: string): Promise<boolean>;
  deleteExpiredTokens(): Promise<number>;
  
  // Lead Management operations
  getLead(id: string): Promise<Lead | undefined>;
  getAllLeads(): Promise<Lead[]>;
  getLeadsByStatus(status: string): Promise<Lead[]>;
  getActiveLeads(): Promise<Lead[]>; // Not won or lost
  getWonLeads(): Promise<Lead[]>;
  getLostLeads(): Promise<Lead[]>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: string, lead: Partial<Lead>): Promise<Lead | undefined>;
  deleteLead(id: string): Promise<boolean>;
  findDuplicateLead(phone?: string, email?: string, externalId?: string): Promise<Lead | undefined>;
  
  // Lead History operations
  createLeadHistory(history: InsertLeadHistory): Promise<LeadHistory>;
  getLeadHistory(leadId: string): Promise<LeadHistory[]>;
  
  // Import Batch operations
  createImportBatch(batch: InsertImportBatch): Promise<ImportBatch>;
  getImportBatch(id: string): Promise<ImportBatch | undefined>;
  getAllImportBatches(): Promise<ImportBatch[]>;
  
  // Customer Database operations (FieldEdge imports)
  getCustomer(id: string): Promise<Customer | undefined>;
  getAllCustomers(): Promise<Customer[]>;
  searchCustomers(term: string, searchAll?: boolean): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<Customer>): Promise<Customer | undefined>;
  upsertCustomerByChecksum(customer: InsertCustomer): Promise<{ action: 'created' | 'updated' | 'skipped'; customer: Customer }>;
  getCustomerByChecksum(checksum: string): Promise<Customer | undefined>;
  batchImportCustomers(customerList: InsertCustomer[]): Promise<{ created: number; updated: number; skipped: number; errors: number }>;
  
  // Customer Import Batch operations
  createCustomerImportBatch(batch: InsertCustomerImportBatch): Promise<CustomerImportBatch>;
  updateCustomerImportBatch(id: string, batch: Partial<CustomerImportBatch>): Promise<CustomerImportBatch | undefined>;
  getCustomerImportBatch(id: string): Promise<CustomerImportBatch | undefined>;
  getCustomerImportBatchByFileHash(fileHash: string): Promise<CustomerImportBatch | undefined>;
  getAllCustomerImportBatches(): Promise<CustomerImportBatch[]>;
  
  // Backup operations
  clearAllData(): Promise<void>;
}

// Old MemStorage removed - now using DatabaseStorage with persistent PostgreSQL

export class DatabaseStorage implements IStorage {
  // Quote operations
  async getQuote(id: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote || undefined;
  }

  async getAllQuotes(): Promise<Quote[]> {
    const allQuotes = await db.select().from(quotes).orderBy(quotes.createdAt);
    return allQuotes.reverse(); // Most recent first
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const [quote] = await db
      .insert(quotes)
      .values([insertQuote])
      .returning();
    return quote;
  }

  async updateQuote(id: string, updateData: Partial<Quote>): Promise<Quote | undefined> {
    const [quote] = await db
      .update(quotes)
      .set(updateData)
      .where(eq(quotes.id, id))
      .returning();
    return quote || undefined;
  }

  async deleteQuote(id: string): Promise<boolean> {
    const result = await db.delete(quotes).where(eq(quotes.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Part operations
  async getPart(id: string): Promise<PartData | undefined> {
    const [part] = await db.select().from(parts).where(eq(parts.id, id));
    return part || undefined;
  }

  async getAllParts(): Promise<PartData[]> {
    return await db.select().from(parts);
  }

  async getPartsByCategory(category: string): Promise<PartData[]> {
    return await db.select().from(parts).where(eq(parts.category, category));
  }

  async createPart(insertPart: InsertPart): Promise<PartData> {
    const [part] = await db
      .insert(parts)
      .values(insertPart)
      .returning();
    return part;
  }

  // Technician operations
  async getTechnician(id: string): Promise<Technician | undefined> {
    const [technician] = await db.select().from(technicians).where(eq(technicians.id, id));
    return technician || undefined;
  }

  async getAllTechnicians(): Promise<Technician[]> {
    return await db.select().from(technicians);
  }

  async createTechnician(insertTechnician: InsertTechnician): Promise<Technician> {
    const [technician] = await db
      .insert(technicians)
      .values(insertTechnician)
      .returning();
    return technician;
  }

  async deleteTechnician(id: string): Promise<boolean> {
    const result = await db.delete(technicians).where(eq(technicians.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Process operations
  async getProcess(id: string): Promise<Process | undefined> {
    const [process] = await db.select().from(processes).where(eq(processes.id, id));
    return process || undefined;
  }

  async getAllProcesses(): Promise<Process[]> {
    const allProcesses = await db.select().from(processes).orderBy(processes.createdAt);
    return allProcesses.reverse(); // Most recent first
  }

  async getProcessesByCategory(category: string): Promise<Process[]> {
    return await db.select().from(processes).where(eq(processes.category, category));
  }

  async createProcess(insertProcess: InsertProcess): Promise<Process> {
    const [process] = await db
      .insert(processes)
      .values([insertProcess])
      .returning();
    return process;
  }

  async updateProcess(id: string, updateData: Partial<Process>): Promise<Process | undefined> {
    const [process] = await db
      .update(processes)
      .set(updateData)
      .where(eq(processes.id, id))
      .returning();
    return process || undefined;
  }

  async deleteProcess(id: string): Promise<boolean> {
    // First delete all attachments for this process
    await db.delete(processAttachments).where(eq(processAttachments.processId, id));
    // Then delete the process itself
    const result = await db.delete(processes).where(eq(processes.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Process Attachment operations
  async getProcessAttachment(id: string): Promise<ProcessAttachment | undefined> {
    const [attachment] = await db.select().from(processAttachments).where(eq(processAttachments.id, id));
    return attachment || undefined;
  }

  async getProcessAttachments(processId: string): Promise<ProcessAttachment[]> {
    return await db.select().from(processAttachments)
      .where(eq(processAttachments.processId, processId))
      .orderBy(processAttachments.displayOrder);
  }

  async createProcessAttachment(insertAttachment: InsertProcessAttachment): Promise<ProcessAttachment> {
    const [attachment] = await db
      .insert(processAttachments)
      .values(insertAttachment)
      .returning();
    return attachment;
  }

  async deleteProcessAttachment(id: string): Promise<boolean> {
    const result = await db.delete(processAttachments).where(eq(processAttachments.id, id));
    return (result.rowCount || 0) > 0;
  }

  async updateAttachmentOrder(id: string, displayOrder: string): Promise<ProcessAttachment | undefined> {
    const [attachment] = await db
      .update(processAttachments)
      .set({ displayOrder })
      .where(eq(processAttachments.id, id))
      .returning();
    return attachment || undefined;
  }

  // Category operations
  async getAllCategories(): Promise<Category[]> {
    const allCategories = await db.select().from(categories).orderBy(categories.order);
    return allCategories;
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db
      .insert(categories)
      .values(insertCategory)
      .returning();
    return category;
  }

  async updateCategory(id: string, updateData: Partial<Category>): Promise<Category | undefined> {
    const [category] = await db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();
    return category || undefined;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await db.delete(categories).where(eq(categories.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Settings operations
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting || undefined;
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(settings)
        .values({ key, value })
        .returning();
      return created;
    }
  }

  async deleteSetting(key: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.key, key));
    return (result.rowCount || 0) > 0;
  }

  async updateSetting(key: string, value: string): Promise<Setting> {
    return this.setSetting(key, value);
  }

  // PDF File operations
  async getPriceBookPdf(): Promise<PdfFile | undefined> {
    const [pdf] = await db.select().from(pdfFiles).orderBy(pdfFiles.uploadedAt).limit(1);
    return pdf || undefined;
  }

  async getAllPdfFiles(): Promise<PdfFile[]> {
    return await db.select().from(pdfFiles).orderBy(pdfFiles.uploadedAt);
  }

  async uploadPriceBookPdf(pdfData: InsertPdfFile): Promise<PdfFile> {
    // Delete existing price book PDF first (we only want one at a time)
    await db.delete(pdfFiles);
    
    const [pdf] = await db
      .insert(pdfFiles)
      .values(pdfData)
      .returning();
    return pdf;
  }

  async deletePriceBookPdf(): Promise<boolean> {
    const result = await db.delete(pdfFiles);
    return (result.rowCount || 0) > 0;
  }

  async createPdfFile(pdfData: InsertPdfFile): Promise<PdfFile> {
    return this.uploadPriceBookPdf(pdfData);
  }

  // Announcement operations
  async getActiveAnnouncement(): Promise<Announcement | undefined> {
    const [announcement] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.isActive, true))
      .limit(1);
    return announcement || undefined;
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return await db.select().from(announcements).orderBy(announcements.createdAt);
  }

  async createAnnouncement(insertAnnouncement: InsertAnnouncement): Promise<Announcement> {
    // Deactivate all existing announcements
    await db.update(announcements).set({ isActive: false });
    
    // Get the highest version number and increment
    const allAnnouncements = await this.getAllAnnouncements();
    const maxVersion = allAnnouncements.length > 0 
      ? Math.max(...allAnnouncements.map(a => parseInt(a.version) || 0))
      : 0;
    
    const [announcement] = await db
      .insert(announcements)
      .values({
        ...insertAnnouncement,
        version: String(maxVersion + 1),
        isActive: true,
      })
      .returning();
    return announcement;
  }

  async updateAnnouncement(id: string, updateData: Partial<Announcement>): Promise<Announcement | undefined> {
    const [announcement] = await db
      .update(announcements)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return announcement || undefined;
  }

  async deleteAnnouncement(id: string): Promise<boolean> {
    const result = await db.delete(announcements).where(eq(announcements.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Phone Whitelist operations
  async getPhoneWhitelistEntry(phoneNumber: string): Promise<PhoneWhitelist | undefined> {
    const [entry] = await db
      .select()
      .from(phoneWhitelist)
      .where(eq(phoneWhitelist.phoneNumber, phoneNumber));
    return entry || undefined;
  }

  async getAllPhoneWhitelist(): Promise<PhoneWhitelist[]> {
    return await db.select().from(phoneWhitelist).orderBy(phoneWhitelist.createdAt);
  }

  async createPhoneWhitelistEntry(insertEntry: InsertPhoneWhitelist): Promise<PhoneWhitelist> {
    const [entry] = await db
      .insert(phoneWhitelist)
      .values(insertEntry)
      .returning();
    return entry;
  }

  async deletePhoneWhitelistEntry(id: string): Promise<boolean> {
    const result = await db.delete(phoneWhitelist).where(eq(phoneWhitelist.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Auth Token operations
  async createAuthToken(insertToken: InsertAuthToken): Promise<AuthToken> {
    const [token] = await db
      .insert(authTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getAuthToken(token: string): Promise<AuthToken | undefined> {
    const [authToken] = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.token, token));
    return authToken || undefined;
  }

  async deleteAuthToken(token: string): Promise<boolean> {
    const result = await db.delete(authTokens).where(eq(authTokens.token, token));
    return (result.rowCount || 0) > 0;
  }

  async deleteExpiredTokens(): Promise<number> {
    const result = await db.delete(authTokens).where(eq(authTokens.expiresAt, new Date()));
    return result.rowCount || 0;
  }

  // Lead Management operations
  // Helper to normalize lead data (coerce booleans from database strings)
  private normalizeLead(lead: any): Lead {
    return {
      ...lead,
      won: Boolean(lead.won),
      lost: Boolean(lead.lost),
    };
  }

  async getLead(id: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead ? this.normalizeLead(lead) : undefined;
  }

  async getAllLeads(): Promise<Lead[]> {
    const allLeads = await db.select().from(leads).orderBy(leads.createdAt);
    return allLeads.reverse().map(lead => this.normalizeLead(lead)); // Most recent first
  }

  async getLeadsByStatus(status: string): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .where(and(eq(leads.status, status), eq(leads.won, false), eq(leads.lost, false)))
      .orderBy(leads.createdAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async getActiveLeads(): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .where(and(eq(leads.won, false), eq(leads.lost, false)))
      .orderBy(leads.createdAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async getWonLeads(): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.won, true))
      .orderBy(leads.closedAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async getLostLeads(): Promise<Lead[]> {
    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.lost, true))
      .orderBy(leads.closedAt);
    return result.map(lead => this.normalizeLead(lead));
  }

  async createLead(insertLead: InsertLead): Promise<Lead> {
    const [lead] = await db
      .insert(leads)
      .values(insertLead)
      .returning();
    return this.normalizeLead(lead);
  }

  async updateLead(id: string, updateData: Partial<Lead>): Promise<Lead | undefined> {
    const [lead] = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, id))
      .returning();
    return lead ? this.normalizeLead(lead) : undefined;
  }

  async deleteLead(id: string): Promise<boolean> {
    const result = await db.delete(leads).where(eq(leads.id, id));
    return (result.rowCount || 0) > 0;
  }

  async findDuplicateLead(phone?: string, email?: string, externalId?: string): Promise<Lead | undefined> {
    const conditions = [];
    
    // Primary: Match by externalId if provided
    if (externalId) {
      conditions.push(eq(leads.externalId, externalId));
    }
    
    // Secondary: Match by phone (normalized)
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, ''); // Remove all non-digits
      if (normalizedPhone) {
        conditions.push(eq(leads.phone, phone));
      }
    }
    
    // Tertiary: Match by email
    if (email) {
      conditions.push(eq(leads.email, email.toLowerCase()));
    }
    
    if (conditions.length === 0) {
      return undefined;
    }
    
    // Find lead matching any of the conditions
    const [lead] = await db
      .select()
      .from(leads)
      .where(or(...conditions))
      .limit(1);
    
    return lead ? this.normalizeLead(lead) : undefined;
  }

  // Lead History operations
  async createLeadHistory(insertHistory: InsertLeadHistory): Promise<LeadHistory> {
    const [history] = await db
      .insert(leadHistory)
      .values(insertHistory)
      .returning();
    return history;
  }

  async getLeadHistory(leadId: string): Promise<LeadHistory[]> {
    const history = await db
      .select()
      .from(leadHistory)
      .where(eq(leadHistory.leadId, leadId))
      .orderBy(leadHistory.createdAt);
    return history.reverse(); // Most recent first
  }

  // Import Batch operations
  async createImportBatch(insertBatch: InsertImportBatch): Promise<ImportBatch> {
    const [batch] = await db
      .insert(importBatches)
      .values(insertBatch)
      .returning();
    return batch;
  }

  async getImportBatch(id: string): Promise<ImportBatch | undefined> {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
    return batch || undefined;
  }

  async getAllImportBatches(): Promise<ImportBatch[]> {
    return await db.select().from(importBatches).orderBy(importBatches.importedAt);
  }

  // Customer Database operations (FieldEdge imports)
  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async getAllCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(customers.displayName);
  }

  async searchCustomers(term: string, searchAll: boolean = false): Promise<Customer[]> {
    if (!term || term.trim().length < 2) {
      return [];
    }
    const searchTerm = `%${term.trim()}%`;
    
    // Default: search by name only. If searchAll is true, also search phone, email, address
    const whereCondition = searchAll
      ? or(
          ilike(customers.displayName, searchTerm),
          ilike(customers.email, searchTerm),
          ilike(customers.fullAddress, searchTerm),
          ilike(customers.phone, searchTerm)
        )
      : ilike(customers.displayName, searchTerm);
    
    const results = await db
      .select()
      .from(customers)
      .where(whereCondition)
      .limit(50);
    return results;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async updateCustomer(id: string, updateData: Partial<Customer>): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set({ ...updateData, lastSyncedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return customer || undefined;
  }

  async getCustomerByChecksum(checksum: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.checksum, checksum));
    return customer || undefined;
  }

  async upsertCustomerByChecksum(insertCustomer: InsertCustomer): Promise<{ action: 'created' | 'updated' | 'skipped'; customer: Customer }> {
    // If no checksum, just create
    if (!insertCustomer.checksum) {
      const customer = await this.createCustomer(insertCustomer);
      return { action: 'created', customer };
    }

    // Check for existing customer with same checksum (no changes needed)
    const existingByChecksum = await this.getCustomerByChecksum(insertCustomer.checksum);
    if (existingByChecksum) {
      return { action: 'skipped', customer: existingByChecksum };
    }

    // Look for existing customer by displayName + address to update
    const existing = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.displayName, insertCustomer.displayName),
          insertCustomer.fullAddress 
            ? eq(customers.fullAddress, insertCustomer.fullAddress)
            : sql`${customers.fullAddress} IS NULL`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing customer
      const updated = await this.updateCustomer(existing[0].id, {
        ...insertCustomer,
        lastSyncedAt: new Date(),
      });
      return { action: 'updated', customer: updated! };
    }

    // Create new customer
    const customer = await this.createCustomer(insertCustomer);
    return { action: 'created', customer };
  }

  async batchImportCustomers(customerList: InsertCustomer[]): Promise<{ created: number; updated: number; skipped: number; errors: number }> {
    if (customerList.length === 0) {
      return { created: 0, updated: 0, skipped: 0, errors: 0 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Step 1: Get all existing checksums in one query for fast lookup
    const existingCustomers = await db.select({
      id: customers.id,
      checksum: customers.checksum,
      displayName: customers.displayName,
      fullAddress: customers.fullAddress,
    }).from(customers);

    // Build lookup maps
    const checksumMap = new Map<string, string>(); // checksum -> id
    const nameAddressMap = new Map<string, string>(); // "name|address" -> id
    
    for (const c of existingCustomers) {
      if (c.checksum) {
        checksumMap.set(c.checksum, c.id);
      }
      nameAddressMap.set(`${c.displayName}|${c.fullAddress || ''}`, c.id);
    }

    // Step 2: Categorize records
    const toCreate: InsertCustomer[] = [];
    const toUpdate: { id: string; data: InsertCustomer }[] = [];

    for (const customer of customerList) {
      try {
        if (!customer.displayName) {
          skipped++;
          continue;
        }

        // Check if identical checksum exists (skip)
        if (customer.checksum && checksumMap.has(customer.checksum)) {
          skipped++;
          continue;
        }

        // Check if customer exists by name+address (update)
        const key = `${customer.displayName}|${customer.fullAddress || ''}`;
        const existingId = nameAddressMap.get(key);
        
        if (existingId) {
          toUpdate.push({ id: existingId, data: customer });
        } else {
          toCreate.push(customer);
        }
      } catch (e) {
        errors++;
      }
    }

    // Step 3: Batch insert new customers (in chunks of 100)
    const BATCH_SIZE = 100;
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      try {
        await db.insert(customers).values(batch);
        created += batch.length;
      } catch (e) {
        // If batch fails, try individual inserts
        for (const customer of batch) {
          try {
            await db.insert(customers).values(customer);
            created++;
          } catch (innerE) {
            errors++;
          }
        }
      }
    }

    // Step 4: Update existing customers (individual updates for now, could be optimized further)
    for (const { id, data } of toUpdate) {
      try {
        await db.update(customers)
          .set({ ...data, lastSyncedAt: new Date() })
          .where(eq(customers.id, id));
        updated++;
      } catch (e) {
        errors++;
      }
    }

    return { created, updated, skipped, errors };
  }

  // Customer Import Batch operations
  async createCustomerImportBatch(insertBatch: InsertCustomerImportBatch): Promise<CustomerImportBatch> {
    const [batch] = await db
      .insert(customerImportBatches)
      .values(insertBatch)
      .returning();
    return batch;
  }

  async updateCustomerImportBatch(id: string, updateData: Partial<CustomerImportBatch>): Promise<CustomerImportBatch | undefined> {
    const [batch] = await db
      .update(customerImportBatches)
      .set(updateData)
      .where(eq(customerImportBatches.id, id))
      .returning();
    return batch || undefined;
  }

  async getCustomerImportBatch(id: string): Promise<CustomerImportBatch | undefined> {
    const [batch] = await db
      .select()
      .from(customerImportBatches)
      .where(eq(customerImportBatches.id, id));
    return batch || undefined;
  }

  async getCustomerImportBatchByFileHash(fileHash: string): Promise<CustomerImportBatch | undefined> {
    const [batch] = await db
      .select()
      .from(customerImportBatches)
      .where(eq(customerImportBatches.fileHash, fileHash));
    return batch || undefined;
  }

  async getAllCustomerImportBatches(): Promise<CustomerImportBatch[]> {
    const batches = await db
      .select()
      .from(customerImportBatches)
      .orderBy(customerImportBatches.importedAt);
    return batches.reverse(); // Most recent first
  }

  // Backup operations
  async clearAllData(): Promise<void> {
    // Clear all tables except sessions (preserve active sessions)
    await db.delete(customerImportBatches);
    await db.delete(customers);
    await db.delete(importBatches);
    await db.delete(leadHistory);
    await db.delete(leads);
    await db.delete(authTokens);
    await db.delete(phoneWhitelist);
    await db.delete(announcements);
    await db.delete(pdfFiles);
    await db.delete(settings);
    await db.delete(processes);
    await db.delete(quotes);
    await db.delete(technicians);
    await db.delete(parts);
    await db.delete(categories);
  }

  // Initialize default data if needed
  async initializeDefaultData() {
    // Check if technicians already exist
    const existingTechs = await this.getAllTechnicians();
    if (existingTechs.length === 0) {
      const defaultTechnicians = [
        { name: "Brian", email: "brian@ghvac.com" },
        { name: "Zack", email: "zack@ghvac.com" },
        { name: "Sutton", email: "sutton@ghvac.com" },
      ];

      for (const tech of defaultTechnicians) {
        await this.createTechnician(tech);
      }
    }

    // Check if parts already exist
    const existingParts = await this.getAllParts();
    if (existingParts.length === 0) {
      const defaultParts = [
        // Main Components
        { partNumber: "CB-001", description: "Control Board", category: "Parts", price: "0.00", availability: "Available", vendor: "Various", warranty: true, isCustom: false },
        { partNumber: "EC-001", description: "Evaporator Coil", category: "Parts", price: "0.00", availability: "Available", vendor: "Various", warranty: true, isCustom: false },
        { partNumber: "COMP-001", description: "Compressor", category: "Parts", price: "0.00", availability: "Available", vendor: "Various", warranty: true, isCustom: false },
        
        // Materials (no specific part numbers - category suggestions)
        { partNumber: "MAT-RFD", description: "Refrigerant Filter Dryer", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-COP", description: "Copper", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-INS", description: "Armaflex Insulation", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-AA", description: "Acid Away", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
        { partNumber: "MAT-REF", description: "Refrigerant", category: "Materials", price: "0.00", availability: "Available", vendor: "Various", warranty: false, isCustom: false },
      ];

      for (const part of defaultParts) {
        await this.createPart(part);
      }
    }

    // Check if categories already exist
    const existingCategories = await this.getAllCategories();
    if (existingCategories.length === 0) {
      const defaultCategories = [
        { name: "Maintenance", order: "1" },
        { name: "Repair", order: "2" },
        { name: "Installation", order: "3" },
        { name: "Troubleshooting", order: "4" },
        { name: "Safety", order: "5" },
        { name: "System Setup", order: "6" },
      ];

      for (const category of defaultCategories) {
        await this.createCategory(category);
      }
    }
  }
}

// Initialize database storage and default data
const databaseStorage = new DatabaseStorage();

// Initialize default data on startup
databaseStorage.initializeDefaultData().catch(console.error);

export const storage = databaseStorage;
