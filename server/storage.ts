import { type Quote, type InsertQuote, type PartData, type InsertPart, type Technician, type InsertTechnician, type Process, type InsertProcess, quotes, parts, technicians, processes } from "@shared/schema";
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
  deleteProcess(id: string): Promise<boolean>;
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
      .values(insertQuote)
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
      .values(insertProcess)
      .returning();
    return process;
  }

  async deleteProcess(id: string): Promise<boolean> {
    const result = await db.delete(processes).where(eq(processes.id, id));
    return (result.rowCount || 0) > 0;
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
  }
}

// Initialize database storage and default data
const databaseStorage = new DatabaseStorage();

// Initialize default data on startup
databaseStorage.initializeDefaultData().catch(console.error);

export const storage = databaseStorage;
