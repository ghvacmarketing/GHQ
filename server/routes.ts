import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { insertQuoteSchema, insertPartSchema, insertTechnicianSchema, insertProcessSchema, insertAnnouncementSchema, insertLeadSchema, announcements, categories } from "@shared/schema";
import { googleSheetsService } from "./google-sheets";
import { emailService } from "./services/email";
import { trelloService } from "./services/trello";
import { voiceService } from "./services/voice";
import { twilioService } from "./sms";
import { pool, db } from "./db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  // Session management with connect-pg-simple
  const PgSession = connectPgSimple(session);
  
  app.use(
    session({
      store: new PgSession({
        pool: pool, // Use the actual PostgreSQL pool object
        tableName: 'session',
        createTableIfMissing: false, // We already created the table via schema
      }),
      secret: process.env.SESSION_SECRET || 'ghvac-secret-key-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'lax',
      },
    })
  );

  // Add compression middleware for better performance
  app.use(compression());

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
    },
  });

  // Get quotes with pagination support
  app.get("/api/quotes", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      const allQuotes = await storage.getAllQuotes();
      const totalQuotes = allQuotes.length;
      const quotes = allQuotes.slice(offset, offset + limit);
      
      res.json({
        quotes,
        pagination: {
          page,
          limit,
          total: totalQuotes,
          totalPages: Math.ceil(totalQuotes / limit),
          hasNextPage: offset + limit < totalQuotes,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching quotes" });
    }
  });

  // Get quotes summary for admin dashboard
  app.get("/api/quotes/summary", async (req, res) => {
    try {
      const quotes = await storage.getAllQuotes();
      const totalQuotes = quotes.length;
      const statusCounts = quotes.reduce((acc, quote) => {
        const status = quote.status || 'draft';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const totalValue = quotes.reduce((sum, quote) => sum + parseFloat(quote.total), 0);
      const recentQuotes = quotes
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 5)
        .map(quote => ({
          id: quote.id,
          customerName: quote.customerName,
          technician: quote.technician,
          total: quote.total,
          status: quote.status,
          createdAt: quote.createdAt
        }));
      
      res.json({
        totalQuotes,
        statusCounts,
        totalValue,
        recentQuotes
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching quotes summary" });
    }
  });

  // Get single quote
  app.get("/api/quotes/:id", async (req, res) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      res.status(500).json({ message: "Error fetching quote" });
    }
  });

  // Create new quote
  app.post("/api/quotes", async (req, res) => {
    try {
      const validatedData = insertQuoteSchema.parse(req.body);
      const quote = await storage.createQuote(validatedData);
      
      // Send email notification
      if (quote.emailSent !== false) {
        const emailSent = await emailService.sendQuoteNotification({
          customerName: quote.customerName,
          technician: quote.technician,
          total: quote.total,
          quoteText: quote.quoteText || '',
          quoteId: quote.id,
          jobNotes: quote.jobNotes || '',
          parts: quote.parts || [],
          subtotal: quote.subtotal,
          labor: quote.labor,
          tax: quote.tax,
          status: quote.status || 'draft',
          createdAt: quote.createdAt?.toISOString(),
        }, adminSettings.emailSettings.notificationEmails);
        
        if (emailSent) {
          await storage.updateQuote(quote.id, { emailSent: true });
        }
      }
      
      res.json(quote);
    } catch (error) {
      console.error('Error creating quote:', error);
      res.status(400).json({ message: "Invalid quote data" });
    }
  });

  // Update quote (status or full quote data)
  app.patch("/api/quotes/:id", async (req, res) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Build update object - accept both status updates and full quote updates
      const updateData: any = {};
      
      // If only status is provided, it's a status update
      if (req.body.status && Object.keys(req.body).length === 1) {
        updateData.status = req.body.status;
      } else {
        // Full quote update from edit page
        if (req.body.customerName !== undefined) updateData.customerName = req.body.customerName;
        if (req.body.technician !== undefined) updateData.technician = req.body.technician;
        if (req.body.parts !== undefined) updateData.parts = req.body.parts;
        if (req.body.subtotal !== undefined) updateData.subtotal = req.body.subtotal;
        if (req.body.labor !== undefined) updateData.labor = req.body.labor;
        if (req.body.tax !== undefined) updateData.tax = req.body.tax;
        if (req.body.total !== undefined) updateData.total = req.body.total;
        if (req.body.ghvacInstalled !== undefined) updateData.ghvacInstalled = req.body.ghvacInstalled;
        if (req.body.yearsSinceInstallation !== undefined) updateData.yearsSinceInstallation = req.body.yearsSinceInstallation;
        if (req.body.laborHours !== undefined) updateData.laborHours = req.body.laborHours;
        if (req.body.jobNotes !== undefined) updateData.jobNotes = req.body.jobNotes;
        if (req.body.status !== undefined) updateData.status = req.body.status;
      }

      const updatedQuote = await storage.updateQuote(req.params.id, updateData);
      
      // Create Trello cards based on status (only for status updates)
      // Use updatedQuote to ensure Trello gets the latest data
      const status = updateData.status;
      if (status === 'accepted' && !quote.trelloCardId && updatedQuote) {
        const cardId = await trelloService.createOrderCard({
          customerName: updatedQuote.customerName,
          technician: updatedQuote.technician,
          total: updatedQuote.total,
          subtotal: updatedQuote.subtotal,
          labor: updatedQuote.labor,
          tax: updatedQuote.tax,
          parts: updatedQuote.parts,
          quoteId: updatedQuote.id,
          jobNotes: updatedQuote.jobNotes || undefined,
          ghvacInstalled: updatedQuote.ghvacInstalled || false,
          yearsSinceInstallation: updatedQuote.yearsSinceInstallation || undefined,
        });
        
        if (cardId) {
          await storage.updateQuote(req.params.id, { trelloCardId: cardId, pushedToTrello: true });
        }
      } else if (status === 'pending' && !quote.trelloCardId && updatedQuote) {
        const cardId = await trelloService.createFollowupCard({
          customerName: updatedQuote.customerName,
          technician: updatedQuote.technician,
          total: updatedQuote.total,
          subtotal: updatedQuote.subtotal,
          labor: updatedQuote.labor,
          tax: updatedQuote.tax,
          parts: updatedQuote.parts,
          quoteId: updatedQuote.id,
          jobNotes: updatedQuote.jobNotes || undefined,
          ghvacInstalled: updatedQuote.ghvacInstalled || false,
          yearsSinceInstallation: updatedQuote.yearsSinceInstallation || undefined,
        });
        
        if (cardId) {
          await storage.updateQuote(req.params.id, { trelloCardId: cardId, pushedToTrello: true });
        }
      }
      
      res.json(updatedQuote);
    } catch (error) {
      console.error('Error updating quote:', error);
      res.status(500).json({ message: "Error updating quote" });
    }
  });

  // Bulk delete quotes
  app.delete("/api/quotes/bulk", async (req, res) => {
    try {
      const { quoteIds } = req.body;
      
      if (!Array.isArray(quoteIds) || quoteIds.length === 0) {
        return res.status(400).json({ message: "No quote IDs provided" });
      }

      let deletedCount = 0;
      for (const quoteId of quoteIds) {
        try {
          await storage.deleteQuote(quoteId);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting quote ${quoteId}:`, error);
        }
      }
      
      res.json({ deletedCount, totalRequested: quoteIds.length });
    } catch (error) {
      console.error('Error bulk deleting quotes:', error);
      res.status(500).json({ message: "Error deleting quotes" });
    }
  });

  // Get all parts from storage
  app.get("/api/parts", async (req, res) => {
    try {
      const parts = await storage.getAllParts();
      const sheetsData = await googleSheetsService.fetchCellValues();
      
      // Update parts with live pricing from Google Sheets
      const updatedParts = parts.map(part => {
        const description = part.description.toLowerCase();
        let updatedPrice = part.price;
        
        if (description.includes('refrigerant filter dryer')) {
          updatedPrice = sheetsData.refrigerantFilterDryerPrice.toString();
        } else if (description.includes('copper')) {
          updatedPrice = sheetsData.copperPrice.toString();
        } else if (description.includes('armaflex insulation')) {
          updatedPrice = sheetsData.armaflexInsulationPrice.toString();
        } else if (description.includes('acid away')) {
          updatedPrice = sheetsData.acidAwayPrice.toString();
        } else if (description.includes('refrigerant') && !description.includes('filter dryer')) {
          updatedPrice = sheetsData.refrigerantPrice.toString();
        }
        
        return {
          ...part,
          price: updatedPrice
        };
      });
      
      res.json(updatedParts);
    } catch (error) {
      console.error('Error fetching parts:', error);
      res.status(500).json({ message: "Error fetching parts" });
    }
  });

  // Get parts by category
  app.get("/api/parts/category/:category", async (req, res) => {
    try {
      const parts = await storage.getPartsByCategory(req.params.category);
      res.json(parts);
    } catch (error) {
      res.status(500).json({ message: "Error fetching parts by category" });
    }
  });

  // Add custom part
  app.post("/api/parts/custom", async (req, res) => {
    try {
      const partData = { ...req.body, isCustom: true };
      const validatedData = insertPartSchema.parse(partData);
      const part = await storage.createPart(validatedData);
      res.json(part);
    } catch (error) {
      res.status(400).json({ message: "Invalid part data" });
    }
  });

  // Technician endpoints
  app.get("/api/technicians", async (req, res) => {
    try {
      const technicians = await storage.getAllTechnicians();
      res.json(technicians);
    } catch (error) {
      res.status(500).json({ message: "Error fetching technicians" });
    }
  });

  app.post("/api/technicians", async (req, res) => {
    try {
      const validatedData = insertTechnicianSchema.parse(req.body);
      const technician = await storage.createTechnician(validatedData);
      res.json(technician);
    } catch (error) {
      res.status(400).json({ message: "Invalid technician data" });
    }
  });

  app.delete("/api/technicians/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTechnician(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Technician not found" });
      }
      res.json({ message: "Technician deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting technician" });
    }
  });

  // Force refresh settings from Google Sheets
  app.post("/api/settings/refresh", async (req, res) => {
    try {
      const settings = await googleSheetsService.fetchCellValues();
      res.json({ message: "Settings refreshed successfully", settings });
    } catch (error) {
      res.status(500).json({ message: "Error refreshing settings" });
    }
  });

  // Admin settings storage (persistent)
  let adminSettings = {
    laborRate: 65,
    commissionPercent: 0.03,
    financingPromotionPercent: 0.04,
    profitPercent: 0.21,
    laborBenefitsPercent: 0.34,
    salesTaxPercent: 0.08,
    warrantyReserve: 25,
    overheadPercent: 0.30,
    warrantyDiscounts: {
      2: 0.25, 3: 0.35, 4: 0.45, 5: 0.50, 6: 0.55,
      7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90
    },
    emailSettings: {
      fromEmail: 'quotes@ghvac.work', // Using your verified domain
      notificationEmails: ['shelbgies@gmail.com'], // Testing with your Gmail
      developmentMode: false // Production mode with verified domain
    }
  };

  // Save admin settings
  app.post("/api/admin/settings", async (req, res) => {
    try {
      adminSettings = { ...adminSettings, ...req.body };
      res.json({ message: "Settings saved successfully", settings: adminSettings });
    } catch (error) {
      res.status(500).json({ message: "Error saving settings" });
    }
  });

  // Optimized initial data endpoint - reduces 3 API calls to 1
  app.get("/api/initial-data", async (req, res) => {
    try {
      // Fetch all data in parallel for best performance
      const [technicians, parts, sheetsData] = await Promise.all([
        storage.getAllTechnicians(),
        storage.getAllParts(),
        googleSheetsService.fetchCellValues()
      ]);

      // Update parts with live pricing from Google Sheets
      const updatedParts = parts.map(part => {
        const description = part.description.toLowerCase();
        let updatedPrice = part.price;
        
        if (description.includes('refrigerant filter dryer')) {
          updatedPrice = sheetsData.refrigerantFilterDryerPrice.toString();
        } else if (description.includes('copper')) {
          updatedPrice = sheetsData.copperPrice.toString();
        } else if (description.includes('armaflex insulation')) {
          updatedPrice = sheetsData.armaflexInsulationPrice.toString();
        } else if (description.includes('acid away')) {
          updatedPrice = sheetsData.acidAwayPrice.toString();
        } else if (description.includes('refrigerant') && !description.includes('filter dryer')) {
          updatedPrice = sheetsData.refrigerantPrice.toString();
        }
        
        return {
          ...part,
          price: updatedPrice
        };
      });

      // Merge settings (same logic as /api/settings)
      const settings = {
        ...adminSettings,
        laborRate: sheetsData.laborRate,
        commissionPercent: sheetsData.commissionPercent,
        financingPromotionPercent: sheetsData.financingPromotionPercent,
        profitPercent: sheetsData.profitPercent,
        materialShrinkagePercent: sheetsData.materialShrinkagePercent,
        laborBenefitsPercent: sheetsData.laborBenefitsPercent,
        salesTaxPercent: sheetsData.salesTaxPercent,
        warrantyReserve: sheetsData.warrantyReserve,
        overheadPercent: sheetsData.overheadPercent,
        partsPrices: {
          refrigerantFilterDryer: sheetsData.refrigerantFilterDryerPrice,
          copper: sheetsData.copperPrice,
          armaflexInsulation: sheetsData.armaflexInsulationPrice,
          acidAway: sheetsData.acidAwayPrice,
          refrigerant: sheetsData.refrigerantPrice,
        },
        emailSettings: adminSettings.emailSettings
      };

      // Return all data in one response
      res.json({
        technicians,
        parts: updatedParts,
        settings
      });
    } catch (error) {
      console.error('Error fetching initial data:', error);
      res.status(500).json({ message: "Error fetching initial data" });
    }
  });

  // Override regular settings endpoint to use admin settings when available
  app.get("/api/settings", async (req, res) => {
    try {
      // Fetch live data from Google Sheets
      const sheetsData = await googleSheetsService.fetchCellValues();
      
      // Merge with admin settings (Google Sheets takes precedence)
      const settings = {
        ...adminSettings,
        laborRate: sheetsData.laborRate,
        commissionPercent: sheetsData.commissionPercent,
        financingPromotionPercent: sheetsData.financingPromotionPercent,
        profitPercent: sheetsData.profitPercent,
        materialShrinkagePercent: sheetsData.materialShrinkagePercent,
        laborBenefitsPercent: sheetsData.laborBenefitsPercent,
        salesTaxPercent: sheetsData.salesTaxPercent,
        warrantyReserve: sheetsData.warrantyReserve,
        overheadPercent: sheetsData.overheadPercent,
        // Parts prices for direct access
        partsPrices: {
          refrigerantFilterDryer: sheetsData.refrigerantFilterDryerPrice,
          copper: sheetsData.copperPrice,
          armaflexInsulation: sheetsData.armaflexInsulationPrice,
          acidAway: sheetsData.acidAwayPrice,
          refrigerant: sheetsData.refrigerantPrice,
        },
        emailSettings: adminSettings.emailSettings
      };
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ message: "Error fetching settings" });
    }
  });

  // Get all technicians
  app.get("/api/technicians", async (req, res) => {
    try {
      const technicians = await storage.getAllTechnicians();
      res.json(technicians);
    } catch (error) {
      res.status(500).json({ message: "Error fetching technicians" });
    }
  });

  // Copy quote to clipboard (returns formatted text)
  app.get("/api/quotes/:id/copy", async (req, res) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      const formattedQuote = generateQuoteText(quote);
      res.json({ quoteText: formattedQuote });
    } catch (error) {
      res.status(500).json({ message: "Error generating quote text" });
    }
  });

  // Voice recording processing
  app.post("/api/voice/summarize", upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const result = await voiceService.transcribeAndSummarize(
        req.file.buffer,
        req.file.originalname || 'recording.webm'
      );

      res.json(result);
    } catch (error) {
      console.error('Error processing voice recording:', error);
      res.status(500).json({ message: "Error processing voice recording" });
    }
  });

  // Voice recording with context for better AI formatting
  app.post("/api/voice/transcribe-with-context", upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const context = req.body.context || '';
      const result = await voiceService.transcribeWithContext(
        req.file.buffer,
        req.file.originalname || 'recording.webm',
        context
      );

      res.json(result);
    } catch (error) {
      console.error('Error processing voice recording:', error);
      res.status(500).json({ message: "Error processing voice recording" });
    }
  });

  // Format text into numbered steps using AI
  app.post("/api/format-text", async (req, res) => {
    try {
      const { text, cleanupLevel } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "No text provided" });
      }

      const level = parseInt(cleanupLevel) || 3;
      const result = await voiceService.formatText(text, level);

      res.json(result);
    } catch (error) {
      console.error('Error formatting text:', error);
      res.status(500).json({ message: "Error formatting text" });
    }
  });

  // Transcribe full process from single voice recording
  app.post("/api/voice/transcribe-full-process", upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const cleanupLevel = parseInt(req.body.cleanupLevel) || 3;
      const result = await voiceService.transcribeFullProcess(
        req.file.buffer,
        req.file.originalname || 'recording.webm',
        cleanupLevel
      );

      res.json(result);
    } catch (error) {
      console.error('Error processing full process recording:', error);
      if (error instanceof Error && error.message === 'NO_AUDIO_DETECTED') {
        return res.status(400).json({ message: "No audio detected" });
      }
      res.status(500).json({ message: "Error processing voice recording" });
    }
  });

  // Process routes
  app.get("/api/processes", async (req, res) => {
    try {
      const category = req.query.category as string;
      const processes = category 
        ? await storage.getProcessesByCategory(category)
        : await storage.getAllProcesses();
      res.json(processes);
    } catch (error) {
      res.status(500).json({ message: "Error fetching processes" });
    }
  });

  app.get("/api/processes/:id", async (req, res) => {
    try {
      const process = await storage.getProcess(req.params.id);
      if (!process) {
        return res.status(404).json({ message: "Process not found" });
      }
      res.json(process);
    } catch (error) {
      res.status(500).json({ message: "Error fetching process" });
    }
  });

  app.post("/api/processes", async (req, res) => {
    try {
      const validatedData = insertProcessSchema.parse(req.body);
      const process = await storage.createProcess(validatedData);
      res.json(process);
    } catch (error) {
      console.error('Error creating process:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      res.status(500).json({ message: "Error creating process" });
    }
  });

  app.patch("/api/processes/:id", async (req, res) => {
    try {
      const process = await storage.updateProcess(req.params.id, req.body);
      if (!process) {
        return res.status(404).json({ message: "Process not found" });
      }
      res.json(process);
    } catch (error) {
      res.status(500).json({ message: "Error updating process" });
    }
  });

  app.delete("/api/processes/:id", async (req, res) => {
    try {
      // Require admin password for deletion
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (!password || password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized: Admin password required" });
      }

      const success = await storage.deleteProcess(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Process not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting process" });
    }
  });

  // Category routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getAllCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Error fetching categories" });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const category = await storage.createCategory(req.body);
      res.json(category);
    } catch (error) {
      res.status(500).json({ message: "Error creating category" });
    }
  });

  app.patch("/api/categories/:id", async (req, res) => {
    try {
      const category = await storage.updateCategory(req.params.id, req.body);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ message: "Error updating category" });
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    try {
      const success = await storage.deleteCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting category" });
    }
  });

  // App Settings routes - for user-managed configuration (PDF URLs, etc.)
  // Note: /api/settings is reserved for Google Sheets-derived pricing data
  app.get("/api/app-settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Error fetching settings" });
    }
  });

  app.get("/api/app-settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Error fetching setting" });
    }
  });

  app.post("/api/app-settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      const setting = await storage.setSetting(key, value);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Error setting value" });
    }
  });

  app.delete("/api/app-settings/:key", async (req, res) => {
    try {
      const success = await storage.deleteSetting(req.params.key);
      if (!success) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting setting" });
    }
  });

  // Admin authentication endpoint
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password === adminPassword) {
        // Set admin session flag
        (req.session as any).isAdmin = true;
        await new Promise((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve(true);
          });
        });
        res.json({ success: true });
      } else {
        res.status(401).json({ success: false, message: "Invalid password" });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: "Authentication error" });
    }
  });

  // Price Book PDF routes (with increased body size limit)
  app.post("/api/price-book/upload", express.json({ limit: '50mb' }), async (req, res) => {
    try {
      const { name, data, size, password } = req.body;
      
      // Authentication check
      if (password !== "ghvacadmin") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (!name || !data || !size) {
        return res.status(400).json({ message: "PDF name, data, and size are required" });
      }

      // Validate file size (50MB limit including base64 overhead)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (size > maxSize) {
        return res.status(400).json({ message: "PDF file too large. Maximum size is 50MB." });
      }

      // Validate base64 data format
      if (!data || typeof data !== 'string') {
        return res.status(400).json({ message: "Invalid PDF data format" });
      }

      // Basic validation of base64 string
      const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
      if (!base64Regex.test(data)) {
        return res.status(400).json({ message: "Invalid base64 encoding" });
      }

      const pdfData = {
        name,
        data, // Base64 encoded PDF
        size: size.toString(),
        contentType: "application/pdf",
      };

      const pdf = await storage.uploadPriceBookPdf(pdfData);
      res.json({ success: true, id: pdf.id });
    } catch (error) {
      console.error("Error uploading PDF:", error);
      res.status(500).json({ message: "Error uploading PDF" });
    }
  });

  app.get("/api/price-book/pdf", async (req, res) => {
    try {
      const pdf = await storage.getPriceBookPdf();
      
      if (!pdf) {
        return res.status(404).json({ message: "No price book PDF found" });
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(pdf.data, 'base64');
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${pdf.name}"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error retrieving PDF:", error);
      res.status(500).json({ message: "Error retrieving PDF" });
    }
  });

  app.delete("/api/price-book/pdf", async (req, res) => {
    try {
      const { password } = req.body;
      
      // Authentication check
      if (password !== "ghvacadmin") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const success = await storage.deletePriceBookPdf();
      if (!success) {
        return res.status(404).json({ message: "No PDF found to delete" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting PDF" });
    }
  });

  // Announcement routes
  // Get active announcement (public, no auth needed)
  app.get("/api/announcement", async (req, res) => {
    try {
      const announcement = await storage.getActiveAnnouncement();
      if (!announcement) {
        return res.json(null);
      }
      res.json(announcement);
    } catch (error) {
      console.error('Error fetching active announcement:', error);
      res.status(500).json({ message: "Error fetching announcement" });
    }
  });

  // Get all announcements (admin only)
  app.get("/api/announcements", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const announcements = await storage.getAllAnnouncements();
      res.json(announcements);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ message: "Error fetching announcements" });
    }
  });

  // Create/update announcement (admin only)
  app.post("/api/announcement", async (req, res) => {
    try {
      const { password, ...announcementData } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = insertAnnouncementSchema.parse(announcementData);
      const announcement = await storage.createAnnouncement(validatedData);
      
      res.json(announcement);
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(400).json({ message: "Invalid announcement data" });
    }
  });

  // Update announcement (admin only)
  app.patch("/api/announcement/:id", async (req, res) => {
    try {
      const { password, ...announcementData } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // If setting this announcement to active, deactivate all others first
      if (announcementData.isActive === true) {
        await db.update(announcements).set({ isActive: false });
      }

      const announcement = await storage.updateAnnouncement(req.params.id, announcementData);
      if (!announcement) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      
      res.json(announcement);
    } catch (error) {
      console.error('Error updating announcement:', error);
      res.status(500).json({ message: "Error updating announcement" });
    }
  });

  // Delete announcement (admin only)
  app.delete("/api/announcement/:id", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const success = await storage.deleteAnnouncement(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting announcement:', error);
      res.status(500).json({ message: "Error deleting announcement" });
    }
  });

  // Phone Whitelist routes (admin only)
  // Get all whitelisted phone numbers
  app.get("/api/phone-whitelist", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const whitelist = await storage.getAllPhoneWhitelist();
      res.json(whitelist);
    } catch (error) {
      console.error('Error fetching phone whitelist:', error);
      res.status(500).json({ message: "Error fetching phone whitelist" });
    }
  });

  // Add phone number to whitelist
  app.post("/api/phone-whitelist", async (req, res) => {
    try {
      const { password, phoneNumber, name } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const entry = await storage.createPhoneWhitelistEntry({
        phoneNumber,
        name,
        isActive: true,
      });
      
      res.json(entry);
    } catch (error) {
      console.error('Error adding phone to whitelist:', error);
      res.status(400).json({ message: "Error adding phone to whitelist" });
    }
  });

  // Delete phone number from whitelist
  app.delete("/api/phone-whitelist/:id", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password !== adminPassword) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const success = await storage.deletePhoneWhitelistEntry(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Phone number not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting phone from whitelist:', error);
      res.status(500).json({ message: "Error deleting phone from whitelist" });
    }
  });

  // Authentication routes
  // Request magic link - validates phone number is whitelisted and sends SMS
  app.post("/api/auth/request-link", async (req, res) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Check if phone number is whitelisted
      const whitelistEntry = await storage.getPhoneWhitelistEntry(phoneNumber);
      if (!whitelistEntry || !whitelistEntry.isActive) {
        return res.status(403).json({ message: "Phone number not authorized" });
      }

      // TEMPORARY BYPASS: If SMS is disabled, immediately log user in
      // TODO: Re-enable SMS when Twilio is configured properly
      const smsDisabled = process.env.DISABLE_SMS_AUTH === 'true';
      if (smsDisabled) {
        console.log('[SMS DISABLED] Auto-logging in user:', phoneNumber);
        
        // Create session immediately
        (req.session as any).user = {
          phoneNumber: whitelistEntry.phoneNumber,
          name: whitelistEntry.name,
        };
        
        await new Promise((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve(true);
          });
        });
        
        return res.json({ 
          success: true, 
          message: `Welcome, ${whitelistEntry.name}!`,
          autoLogin: true // Signal to frontend to redirect immediately
        });
      }

      // Original SMS flow (when SMS is enabled)
      // Generate magic link token
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Save token to database
      await storage.createAuthToken({
        phoneNumber,
        token,
        expiresAt,
      });

      // Send SMS with magic link
      const smsSent = await twilioService.sendMagicLink(phoneNumber, token, req);
      if (!smsSent) {
        return res.status(500).json({ message: "Failed to send SMS" });
      }

      res.json({ 
        success: true, 
        message: "Magic link sent to your phone" 
      });
    } catch (error) {
      console.error('Error requesting magic link:', error);
      res.status(500).json({ message: "Error sending magic link" });
    }
  });

  // Verify magic link token and create session
  app.get("/api/auth/verify/:token", async (req, res) => {
    try {
      const { token } = req.params;

      // Get token from database
      const authToken = await storage.getAuthToken(token);
      if (!authToken) {
        return res.status(404).json({ message: "Invalid or expired token" });
      }

      // Check if token is expired
      if (new Date() > new Date(authToken.expiresAt)) {
        await storage.deleteAuthToken(token);
        return res.status(401).json({ message: "Token expired" });
      }

      // Check if phone is still whitelisted
      const whitelistEntry = await storage.getPhoneWhitelistEntry(authToken.phoneNumber);
      if (!whitelistEntry || !whitelistEntry.isActive) {
        return res.status(403).json({ message: "Phone number no longer authorized" });
      }

      // Create session
      (req.session as any).authenticated = true;
      (req.session as any).phoneNumber = authToken.phoneNumber;
      (req.session as any).name = whitelistEntry.name;

      // Delete the used token
      await storage.deleteAuthToken(token);

      res.json({ 
        success: true, 
        user: {
          phoneNumber: authToken.phoneNumber,
          name: whitelistEntry.name,
        }
      });
    } catch (error) {
      console.error('Error verifying token:', error);
      res.status(500).json({ message: "Error verifying token" });
    }
  });

  // Check authentication status
  app.get("/api/auth/status", async (req, res) => {
    const replitAccessToken = process.env.REPLIT_ACCESS_TOKEN;
    const hasReplitAccess = !!replitAccessToken;
    
    const isAuthenticated = (req.session as any)?.authenticated || hasReplitAccess;
    
    if (isAuthenticated) {
      res.json({
        authenticated: true,
        user: (req.session as any)?.phoneNumber ? {
          phoneNumber: (req.session as any).phoneNumber,
          name: (req.session as any).name,
        } : null,
        replitAccess: hasReplitAccess,
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ message: "Error logging out" });
      }
      res.json({ success: true });
    });
  });

  // Create backup - exports all data to .ghvac file
  app.post("/api/backup", async (req, res) => {
    try {
      // Verify admin authentication via session
      if (!(req.session as any)?.isAdmin) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }

      // Fetch all data from database
      const quotes = await storage.getAllQuotes();
      const parts = await storage.getAllParts();
      const technicians = await storage.getAllTechnicians();
      const processes = await storage.getAllProcesses();
      const categories = await storage.getAllCategories();
      const settingsData = await storage.getAllSettings();
      const pdfFiles = await storage.getAllPdfFiles();
      const announcementsData = await storage.getAllAnnouncements();
      const phoneWhitelistData = await storage.getAllPhoneWhitelist();

      // Create backup object
      const backup = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        data: {
          quotes,
          parts,
          technicians,
          processes,
          categories,
          settings: settingsData,
          pdfFiles,
          announcements: announcementsData,
          phoneWhitelist: phoneWhitelistData,
        },
      };

      // Set headers for file download with .ghvac extension
      const filename = `ghvac-backup-${new Date().toISOString().split('T')[0]}.ghvac`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.json(backup);
    } catch (error) {
      console.error('Error creating backup:', error);
      res.status(500).json({ message: "Error creating backup" });
    }
  });

  // Restore backup - imports .ghvac file
  app.post("/api/restore", upload.single('backup'), async (req, res) => {
    try {
      // Verify admin authentication via session
      if (!(req.session as any)?.isAdmin) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No backup file provided" });
      }

      // Parse the uploaded file
      const backupContent = req.file.buffer.toString('utf-8');
      let backup;
      try {
        backup = JSON.parse(backupContent);
      } catch (error) {
        return res.status(400).json({ message: "Invalid backup file format" });
      }

      // Validate backup structure
      if (!backup.version || !backup.data) {
        return res.status(400).json({ message: "Invalid backup file structure" });
      }

      const mode = req.body.mode || 'replace'; // 'replace' or 'merge'

      // If replace mode, clear existing data first
      if (mode === 'replace') {
        await storage.clearAllData();
      }

      // Restore data in order (to handle dependencies)
      const { data } = backup;
      let stats = {
        quotes: 0,
        parts: 0,
        technicians: 0,
        processes: 0,
        categories: 0,
        settings: 0,
        pdfFiles: 0,
        announcements: 0,
        phoneWhitelist: 0,
      };

      // In merge mode, we need to check if records exist before inserting
      const shouldInsert = async (id: string, checkFn: () => Promise<any>) => {
        if (mode === 'replace') return true;
        const existing = await checkFn();
        return !existing;
      };

      // Restore categories first (referenced by processes and parts)
      if (data.categories && Array.isArray(data.categories)) {
        for (const category of data.categories) {
          try {
            // Check if category already exists by name (since categories have unique names)
            const existing = await db.select().from(categories).where(eq(categories.name, category.name));
            if (mode === 'merge' && existing.length > 0) {
              continue; // Skip if exists in merge mode
            }
            await storage.createCategory(category);
            stats.categories++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      // Restore parts
      if (data.parts && Array.isArray(data.parts)) {
        for (const part of data.parts) {
          try {
            await storage.createPart(part);
            stats.parts++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      // Restore technicians
      if (data.technicians && Array.isArray(data.technicians)) {
        for (const technician of data.technicians) {
          try {
            await storage.createTechnician(technician);
            stats.technicians++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      // Restore quotes
      if (data.quotes && Array.isArray(data.quotes)) {
        for (const quote of data.quotes) {
          try {
            await storage.createQuote(quote);
            stats.quotes++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      // Restore processes
      if (data.processes && Array.isArray(data.processes)) {
        for (const process of data.processes) {
          try {
            await storage.createProcess(process);
            stats.processes++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      // Restore settings (always upsert since setSetting handles updates)
      if (data.settings && Array.isArray(data.settings)) {
        for (const setting of data.settings) {
          try {
            await storage.updateSetting(setting.key, setting.value);
            stats.settings++;
          } catch (error) {
            console.error('Error restoring setting:', error);
          }
        }
      }

      // Restore PDF files
      if (data.pdfFiles && Array.isArray(data.pdfFiles)) {
        for (const pdf of data.pdfFiles) {
          try {
            await storage.createPdfFile(pdf);
            stats.pdfFiles++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      // Restore announcements
      if (data.announcements && Array.isArray(data.announcements)) {
        for (const announcement of data.announcements) {
          try {
            await storage.createAnnouncement(announcement);
            stats.announcements++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      // Restore phone whitelist
      if (data.phoneWhitelist && Array.isArray(data.phoneWhitelist)) {
        for (const entry of data.phoneWhitelist) {
          try {
            await storage.createPhoneWhitelistEntry(entry);
            stats.phoneWhitelist++;
          } catch (error) {
            // Skip duplicates in merge mode
            if (mode === 'replace') throw error;
          }
        }
      }

      res.json({ 
        success: true, 
        message: `Backup restored successfully (${mode} mode)`,
        stats
      });
    } catch (error) {
      console.error('Error restoring backup:', error);
      res.status(500).json({ message: "Error restoring backup" });
    }
  });

  // ========================================
  // LEAD MANAGEMENT API ROUTES
  // ========================================

  // 1. GET /api/leads - Get all leads
  app.get("/api/leads", async (req, res) => {
    try {
      const leads = await storage.getAllLeads();
      res.json(leads);
    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ message: "Error fetching leads" });
    }
  });

  // 2. GET /api/leads/:id - Get single lead
  app.get("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.json(lead);
    } catch (error) {
      console.error('Error fetching lead:', error);
      res.status(500).json({ message: "Error fetching lead" });
    }
  });

  // 3. POST /api/leads - Create new lead
  app.post("/api/leads", async (req, res) => {
    try {
      const validatedData = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(validatedData);
      res.json(lead);
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(400).json({ message: "Invalid lead data" });
    }
  });

  // 4. PATCH /api/leads/:id - Update lead
  app.patch("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      const updatedLead = await storage.updateLead(req.params.id, req.body);
      res.json(updatedLead);
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({ message: "Error updating lead" });
    }
  });

  // 5. DELETE /api/leads/:id - Delete lead
  app.delete("/api/leads/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteLead(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.json({ message: "Lead deleted successfully" });
    } catch (error) {
      console.error('Error deleting lead:', error);
      res.status(500).json({ message: "Error deleting lead" });
    }
  });

  // 6. GET /api/leads/filter/:status - Get leads by status
  app.get("/api/leads/filter/:status", async (req, res) => {
    try {
      const leads = await storage.getLeadsByStatus(req.params.status);
      res.json(leads);
    } catch (error) {
      console.error('Error fetching leads by status:', error);
      res.status(500).json({ message: "Error fetching leads by status" });
    }
  });

  // 7. GET /api/leads/active - Get active leads (not won/lost)
  app.get("/api/leads/active", async (req, res) => {
    try {
      const leads = await storage.getActiveLeads();
      res.json(leads);
    } catch (error) {
      console.error('Error fetching active leads:', error);
      res.status(500).json({ message: "Error fetching active leads" });
    }
  });

  // 8. GET /api/leads/won - Get won leads
  app.get("/api/leads/won", async (req, res) => {
    try {
      const leads = await storage.getWonLeads();
      res.json(leads);
    } catch (error) {
      console.error('Error fetching won leads:', error);
      res.status(500).json({ message: "Error fetching won leads" });
    }
  });

  // 9. GET /api/leads/lost - Get lost leads
  app.get("/api/leads/lost", async (req, res) => {
    try {
      const leads = await storage.getLostLeads();
      res.json(leads);
    } catch (error) {
      console.error('Error fetching lost leads:', error);
      res.status(500).json({ message: "Error fetching lost leads" });
    }
  });

  // 10. PATCH /api/leads/:id/status - Update lead status
  app.patch("/api/leads/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const updatedLead = await storage.updateLead(req.params.id, { status });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error updating lead status:', error);
      res.status(500).json({ message: "Error updating lead status" });
    }
  });

  // 11. PATCH /api/leads/:id/mark-won - Mark lead as won
  app.patch("/api/leads/:id/mark-won", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const updatedLead = await storage.updateLead(req.params.id, {
        won: true,
        lost: false,
        closedAt: new Date(),
        status: "Won"
      });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error marking lead as won:', error);
      res.status(500).json({ message: "Error marking lead as won" });
    }
  });

  // 12. PATCH /api/leads/:id/mark-lost - Mark lead as lost
  app.patch("/api/leads/:id/mark-lost", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const updatedLead = await storage.updateLead(req.params.id, {
        lost: true,
        won: false,
        closedAt: new Date(),
        status: "Lost"
      });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error marking lead as lost:', error);
      res.status(500).json({ message: "Error marking lead as lost" });
    }
  });

  // 13. POST /api/leads/:id/actions - Add action to lead
  app.post("/api/leads/:id/actions", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Action text is required" });
      }

      const newAction = {
        id: randomUUID(),
        text,
        completed: false,
        createdAt: new Date().toISOString()
      };

      const nextActions = [...(lead.nextActions || []), newAction];
      const updatedLead = await storage.updateLead(req.params.id, { nextActions });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error adding action:', error);
      res.status(500).json({ message: "Error adding action" });
    }
  });

  // 14. PATCH /api/leads/:id/actions/:actionId - Toggle action complete
  app.patch("/api/leads/:id/actions/:actionId", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const nextActions = (lead.nextActions || []).map(action => {
        if (action.id === req.params.actionId) {
          return {
            ...action,
            completed: !action.completed,
            completedAt: !action.completed ? new Date().toISOString() : undefined
          };
        }
        return action;
      });

      const updatedLead = await storage.updateLead(req.params.id, { nextActions });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error toggling action:', error);
      res.status(500).json({ message: "Error toggling action" });
    }
  });

  // 15. DELETE /api/leads/:id/actions/:actionId - Delete action
  app.delete("/api/leads/:id/actions/:actionId", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const nextActions = (lead.nextActions || []).filter(
        action => action.id !== req.params.actionId
      );

      const updatedLead = await storage.updateLead(req.params.id, { nextActions });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error deleting action:', error);
      res.status(500).json({ message: "Error deleting action" });
    }
  });

  // 16. POST /api/leads/:id/tasks - Add scheduled task to lead
  app.post("/api/leads/:id/tasks", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const { text, scheduledDate } = req.body;
      if (!text || !scheduledDate) {
        return res.status(400).json({ message: "Task text and scheduled date are required" });
      }

      const newTask = {
        id: randomUUID(),
        text,
        scheduledDate,
        completed: false,
        createdAt: new Date().toISOString()
      };

      const scheduledTasks = [...(lead.scheduledTasks || []), newTask];
      const updatedLead = await storage.updateLead(req.params.id, { scheduledTasks });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error adding task:', error);
      res.status(500).json({ message: "Error adding task" });
    }
  });

  // 17. PATCH /api/leads/:id/tasks/:taskId - Toggle task complete
  app.patch("/api/leads/:id/tasks/:taskId", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const scheduledTasks = (lead.scheduledTasks || []).map(task => {
        if (task.id === req.params.taskId) {
          return {
            ...task,
            completed: !task.completed,
            completedAt: !task.completed ? new Date().toISOString() : undefined
          };
        }
        return task;
      });

      const updatedLead = await storage.updateLead(req.params.id, { scheduledTasks });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error toggling task:', error);
      res.status(500).json({ message: "Error toggling task" });
    }
  });

  // 18. DELETE /api/leads/:id/tasks/:taskId - Delete task
  app.delete("/api/leads/:id/tasks/:taskId", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const scheduledTasks = (lead.scheduledTasks || []).filter(
        task => task.id !== req.params.taskId
      );

      const updatedLead = await storage.updateLead(req.params.id, { scheduledTasks });
      res.json(updatedLead);
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ message: "Error deleting task" });
    }
  });

  // 19. POST /api/leads/import - CSV import with de-duplication
  app.post("/api/leads/import", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file is empty or has no data rows" });
      }

      // Parse header
      const headerLine = lines[0];
      const headers = parseCSVLine(headerLine);

      // Map common column names to our fields
      const columnMap: Record<string, string> = {};
      headers.forEach((header, index) => {
        const normalized = header.toLowerCase().trim();
        if (normalized.includes('name') && !normalized.includes('company')) {
          columnMap['name'] = headers[index];
        } else if (normalized.includes('phone') || normalized.includes('mobile') || normalized.includes('cell')) {
          columnMap['phone'] = headers[index];
        } else if (normalized.includes('email') || normalized.includes('e-mail')) {
          columnMap['email'] = headers[index];
        } else if (normalized.includes('address') || normalized.includes('location')) {
          columnMap['address'] = headers[index];
        } else if (normalized.includes('value') || normalized.includes('estimated') || normalized.includes('amount')) {
          columnMap['estimatedValue'] = headers[index];
        } else if (normalized.includes('status')) {
          columnMap['status'] = headers[index];
        } else if (normalized.includes('issue') || normalized.includes('problem') || normalized.includes('description')) {
          columnMap['clientIssue'] = headers[index];
        }
      });

      let created = 0;
      let updated = 0;
      let skipped = 0;

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        const rowData: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          rowData[header] = values[index] || '';
        });

        // Extract fields using column mapping
        const leadData: any = {
          name: rowData[columnMap['name']] || 'Unknown',
          phone: rowData[columnMap['phone']] || undefined,
          email: rowData[columnMap['email']] || undefined,
          address: rowData[columnMap['address']] || undefined,
          estimatedValue: rowData[columnMap['estimatedValue']] || undefined,
          status: rowData[columnMap['status']] || 'New',
          clientIssue: rowData[columnMap['clientIssue']] || undefined,
          importSource: 'manual',
          lastImportedAt: new Date()
        };

        // Check for duplicates
        const duplicate = await storage.findDuplicateLead(
          leadData.phone,
          leadData.email,
          undefined
        );

        if (duplicate) {
          // Update existing lead
          await storage.updateLead(duplicate.id, {
            ...leadData,
            lastImportedAt: new Date()
          });
          updated++;
        } else {
          // Create new lead
          try {
            await storage.createLead(leadData);
            created++;
          } catch (error) {
            console.error('Error creating lead:', error);
            skipped++;
          }
        }
      }

      // Create import batch record
      await storage.createImportBatch({
        source: 'manual',
        filename: req.file.originalname,
        status: 'completed',
        createdCount: String(created),
        updatedCount: String(updated),
        skippedCount: String(skipped),
        errorCount: '0',
        summary: `Imported ${created} new leads, updated ${updated} existing leads, skipped ${skipped} leads`
      });

      res.json({
        success: true,
        created,
        updated,
        skipped,
        total: created + updated + skipped
      });
    } catch (error) {
      console.error('Error importing leads:', error);
      res.status(500).json({ message: "Error importing leads" });
    }
  });

  // 20. GET /api/leads/export - Export all leads to CSV
  app.get("/api/leads/export", async (req, res) => {
    try {
      const leads = await storage.getAllLeads();
      
      // Define CSV headers
      const headers = [
        'name', 'phone', 'email', 'address', 'estimatedValue', 'status',
        'clientIssue', 'projectedCloseDate', 'createdAt', 'quoteDetails', 'quotePricing'
      ];

      // Create CSV content
      let csv = headers.join(',') + '\n';

      leads.forEach(lead => {
        const row = headers.map(header => {
          let value = (lead as any)[header] || '';
          
          // Format dates
          if (header === 'projectedCloseDate' || header === 'createdAt') {
            value = value ? new Date(value).toISOString().split('T')[0] : '';
          }
          
          // Escape commas and quotes
          value = String(value).replace(/"/g, '""');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = `"${value}"`;
          }
          
          return value;
        });
        
        csv += row.join(',') + '\n';
      });

      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leads-export-${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Error exporting leads:', error);
      res.status(500).json({ message: "Error exporting leads" });
    }
  });

  // 21. GET /api/leads/metrics - Calculate and return metrics
  app.get("/api/leads/metrics", async (req, res) => {
    try {
      const allLeads = await storage.getAllLeads();
      const activeLeads = allLeads.filter(lead => !lead.won && !lead.lost);
      const wonLeads = allLeads.filter(lead => lead.won);
      const lostLeads = allLeads.filter(lead => lead.lost);

      // Calculate pipeline value
      const pipelineValue = activeLeads.reduce((sum, lead) => {
        const value = parseFloat(lead.estimatedValue || '0');
        return sum + value;
      }, 0);

      // Calculate conversion rate
      const totalClosed = wonLeads.length + lostLeads.length;
      const conversionRate = totalClosed > 0 
        ? (wonLeads.length / totalClosed) * 100 
        : 0;

      // Count pending actions
      const pendingActions = allLeads.reduce((count, lead) => {
        const incomplete = (lead.nextActions || []).filter(action => !action.completed);
        return count + incomplete.length;
      }, 0);

      // Count recent completions (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentCompletions = allLeads.reduce((count, lead) => {
        const recentCompleted = (lead.nextActions || []).filter(action => {
          if (!action.completed || !action.completedAt) return false;
          const completedDate = new Date(action.completedAt);
          return completedDate >= sevenDaysAgo;
        });
        return count + recentCompleted.length;
      }, 0);

      // Build sales funnel
      const salesFunnel = {
        New: { count: 0, value: 0 },
        Contacted: { count: 0, value: 0 },
        'Quote Sent': { count: 0, value: 0 },
        Negotiating: { count: 0, value: 0 },
        Won: { count: 0, value: 0 },
        Lost: { count: 0, value: 0 }
      };

      allLeads.forEach(lead => {
        const status = lead.status || 'New';
        const value = parseFloat(lead.estimatedValue || '0');
        
        if (salesFunnel[status as keyof typeof salesFunnel]) {
          salesFunnel[status as keyof typeof salesFunnel].count++;
          salesFunnel[status as keyof typeof salesFunnel].value += value;
        }
      });

      res.json({
        activeLeads: activeLeads.length,
        pipelineValue: pipelineValue.toFixed(2),
        conversionRate: conversionRate.toFixed(1),
        pendingActions,
        recentCompletions,
        salesFunnel
      });
    } catch (error) {
      console.error('Error calculating metrics:', error);
      res.status(500).json({ message: "Error calculating metrics" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to parse CSV line with proper quote handling
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function generateQuoteText(quote: any): string {
  const date = new Date().toLocaleDateString();
  const partsList = quote.parts.map((part: any) => 
    `• ${part.description} (${part.partNumber}) - Qty: ${part.quantity || 1} - $${part.price}`
  ).join('\n');

  return `GHVAC SERVICE QUOTE

Customer: ${quote.customerName}
Technician: ${quote.technician}
Date: ${date}

PARTS & SERVICES:
${partsList}

Subtotal: $${quote.subtotal}
Labor: $${quote.labor}
Tax: $${quote.tax}
TOTAL: $${quote.total}`;
}
