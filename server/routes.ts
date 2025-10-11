import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import compression from "compression";
import { storage } from "./storage";
import { insertQuoteSchema, insertPartSchema, insertTechnicianSchema, insertProcessSchema } from "@shared/schema";
import { googleSheetsService } from "./google-sheets";
import { emailService } from "./services/email";
import { trelloService } from "./services/trello";
import { voiceService } from "./services/voice";

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Update quote status
  app.patch("/api/quotes/:id", async (req, res) => {
    try {
      const { status } = req.body;
      const quote = await storage.getQuote(req.params.id);
      
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const updatedQuote = await storage.updateQuote(req.params.id, { status });
      
      // Create Trello cards based on status
      if (status === 'accepted' && !quote.trelloCardId) {
        const cardId = await trelloService.createOrderCard({
          customerName: quote.customerName,
          technician: quote.technician,
          total: quote.total,
          subtotal: quote.subtotal,
          labor: quote.labor,
          tax: quote.tax,
          parts: quote.parts,
          quoteId: quote.id,
          jobNotes: quote.jobNotes || undefined,
          ghvacInstalled: quote.ghvacInstalled || false,
          yearsSinceInstallation: quote.yearsSinceInstallation || undefined,
        });
        
        if (cardId) {
          await storage.updateQuote(req.params.id, { trelloCardId: cardId });
        }
      } else if (status === 'pending' && !quote.trelloCardId) {
        const cardId = await trelloService.createFollowupCard({
          customerName: quote.customerName,
          technician: quote.technician,
          total: quote.total,
          subtotal: quote.subtotal,
          labor: quote.labor,
          tax: quote.tax,
          parts: quote.parts,
          quoteId: quote.id,
          jobNotes: quote.jobNotes || undefined,
          ghvacInstalled: quote.ghvacInstalled || false,
          yearsSinceInstallation: quote.yearsSinceInstallation || undefined,
        });
        
        if (cardId) {
          await storage.updateQuote(req.params.id, { trelloCardId: cardId });
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

  // Price Book PDF routes
  app.post("/api/price-book/upload", async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
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
