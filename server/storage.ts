import { type Quote, type InsertQuote, type PartData, type InsertPart, type Technician, type InsertTechnician } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Quote operations
  getQuote(id: string): Promise<Quote | undefined>;
  getAllQuotes(): Promise<Quote[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, quote: Partial<Quote>): Promise<Quote | undefined>;
  
  // Part operations
  getPart(id: string): Promise<PartData | undefined>;
  getAllParts(): Promise<PartData[]>;
  getPartsByCategory(category: string): Promise<PartData[]>;
  createPart(part: InsertPart): Promise<PartData>;
  
  // Technician operations
  getTechnician(id: string): Promise<Technician | undefined>;
  getAllTechnicians(): Promise<Technician[]>;
  createTechnician(technician: InsertTechnician): Promise<Technician>;
}

export class MemStorage implements IStorage {
  private quotes: Map<string, Quote>;
  private parts: Map<string, PartData>;
  private technicians: Map<string, Technician>;

  constructor() {
    this.quotes = new Map();
    this.parts = new Map();
    this.technicians = new Map();
    
    // Initialize with some default technicians
    this.initializeDefaultData();
  }

  private async initializeDefaultData() {
    const defaultTechnicians = [
      { name: "John Smith", email: "john@ghvac.com" },
      { name: "Mike Johnson", email: "mike@ghvac.com" },
      { name: "Sarah Davis", email: "sarah@ghvac.com" },
    ];

    for (const tech of defaultTechnicians) {
      await this.createTechnician(tech);
    }
  }

  // Quote operations
  async getQuote(id: string): Promise<Quote | undefined> {
    return this.quotes.get(id);
  }

  async getAllQuotes(): Promise<Quote[]> {
    return Array.from(this.quotes.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async createQuote(insertQuote: InsertQuote): Promise<Quote> {
    const id = randomUUID();
    const quote: Quote = { 
      ...insertQuote, 
      id, 
      createdAt: new Date() 
    };
    this.quotes.set(id, quote);
    return quote;
  }

  async updateQuote(id: string, updateData: Partial<Quote>): Promise<Quote | undefined> {
    const existingQuote = this.quotes.get(id);
    if (!existingQuote) return undefined;
    
    const updatedQuote = { ...existingQuote, ...updateData };
    this.quotes.set(id, updatedQuote);
    return updatedQuote;
  }

  // Part operations
  async getPart(id: string): Promise<PartData | undefined> {
    return this.parts.get(id);
  }

  async getAllParts(): Promise<PartData[]> {
    return Array.from(this.parts.values());
  }

  async getPartsByCategory(category: string): Promise<PartData[]> {
    return Array.from(this.parts.values()).filter(part => part.category === category);
  }

  async createPart(insertPart: InsertPart): Promise<PartData> {
    const id = randomUUID();
    const part: PartData = { ...insertPart, id };
    this.parts.set(id, part);
    return part;
  }

  // Technician operations
  async getTechnician(id: string): Promise<Technician | undefined> {
    return this.technicians.get(id);
  }

  async getAllTechnicians(): Promise<Technician[]> {
    return Array.from(this.technicians.values());
  }

  async createTechnician(insertTechnician: InsertTechnician): Promise<Technician> {
    const id = randomUUID();
    const technician: Technician = { ...insertTechnician, id };
    this.technicians.set(id, technician);
    return technician;
  }
}

export const storage = new MemStorage();
