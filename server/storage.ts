import { type Quote, type InsertQuote, type PartData, type InsertPart, type Technician, type InsertTechnician, type Process, type InsertProcess, type Category, type InsertCategory, type Setting, type InsertSetting, type PdfFile, type InsertPdfFile, type Announcement, type InsertAnnouncement, type PhoneWhitelist, type InsertPhoneWhitelist, type AuthToken, type InsertAuthToken, quotes, parts, technicians, processes, categories, settings, pdfFiles, announcements, phoneWhitelist, authTokens } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
    const result = await db.delete(processes).where(eq(processes.id, id));
    return (result.rowCount || 0) > 0;
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

  // Backup operations
  async clearAllData(): Promise<void> {
    // Clear all tables except sessions (preserve active sessions)
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
