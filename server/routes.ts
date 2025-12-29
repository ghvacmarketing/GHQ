import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { storage } from "./storage";
import { insertQuoteSchema, insertPartSchema, insertTechnicianSchema, insertProcessSchema, insertAnnouncementSchema, insertPhoneWhitelistSchema, insertLeadSchema, announcements, categories, crmCustomers, crmProperties, crmJobs, crmJobAssignments, crmJobStatusEvents, crmUsers, crmCustomerNotes, insertCrmCustomerSchema, insertCrmJobSchema, crmAccounts, crmSites, crmContacts, residentialProfiles, propertyManagerProfiles, commercialProfiles, insertCrmAccountSchema, insertCrmSiteSchema, insertCrmContactSchema, insertResidentialProfileSchema, insertPropertyManagerProfileSchema, insertCommercialProfileSchema, type AccountType, type AccountStatus, type ContactRole, customers, crmWorkOrders, insertCrmWorkOrderSchema, type CrmWorkOrder, type InsertCrmWorkOrder, crmInvoices, crmInvoiceLineItems, insertCrmInvoiceSchema, insertCrmInvoiceLineItemSchema, type CrmInvoice, type CrmInvoiceLineItem, type InsertCrmInvoice, type InsertCrmInvoiceLineItem, crmQuotes, crmAgreements, insertCrmAgreementSchema, type CrmAgreement, type InsertCrmAgreement } from "@shared/schema";
import { googleSheetsService } from "./google-sheets";
import { equipmentSheetsService } from "./equipment-sheets";
import { emailService } from "./services/email";
import { trelloService } from "./services/trello";
import { voiceService } from "./services/voice";
import { twilioService } from "./sms";
import { pool, db } from "./db";
import { eq, inArray, desc, sql, and, or, ilike, asc, count } from "drizzle-orm";
import { randomUUID, createHmac } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { syncCustomersFromSheet, getCustomerSyncStatus, resetSyncHash, startAutoSync } from "./services/customer-sync";
import { generateQuoteWithAI, createQuoteConversation, getConversationHistory, type QuoteGenerationInput } from "./services/quote-generation";
import { uploadBufferToVectorStore, listVectorStoreFiles, deleteFileFromVectorStore, getOrCreateVectorStore, seedVectorStoreWithSalesBook } from "./services/vector-store";
import { refreshWeather, scheduleWeatherRefresh, getWeatherData } from "./weather-service";
import { scheduleWeatherImpactJobs } from "./weather-impact-service";
import { setupEmployeeAuth, requirePortalAuth, requireAdmin, requireEmployee, hashPassword } from "./employee-auth";
import { requireCrmAuth, getCurrentCrmUser, getCrmUserByEmail, createCrmSession, destroyCrmSession, comparePasswords as compareCrmPasswords, verifyGatePassword, ensureDefaultAdminExists, CRM_SESSION_COOKIE, isSalesOrAbove, requireCrmAdmin, requireCrmSalesOrAbove, logCrmAudit, hashPassword as hashCrmPassword } from "./crm-auth";
import cookieParser from "cookie-parser";

// Simple in-memory token store for admin authentication (works in Replit iframe where cookies fail)
const adminTokens = new Map<string, { createdAt: number }>();
// Token expiry: configurable via env var (in days), defaults to 90 days for convenience
const TOKEN_EXPIRY_DAYS = parseInt(process.env.ADMIN_TOKEN_EXPIRY_DAYS || '90', 10);
const TOKEN_EXPIRY = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

function generateAdminToken(): string {
  const token = randomUUID();
  adminTokens.set(token, { createdAt: Date.now() });
  return token;
}

function validateAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const tokenData = adminTokens.get(token);
  if (!tokenData) return false;
  if (Date.now() - tokenData.createdAt > TOKEN_EXPIRY) {
    adminTokens.delete(token);
    return false;
  }
  return true;
}

// Middleware to check admin authentication via token (Authorization header)
// Supports both dynamic session tokens AND a persistent ADMIN_API_KEY for automated integrations
function requireAdminAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  // Check for persistent API key first (for automated integrations like Google Apps Script sync)
  const persistentApiKey = process.env.ADMIN_API_KEY;
  if (persistentApiKey && token === persistentApiKey) {
    return next();
  }
  
  // Fall back to dynamic session token validation
  if (!validateAdminToken(token || undefined)) {
    return res.status(401).json({ message: "Unauthorized - Admin access required" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Trust proxy for Replit's infrastructure
  app.set('trust proxy', 1);

  // Add compression middleware for better performance
  app.use(compression());

  // Serve static assets from attached_assets directory (for SGA images, etc.)
  app.use('/assets', express.static('attached_assets'));
  
  // Serve uploads folder for voicemail MP3 files
  app.use('/uploads', express.static('uploads'));

  // Setup session middleware with PostgreSQL store
  const PgSession = connectPgSimple(session);
  app.use(session({
    store: new PgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      sameSite: 'none' as const,
    },
    rolling: true,
  }));

  // Initialize passport for authentication
  app.use(passport.initialize());
  app.use(passport.session());

  // Add cookie parser for CRM authentication
  app.use(cookieParser());

  // Setup employee portal authentication (passport strategies, login/logout routes)
  setupEmployeeAuth(app);

  // Ensure default CRM admin user exists
  ensureDefaultAdminExists().catch(console.error);

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
    },
  });

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // ============================================
  // TRELLO WEBHOOK ROUTES (must be before express.json middleware for POST)
  // ============================================

  // GET/HEAD for Trello webhook verification
  app.get("/webhooks/trello", (req, res) => {
    res.status(200).send("OK");
  });

  app.head("/webhooks/trello", (req, res) => {
    res.status(200).send();
  });

  // POST for receiving Trello webhooks - uses raw body for HMAC verification
  app.post("/webhooks/trello", express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const trelloSecret = process.env.TRELLO_SECRET;
      const trelloListNew = process.env.TRELLO_LIST_NEW || process.env.TRELLO_LIST_ID;
      const trelloListUnresolved = process.env.TRELLO_LIST_UNRESOLVED;
      const trelloListResolved = process.env.TRELLO_LIST_RESOLVED;

      if (!trelloSecret) {
        console.error("TRELLO_SECRET not configured");
        return res.status(500).send("Server configuration error");
      }

      // Verify HMAC-SHA1 signature
      const signature = req.headers['x-trello-webhook'] as string;
      if (signature) {
        const callbackURL = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const rawBody = req.body.toString('utf8');
        const expectedSignature = createHmac('sha1', trelloSecret)
          .update(rawBody + callbackURL)
          .digest('base64');

        if (signature !== expectedSignature) {
          console.warn("Trello webhook signature mismatch");
          return res.status(401).send("Invalid signature");
        }
      }

      // Parse the webhook payload
      const payload = JSON.parse(req.body.toString('utf8'));
      const action = payload?.action;

      if (!action) {
        return res.status(200).send("No action");
      }

      const actionType = action.type;
      const cardId = action.data?.card?.id;
      const listId = action.data?.list?.id || action.data?.card?.idList;
      const listAfter = action.data?.listAfter;

      console.log(`Trello webhook received: ${actionType}, cardId: ${cardId}, listId: ${listId}, listAfter: ${listAfter?.id || 'none'}`);

      // Process relevant action types
      if (['createCard', 'addAttachmentToCard', 'updateCard'].includes(actionType) && cardId) {
        try {
          // Fetch full card details from Trello
          const card = await trelloService.getCard(cardId);
          
          // Parse caller info and received date from card name/description
          let caller = null;
          let receivedAt = null;
          
          // Try to extract caller from card name (format: "Voicemail from +1234567890")
          const callerMatch = card.name?.match(/from\s*([\+\d\-\s\(\)]+)/i);
          if (callerMatch) {
            caller = callerMatch[1].trim();
          }

          // Try to extract date from card description or use card creation date
          if (card.dateLastActivity) {
            receivedAt = new Date(card.dateLastActivity);
          }

          // Determine status based on list movement or current list
          let status = 'NEW';
          const targetListId = listAfter?.id || listId;
          
          if (targetListId === trelloListUnresolved) {
            status = 'UNRESOLVED';
          } else if (targetListId === trelloListResolved) {
            status = 'RESOLVED';
          } else if (targetListId === trelloListNew) {
            status = 'NEW';
          }

          console.log(`Card ${cardId} target list: ${targetListId}, determined status: ${status}`);

          // Upsert voicemail record
          await storage.upsertVoicemail({
            trelloCardId: cardId,
            trelloListId: targetListId || trelloListNew || null,
            title: card.name || 'Untitled Voicemail',
            description: card.desc || null,
            status,
            caller,
            receivedAt,
            mp3Filename: null,
          });

          // If there's an attachment action, download MP3 files
          if (actionType === 'addAttachmentToCard') {
            const attachments = await trelloService.getCardAttachments(cardId);
            
            for (const attachment of attachments) {
              if (attachment.mimeType?.includes('audio') || attachment.name?.endsWith('.mp3')) {
                try {
                  const buffer = await trelloService.downloadAttachment(attachment.url);
                  const filename = `${cardId}_${Date.now()}.mp3`;
                  const filepath = path.join(uploadsDir, filename);
                  fs.writeFileSync(filepath, buffer);
                  
                  // Update voicemail with MP3 filename
                  await storage.updateVoicemailMp3(cardId, filename);
                  console.log(`Downloaded MP3 for card ${cardId}: ${filename}`);
                } catch (downloadError) {
                  console.error(`Failed to download attachment for card ${cardId}:`, downloadError);
                }
              }
            }
          }

          console.log(`Processed voicemail card: ${cardId}`);
        } catch (cardError) {
          console.error(`Failed to process card ${cardId}:`, cardError);
        }
      }

      res.status(200).send("OK");
    } catch (error) {
      console.error("Error processing Trello webhook:", error);
      res.status(200).send("Error processed");
    }
  });

  // ============================================
  // VOICEMAIL API ENDPOINTS
  // ============================================

  // GET /api/voicemails - list all voicemails (optionally filter by status)
  app.get("/api/voicemails", async (req, res) => {
    try {
      const status = req.query.status as string;
      let voicemails;
      
      if (status) {
        voicemails = await storage.getVoicemailsByStatus(status);
      } else {
        voicemails = await storage.getAllVoicemails();
      }
      
      res.json(voicemails);
    } catch (error) {
      console.error("Error fetching voicemails:", error);
      res.status(500).json({ message: "Error fetching voicemails" });
    }
  });

  // GET /api/voicemails/:id - get single voicemail
  app.get("/api/voicemails/:id", async (req, res) => {
    try {
      const voicemail = await storage.getVoicemail(req.params.id);
      if (!voicemail) {
        return res.status(404).json({ message: "Voicemail not found" });
      }
      res.json(voicemail);
    } catch (error) {
      console.error("Error fetching voicemail:", error);
      res.status(500).json({ message: "Error fetching voicemail" });
    }
  });

  // POST /api/voicemails/sync - sync new voicemails from Trello (Voicenation list only)
  app.post("/api/voicemails/sync", async (req, res) => {
    try {
      const trelloListNew = process.env.TRELLO_LIST_NEW || process.env.TRELLO_LIST_ID;

      if (!trelloListNew) {
        return res.status(400).json({ message: "TRELLO_LIST_NEW not configured" });
      }

      const listsToSync = [
        { listId: trelloListNew, status: 'NEW' },
      ];

      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const { listId, status } of listsToSync) {
        try {
          const cards = await trelloService.getCardsFromList(listId!);
          console.log(`Syncing ${cards.length} cards from list ${listId} (${status})`);

          for (const card of cards) {
            try {
              // Parse caller name from card name (format: "Voicemail message from 'Name,Office - B'")
              let caller = 'Unknown Caller';
              // Try to extract name in quotes first
              const quotedMatch = card.name?.match(/from\s*["']([^"']+)["']/i);
              if (quotedMatch) {
                caller = quotedMatch[1].split(',')[0].trim(); // Get name before comma
              } else {
                // Fallback: try to get text after "from" 
                const fromMatch = card.name?.match(/from\s+(.+?)(?:\s*[-\[]|$)/i);
                if (fromMatch) {
                  caller = fromMatch[1].trim();
                }
              }

              // Use card description as transcript
              const transcript = card.desc || '';

              // Parse received date from card name or use card creation date
              let receivedAt = null;
              const dateMatch = card.name?.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/);
              if (dateMatch) {
                const parsedDate = new Date(dateMatch[1]);
                if (!isNaN(parsedDate.getTime())) {
                  receivedAt = parsedDate;
                }
              }
              if (!receivedAt && card.dateLastActivity) {
                receivedAt = new Date(card.dateLastActivity);
              }

              // Find MP3 attachment
              let mp3Filename = null;
              const mp3Attachment = card.attachments?.find((a: any) => 
                a.name?.toLowerCase().endsWith('.mp3') || a.url?.toLowerCase().includes('.mp3')
              );

              if (mp3Attachment) {
                try {
                  const buffer = await trelloService.downloadAttachment(mp3Attachment.url);
                  const filename = `voicemail_${card.id}_${Date.now()}.mp3`;
                  const filepath = path.join(uploadsDir, filename);
                  await fs.promises.writeFile(filepath, buffer);
                  mp3Filename = filename;
                  console.log(`Downloaded MP3 for card ${card.id}: ${filename}`);
                } catch (dlError) {
                  console.error(`Failed to download MP3 for card ${card.id}:`, dlError);
                }
              }

              await storage.upsertVoicemail({
                trelloCardId: card.id,
                title: caller,
                caller: caller,
                description: transcript,
                status: status,
                receivedAt: receivedAt,
                mp3Filename: mp3Filename || undefined,
              });
              synced++;
            } catch (cardError) {
              console.error(`Error syncing card ${card.id}:`, cardError);
              errors++;
            }
          }
        } catch (listError) {
          console.error(`Error fetching cards from list ${listId}:`, listError);
          errors++;
        }
      }

      res.json({
        message: `Synced ${synced} voicemails from Trello`,
        synced,
        skipped,
        errors,
      });
    } catch (error) {
      console.error("Error syncing voicemails from Trello:", error);
      res.status(500).json({ message: "Error syncing voicemails from Trello" });
    }
  });

  // PATCH /api/voicemails/:id - update voicemail status/notes (with two-way Trello sync)
  app.patch("/api/voicemails/:id", async (req, res) => {
    try {
      const { status, description, caller } = req.body;
      const updates: any = {};
      
      if (status && ['NEW', 'UNRESOLVED', 'RESOLVED'].includes(status)) {
        updates.status = status;
      }
      if (description !== undefined) {
        updates.description = description;
      }
      if (caller !== undefined) {
        updates.caller = caller;
      }
      
      const voicemail = await storage.updateVoicemail(req.params.id, updates);
      if (!voicemail) {
        return res.status(404).json({ message: "Voicemail not found" });
      }

      // Two-way sync: If status changed and voicemail has a Trello card, move it to the corresponding list
      if (updates.status && voicemail.trelloCardId) {
        const trelloListNew = process.env.TRELLO_LIST_NEW || process.env.TRELLO_LIST_ID;
        const trelloListUnresolved = process.env.TRELLO_LIST_UNRESOLVED;
        const trelloListResolved = process.env.TRELLO_LIST_RESOLVED;

        let targetListId: string | null = null;
        if (updates.status === 'NEW' && trelloListNew) {
          targetListId = trelloListNew;
        } else if (updates.status === 'UNRESOLVED' && trelloListUnresolved) {
          targetListId = trelloListUnresolved;
        } else if (updates.status === 'RESOLVED' && trelloListResolved) {
          targetListId = trelloListResolved;
        }

        if (targetListId) {
          try {
            await trelloService.moveCardToList(voicemail.trelloCardId, targetListId);
            console.log(`Moved Trello card ${voicemail.trelloCardId} to list ${targetListId} (${updates.status})`);
          } catch (trelloError) {
            console.error(`Failed to move Trello card ${voicemail.trelloCardId}:`, trelloError);
            // Don't fail the request, just log the error - DB is already updated
          }
        }
      }

      res.json(voicemail);
    } catch (error) {
      console.error("Error updating voicemail:", error);
      res.status(500).json({ message: "Error updating voicemail" });
    }
  });

  // ========== Saved Proposals Routes ==========
  
  // GET /api/saved-proposals - get all saved proposals
  app.get("/api/saved-proposals", async (req, res) => {
    try {
      const proposals = await storage.getAllSavedProposals();
      res.json(proposals);
    } catch (error) {
      console.error("Error fetching saved proposals:", error);
      res.status(500).json({ message: "Error fetching saved proposals" });
    }
  });

  // GET /api/saved-proposals/:id - get a single saved proposal
  app.get("/api/saved-proposals/:id", async (req, res) => {
    try {
      const proposal = await storage.getSavedProposal(req.params.id);
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      res.json(proposal);
    } catch (error) {
      console.error("Error fetching saved proposal:", error);
      res.status(500).json({ message: "Error fetching saved proposal" });
    }
  });

  // POST /api/saved-proposals - create a new saved proposal
  app.post("/api/saved-proposals", async (req, res) => {
    try {
      const { customerName, customerAddress, customerPhone, customerEmail, quoteTitle, packageDescription, total, quoteData, status } = req.body;
      if (!customerName || !quoteTitle || !total || !quoteData) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const proposal = await storage.createSavedProposal({
        customerName,
        customerAddress,
        customerPhone,
        customerEmail,
        quoteTitle,
        packageDescription,
        total,
        quoteData,
        status: status || "saved",
      });
      res.json(proposal);
    } catch (error) {
      console.error("Error creating saved proposal:", error);
      res.status(500).json({ message: "Error creating saved proposal" });
    }
  });

  // DELETE /api/saved-proposals/:id - delete a saved proposal
  app.delete("/api/saved-proposals/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteSavedProposal(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting saved proposal:", error);
      res.status(500).json({ message: "Error deleting saved proposal" });
    }
  });

  // ========== Call Log Routes ==========

  // GET /api/call-logs/days - Get all days with entry counts
  app.get("/api/call-logs/days", async (req, res) => {
    try {
      const days = await storage.getCallLogDays();
      res.json(days);
    } catch (error) {
      console.error("Error fetching call log days:", error);
      res.status(500).json({ message: "Error fetching call log days" });
    }
  });

  // GET /api/call-logs/search - Search call logs
  app.get("/api/call-logs/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      const results = await storage.searchCallLogs(query);
      res.json(results);
    } catch (error) {
      console.error("Error searching call logs:", error);
      res.status(500).json({ message: "Error searching call logs" });
    }
  });

  // GET /api/call-logs/days/:date - Get day info and call logs for a specific date
  app.get("/api/call-logs/days/:date", async (req, res) => {
    try {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }
      const logs = await storage.getCallLogsByDay(date);
      res.json({ date, logs });
    } catch (error) {
      console.error("Error fetching call logs for day:", error);
      res.status(500).json({ message: "Error fetching call logs for day" });
    }
  });

  // POST /api/call-logs - Create a new call log entry
  app.post("/api/call-logs", async (req, res) => {
    try {
      const { clientName, description, phone, tag, createdByName, date } = req.body;
      
      if (!clientName || !description) {
        return res.status(400).json({ message: "clientName and description are required" });
      }
      
      const logDate = date || new Date().toISOString().split('T')[0];
      const day = await storage.getOrCreateCallLogDay(logDate);
      
      const callLog = await storage.createCallLog({
        dayId: day.id,
        clientName,
        description,
        phone: phone || null,
        tag: tag || null,
        createdByName: createdByName || null,
        createdByUserId: null,
      });
      
      res.json(callLog);
    } catch (error) {
      console.error("Error creating call log:", error);
      res.status(500).json({ message: "Error creating call log" });
    }
  });

  // PUT /api/call-logs/:id - Update a call log entry
  app.put("/api/call-logs/:id", async (req, res) => {
    try {
      const { clientName, description, phone, tag, createdByName } = req.body;
      const updates: any = {};
      
      if (clientName !== undefined) updates.clientName = clientName;
      if (description !== undefined) updates.description = description;
      if (phone !== undefined) updates.phone = phone;
      if (tag !== undefined) updates.tag = tag;
      if (createdByName !== undefined) updates.createdByName = createdByName;
      
      const callLog = await storage.updateCallLog(req.params.id, updates);
      if (!callLog) {
        return res.status(404).json({ message: "Call log not found" });
      }
      res.json(callLog);
    } catch (error) {
      console.error("Error updating call log:", error);
      res.status(500).json({ message: "Error updating call log" });
    }
  });

  // DELETE /api/call-logs/:id - Delete a call log entry
  app.delete("/api/call-logs/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCallLog(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Call log not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting call log:", error);
      res.status(500).json({ message: "Error deleting call log" });
    }
  });

  // GET /setup/trello-lists - helper endpoint to list board lists with IDs
  app.get("/setup/trello-lists", async (req, res) => {
    try {
      const boardId = req.query.boardId as string || process.env.TRELLO_BOARD_ID;
      if (!boardId) {
        return res.status(400).json({ message: "TRELLO_BOARD_ID not configured" });
      }
      
      const lists = await trelloService.getBoardLists(boardId);
      res.json(lists.map((list: any) => ({
        id: list.id,
        name: list.name,
        closed: list.closed,
      })));
    } catch (error) {
      console.error("Error fetching Trello lists:", error);
      res.status(500).json({ message: "Error fetching Trello lists" });
    }
  });

  // POST /setup/trello-webhook - register webhook with Trello
  app.post("/setup/trello-webhook", async (req, res) => {
    try {
      const apiKey = process.env.TRELLO_API_KEY;
      const token = process.env.TRELLO_TOKEN;
      const listId = process.env.TRELLO_LIST_ID;
      
      if (!apiKey || !token) {
        return res.status(400).json({ message: "TRELLO_API_KEY and TRELLO_TOKEN must be configured" });
      }
      
      // Get the callback URL from request or use the host header
      const host = req.get('host');
      const protocol = req.get('x-forwarded-proto') || 'https';
      const callbackURL = req.body.callbackURL || `${protocol}://${host}/webhooks/trello`;
      const idModel = req.body.idModel || listId || process.env.TRELLO_BOARD_ID;
      
      if (!idModel) {
        return res.status(400).json({ message: "idModel (TRELLO_LIST_ID or TRELLO_BOARD_ID) must be configured" });
      }
      
      const url = `https://api.trello.com/1/webhooks/?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'GHVAC Voicemail Webhook',
          callbackURL,
          idModel,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Trello webhook registration failed:", errorText);
        return res.status(response.status).json({ 
          message: "Failed to register webhook with Trello",
          error: errorText 
        });
      }
      
      const webhook = await response.json();
      console.log("Trello webhook registered:", webhook);
      res.json({ 
        message: "Webhook registered successfully",
        webhook,
        callbackURL 
      });
    } catch (error) {
      console.error("Error registering Trello webhook:", error);
      res.status(500).json({ message: "Error registering Trello webhook" });
    }
  });

  // POST /setup/trello-sync - manually sync existing cards from Trello list
  app.post("/setup/trello-sync", async (req, res) => {
    try {
      const apiKey = process.env.TRELLO_API_KEY;
      const token = process.env.TRELLO_TOKEN;
      const listId = req.body.listId || process.env.TRELLO_LIST_ID;
      
      if (!apiKey || !token || !listId) {
        return res.status(400).json({ message: "TRELLO_API_KEY, TRELLO_TOKEN, and listId required" });
      }
      
      // Fetch all cards from the list
      const url = `https://api.trello.com/1/lists/${listId}/cards?fields=name,desc,idList,dateLastActivity&attachments=true&attachment_fields=id,name,mimeType,url&key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ message: "Failed to fetch cards from Trello", error: errorText });
      }
      
      const cards = await response.json();
      const results: { cardId: string; title: string; status: string; mp3Downloaded: boolean }[] = [];
      
      for (const card of cards) {
        // Parse caller from title
        const callerMatch = card.name.match(/from\s+"?([^"]+)"?/i);
        const caller = callerMatch ? callerMatch[1].trim() : null;
        
        // Upsert voicemail record
        await storage.upsertVoicemail({
          trelloCardId: card.id,
          trelloListId: card.idList,
          title: card.name,
          description: card.desc || "",
          status: "NEW",
          caller,
          receivedAt: card.dateLastActivity ? new Date(card.dateLastActivity) : null,
          mp3Filename: null,
        });
        
        // Check for MP3 attachment
        const mp3Attachment = (card.attachments || []).find((a: any) => {
          const name = (a.name || "").toLowerCase();
          const mime = (a.mimeType || "").toLowerCase();
          return name.endsWith(".mp3") || mime.includes("audio");
        });
        
        let mp3Downloaded = false;
        if (mp3Attachment) {
          // Check if we already have it
          const existing = await storage.getVoicemailByTrelloCardId(card.id);
          if (!existing?.mp3Filename) {
            try {
              // Download using Trello's authenticated endpoint with OAuth header
              const downloadUrl = `https://api.trello.com/1/cards/${card.id}/attachments/${mp3Attachment.id}/download/${encodeURIComponent(mp3Attachment.name)}`;
              const downloadResponse = await fetch(downloadUrl, {
                headers: {
                  'Authorization': `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`
                }
              });
              if (downloadResponse.ok) {
                const buffer = Buffer.from(await downloadResponse.arrayBuffer());
                const fs = await import("fs");
                const path = await import("path");
                const uploadsDir = path.join(process.cwd(), "uploads");
                if (!fs.existsSync(uploadsDir)) {
                  fs.mkdirSync(uploadsDir, { recursive: true });
                }
                const safeName = `${Date.now()}-${mp3Attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
                const filePath = path.join(uploadsDir, safeName);
                fs.writeFileSync(filePath, buffer);
                await storage.updateVoicemailMp3(card.id, safeName);
                mp3Downloaded = true;
                console.log(`[SYNC] Downloaded MP3 for card ${card.id}: ${safeName}`);
              }
            } catch (err) {
              console.error(`[SYNC] Failed to download MP3 for card ${card.id}:`, err);
            }
          }
        }
        
        results.push({
          cardId: card.id,
          title: card.name,
          status: "NEW",
          mp3Downloaded,
        });
      }
      
      res.json({ message: `Synced ${results.length} cards`, results });
    } catch (error) {
      console.error("Error syncing Trello cards:", error);
      res.status(500).json({ message: "Error syncing Trello cards" });
    }
  });

  // ============================================
  // MAIN API ROUTES
  // ============================================

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
      
      // Send email notification (only if not already sent)
      if (!quote.emailSent) {
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

  // Generate quote with AI (OpenAI) - with conversation memory support
  app.post("/api/quotes/generate", async (req, res) => {
    try {
      const input: QuoteGenerationInput = req.body;
      
      if (!input.cartItems || input.cartItems.length === 0) {
        return res.status(400).json({ message: "Cart items are required" });
      }
      
      const generatedQuote = await generateQuoteWithAI(input);
      res.json(generatedQuote);
    } catch (error) {
      console.error('Error generating quote with AI:', error);
      res.status(500).json({ 
        message: "Failed to generate quote", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Create a new quote conversation (AI memory)
  app.post("/api/quotes/conversations", async (req, res) => {
    try {
      const { customerName, customerId, cartSnapshot } = req.body;
      
      if (!customerName) {
        return res.status(400).json({ message: "Customer name is required" });
      }
      
      const conversationId = await createQuoteConversation(
        customerName, 
        customerId, 
        cartSnapshot
      );
      
      res.json({ conversationId });
    } catch (error) {
      console.error('Error creating quote conversation:', error);
      res.status(500).json({ 
        message: "Failed to create conversation", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get conversation history
  app.get("/api/quotes/conversations/:id", async (req, res) => {
    try {
      const conversation = await storage.getQuoteConversation(req.params.id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      const messages = await getConversationHistory(req.params.id);
      
      res.json({ 
        conversation,
        messages 
      });
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ 
        message: "Failed to fetch conversation", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
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
      const errorMessage = error instanceof Error && error.message.includes('Google Sheets sync failed')
        ? error.message
        : "Error fetching parts";
      res.status(500).json({ message: errorMessage });
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
      console.error('Error refreshing settings:', error);
      const errorMessage = error instanceof Error && error.message.includes('Google Sheets sync failed')
        ? error.message
        : "Error refreshing settings";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Admin settings storage (persistent)
  let adminSettings = {
    laborRate: 65,
    commissionPercent: 0.03,
    financingPromotionPercent: 0.03,
    profitPercent: 0.15,
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

  // Manually refresh Google Sheets cache (force fresh fetch)
  app.post("/api/admin/refresh-sheets", async (req, res) => {
    try {
      console.log('Manual refresh requested for Google Sheets cache');
      // refreshData forces a fresh fetch and handles cache restoration on failure
      const freshData = await googleSheetsService.refreshData();
      const metadata = googleSheetsService.getCacheMetadata();
      res.json({ 
        message: "Google Sheets data refreshed successfully",
        timestamp: metadata.timestamp,
        data: freshData
      });
    } catch (error) {
      console.error('Error refreshing Google Sheets:', error);
      res.status(500).json({ message: "Error refreshing Google Sheets data" });
    }
  });

  // Get cache metadata (for UI display)
  app.get("/api/admin/cache-metadata", async (req, res) => {
    try {
      const metadata = googleSheetsService.getCacheMetadata();
      res.json(metadata);
    } catch (error) {
      res.status(500).json({ message: "Error getting cache metadata" });
    }
  });

  // Vector Store / Knowledge Base endpoints
  app.get("/api/admin/vector-store/files", requireAdminAuth, async (req, res) => {
    try {
      const files = await listVectorStoreFiles();
      res.json({ files });
    } catch (error) {
      console.error("Error listing vector store files:", error);
      res.status(500).json({ message: "Error listing files" });
    }
  });

  app.post("/api/admin/vector-store/upload", requireAdminAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { fileId, vectorStoreId } = await uploadBufferToVectorStore(
        req.file.buffer,
        req.file.originalname
      );

      res.json({ 
        message: "File uploaded successfully",
        fileId,
        vectorStoreId,
        filename: req.file.originalname
      });
    } catch (error) {
      console.error("Error uploading to vector store:", error);
      res.status(500).json({ message: "Error uploading file" });
    }
  });

  app.delete("/api/admin/vector-store/files/:fileId", requireAdminAuth, async (req, res) => {
    try {
      const success = await deleteFileFromVectorStore(req.params.fileId);
      if (success) {
        res.json({ message: "File deleted successfully" });
      } else {
        res.status(500).json({ message: "Error deleting file" });
      }
    } catch (error) {
      console.error("Error deleting vector store file:", error);
      res.status(500).json({ message: "Error deleting file" });
    }
  });

  app.get("/api/admin/vector-store/status", requireAdminAuth, async (req, res) => {
    try {
      const { isVectorStoreUnavailable } = await import("./services/vector-store");
      
      if (isVectorStoreUnavailable()) {
        return res.json({ 
          available: false,
          message: "Vector store API not available in this environment",
          vectorStoreId: null,
          fileCount: 0,
          files: []
        });
      }
      
      const vectorStoreId = await getOrCreateVectorStore();
      const files = await listVectorStoreFiles();
      res.json({ 
        available: true,
        vectorStoreId,
        fileCount: files.length,
        files
      });
    } catch (error) {
      console.error("Error getting vector store status:", error);
      res.status(500).json({ message: "Error getting vector store status" });
    }
  });

  app.post("/api/admin/vector-store/seed", requireAdminAuth, async (req, res) => {
    try {
      // Import the check function to provide better error messages
      const { isVectorStoreUnavailable } = await import("./services/vector-store");
      
      if (isVectorStoreUnavailable()) {
        return res.status(503).json({ 
          message: "Vector store API not available in this environment. Knowledge base features are disabled.",
          available: false
        });
      }
      
      const success = await seedVectorStoreWithSalesBook();
      if (success) {
        const files = await listVectorStoreFiles();
        res.json({ message: "Vector store seeded successfully", files, available: true });
      } else {
        res.status(400).json({ message: "Sales book PDF not found or vector store already seeded" });
      }
    } catch (error) {
      console.error("Error seeding vector store:", error);
      res.status(500).json({ message: "Error seeding vector store" });
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
        commissionPercent: sheetsData.commissionPercentB44,
        financingPromotionPercent: sheetsData.financingCostPercent,
        profitPercent: sheetsData.profitPercentB42,
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
      const errorMessage = error instanceof Error && error.message.includes('Google Sheets sync failed')
        ? error.message
        : "Error fetching initial data";
      res.status(500).json({ message: errorMessage });
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
        commissionPercent: sheetsData.commissionPercentB44,
        financingPromotionPercent: sheetsData.financingCostPercent,
        profitPercent: sheetsData.profitPercentB42,
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
      const errorMessage = error instanceof Error && error.message.includes('Google Sheets sync failed')
        ? error.message
        : "Error fetching settings";
      res.status(500).json({ message: errorMessage });
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

  // Get equipment for proposal builder (from Google Sheets or defaults)
  app.get("/api/equipment", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const categories = await equipmentSheetsService.fetchEquipment(forceRefresh);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching equipment:', error);
      res.status(500).json({ message: "Error fetching equipment" });
    }
  });

  // Get equipment cache metadata
  app.get("/api/equipment/cache-metadata", async (req, res) => {
    try {
      const metadata = equipmentSheetsService.getCacheMetadata();
      res.json(metadata);
    } catch (error) {
      res.status(500).json({ message: "Error fetching cache metadata" });
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

  // Convert quote to sales lead
  app.post("/api/quotes/:id/convert-to-lead", async (req, res) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Extract customer address from quote if it exists in jobNotes
      const address = req.body.address || quote.jobNotes || "";

      // Create lead with quote data pre-filled
      const leadData = {
        name: quote.customerName,
        phone: req.body.phone || "",
        email: req.body.email || "",
        address: address,
        estimatedValue: quote.total,
        status: "New",
        clientIssue: req.body.clientIssue || `Quote #${quote.id.slice(0, 8)} - ${(quote.parts as any[]).map(p => p.description).join(', ')}`,
        projectedCloseDate: req.body.projectedCloseDate,
        customerType: req.body.customerType,
        leadSource: req.body.leadSource || "Quote Generated",
        assignedEmployeeId: req.body.assignedEmployeeId,
        quoteId: quote.id,
        nextActions: [],
        scheduledTasks: [],
        won: false,
        lost: false,
        tags: []
      };

      const lead = await storage.createLead(leadData);

      // Create history entry for lead creation from quote
      await storage.createLeadHistory({
        leadId: lead.id,
        actor: (req.session as any)?.user?.phone || "system",
        actionType: "created",
        payload: { 
          source: "quote_conversion",
          quoteId: quote.id,
          quoteTechnician: quote.technician
        }
      });

      res.json(lead);
    } catch (error) {
      console.error('Error converting quote to lead:', error);
      res.status(500).json({ message: "Error converting quote to lead" });
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
      const success = await storage.deleteProcess(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Process not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting process" });
    }
  });

  // Process Attachment routes
  app.post("/api/processes/:id/attachments", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const processId = req.params.id;
      const process = await storage.getProcess(processId);
      if (!process) {
        return res.status(404).json({ message: "Process not found" });
      }

      // Get file info
      const filename = req.file.originalname;
      const mimeType = req.file.mimetype;
      const fileSize = req.file.size.toString();
      const fileData = req.file.buffer.toString('base64');
      
      // Determine file type
      let fileType = 'other';
      if (mimeType === 'application/pdf') fileType = 'pdf';
      else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') fileType = 'docx';
      else if (mimeType === 'application/msword') fileType = 'doc';
      else if (mimeType.startsWith('image/')) fileType = 'image';

      // Get current max display order for this process
      const existingAttachments = await storage.getProcessAttachments(processId);
      const maxOrder = existingAttachments.length > 0 
        ? Math.max(...existingAttachments.map(a => parseInt(a.displayOrder))) 
        : -1;
      const displayOrder = (maxOrder + 1).toString();

      const attachment = await storage.createProcessAttachment({
        processId,
        filename,
        fileType,
        mimeType,
        fileSize,
        fileData,
        displayOrder
      });

      res.json(attachment);
    } catch (error) {
      console.error('Error uploading attachment:', error);
      res.status(500).json({ message: "Error uploading attachment" });
    }
  });

  app.get("/api/processes/:id/attachments", async (req, res) => {
    try {
      const attachments = await storage.getProcessAttachments(req.params.id);
      // Don't send file data in list response, just metadata
      const attachmentList = attachments.map(({ fileData, ...rest }) => rest);
      res.json(attachmentList);
    } catch (error) {
      res.status(500).json({ message: "Error fetching attachments" });
    }
  });

  app.get("/api/attachments/:id", async (req, res) => {
    try {
      const attachment = await storage.getProcessAttachment(req.params.id);
      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      res.json(attachment);
    } catch (error) {
      res.status(500).json({ message: "Error fetching attachment" });
    }
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    try {
      const success = await storage.deleteProcessAttachment(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting attachment" });
    }
  });

  app.patch("/api/attachments/:id/order", async (req, res) => {
    try {
      const { displayOrder } = req.body;
      if (displayOrder === undefined) {
        return res.status(400).json({ message: "Display order is required" });
      }
      
      const attachment = await storage.updateAttachmentOrder(req.params.id, displayOrder.toString());
      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      res.json(attachment);
    } catch (error) {
      res.status(500).json({ message: "Error updating attachment order" });
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

  // Global app password verification (separate from admin)
  app.post("/api/global/verify", async (req, res) => {
    try {
      const { password } = req.body;
      const globalPassword = process.env.GLOBAL_PASSWORD;
      const skipAuth = process.env.SKIP_GLOBAL_AUTH === 'true';
      
      // Skip verification only if explicitly disabled or no password is set
      if (skipAuth || !globalPassword) {
        return res.json({ success: true, skipAuth: true });
      }
      
      // Require password match
      if (password === globalPassword) {
        res.json({ success: true });
      } else {
        res.status(401).json({ success: false, message: "Invalid password" });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: "Verification failed" });
    }
  });

  // Check if global auth is required (for client to know if it should show gate)
  app.get("/api/global/auth-required", async (req, res) => {
    const globalPassword = process.env.GLOBAL_PASSWORD;
    const skipAuth = process.env.SKIP_GLOBAL_AUTH === 'true';
    res.json({ required: !!globalPassword && !skipAuth });
  });

  // Admin authentication endpoint
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD || "ghvacadmin";
      
      if (password === adminPassword) {
        // Generate admin token for this session
        const adminToken = generateAdminToken();
        
        // Fetch and return dashboard data with the token
        try {
          const [
            settings,
            quotes,
            technicians,
            categories,
            processes,
            appSettings,
            cacheMetadata,
            announcements,
            phoneWhitelist
          ] = await Promise.all([
            googleSheetsService.fetchCellValues(),
            storage.getAllQuotes(),
            storage.getAllTechnicians(),
            storage.getAllCategories(),
            storage.getAllProcesses(),
            storage.getAllSettings(),
            (async () => {
              const cache = googleSheetsService.getCacheMetadata();
              return {
                cached: cache.cached,
                timestamp: cache.timestamp,
                age: cache.age
              };
            })(),
            storage.getAllAnnouncements(),
            storage.getAllPhoneWhitelist()
          ]);

          // Calculate quote summary (same logic as /api/quotes/summary endpoint)
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
          
          const quoteSummary = {
            totalQuotes,
            statusCounts,
            totalValue,
            recentQuotes
          };

          res.json({
            success: true,
            adminToken, // Token for subsequent admin requests
            dashboardData: {
              settings,
              quoteSummary,
              technicians,
              categories,
              processes,
              appSettings,
              cacheMetadata,
              announcements,
              phoneWhitelist
            }
          });
        } catch (dashboardError) {
          console.error('Error fetching dashboard data during login:', dashboardError);
          // Still return success with token but indicate dashboard data fetch failed
          res.json({ 
            success: true,
            adminToken,
            dashboardError: "Failed to load dashboard data. Please refresh the page." 
          });
        }
      } else {
        res.status(401).json({ success: false, message: "Invalid password" });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ success: false, message: "Authentication error" });
    }
  });

  // Aggregated admin dashboard data (optimized single request)
  app.get("/api/admin/dashboard", async (req, res) => {
    try {
      // Verify admin authentication
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }

      // Fetch all admin data in parallel for maximum performance
      const [
        settings,
        quotes,
        technicians,
        categories,
        processes,
        appSettings,
        cacheMetadata,
        announcements,
        phoneWhitelist
      ] = await Promise.all([
        googleSheetsService.fetchCellValues(), // Served from cache
        storage.getAllQuotes(),
        storage.getAllTechnicians(),
        storage.getAllCategories(),
        storage.getAllProcesses(),
        storage.getAllSettings(),
        (async () => {
          const cache = googleSheetsService.getCacheMetadata();
          return {
            cached: cache.cached,
            timestamp: cache.timestamp,
            age: cache.age
          };
        })(),
        storage.getAllAnnouncements(),
        storage.getAllPhoneWhitelist()
      ]);

      // Calculate quote summary (same logic as /api/quotes/summary endpoint)
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
      
      const quoteSummary = {
        totalQuotes,
        statusCounts,
        totalValue,
        recentQuotes
      };

      res.json({
        settings,
        quoteSummary,
        technicians,
        categories,
        processes,
        appSettings,
        cacheMetadata,
        announcements,
        phoneWhitelist
      });
    } catch (error) {
      console.error('Error fetching admin dashboard data:', error);
      res.status(500).json({ message: "Error loading admin dashboard" });
    }
  });

  // Price Book PDF routes (with increased body size limit)
  app.post("/api/price-book/upload", express.json({ limit: '50mb' }), async (req, res) => {
    try {
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }
      
      const { name, data, size } = req.body;
      
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
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
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
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }

      const announcements = await storage.getAllAnnouncements();
      res.json(announcements);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ message: "Error fetching announcements" });
    }
  });

  // Create announcement (admin only)
  app.post("/api/announcement", async (req, res) => {
    try {
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }

      // Validate and parse request body
      const validatedData = insertAnnouncementSchema.parse(req.body);
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
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }

      // Validate update data (allow partial updates)
      const validatedData = insertAnnouncementSchema.partial().parse(req.body);

      // If setting this announcement to active, deactivate all others first
      if (validatedData.isActive === true) {
        await db.update(announcements).set({ isActive: false });
      }

      const announcement = await storage.updateAnnouncement(req.params.id, validatedData);
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
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
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
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
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
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
      }

      // Validate and parse request body
      const validatedData = insertPhoneWhitelistSchema.parse(req.body);
      const entry = await storage.createPhoneWhitelistEntry(validatedData);
      
      res.json(entry);
    } catch (error) {
      console.error('Error adding phone to whitelist:', error);
      res.status(400).json({ message: "Error adding phone to whitelist" });
    }
  });

  // Delete phone number from whitelist
  app.delete("/api/phone-whitelist/:id", async (req, res) => {
    try {
      // Verify admin authentication via session
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
        return res.status(401).json({ message: "Unauthorized - Admin access required" });
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
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
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
      // Check admin token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!validateAdminToken(token || undefined)) {
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

  // 2. GET /api/leads/metrics - Calculate and return metrics
  app.get("/api/leads/metrics", async (req, res) => {
    try {
      const allLeads = await storage.getAllLeads();
      // Filter active leads: exclude both by boolean flags AND by status field for data consistency
      const activeLeads = allLeads.filter(lead => 
        !lead.won && !lead.lost && lead.status !== "Won" && lead.status !== "Lost"
      );
      const wonLeads = allLeads.filter(lead => lead.won || lead.status === "Won");
      const lostLeads = allLeads.filter(lead => lead.lost || lead.status === "Lost");

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

      // Build status breakdown for sales funnel
      const statusBreakdown = {
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
        
        if (statusBreakdown[status as keyof typeof statusBreakdown]) {
          statusBreakdown[status as keyof typeof statusBreakdown].count++;
          statusBreakdown[status as keyof typeof statusBreakdown].value += value;
        }
      });

      res.json({
        activeLeads: activeLeads.length,
        pipelineValue: pipelineValue.toFixed(2),
        conversionRate: conversionRate.toFixed(1),
        pendingActions,
        recentCompletions,
        statusBreakdown
      });
    } catch (error) {
      console.error('Error calculating metrics:', error);
      res.status(500).json({ message: "Error calculating metrics" });
    }
  });

  // 3. GET /api/leads/export - Export all leads to CSV
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

  // 4. POST /api/leads/import - CSV import with de-duplication
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

  // 5. GET /api/leads/filter/:status - Get leads by status
  app.get("/api/leads/filter/:status", async (req, res) => {
    try {
      const leads = await storage.getLeadsByStatus(req.params.status);
      res.json(leads);
    } catch (error) {
      console.error('Error fetching leads by status:', error);
      res.status(500).json({ message: "Error fetching leads by status" });
    }
  });

  // 6. GET /api/leads/active - Get active leads (not won/lost)
  app.get("/api/leads/active", async (req, res) => {
    try {
      const leads = await storage.getActiveLeads();
      res.json(leads);
    } catch (error) {
      console.error('Error fetching active leads:', error);
      res.status(500).json({ message: "Error fetching active leads" });
    }
  });

  // 7. GET /api/leads/won - Get won leads
  app.get("/api/leads/won", async (req, res) => {
    try {
      const leads = await storage.getWonLeads();
      res.json(leads);
    } catch (error) {
      console.error('Error fetching won leads:', error);
      res.status(500).json({ message: "Error fetching won leads" });
    }
  });

  // 8. GET /api/leads/lost - Get lost leads
  app.get("/api/leads/lost", async (req, res) => {
    try {
      const leads = await storage.getLostLeads();
      res.json(leads);
    } catch (error) {
      console.error('Error fetching lost leads:', error);
      res.status(500).json({ message: "Error fetching lost leads" });
    }
  });

  // 9. GET /api/leads/:id - Get single lead
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

  // 10. POST /api/leads - Create new lead
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

  // POST /api/proposals/accept - Accept a proposal and create a Won lead
  app.post("/api/proposals/accept", async (req, res) => {
    try {
      const { customerName, phone, email, address, estimatedValue, equipmentDetails, totalLow, totalHigh, monthlyLow, monthlyHigh, notes, hasCustomBuilds } = req.body;
      
      if (!customerName) {
        return res.status(400).json({ message: "Customer name is required" });
      }

      // Build a readable summary for clientIssue
      const equipmentSummary = equipmentDetails && equipmentDetails.length > 0
        ? equipmentDetails.map((item: any) => {
            if (item.type === "crawlspace") {
              const eliteLabel = item.isElite ? " (Elite)" : "";
              return `Crawlspace Encapsulation - ${item.tierName}${eliteLabel}`;
            } else if (item.type === "custom") {
              return `Custom ${item.tonnage} System: ${item.outdoor?.brand || 'N/A'} ${item.outdoor?.name || ''}`;
            } else if (item.outdoor) {
              return `${item.outdoor.brand} ${item.packageLevel} ${item.unitTypeName} - ${item.tonnage}`;
            } else {
              return item.name || 'Equipment item';
            }
          }).join('; ')
        : 'Equipment proposal accepted';

      // Build detailed quote info for quoteDetails field (JSON stored as text)
      const quoteDetailsJson = JSON.stringify({
        acceptedAt: new Date().toISOString(),
        equipment: equipmentDetails || [],
        hasCustomBuilds: hasCustomBuilds || false,
        pricing: {
          totalLow: totalLow || 0,
          totalHigh: totalHigh || 0,
          monthlyLow: monthlyLow || 0,
          monthlyHigh: monthlyHigh || 0,
        },
        notes: notes || null,
      });

      // Format pricing summary for quotePricing
      const pricingSummary = totalLow && totalHigh
        ? `$${totalLow.toLocaleString()} - $${totalHigh.toLocaleString()} (Monthly: $${monthlyLow?.toLocaleString() || 0} - $${monthlyHigh?.toLocaleString() || 0}/mo)`
        : estimatedValue ? `$${Number(estimatedValue).toLocaleString()}` : null;

      const leadData = {
        name: customerName,
        phone: phone || null,
        email: email || null,
        address: address || null,
        estimatedValue: estimatedValue ? estimatedValue.toString() : null,
        status: "Won",
        won: true,
        installStep: "Define Scope of Work",
        installEnteredAt: new Date(),
        clientIssue: equipmentSummary,
        quoteDetails: quoteDetailsJson,
        quotePricing: pricingSummary,
        customerType: "Installation",
        leadSource: "Proposal Builder",
        nextActions: [],
        scheduledTasks: [],
        tags: ["Installation", "Proposal"],
      };

      const validatedData = insertLeadSchema.parse(leadData);
      const lead = await storage.createLead(validatedData);

      await storage.createLeadHistory({
        leadId: lead.id,
        actor: "system",
        actionType: "created",
        payload: { source: "Proposal Builder", status: "Won", customerType: "Installation" }
      });

      res.json(lead);
    } catch (error) {
      console.error('Error accepting proposal:', error);
      res.status(500).json({ message: "Error accepting proposal" });
    }
  });

  // 11. PATCH /api/leads/:id - Update lead
  app.patch("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      // Convert date string fields to Date objects for Drizzle
      const updateData = { ...req.body };
      if (updateData.installDate && typeof updateData.installDate === 'string') {
        updateData.installDate = new Date(updateData.installDate);
      }
      if (updateData.installEndDate && typeof updateData.installEndDate === 'string') {
        updateData.installEndDate = new Date(updateData.installEndDate);
      }
      if (updateData.projectedCloseDate && typeof updateData.projectedCloseDate === 'string') {
        updateData.projectedCloseDate = new Date(updateData.projectedCloseDate);
      }
      if (updateData.closedAt && typeof updateData.closedAt === 'string') {
        updateData.closedAt = new Date(updateData.closedAt);
      }
      
      // Sync won/lost boolean flags when status changes to Won or Lost
      if (updateData.status === "Won" && !lead.won) {
        updateData.won = true;
        updateData.lost = false;
        if (!updateData.closedAt && !lead.closedAt) {
          updateData.closedAt = new Date();
        }
      } else if (updateData.status === "Lost" && !lead.lost) {
        updateData.lost = true;
        updateData.won = false;
        if (!updateData.closedAt && !lead.closedAt) {
          updateData.closedAt = new Date();
        }
      }
      
      // Auto-set installStep to "Define Scope of Work" when a lead becomes eligible for Installation board
      const isBecomingWon = (updateData.status === "Won" || updateData.won === true) && lead.status !== "Won";
      const tagsToCheck = updateData.tags || lead.tags || [];
      const hasInstallationTag = tagsToCheck.some((tag: string) => tag.toLowerCase() === "installation");
      const noInstallStep = !lead.installStep && !updateData.installStep;
      
      if ((isBecomingWon || lead.status === "Won") && hasInstallationTag && noInstallStep) {
        updateData.installStep = "Define Scope of Work";
        updateData.installOrder = 0;
        updateData.installEnteredAt = new Date();
      }
      
      // Clear department fields when changing from Won back to another status
      const isLeavingWon = lead.status === "Won" && updateData.status && updateData.status !== "Won" && updateData.status !== "Lost";
      if (isLeavingWon) {
        // Clear installation department fields
        if (lead.installStep) {
          updateData.installStep = null;
          updateData.installOrder = null;
          updateData.installEnteredAt = null;
          updateData.installDate = null;
          updateData.installEndDate = null;
        }
        // Clear service department fields
        if (lead.serviceStep) {
          updateData.serviceStep = null;
          updateData.serviceOrder = null;
          updateData.repairDate = null;
        }
        // Reset won flag
        updateData.won = false;
      }
      
      const updatedLead = await storage.updateLead(req.params.id, updateData);
      
      // Track changes to key fields in history
      const actor = (req.session as any)?.user?.phone || "system";
      
      // Track status change
      if (req.body.status && req.body.status !== lead.status) {
        await storage.createLeadHistory({
          leadId: req.params.id,
          actor,
          actionType: "status_changed",
          payload: { from: lead.status, to: req.body.status }
        });
      }
      
      // Track assignment change
      if (req.body.assignedEmployeeId !== undefined && req.body.assignedEmployeeId !== lead.assignedEmployeeId) {
        await storage.createLeadHistory({
          leadId: req.params.id,
          actor,
          actionType: "assignment_changed",
          payload: { 
            from: lead.assignedEmployeeId || null, 
            to: req.body.assignedEmployeeId || null 
          }
        });
      }
      
      // Track estimated value change
      if (req.body.estimatedValue !== undefined && req.body.estimatedValue !== lead.estimatedValue) {
        await storage.createLeadHistory({
          leadId: req.params.id,
          actor,
          actionType: "field_updated",
          payload: { 
            field: "estimatedValue",
            from: lead.estimatedValue, 
            to: req.body.estimatedValue 
          }
        });
      }
      
      // Track projected close date change
      if (req.body.projectedCloseDate !== undefined) {
        const oldDate = lead.projectedCloseDate ? new Date(lead.projectedCloseDate).toISOString() : null;
        const newDate = req.body.projectedCloseDate ? new Date(req.body.projectedCloseDate).toISOString() : null;
        
        if (oldDate !== newDate) {
          await storage.createLeadHistory({
            leadId: req.params.id,
            actor,
            actionType: "field_updated",
            payload: { 
              field: "projectedCloseDate",
              from: oldDate, 
              to: newDate 
            }
          });
        }
      }
      
      res.json(updatedLead);
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({ message: "Error updating lead" });
    }
  });

  // 12. DELETE /api/leads/:id - Delete lead
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

  // 13. PATCH /api/leads/:id/status - Update lead status
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

      // Normalize won/lost booleans based on status
      const updateData: any = { status };
      if (status === "Won") {
        updateData.won = true;
        updateData.lost = false;
        if (!lead.closedAt) {
          updateData.closedAt = new Date();
        }
      } else if (status === "Lost") {
        updateData.lost = true;
        updateData.won = false;
        if (!lead.closedAt) {
          updateData.closedAt = new Date();
        }
      } else {
        // For any other status, clear won/lost flags
        updateData.won = false;
        updateData.lost = false;
      }

      const updatedLead = await storage.updateLead(req.params.id, updateData);
      res.json(updatedLead);
    } catch (error) {
      console.error('Error updating lead status:', error);
      res.status(500).json({ message: "Error updating lead status" });
    }
  });

  // 14. PATCH /api/leads/:id/mark-won - Mark lead as won
  app.patch("/api/leads/:id/mark-won", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const updateData: any = {
        won: true,
        lost: false,
        closedAt: new Date(),
        status: "Won"
      };

      const currentTags = lead.tags || [];
      const jobType = lead.jobType || "";
      
      // Check if this lead should go to Installation pipeline
      const hasInstallationTag = currentTags.some((tag: string) => tag.toLowerCase() === "installation");
      const isInstallationType = jobType.toLowerCase().includes("installation");
      
      if (hasInstallationTag || isInstallationType) {
        // Set installation step to "Define Scope of Work"
        updateData.installStep = "Define Scope of Work";
        updateData.installEnteredAt = new Date();
        updateData.installOrder = 0;
        // Ensure Installation tag is present
        if (!hasInstallationTag) {
          updateData.tags = [...currentTags, "Installation"];
        }
      }
      
      // Check if jobType contains "Service" to add to service pipeline
      if (jobType.toLowerCase().includes("service")) {
        updateData.serviceStep = "Service Manager Inbox";
        updateData.serviceEnteredAt = new Date();
        updateData.serviceOrder = 0;
        // Add "Service" to tags if not already present
        if (!currentTags.some((tag: string) => tag.toLowerCase() === "service")) {
          updateData.tags = [...(updateData.tags || currentTags), "Service"];
        }
      }

      const updatedLead = await storage.updateLead(req.params.id, updateData);
      
      // Create history entry for marking won
      const actor = (req.session as any)?.user?.phone || "system";
      await storage.createLeadHistory({
        leadId: req.params.id,
        actor,
        actionType: "status_changed",
        payload: { from: lead.status, to: "Won", won: true }
      });
      
      res.json(updatedLead);
    } catch (error) {
      console.error('Error marking lead as won:', error);
      res.status(500).json({ message: "Error marking lead as won" });
    }
  });

  // 15. PATCH /api/leads/:id/mark-lost - Mark lead as lost
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
      
      // Create history entry for marking lost
      const actor = (req.session as any)?.user?.phone || "system";
      await storage.createLeadHistory({
        leadId: req.params.id,
        actor,
        actionType: "status_changed",
        payload: { from: lead.status, to: "Lost", lost: true }
      });
      
      res.json(updatedLead);
    } catch (error) {
      console.error('Error marking lead as lost:', error);
      res.status(500).json({ message: "Error marking lead as lost" });
    }
  });

  // 16. POST /api/leads/:id/actions - Add action to lead
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

  // 17. PATCH /api/leads/:id/actions/:actionId - Toggle action complete
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

  // 18. DELETE /api/leads/:id/actions/:actionId - Delete action
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

  // 19. POST /api/leads/:id/tasks - Add scheduled task to lead
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

  // 20. PATCH /api/leads/:id/tasks/:taskId - Toggle task complete
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

  // 21. DELETE /api/leads/:id/tasks/:taskId - Delete task
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

  // 22. GET /api/leads/:id/history - Get lead history/activity timeline
  app.get("/api/leads/:id/history", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const history = await storage.getLeadHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error('Error fetching lead history:', error);
      res.status(500).json({ message: "Error fetching lead history" });
    }
  });

  // 23. POST /api/leads/:id/history - Add activity to lead history (note, callback, etc.)
  app.post("/api/leads/:id/history", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const { actionType, payload } = req.body;
      if (!actionType) {
        return res.status(400).json({ message: "actionType is required" });
      }

      // Get actor from session (phone number) or use "system"
      const actor = (req.session as any)?.user?.phone || "system";

      const historyEntry = await storage.createLeadHistory({
        leadId: req.params.id,
        actor,
        actionType,
        payload: payload || {}
      });

      res.json(historyEntry);
    } catch (error) {
      console.error('Error adding lead history:', error);
      res.status(500).json({ message: "Error adding lead history" });
    }
  });

  // =============================================================================
  // SERVICE PIPELINE ROUTES
  // =============================================================================

  // GET /api/service-leads - Get all leads in the service pipeline
  app.get("/api/service-leads", async (req, res) => {
    try {
      const serviceLeads = await storage.getServiceLeads();
      res.json(serviceLeads);
    } catch (error) {
      console.error('Error fetching service leads:', error);
      res.status(500).json({ message: "Error fetching service leads" });
    }
  });

  // PATCH /api/service-leads/:id - Update a service lead
  app.patch("/api/service-leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      const { serviceStep, serviceOrder, clientIssue, assignedEmployeeId, repairDate } = req.body;
      const updates: any = { updatedAt: new Date() };
      
      // Service steps in order - repair date only allowed at "Parts Arrived" or later
      const SERVICE_STEPS_ORDER = [
        "Intake",
        "Triage / Assign",
        "Diag / Callback Needed",
        "Quote Needed",
        "Quote Drafting",
        "Review & Send",
        "Awaiting Customer",
        "Approved",
        "Parts Ordered",
        "Parts Arrived",
        "Invoice Sent",
        "Waiting On Payment",
        "Closed (Paid)",
        "Lost / Declined",
      ];
      
      const PARTS_ARRIVED_INDEX = SERVICE_STEPS_ORDER.indexOf("Parts Arrived");
      
      // Check if we're moving from "Parts Arrived" or later to before it
      if (serviceStep !== undefined) {
        const currentStepIndex = lead.serviceStep ? SERVICE_STEPS_ORDER.indexOf(lead.serviceStep) : -1;
        const newStepIndex = SERVICE_STEPS_ORDER.indexOf(serviceStep);
        
        console.log(`Service step change: "${lead.serviceStep}" (${currentStepIndex}) -> "${serviceStep}" (${newStepIndex}), PARTS_ARRIVED_INDEX=${PARTS_ARRIVED_INDEX}, hasRepairDate=${!!lead.repairDate}`);
        
        // If moving from Parts Arrived or later to before Parts Arrived, clear repair date
        if (currentStepIndex >= PARTS_ARRIVED_INDEX && newStepIndex < PARTS_ARRIVED_INDEX && lead.repairDate) {
          console.log(`Clearing repair date for lead ${lead.id} - moving from "${lead.serviceStep}" to "${serviceStep}"`);
          updates.repairDate = null;
        }
        
        updates.serviceStep = serviceStep;
      }
      
      if (serviceOrder !== undefined) updates.serviceOrder = serviceOrder;
      if (clientIssue !== undefined) updates.clientIssue = clientIssue;
      if (assignedEmployeeId !== undefined) updates.assignedEmployeeId = assignedEmployeeId === 'unassigned' ? null : assignedEmployeeId;
      if (repairDate !== undefined) updates.repairDate = repairDate ? new Date(repairDate) : null;

      const updatedLead = await storage.updateServiceLead(req.params.id, updates);
      res.json(updatedLead);
    } catch (error) {
      console.error('Error updating service lead:', error);
      res.status(500).json({ message: "Error updating service lead" });
    }
  });

  // POST /api/leads/:id/transfer-to-installation - Transfer a lead from Service to Installation Department
  app.post("/api/leads/:id/transfer-to-installation", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      // Verify lead is in service pipeline
      if (!lead.serviceStep) {
        return res.status(400).json({ message: "Lead is not in the Service pipeline" });
      }

      const { installDate, installEndDate, notes } = req.body;
      const now = new Date();

      // Add "Installation" tag if not already present
      const currentTags = lead.tags || [];
      const hasInstallationTag = currentTags.some((tag: string) => tag.toLowerCase() === "installation");
      const updatedTags = hasInstallationTag ? currentTags : [...currentTags, "Installation"];

      // Build the update data - transfer to installation pipeline
      const updateData: any = {
        // Clear service pipeline fields
        serviceStep: null,
        serviceOrder: null,
        
        // Set installation pipeline fields
        installStep: "Define Scope of Work",
        installOrder: 0,
        installEnteredAt: now,
        currentPipeline: "installation",
        
        // Track the transfer
        transferredFromPipeline: "service",
        transferredAt: now,
        
        // Update timestamps
        updatedAt: now,
        
        // Ensure lead appears in Installation Department
        status: "Won",
        won: true,
        tags: updatedTags,
        
        // Change job type from Service to Installation
        jobType: "Installation",
      };

      // Add optional install dates if provided
      if (installDate) {
        updateData.installDate = new Date(installDate);
      }
      if (installEndDate) {
        updateData.installEndDate = new Date(installEndDate);
      }

      // Append transfer note to existing actions if provided
      if (notes) {
        const existingActions = lead.nextActions || [];
        updateData.nextActions = [
          ...existingActions,
          {
            id: Date.now().toString(),
            text: `Transferred from Service: ${notes}`,
            createdAt: now.toISOString(),
            completed: false,
          }
        ];
      }

      const updatedLead = await storage.updateLead(req.params.id, updateData);
      
      // Create history entry for the transfer
      const actor = (req.session as any)?.user?.phone || "system";
      await storage.createLeadHistory({
        leadId: req.params.id,
        actor,
        actionType: "pipeline_transfer",
        payload: {
          from: "service",
          to: "installation",
          previousServiceStep: lead.serviceStep,
          notes: notes || null,
        },
      });

      res.json(updatedLead);
    } catch (error) {
      console.error('Error transferring lead to installation:', error);
      res.status(500).json({ message: "Error transferring lead to installation" });
    }
  });

  // =============================================================================
  // CUSTOMER DATABASE ROUTES (FieldEdge CSV Import)
  // =============================================================================

  // Search customers - default searches name only, searchAll=true searches all fields
  app.get("/api/customers/search", async (req, res) => {
    try {
      const term = req.query.term as string;
      const searchAll = req.query.searchAll === 'true';
      if (!term || term.length < 2) {
        return res.json([]);
      }
      const customers = await storage.searchCustomers(term, searchAll);
      res.json(customers);
    } catch (error) {
      console.error('Error searching customers:', error);
      res.status(500).json({ message: "Error searching customers" });
    }
  });

  // Get all customers (paginated)
  app.get("/api/customers", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = (page - 1) * limit;
      
      const allCustomers = await storage.getAllCustomers();
      const total = allCustomers.length;
      const customers = allCustomers.slice(offset, offset + limit);
      
      res.json({
        customers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }
      });
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ message: "Error fetching customers" });
    }
  });

  // Get customer database stats (must be before /:id to avoid route conflict)
  app.get("/api/customers/stats", async (req, res) => {
    try {
      const allCustomers = await storage.getAllCustomers();
      const batches = await storage.getAllCustomerImportBatches();
      
      const lastImport = batches.length > 0 ? batches[0] : null;
      
      res.json({
        totalCustomers: allCustomers.length,
        lastImportDate: lastImport?.importedAt || null,
        lastImportFilename: lastImport?.filename || null,
        totalImports: batches.length,
      });
    } catch (error) {
      console.error('Error fetching customer stats:', error);
      res.status(500).json({ message: "Error fetching customer stats" });
    }
  });

  // Get customer sync status (must be before /:id to avoid route conflict)
  app.get("/api/customers/sync/status", requireAdminAuth, async (req, res) => {
    try {
      const status = getCustomerSyncStatus();
      res.json({ status });
    } catch (error) {
      console.error('Error getting sync status:', error);
      res.status(500).json({ message: "Error getting sync status" });
    }
  });

  // Manually trigger customer sync (must be before /:id to avoid route conflict)
  app.post("/api/customers/sync/trigger", requireAdminAuth, async (req, res) => {
    try {
      const result = await syncCustomersFromSheet();
      
      if (result === 'no_change') {
        return res.json({ message: "No changes detected", noChange: true });
      }
      
      res.json({ message: "Sync completed", result });
    } catch (error) {
      console.error('Error triggering sync:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: "Sync failed", error: errorMessage });
    }
  });

  // Reset sync hash to force full re-sync (must be before /:id to avoid route conflict)
  app.post("/api/customers/sync/reset", requireAdminAuth, async (req, res) => {
    try {
      resetSyncHash();
      res.json({ message: "Sync hash reset. Next sync will process all data." });
    } catch (error) {
      console.error('Error resetting sync hash:', error);
      res.status(500).json({ message: "Error resetting sync hash" });
    }
  });

  // Get customer import history (must be before /:id to avoid route conflict)
  app.get("/api/customers/import/history", requireAdminAuth, async (req, res) => {
    try {
      const batches = await storage.getAllCustomerImportBatches();
      res.json(batches);
    } catch (error) {
      console.error('Error fetching import history:', error);
      res.status(500).json({ message: "Error fetching import history" });
    }
  });

  // Get customer by ID
  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      console.error('Error fetching customer:', error);
      res.status(500).json({ message: "Error fetching customer" });
    }
  });

  // Import customers from CSV (admin only)
  app.post("/api/customers/import", requireAdminAuth, upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    console.log('[Customer Import] Starting import...');
    
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log(`[Customer Import] File received: ${req.file.originalname}, size: ${req.file.size} bytes`);
      
      const fileContent = req.file.buffer.toString('utf-8');
      const filename = req.file.originalname;
      
      // Calculate file hash for duplicate detection
      const fileHash = createHmac('sha256', 'customer-import')
        .update(fileContent)
        .digest('hex');

      // Check if this exact file was already imported
      const existingBatch = await storage.getCustomerImportBatchByFileHash(fileHash);
      if (existingBatch) {
        return res.json({
          message: "This exact file was already imported",
          batch: existingBatch,
          skipped: true
        });
      }

      // Create import batch record
      const batch = await storage.createCustomerImportBatch({
        filename,
        fileHash,
        status: "processing",
      });

      // Parse CSV using the streaming parser
      console.log('[Customer Import] Parsing CSV...');
      const parseStart = Date.now();
      const { parse } = await import('csv-parse/sync');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
        trim: true,
      });
      console.log(`[Customer Import] Parsed ${records.length} records in ${Date.now() - parseStart}ms`);

      // Transform all records first (fast, in-memory)
      console.log('[Customer Import] Transforming records...');
      const transformStart = Date.now();
      const customerList: any[] = [];
      let parseSkipped = 0;

      // Helper to strip surrounding quotes from strings
      const stripQuotes = (str: string) => {
        const trimmed = str.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
          return trimmed.slice(1, -1).trim();
        }
        return trimmed;
      };

      for (const record of records as Record<string, string>[]) {
        const displayName = stripQuotes(record['Display Name'] || '');
        
        if (!displayName) {
          parseSkipped++;
          continue;
        }

        // Clean phone number
        let phone = stripQuotes(record['Phone'] || '');
        if (phone) {
          const digits = phone.replace(/\D/g, '');
          if (digits.length === 10) {
            phone = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
          } else if (digits.length === 11 && digits.startsWith('1')) {
            phone = `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
          }
        }

        customerList.push({
          displayName,
          customerType: stripQuotes(record['Customer Type'] || '') || null,
          fullAddress: stripQuotes(record['Full Address'] || '') || null,
          phone: phone || null,
          email: stripQuotes(record['Email'] || '') || null,
          leadSource: stripQuotes(record['Lead Source'] || '') || null,
          importBatchId: batch.id,
          checksum: createHmac('sha256', 'customer-row')
            .update(JSON.stringify({
              displayName,
              customerType: record['Customer Type'] || '',
              fullAddress: record['Full Address'] || '',
              phone: phone || '',
              email: record['Email'] || '',
              leadSource: record['Lead Source'] || '',
            }))
            .digest('hex'),
        });
      }
      console.log(`[Customer Import] Transformed ${customerList.length} valid records in ${Date.now() - transformStart}ms (${parseSkipped} empty rows skipped)`);

      // Batch import all customers at once
      console.log('[Customer Import] Starting batch database import...');
      const processStart = Date.now();
      const result = await storage.batchImportCustomers(customerList);
      
      const created = result.created;
      const updated = result.updated;
      const skipped = result.skipped + parseSkipped;
      const errors = result.errors;

      console.log(`[Customer Import] Batch import complete in ${Date.now() - processStart}ms: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`);

      // Update batch with final counts
      await storage.updateCustomerImportBatch(batch.id, {
        status: "completed",
        totalRows: String(records.length),
        createdCount: String(created),
        updatedCount: String(updated),
        skippedCount: String(skipped),
        errorCount: String(errors),
        errorDetails: errors > 0 ? `${errors} records failed to import` : null,
      });

      const updatedBatch = await storage.getCustomerImportBatch(batch.id);

      console.log(`[Customer Import] Total time: ${Date.now() - startTime}ms`);
      
      res.json({
        message: `Import completed: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`,
        batch: updatedBatch,
        summary: {
          total: records.length,
          created,
          updated,
          skipped,
          errors,
        }
      });
    } catch (error: any) {
      console.error('[Customer Import] Error:', error);
      res.status(500).json({ message: "Error importing customers: " + error.message });
    }
  });

  // ============================================
  // EMPLOYEE PORTAL API ROUTES
  // ============================================

  // Admin: Create new employee user
  app.post("/api/employee-portal/users", requireAdmin, async (req, res) => {
    try {
      const { username, email, password, role, firstName, lastName, phone, address, department, position, hireDate } = req.body;

      if (!username || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "Username, password, firstName, and lastName are required" });
      }

      const existingUser = await storage.getPortalUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      if (email) {
        const existingEmail = await storage.getPortalUserByEmail(email);
        if (existingEmail) {
          return res.status(400).json({ message: "Email already exists" });
        }
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createPortalUser({
        username,
        email: email || null,
        password: hashedPassword,
        role: role || "employee",
        isActive: true,
      });

      await storage.createEmployeeProfile({
        userId: user.id,
        firstName,
        lastName,
        phone: phone || null,
        address: address || null,
        department: department || null,
        position: position || null,
        hireDate: hireDate || null,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating employee user:", error);
      res.status(500).json({ message: "Failed to create employee user" });
    }
  });

  // Admin: Get all users with profiles
  app.get("/api/employee-portal/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllPortalUsers();
      const profiles = await storage.getAllEmployeeProfiles();

      const usersWithProfiles = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        const profile = profiles.find(p => p.userId === user.id);
        return { ...userWithoutPassword, profile };
      });

      res.json(usersWithProfiles);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin: Update user (role, isActive)
  app.patch("/api/employee-portal/users/:id", requireAdmin, async (req, res) => {
    try {
      const { role, isActive } = req.body;
      const updates: any = {};

      if (role !== undefined) updates.role = role;
      if (isActive !== undefined) updates.isActive = isActive;

      const user = await storage.updatePortalUser(req.params.id, updates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Admin: Set compensation for user
  app.post("/api/employee-portal/users/:id/compensation", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { payType, rate, commissionRate, paySchedule, effectiveDate } = req.body;

      if (!payType || !rate || !paySchedule || !effectiveDate) {
        return res.status(400).json({ message: "payType, rate, paySchedule, and effectiveDate are required" });
      }

      const user = await storage.getPortalUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentCompensation = await storage.getCurrentCompensation(userId);
      if (currentCompensation) {
        await storage.updateCompensation(currentCompensation.id, {
          endDate: effectiveDate,
        });
      }

      const newCompensation = await storage.createCompensation({
        userId,
        payType,
        rate,
        commissionRate: commissionRate || null,
        paySchedule,
        effectiveDate,
        endDate: null,
        createdBy: req.user!.id,
      });

      await storage.createCompensationAuditLog({
        userId,
        compensationId: newCompensation.id,
        action: "created",
        previousValue: currentCompensation ? JSON.stringify({
          payType: currentCompensation.payType,
          rate: currentCompensation.rate,
          paySchedule: currentCompensation.paySchedule,
        }) : null,
        newValue: JSON.stringify({ payType, rate, paySchedule }),
        changedBy: req.user!.id,
      });

      res.json(newCompensation);
    } catch (error) {
      console.error("Error setting compensation:", error);
      res.status(500).json({ message: "Failed to set compensation" });
    }
  });

  // Admin: Get compensation history for user
  app.get("/api/employee-portal/users/:id/compensation", requireAdmin, async (req, res) => {
    try {
      const history = await storage.getCompensationHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching compensation history:", error);
      res.status(500).json({ message: "Failed to fetch compensation history" });
    }
  });

  // Admin: Upload paystub for user
  app.post("/api/employee-portal/users/:id/paystubs", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { periodStart, periodEnd, payDate, grossPay, netPay, hoursWorked, deductions, fileUrl } = req.body;

      if (!periodStart || !periodEnd || !payDate || !grossPay || !netPay) {
        return res.status(400).json({ message: "periodStart, periodEnd, payDate, grossPay, and netPay are required" });
      }

      const user = await storage.getPortalUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const paystub = await storage.createPaystub({
        userId,
        periodStart,
        periodEnd,
        payDate,
        grossPay,
        netPay,
        hoursWorked: hoursWorked || null,
        deductions: deductions || null,
        fileUrl: fileUrl || null,
        uploadedBy: req.user!.id,
      });

      res.json(paystub);
    } catch (error) {
      console.error("Error uploading paystub:", error);
      res.status(500).json({ message: "Failed to upload paystub" });
    }
  });

  // Admin: Get all compensation audit logs
  app.get("/api/employee-portal/audit-log", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAllCompensationAuditLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Admin: Upload company-wide or personal document
  app.post("/api/employee-portal/documents", requireAdmin, async (req, res) => {
    try {
      const { userId, title, description, fileUrl, category } = req.body;

      if (!title || !fileUrl || !category) {
        return res.status(400).json({ message: "title, fileUrl, and category are required" });
      }

      const document = await storage.createEmployeeDocument({
        userId: userId || null,
        title,
        description: description || null,
        fileUrl,
        category,
        uploadedBy: req.user!.id,
      });

      res.json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Employee: Get own profile
  app.get("/api/employee-portal/profile", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getPortalUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const profile = await storage.getEmployeeProfile(userId);
      const currentCompensation = await storage.getCurrentCompensation(userId);

      const { password, ...userWithoutPassword } = user;
      res.json({
        ...userWithoutPassword,
        profile,
        compensation: currentCompensation,
        paySchedule: currentCompensation?.paySchedule || null,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Employee: Update own profile (limited fields)
  app.patch("/api/employee-portal/profile", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { phone, address } = req.body;

      const updates: any = {};
      if (phone !== undefined) updates.phone = phone;
      if (address !== undefined) updates.address = address;

      const profile = await storage.updateEmployeeProfile(userId, updates);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Employee: Get own current compensation
  app.get("/api/employee-portal/compensation", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const compensation = await storage.getCurrentCompensation(userId);
      res.json(compensation || null);
    } catch (error) {
      console.error("Error fetching compensation:", error);
      res.status(500).json({ message: "Failed to fetch compensation" });
    }
  });

  // Employee: Get own compensation history
  app.get("/api/employee-portal/compensation/history", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const history = await storage.getCompensationHistory(userId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching compensation history:", error);
      res.status(500).json({ message: "Failed to fetch compensation history" });
    }
  });

  // Employee: Get own paystubs
  app.get("/api/employee-portal/paystubs", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const paystubs = await storage.getPaystubs(userId);
      res.json(paystubs);
    } catch (error) {
      console.error("Error fetching paystubs:", error);
      res.status(500).json({ message: "Failed to fetch paystubs" });
    }
  });

  // Employee: Get own documents + company-wide docs
  app.get("/api/employee-portal/documents", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const personalDocs = await storage.getEmployeeDocuments(userId);
      const companyDocs = await storage.getEmployeeDocuments(null);
      res.json([...companyDocs, ...personalDocs]);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // ============================================
  // CRM AUTHENTICATION ROUTES
  // ============================================

  // POST /api/crm/auth/login - Login with email/password
  app.post("/api/crm/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await getCrmUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Account is disabled" });
      }

      const isValid = await compareCrmPasswords(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const userAgent = req.headers["user-agent"];
      const ipAddress = req.ip || req.socket.remoteAddress;
      const session = await createCrmSession(user.id, userAgent, ipAddress);

      res.cookie(CRM_SESSION_COOKIE, session.sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      });

      const { passwordHash, ...userWithoutPassword } = user;
      return res.json({
        message: "Login successful",
        user: userWithoutPassword,
      });
    } catch (error) {
      console.error("CRM login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // POST /api/crm/auth/logout - Destroy session
  app.post("/api/crm/auth/logout", async (req, res) => {
    try {
      const sessionToken = req.cookies?.[CRM_SESSION_COOKIE];
      if (sessionToken) {
        await destroyCrmSession(sessionToken);
      }
      res.clearCookie(CRM_SESSION_COOKIE);
      return res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("CRM logout error:", error);
      return res.status(500).json({ message: "Logout failed" });
    }
  });

  // GET /api/crm/auth/me - Get current authenticated CRM user
  app.get("/api/crm/auth/me", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { passwordHash, ...userWithoutPassword } = user;
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("CRM get me error:", error);
      return res.status(500).json({ message: "Failed to get user" });
    }
  });

  // POST /api/crm/auth/gate - Verify gate password
  app.post("/api/crm/auth/gate", (req, res) => {
    try {
      const { password } = req.body;

      if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Password is required" });
      }

      const isValid = verifyGatePassword(password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid gate password" });
      }

      return res.json({ message: "Gate password verified", valid: true });
    } catch (error) {
      console.error("CRM gate verification error:", error);
      return res.status(500).json({ message: "Verification failed" });
    }
  });

  // ============================================
  // CRM API ENDPOINTS
  // ============================================

  // GET /api/crm/customers - List customers with search, filters, and pagination
  // Only queries the customers table (CSV imports) - no Google Sheets sync
  app.get("/api/crm/customers", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        search,
        customerType,
        customerStatus,
        page = "1",
        limit = "50",
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const offset = (pageNum - 1) * limitNum;
      const searchTerm = search?.trim().toLowerCase() || "";

      // Build conditions for customers table
      const conditions: any[] = [];

      // Exclude archived customers by default
      conditions.push(sql`(${customers.archived} = false OR ${customers.archived} IS NULL)`);

      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        conditions.push(
          sql`(LOWER(${customers.displayName}) LIKE ${searchPattern} OR LOWER(${customers.email}) LIKE ${searchPattern} OR ${customers.phone} LIKE ${searchPattern} OR LOWER(${customers.fullAddress}) LIKE ${searchPattern})`
        );
      }

      if (customerType && customerType !== "all") {
        conditions.push(sql`LOWER(${customers.customerType}) = LOWER(${customerType})`);
      }

      if (customerStatus && customerStatus !== "all") {
        conditions.push(sql`LOWER(${customers.customerStatus}) = LOWER(${customerStatus})`);
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .where(whereClause);
      
      const total = Number(countResult?.count) || 0;

      // Get paginated results
      const customerResults = await db
        .select()
        .from(customers)
        .where(whereClause)
        .orderBy(desc(customers.createdAt))
        .limit(limitNum)
        .offset(offset);

      // Transform to unified format
      const transformedCustomers = customerResults.map(c => ({
        id: c.id,
        name: c.displayName,
        customerType: c.customerType,
        customerStatus: c.customerStatus,
        fullAddress: c.fullAddress,
        phone: c.phone,
        email: c.email,
        leadSource: c.leadSource,
        createdAt: c.createdAt,
        origin: 'crm_customers' as const,
      }));

      return res.json({
        customers: transformedCustomers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching CRM customers:", error);
      return res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  // GET /api/crm/customers/stats - Get customer counts by status (from customers table only)
  app.get("/api/crm/customers/stats", requireCrmAuth, async (req, res) => {
    try {
      const [prospectsResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .where(sql`LOWER(${customers.customerStatus}) = 'prospect'`);
      
      const [customersResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .where(sql`LOWER(${customers.customerStatus}) = 'customer'`);
      
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(customers);

      return res.json({
        prospects: Number(prospectsResult?.count || 0),
        customers: Number(customersResult?.count || 0),
        total: Number(totalResult?.count || 0),
      });
    } catch (error) {
      console.error("Error fetching customer stats:", error);
      return res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // POST /api/crm/customers - Create customer (ADMIN/SALES only)
  app.post("/api/crm/customers", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      const parsed = insertCrmCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid customer data", errors: parsed.error.errors });
      }

      const [customer] = await db.insert(crmCustomers).values(parsed.data).returning();
      
      await logCrmAudit(
        user?.id || null,
        "customer.created",
        "customer",
        customer.id,
        { name: customer.name },
        req.ip
      );

      return res.status(201).json(customer);
    } catch (error) {
      console.error("Error creating CRM customer:", error);
      return res.status(500).json({ message: "Failed to create customer" });
    }
  });

  // GET /api/crm/customers/:id - Get single customer
  // Checks crmAccounts first (new model), then crmCustomers, then legacy customers table
  app.get("/api/crm/customers/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;

      // Try crmAccounts first (new Account+Site+Contact model)
      const accountWithDetails = await db
        .select({
          id: crmAccounts.id,
          displayName: crmAccounts.displayName,
          companyName: crmAccounts.companyName,
          accountType: crmAccounts.accountType,
          accountStatus: crmAccounts.accountStatus,
          leadSource: crmAccounts.leadSource,
          pinnedNote: crmAccounts.pinnedNote,
          createdAt: crmAccounts.createdAt,
          siteAddress1: crmSites.address1,
          siteAddress2: crmSites.address2,
          siteCity: crmSites.city,
          siteState: crmSites.state,
          siteZip: crmSites.zip,
          contactPhone: crmContacts.phone,
          contactEmail: crmContacts.email,
          contactFirstName: crmContacts.firstName,
          contactLastName: crmContacts.lastName,
        })
        .from(crmAccounts)
        .leftJoin(crmSites, and(eq(crmSites.accountId, crmAccounts.id), eq(crmSites.isPrimary, true)))
        .leftJoin(crmContacts, and(eq(crmContacts.accountId, crmAccounts.id), eq(crmContacts.isPrimary, true)))
        .where(eq(crmAccounts.id, customerId))
        .limit(1);

      if (accountWithDetails.length > 0) {
        // Apply same authorization as crmCustomers - sales+ can see all, techs only assigned jobs
        if (!isSalesOrAbove(user.role)) {
          // For techs, check if they have any job assignments linked to this account
          const assignments = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.techUserId, user.id));
          const jobIds = assignments.map(a => a.jobId);
          if (jobIds.length === 0) {
            return res.status(403).json({ message: "Access denied" });
          }
          const jobs = await db.select().from(crmJobs).where(inArray(crmJobs.id, jobIds));
          const hasAccess = jobs.some(j => j.customerId === customerId);
          if (!hasAccess) {
            return res.status(403).json({ message: "Access denied" });
          }
        }

        const acc = accountWithDetails[0];
        const fullAddress = [acc.siteAddress1, acc.siteAddress2, acc.siteCity, acc.siteState, acc.siteZip]
          .filter(Boolean).join(", ");
        
        const customer = {
          id: acc.id,
          name: acc.displayName,
          companyName: acc.companyName,
          customerType: acc.accountType?.toLowerCase() || "residential",
          customerStatus: acc.accountStatus?.toLowerCase() || "prospect",
          phone: acc.contactPhone,
          email: acc.contactEmail,
          notes: acc.pinnedNote,
          fullAddress: fullAddress || null,
          createdAt: acc.createdAt,
          origin: 'crm_accounts' as const,
        };
        return res.json(customer);
      }

      // Fall back to crmCustomers table
      const [crmCustomer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
      if (crmCustomer) {
        if (isSalesOrAbove(user.role)) {
          return res.json({ ...crmCustomer, origin: 'crm_customers' });
        }
        const assignments = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.techUserId, user.id));
        const jobIds = assignments.map(a => a.jobId);
        if (jobIds.length === 0) {
          return res.status(403).json({ message: "Access denied" });
        }
        const jobs = await db.select().from(crmJobs).where(inArray(crmJobs.id, jobIds));
        const hasAccess = jobs.some(j => j.customerId === crmCustomer.id);
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied" });
        }
        return res.json({ ...crmCustomer, origin: 'crm_customers' });
      }

      // Fall back to legacy customers table
      const [legacyCustomer] = await db.select().from(customers).where(eq(customers.id, customerId));
      if (legacyCustomer) {
        return res.json({
          id: legacyCustomer.id,
          name: legacyCustomer.displayName || legacyCustomer.name,
          companyName: legacyCustomer.companyName,
          customerType: legacyCustomer.customerType,
          customerStatus: legacyCustomer.customerStatus,
          phone: legacyCustomer.phone,
          email: legacyCustomer.email,
          notes: null,
          fullAddress: legacyCustomer.fullAddress,
          createdAt: legacyCustomer.createdAt,
          origin: 'customers' as const,
        });
      }

      return res.status(404).json({ message: "Customer not found" });
    } catch (error) {
      console.error("Error fetching CRM customer:", error);
      return res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  // PATCH /api/crm/customers/:id - Update customer
  app.patch("/api/crm/customers/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;
      const { name, customerType, customerStatus, phone, email, fullAddress, leadSource } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: "Display name is required" });
      }

      // Check if user can change customerType (only admin/owner)
      const canChangeType = ["admin", "owner"].includes(user.role);

      // Try crmAccounts first (new Account+Site+Contact model)
      const [existingAccount] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, customerId));
      if (existingAccount) {
        const updateData: any = {
          displayName: name.trim(),
          accountStatus: customerStatus || existingAccount.accountStatus,
          leadSource: leadSource !== undefined ? leadSource : existingAccount.leadSource,
        };
        
        if (canChangeType && customerType) {
          updateData.accountType = customerType;
        }

        await db.update(crmAccounts)
          .set(updateData)
          .where(eq(crmAccounts.id, customerId));

        // Update primary contact phone/email if provided
        if (phone !== undefined || email !== undefined) {
          const [primaryContact] = await db.select().from(crmContacts)
            .where(and(eq(crmContacts.accountId, customerId), eq(crmContacts.isPrimary, true)));
          
          if (primaryContact) {
            const contactUpdate: any = {};
            if (phone !== undefined) contactUpdate.phone = phone;
            if (email !== undefined) contactUpdate.email = email;
            await db.update(crmContacts)
              .set(contactUpdate)
              .where(eq(crmContacts.id, primaryContact.id));
          }
        }

        // Update primary site address if provided
        if (fullAddress !== undefined) {
          const [primarySite] = await db.select().from(crmSites)
            .where(and(eq(crmSites.accountId, customerId), eq(crmSites.isPrimary, true)));
          
          if (primarySite) {
            await db.update(crmSites)
              .set({ address1: fullAddress || "" })
              .where(eq(crmSites.id, primarySite.id));
          }
        }

        await logCrmAudit(user.id, "customer.updated", "customer", customerId, { name: name.trim() }, req.ip);
        return res.json({ success: true, origin: 'crm_accounts' });
      }

      // Try crmCustomers table
      const [existingCrmCustomer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
      if (existingCrmCustomer) {
        const updateData: any = {
          name: name.trim(),
          phone: phone !== undefined ? phone : existingCrmCustomer.phone,
          email: email !== undefined ? email : existingCrmCustomer.email,
          customerStatus: customerStatus || existingCrmCustomer.customerStatus,
          notes: fullAddress !== undefined ? fullAddress : existingCrmCustomer.notes,
        };
        
        if (canChangeType && customerType) {
          updateData.customerType = customerType;
        }

        await db.update(crmCustomers)
          .set(updateData)
          .where(eq(crmCustomers.id, customerId));

        await logCrmAudit(user.id, "customer.updated", "customer", customerId, { name: name.trim() }, req.ip);
        return res.json({ success: true, origin: 'crm_customers' });
      }

      // Try legacy customers table
      const [existingLegacy] = await db.select().from(customers).where(eq(customers.id, customerId));
      if (existingLegacy) {
        const updateData: any = {
          displayName: name.trim(),
          phone: phone !== undefined ? phone : existingLegacy.phone,
          email: email !== undefined ? email : existingLegacy.email,
          customerStatus: customerStatus || existingLegacy.customerStatus,
          fullAddress: fullAddress !== undefined ? fullAddress : existingLegacy.fullAddress,
          leadSource: leadSource !== undefined ? leadSource : existingLegacy.leadSource,
        };
        
        if (canChangeType && customerType) {
          updateData.customerType = customerType;
        }

        await db.update(customers)
          .set(updateData)
          .where(eq(customers.id, customerId));

        await logCrmAudit(user.id, "customer.updated", "customer", customerId, { name: name.trim() }, req.ip);
        return res.json({ success: true, origin: 'customers' });
      }

      return res.status(404).json({ message: "Customer not found" });
    } catch (error) {
      console.error("Error updating CRM customer:", error);
      return res.status(500).json({ message: "Failed to update customer" });
    }
  });

  // GET /api/crm/jobs - List jobs with search, filters, and pagination
  app.get("/api/crm/jobs", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const search = (req.query.search as string) || "";
      const tab = (req.query.tab as string) || "all";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const conditions: any[] = [];
      const now = new Date();

      // Pre-filter cancelled jobs at DB level for cancelled tab
      if (tab === "cancelled") {
        conditions.push(eq(crmJobs.status, "cancelled"));
      }

      // For techs, limit to their assigned jobs
      let allowedJobIds: string[] | null = null;
      if (!isSalesOrAbove(user.role)) {
        const assignments = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.techUserId, user.id));
        allowedJobIds = assignments.map(a => a.jobId);
        if (allowedJobIds.length === 0) {
          return res.json({ jobs: [], total: 0, page, limit });
        }
        conditions.push(inArray(crmJobs.id, allowedJobIds));
      }

      // Search filter (account name or job type)
      if (search) {
        const searchPattern = `%${search.toLowerCase()}%`;
        conditions.push(
          sql`(LOWER(${crmAccounts.displayName}) LIKE ${searchPattern} OR LOWER(${crmCustomers.name}) LIKE ${searchPattern} OR LOWER(${crmJobs.jobType}) LIKE ${searchPattern})`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get jobs with customer/account/site info and work order aggregations
      const jobsWithInfo = await db.select({
        job: crmJobs,
        customerName: crmCustomers.name,
        accountName: crmAccounts.displayName,
        siteAddress1: crmSites.address1,
        siteCity: crmSites.city,
        siteState: crmSites.state,
      })
        .from(crmJobs)
        .leftJoin(crmCustomers, eq(crmJobs.customerId, crmCustomers.id))
        .leftJoin(crmAccounts, eq(crmJobs.accountId, crmAccounts.id))
        .leftJoin(crmSites, eq(crmJobs.siteId, crmSites.id))
        .where(whereClause)
        .orderBy(desc(crmJobs.scheduledStart), desc(crmJobs.createdAt));

      // Get all job IDs for work order aggregation
      const allJobIds = jobsWithInfo.map(j => j.job.id);
      
      // Get work orders for all jobs
      let workOrdersMap: Record<string, { 
        workOrders: Array<{ status: string; scheduledStart: Date | null; scheduledEnd: Date | null }>;
      }> = {};
      
      if (allJobIds.length > 0) {
        const workOrders = await db.select({
          jobId: crmWorkOrders.jobId,
          status: crmWorkOrders.status,
          scheduledStart: crmWorkOrders.scheduledStart,
          scheduledEnd: crmWorkOrders.scheduledEnd,
        })
          .from(crmWorkOrders)
          .where(inArray(crmWorkOrders.jobId, allJobIds));
        
        workOrders.forEach(wo => {
          if (!workOrdersMap[wo.jobId]) {
            workOrdersMap[wo.jobId] = { workOrders: [] };
          }
          workOrdersMap[wo.jobId].workOrders.push({
            status: wo.status,
            scheduledStart: wo.scheduledStart,
            scheduledEnd: wo.scheduledEnd,
          });
        });
      }

      // Get invoices for all jobs to check if all are paid
      let invoicesMap: Record<string, Array<{ status: string }>> = {};
      if (allJobIds.length > 0) {
        const invoices = await db.select({
          jobId: crmInvoices.jobId,
          status: crmInvoices.status,
        })
          .from(crmInvoices)
          .where(inArray(crmInvoices.jobId, allJobIds));
        
        invoices.forEach(inv => {
          if (!invoicesMap[inv.jobId]) {
            invoicesMap[inv.jobId] = [];
          }
          invoicesMap[inv.jobId].push({ status: inv.status });
        });
      }

      // Compute derived fields for each job
      const completedStatuses = ['completed', 'invoiced', 'paid'];
      const inProgressStatuses = ['dispatched', 'en_route', 'on_site'];

      const jobsWithDerived = jobsWithInfo.map(({ job, customerName, accountName, siteAddress1, siteCity, siteState }) => {
        const workOrderData = workOrdersMap[job.id]?.workOrders || [];
        const invoiceData = invoicesMap[job.id] || [];
        
        // Compute nextScheduledAt: earliest upcoming work order scheduledStart
        const upcomingWorkOrders = workOrderData.filter(wo => 
          wo.scheduledStart && new Date(wo.scheduledStart) > now
        );
        const nextScheduledAt = upcomingWorkOrders.length > 0
          ? upcomingWorkOrders.reduce((earliest, wo) => {
              const woDate = new Date(wo.scheduledStart!);
              return !earliest || woDate < earliest ? woDate : earliest;
            }, null as Date | null)
          : null;

        // Compute lastCompletedAt: latest completed work order (use scheduledEnd or scheduledStart as fallback)
        const completedWorkOrders = workOrderData.filter(wo => 
          completedStatuses.includes(wo.status) && (wo.scheduledEnd || wo.scheduledStart)
        );
        const lastCompletedAt = completedWorkOrders.length > 0
          ? completedWorkOrders.reduce((latest, wo) => {
              const woDate = new Date((wo.scheduledEnd || wo.scheduledStart)!);
              return !latest || woDate > latest ? woDate : latest;
            }, null as Date | null)
          : null;

        // Compute workOrderCount
        const workOrderCount = workOrderData.length;

        // Compute allWorkOrdersCompleted
        const allWorkOrdersCompleted = workOrderCount > 0 && 
          workOrderData.every(wo => completedStatuses.includes(wo.status));

        // Compute hasUpcoming
        const hasUpcoming = nextScheduledAt !== null;

        // Compute derivedStatus
        let derivedStatus: string;
        if (job.status === 'cancelled') {
          derivedStatus = 'cancelled';
        } else if (workOrderCount === 0) {
          derivedStatus = 'needs_scheduling';
        } else if (workOrderData.some(wo => inProgressStatuses.includes(wo.status))) {
          derivedStatus = 'in_progress';
        } else if (allWorkOrdersCompleted && !hasUpcoming) {
          // Check if all invoices are paid OR job.completedAt exists
          const allInvoicesPaid = invoiceData.length > 0 && 
            invoiceData.every(inv => inv.status === 'paid');
          if (allInvoicesPaid || job.completedAt) {
            derivedStatus = 'closed';
          } else {
            derivedStatus = 'completed';
          }
        } else if (hasUpcoming) {
          derivedStatus = 'scheduled';
        } else {
          // Has work orders but none upcoming or active - past visits only
          derivedStatus = 'completed';
        }

        return {
          ...job,
          accountName: accountName || customerName || "Unknown",
          siteAddress: siteAddress1 ? `${siteAddress1}, ${siteCity}, ${siteState}` : null,
          nextScheduledAt,
          lastCompletedAt,
          derivedStatus,
          hasUpcoming,
          allWorkOrdersCompleted,
          workOrderCount,
        };
      });

      // Apply tab-based filtering on computed fields
      let filteredJobs = jobsWithDerived;
      switch (tab) {
        case "needs_scheduling":
          // Jobs with no work orders yet or no upcoming visits
          filteredJobs = jobsWithDerived.filter(job => 
            job.derivedStatus === 'needs_scheduling'
          );
          break;
        case "scheduled":
          // Has at least one future work order, but none are in active status
          filteredJobs = jobsWithDerived.filter(job => 
            job.derivedStatus === 'scheduled'
          );
          break;
        case "in_progress":
          // Any work order is dispatched/en_route/on_site
          filteredJobs = jobsWithDerived.filter(job => 
            job.derivedStatus === 'in_progress'
          );
          break;
        case "completed":
          // All work orders completed
          filteredJobs = jobsWithDerived.filter(job => 
            job.derivedStatus === 'completed'
          );
          break;
        case "closed":
          // Job fully closed (all invoices paid)
          filteredJobs = jobsWithDerived.filter(job => 
            job.derivedStatus === 'closed'
          );
          break;
        case "cancelled":
          // Already filtered at DB level
          break;
        default:
          // "all" - no additional filtering
          break;
      }

      // Get total count after filtering
      const total = filteredJobs.length;

      // Apply pagination
      const paginatedJobs = filteredJobs.slice(offset, offset + limit);
      const paginatedJobIds = paginatedJobs.map(j => j.id);

      // Get assignments for paginated jobs
      let assignmentsMap: Record<string, { techId: string; techName: string }> = {};
      
      if (paginatedJobIds.length > 0) {
        const assignments = await db.select({
          jobId: crmJobAssignments.jobId,
          techId: crmJobAssignments.techUserId,
          techName: crmUsers.name,
        })
          .from(crmJobAssignments)
          .leftJoin(crmUsers, eq(crmJobAssignments.techUserId, crmUsers.id))
          .where(inArray(crmJobAssignments.jobId, paginatedJobIds));
        
        assignments.forEach(a => {
          assignmentsMap[a.jobId] = { techId: a.techId, techName: a.techName || "Unknown" };
        });
      }

      // Add assignment info to jobs
      const jobs = paginatedJobs.map(job => ({
        ...job,
        assignedTechId: assignmentsMap[job.id]?.techId || null,
        assignedTechName: assignmentsMap[job.id]?.techName || null,
      }));

      return res.json({ jobs, total, page, limit });
    } catch (error) {
      console.error("Error fetching CRM jobs:", error);
      return res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });

  // GET /api/crm/jobs/:id - Get single job with full details (case file)
  app.get("/api/crm/jobs/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const jobId = req.params.id;
      const [jobWithCustomer] = await db.select({
        job: crmJobs,
        customerName: crmCustomers.name,
        customerPhone: crmCustomers.phone,
        customerEmail: crmCustomers.email,
        accountName: crmAccounts.displayName,
      })
        .from(crmJobs)
        .leftJoin(crmCustomers, eq(crmJobs.customerId, crmCustomers.id))
        .leftJoin(crmAccounts, eq(crmJobs.accountId, crmAccounts.id))
        .where(eq(crmJobs.id, jobId));

      if (!jobWithCustomer) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Check access for techs
      if (!isSalesOrAbove(user.role)) {
        const assignments = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.jobId, jobId));
        const isAssigned = assignments.some(a => a.techUserId === user.id);
        if (!isAssigned) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Get assignment info
      const [assignment] = await db.select({
        techId: crmJobAssignments.techUserId,
        techName: crmUsers.name,
        techEmail: crmUsers.email,
        startAt: crmJobAssignments.startAt,
        endAt: crmJobAssignments.endAt,
      })
        .from(crmJobAssignments)
        .leftJoin(crmUsers, eq(crmJobAssignments.techUserId, crmUsers.id))
        .where(eq(crmJobAssignments.jobId, jobId))
        .limit(1);

      // Get property info if available
      let property = null;
      if (jobWithCustomer.job.propertyId) {
        const [prop] = await db.select().from(crmProperties).where(eq(crmProperties.id, jobWithCustomer.job.propertyId));
        property = prop || null;
      }

      // Get first property for customer if job has no property
      if (!property) {
        const [firstProp] = await db.select().from(crmProperties).where(eq(crmProperties.customerId, jobWithCustomer.job.customerId)).limit(1);
        property = firstProp || null;
      }

      // Get work orders with tech info
      const workOrdersRaw = await db.select({
        workOrder: crmWorkOrders,
        techName: crmUsers.name,
      })
        .from(crmWorkOrders)
        .leftJoin(crmUsers, eq(crmWorkOrders.assignedTechId, crmUsers.id))
        .where(eq(crmWorkOrders.jobId, jobId))
        .orderBy(crmWorkOrders.scheduledStart);

      const workOrders = workOrdersRaw.map(wo => ({
        ...wo.workOrder,
        techName: wo.techName || null,
      }));

      // Derive job status from work orders
      let derivedStatus = "new";
      if (workOrders.length > 0) {
        const statuses = workOrders.map(wo => wo.status);
        if (statuses.every(s => s === "completed")) {
          derivedStatus = "completed";
        } else if (statuses.some(s => s === "on_site")) {
          derivedStatus = "on_site";
        } else if (statuses.some(s => s === "en_route")) {
          derivedStatus = "en_route";
        } else if (statuses.some(s => s === "dispatched")) {
          derivedStatus = "dispatched";
        } else if (statuses.some(s => s === "scheduled")) {
          derivedStatus = "scheduled";
        }
      }

      // Get invoices for this job
      const invoices = await db.select()
        .from(crmInvoices)
        .where(eq(crmInvoices.jobId, jobId))
        .orderBy(crmInvoices.createdAt);

      // Get quotes for this job
      const quotes = await db.select()
        .from(crmQuotes)
        .where(eq(crmQuotes.jobId, jobId))
        .orderBy(crmQuotes.createdAt);

      // Calculate financial summary
      const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || "0"), 0);
      const totalPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || "0") - parseFloat(inv.balanceDue || "0"), 0);
      const balanceDue = invoices.reduce((sum, inv) => sum + parseFloat(inv.balanceDue || "0"), 0);
      const quoteTotal = quotes.reduce((sum, q) => sum + parseFloat(q.total || "0"), 0);
      const acceptedQuotes = quotes.filter(q => q.status === "accepted");

      return res.json({
        ...jobWithCustomer.job,
        customerName: jobWithCustomer.accountName || jobWithCustomer.customerName || "Unknown Customer",
        customerPhone: jobWithCustomer.customerPhone || null,
        customerEmail: jobWithCustomer.customerEmail || null,
        assignedTechId: assignment?.techId || null,
        assignedTechName: assignment?.techName || null,
        assignedTechEmail: assignment?.techEmail || null,
        property,
        workOrders,
        derivedStatus,
        invoices,
        quotes,
        financialSummary: {
          quoteTotal,
          quoteCount: quotes.length,
          acceptedQuoteCount: acceptedQuotes.length,
          totalInvoiced,
          totalPaid,
          balanceDue,
          invoiceCount: invoices.length,
        },
      });
    } catch (error) {
      console.error("Error fetching CRM job:", error);
      return res.status(500).json({ message: "Failed to fetch job" });
    }
  });

  // POST /api/crm/jobs - Create job (ADMIN/SALES only)
  app.post("/api/crm/jobs", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      
      // Convert date strings to Date objects before validation
      const body = { ...req.body };
      if (body.scheduledStart && typeof body.scheduledStart === 'string') {
        body.scheduledStart = new Date(body.scheduledStart);
      }
      if (body.scheduledEnd && typeof body.scheduledEnd === 'string') {
        body.scheduledEnd = new Date(body.scheduledEnd);
      }
      
      const parsed = insertCrmJobSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid job data", errors: parsed.error.errors });
      }

      // Validate account and site if using new Account model
      if (parsed.data.accountId) {
        const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, parsed.data.accountId));
        if (!account) {
          return res.status(400).json({ message: "Account not found" });
        }

        if (parsed.data.siteId) {
          const [site] = await db.select().from(crmSites).where(
            and(
              eq(crmSites.id, parsed.data.siteId),
              eq(crmSites.accountId, parsed.data.accountId)
            )
          );
          if (!site) {
            return res.status(400).json({ message: "Site not found or doesn't belong to account" });
          }
        }
      } else if (parsed.data.customerId) {
        // Legacy: validate customer if using old model
        const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, parsed.data.customerId));
        if (!customer) {
          return res.status(400).json({ message: "Customer not found" });
        }
      } else {
        return res.status(400).json({ message: "Either accountId or customerId is required" });
      }

      const [job] = await db.insert(crmJobs).values(parsed.data as any).returning();
      
      await db.insert(crmJobStatusEvents).values({
        jobId: job.id,
        status: job.status || "new",
        userId: user?.id || null,
        notes: "Job created",
      });

      await logCrmAudit(
        user?.id || null,
        "job.created",
        "job",
        job.id,
        { accountId: job.accountId, siteId: job.siteId, customerId: job.customerId, jobType: job.jobType },
        req.ip
      );

      return res.status(201).json(job);
    } catch (error) {
      console.error("Error creating CRM job:", error);
      return res.status(500).json({ message: "Failed to create job" });
    }
  });

  // POST /api/crm/jobs/:id/assign - Assign tech to job (ADMIN/SALES only)
  app.post("/api/crm/jobs/:id/assign", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      const { techUserId, startAt, endAt } = req.body;

      if (!techUserId) {
        return res.status(400).json({ message: "techUserId is required" });
      }

      const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, req.params.id));
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const [tech] = await db.select().from(crmUsers).where(eq(crmUsers.id, techUserId));
      if (!tech) {
        return res.status(400).json({ message: "Tech user not found" });
      }

      const [assignment] = await db.insert(crmJobAssignments).values({
        jobId: job.id,
        techUserId,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      }).returning();

      await logCrmAudit(
        user?.id || null,
        "job.assigned",
        "job",
        job.id,
        { techUserId, techName: tech.name },
        req.ip
      );

      return res.status(201).json(assignment);
    } catch (error) {
      console.error("Error assigning tech to job:", error);
      return res.status(500).json({ message: "Failed to assign tech" });
    }
  });

  // GET /api/crm/jobs/:id/work-orders - Get work orders for a job
  app.get("/api/crm/jobs/:id/work-orders", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const jobId = req.params.id;
      const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, jobId));
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const workOrders = await storage.getWorkOrdersByJobId(jobId);
      return res.json(workOrders);
    } catch (error) {
      console.error("Error fetching work orders for job:", error);
      return res.status(500).json({ message: "Failed to fetch work orders" });
    }
  });

  // POST /api/crm/jobs/:id/status - Update job status
  app.post("/api/crm/jobs/:id/status", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { status, notes } = req.body;
      if (!status) {
        return res.status(400).json({ message: "status is required" });
      }

      const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, req.params.id));
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (!isSalesOrAbove(user.role)) {
        const assignments = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.jobId, job.id));
        const isAssigned = assignments.some(a => a.techUserId === user.id);
        if (!isAssigned) {
          return res.status(403).json({ message: "Access denied - not assigned to this job" });
        }
      }

      const oldStatus = job.status;
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };
      if (status === "completed" && !job.completedAt) {
        updateData.completedAt = new Date();
      }

      const [updatedJob] = await db.update(crmJobs).set(updateData).where(eq(crmJobs.id, job.id)).returning();

      await db.insert(crmJobStatusEvents).values({
        jobId: job.id,
        status,
        userId: user.id,
        notes: notes || null,
      });

      await logCrmAudit(
        user.id,
        "job.status_changed",
        "job",
        job.id,
        { oldStatus, newStatus: status, notes },
        req.ip
      );

      return res.json(updatedJob);
    } catch (error) {
      console.error("Error updating job status:", error);
      return res.status(500).json({ message: "Failed to update job status" });
    }
  });

  // GET /api/crm/users - List users (ADMIN only)
  app.get("/api/crm/users", requireCrmAdmin, async (req, res) => {
    try {
      const users = await db.select({
        id: crmUsers.id,
        name: crmUsers.name,
        email: crmUsers.email,
        phone: crmUsers.phone,
        role: crmUsers.role,
        isActive: crmUsers.isActive,
        createdAt: crmUsers.createdAt,
      }).from(crmUsers).orderBy(desc(crmUsers.createdAt));
      return res.json(users);
    } catch (error) {
      console.error("Error fetching CRM users:", error);
      return res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // POST /api/crm/users - Create user (ADMIN only)
  app.post("/api/crm/users", requireCrmAdmin, async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      const { name, email, password, role, phone } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ message: "name, email, and password are required" });
      }

      const existing = await getCrmUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      const passwordHash = await hashCrmPassword(password);
      const [user] = await db.insert(crmUsers).values({
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: role || "viewer",
        phone: phone || null,
      }).returning();

      await logCrmAudit(
        currentUser?.id || null,
        "user.created",
        "user",
        user.id,
        { name: user.name, email: user.email, role: user.role },
        req.ip
      );

      const { passwordHash: _, ...userWithoutPassword } = user;
      return res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating CRM user:", error);
      return res.status(500).json({ message: "Failed to create user" });
    }
  });

  // PATCH /api/crm/users/:id/deactivate - Deactivate user (ADMIN only)
  app.patch("/api/crm/users/:id/deactivate", requireCrmAdmin, async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      const userId = req.params.id;

      if (currentUser?.id === userId) {
        return res.status(400).json({ message: "Cannot deactivate your own account" });
      }

      const [user] = await db.select().from(crmUsers).where(eq(crmUsers.id, userId));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const [updatedUser] = await db.update(crmUsers).set({ isActive: false }).where(eq(crmUsers.id, userId)).returning();

      await logCrmAudit(
        currentUser?.id || null,
        "user.deactivated",
        "user",
        userId,
        { name: user.name, email: user.email },
        req.ip
      );

      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error deactivating CRM user:", error);
      return res.status(500).json({ message: "Failed to deactivate user" });
    }
  });

  // GET /api/crm/dispatch - Get dispatch board data for a specific date
  app.get("/api/crm/dispatch", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dateParam = req.query.date as string;
      
      // Parse date in UTC to avoid timezone issues
      let targetDateStr: string;
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        targetDateStr = dateParam;
      } else {
        const now = new Date();
        targetDateStr = now.toISOString().split("T")[0];
      }

      // Use UTC-based date range for consistent querying
      const startOfDay = new Date(targetDateStr + "T00:00:00.000Z");
      const endOfDay = new Date(targetDateStr + "T23:59:59.999Z");

      // Get technicians (exclude owner role)
      const technicians = await db.select({
        id: crmUsers.id,
        name: crmUsers.name,
        email: crmUsers.email,
        role: crmUsers.role,
      }).from(crmUsers).where(
        and(
          sql`${crmUsers.role} != 'owner'`,
          eq(crmUsers.isActive, true)
        )
      );

      // Get all job assignments for the date
      const assignments = await db.select().from(crmJobAssignments);

      // Get jobs scheduled for this day OR unassigned jobs (no scheduledStart)
      // Join with both crmCustomers (legacy) and crmAccounts (new model)
      const scheduledJobs = await db.select({
        job: crmJobs,
        legacyCustomerName: crmCustomers.name,
        accountName: crmAccounts.displayName,
      }).from(crmJobs)
        .leftJoin(crmCustomers, eq(crmJobs.customerId, crmCustomers.id))
        .leftJoin(crmAccounts, eq(crmJobs.accountId, crmAccounts.id))
        .where(
          sql`(${crmJobs.scheduledStart} >= ${startOfDay} AND ${crmJobs.scheduledStart} <= ${endOfDay})
              OR ${crmJobs.scheduledStart} IS NULL`
        );

      // Build jobs with assignment info
      const jobsWithAssignments = scheduledJobs.map(({ job, legacyCustomerName, accountName }) => {
        const assignment = assignments.find(a => a.jobId === job.id);
        // Use account name if available (new model), otherwise legacy customer name
        const customerName = accountName || legacyCustomerName || "Unknown Customer";
        return {
          ...job,
          customerName,
          assignedTechId: assignment?.techUserId || null,
          assignmentId: assignment?.id || null,
        };
      });

      return res.json({
        technicians,
        jobs: jobsWithAssignments,
        date: targetDateStr,
      });
    } catch (error) {
      console.error("Error fetching dispatch data:", error);
      return res.status(500).json({ message: "Failed to fetch dispatch data" });
    }
  });

  // PATCH /api/crm/jobs/:id - Update job (with permissions and double-booking check)
  app.patch("/api/crm/jobs/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const jobId = req.params.id;
      const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, jobId));
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const { assignedTechId, scheduledStart, scheduledEnd, status, description, notes } = req.body;

      // Check permissions
      const isAdminOrSales = isSalesOrAbove(user.role);
      
      if (!isAdminOrSales) {
        // Techs can only update jobs assigned to them, and only status/notes
        const assignments = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.jobId, jobId));
        const isAssigned = assignments.some(a => a.techUserId === user.id);
        
        if (!isAssigned) {
          return res.status(403).json({ message: "Access denied - not assigned to this job" });
        }

        // Techs can only update status and notes
        if (assignedTechId !== undefined || scheduledStart !== undefined || scheduledEnd !== undefined) {
          return res.status(403).json({ message: "Access denied - techs can only update status and notes" });
        }
      }

      // OVERLAP VALIDATION: Check for double-booking BEFORE any changes
      // This runs when:
      // 1. Assigning a tech to an already-scheduled job (only assignedTechId sent, use existing times)
      // 2. Changing times for an already-assigned job (only times sent, lookup existing tech)
      // 3. Both at once (tech AND times in request)
      
      // Determine effective techId: use request value if provided, otherwise lookup existing assignment
      let effectiveTechId: string | null = null;
      if (assignedTechId !== undefined) {
        effectiveTechId = assignedTechId;
      } else {
        const existingAssignment = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.jobId, jobId));
        effectiveTechId = existingAssignment[0]?.techUserId || null;
      }

      // Determine effective times: use request values if provided, otherwise use job's existing times
      let effectiveStart: Date | null = null;
      if (scheduledStart !== undefined) {
        effectiveStart = scheduledStart ? new Date(scheduledStart) : null;
      } else if (job.scheduledStart) {
        effectiveStart = job.scheduledStart instanceof Date ? job.scheduledStart : new Date(job.scheduledStart);
      }

      let effectiveEnd: Date | null = null;
      if (scheduledEnd !== undefined) {
        effectiveEnd = scheduledEnd ? new Date(scheduledEnd) : null;
      } else if (job.scheduledEnd) {
        effectiveEnd = job.scheduledEnd instanceof Date ? job.scheduledEnd : new Date(job.scheduledEnd);
      }

      // Run overlap check if we have a tech AND both scheduled times
      if (effectiveTechId && effectiveStart && effectiveEnd) {
        // Query ALL jobs assigned to the target tech (not just current assignments)
        const techAssignments = await db.select().from(crmJobAssignments)
          .where(eq(crmJobAssignments.techUserId, effectiveTechId));
        
        // Exclude current job from overlap check
        const otherJobIds = techAssignments.map(a => a.jobId).filter(id => id !== jobId);
        
        if (otherJobIds.length > 0) {
          // Check for time overlap: start1 < end2 AND end1 > start2
          const overlappingJobs = await db.select().from(crmJobs)
            .where(
              and(
                inArray(crmJobs.id, otherJobIds),
                sql`${crmJobs.scheduledStart} IS NOT NULL`,
                sql`${crmJobs.scheduledEnd} IS NOT NULL`,
                sql`${crmJobs.scheduledStart} < ${effectiveEnd}`,
                sql`${crmJobs.scheduledEnd} > ${effectiveStart}`
              )
            );

          if (overlappingJobs.length > 0) {
            return res.status(409).json({
              message: "Double booking detected - technician has overlapping jobs",
              conflictingJobs: overlappingJobs.map(j => ({ id: j.id, scheduledStart: j.scheduledStart, scheduledEnd: j.scheduledEnd })),
            });
          }
        }
      }

      // Build update data
      const updateData: Record<string, any> = { updatedAt: new Date() };
      const changes: Record<string, any> = {};

      if (scheduledStart !== undefined) {
        updateData.scheduledStart = scheduledStart ? new Date(scheduledStart) : null;
        changes.scheduledStart = { old: job.scheduledStart, new: updateData.scheduledStart };
      }
      if (scheduledEnd !== undefined) {
        updateData.scheduledEnd = scheduledEnd ? new Date(scheduledEnd) : null;
        changes.scheduledEnd = { old: job.scheduledEnd, new: updateData.scheduledEnd };
      }
      if (status !== undefined) {
        updateData.status = status;
        changes.status = { old: job.status, new: status };
        if (status === "completed" && !job.completedAt) {
          updateData.completedAt = new Date();
        }
      }
      
      // Auto-set status to "scheduled" when times are set and current status is "new"
      const finalStart = updateData.scheduledStart !== undefined ? updateData.scheduledStart : job.scheduledStart;
      const finalEnd = updateData.scheduledEnd !== undefined ? updateData.scheduledEnd : job.scheduledEnd;
      const currentStatus = updateData.status !== undefined ? updateData.status : job.status;
      
      if (finalStart && finalEnd && currentStatus === "new") {
        updateData.status = "scheduled";
        changes.status = { old: job.status, new: "scheduled" };
      }
      
      if (description !== undefined) {
        updateData.description = description;
        changes.description = { old: job.description, new: description };
      }

      // Update the job
      const [updatedJob] = await db.update(crmJobs).set(updateData).where(eq(crmJobs.id, jobId)).returning();

      // Handle tech assignment
      if (assignedTechId !== undefined && isAdminOrSales) {
        // Remove existing assignments for this job
        await db.delete(crmJobAssignments).where(eq(crmJobAssignments.jobId, jobId));
        
        if (assignedTechId) {
          // Create new assignment
          await db.insert(crmJobAssignments).values({
            jobId,
            techUserId: assignedTechId,
            startAt: updateData.scheduledStart || job.scheduledStart,
            endAt: updateData.scheduledEnd || job.scheduledEnd,
          });
          changes.assignedTechId = { old: null, new: assignedTechId };
        }
      }

      // Log status event if status changed
      if (status !== undefined && status !== job.status) {
        await db.insert(crmJobStatusEvents).values({
          jobId,
          status,
          userId: user.id,
          notes: notes || null,
        });
      }

      // Create audit log entry
      await logCrmAudit(
        user.id,
        "job.updated",
        "job",
        jobId,
        changes,
        req.ip
      );

      // Get the updated job with assignment info
      const [assignment] = await db.select().from(crmJobAssignments).where(eq(crmJobAssignments.jobId, jobId));
      const [customer] = await db.select({ name: crmCustomers.name }).from(crmCustomers).where(eq(crmCustomers.id, updatedJob.customerId));

      return res.json({
        ...updatedJob,
        customerName: customer?.name || "Unknown Customer",
        assignedTechId: assignment?.techUserId || null,
        assignmentId: assignment?.id || null,
      });
    } catch (error) {
      console.error("Error updating job:", error);
      return res.status(500).json({ message: "Failed to update job" });
    }
  });

  // DELETE /api/crm/jobs/:id - Delete job (ADMIN/SALES only)
  app.delete("/api/crm/jobs/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      const jobId = req.params.id;

      const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, jobId));
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Delete related records first (assignments, status events)
      await db.delete(crmJobAssignments).where(eq(crmJobAssignments.jobId, jobId));
      await db.delete(crmJobStatusEvents).where(eq(crmJobStatusEvents.jobId, jobId));

      // Delete the job
      await db.delete(crmJobs).where(eq(crmJobs.id, jobId));

      // Log the deletion
      await logCrmAudit(
        user?.id || null,
        "job.deleted",
        "job",
        jobId,
        { customerId: job.customerId, jobType: job.jobType },
        req.ip
      );

      return res.json({ message: "Job deleted successfully" });
    } catch (error) {
      console.error("Error deleting job:", error);
      return res.status(500).json({ message: "Failed to delete job" });
    }
  });

  // GET /api/crm/customers/:id/jobs - Get jobs for a customer
  // Supports customers from crmAccounts, crmCustomers, or legacy customers table
  app.get("/api/crm/customers/:id/jobs", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;
      
      // Verify customer exists in any of the three tables
      const [crmAccount] = await db.select({ id: crmAccounts.id }).from(crmAccounts).where(eq(crmAccounts.id, customerId));
      const [crmCustomer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(eq(crmCustomers.id, customerId));
      const [legacyCustomer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
      
      if (!crmAccount && !crmCustomer && !legacyCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Get jobs for this customer (jobs reference customerId which maps to crmCustomers)
      // For crmAccounts, jobs would be linked via accountId column if exists, but currently linked via customerId
      const jobs = await db.select().from(crmJobs)
        .where(eq(crmJobs.customerId, customerId))
        .orderBy(desc(crmJobs.createdAt));

      // Get assignments for these jobs
      const jobIds = jobs.map(j => j.id);
      const assignments = jobIds.length > 0 
        ? await db.select().from(crmJobAssignments).where(inArray(crmJobAssignments.jobId, jobIds))
        : [];

      // Get tech names
      const techIds = [...new Set(assignments.map(a => a.techUserId))];
      const techs = techIds.length > 0
        ? await db.select({ id: crmUsers.id, name: crmUsers.name }).from(crmUsers).where(inArray(crmUsers.id, techIds))
        : [];

      const jobsWithInfo = jobs.map(job => {
        const assignment = assignments.find(a => a.jobId === job.id);
        const tech = assignment ? techs.find(t => t.id === assignment.techUserId) : null;
        return {
          ...job,
          assignedTechId: assignment?.techUserId || null,
          assignedTechName: tech?.name || null,
        };
      });

      return res.json(jobsWithInfo);
    } catch (error) {
      console.error("Error fetching customer jobs:", error);
      return res.status(500).json({ message: "Failed to fetch customer jobs" });
    }
  });

  // GET /api/crm/customers/:id/notes - Get notes for a customer
  // Supports customers from crmAccounts, crmCustomers, or legacy customers table
  app.get("/api/crm/customers/:id/notes", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;
      
      // Verify customer exists in any of the three tables
      const [crmAccount] = await db.select({ id: crmAccounts.id }).from(crmAccounts).where(eq(crmAccounts.id, customerId));
      const [crmCustomer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(eq(crmCustomers.id, customerId));
      const [legacyCustomer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
      
      if (!crmAccount && !crmCustomer && !legacyCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Get notes for this customer with user names
      const notes = await db.select({
        id: crmCustomerNotes.id,
        customerId: crmCustomerNotes.customerId,
        userId: crmCustomerNotes.userId,
        body: crmCustomerNotes.body,
        createdAt: crmCustomerNotes.createdAt,
        userName: crmUsers.name,
      })
        .from(crmCustomerNotes)
        .leftJoin(crmUsers, eq(crmCustomerNotes.userId, crmUsers.id))
        .where(eq(crmCustomerNotes.customerId, customerId))
        .orderBy(desc(crmCustomerNotes.createdAt));

      return res.json(notes);
    } catch (error) {
      console.error("Error fetching customer notes:", error);
      return res.status(500).json({ message: "Failed to fetch customer notes" });
    }
  });

  // POST /api/crm/customers/:id/notes - Create a note for a customer
  app.post("/api/crm/customers/:id/notes", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;
      const { body } = req.body;

      if (!body || typeof body !== "string" || !body.trim()) {
        return res.status(400).json({ message: "Note body is required" });
      }
      
      // Verify customer exists in any of the three tables
      const [crmAccount] = await db.select({ id: crmAccounts.id }).from(crmAccounts).where(eq(crmAccounts.id, customerId));
      const [crmCustomer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(eq(crmCustomers.id, customerId));
      const [legacyCustomer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
      
      if (!crmAccount && !crmCustomer && !legacyCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Create the note
      const [newNote] = await db.insert(crmCustomerNotes).values({
        customerId,
        userId: user.id,
        body: body.trim(),
      }).returning();

      // Return with user name
      return res.json({
        ...newNote,
        userName: user.name,
      });
    } catch (error) {
      console.error("Error creating customer note:", error);
      return res.status(500).json({ message: "Failed to create customer note" });
    }
  });

  // GET /api/crm/customers/:id/impact - Get counts of linked records for a customer
  app.get("/api/crm/customers/:id/impact", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;

      // Verify customer exists in any of the three tables
      const [crmAccount] = await db.select({ id: crmAccounts.id }).from(crmAccounts).where(eq(crmAccounts.id, customerId));
      const [crmCustomer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(eq(crmCustomers.id, customerId));
      const [legacyCustomer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));

      if (!crmAccount && !crmCustomer && !legacyCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Count projects (crmJobs) linked to this customer
      const [jobsResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmJobs)
        .where(or(
          eq(crmJobs.customerId, customerId),
          eq(crmJobs.accountId, customerId)
        ));

      const projectCount = Number(jobsResult?.count || 0);

      // Get job IDs to count work orders
      const jobIds = await db
        .select({ id: crmJobs.id })
        .from(crmJobs)
        .where(or(
          eq(crmJobs.customerId, customerId),
          eq(crmJobs.accountId, customerId)
        ));

      let workOrderCount = 0;
      if (jobIds.length > 0) {
        const [workOrdersResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(crmWorkOrders)
          .where(inArray(crmWorkOrders.jobId, jobIds.map(j => j.id)));
        workOrderCount = Number(workOrdersResult?.count || 0);
      }

      // Count quotes linked to this customer (via accountId)
      const [quotesResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmQuotes)
        .where(eq(crmQuotes.accountId, customerId));

      const quoteCount = Number(quotesResult?.count || 0);

      // Count invoices linked to this customer
      const [invoicesResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmInvoices)
        .where(eq(crmInvoices.customerId, customerId));

      const invoiceCount = Number(invoicesResult?.count || 0);

      return res.json({
        projects: projectCount,
        workOrders: workOrderCount,
        quotes: quoteCount,
        invoices: invoiceCount,
        hasLinkedRecords: projectCount > 0 || workOrderCount > 0 || quoteCount > 0 || invoiceCount > 0,
      });
    } catch (error) {
      console.error("Error fetching customer impact:", error);
      return res.status(500).json({ message: "Failed to fetch customer impact" });
    }
  });

  // DELETE /api/crm/customers/:id - Delete or archive a customer (admin/owner/manager only)
  app.delete("/api/crm/customers/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check if user has admin/owner/manager role
      if (!["admin", "owner", "manager"].includes(user.role)) {
        return res.status(403).json({ message: "Forbidden - Admin, owner, or manager role required" });
      }

      const customerId = req.params.id;
      const { reason } = req.body || {};

      // Check which table the customer exists in
      const [crmAccount] = await db.select({ id: crmAccounts.id }).from(crmAccounts).where(eq(crmAccounts.id, customerId));
      const [crmCustomer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(eq(crmCustomers.id, customerId));
      const [legacyCustomer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));

      if (!crmAccount && !crmCustomer && !legacyCustomer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Check for linked records
      const [jobsResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmJobs)
        .where(or(
          eq(crmJobs.customerId, customerId),
          eq(crmJobs.accountId, customerId)
        ));

      const projectCount = Number(jobsResult?.count || 0);

      // Get job IDs to count work orders
      const jobIds = await db
        .select({ id: crmJobs.id })
        .from(crmJobs)
        .where(or(
          eq(crmJobs.customerId, customerId),
          eq(crmJobs.accountId, customerId)
        ));

      let workOrderCount = 0;
      if (jobIds.length > 0) {
        const [workOrdersResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(crmWorkOrders)
          .where(inArray(crmWorkOrders.jobId, jobIds.map(j => j.id)));
        workOrderCount = Number(workOrdersResult?.count || 0);
      }

      const [quotesResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmQuotes)
        .where(eq(crmQuotes.accountId, customerId));
      const quoteCount = Number(quotesResult?.count || 0);

      const [invoicesResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmInvoices)
        .where(eq(crmInvoices.customerId, customerId));
      const invoiceCount = Number(invoicesResult?.count || 0);

      const hasLinkedRecords = projectCount > 0 || workOrderCount > 0 || quoteCount > 0 || invoiceCount > 0;

      if (hasLinkedRecords) {
        // Archive the customer instead of deleting
        // Only the legacy customers table supports archiving
        if (legacyCustomer) {
          await db.update(customers)
            .set({
              archived: true,
              archivedAt: new Date(),
              archivedBy: user.id,
              archiveReason: reason || null,
            })
            .where(eq(customers.id, customerId));

          // Log the archive action
          await logCrmAudit(db, {
            userId: user.id,
            action: "archive_customer",
            entityType: "customer",
            entityId: customerId,
            details: { reason, linkedRecords: { projectCount, workOrderCount, quoteCount, invoiceCount } },
          });

          return res.json({
            message: "Customer archived successfully",
            action: "archived",
            reason: reason || null,
          });
        } else {
          // For crmAccounts or crmCustomers, we can't archive (no archive columns), return error
          return res.status(400).json({
            message: "Cannot delete customer with linked records. Customer is from a table that does not support archiving.",
            linkedRecords: { projectCount, workOrderCount, quoteCount, invoiceCount },
          });
        }
      } else {
        // No linked records - hard delete
        if (legacyCustomer) {
          await db.delete(customers).where(eq(customers.id, customerId));
        } else if (crmCustomer) {
          await db.delete(crmCustomers).where(eq(crmCustomers.id, customerId));
        } else if (crmAccount) {
          // Delete related sites and contacts first (cascade should handle this, but being explicit)
          await db.delete(crmContacts).where(eq(crmContacts.accountId, customerId));
          await db.delete(crmSites).where(eq(crmSites.accountId, customerId));
          await db.delete(crmAccounts).where(eq(crmAccounts.id, customerId));
        }

        // Log the delete action
        await logCrmAudit(db, {
          userId: user.id,
          action: "delete_customer",
          entityType: "customer",
          entityId: customerId,
          details: { reason },
        });

        return res.json({
          message: "Customer deleted permanently",
          action: "deleted",
        });
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      return res.status(500).json({ message: "Failed to delete customer" });
    }
  });

  // ============================================
  // CRM ACCOUNTS API ENDPOINTS (NEW ACCOUNT MODEL)
  // ============================================

  // Helper function to validate account based on type
  async function validateAccountByType(
    accountId: string,
    accountType: AccountType,
    profile?: any
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Get sites and contacts for this account
    const sites = await db.select().from(crmSites).where(eq(crmSites.accountId, accountId));
    const contacts = await db.select().from(crmContacts).where(eq(crmContacts.accountId, accountId));

    switch (accountType) {
      case "RESIDENTIAL":
        if (sites.length === 0) {
          errors.push("Residential accounts must have at least 1 site");
        }
        if (contacts.length === 0) {
          errors.push("Residential accounts must have at least 1 contact");
        }
        break;

      case "PROPERTY_MANAGER":
        const pmContacts = contacts.filter(c => c.contactRole === "PM");
        const apOrBillingContacts = contacts.filter(c => c.contactRole === "AP" || c.contactRole === "BILLING");
        if (pmContacts.length === 0) {
          errors.push("Property Manager accounts must have at least 1 PM contact");
        }
        if (apOrBillingContacts.length === 0) {
          errors.push("Property Manager accounts must have at least 1 AP or Billing contact");
        }
        break;

      case "COMMERCIAL":
        const facilitiesOrDecisionMaker = contacts.filter(
          c => c.contactRole === "FACILITIES" || c.contactRole === "DECISION_MAKER"
        );
        if (facilitiesOrDecisionMaker.length === 0) {
          errors.push("Commercial accounts must have at least 1 Facilities or Decision Maker contact");
        }
        // Check if requiresPO is enabled
        if (profile?.requiresPO) {
          const apContacts = contacts.filter(c => c.contactRole === "AP");
          if (apContacts.length === 0) {
            errors.push("Commercial accounts with requiresPO enabled must have at least 1 AP contact");
          }
        }
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  // GET /api/crm/accounts - List accounts with pagination, search, and filtering
  app.get("/api/crm/accounts", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const offset = (page - 1) * limit;
      const search = req.query.search as string;
      const accountType = req.query.accountType as AccountType;
      const accountStatus = req.query.accountStatus as AccountStatus;

      // Build where conditions
      const conditions: any[] = [];

      if (search) {
        conditions.push(
          or(
            ilike(crmAccounts.displayName, `%${search}%`),
            ilike(crmAccounts.companyName, `%${search}%`)
          )
        );
      }

      if (accountType) {
        conditions.push(eq(crmAccounts.accountType, accountType));
      }

      if (accountStatus) {
        conditions.push(eq(crmAccounts.accountStatus, accountStatus));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const [countResult] = await db.select({ count: count() }).from(crmAccounts).where(whereClause);
      const total = countResult?.count || 0;

      // Get accounts with pagination
      const accounts = await db
        .select()
        .from(crmAccounts)
        .where(whereClause)
        .orderBy(asc(crmAccounts.displayName))
        .limit(limit)
        .offset(offset);

      // Get primary sites for each account
      const accountIds = accounts.map(a => a.id);
      const primarySites = accountIds.length > 0
        ? await db.select().from(crmSites).where(
            and(
              inArray(crmSites.accountId, accountIds),
              eq(crmSites.isPrimary, true)
            )
          )
        : [];

      // Get primary contacts for each account
      const primaryContacts = accountIds.length > 0
        ? await db.select().from(crmContacts).where(
            and(
              inArray(crmContacts.accountId, accountIds),
              eq(crmContacts.isPrimary, true)
            )
          )
        : [];

      const accountsWithInfo = accounts.map(account => ({
        ...account,
        primarySite: primarySites.find(s => s.accountId === account.id) || null,
        primaryContact: primaryContacts.find(c => c.accountId === account.id) || null,
      }));

      return res.json({
        accounts: accountsWithInfo,
        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching accounts:", error);
      return res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // POST /api/crm/accounts - Create new account with optional sites, contacts, and profile
  app.post("/api/crm/accounts", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { account, sites, contacts, profile } = req.body;

      // Validate account data
      const accountResult = insertCrmAccountSchema.safeParse(account);
      if (!accountResult.success) {
        return res.status(400).json({
          message: "Invalid account data",
          errors: accountResult.error.flatten(),
        });
      }

      // Create account
      const [newAccount] = await db.insert(crmAccounts).values(accountResult.data).returning();

      // Create sites if provided
      let createdSites: any[] = [];
      if (sites && Array.isArray(sites) && sites.length > 0) {
        for (const site of sites) {
          const siteData = { ...site, accountId: newAccount.id };
          const siteResult = insertCrmSiteSchema.safeParse(siteData);
          if (siteResult.success) {
            const [createdSite] = await db.insert(crmSites).values(siteResult.data).returning();
            createdSites.push(createdSite);
          }
        }
      }

      // Create contacts if provided
      let createdContacts: any[] = [];
      if (contacts && Array.isArray(contacts) && contacts.length > 0) {
        for (const contact of contacts) {
          const contactData = { ...contact, accountId: newAccount.id };
          const contactResult = insertCrmContactSchema.safeParse(contactData);
          if (contactResult.success) {
            const [createdContact] = await db.insert(crmContacts).values(contactResult.data).returning();
            createdContacts.push(createdContact);
          }
        }
      }

      // Create type-specific profile if provided
      let createdProfile: any = null;
      if (profile) {
        const profileData = { ...profile, accountId: newAccount.id };
        switch (newAccount.accountType) {
          case "RESIDENTIAL":
            const resResult = insertResidentialProfileSchema.safeParse(profileData);
            if (resResult.success) {
              const [p] = await db.insert(residentialProfiles).values(resResult.data).returning();
              createdProfile = p;
            }
            break;
          case "PROPERTY_MANAGER":
            const pmResult = insertPropertyManagerProfileSchema.safeParse(profileData);
            if (pmResult.success) {
              const [p] = await db.insert(propertyManagerProfiles).values(pmResult.data).returning();
              createdProfile = p;
            }
            break;
          case "COMMERCIAL":
            const commResult = insertCommercialProfileSchema.safeParse(profileData);
            if (commResult.success) {
              const [p] = await db.insert(commercialProfiles).values(commResult.data).returning();
              createdProfile = p;
            }
            break;
        }
      }

      // Log audit
      await logCrmAudit(
        user.id,
        "account.created",
        "account",
        newAccount.id,
        { displayName: newAccount.displayName, accountType: newAccount.accountType },
        req.ip
      );

      return res.status(201).json({
        account: newAccount,
        sites: createdSites,
        contacts: createdContacts,
        profile: createdProfile,
      });
    } catch (error) {
      console.error("Error creating account:", error);
      return res.status(500).json({ message: "Failed to create account" });
    }
  });

  // GET /api/crm/accounts/:id - Get single account with sites, contacts, and profile
  app.get("/api/crm/accounts/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.id;

      // Get account
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Get sites
      const sites = await db.select().from(crmSites).where(eq(crmSites.accountId, accountId)).orderBy(desc(crmSites.isPrimary), asc(crmSites.siteName));

      // Get contacts
      const contacts = await db.select().from(crmContacts).where(eq(crmContacts.accountId, accountId)).orderBy(desc(crmContacts.isPrimary), asc(crmContacts.firstName));

      // Get type-specific profile
      let profile: any = null;
      switch (account.accountType) {
        case "RESIDENTIAL":
          const [resProfile] = await db.select().from(residentialProfiles).where(eq(residentialProfiles.accountId, accountId));
          profile = resProfile || null;
          break;
        case "PROPERTY_MANAGER":
          const [pmProfile] = await db.select().from(propertyManagerProfiles).where(eq(propertyManagerProfiles.accountId, accountId));
          profile = pmProfile || null;
          break;
        case "COMMERCIAL":
          const [commProfile] = await db.select().from(commercialProfiles).where(eq(commercialProfiles.accountId, accountId));
          profile = commProfile || null;
          break;
      }

      // Validate account structure
      const validation = await validateAccountByType(accountId, account.accountType, profile);

      return res.json({
        account,
        sites,
        contacts,
        profile,
        validation,
      });
    } catch (error) {
      console.error("Error fetching account:", error);
      return res.status(500).json({ message: "Failed to fetch account" });
    }
  });

  // PUT /api/crm/accounts/:id - Update account
  app.put("/api/crm/accounts/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.id;
      const { account: accountData, profile: profileData } = req.body;

      // Verify account exists
      const [existingAccount] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!existingAccount) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Update account
      const [updatedAccount] = await db.update(crmAccounts)
        .set({ ...accountData, updatedAt: new Date() })
        .where(eq(crmAccounts.id, accountId))
        .returning();

      // Update or create profile if provided
      let updatedProfile: any = null;
      if (profileData) {
        const profileDataWithAccount = { ...profileData, accountId };

        switch (updatedAccount.accountType) {
          case "RESIDENTIAL":
            const [existingRes] = await db.select().from(residentialProfiles).where(eq(residentialProfiles.accountId, accountId));
            if (existingRes) {
              const [p] = await db.update(residentialProfiles)
                .set({ ...profileDataWithAccount, updatedAt: new Date() })
                .where(eq(residentialProfiles.accountId, accountId))
                .returning();
              updatedProfile = p;
            } else {
              const resResult = insertResidentialProfileSchema.safeParse(profileDataWithAccount);
              if (resResult.success) {
                const [p] = await db.insert(residentialProfiles).values(resResult.data).returning();
                updatedProfile = p;
              }
            }
            break;
          case "PROPERTY_MANAGER":
            const [existingPm] = await db.select().from(propertyManagerProfiles).where(eq(propertyManagerProfiles.accountId, accountId));
            if (existingPm) {
              const [p] = await db.update(propertyManagerProfiles)
                .set({ ...profileDataWithAccount, updatedAt: new Date() })
                .where(eq(propertyManagerProfiles.accountId, accountId))
                .returning();
              updatedProfile = p;
            } else {
              const pmResult = insertPropertyManagerProfileSchema.safeParse(profileDataWithAccount);
              if (pmResult.success) {
                const [p] = await db.insert(propertyManagerProfiles).values(pmResult.data).returning();
                updatedProfile = p;
              }
            }
            break;
          case "COMMERCIAL":
            const [existingComm] = await db.select().from(commercialProfiles).where(eq(commercialProfiles.accountId, accountId));
            if (existingComm) {
              const [p] = await db.update(commercialProfiles)
                .set({ ...profileDataWithAccount, updatedAt: new Date() })
                .where(eq(commercialProfiles.accountId, accountId))
                .returning();
              updatedProfile = p;
            } else {
              const commResult = insertCommercialProfileSchema.safeParse(profileDataWithAccount);
              if (commResult.success) {
                const [p] = await db.insert(commercialProfiles).values(commResult.data).returning();
                updatedProfile = p;
              }
            }
            break;
        }
      }

      // Log audit
      await logCrmAudit(
        user.id,
        "account.updated",
        "account",
        accountId,
        { displayName: updatedAccount.displayName, accountType: updatedAccount.accountType },
        req.ip
      );

      // Validate updated account
      const validation = await validateAccountByType(accountId, updatedAccount.accountType, updatedProfile);

      return res.json({
        account: updatedAccount,
        profile: updatedProfile,
        validation,
      });
    } catch (error) {
      console.error("Error updating account:", error);
      return res.status(500).json({ message: "Failed to update account" });
    }
  });

  // DELETE /api/crm/accounts/:id - Delete account
  app.delete("/api/crm/accounts/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.id;

      // Verify account exists
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Delete account (cascade will delete sites, contacts, profiles)
      await db.delete(crmAccounts).where(eq(crmAccounts.id, accountId));

      // Log audit
      await logCrmAudit(
        user.id,
        "account.deleted",
        "account",
        accountId,
        { displayName: account.displayName, accountType: account.accountType },
        req.ip
      );

      return res.json({ message: "Account deleted successfully" });
    } catch (error) {
      console.error("Error deleting account:", error);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // ============================================
  // CRM SITES API ENDPOINTS
  // ============================================

  // GET /api/crm/accounts/:accountId/sites - List sites for account
  app.get("/api/crm/accounts/:accountId/sites", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.accountId;

      // Verify account exists
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const sites = await db.select().from(crmSites)
        .where(eq(crmSites.accountId, accountId))
        .orderBy(desc(crmSites.isPrimary), asc(crmSites.siteName));

      return res.json(sites);
    } catch (error) {
      console.error("Error fetching sites:", error);
      return res.status(500).json({ message: "Failed to fetch sites" });
    }
  });

  // POST /api/crm/accounts/:accountId/sites - Create site
  app.post("/api/crm/accounts/:accountId/sites", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.accountId;

      // Verify account exists
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const siteData = { ...req.body, accountId };
      const siteResult = insertCrmSiteSchema.safeParse(siteData);
      if (!siteResult.success) {
        return res.status(400).json({
          message: "Invalid site data",
          errors: siteResult.error.flatten(),
        });
      }

      // If this site is set as primary, unset other primary sites
      if (siteResult.data.isPrimary) {
        await db.update(crmSites)
          .set({ isPrimary: false })
          .where(eq(crmSites.accountId, accountId));
      }

      const [site] = await db.insert(crmSites).values(siteResult.data).returning();

      // Log audit
      await logCrmAudit(
        user.id,
        "site.created",
        "site",
        site.id,
        { accountId, address: `${site.address1}, ${site.city}, ${site.state}` },
        req.ip
      );

      return res.status(201).json(site);
    } catch (error) {
      console.error("Error creating site:", error);
      return res.status(500).json({ message: "Failed to create site" });
    }
  });

  // PUT /api/crm/accounts/:accountId/sites/:siteId - Update site
  app.put("/api/crm/accounts/:accountId/sites/:siteId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { accountId, siteId } = req.params;

      // Verify site exists and belongs to account
      const [existingSite] = await db.select().from(crmSites)
        .where(and(eq(crmSites.id, siteId), eq(crmSites.accountId, accountId)));
      if (!existingSite) {
        return res.status(404).json({ message: "Site not found" });
      }

      // If setting as primary, unset other primary sites
      if (req.body.isPrimary) {
        await db.update(crmSites)
          .set({ isPrimary: false })
          .where(and(eq(crmSites.accountId, accountId), sql`id != ${siteId}`));
      }

      const [updatedSite] = await db.update(crmSites)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(crmSites.id, siteId))
        .returning();

      // Log audit
      await logCrmAudit(
        user.id,
        "site.updated",
        "site",
        siteId,
        { accountId, address: `${updatedSite.address1}, ${updatedSite.city}, ${updatedSite.state}` },
        req.ip
      );

      return res.json(updatedSite);
    } catch (error) {
      console.error("Error updating site:", error);
      return res.status(500).json({ message: "Failed to update site" });
    }
  });

  // DELETE /api/crm/accounts/:accountId/sites/:siteId - Delete site
  app.delete("/api/crm/accounts/:accountId/sites/:siteId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { accountId, siteId } = req.params;

      // Verify site exists and belongs to account
      const [site] = await db.select().from(crmSites)
        .where(and(eq(crmSites.id, siteId), eq(crmSites.accountId, accountId)));
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }

      await db.delete(crmSites).where(eq(crmSites.id, siteId));

      // Log audit
      await logCrmAudit(
        user.id,
        "site.deleted",
        "site",
        siteId,
        { accountId, address: `${site.address1}, ${site.city}, ${site.state}` },
        req.ip
      );

      return res.json({ message: "Site deleted successfully" });
    } catch (error) {
      console.error("Error deleting site:", error);
      return res.status(500).json({ message: "Failed to delete site" });
    }
  });

  // ============================================
  // CRM CONTACTS API ENDPOINTS
  // ============================================

  // GET /api/crm/accounts/:accountId/contacts - List contacts for account
  app.get("/api/crm/accounts/:accountId/contacts", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.accountId;

      // Verify account exists
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const contacts = await db.select().from(crmContacts)
        .where(eq(crmContacts.accountId, accountId))
        .orderBy(desc(crmContacts.isPrimary), asc(crmContacts.firstName));

      return res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      return res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  // POST /api/crm/accounts/:accountId/contacts - Create contact
  app.post("/api/crm/accounts/:accountId/contacts", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.accountId;

      // Verify account exists
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const contactData = { ...req.body, accountId };
      const contactResult = insertCrmContactSchema.safeParse(contactData);
      if (!contactResult.success) {
        return res.status(400).json({
          message: "Invalid contact data",
          errors: contactResult.error.flatten(),
        });
      }

      // If this contact is set as primary, unset other primary contacts
      if (contactResult.data.isPrimary) {
        await db.update(crmContacts)
          .set({ isPrimary: false })
          .where(eq(crmContacts.accountId, accountId));
      }

      const [contact] = await db.insert(crmContacts).values(contactResult.data).returning();

      // Log audit
      await logCrmAudit(
        user.id,
        "contact.created",
        "contact",
        contact.id,
        { accountId, name: `${contact.firstName} ${contact.lastName || ""}`.trim(), role: contact.contactRole },
        req.ip
      );

      return res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      return res.status(500).json({ message: "Failed to create contact" });
    }
  });

  // PUT /api/crm/accounts/:accountId/contacts/:contactId - Update contact
  app.put("/api/crm/accounts/:accountId/contacts/:contactId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { accountId, contactId } = req.params;

      // Verify contact exists and belongs to account
      const [existingContact] = await db.select().from(crmContacts)
        .where(and(eq(crmContacts.id, contactId), eq(crmContacts.accountId, accountId)));
      if (!existingContact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      // If setting as primary, unset other primary contacts
      if (req.body.isPrimary) {
        await db.update(crmContacts)
          .set({ isPrimary: false })
          .where(and(eq(crmContacts.accountId, accountId), sql`id != ${contactId}`));
      }

      const [updatedContact] = await db.update(crmContacts)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(crmContacts.id, contactId))
        .returning();

      // Log audit
      await logCrmAudit(
        user.id,
        "contact.updated",
        "contact",
        contactId,
        { accountId, name: `${updatedContact.firstName} ${updatedContact.lastName || ""}`.trim(), role: updatedContact.contactRole },
        req.ip
      );

      return res.json(updatedContact);
    } catch (error) {
      console.error("Error updating contact:", error);
      return res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // DELETE /api/crm/accounts/:accountId/contacts/:contactId - Delete contact
  app.delete("/api/crm/accounts/:accountId/contacts/:contactId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { accountId, contactId } = req.params;

      // Verify contact exists and belongs to account
      const [contact] = await db.select().from(crmContacts)
        .where(and(eq(crmContacts.id, contactId), eq(crmContacts.accountId, accountId)));
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }

      await db.delete(crmContacts).where(eq(crmContacts.id, contactId));

      // Log audit
      await logCrmAudit(
        user.id,
        "contact.deleted",
        "contact",
        contactId,
        { accountId, name: `${contact.firstName} ${contact.lastName || ""}`.trim(), role: contact.contactRole },
        req.ip
      );

      return res.json({ message: "Contact deleted successfully" });
    } catch (error) {
      console.error("Error deleting contact:", error);
      return res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // POST /api/crm/accounts/:id/validate - Validate account structure by type
  app.post("/api/crm/accounts/:id/validate", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = req.params.id;

      // Get account
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, accountId));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Get profile for commercial accounts
      let profile: any = null;
      if (account.accountType === "COMMERCIAL") {
        const [commProfile] = await db.select().from(commercialProfiles).where(eq(commercialProfiles.accountId, accountId));
        profile = commProfile;
      }

      const validation = await validateAccountByType(accountId, account.accountType, profile);

      return res.json(validation);
    } catch (error) {
      console.error("Error validating account:", error);
      return res.status(500).json({ message: "Failed to validate account" });
    }
  });

  // ============================================
  // WEATHER API ENDPOINTS
  // ============================================

  // GET /api/weather - returns cached weather data
  app.get("/api/weather", async (req, res) => {
    try {
      const cache = await getWeatherData();
      if (!cache) {
        return res.status(404).json({ message: "No weather data cached yet" });
      }
      return res.json(cache);
    } catch (error) {
      console.error("Error fetching weather cache:", error);
      return res.status(500).json({ message: "Failed to fetch weather data" });
    }
  });

  // GET /api/phone/weather-impact - returns weather impact data
  app.get("/api/phone/weather-impact", async (req, res) => {
    try {
      const range = (req.query.range as string) || "month";
      let days = 30;
      if (range === "week") days = 7;
      else if (range === "month") days = 30;
      else if (range === "6month") days = 182;
      else if (range === "year") days = 365;

      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const data = await storage.getWeatherImpactData(startDate, endDate);
      return res.json({ data, updatedAt: new Date().toISOString() });
    } catch (error) {
      console.error("Error fetching weather impact data:", error);
      return res.status(500).json({ message: "Failed to fetch weather impact data" });
    }
  });

  // POST /api/weather/refresh - triggers manual refresh (admin only)
  app.post("/api/weather/refresh", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const adminApiKey = process.env.ADMIN_API_KEY;

      if (!adminApiKey || token !== adminApiKey) {
        return res.status(401).json({ message: "Unauthorized - Admin API key required" });
      }

      const result = await refreshWeather();
      if (result.success) {
        return res.json({ message: "Weather data refreshed successfully" });
      } else {
        return res.status(500).json({ message: "Failed to refresh weather", error: result.error });
      }
    } catch (error) {
      console.error("Error refreshing weather:", error);
      return res.status(500).json({ message: "Failed to refresh weather data" });
    }
  });

  // =============================================
  // ACCOUNT MIGRATION ENDPOINTS
  // =============================================

  // POST /api/crm/accounts/migrate-from-customers - Migrate existing crmCustomers to new Account model
  app.post("/api/crm/accounts/migrate-from-customers", requireCrmAdmin, async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      const results = {
        accountsCreated: 0,
        sitesCreated: 0,
        contactsCreated: 0,
        errors: [] as string[],
        migrated: [] as { customerId: string; customerName: string; accountId: string }[],
      };

      // Get all existing customers with their properties
      const allCustomers = await db.select().from(crmCustomers);
      const allProperties = await db.select().from(crmProperties);

      for (const customer of allCustomers) {
        try {
          // Map customerType to AccountType
          let accountType: AccountType = "RESIDENTIAL";
          if (customer.customerType === "commercial") {
            accountType = "COMMERCIAL";
          } else if (customer.customerType === "property_manager") {
            accountType = "PROPERTY_MANAGER";
          }

          // Map customerStatus to AccountStatus
          let accountStatus: AccountStatus = "PROSPECT";
          if (customer.customerStatus === "client") {
            accountStatus = "ACTIVE";
          }

          // Create the Account
          const [account] = await db.insert(crmAccounts).values({
            displayName: customer.name,
            companyName: customer.companyName,
            accountType,
            accountStatus,
            tags: customer.tags || [],
            sourceSystem: customer.sourceSystem || "migration",
            sourceId: customer.id,
          }).returning();
          results.accountsCreated++;

          // Get properties for this customer
          const customerProperties = allProperties.filter(p => p.customerId === customer.id);

          if (customerProperties.length > 0) {
            // Create a site for each property
            for (let i = 0; i < customerProperties.length; i++) {
              const prop = customerProperties[i];
              await db.insert(crmSites).values({
                accountId: account.id,
                siteName: prop.notes || `Site ${i + 1}`,
                address1: prop.address1,
                address2: prop.address2,
                city: prop.city,
                state: prop.state,
                zip: prop.zip,
                isPrimary: i === 0,
                notes: prop.notes,
              });
              results.sitesCreated++;
            }
          } else {
            // Create a placeholder site
            await db.insert(crmSites).values({
              accountId: account.id,
              siteName: "Primary Site",
              address1: "Address pending",
              city: "Unknown",
              state: "GA",
              zip: "00000",
              isPrimary: true,
            });
            results.sitesCreated++;
          }

          // Create contact from customer's phone/email
          if (customer.phone || customer.email) {
            const nameParts = customer.name.split(" ");
            const firstName = nameParts[0] || customer.name;
            const lastName = nameParts.slice(1).join(" ") || undefined;

            await db.insert(crmContacts).values({
              accountId: account.id,
              firstName,
              lastName,
              phone: customer.phone,
              email: customer.email,
              contactRole: "PRIMARY",
              isPrimary: true,
            });
            results.contactsCreated++;
          }

          results.migrated.push({
            customerId: customer.id,
            customerName: customer.name,
            accountId: account.id,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          results.errors.push(`Failed to migrate customer ${customer.name} (${customer.id}): ${errorMsg}`);
        }
      }

      await logCrmAudit(
        currentUser?.id || null,
        "accounts.migrated_from_customers",
        "system",
        null,
        { 
          accountsCreated: results.accountsCreated, 
          sitesCreated: results.sitesCreated, 
          contactsCreated: results.contactsCreated,
          errors: results.errors.length,
        },
        req.ip
      );

      return res.json({
        success: true,
        message: `Migration complete: ${results.accountsCreated} accounts, ${results.sitesCreated} sites, ${results.contactsCreated} contacts created`,
        ...results,
      });
    } catch (error) {
      console.error("Error migrating customers to accounts:", error);
      return res.status(500).json({ message: "Failed to migrate customers", error: String(error) });
    }
  });

  // POST /api/crm/accounts/import-csv - Import accounts from CSV file
  app.post("/api/crm/accounts/import-csv", requireCrmAdmin, upload.single("file"), async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No CSV file uploaded" });
      }

      const results = {
        accountsCreated: 0,
        sitesCreated: 0,
        contactsCreated: 0,
        skipped: 0,
        errors: [] as string[],
        imported: [] as { displayName: string; accountId: string }[],
      };

      const csvContent = file.buffer.toString("utf-8");
      const lines = csvContent.split("\n").filter(line => line.trim());
      
      // Skip header row
      const dataLines = lines.slice(1);

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        try {
          const columns = parseCSVLine(line);
          const [displayName, customerType, fullAddress, phone, email, leadSource] = columns;

          if (!displayName || displayName.trim() === "") {
            results.skipped++;
            continue;
          }

          const cleanDisplayName = displayName.replace(/^"|"$/g, "").trim();
          
          // Determine account type: COMMERCIAL if company-like name
          const isCommercial = customerType?.toLowerCase().includes("commercial") ||
            /\b(llc|inc|corp|company|co\.|ltd|properties|management|enterprises|services|construction|restaurant|church|school|bank|hospital|medical|clinic|hotel|motel|inn|apt|apartments)\b/i.test(cleanDisplayName);
          
          const accountType: AccountType = isCommercial ? "COMMERCIAL" : "RESIDENTIAL";

          // Map lead source
          let mappedLeadSource: string | undefined;
          if (leadSource) {
            const ls = leadSource.toLowerCase();
            if (ls.includes("referral")) mappedLeadSource = "REFERRAL";
            else if (ls.includes("google")) mappedLeadSource = "GOOGLE";
            else if (ls.includes("facebook")) mappedLeadSource = "FACEBOOK";
            else if (ls.includes("yelp")) mappedLeadSource = "YELP";
            else if (ls.includes("home advisor")) mappedLeadSource = "HOME_ADVISOR";
            else if (ls.includes("angi")) mappedLeadSource = "ANGI";
            else if (ls.includes("thumbtack")) mappedLeadSource = "THUMBTACK";
            else if (ls.includes("website")) mappedLeadSource = "WEBSITE";
            else if (ls.includes("phone") || ls.includes("call")) mappedLeadSource = "PHONE";
            else if (ls.includes("repeat") || ls.includes("existing")) mappedLeadSource = "REPEAT_CUSTOMER";
            else if (ls.includes("fieldedge")) mappedLeadSource = "FIELDEDGE";
            else mappedLeadSource = "OTHER";
          }

          // Create account
          const [account] = await db.insert(crmAccounts).values({
            displayName: cleanDisplayName,
            accountType,
            accountStatus: "ACTIVE",
            leadSource: mappedLeadSource as any,
            sourceSystem: "csv_import",
          }).returning();
          results.accountsCreated++;

          // Parse address: "Address - City State Zip"
          let address1 = "Address pending";
          let city = "Unknown";
          let state = "GA";
          let zip = "00000";

          if (fullAddress && fullAddress.trim() !== "" && fullAddress !== "-") {
            const addressParts = fullAddress.split(" - ");
            if (addressParts.length >= 2) {
              address1 = addressParts[0].trim();
              const cityStateZip = addressParts[1].trim();
              // Parse "City State Zip" - e.g., "Grovetown GA 30813"
              const cszMatch = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
              if (cszMatch) {
                city = cszMatch[1].trim();
                state = cszMatch[2].toUpperCase();
                zip = cszMatch[3];
              } else {
                // Try without zip
                const csMatch = cityStateZip.match(/^(.+?)\s+([A-Z]{2})$/i);
                if (csMatch) {
                  city = csMatch[1].trim();
                  state = csMatch[2].toUpperCase();
                }
              }
            } else if (addressParts.length === 1 && addressParts[0].trim() !== "") {
              address1 = addressParts[0].trim();
            }
          }

          // Create site
          await db.insert(crmSites).values({
            accountId: account.id,
            siteName: "Primary Site",
            address1,
            city,
            state,
            zip,
            isPrimary: true,
          });
          results.sitesCreated++;

          // Create contact if phone or email exists
          if ((phone && phone.trim() !== "") || (email && email.trim() !== "")) {
            const nameParts = cleanDisplayName.replace(/^"|"$/g, "").split(/[,\s]+/).filter(p => p);
            let firstName = nameParts[0] || cleanDisplayName;
            let lastName: string | undefined;
            
            // Handle "Last, First" format
            if (cleanDisplayName.includes(",")) {
              const commaParts = cleanDisplayName.split(",").map(p => p.trim());
              if (commaParts.length >= 2) {
                lastName = commaParts[0];
                firstName = commaParts[1];
              }
            } else if (nameParts.length > 1) {
              lastName = nameParts.slice(1).join(" ");
            }

            await db.insert(crmContacts).values({
              accountId: account.id,
              firstName,
              lastName,
              phone: phone?.trim() || undefined,
              email: email?.trim() || undefined,
              contactRole: "PRIMARY",
              isPrimary: true,
            });
            results.contactsCreated++;
          }

          results.imported.push({
            displayName: cleanDisplayName,
            accountId: account.id,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          results.errors.push(`Row ${i + 2}: ${errorMsg}`);
        }
      }

      await logCrmAudit(
        currentUser?.id || null,
        "accounts.imported_from_csv",
        "system",
        null,
        { 
          accountsCreated: results.accountsCreated, 
          sitesCreated: results.sitesCreated, 
          contactsCreated: results.contactsCreated,
          skipped: results.skipped,
          errors: results.errors.length,
        },
        req.ip
      );

      return res.json({
        success: true,
        message: `Import complete: ${results.accountsCreated} accounts, ${results.sitesCreated} sites, ${results.contactsCreated} contacts created (${results.skipped} skipped)`,
        ...results,
      });
    } catch (error) {
      console.error("Error importing CSV:", error);
      return res.status(500).json({ message: "Failed to import CSV", error: String(error) });
    }
  });

  // GET /api/crm/accounts - List accounts with search and pagination
  app.get("/api/crm/accounts", requireCrmAuth, async (req, res) => {
    try {
      const { search, accountType, accountStatus, page = "1", limit = "50" } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = Math.min(parseInt(limit as string), 100);
      const offset = (pageNum - 1) * limitNum;

      let query = db.select().from(crmAccounts);
      const conditions = [];

      if (search) {
        conditions.push(
          or(
            ilike(crmAccounts.displayName, `%${search}%`),
            ilike(crmAccounts.companyName, `%${search}%`)
          )
        );
      }
      if (accountType) {
        conditions.push(eq(crmAccounts.accountType, accountType as AccountType));
      }
      if (accountStatus) {
        conditions.push(eq(crmAccounts.accountStatus, accountStatus as AccountStatus));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const accounts = await query.limit(limitNum).offset(offset).orderBy(desc(crmAccounts.createdAt));
      
      // Get total count
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(crmAccounts);
      const total = Number(countResult[0]?.count || 0);

      return res.json({
        accounts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching accounts:", error);
      return res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // GET /api/crm/accounts/:id - Get account with sites and contacts
  app.get("/api/crm/accounts/:id", requireCrmAuth, async (req, res) => {
    try {
      const [account] = await db.select().from(crmAccounts).where(eq(crmAccounts.id, req.params.id));
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      const sites = await db.select().from(crmSites).where(eq(crmSites.accountId, account.id));
      const contacts = await db.select().from(crmContacts).where(eq(crmContacts.accountId, account.id));

      // Get profile based on account type
      let profile = null;
      if (account.accountType === "RESIDENTIAL") {
        const [rp] = await db.select().from(residentialProfiles).where(eq(residentialProfiles.accountId, account.id));
        profile = rp;
      } else if (account.accountType === "PROPERTY_MANAGER") {
        const [pmp] = await db.select().from(propertyManagerProfiles).where(eq(propertyManagerProfiles.accountId, account.id));
        profile = pmp;
      } else if (account.accountType === "COMMERCIAL") {
        const [cp] = await db.select().from(commercialProfiles).where(eq(commercialProfiles.accountId, account.id));
        profile = cp;
      }

      return res.json({
        ...account,
        sites,
        contacts,
        profile,
      });
    } catch (error) {
      console.error("Error fetching account:", error);
      return res.status(500).json({ message: "Failed to fetch account" });
    }
  });

  // ============================================
  // CRM WORK ORDER ROUTES
  // ============================================

  // GET /api/crm/work-orders - List work orders with optional filters
  app.get("/api/crm/work-orders", requireCrmAuth, async (req, res) => {
    try {
      const { jobId, techId, date, status } = req.query;

      let workOrders: CrmWorkOrder[] = [];

      if (jobId) {
        workOrders = await storage.getWorkOrdersByJobId(jobId as string);
      } else if (techId && date) {
        const dateObj = new Date(date as string);
        workOrders = await storage.getWorkOrdersByTechId(techId as string, dateObj);
      } else if (techId) {
        workOrders = await storage.getWorkOrdersByTechId(techId as string);
      } else if (date) {
        const dateObj = new Date(date as string);
        const startOfDay = new Date(dateObj);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(dateObj);
        endOfDay.setHours(23, 59, 59, 999);
        workOrders = await storage.getWorkOrdersByDateRange(startOfDay, endOfDay);
      } else {
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(today);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);
        workOrders = await storage.getWorkOrdersByDateRange(startOfDay, endOfMonth);
      }

      if (status) {
        workOrders = workOrders.filter(wo => wo.status === status);
      }

      return res.json(workOrders);
    } catch (error) {
      console.error("Error fetching work orders:", error);
      return res.status(500).json({ message: "Failed to fetch work orders" });
    }
  });

  // GET /api/crm/work-orders/list - List enriched work orders with date range and filters
  app.get("/api/crm/work-orders/list", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const { dateFrom, dateTo, techId, status } = req.query;

      let startDate: Date;
      let endDate: Date;

      if (dateFrom) {
        startDate = new Date(dateFrom as string);
      } else {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      }

      if (dateTo) {
        endDate = new Date(dateTo as string);
      } else {
        endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setHours(23, 59, 59, 999);
      }

      let workOrders = await storage.getWorkOrdersByDateRange(startDate, endDate);

      if (techId) {
        workOrders = workOrders.filter(wo => wo.assignedTechId === techId);
      }

      if (status) {
        workOrders = workOrders.filter(wo => wo.status === status);
      }

      const enrichedWorkOrders = await Promise.all(
        workOrders.map(async (wo) => {
          const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, wo.jobId));

          let customer = null;
          if (job?.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, job.customerId));
            customer = cust || null;
          }

          let tech = null;
          if (wo.assignedTechId) {
            const [t] = await db.select().from(crmUsers).where(eq(crmUsers.id, wo.assignedTechId));
            tech = t || null;
          }

          return {
            ...wo,
            job: job || null,
            customer,
            tech,
          };
        })
      );

      return res.json(enrichedWorkOrders);
    } catch (error) {
      console.error("Error fetching work orders list:", error);
      return res.status(500).json({ message: "Failed to fetch work orders list" });
    }
  });

  // GET /api/crm/work-orders/:id - Get single work order with job details
  app.get("/api/crm/work-orders/:id", requireCrmAuth, async (req, res) => {
    try {
      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, workOrder.jobId));
      let customer = null;
      if (job?.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, job.customerId));
        customer = cust || null;
      }

      let tech = null;
      if (workOrder.assignedTechId) {
        const [t] = await db.select().from(crmUsers).where(eq(crmUsers.id, workOrder.assignedTechId));
        tech = t || null;
      }

      return res.json({
        ...workOrder,
        job: job || null,
        customer,
        tech,
      });
    } catch (error) {
      console.error("Error fetching work order:", error);
      return res.status(500).json({ message: "Failed to fetch work order" });
    }
  });

  // POST /api/crm/work-orders - Create work order
  app.post("/api/crm/work-orders", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Convert date strings to Date objects before validation
      const bodyWithDates = {
        ...req.body,
        scheduledStart: req.body.scheduledStart ? new Date(req.body.scheduledStart) : undefined,
        scheduledEnd: req.body.scheduledEnd ? new Date(req.body.scheduledEnd) : undefined,
        startedAt: req.body.startedAt ? new Date(req.body.startedAt) : undefined,
        completedAt: req.body.completedAt ? new Date(req.body.completedAt) : undefined,
      };

      const result = insertCrmWorkOrderSchema.safeParse(bodyWithDates);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid work order data", errors: result.error.flatten() });
      }

      const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, result.data.jobId));
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const existingWorkOrders = await storage.getWorkOrdersByJobId(result.data.jobId);
      const workOrderNumber = existingWorkOrders.length + 1;

      const workOrder = await storage.createWorkOrder({
        ...result.data,
        workOrderNumber,
      });

      await logCrmAudit(
        user.id,
        "work_order.created",
        "work_order",
        workOrder.id,
        { jobId: workOrder.jobId, workOrderNumber },
        req.ip
      );

      return res.status(201).json(workOrder);
    } catch (error) {
      console.error("Error creating work order:", error);
      return res.status(500).json({ message: "Failed to create work order" });
    }
  });

  // PATCH /api/crm/work-orders/:id - Update work order
  app.patch("/api/crm/work-orders/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existingWorkOrder = await storage.getWorkOrder(req.params.id);
      if (!existingWorkOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      const allowedFields = insertCrmWorkOrderSchema.partial().pick({
        status: true,
        assignedTechId: true,
        scheduledStart: true,
        scheduledEnd: true,
        checklist: true,
        partsUsed: true,
        techNotes: true,
        startedAt: true,
        completedAt: true,
      });

      const result = allowedFields.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: result.error.flatten().fieldErrors 
        });
      }

      const { status, assignedTechId, scheduledStart, scheduledEnd, techNotes, checklist, partsUsed, startedAt, completedAt } = result.data;

      const updateData: Partial<InsertCrmWorkOrder> = {};
      if (status !== undefined) updateData.status = status;
      if (assignedTechId !== undefined) updateData.assignedTechId = assignedTechId;
      if (scheduledStart !== undefined) updateData.scheduledStart = scheduledStart ? new Date(scheduledStart) : null;
      if (scheduledEnd !== undefined) updateData.scheduledEnd = scheduledEnd ? new Date(scheduledEnd) : null;
      if (techNotes !== undefined) updateData.techNotes = techNotes;
      if (checklist !== undefined) updateData.checklist = checklist;
      if (partsUsed !== undefined) updateData.partsUsed = partsUsed;
      if (startedAt !== undefined) updateData.startedAt = startedAt ? new Date(startedAt) : null;
      if (completedAt !== undefined) updateData.completedAt = completedAt ? new Date(completedAt) : null;

      const workOrder = await storage.updateWorkOrder(req.params.id, updateData);

      await logCrmAudit(
        user.id,
        "work_order.updated",
        "work_order",
        req.params.id,
        { updates: Object.keys(updateData) },
        req.ip
      );

      return res.json(workOrder);
    } catch (error) {
      console.error("Error updating work order:", error);
      return res.status(500).json({ message: "Failed to update work order" });
    }
  });

  // DELETE /api/crm/work-orders/:id - Delete work order
  app.delete("/api/crm/work-orders/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existingWorkOrder = await storage.getWorkOrder(req.params.id);
      if (!existingWorkOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      const deleted = await storage.deleteWorkOrder(req.params.id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete work order" });
      }

      await logCrmAudit(
        user.id,
        "work_order.deleted",
        "work_order",
        req.params.id,
        { jobId: existingWorkOrder.jobId },
        req.ip
      );

      return res.json({ message: "Work order deleted successfully" });
    } catch (error) {
      console.error("Error deleting work order:", error);
      return res.status(500).json({ message: "Failed to delete work order" });
    }
  });

  // GET /api/crm/dispatch/work-orders - Get work orders for dispatch board
  app.get("/api/crm/dispatch/work-orders", requireCrmAuth, async (req, res) => {
    try {
      const dateParam = req.query.date as string;
      const date = dateParam ? new Date(dateParam) : new Date();

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const workOrders = await storage.getWorkOrdersByDateRange(startOfDay, endOfDay);

      const enrichedWorkOrders = await Promise.all(
        workOrders.map(async (wo) => {
          const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, wo.jobId));

          let customer = null;
          if (job?.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, job.customerId));
            customer = cust || null;
          }

          let tech = null;
          if (wo.assignedTechId) {
            const [t] = await db.select().from(crmUsers).where(eq(crmUsers.id, wo.assignedTechId));
            tech = t || null;
          }

          return {
            ...wo,
            job: job || null,
            customer,
            tech,
          };
        })
      );

      return res.json(enrichedWorkOrders);
    } catch (error) {
      console.error("Error fetching dispatch work orders:", error);
      return res.status(500).json({ message: "Failed to fetch dispatch work orders" });
    }
  });

  // ============================================
  // CRM AGREEMENTS ROUTES
  // ============================================

  // GET /api/crm/agreements - List all agreements with search/filter
  app.get("/api/crm/agreements", requireCrmAuth, async (req, res) => {
    try {
      const { search, status, page = "1", limit = "25" } = req.query;
      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = parseInt(limit as string, 10) || 25;
      const offset = (pageNum - 1) * limitNum;

      let query = db.select().from(crmAgreements);
      let countQuery = db.select({ count: count() }).from(crmAgreements);

      const conditions = [];

      if (status && status !== "all") {
        conditions.push(eq(crmAgreements.status, status as string));
      }

      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            ilike(crmAgreements.customerName, searchTerm),
            ilike(crmAgreements.agreementNumber, searchTerm),
            ilike(crmAgreements.address, searchTerm)
          )
        );
      }

      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        query = query.where(whereClause!) as typeof query;
        countQuery = countQuery.where(whereClause!) as typeof countQuery;
      }

      const [totalResult] = await countQuery;
      const total = totalResult?.count || 0;

      const agreements = await query
        .orderBy(desc(crmAgreements.createdAt))
        .limit(limitNum)
        .offset(offset);

      return res.json({
        agreements,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(Number(total) / limitNum),
          hasNextPage: pageNum * limitNum < Number(total),
          hasPrevPage: pageNum > 1,
        },
      });
    } catch (error) {
      console.error("Error fetching agreements:", error);
      return res.status(500).json({ message: "Failed to fetch agreements" });
    }
  });

  // GET /api/crm/agreements/:id - Get single agreement
  app.get("/api/crm/agreements/:id", requireCrmAuth, async (req, res) => {
    try {
      const [agreement] = await db
        .select()
        .from(crmAgreements)
        .where(eq(crmAgreements.id, req.params.id));

      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      let customer = null;
      if (agreement.customerId) {
        const [cust] = await db
          .select()
          .from(crmCustomers)
          .where(eq(crmCustomers.id, agreement.customerId));
        customer = cust || null;
      }

      return res.json({ ...agreement, customer });
    } catch (error) {
      console.error("Error fetching agreement:", error);
      return res.status(500).json({ message: "Failed to fetch agreement" });
    }
  });

  // POST /api/crm/agreements - Create agreement
  app.post("/api/crm/agreements", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Convert empty strings to undefined for optional date fields (drizzle-zod expects undefined, not null)
      const normalizedBody = { ...req.body };
      if (!normalizedBody.nextServiceDate) delete normalizedBody.nextServiceDate;
      if (!normalizedBody.nextInvoiceDate) delete normalizedBody.nextInvoiceDate;
      if (!normalizedBody.startDate) delete normalizedBody.startDate;
      if (!normalizedBody.endDate) delete normalizedBody.endDate;

      const result = insertCrmAgreementSchema.safeParse(normalizedBody);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid agreement data", 
          errors: result.error.flatten() 
        });
      }

      const [agreement] = await db
        .insert(crmAgreements)
        .values(result.data)
        .returning();

      await logCrmAudit(
        user.id,
        "agreement.created",
        "agreement",
        agreement.id,
        { agreementNumber: agreement.agreementNumber },
        req.ip
      );

      return res.status(201).json(agreement);
    } catch (error) {
      console.error("Error creating agreement:", error);
      return res.status(500).json({ message: "Failed to create agreement" });
    }
  });

  // PATCH /api/crm/agreements/:id - Update agreement
  app.patch("/api/crm/agreements/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db
        .select()
        .from(crmAgreements)
        .where(eq(crmAgreements.id, req.params.id));

      if (!existing) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      // Convert empty strings to undefined for optional date fields (drizzle-zod expects undefined, not null)
      const normalizedBody = { ...req.body };
      if (normalizedBody.nextServiceDate === "") delete normalizedBody.nextServiceDate;
      if (normalizedBody.nextInvoiceDate === "") delete normalizedBody.nextInvoiceDate;
      if (normalizedBody.startDate === "") delete normalizedBody.startDate;
      if (normalizedBody.endDate === "") delete normalizedBody.endDate;

      const allowedFields = insertCrmAgreementSchema.partial();
      const result = allowedFields.safeParse(normalizedBody);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: result.error.flatten().fieldErrors 
        });
      }

      const [updated] = await db
        .update(crmAgreements)
        .set({ ...result.data, updatedAt: new Date() })
        .where(eq(crmAgreements.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "agreement.updated",
        "agreement",
        req.params.id,
        { updates: Object.keys(result.data) },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error updating agreement:", error);
      return res.status(500).json({ message: "Failed to update agreement" });
    }
  });

  // DELETE /api/crm/agreements/:id - Delete agreement
  app.delete("/api/crm/agreements/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db
        .select()
        .from(crmAgreements)
        .where(eq(crmAgreements.id, req.params.id));

      if (!existing) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      await db.delete(crmAgreements).where(eq(crmAgreements.id, req.params.id));

      await logCrmAudit(
        user.id,
        "agreement.deleted",
        "agreement",
        req.params.id,
        { agreementNumber: existing.agreementNumber },
        req.ip
      );

      return res.json({ message: "Agreement deleted successfully" });
    } catch (error) {
      console.error("Error deleting agreement:", error);
      return res.status(500).json({ message: "Failed to delete agreement" });
    }
  });

  // POST /api/crm/agreements/import - Import agreements from CSV
  app.post("/api/crm/agreements/import", requireCrmSalesOrAbove, upload.single("file"), async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString("utf-8");
      const lines = csvContent.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file is empty or has no data rows" });
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
      const imported: CrmAgreement[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(",").map((v) => v.trim().replace(/['"]/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || "";
          });

          const agreementData: InsertCrmAgreement = {
            agreementNumber: row["agreement number"] || row["agreementnumber"] || row["agreement_number"] || `AGR-${Date.now()}-${i}`,
            customerName: row["customer name"] || row["customername"] || row["customer_name"] || row["customer"] || "Unknown",
            agreementPlan: row["agreement plan"] || row["agreementplan"] || row["agreement_plan"] || row["plan"] || "Standard",
            address: row["address"] || row["service address"] || row["serviceaddress"] || null,
            nextServiceDate: row["next service date"] || row["nextservicedate"] || row["next_service_date"] || null,
            nextInvoiceDate: row["next invoice date"] || row["nextinvoicedate"] || row["next_invoice_date"] || null,
            status: (row["status"] as any) || "active",
            isActive: row["is active"]?.toLowerCase() !== "false" && row["isactive"]?.toLowerCase() !== "false",
            notes: row["notes"] || null,
            startDate: row["start date"] || row["startdate"] || row["start_date"] || null,
            endDate: row["end date"] || row["enddate"] || row["end_date"] || null,
          };

          const [agreement] = await db.insert(crmAgreements).values(agreementData).returning();
          imported.push(agreement);
        } catch (rowError: any) {
          errors.push(`Row ${i + 1}: ${rowError.message}`);
        }
      }

      await logCrmAudit(
        user.id,
        "agreement.import",
        "agreement",
        null,
        { importedCount: imported.length, errorCount: errors.length },
        req.ip
      );

      return res.json({
        message: `Imported ${imported.length} agreements`,
        imported: imported.length,
        errors,
      });
    } catch (error) {
      console.error("Error importing agreements:", error);
      return res.status(500).json({ message: "Failed to import agreements" });
    }
  });

  // ============================================
  // CRM INVOICE ROUTES
  // ============================================

  // GET /api/crm/invoices - List invoices with filters
  app.get("/api/crm/invoices", requireCrmAuth, async (req, res) => {
    try {
      const { jobId, customerId, status, workOrderId } = req.query;
      
      const filters: { jobId?: string; customerId?: string; status?: string; workOrderId?: string } = {};
      if (jobId) filters.jobId = jobId as string;
      if (customerId) filters.customerId = customerId as string;
      if (status) filters.status = status as string;
      if (workOrderId) filters.workOrderId = workOrderId as string;
      
      const invoices = await storage.getInvoices(Object.keys(filters).length > 0 ? filters : undefined);
      
      const enrichedInvoices = await Promise.all(
        invoices.map(async (invoice) => {
          let customer = null;
          if (invoice.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, invoice.customerId));
            customer = cust || null;
          }
          
          let job = null;
          if (invoice.jobId) {
            const [j] = await db.select().from(crmJobs).where(eq(crmJobs.id, invoice.jobId));
            job = j || null;
          }
          
          return {
            ...invoice,
            customer,
            job,
          };
        })
      );
      
      return res.json(enrichedInvoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      return res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // GET /api/crm/invoices/:id - Get invoice with line items
  app.get("/api/crm/invoices/:id", requireCrmAuth, async (req, res) => {
    try {
      const result = await storage.getInvoiceWithLineItems(req.params.id);
      
      if (!result) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      let customer = null;
      if (result.invoice.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, result.invoice.customerId));
        customer = cust || null;
      }
      
      let job = null;
      if (result.invoice.jobId) {
        const [j] = await db.select().from(crmJobs).where(eq(crmJobs.id, result.invoice.jobId));
        job = j || null;
      }
      
      return res.json({
        ...result.invoice,
        lineItems: result.lineItems,
        customer,
        job,
      });
    } catch (error) {
      console.error("Error fetching invoice:", error);
      return res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // POST /api/crm/invoices - Create invoice with optional line items
  app.post("/api/crm/invoices", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { lineItems, ...invoiceData } = req.body;
      
      const parseResult = insertCrmInvoiceSchema.safeParse(invoiceData);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parseResult.error.errors 
        });
      }
      
      const invoice = await storage.createInvoice(parseResult.data);
      
      let createdLineItems: CrmInvoiceLineItem[] = [];
      if (lineItems && Array.isArray(lineItems)) {
        for (const item of lineItems) {
          const lineItemData = { ...item, invoiceId: invoice.id };
          const lineItemParseResult = insertCrmInvoiceLineItemSchema.safeParse(lineItemData);
          if (lineItemParseResult.success) {
            const createdItem = await storage.createInvoiceLineItem(lineItemParseResult.data);
            createdLineItems.push(createdItem);
          }
        }
      }
      
      await logCrmAudit(
        user.id,
        "invoice.created",
        "invoice",
        invoice.id,
        { invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, total: invoice.total },
        req.ip
      );
      
      return res.status(201).json({ ...invoice, lineItems: createdLineItems });
    } catch (error) {
      console.error("Error creating invoice:", error);
      return res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  // PATCH /api/crm/invoices/:id - Update invoice
  app.patch("/api/crm/invoices/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existingInvoice = await storage.getInvoice(req.params.id);
      if (!existingInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const allowedFields = insertCrmInvoiceSchema.partial().pick({
        status: true,
        subtotal: true,
        tax: true,
        total: true,
        balanceDue: true,
        dueDate: true,
        pdfUrl: true,
      });

      const result = allowedFields.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: result.error.flatten().fieldErrors 
        });
      }
      
      const updatedInvoice = await storage.updateInvoice(req.params.id, result.data);
      
      await logCrmAudit(
        user.id,
        "invoice.updated",
        "invoice",
        req.params.id,
        { changes: result.data },
        req.ip
      );
      
      return res.json(updatedInvoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      return res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  // DELETE /api/crm/invoices/:id - Delete invoice
  app.delete("/api/crm/invoices/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existingInvoice = await storage.getInvoice(req.params.id);
      if (!existingInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const deleted = await storage.deleteInvoice(req.params.id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete invoice" });
      }
      
      await logCrmAudit(
        user.id,
        "invoice.deleted",
        "invoice",
        req.params.id,
        { invoiceNumber: existingInvoice.invoiceNumber },
        req.ip
      );
      
      return res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      return res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  // POST /api/crm/invoices/:id/line-items - Add line item to invoice
  app.post("/api/crm/invoices/:id/line-items", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const lineItemData = { ...req.body, invoiceId: req.params.id };
      const parseResult = insertCrmInvoiceLineItemSchema.safeParse(lineItemData);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parseResult.error.errors 
        });
      }
      
      const lineItem = await storage.createInvoiceLineItem(parseResult.data);
      
      await logCrmAudit(
        user.id,
        "invoice_line_item.created",
        "invoice_line_item",
        lineItem.id,
        { invoiceId: req.params.id, description: lineItem.description },
        req.ip
      );
      
      return res.status(201).json(lineItem);
    } catch (error) {
      console.error("Error creating invoice line item:", error);
      return res.status(500).json({ message: "Failed to create invoice line item" });
    }
  });

  // PATCH /api/crm/invoices/:id/line-items/:lineItemId - Update line item
  app.patch("/api/crm/invoices/:id/line-items/:lineItemId", requireCrmAuth, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const lineItems = await storage.getInvoiceLineItems(req.params.id);
      const existingLineItem = lineItems.find(li => li.id === req.params.lineItemId);
      if (!existingLineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      
      const updatedLineItem = await storage.updateInvoiceLineItem(req.params.lineItemId, req.body);
      
      await logCrmAudit(
        user.id,
        "invoice_line_item.updated",
        "invoice_line_item",
        req.params.lineItemId,
        { invoiceId: req.params.id, changes: req.body },
        req.ip
      );
      
      return res.json(updatedLineItem);
    } catch (error) {
      console.error("Error updating invoice line item:", error);
      return res.status(500).json({ message: "Failed to update invoice line item" });
    }
  });

  // DELETE /api/crm/invoices/:id/line-items/:lineItemId - Delete line item
  app.delete("/api/crm/invoices/:id/line-items/:lineItemId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const lineItems = await storage.getInvoiceLineItems(req.params.id);
      const existingLineItem = lineItems.find(li => li.id === req.params.lineItemId);
      if (!existingLineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      
      const deleted = await storage.deleteInvoiceLineItem(req.params.lineItemId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete line item" });
      }
      
      await logCrmAudit(
        user.id,
        "invoice_line_item.deleted",
        "invoice_line_item",
        req.params.lineItemId,
        { invoiceId: req.params.id },
        req.ip
      );
      
      return res.json({ message: "Line item deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice line item:", error);
      return res.status(500).json({ message: "Failed to delete invoice line item" });
    }
  });

  // =============================================
  // CRM QUOTES ROUTES (Separate from AI Quote Generator)
  // =============================================

  // GET /api/crm/quotes - List CRM quotes with filters
  app.get("/api/crm/quotes", requireCrmAuth, async (req, res) => {
    try {
      const { status, assignedToId, search, page = "1", limit = "25" } = req.query;
      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limit as string) || 25, 100);
      const offset = (pageNum - 1) * limitNum;

      let query = db.select().from(crmQuotes);
      
      const conditions: any[] = [];
      if (status && status !== "all") {
        conditions.push(eq(crmQuotes.status, status as string));
      }
      if (assignedToId) {
        conditions.push(eq(crmQuotes.assignedToId, assignedToId as string));
      }
      if (search) {
        const searchLower = `%${(search as string).toLowerCase()}%`;
        conditions.push(
          sql`(LOWER(${crmQuotes.customerName}) LIKE ${searchLower} OR LOWER(${crmQuotes.quoteNumber}) LIKE ${searchLower})`
        );
      }

      const baseQuery = conditions.length > 0
        ? db.select().from(crmQuotes).where(and(...conditions))
        : db.select().from(crmQuotes);

      const [countResult, quotes] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(crmQuotes).where(conditions.length > 0 ? and(...conditions) : undefined),
        baseQuery.orderBy(desc(crmQuotes.createdAt)).limit(limitNum).offset(offset),
      ]);

      const total = Number(countResult[0]?.count || 0);

      return res.json({
        quotes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum * limitNum < total,
          hasPrevPage: pageNum > 1,
        },
      });
    } catch (error) {
      console.error("Error fetching CRM quotes:", error);
      return res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  // GET /api/crm/quotes/:id - Get single CRM quote
  app.get("/api/crm/quotes/:id", requireCrmAuth, async (req, res) => {
    try {
      const quote = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!quote[0]) {
        return res.status(404).json({ message: "Quote not found" });
      }
      return res.json(quote[0]);
    } catch (error) {
      console.error("Error fetching CRM quote:", error);
      return res.status(500).json({ message: "Failed to fetch quote" });
    }
  });

  // POST /api/crm/quotes - Create CRM quote
  app.post("/api/crm/quotes", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Generate quote number: Q-YYMMDD-XXXX
      const now = new Date();
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const quoteNumber = `Q-${dateStr}-${randomSuffix}`;

      const { customerName, ...rest } = req.body;
      if (!customerName) {
        return res.status(400).json({ message: "Customer name is required" });
      }

      const [newQuote] = await db.insert(crmQuotes).values({
        ...rest,
        customerName,
        quoteNumber,
        createdById: user.id,
      }).returning();

      await logCrmAudit(
        user.id,
        "quote.created",
        "crm_quote",
        newQuote.id,
        { quoteNumber },
        req.ip
      );

      return res.status(201).json(newQuote);
    } catch (error) {
      console.error("Error creating CRM quote:", error);
      return res.status(500).json({ message: "Failed to create quote" });
    }
  });

  // PATCH /api/crm/quotes/:id - Update CRM quote
  app.patch("/api/crm/quotes/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existing = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing[0]) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const [updated] = await db.update(crmQuotes)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(crmQuotes.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "quote.updated",
        "crm_quote",
        req.params.id,
        { changes: Object.keys(req.body) },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error updating CRM quote:", error);
      return res.status(500).json({ message: "Failed to update quote" });
    }
  });

  // DELETE /api/crm/quotes/:id - Delete CRM quote
  app.delete("/api/crm/quotes/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existing = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing[0]) {
        return res.status(404).json({ message: "Quote not found" });
      }

      await db.delete(crmQuotes).where(eq(crmQuotes.id, req.params.id));

      await logCrmAudit(
        user.id,
        "quote.deleted",
        "crm_quote",
        req.params.id,
        { quoteNumber: existing[0].quoteNumber },
        req.ip
      );

      return res.json({ message: "Quote deleted successfully" });
    } catch (error) {
      console.error("Error deleting CRM quote:", error);
      return res.status(500).json({ message: "Failed to delete quote" });
    }
  });

  const httpServer = createServer(app);

  // Defer expensive startup operations to run after server is ready (allows health checks to pass)
  setTimeout(() => {
    // Customer auto-sync disabled - using CSV import instead
    // startAutoSync(10);
    // console.log('Customer auto-sync started (every 10 minutes)');

    // Start daily weather refresh
    scheduleWeatherRefresh();

    // Start weather impact jobs (refreshes call_daily and weather_daily every 6 hours)
    scheduleWeatherImpactJobs();

    // Seed vector store with sales book if empty (async, don't block startup)
    seedVectorStoreWithSalesBook().then(success => {
      if (success) {
        console.log('Vector store knowledge base initialized');
      }
    }).catch(err => {
      console.error('Error seeding vector store on startup:', err);
    });
  }, 5000); // 5 second delay to allow health checks to pass first

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
