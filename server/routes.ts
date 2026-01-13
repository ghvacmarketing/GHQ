import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";

const APP_TIMEZONE = "America/New_York";
import { storage } from "./storage";
import { insertQuoteSchema, insertPartSchema, insertTechnicianSchema, insertProcessSchema, insertAnnouncementSchema, insertPhoneWhitelistSchema, insertLeadSchema, announcements, categories, crmCustomers, crmProperties, crmJobs, crmJobAssignments, crmJobStatusEvents, crmJobNotes, crmUsers, crmCustomerNotes, crmAuditLog, insertCrmCustomerSchema, insertCrmJobSchema, crmAccounts, crmSites, crmContacts, residentialProfiles, propertyManagerProfiles, commercialProfiles, insertCrmAccountSchema, insertCrmSiteSchema, insertCrmContactSchema, insertResidentialProfileSchema, insertPropertyManagerProfileSchema, insertCommercialProfileSchema, type AccountType, type AccountStatus, type ContactRole, customers, crmWorkOrders, insertCrmWorkOrderSchema, type CrmWorkOrder, type InsertCrmWorkOrder, workOrderSubtypes, insertWorkOrderSubtypeSchema, crmInvoices, crmInvoiceLineItems, insertCrmInvoiceSchema, insertCrmInvoiceLineItemSchema, type CrmInvoice, type CrmInvoiceLineItem, type InsertCrmInvoice, type InsertCrmInvoiceLineItem, crmQuotes, crmQuoteLineItems, insertCrmQuoteSchema, insertCrmQuoteLineItemSchema, type CrmQuote, type InsertCrmQuote, type CrmQuoteLineItem, type InsertCrmQuoteLineItem, crmAgreements, insertCrmAgreementSchema, type CrmAgreement, type InsertCrmAgreement, crmProjects, insertCrmProjectSchema, type CrmProject, type InsertCrmProject, projectStatusEnum, quotes, leads, projectActivities, insertProjectActivitySchema, type ProjectActivity, type InsertProjectActivity, projectActivityTypeEnum, noteMetadataSchema, photoMetadataSchema, fileMetadataSchema, financialMetadataSchema, approvalMetadataSchema, type ActivityAttachment, crmItems, insertCrmItemSchema, type CrmItem, type InsertCrmItem, proposalSessions, insertProposalSessionSchema, type ProposalSession, type InsertProposalSession, quoteEmailLogs, type QuoteEmailLog, invoiceEmailLogs, type InvoiceEmailLog, crmFollowUps, insertCrmFollowUpSchema, type CrmFollowUp, type InsertCrmFollowUp, salesStageEnum, interestLevelEnum, maintenanceRegions, maintenanceVisits, type MaintenanceRegion, type MaintenanceVisit, maintenanceAgreementTasks, maintenanceTaskSchedules, maintenanceTaskEquipment, maintenanceTaskParts, insertMaintenanceAgreementTaskSchema, insertMaintenanceTaskScheduleSchema, insertMaintenanceTaskEquipmentSchema, insertMaintenanceTaskPartSchema, serviceCallChecklists, checklistQuestions, workOrderChecklistResponses, insertServiceCallChecklistSchema, insertChecklistQuestionSchema, insertWorkOrderChecklistResponseSchema, type ServiceCallChecklist, type ChecklistQuestion, type WorkOrderChecklistResponse, type InsertServiceCallChecklist, type InsertChecklistQuestion, type InsertWorkOrderChecklistResponse, serviceCallTypeEnum, monthlyGoals, insertMonthlyGoalSchema, type MonthlyGoal, type InsertMonthlyGoal, customAgreementTypes, insertCustomAgreementTypeSchema, type CustomAgreementType, type InsertCustomAgreementType, workSubtypeByVisitType, attachments, customerPortalAccounts, customerPortalLoginTokens, customerPortalSessions, insertCrmMessagingConversationSchema, insertCrmMessagingMessageSchema, crmMessagingMessages, crmMessagingConversations, quickbooksClasses, quickbooksAccounts, quickbooksInvoiceSync, appSettings, DEFAULT_FINANCING_LINK, bouncieVehicles, insertBouncieVehicleSchema, type BouncieVehicle, type InsertBouncieVehicle, marketingCampaigns, pricebookPackages, insertPricebookPackageSchema, type PricebookPackage, type InsertPricebookPackage, crawlspaceTiers, insertCrawlspaceTierSchema, type CrawlspaceTier, packagePriceAdjustments, insertPackagePriceAdjustmentSchema, type PackagePriceAdjustment } from "@shared/schema";
import * as xlsx from "xlsx";
import { nanoid } from "nanoid";
import { googleSheetsService } from "./google-sheets";
import { equipmentSheetsService } from "./equipment-sheets";
import { packageSheetsService, startPricebookAutoSync, syncPricebookPackages } from "./services/package-sheets-sync";
import { emailService } from "./services/email";
import { trelloService } from "./services/trello";
import { voiceService } from "./services/voice";
import { sendCrmQuoteEmail } from "./services/crmQuoteEmail";
import { sendCrmInvoiceEmail } from "./services/crmInvoiceEmail";
import { twilioService } from "./sms";
import { pool, db } from "./db";
import { eq, inArray, desc, sql, and, or, ilike, asc, count, isNull, lt, gt, gte, lte, ne, isNotNull } from "drizzle-orm";
import { randomUUID, createHmac } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { syncCustomersFromSheet, getCustomerSyncStatus, resetSyncHash, startAutoSync } from "./services/customer-sync";
import { generateQuoteWithAI, createQuoteConversation, getConversationHistory, type QuoteGenerationInput } from "./services/quote-generation";
import { uploadBufferToVectorStore, listVectorStoreFiles, deleteFileFromVectorStore, getOrCreateVectorStore, seedVectorStoreWithSalesBook, uploadCRMKnowledgeBase } from "./services/vector-store";
import { refreshWeather, scheduleWeatherRefresh, getWeatherData } from "./weather-service";
import { startBouncieBackgroundSync } from "./services/bouncieService";
import { scheduleWeatherImpactJobs } from "./weather-impact-service";
import { scheduleAgreementRenewals, processAgreementRenewals, processSingleAgreementRenewal } from "./services/agreementRenewalService";
import { scheduleMaintenanceReminders, processMaintenanceReminders } from "./services/maintenanceReminderService";
import { startReviewRequestScheduler, processReviewRequests, syncCampaignActiveStatus } from "./services/reviewRequestService";
import { runFullFieldEdgeImport } from "./services/fieldEdgeImport";
import { fieldEdgeCustomerService, type FieldEdgeCustomer } from "./services/fieldedge-customers";
import { sendAutomatedSms, hasNotificationBeenSent, getWorkOrderEnRouteTemplate, getWorkOrderOnSiteTemplate, getInvoiceSmsTemplate } from "./services/smsNotificationService";
import { setupEmployeeAuth, requirePortalAuth, requireAdmin, requireEmployee, hashPassword } from "./employee-auth";
import { requireCrmAuth, getCurrentCrmUser, getCrmUserByEmail, createCrmSession, destroyCrmSession, comparePasswords as compareCrmPasswords, verifyGatePassword, ensureTechniciansExist, CRM_SESSION_COOKIE, isSalesOrAbove, requireCrmAdmin, requireCrmSalesOrAbove, requireCrmTechOrAbove, logCrmAudit, hashPassword as hashCrmPassword, isSupervisor } from "./crm-auth";
import cookieParser from "cookie-parser";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import stripePaymentsRouter from "./stripe-payments";
import { getMessagingAdapter } from "./services/messaging/adapters";
import { textlineClient } from "./textlineClient";
import { autoSyncCustomer, autoSyncInvoice, autoVoidInvoice, autoDeleteInvoice, autoSyncPayment } from "./services/quickbooksService";

// Simple in-memory token store for admin authentication (works in Replit iframe where cookies fail)
const adminTokens = new Map<string, { createdAt: number }>();
// Token expiry: configurable via env var (in days), defaults to 90 days for convenience
const TOKEN_EXPIRY_DAYS = parseInt(process.env.ADMIN_TOKEN_EXPIRY_DAYS || '90', 10);
const TOKEN_EXPIRY = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Analytics cache to speed up dashboard loading (30-second TTL)
const analyticsCache = new Map<string, { data: any; timestamp: number }>();
const ANALYTICS_CACHE_TTL = 30 * 1000; // 30 seconds

function getCachedAnalytics(cacheKey: string): any | null {
  const cached = analyticsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ANALYTICS_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedAnalytics(cacheKey: string, data: any): void {
  analyticsCache.set(cacheKey, { data, timestamp: Date.now() });
}

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

// Discount line item validation helper
// Validates rules for discount line items in quotes and invoices
type DiscountLineItem = {
  isDiscountLine?: boolean;
  lineType?: string;
  discountKind?: string;
  quantity?: string | number;
  unitPrice?: string | number;
  lineTotal?: string | number;
};

type ExistingLineItem = {
  isDiscountLine?: boolean | null;
  lineType?: string | null;
  discountKind?: string | null;
  id?: string;
};

function validateDiscountLineItem(
  lineItem: DiscountLineItem,
  existingLineItems: ExistingLineItem[] = [],
  currentLineItemId?: string,
  entityType: 'quote' | 'invoice' = 'quote'
): { valid: boolean; error?: string } {
  const isDiscount = lineItem.isDiscountLine === true || lineItem.lineType === 'discount';
  
  if (!isDiscount) {
    return { valid: true };
  }

  // Validate quantity equals 1
  const qty = typeof lineItem.quantity === 'string' ? parseFloat(lineItem.quantity) : lineItem.quantity;
  if (qty !== undefined && qty !== 1) {
    return { valid: false, error: "Discount quantity must be 1" };
  }

  // Validate unitPrice is <= 0
  const price = typeof lineItem.unitPrice === 'string' ? parseFloat(lineItem.unitPrice) : lineItem.unitPrice;
  if (price !== undefined && price > 0) {
    return { valid: false, error: "Discount amount must be negative or zero" };
  }

  // Validate lineTotal is <= 0
  const total = typeof lineItem.lineTotal === 'string' ? parseFloat(lineItem.lineTotal) : lineItem.lineTotal;
  if (total !== undefined && total > 0) {
    return { valid: false, error: "Discount amount must be negative or zero" };
  }

  // Check for duplicate discount kinds (promotion, maintenance)
  if (lineItem.discountKind === 'promotion' || lineItem.discountKind === 'maintenance') {
    const existingOfSameKind = existingLineItems.filter(item => {
      // Exclude current item when updating
      if (currentLineItemId && item.id === currentLineItemId) {
        return false;
      }
      const itemIsDiscount = item.isDiscountLine === true || item.lineType === 'discount';
      return itemIsDiscount && item.discountKind === lineItem.discountKind;
    });

    if (existingOfSameKind.length > 0) {
      if (lineItem.discountKind === 'promotion') {
        return { valid: false, error: `Only one promotion discount allowed per ${entityType}` };
      }
      if (lineItem.discountKind === 'maintenance') {
        return { valid: false, error: `Only one maintenance discount allowed per ${entityType}` };
      }
    }
  }

  return { valid: true };
}

// Validate an array of line items for discount rules
function validateDiscountLineItems(
  lineItems: DiscountLineItem[],
  existingLineItems: ExistingLineItem[] = [],
  entityType: 'quote' | 'invoice' = 'quote'
): { valid: boolean; error?: string } {
  // Track discount kinds in this batch
  const batchPromotionCount = lineItems.filter(item => 
    (item.isDiscountLine === true || item.lineType === 'discount') && item.discountKind === 'promotion'
  ).length;
  
  const batchMaintenanceCount = lineItems.filter(item => 
    (item.isDiscountLine === true || item.lineType === 'discount') && item.discountKind === 'maintenance'
  ).length;

  // Check existing counts
  const existingPromotionCount = existingLineItems.filter(item => 
    (item.isDiscountLine === true || item.lineType === 'discount') && item.discountKind === 'promotion'
  ).length;
  
  const existingMaintenanceCount = existingLineItems.filter(item => 
    (item.isDiscountLine === true || item.lineType === 'discount') && item.discountKind === 'maintenance'
  ).length;

  if (batchPromotionCount + existingPromotionCount > 1) {
    return { valid: false, error: `Only one promotion discount allowed per ${entityType}` };
  }

  if (batchMaintenanceCount + existingMaintenanceCount > 1) {
    return { valid: false, error: `Only one maintenance discount allowed per ${entityType}` };
  }

  // Validate each individual line item
  for (const lineItem of lineItems) {
    const result = validateDiscountLineItem(lineItem, [], undefined, entityType);
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}

// Helper function to check for scheduling conflicts
async function checkSchedulingConflict(
  techId: string | null | undefined,
  scheduledStart: Date | string | null | undefined,
  scheduledEnd: Date | string | null | undefined,
  excludeWorkOrderId?: string
): Promise<{ hasConflict: boolean; conflictingOrder?: { id: string; title: string | null; scheduledStart: Date | null; scheduledEnd: Date | null } }> {
  if (!techId || !scheduledStart || !scheduledEnd) {
    return { hasConflict: false };
  }
  
  const start = new Date(scheduledStart);
  const end = new Date(scheduledEnd);
  
  // Build conditions for overlap detection using Drizzle's typed helpers
  // Overlap condition: existingStart < newEnd AND existingEnd > newStart
  const conditions = [
    eq(crmWorkOrders.assignedTechId, techId),
    isNotNull(crmWorkOrders.scheduledStart),
    isNotNull(crmWorkOrders.scheduledEnd),
    lt(crmWorkOrders.scheduledStart, end),
    gt(crmWorkOrders.scheduledEnd, start),
    // Only check non-cancelled and non-completed orders
    sql`${crmWorkOrders.status} NOT IN ('cancelled', 'completed')`
  ];
  
  // Exclude current work order if updating
  if (excludeWorkOrderId) {
    conditions.push(ne(crmWorkOrders.id, excludeWorkOrderId));
  }
  
  const conflicts = await db.select({
    id: crmWorkOrders.id,
    title: crmWorkOrders.title,
    scheduledStart: crmWorkOrders.scheduledStart,
    scheduledEnd: crmWorkOrders.scheduledEnd,
  })
  .from(crmWorkOrders)
  .where(and(...conditions))
  .limit(1);
  
  if (conflicts.length > 0) {
    return { hasConflict: true, conflictingOrder: conflicts[0] };
  }
  
  return { hasConflict: false };
}

// Helper function to create follow-up work order when quote is accepted
async function createFollowUpWorkOrder(
  quote: typeof crmQuotes.$inferSelect,
  parentWorkOrder: typeof crmWorkOrders.$inferSelect,
  options: { dispatchQueueStage: "WaitingOnParts" | "ReadyToDispatch", assignedTechId?: string | null }
): Promise<typeof crmWorkOrders.$inferSelect | null> {
  // Check if follow-up already exists for this quote
  const [existing] = await db.select().from(crmWorkOrders)
    .where(eq(crmWorkOrders.sourceQuoteId, quote.id)).limit(1);
  if (existing) {
    console.log(`[createFollowUpWorkOrder] Follow-up WO already exists for quote ${quote.id}`);
    return null;
  }

  // Get next work order number
  const lastWO = await db.select({ workOrderNumber: crmWorkOrders.workOrderNumber })
    .from(crmWorkOrders).orderBy(desc(crmWorkOrders.workOrderNumber)).limit(1);
  const nextNumber = (lastWO[0]?.workOrderNumber || 0) + 1;

  console.log(`[createFollowUpWorkOrder] Creating follow-up WO #${nextNumber} for quote ${quote.id}, stage: ${options.dispatchQueueStage}`);

  // For WaitingOnParts stage, use specific subtype; otherwise inherit from parent or use default
  const workSubtype = options.dispatchQueueStage === "WaitingOnParts" 
    ? "Service Call: Part Replacement" 
    : parentWorkOrder.workSubtype || "Other";

  const [newWorkOrder] = await db.insert(crmWorkOrders).values({
    customerId: parentWorkOrder.customerId,
    propertyId: parentWorkOrder.propertyId,
    projectId: parentWorkOrder.projectId,
    sourceQuoteId: quote.id,
    workOrderNumber: nextNumber,
    assignedTechId: options.assignedTechId || null,
    visitType: "SERVICE",
    workSubtype,
    title: `Follow-up: ${quote.title || quote.quoteNumber}`,
    description: quote.description || `Follow-up work order for accepted quote ${quote.quoteNumber}`,
    status: "scheduled",
    priority: "urgent",
    dispatchQueueStage: options.dispatchQueueStage,
  }).returning();

  console.log(`[createFollowUpWorkOrder] Created follow-up WO ${newWorkOrder.id} for quote ${quote.id}`);

  return newWorkOrder;
}

// Helper function to check if a quote contains service-type items (not just maintenance)
async function hasServiceItems(quoteId: string): Promise<boolean> {
  // Fetch quote line items with their linked crm_items
  const lineItems = await db.select({
    lineId: crmQuoteLineItems.id,
    itemId: crmQuoteLineItems.itemId,
    lineType: crmQuoteLineItems.lineType,
    itemCategory: crmItems.category,
    itemType: crmItems.itemType,
  })
  .from(crmQuoteLineItems)
  .leftJoin(crmItems, eq(crmQuoteLineItems.itemId, crmItems.id))
  .where(eq(crmQuoteLineItems.quoteId, quoteId));

  // Check if any line item is a service item
  // Service items have category = 'service' OR itemType = 'service'
  // We want to trigger follow-up modal only if there are service items
  for (const item of lineItems) {
    // Skip discount lines
    if (item.lineType === 'discount') continue;
    
    // If linked to a crm_item, check its category/itemType
    if (item.itemId) {
      if (item.itemCategory === 'service' || item.itemType === 'service') {
        return true;
      }
    } else {
      // For line items without linked crm_item, check lineType
      // labor, service, part, and other line types indicate service work
      // (maintenance-only quotes typically use items from the catalog with category='maintenance')
      if (item.lineType === 'service' || item.lineType === 'labor' || item.lineType === 'part') {
        return true;
      }
    }
  }

  // If no service items found, check if ALL items are maintenance (return false)
  // Otherwise if there are install/parts items but no service, also return false
  return false;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Trust proxy for Replit's infrastructure
  app.set('trust proxy', 1);

  // Add compression middleware for better performance
  app.use(compression());

  // Serve static assets from attached_assets directory (for SGA images, etc.)
  app.use('/assets', express.static('attached_assets'));
  
  // Block direct access to /uploads/activities/* - these must go through the protected API endpoint
  app.use('/uploads/activities', (req, res) => {
    res.status(403).json({ message: "Access denied. Use the protected API endpoint." });
  });
  
  // Serve uploads folder for voicemail MP3 files (activities blocked above)
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

  // Register object storage routes for App Storage file uploads
  registerObjectStorageRoutes(app);

  // Register Stripe payment routes
  app.use(stripePaymentsRouter);

  // Ensure CRM users exist with correct roles
  ensureTechniciansExist().catch(console.error);

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

  // Ensure uploads/activities directory exists for activity attachments
  const activitiesUploadsDir = path.join(uploadsDir, 'activities');
  if (!fs.existsSync(activitiesUploadsDir)) {
    fs.mkdirSync(activitiesUploadsDir, { recursive: true });
  }

  // Allowed MIME types for activity attachments
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  // Configure multer for activity file uploads with disk storage
  const activityUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, activitiesUploadsDir);
      },
      filename: (req, file, cb) => {
        const uuid = randomUUID();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${uuid}_${safeName}`);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per file
      files: 10 // max 10 files
    },
    fileFilter: (req, file, cb) => {
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: jpg, png, gif, webp, pdf, doc, docx, xlsx`));
      }
    }
  });

  // ============================================
  // HEALTH CHECK ENDPOINT (for keep-warm / monitoring)
  // ============================================
  app.get("/health", (req, res) => {
    res.status(200).json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

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
      const { clientName, description, phone, tag, createdByName, date, billable } = req.body;
      
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
        billable: billable || false,
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
      const { clientName, description, phone, tag, createdByName, billable } = req.body;
      const updates: any = {};
      
      if (clientName !== undefined) updates.clientName = clientName;
      if (description !== undefined) updates.description = description;
      if (phone !== undefined) updates.phone = phone;
      if (tag !== undefined) updates.tag = tag;
      if (createdByName !== undefined) updates.createdByName = createdByName;
      if (billable !== undefined) updates.billable = billable;
      
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

  // GET /api/call-logs/:callLogId/tasks - Get tasks for a call log
  app.get("/api/call-logs/:callLogId/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasksByCallLog(req.params.callLogId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching call log tasks:", error);
      res.status(500).json({ message: "Error fetching call log tasks" });
    }
  });

  // POST /api/call-logs/:callLogId/tasks - Create task for a call log
  app.post("/api/call-logs/:callLogId/tasks", async (req, res) => {
    try {
      const { description, dueDate } = req.body;
      if (!description) {
        return res.status(400).json({ message: "description is required" });
      }
      const task = await storage.createCallLogTask({
        callLogId: req.params.callLogId,
        description,
        dueDate: dueDate || null,
        isCompleted: false,
      });
      res.json(task);
    } catch (error) {
      console.error("Error creating call log task:", error);
      res.status(500).json({ message: "Error creating call log task" });
    }
  });

  // PUT /api/call-log-tasks/:id - Update task (toggle complete, update description)
  app.put("/api/call-log-tasks/:id", async (req, res) => {
    try {
      const { description, isCompleted, dueDate } = req.body;
      const updates: any = {};
      if (description !== undefined) updates.description = description;
      if (isCompleted !== undefined) updates.isCompleted = isCompleted;
      if (dueDate !== undefined) updates.dueDate = dueDate;
      
      const task = await storage.updateCallLogTask(req.params.id, updates);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error updating call log task:", error);
      res.status(500).json({ message: "Error updating call log task" });
    }
  });

  // DELETE /api/call-log-tasks/:id - Delete task
  app.delete("/api/call-log-tasks/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCallLogTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting call log task:", error);
      res.status(500).json({ message: "Error deleting call log task" });
    }
  });

  // GET /api/call-logs/days/:date/tasks - Get all tasks for a day
  app.get("/api/call-logs/days/:date/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasksByDay(req.params.date);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks for day:", error);
      res.status(500).json({ message: "Error fetching tasks for day" });
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

  // Dashboard stats - lightweight endpoint for home page
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      // Get counts efficiently using SQL aggregates
      const [pendingQuotesResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(quotes)
        .where(sql`${quotes.status} IN ('draft', 'sent')`);
      
      const [activeLeadsResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(sql`${leads.status} IN ('New', 'Contacted', 'Qualified') AND ${leads.won} = false AND ${leads.lost} = false`);
      
      // Installs this week - won leads with installation tag and installDate this week
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      
      const [installsThisWeekResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(sql`${leads.status} = 'Won' AND ${leads.installDate} >= ${startOfWeek} AND ${leads.installDate} < ${endOfWeek}`);
      
      // Won deals last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const [wonDealsResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(sql`${leads.status} = 'Won' AND ${leads.closedAt} >= ${thirtyDaysAgo}`);
      
      // Pipeline value - sum of estimated values for active leads
      const [pipelineResult] = await db
        .select({ total: sql<number>`COALESCE(SUM(CAST(${leads.estimatedValue} AS DECIMAL)), 0)` })
        .from(leads)
        .where(sql`${leads.won} = false AND ${leads.lost} = false`);
      
      res.json({
        pendingQuotes: Number(pendingQuotesResult?.count || 0),
        activeLeads: Number(activeLeadsResult?.count || 0),
        installsThisWeek: Number(installsThisWeekResult?.count || 0),
        wonDealsLast30Days: Number(wonDealsResult?.count || 0),
        pipelineValue: Number(pipelineResult?.total || 0),
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Error fetching dashboard stats" });
    }
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

  app.post("/api/admin/vector-store/upload-crm-knowledge", requireAdminAuth, async (req, res) => {
    try {
      const { isVectorStoreUnavailable } = await import("./services/vector-store");
      
      if (isVectorStoreUnavailable()) {
        return res.status(503).json({ 
          message: "Vector store API not available in this environment.",
          available: false
        });
      }
      
      const success = await uploadCRMKnowledgeBase();
      if (success) {
        const files = await listVectorStoreFiles();
        res.json({ message: "CRM knowledge base uploaded successfully", files, available: true });
      } else {
        res.status(400).json({ message: "CRM knowledge base file not found or already uploaded" });
      }
    } catch (error) {
      console.error("Error uploading CRM knowledge base:", error);
      res.status(500).json({ message: "Error uploading CRM knowledge base" });
    }
  });

  app.post("/api/crm/help", requireCrmAuth, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        return res.status(400).json({ message: "Question is required" });
      }
      
      const { askCrmHelp } = await import("./services/crmHelpAI");
      const result = await askCrmHelp(question);
      res.json(result);
    } catch (error) {
      console.error("Error in CRM help:", error);
      res.status(500).json({ message: "Error processing help request" });
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
        warrantyReserve: sheetsData.warrantyReserve,
        overheadPercent: sheetsData.overheadPercent,
        salesTaxPercent: sheetsData.salesTaxPercent,
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
        warrantyReserve: sheetsData.warrantyReserve,
        overheadPercent: sheetsData.overheadPercent,
        salesTaxPercent: sheetsData.salesTaxPercent,
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

  // GET /api/leads/sheet-customers/search - Search customers directly from Google Sheet for Sales Prospects
  app.get("/api/leads/sheet-customers/search", async (req, res) => {
    try {
      const term = req.query.term as string;
      const searchAll = req.query.searchAll === 'true';
      
      if (!term || term.length < 2) {
        return res.json([]);
      }

      const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
      const sheetId = process.env.FIELDEDGE_CUSTOMER_SHEET_ID || '1POeQRuDUTia0BUYsVmEsBOqW6BDBvfL5qyKv-GQICU0';
      
      if (!apiKey) {
        return res.status(500).json({ message: "Google Sheets API key not configured" });
      }

      // Fetch directly from Google Sheet
      const range = encodeURIComponent('Sheet1');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Google Sheets API error:', response.status, response.statusText);
        return res.status(500).json({ message: "Failed to fetch from Google Sheets" });
      }

      const data = await response.json();
      
      if (!data.values || data.values.length === 0) {
        return res.json([]);
      }

      const headers = data.values[0] as string[];
      const rows = data.values.slice(1) as string[][];
      
      // Map column indices
      const colIndex = {
        displayName: headers.indexOf('Display Name'),
        customerType: headers.indexOf('Customer Type'),
        customerStatus: headers.indexOf('Customer Status'),
        fullAddress: headers.indexOf('Full Address'),
        phone: headers.indexOf('Phone'),
        email: headers.indexOf('Email'),
        leadSource: headers.indexOf('Lead Source'),
      };

      const searchLower = term.toLowerCase();
      
      // Filter and transform matching rows
      const results = rows
        .map((row, idx) => ({
          id: `sheet-${idx}`,
          displayName: row[colIndex.displayName] || '',
          customerType: row[colIndex.customerType] || 'Residential',
          customerStatus: row[colIndex.customerStatus] || 'Customer',
          fullAddress: row[colIndex.fullAddress] || '',
          phone: row[colIndex.phone] || '',
          email: row[colIndex.email] || '',
          leadSource: row[colIndex.leadSource] || '',
        }))
        .filter(customer => {
          if (!customer.displayName) return false;
          
          if (searchAll) {
            // Search across all fields
            return (
              customer.displayName.toLowerCase().includes(searchLower) ||
              customer.phone.toLowerCase().includes(searchLower) ||
              customer.email.toLowerCase().includes(searchLower) ||
              customer.fullAddress.toLowerCase().includes(searchLower)
            );
          } else {
            // Search only by name
            return customer.displayName.toLowerCase().includes(searchLower);
          }
        })
        .slice(0, 20); // Limit to 20 results

      res.json(results);
    } catch (error) {
      console.error('Error searching sheet customers:', error);
      res.status(500).json({ message: "Error searching customers" });
    }
  });

  // 1. GET /api/leads - Get all leads
  app.get("/api/leads", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const status = req.query.status as string;
      const search = req.query.search as string;
      const offset = (page - 1) * limit;
      
      // Build status filter that handles Won/Lost with boolean flags
      const buildStatusFilter = () => {
        if (!status || status === 'all') return null;
        if (status === 'Won') {
          return sql`(${leads.won} = true OR ${leads.status} = 'Won')`;
        }
        if (status === 'Lost') {
          return sql`(${leads.lost} = true OR ${leads.status} = 'Lost')`;
        }
        // For active statuses, exclude won/lost leads
        return sql`${leads.status} = ${status} AND ${leads.won} = false AND ${leads.lost} = false`;
      };
      
      const statusFilter = buildStatusFilter();
      
      // Get total count first
      let query = db.select({ count: sql<number>`count(*)` }).from(leads);
      if (statusFilter) {
        query = query.where(statusFilter) as typeof query;
      }
      if (search && search.length >= 2) {
        query = query.where(sql`LOWER(${leads.name}) LIKE LOWER(${'%' + search + '%'}) OR LOWER(${leads.phone}) LIKE LOWER(${'%' + search + '%'}) OR LOWER(${leads.email}) LIKE LOWER(${'%' + search + '%'})`) as typeof query;
      }
      const [countResult] = await query;
      const total = Number(countResult?.count || 0);
      
      // Get paginated data
      let dataQuery = db.select().from(leads);
      if (statusFilter) {
        dataQuery = dataQuery.where(statusFilter) as typeof dataQuery;
      }
      if (search && search.length >= 2) {
        dataQuery = dataQuery.where(sql`LOWER(${leads.name}) LIKE LOWER(${'%' + search + '%'}) OR LOWER(${leads.phone}) LIKE LOWER(${'%' + search + '%'}) OR LOWER(${leads.email}) LIKE LOWER(${'%' + search + '%'})`) as typeof dataQuery;
      }
      const result = await dataQuery.orderBy(desc(leads.createdAt)).limit(limit).offset(offset);
      
      res.json({
        leads: result,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: offset + limit < total,
          hasPrevPage: page > 1
        }
      });
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
        const value = parseFloat(lead.estimatedValue || '0');
        
        // Use boolean flags as primary indicator for Won/Lost
        if (lead.won || lead.status === 'Won') {
          statusBreakdown.Won.count++;
          statusBreakdown.Won.value += value;
        } else if (lead.lost || lead.status === 'Lost') {
          statusBreakdown.Lost.count++;
          statusBreakdown.Lost.value += value;
        } else {
          // For active leads, use the status field
          const status = lead.status || 'New';
          if (statusBreakdown[status as keyof typeof statusBreakdown]) {
            statusBreakdown[status as keyof typeof statusBreakdown].count++;
            statusBreakdown[status as keyof typeof statusBreakdown].value += value;
          }
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
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      });

      const { passwordHash, ...userWithoutPassword } = user;
      return res.json({
        message: "Login successful",
        user: userWithoutPassword,
        token: session.sessionToken,
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
  // CRM DASHBOARD ANALYTICS
  // ============================================

  // GET /api/crm/dashboard/analytics - Get aggregated dashboard analytics
  app.get("/api/crm/dashboard/analytics", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const range = (req.query.range as string) || "month";
      
      // Check cache first for faster response
      const cacheKey = `analytics_${range}`;
      const cachedData = getCachedAnalytics(cacheKey);
      if (cachedData) {
        return res.json(cachedData);
      }
      
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      
      const monthlyGoalsResult = await db
        .select()
        .from(monthlyGoals)
        .where(and(
          eq(monthlyGoals.year, currentYear),
          eq(monthlyGoals.month, currentMonth)
        ))
        .limit(1);
      
      const currentMonthlyGoals = monthlyGoalsResult[0] || null;
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const rolling12Start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

      // Calculate dynamic date range for technician performance based on range parameter
      let rangeStartDate: Date;
      let goalMultiplier: number;

      if (range === "day") {
        rangeStartDate = today;
        goalMultiplier = 1;
      } else if (range === "week") {
        rangeStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        goalMultiplier = 7;
      } else {
        // month or rolling12 - use startOfMonth
        rangeStartDate = startOfMonth;
        goalMultiplier = currentMonthlyGoals?.serviceWorkDays || 22;
      }

      let rangeStart: Date;
      switch (range) {
        case "day":
          rangeStart = today;
          break;
        case "week":
          rangeStart = startOfWeek;
          break;
        case "rolling12":
          rangeStart = rolling12Start;
          break;
        case "month":
        default:
          rangeStart = startOfMonth;
          break;
      }

      // 1. Company Overview KPIs
      // For multi-option quotes, only count the "Best" option total (highest price option)
      // Single-mode quotes use their total as-is
      const allQuotesInRange = await db
        .select({
          id: crmQuotes.id,
          total: crmQuotes.total,
          quoteMode: crmQuotes.quoteMode,
          status: crmQuotes.status,
        })
        .from(crmQuotes)
        .where(sql`${crmQuotes.createdAt} >= ${rangeStart}`);

      // Get IDs of multi-option quotes
      const optionQuoteIds = allQuotesInRange
        .filter(q => q.quoteMode === "options")
        .map(q => q.id);

      // Fetch all line items for multi-option quotes in a single query
      const optionLineItems = optionQuoteIds.length > 0
        ? await db
            .select({
              quoteId: crmQuoteLineItems.quoteId,
              optionTag: crmQuoteLineItems.optionTag,
              lineTotal: crmQuoteLineItems.lineTotal,
            })
            .from(crmQuoteLineItems)
            .where(inArray(crmQuoteLineItems.quoteId, optionQuoteIds))
        : [];

      // Build a nested map: quoteId -> optionTag -> cost (lineTotal stores costs)
      const optionQuoteCosts = new Map<string, Map<string, number>>();
      const quoteAllOptionsCost = new Map<string, number>(); // Total cost of all options per quote
      
      for (const item of optionLineItems) {
        const quoteId = item.quoteId;
        const tag = item.optionTag || "default";
        const lineTotal = parseFloat(item.lineTotal || "0");

        if (!optionQuoteCosts.has(quoteId)) {
          optionQuoteCosts.set(quoteId, new Map<string, number>());
        }
        const optionMap = optionQuoteCosts.get(quoteId)!;
        optionMap.set(tag, (optionMap.get(tag) || 0) + lineTotal);
        quoteAllOptionsCost.set(quoteId, (quoteAllOptionsCost.get(quoteId) || 0) + lineTotal);
      }

      // For multi-option quotes, calculate the highest option's sell price
      // Using proportional approach: (highestOptionCost / allOptionsCost) * quote.total
      // This preserves the markup ratio from the original quote
      const highestOptionSellPrices = new Map<string, number>();
      for (const quote of allQuotesInRange.filter(q => q.quoteMode === "options")) {
        const optionMap = optionQuoteCosts.get(quote.id);
        const allCost = quoteAllOptionsCost.get(quote.id) || 0;
        const quoteSellPrice = parseFloat(quote.total || "0");
        
        if (optionMap && allCost > 0) {
          // Find the highest cost option
          let highestCost = 0;
          for (const cost of optionMap.values()) {
            if (cost > highestCost) highestCost = cost;
          }
          // Calculate proportional sell price for the highest option
          const highestOptionSellPrice = (highestCost / allCost) * quoteSellPrice;
          highestOptionSellPrices.set(quote.id, highestOptionSellPrice);
        }
      }

      // Calculate totals using precomputed highest option sell prices
      let totalQuotedCalc = 0;
      let totalQuotesCount = 0;
      let totalSoldCalc = 0;
      let acceptedQuotesCount = 0;

      for (const quote of allQuotesInRange) {
        totalQuotesCount++;
        let effectiveTotal = parseFloat(quote.total || "0");

        // For multi-option quotes, use precomputed highest option sell price
        if (quote.quoteMode === "options" && highestOptionSellPrices.has(quote.id)) {
          effectiveTotal = highestOptionSellPrices.get(quote.id) || effectiveTotal;
        }

        totalQuotedCalc += effectiveTotal;

        if (quote.status === "accepted") {
          acceptedQuotesCount++;
          totalSoldCalc += effectiveTotal;
        }
      }

      const totalQuoted = totalQuotedCalc;
      const totalSold = totalSoldCalc;

      const rolling12Invoices = await db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${crmInvoices.total} AS DECIMAL(10,2))), 0)`,
        })
        .from(crmInvoices)
        .where(and(
          sql`${crmInvoices.paidAt} IS NOT NULL AND ${crmInvoices.paidAt} >= ${rolling12Start}`,
          eq(crmInvoices.status, "paid")
        ));

      const closeRate = totalQuotesCount > 0 ? (acceptedQuotesCount / totalQuotesCount) * 100 : 0;
      
      // Calculate dynamic company goal based on range and budgeted monthly sales from Excel
      let companyGoal = 0;
      const monthlyBudget = currentMonthlyGoals ? parseFloat(currentMonthlyGoals.budgetedMonthlySalesGoal || "0") : 0;
      const workDays = currentMonthlyGoals?.serviceWorkDays || 22;
      
      if (range === "day") {
        // Daily goal = monthly budget / work days
        companyGoal = workDays > 0 ? monthlyBudget / workDays : 0;
      } else if (range === "week") {
        // Weekly goal = monthly budget / 4 weeks
        companyGoal = monthlyBudget / 4;
      } else if (range === "rolling12") {
        // Sum last 12 months of budgeted goals (spanning year boundaries)
        const priorYear = currentYear - 1;
        const allMonthlyGoals = await db.select().from(monthlyGoals)
          .where(sql`(${monthlyGoals.year} = ${currentYear} AND ${monthlyGoals.month} <= ${currentMonth}) 
                  OR (${monthlyGoals.year} = ${priorYear} AND ${monthlyGoals.month} > ${currentMonth})`);
        companyGoal = allMonthlyGoals.reduce((sum, g) => sum + parseFloat(g.budgetedMonthlySalesGoal || "0"), 0);
      } else {
        // Month - use the monthly budget directly
        companyGoal = monthlyBudget;
      }
      
      const goalProgress = companyGoal > 0 ? (totalSold / companyGoal) * 100 : 0;
      const rolling12Month = parseFloat(rolling12Invoices[0]?.total || "0");

      // 2. Revenue by Department
      const getDepartmentRevenue = async (visitType: string) => {
        const todayRevenue = await db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${crmInvoices.total} AS DECIMAL(10,2))), 0)`,
          })
          .from(crmInvoices)
          .innerJoin(crmWorkOrders, eq(crmInvoices.workOrderId, crmWorkOrders.id))
          .where(and(
            eq(crmWorkOrders.visitType, visitType),
            eq(crmInvoices.status, "paid"),
            sql`${crmInvoices.paidAt} >= ${today}`
          ));

        const mtdRevenue = await db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${crmInvoices.total} AS DECIMAL(10,2))), 0)`,
          })
          .from(crmInvoices)
          .innerJoin(crmWorkOrders, eq(crmInvoices.workOrderId, crmWorkOrders.id))
          .where(and(
            eq(crmWorkOrders.visitType, visitType),
            eq(crmInvoices.status, "paid"),
            sql`${crmInvoices.paidAt} >= ${startOfMonth}`
          ));

        const ytdRevenue = await db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${crmInvoices.total} AS DECIMAL(10,2))), 0)`,
          })
          .from(crmInvoices)
          .innerJoin(crmWorkOrders, eq(crmInvoices.workOrderId, crmWorkOrders.id))
          .where(and(
            eq(crmWorkOrders.visitType, visitType),
            eq(crmInvoices.status, "paid"),
            sql`${crmInvoices.paidAt} >= ${startOfYear}`
          ));

        return {
          today: parseFloat(todayRevenue[0]?.total || "0"),
          mtd: parseFloat(mtdRevenue[0]?.total || "0"),
          ytd: parseFloat(ytdRevenue[0]?.total || "0"),
        };
      };

      const serviceRevenue = await getDepartmentRevenue("SERVICE");
      const installRevenue = await getDepartmentRevenue("INSTALL");
      const maintenanceRevenue = await getDepartmentRevenue("MAINTENANCE");

      const departmentGoals = {
        SERVICE: currentMonthlyGoals ? parseFloat(currentMonthlyGoals.monthlyServiceGoal || "0") : 0,
        INSTALL: currentMonthlyGoals ? parseFloat(currentMonthlyGoals.monthlyInstallGoal || "0") : 0,
        MAINTENANCE: currentMonthlyGoals ? parseFloat(currentMonthlyGoals.monthlyMaintenanceGoal || "0") : 0,
      };

      const revenueByDepartment = {
        SERVICE: { ...serviceRevenue, goal: departmentGoals.SERVICE, goalProgress: departmentGoals.SERVICE > 0 ? (serviceRevenue.mtd / departmentGoals.SERVICE) * 100 : 0 },
        INSTALL: { ...installRevenue, goal: departmentGoals.INSTALL, goalProgress: departmentGoals.INSTALL > 0 ? (installRevenue.mtd / departmentGoals.INSTALL) * 100 : 0 },
        MAINTENANCE: { ...maintenanceRevenue, goal: departmentGoals.MAINTENANCE, goalProgress: departmentGoals.MAINTENANCE > 0 ? (maintenanceRevenue.mtd / departmentGoals.MAINTENANCE) * 100 : 0 },
      };

      // 3. Technician Performance
      // Include tech and supervisor roles for dashboard tech performance
      const techs = await db
        .select()
        .from(crmUsers)
        .where(and(sql`${crmUsers.role} IN ('tech', 'supervisor')`, eq(crmUsers.isActive, true)));

      const techPerformance = await Promise.all(
        techs.map(async (tech) => {
          // Invoice-payment-driven attribution: revenue counts when invoice is paid
          // regardless of work order completion status
          const techWorkOrders = await db
            .select({ id: crmWorkOrders.id })
            .from(crmWorkOrders)
            .where(eq(crmWorkOrders.assignedTechId, tech.id));

          const workOrderIds = techWorkOrders.map(wo => wo.id);
          
          // Get revenue from PAID invoices for this tech's work orders (paid in range)
          // Use paidAt if available, otherwise fall back to updatedAt for legacy invoices
          let serviceRevenue = 0;
          let paidInvoiceCount = 0;
          if (workOrderIds.length > 0) {
            const revenueResult = await db
              .select({
                total: sql<string>`COALESCE(SUM(CAST(${crmInvoices.total} AS DECIMAL(10,2))), 0)`,
                count: sql<number>`COUNT(*)`,
              })
              .from(crmInvoices)
              .where(and(
                inArray(crmInvoices.workOrderId, workOrderIds),
                eq(crmInvoices.status, "paid"),
                sql`COALESCE(${crmInvoices.paidAt}, ${crmInvoices.updatedAt}) >= ${rangeStartDate}`
              ));
            serviceRevenue = parseFloat(revenueResult[0]?.total || "0");
            paidInvoiceCount = Number(revenueResult[0]?.count) || 0;
          }

          // Service jobs = number of paid invoices in the range
          const serviceJobs = paidInvoiceCount;
          const perTicketAvg = serviceJobs > 0 ? serviceRevenue / serviceJobs : 0;
          
          const dailyServiceGoal = currentMonthlyGoals ? parseFloat(currentMonthlyGoals.dailyServiceGoal || "0") : 0;
          const techDailyGoal = techs.length > 0 ? dailyServiceGoal / techs.length : 0;
          const techGoal = techDailyGoal * goalMultiplier;
          const goalMet = serviceRevenue >= techGoal;

          const maintenanceAgreementsCount = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(maintenanceVisits)
            .innerJoin(crmWorkOrders, eq(maintenanceVisits.workOrderId, crmWorkOrders.id))
            .where(and(
              eq(crmWorkOrders.assignedTechId, tech.id),
              eq(maintenanceVisits.status, "completed"),
              sql`${maintenanceVisits.completedAt} >= ${rangeStartDate}`
            ));

          // Get quoted amounts (draft or sent - potential revenue not yet won) for this tech's work orders
          let quotedAmount = 0;
          if (workOrderIds.length > 0) {
            const quotedResult = await db
              .select({
                total: sql<string>`COALESCE(SUM(CAST(${crmQuotes.total} AS DECIMAL(10,2))), 0)`,
              })
              .from(crmQuotes)
              .where(and(
                inArray(crmQuotes.workOrderId, workOrderIds),
                sql`${crmQuotes.status} IN ('draft', 'sent')`,
                sql`${crmQuotes.createdAt} >= ${rangeStartDate}`
              ));
            quotedAmount = parseFloat(quotedResult[0]?.total || "0");
          }

          // Calculate potential: sold + quoted (if no quotes, potential = sold showing 100% conversion)
          // When there's no activity at all, fall back to goal
          const salesOpportunity = serviceRevenue + quotedAmount;
          const potential = salesOpportunity > 0 ? salesOpportunity : techGoal;
          
          return {
            id: tech.id,
            name: tech.name,
            serviceRevenue,
            quotedAmount,
            serviceJobs,
            perTicketAvg,
            maintenanceAgreements: maintenanceAgreementsCount[0]?.count || 0,
            goal: potential,
            goalTarget: techGoal,
            goalProgress: techGoal > 0 ? (serviceRevenue / techGoal) * 100 : 0,
            goalMet,
          };
        })
      );

      // 4. Monthly Revenue for Area Chart (last 12 months)
      const monthlyRevenue: Array<{ month: string; revenue: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        const monthName = monthStart.toLocaleDateString("en-US", { month: "short" });
        
        const monthRevenue = await db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${crmInvoices.total} AS DECIMAL(10,2))), 0)`,
          })
          .from(crmInvoices)
          .where(and(
            eq(crmInvoices.status, "paid"),
            sql`${crmInvoices.paidAt} >= ${monthStart}`,
            sql`${crmInvoices.paidAt} <= ${monthEnd}`
          ));
        
        monthlyRevenue.push({
          month: monthName,
          revenue: parseFloat(monthRevenue[0]?.total || "0"),
        });
      }

      // 5. Projects Overview (last 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const openProjectsCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmProjects)
        .where(inArray(crmProjects.status, ["lead", "proposal_sent", "approved", "in_progress"]));
      
      const completedProjectsCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmProjects)
        .where(and(
          eq(crmProjects.status, "completed"),
          sql`${crmProjects.updatedAt} >= ${thirtyDaysAgo}`
        ));
      
      const recentProjects = await db
        .select({
          id: crmProjects.id,
          name: crmProjects.title,
          status: crmProjects.status,
          projectType: crmProjects.projectType,
          createdAt: crmProjects.createdAt,
        })
        .from(crmProjects)
        .orderBy(desc(crmProjects.createdAt))
        .limit(5);

      // 6. Work Orders Overview (last 30 days)
      const scheduledWoCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmWorkOrders)
        .where(inArray(crmWorkOrders.status, ["scheduled", "dispatched"]));
      
      const completedWoCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmWorkOrders)
        .where(and(
          eq(crmWorkOrders.status, "completed"),
          sql`COALESCE(${crmWorkOrders.completedAt}, ${crmWorkOrders.updatedAt}) >= ${thirtyDaysAgo}`
        ));
      
      const recentWorkOrders = await db
        .select({
          id: crmWorkOrders.id,
          visitType: crmWorkOrders.visitType,
          status: crmWorkOrders.status,
          scheduledStart: crmWorkOrders.scheduledStart,
          createdAt: crmWorkOrders.createdAt,
        })
        .from(crmWorkOrders)
        .orderBy(desc(crmWorkOrders.createdAt))
        .limit(5);

      // 7. Invoices Overview (last 30 days)
      const createdInvoicesCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmInvoices)
        .where(sql`${crmInvoices.createdAt} >= ${thirtyDaysAgo}`);
      
      const sentInvoicesCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmInvoices)
        .where(and(
          eq(crmInvoices.status, "sent"),
          sql`${crmInvoices.createdAt} >= ${thirtyDaysAgo}`
        ));
      
      const pendingInvoicesCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(crmInvoices)
        .where(and(
          eq(crmInvoices.status, "draft"),
          sql`${crmInvoices.createdAt} >= ${thirtyDaysAgo}`
        ));
      
      const recentInvoices = await db
        .select({
          id: crmInvoices.id,
          invoiceNumber: crmInvoices.invoiceNumber,
          total: crmInvoices.total,
          status: crmInvoices.status,
          createdAt: crmInvoices.createdAt,
        })
        .from(crmInvoices)
        .orderBy(desc(crmInvoices.createdAt))
        .limit(5);

      // 8. Sales Team Performance
      const salesUsers = await db
        .select()
        .from(crmUsers)
        .where(and(eq(crmUsers.role, "sales"), eq(crmUsers.isActive, true)));

      const salesPerformance = await Promise.all(
        salesUsers.map(async (salesperson) => {
          const leadsReceived = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(crmCustomers)
            .where(and(
              sql`${crmCustomers.createdAt} >= ${startOfMonth}`,
              eq(crmCustomers.assignedSalesRepId, salesperson.id)
            ));

          const salesVisits = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(crmWorkOrders)
            .where(and(
              eq(crmWorkOrders.assignedTechId, salesperson.id),
              eq(crmWorkOrders.visitType, "SALES"),
              sql`${crmWorkOrders.createdAt} >= ${startOfMonth}`
            ));

          const quotesGenerated = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(crmQuotes)
            .where(and(
              eq(crmQuotes.createdById, salesperson.id),
              sql`${crmQuotes.createdAt} >= ${startOfMonth}`
            ));

          const acceptedQuotes = await db
            .select({
              total: sql<string>`COALESCE(SUM(CAST(${crmQuotes.total} AS DECIMAL(10,2))), 0)`,
              count: sql<number>`COUNT(*)`,
            })
            .from(crmQuotes)
            .where(and(
              eq(crmQuotes.createdById, salesperson.id),
              eq(crmQuotes.status, "accepted"),
              sql`${crmQuotes.createdAt} >= ${startOfMonth}`
            ));

          const totalSalesQuotes = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(crmQuotes)
            .where(and(
              eq(crmQuotes.createdById, salesperson.id),
              sql`${crmQuotes.createdAt} >= ${startOfMonth}`
            ));

          const sentQuotes = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(crmQuotes)
            .where(and(
              eq(crmQuotes.createdById, salesperson.id),
              eq(crmQuotes.status, "sent"),
              sql`${crmQuotes.createdAt} >= ${startOfMonth}`
            ));

          const declinedQuotes = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(crmQuotes)
            .where(and(
              eq(crmQuotes.createdById, salesperson.id),
              eq(crmQuotes.status, "declined"),
              sql`${crmQuotes.createdAt} >= ${startOfMonth}`
            ));

          const acceptedCount = acceptedQuotes[0]?.count || 0;
          const totalQuotes = totalSalesQuotes[0]?.count || 0;
          const avgSaleTotal = parseFloat(acceptedQuotes[0]?.total || "0");
          const averageSale = acceptedCount > 0 ? avgSaleTotal / acceptedCount : 0;
          const closingRate = totalQuotes > 0 ? (acceptedCount / totalQuotes) * 100 : 0;

          return {
            id: salesperson.id,
            name: salesperson.name,
            leadsReceived: leadsReceived[0]?.count || 0,
            salesVisits: salesVisits[0]?.count || 0,
            quotesGenerated: quotesGenerated[0]?.count || 0,
            averageSale,
            closingRate,
            pipeline: {
              won: acceptedCount,
              negotiating: sentQuotes[0]?.count || 0,
              lost: declinedQuotes[0]?.count || 0,
            },
          };
        })
      );

      const analyticsData = {
        range,
        companyOverview: {
          totalQuoted,
          totalSold,
          closeRate,
          companyGoal,
          goalProgress,
          rolling12Month,
        },
        revenueByDepartment,
        monthlyRevenue,
        projectsOverview: {
          open: openProjectsCount[0]?.count || 0,
          completed: completedProjectsCount[0]?.count || 0,
          recent: recentProjects,
        },
        workOrdersOverview: {
          scheduled: scheduledWoCount[0]?.count || 0,
          completed: completedWoCount[0]?.count || 0,
          recent: recentWorkOrders,
        },
        invoicesOverview: {
          created: createdInvoicesCount[0]?.count || 0,
          sent: sentInvoicesCount[0]?.count || 0,
          pending: pendingInvoicesCount[0]?.count || 0,
          recent: recentInvoices,
        },
        techPerformance,
        salesPerformance,
      };
      
      // Cache the result for 30 seconds to speed up subsequent requests
      setCachedAnalytics(cacheKey, analyticsData);
      
      return res.json(analyticsData);
    } catch (error) {
      console.error("Dashboard analytics error:", error);
      return res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ============================================
  // CRM API ENDPOINTS
  // ============================================

  // GET /api/crm/customers - List customers with search, filters, and pagination
  // Queries only from crmCustomers table (single source of truth)
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
        hasAgreement,
        page = "1",
        limit = "25",
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
      const offset = (pageNum - 1) * limitNum;
      const searchTerm = search?.trim().toLowerCase() || "";

      // Build conditions for crmCustomers table
      const conditions: any[] = [];

      if (searchTerm) {
        // Split search into words and require ALL words to match (for multi-word searches like "catherine davis")
        const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
        
        if (searchWords.length > 1) {
          // Multi-word search: ALL words must be found in name OR address
          const wordConditions = searchWords.map(word => {
            const wordPattern = `%${word}%`;
            return sql`(LOWER(${crmCustomers.name}) LIKE ${wordPattern} OR LOWER(${crmCustomers.fullAddress}) LIKE ${wordPattern})`;
          });
          conditions.push(sql`(${sql.join(wordConditions, sql` AND `)})`);
        } else {
          // Single word search: match in any field
          const searchPattern = `%${searchTerm}%`;
          conditions.push(
            sql`(LOWER(${crmCustomers.name}) LIKE ${searchPattern} OR LOWER(${crmCustomers.email}) LIKE ${searchPattern} OR ${crmCustomers.phone} LIKE ${searchPattern} OR LOWER(${crmCustomers.fullAddress}) LIKE ${searchPattern})`
          );
        }
      }

      if (customerType && customerType !== "all") {
        conditions.push(sql`LOWER(${crmCustomers.customerType}) = LOWER(${customerType})`);
      }

      if (customerStatus && customerStatus !== "all") {
        conditions.push(sql`LOWER(${crmCustomers.customerStatus}) = LOWER(${customerStatus})`);
      }

      // Filter customers who have at least one agreement
      if (hasAgreement === "true") {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM crm_agreements WHERE crm_agreements.customer_id = ${crmCustomers.id})`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmCustomers)
        .where(whereClause);
      
      const total = Number(countResult?.count) || 0;

      // Get paginated results
      const customerResults = await db
        .select()
        .from(crmCustomers)
        .where(whereClause)
        .orderBy(desc(crmCustomers.createdAt))
        .limit(limitNum)
        .offset(offset);

      // Transform results
      const transformedCustomers = customerResults.map(c => ({
        id: c.id,
        name: c.name,
        customerType: c.customerType,
        customerStatus: c.customerStatus,
        fullAddress: c.fullAddress,
        phone: c.phone,
        email: c.email,
        leadSource: c.leadSource,
        createdAt: c.createdAt,
        salesStage: c.salesStage,
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

  // GET /api/crm/customers/stats - Get customer counts by status (from crmCustomers only)
  app.get("/api/crm/customers/stats", requireCrmAuth, async (req, res) => {
    try {
      const [prospectsResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmCustomers)
        .where(sql`LOWER(${crmCustomers.customerStatus}) = 'prospect'`);
      
      const [customersResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmCustomers)
        .where(sql`LOWER(${crmCustomers.customerStatus}) = 'customer'`);
      
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmCustomers);

      // Count customers with at least one agreement
      const [withAgreementsResult] = await db
        .select({ count: sql<number>`count(DISTINCT ${crmCustomers.id})` })
        .from(crmCustomers)
        .innerJoin(crmAgreements, eq(crmAgreements.customerId, crmCustomers.id));

      return res.json({
        prospects: Number(prospectsResult?.count || 0),
        customers: Number(customersResult?.count || 0),
        total: Number(totalResult?.count || 0),
        withAgreements: Number(withAgreementsResult?.count || 0),
      });
    } catch (error) {
      console.error("Error fetching customer stats:", error);
      return res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // GET /api/crm/customers/merged - List customers from both CRM database and FieldEdge Google Sheet
  // Returns unified list with source metadata for each customer
  app.get("/api/crm/customers/merged", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        search,
        customerType,
        customerStatus,
        source,
        page = "1",
        limit = "25",
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
      const searchTerm = search?.trim().toLowerCase() || "";

      // Get CRM customers from database
      const crmConditions: any[] = [];

      if (searchTerm) {
        const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
        if (searchWords.length > 1) {
          const wordConditions = searchWords.map(word => {
            const wordPattern = `%${word}%`;
            return sql`(LOWER(${crmCustomers.name}) LIKE ${wordPattern} OR LOWER(${crmCustomers.fullAddress}) LIKE ${wordPattern})`;
          });
          crmConditions.push(sql`(${sql.join(wordConditions, sql` AND `)})`);
        } else {
          const searchPattern = `%${searchTerm}%`;
          crmConditions.push(
            sql`(LOWER(${crmCustomers.name}) LIKE ${searchPattern} OR LOWER(${crmCustomers.email}) LIKE ${searchPattern} OR ${crmCustomers.phone} LIKE ${searchPattern} OR LOWER(${crmCustomers.fullAddress}) LIKE ${searchPattern})`
          );
        }
      }

      if (customerType && customerType !== "all") {
        crmConditions.push(sql`LOWER(${crmCustomers.customerType}) = LOWER(${customerType})`);
      }

      if (customerStatus && customerStatus !== "all") {
        crmConditions.push(sql`LOWER(${crmCustomers.customerStatus}) = LOWER(${customerStatus})`);
      }

      const whereClause = crmConditions.length > 0 ? and(...crmConditions) : undefined;

      // Get all CRM customers (we'll paginate the merged list)
      const crmResults = await db
        .select()
        .from(crmCustomers)
        .where(whereClause)
        .orderBy(desc(crmCustomers.createdAt));

      // Transform CRM customers with source tag
      const crmCustomerList = crmResults.map(c => ({
        id: c.id,
        name: c.name,
        customerType: c.customerType,
        customerStatus: c.customerStatus,
        fullAddress: c.fullAddress,
        phone: c.phone,
        email: c.email,
        leadSource: c.leadSource,
        createdAt: c.createdAt,
        salesStage: c.salesStage,
        source: 'crm' as const,
      }));

      // Get FieldEdge customers from cache
      let fieldEdgeResults = fieldEdgeCustomerService.getCustomers();

      // Apply filters to FieldEdge customers
      if (searchTerm) {
        fieldEdgeResults = fieldEdgeResults.filter(c => {
          const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
          if (searchWords.length > 1) {
            return searchWords.every(word =>
              c.displayName.toLowerCase().includes(word) ||
              c.fullAddress?.toLowerCase().includes(word)
            );
          }
          return c.displayName.toLowerCase().includes(searchTerm) ||
            c.email?.toLowerCase().includes(searchTerm) ||
            c.phone?.includes(searchTerm) ||
            c.fullAddress?.toLowerCase().includes(searchTerm);
        });
      }

      if (customerType && customerType !== "all") {
        fieldEdgeResults = fieldEdgeResults.filter(c =>
          c.customerType?.toLowerCase() === customerType.toLowerCase()
        );
      }

      if (customerStatus && customerStatus !== "all") {
        fieldEdgeResults = fieldEdgeResults.filter(c =>
          c.customerStatus.toLowerCase() === customerStatus.toLowerCase()
        );
      }

      // Transform FieldEdge customers to match CRM customer format
      const fieldEdgeCustomerList = fieldEdgeResults.map(c => ({
        id: c.id,
        name: c.displayName,
        customerType: c.customerType,
        customerStatus: c.customerStatus,
        fullAddress: c.fullAddress,
        phone: c.phone,
        email: c.email,
        leadSource: c.leadSource,
        createdAt: c.createdAt,
        salesStage: null,
        source: 'fieldedge' as const,
      }));

      // Helper to normalize phone numbers for comparison (digits only)
      const normalizePhone = (phone: string | null): string => {
        if (!phone) return '';
        return phone.replace(/\D/g, '');
      };

      // Merge and deduplicate based on matching criteria
      // CRM customers take priority - remove FieldEdge duplicates
      const crmPhones = new Set(crmCustomerList.map(c => normalizePhone(c.phone)).filter(p => p.length >= 10));
      const crmEmails = new Set(crmCustomerList.map(c => c.email?.toLowerCase().trim()).filter(Boolean));
      const crmNames = new Set(crmCustomerList.map(c => c.name.toLowerCase().trim()));

      const uniqueFieldEdge = fieldEdgeCustomerList.filter(feCustomer => {
        // Check if this FieldEdge customer exists in CRM by normalized phone, email, or exact name match
        const normalizedPhone = normalizePhone(feCustomer.phone);
        if (normalizedPhone.length >= 10 && crmPhones.has(normalizedPhone)) return false;
        if (feCustomer.email && crmEmails.has(feCustomer.email.toLowerCase().trim())) return false;
        if (crmNames.has(feCustomer.name.toLowerCase().trim())) return false;
        return true;
      });

      // Combine lists - CRM first, then FieldEdge
      let allCustomers = [...crmCustomerList, ...uniqueFieldEdge];

      // Filter by source if specified
      if (source === 'crm') {
        allCustomers = allCustomers.filter(c => c.source === 'crm');
      } else if (source === 'fieldedge') {
        allCustomers = allCustomers.filter(c => c.source === 'fieldedge');
      }

      // Sort by name
      allCustomers.sort((a, b) => a.name.localeCompare(b.name));

      const total = allCustomers.length;
      const offset = (pageNum - 1) * limitNum;
      const paginatedCustomers = allCustomers.slice(offset, offset + limitNum);

      // Get cache status
      const cacheStatus = fieldEdgeCustomerService.getCacheStatus();

      return res.json({
        customers: paginatedCustomers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        sources: {
          crm: { count: crmCustomerList.length },
          fieldedge: {
            count: uniqueFieldEdge.length,
            lastRefresh: cacheStatus.lastFetchTime,
            error: cacheStatus.error,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching merged customers:", error);
      return res.status(500).json({ message: "Failed to fetch customers" });
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
      autoSyncCustomer(customer.id);
      
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

  // POST /api/crm/customers/create-with-property - Create customer with property in one call
  app.post("/api/crm/customers/create-with-property", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { customer: customerData, property: propertyData } = req.body;

      if (!customerData?.name) {
        return res.status(400).json({ message: "Customer name is required" });
      }

      // Create customer
      const [newCustomer] = await db.insert(crmCustomers).values({
        name: customerData.name,
        companyName: customerData.companyName || null,
        email: customerData.email || null,
        phone: customerData.phone || null,
        customerType: customerData.customerType || "residential",
        customerStatus: customerData.customerStatus || "prospect",
        fullAddress: customerData.fullAddress || null,
        leadSource: customerData.leadSource || null,
        notes: customerData.notes || null,
        salesStage: customerData.salesStage || null,
        interestLevel: customerData.interestLevel || null,
        potentialValue: customerData.potentialValue && !isNaN(Number(customerData.potentialValue)) ? parseInt(String(customerData.potentialValue), 10) : null,
        assignedSalesRepId: customerData.assignedSalesRepId || null,
      }).returning();
      autoSyncCustomer(newCustomer.id);

      // Create property if provided
      let newProperty = null;
      if (propertyData?.address1 && propertyData?.city && propertyData?.state && propertyData?.zip) {
        // Auto-set property type based on customer type (unless manually specified)
        // Property managers require manual selection per-property
        const custType = (customerData.customerType || "").toLowerCase();
        const autoPropertyType = (custType === "residential" || custType === "commercial")
          ? custType
          : null;
        
        const [property] = await db.insert(crmProperties).values({
          customerId: newCustomer.id,
          address1: propertyData.address1,
          address2: propertyData.address2 || null,
          city: propertyData.city,
          state: propertyData.state,
          zip: propertyData.zip,
          notes: propertyData.notes || null,
          propertyType: propertyData.propertyType || autoPropertyType,
        }).returning();
        newProperty = property;
      }

      await logCrmAudit(
        user.id,
        "customer.created",
        "customer",
        newCustomer.id,
        { name: newCustomer.name, hasProperty: !!newProperty },
        req.ip
      );

      return res.status(201).json({
        customer: newCustomer,
        property: newProperty,
      });
    } catch (error) {
      console.error("Error creating customer with property:", error);
      return res.status(500).json({ message: "Failed to create customer" });
    }
  });

  // GET /api/crm/customers/:id - Get single customer from crmCustomers table
  app.get("/api/crm/customers/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;

      // Check crmCustomers table first (primary source)
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

      // Check FieldEdge cache for customers from Google Sheets
      if (customerId.startsWith('fieldedge-')) {
        const fieldEdgeCustomer = fieldEdgeCustomerService.getCustomerById(customerId);
        if (fieldEdgeCustomer) {
          return res.json({
            id: fieldEdgeCustomer.id,
            name: fieldEdgeCustomer.displayName,
            companyName: null,
            customerType: fieldEdgeCustomer.customerType,
            customerStatus: fieldEdgeCustomer.customerStatus,
            phone: fieldEdgeCustomer.phone,
            email: fieldEdgeCustomer.email,
            notes: null,
            fullAddress: fieldEdgeCustomer.fullAddress,
            leadSource: fieldEdgeCustomer.leadSource,
            createdAt: fieldEdgeCustomer.createdAt,
            origin: 'fieldedge' as const,
            source: 'fieldedge' as const,
          });
        }
      }

      // Fall back to legacy customers table for older records
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

  // PATCH /api/crm/customers/:id - Update customer (including prospect conversion)
  app.patch("/api/crm/customers/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const customerId = req.params.id;
      const { 
        name, customerType, customerStatus, phone, email, fullAddress, leadSource,
        salesStage, potentialValue, assignedSalesRepId, interestLevel 
      } = req.body;

      // Check if user can change customerType (only admin/owner)
      const canChangeType = ["admin", "owner"].includes(user.role);

      // Check crmCustomers table first (primary source)
      const [existingCrmCustomer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
      if (existingCrmCustomer) {
        // Check if converting to prospect and already a prospect
        if (customerStatus === "prospect" && existingCrmCustomer.customerStatus === "prospect") {
          return res.status(400).json({ message: "This customer is already in the prospect funnel" });
        }

        const updateData: any = {};
        
        // Only update name if provided
        if (name && typeof name === 'string' && name.trim()) {
          updateData.name = name.trim();
        }
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (customerStatus) updateData.customerStatus = customerStatus;
        if (fullAddress !== undefined) updateData.fullAddress = fullAddress;
        if (leadSource !== undefined) updateData.leadSource = leadSource;
        
        // Prospect-related fields
        if (salesStage !== undefined) updateData.salesStage = salesStage;
        if (potentialValue !== undefined) updateData.potentialValue = potentialValue;
        if (assignedSalesRepId !== undefined) updateData.assignedSalesRepId = assignedSalesRepId;
        if (interestLevel !== undefined) updateData.interestLevel = interestLevel;
        
        if (canChangeType && customerType) {
          updateData.customerType = customerType;
        }

        await db.update(crmCustomers)
          .set(updateData)
          .where(eq(crmCustomers.id, customerId));
        autoSyncCustomer(customerId);

        const auditDetails = name ? { name: name.trim() } : { customerId };
        await logCrmAudit(user.id, "customer.updated", "customer", customerId, auditDetails, req.ip);
        return res.json({ success: true, origin: 'crm_customers' });
      }

      // Fall back to legacy customers table
      const [existingLegacy] = await db.select().from(customers).where(eq(customers.id, customerId));
      if (existingLegacy) {
        // Check if converting to prospect and already a prospect
        if (customerStatus === "prospect" && existingLegacy.customerStatus === "prospect") {
          return res.status(400).json({ message: "This customer is already in the prospect funnel" });
        }

        const updateData: any = {};
        
        // Only update displayName if provided
        if (name && typeof name === 'string' && name.trim()) {
          updateData.displayName = name.trim();
        }
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (customerStatus) updateData.customerStatus = customerStatus;
        if (fullAddress !== undefined) updateData.fullAddress = fullAddress;
        if (leadSource !== undefined) updateData.leadSource = leadSource;
        
        // Note: legacy customers table may not have prospect fields
        // but we still accept them for API compatibility
        
        if (canChangeType && customerType) {
          updateData.customerType = customerType;
        }

        await db.update(customers)
          .set(updateData)
          .where(eq(customers.id, customerId));

        const auditDetails = name ? { name: name.trim() } : { customerId };
        await logCrmAudit(user.id, "customer.updated", "customer", customerId, auditDetails, req.ip);
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

      // Get invoices for this job via work orders
      const woIds = workOrders.map(wo => wo.id);
      let invoices: any[] = [];
      if (woIds.length > 0) {
        invoices = await db.select()
          .from(crmInvoices)
          .where(inArray(crmInvoices.workOrderId, woIds))
          .orderBy(crmInvoices.createdAt);
      }

      // Get quotes for this job via work orders
      let quotes: any[] = [];
      if (woIds.length > 0) {
        quotes = await db.select()
          .from(crmQuotes)
          .where(inArray(crmQuotes.workOrderId, woIds))
          .orderBy(crmQuotes.createdAt);
      }

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
            return res.status(400).json({ message: "Location not found or doesn't belong to account" });
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

  // GET /api/crm/technicians - List field workers for dispatch (techs, sales, and supervisors who do field work)
  app.get("/api/crm/technicians", requireCrmAuth, async (req, res) => {
    try {
      // Include tech, sales, and supervisor roles - they all do field work
      const technicians = await db.select({
        id: crmUsers.id,
        name: crmUsers.name,
        email: crmUsers.email,
        role: crmUsers.role,
      }).from(crmUsers)
        .where(and(
          sql`${crmUsers.role} IN ('tech', 'sales', 'supervisor')`,
          eq(crmUsers.isActive, true)
        ))
        .orderBy(crmUsers.name);
      return res.json(technicians);
    } catch (error) {
      console.error("Error fetching technicians:", error);
      return res.status(500).json({ message: "Failed to fetch technicians" });
    }
  });

  // GET /api/crm/users/by-role - List users filtered by role for quote assignment
  // Supports: exactRole (single role) or minRole (role and above in hierarchy)
  // Role hierarchy: owner > admin > sales > tech
  app.get("/api/crm/users/by-role", requireCrmAuth, async (req, res) => {
    try {
      const { minRole, exactRole } = req.query as { minRole?: string; exactRole?: string };
      
      // Define role hierarchy
      const roleHierarchy: Record<string, string[]> = {
        owner: ["owner"],
        admin: ["owner", "admin"],
        sales: ["owner", "admin", "sales"],
        tech: ["owner", "admin", "sales", "tech"],
      };
      
      let allowedRoles: string[];
      
      // exactRole takes precedence - filter by exact role only
      if (exactRole) {
        allowedRoles = [exactRole];
      } else if (minRole && roleHierarchy[minRole]) {
        allowedRoles = roleHierarchy[minRole];
      } else {
        allowedRoles = ["owner", "admin", "sales", "tech"];
      }
      
      const users = await db.select({
        id: crmUsers.id,
        displayName: crmUsers.name,
        email: crmUsers.email,
        role: crmUsers.role,
      }).from(crmUsers)
        .where(and(
          sql`${crmUsers.role} IN (${sql.raw(allowedRoles.map(r => `'${r}'`).join(', '))})`,
          eq(crmUsers.isActive, true)
        ))
        .orderBy(crmUsers.name);
      
      return res.json(users);
    } catch (error) {
      console.error("Error fetching users by role:", error);
      return res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // GET /api/crm/users - List users (all CRM users can view, but only admins can modify)
  app.get("/api/crm/users", requireCrmAuth, async (req, res) => {
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
        role: role || "tech",
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

  // PATCH /api/crm/users/:id/activate - Reactivate user (ADMIN only)
  app.patch("/api/crm/users/:id/activate", requireCrmAdmin, async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      const userId = req.params.id;

      const [user] = await db.select().from(crmUsers).where(eq(crmUsers.id, userId));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const [updatedUser] = await db.update(crmUsers).set({ isActive: true }).where(eq(crmUsers.id, userId)).returning();

      await logCrmAudit(
        currentUser?.id || null,
        "user.activated",
        "user",
        userId,
        { name: user.name, email: user.email },
        req.ip
      );

      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error activating CRM user:", error);
      return res.status(500).json({ message: "Failed to activate user" });
    }
  });

  // PATCH /api/crm/users/:id - Update user (ADMIN only)
  app.patch("/api/crm/users/:id", requireCrmAdmin, async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      const userId = req.params.id;
      const { name, email, phone, role } = req.body;

      const [existingUser] = await db.select().from(crmUsers).where(eq(crmUsers.id, userId));
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate role if provided
      const validRoles = ["owner", "admin", "supervisor", "sales", "tech"];
      if (role && !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be one of: owner, admin, supervisor, sales, tech" });
      }

      // Only owner can change roles
      if (role && role !== existingUser.role) {
        if (currentUser?.role !== "owner") {
          return res.status(403).json({ message: "Only owners can change user roles" });
        }
      }

      // Prevent demoting the last owner
      if (existingUser.role === "owner" && role && role !== "owner") {
        const ownerCount = await db.select({ count: count() }).from(crmUsers).where(
          and(eq(crmUsers.role, "owner"), eq(crmUsers.isActive, true))
        );
        if (ownerCount[0].count <= 1) {
          return res.status(400).json({ message: "Cannot change role of the last owner" });
        }
      }

      // Check if email is already taken by another user
      if (email && email.toLowerCase() !== existingUser.email) {
        const emailExists = await getCrmUserByEmail(email);
        if (emailExists) {
          return res.status(400).json({ message: "Email is already in use by another user" });
        }
      }

      const updateData: { name?: string; email?: string; phone?: string | null; role?: "owner" | "admin" | "supervisor" | "sales" | "tech" } = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email.toLowerCase();
      if (phone !== undefined) updateData.phone = phone || null;
      if (role) updateData.role = role as "owner" | "admin" | "supervisor" | "sales" | "tech";

      const [updatedUser] = await db.update(crmUsers).set(updateData).where(eq(crmUsers.id, userId)).returning();

      await logCrmAudit(
        currentUser?.id || null,
        "user.updated",
        "user",
        userId,
        { changes: updateData, previousRole: existingUser.role },
        req.ip
      );

      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating CRM user:", error);
      return res.status(500).json({ message: "Failed to update user" });
    }
  });

  // DELETE /api/crm/users/:id/permanent - Permanently delete user (OWNER only)
  // This removes the user and all associated records
  app.delete("/api/crm/users/:id/permanent", requireCrmAdmin, async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      const userId = req.params.id;

      // Only owners can permanently delete users
      if (currentUser?.role !== "owner") {
        return res.status(403).json({ message: "Only owners can permanently delete users" });
      }

      // Cannot delete yourself
      if (currentUser?.id === userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      const [userToDelete] = await db.select().from(crmUsers).where(eq(crmUsers.id, userId));
      if (!userToDelete) {
        return res.status(404).json({ message: "User not found" });
      }

      // Cannot delete another owner
      if (userToDelete.role === "owner") {
        return res.status(400).json({ message: "Cannot delete an owner account. Demote them first." });
      }

      // Count associated records for the response
      const workOrderCount = await db.select({ count: count() }).from(crmWorkOrders)
        .where(eq(crmWorkOrders.assignedTechId, userId));
      const invoiceCount = await db.select({ count: count() }).from(crmInvoices)
        .where(eq(crmInvoices.createdBy, userId));

      // Begin cascade deletion - order matters for foreign key constraints
      // 1. Delete job assignments (has notNull constraint on techUserId)
      await db.delete(crmJobAssignments).where(eq(crmJobAssignments.techUserId, userId));

      // 2. Nullify work order references (don't delete the work orders, just unassign)
      await db.update(crmWorkOrders)
        .set({ assignedTechId: null })
        .where(eq(crmWorkOrders.assignedTechId, userId));

      // 3. Nullify invoice created_by references
      await db.update(crmInvoices)
        .set({ createdBy: null })
        .where(eq(crmInvoices.createdBy, userId));

      // 4. Nullify quote created_by references
      await db.update(crmQuotes)
        .set({ createdBy: null })
        .where(eq(crmQuotes.createdBy, userId));

      // 5. Nullify follow-ups (assignedUserId and createdBy)
      await db.update(crmFollowUps)
        .set({ assignedUserId: null })
        .where(eq(crmFollowUps.assignedUserId, userId));
      await db.update(crmFollowUps)
        .set({ createdBy: null })
        .where(eq(crmFollowUps.createdBy, userId));

      // 6. Nullify customer notes author (userId column)
      await db.update(crmCustomerNotes)
        .set({ userId: null })
        .where(eq(crmCustomerNotes.userId, userId));

      // 7. Nullify audit log references
      await db.update(crmAuditLog)
        .set({ actorUserId: null })
        .where(eq(crmAuditLog.actorUserId, userId));

      // 8. Nullify checklist responses completed by this user
      await db.update(workOrderChecklistResponses)
        .set({ completedBy: null })
        .where(eq(workOrderChecklistResponses.completedBy, userId));

      // 9. Nullify job status events (userId)
      await db.update(crmJobStatusEvents)
        .set({ userId: null })
        .where(eq(crmJobStatusEvents.userId, userId));

      // 10. Nullify project activities (userId)
      await db.update(projectActivities)
        .set({ userId: null })
        .where(eq(projectActivities.userId, userId));

      // 11. Nullify proposal sessions (createdBy)
      await db.update(proposalSessions)
        .set({ createdBy: null })
        .where(eq(proposalSessions.createdBy, userId));

      // 12. Nullify job notes (userId)
      await db.update(crmJobNotes)
        .set({ userId: null })
        .where(eq(crmJobNotes.userId, userId));

      // 13. Nullify attachments (uploadedBy)
      await db.update(attachments)
        .set({ uploadedBy: null })
        .where(eq(attachments.uploadedBy, userId));

      // 14. Delete the user (crmSessions cascade deleted automatically)
      await db.delete(crmUsers).where(eq(crmUsers.id, userId));

      // Log the permanent deletion
      await logCrmAudit(
        currentUser?.id || null,
        "user.permanently_deleted",
        "user",
        userId,
        { 
          name: userToDelete.name, 
          email: userToDelete.email, 
          role: userToDelete.role,
          workOrdersUnassigned: workOrderCount[0].count,
          invoicesOrphaned: invoiceCount[0].count 
        },
        req.ip
      );

      // Get updated tech count for the response
      const techCount = await db.select({ count: count() }).from(crmUsers)
        .where(and(eq(crmUsers.role, "tech"), eq(crmUsers.isActive, true)));

      return res.json({ 
        message: "User permanently deleted", 
        deletedUser: { name: userToDelete.name, email: userToDelete.email },
        technicianCount: techCount[0].count 
      });
    } catch (error) {
      console.error("Error permanently deleting CRM user:", error);
      return res.status(500).json({ message: "Failed to permanently delete user" });
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

      // Get field users (tech and sales only - owner and admin are office roles)
      const technicians = await db.select({
        id: crmUsers.id,
        name: crmUsers.name,
        email: crmUsers.email,
        role: crmUsers.role,
      }).from(crmUsers).where(
        and(
          sql`${crmUsers.role} IN ('tech', 'sales')`,
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

      // Get job IDs to count work orders through jobs
      const jobIds = await db
        .select({ id: crmJobs.id })
        .from(crmJobs)
        .where(or(
          eq(crmJobs.customerId, customerId),
          eq(crmJobs.accountId, customerId)
        ));

      // Count work orders - both directly linked to customer AND through jobs
      let workOrderCount = 0;
      if (jobIds.length > 0) {
        const jobIdArray = jobIds.map(j => j.id);
        const workOrdersResult = await db.execute(
          sql`SELECT count(*) as count FROM crm_work_orders WHERE customer_id = ${customerId} OR job_id = ANY(${jobIdArray}::uuid[])`
        );
        workOrderCount = Number(workOrdersResult.rows?.[0]?.count || 0);
      } else {
        const workOrdersResult = await db.execute(
          sql`SELECT count(*) as count FROM crm_work_orders WHERE customer_id = ${customerId}`
        );
        workOrderCount = Number(workOrdersResult.rows?.[0]?.count || 0);
      }

      // Count quotes linked to this customer (check both account_id and customer_id)
      const quotesResult = await db.execute(
        sql`SELECT count(*) as count FROM crm_quotes WHERE account_id = ${customerId} OR customer_id = ${customerId}`
      );
      const quoteCount = Number(quotesResult.rows?.[0]?.count || 0);

      // Count invoices linked to this customer
      const invoicesResult = await db.execute(
        sql`SELECT count(*) as count FROM crm_invoices WHERE customer_id = ${customerId}`
      );
      const invoiceCount = Number(invoicesResult.rows?.[0]?.count || 0);

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

      // Check if user has owner/admin/sales role (sales has manager-level access)
      if (!["owner", "admin", "sales"].includes(user.role)) {
        return res.status(403).json({ message: "Forbidden - Owner, admin, or sales role required" });
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

      // Get job IDs to count work orders through jobs
      const jobIds = await db
        .select({ id: crmJobs.id })
        .from(crmJobs)
        .where(or(
          eq(crmJobs.customerId, customerId),
          eq(crmJobs.accountId, customerId)
        ));

      // Count work orders - both directly linked to customer AND through jobs
      let workOrderCount = 0;
      if (jobIds.length > 0) {
        const jobIdArray = jobIds.map(j => j.id);
        const workOrdersResult = await db.execute(
          sql`SELECT count(*) as count FROM crm_work_orders WHERE customer_id = ${customerId} OR job_id = ANY(${jobIdArray}::uuid[])`
        );
        workOrderCount = Number(workOrdersResult.rows?.[0]?.count || 0);
      } else {
        const workOrdersResult = await db.execute(
          sql`SELECT count(*) as count FROM crm_work_orders WHERE customer_id = ${customerId}`
        );
        workOrderCount = Number(workOrdersResult.rows?.[0]?.count || 0);
      }

      // Count quotes linked to this customer (check both account_id and customer_id)
      const quotesResult = await db.execute(
        sql`SELECT count(*) as count FROM crm_quotes WHERE account_id = ${customerId} OR customer_id = ${customerId}`
      );
      const quoteCount = Number(quotesResult.rows?.[0]?.count || 0);

      // Count invoices using raw SQL (database uses customer_id column)  
      const invoicesResult = await db.execute(
        sql`SELECT count(*) as count FROM crm_invoices WHERE customer_id = ${customerId}`
      );
      const invoiceCount = Number(invoicesResult.rows?.[0]?.count || 0);

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
          // Delete related properties first (foreign key constraint)
          await db.delete(crmProperties).where(eq(crmProperties.customerId, customerId));
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
  // CRM GHQ UNIVERSAL SEARCH ENDPOINT
  // ============================================

  // GET /api/crm/ghq/search - Universal search across CRM tables with AI enhancement
  app.get("/api/crm/ghq/search", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const query = (req.query.q as string)?.trim();
      const aiRequested = req.query.ai !== "false"; // AI enabled by default
      
      if (!query || query.length < 2) {
        const emptyCategory = { items: [], total: 0, hasMore: false };
        return res.json({
          query: query || "",
          results: {
            customers: emptyCategory,
            workOrders: emptyCategory,
            invoices: emptyCategory,
            quotes: emptyCategory,
            agreements: emptyCategory,
            notes: emptyCategory,
            projects: emptyCategory
          },
          totalCount: 0,
          aiEnhanced: false
        });
      }

      // AI-enhanced search (only if enabled)
      let searchPatterns: string[] = [`%${query}%`];
      let aiIntent: { expandedTerms: string[]; intent: string } | null = null;
      let aiEnhanced = false;

      if (aiRequested) {
        try {
          const { interpretSearchIntent, buildExpandedSearchPatterns } = await import("./services/ghqSearchAI");
          aiIntent = await interpretSearchIntent(query);
          if (aiIntent) {
            searchPatterns = buildExpandedSearchPatterns(aiIntent);
            aiEnhanced = true;
            console.log(`[GHQ AI] Query "${query}" expanded to: ${searchPatterns.join(", ")}`);
          }
        } catch (aiError) {
          console.error("[GHQ AI] Falling back to basic search:", aiError);
        }
      }

      const LIMIT = 5;

      // Helper to build OR conditions across all search patterns for a field
      const buildPatternConditions = (field: any) => {
        const conditions = searchPatterns.map(pattern => ilike(field, pattern));
        if (conditions.length === 0) return ilike(field, `%${query}%`);
        if (conditions.length === 1) return conditions[0];
        return or(...conditions);
      };

      // Helper to count total matches for hasMore flag
      const countMatches = async (table: any, conditions: any): Promise<number> => {
        const result = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(conditions);
        return result[0]?.count || 0;
      };

      // Helper to create snippet from matched text
      const createSnippet = (text: string | null, maxLen = 100): string => {
        if (!text) return "";
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const idx = lowerText.indexOf(lowerQuery);
        if (idx === -1) return text.substring(0, maxLen);
        const start = Math.max(0, idx - 20);
        const end = Math.min(text.length, idx + query.length + 80);
        let snippet = text.substring(start, end);
        if (start > 0) snippet = "..." + snippet;
        if (end < text.length) snippet = snippet + "...";
        return snippet;
      };

      // Helper to determine which field matched
      const findMatchField = (record: Record<string, any>, fields: string[]): string => {
        const lowerQuery = query.toLowerCase();
        for (const field of fields) {
          const value = record[field];
          if (value && String(value).toLowerCase().includes(lowerQuery)) {
            return field;
          }
        }
        return fields[0];
      };

      // 1. Search crmCustomers (using all expanded patterns)
      const customerCondition = or(
        buildPatternConditions(crmCustomers.name),
        buildPatternConditions(crmCustomers.companyName),
        buildPatternConditions(crmCustomers.email),
        buildPatternConditions(crmCustomers.phone)
      );
      const customerResults = await db
        .select({
          id: crmCustomers.id,
          name: crmCustomers.name,
          companyName: crmCustomers.companyName,
          email: crmCustomers.email,
          phone: crmCustomers.phone,
        })
        .from(crmCustomers)
        .where(customerCondition)
        .limit(LIMIT);
      const customerCount = await countMatches(crmCustomers, customerCondition);

      // 2. Search crmAccounts (uses displayName and companyName - no email/phone in this table)
      const accountCondition = or(
        buildPatternConditions(crmAccounts.displayName),
        buildPatternConditions(crmAccounts.companyName)
      );
      const accountResults = await db
        .select({
          id: crmAccounts.id,
          name: crmAccounts.displayName,
          companyName: crmAccounts.companyName,
        })
        .from(crmAccounts)
        .where(accountCondition)
        .limit(LIMIT);
      const accountCount = await countMatches(crmAccounts, accountCondition);
      const totalCustomerCount = customerCount + accountCount;

      // Combine customers from both tables, dedupe by id, limit to 5
      const allCustomers = [
        ...customerResults.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          matchField: findMatchField(c, ['name', 'companyName', 'email', 'phone']),
          snippet: createSnippet(c.name || c.companyName || c.email)
        })),
        ...accountResults.map(a => ({
          id: a.id,
          name: a.name,
          email: null,
          phone: null,
          matchField: findMatchField({ name: a.name, companyName: a.companyName }, ['name', 'companyName']),
          snippet: createSnippet(a.name || a.companyName)
        }))
      ].slice(0, LIMIT);

      // 3. Search crmWorkOrders
      const workOrderCondition = or(
        buildPatternConditions(crmWorkOrders.title),
        buildPatternConditions(crmWorkOrders.description),
        buildPatternConditions(crmWorkOrders.techNotes),
        buildPatternConditions(crmWorkOrders.completionSummary),
        ...searchPatterns.map(pattern => sql`CAST(${crmWorkOrders.workOrderNumber} AS TEXT) ILIKE ${pattern}`)
      );
      const workOrderResults = await db
        .select({
          id: crmWorkOrders.id,
          workOrderNumber: crmWorkOrders.workOrderNumber,
          title: crmWorkOrders.title,
          description: crmWorkOrders.description,
          techNotes: crmWorkOrders.techNotes,
          completionSummary: crmWorkOrders.completionSummary,
          status: crmWorkOrders.status,
          customerId: crmWorkOrders.customerId,
        })
        .from(crmWorkOrders)
        .where(workOrderCondition)
        .limit(LIMIT);
      const workOrderCount = await countMatches(crmWorkOrders, workOrderCondition);

      // Get customer names for work orders
      const woCustomerIds = workOrderResults.map(wo => wo.customerId).filter(Boolean) as string[];
      const woCustomerMap = new Map<string, string>();
      if (woCustomerIds.length > 0) {
        const woCustomers = await db.select({ id: crmCustomers.id, name: crmCustomers.name })
          .from(crmCustomers).where(inArray(crmCustomers.id, woCustomerIds));
        woCustomers.forEach(c => woCustomerMap.set(c.id, c.name));
      }

      const workOrders = workOrderResults.map(wo => {
        const matchField = findMatchField(
          { title: wo.title, description: wo.description, techNotes: wo.techNotes, completionSummary: wo.completionSummary, workOrderNumber: String(wo.workOrderNumber) },
          ['title', 'description', 'techNotes', 'completionSummary', 'workOrderNumber']
        );
        const matchValue = matchField === 'workOrderNumber' ? String(wo.workOrderNumber) : (wo as any)[matchField];
        return {
          id: wo.id,
          workOrderNumber: wo.workOrderNumber,
          title: wo.title,
          customerName: wo.customerId ? woCustomerMap.get(wo.customerId) || null : null,
          status: wo.status,
          matchField,
          snippet: createSnippet(matchValue)
        };
      });

      // 4. Search crmInvoices
      const invoiceCondition = or(
        buildPatternConditions(crmInvoices.invoiceNumber),
        buildPatternConditions(crmInvoices.notes)
      );
      const invoiceResults = await db
        .select({
          id: crmInvoices.id,
          invoiceNumber: crmInvoices.invoiceNumber,
          notes: crmInvoices.notes,
          status: crmInvoices.status,
          total: crmInvoices.total,
          customerId: crmInvoices.customerId,
        })
        .from(crmInvoices)
        .where(invoiceCondition)
        .limit(LIMIT);
      const invoiceCount = await countMatches(crmInvoices, invoiceCondition);

      // Get customer names for invoices
      const invCustomerIds = invoiceResults.map(inv => inv.customerId).filter(Boolean) as string[];
      const invCustomerMap = new Map<string, string>();
      if (invCustomerIds.length > 0) {
        const invCustomers = await db.select({ id: crmCustomers.id, name: crmCustomers.name })
          .from(crmCustomers).where(inArray(crmCustomers.id, invCustomerIds));
        invCustomers.forEach(c => invCustomerMap.set(c.id, c.name));
      }

      const invoices = invoiceResults.map(inv => {
        const matchField = findMatchField({ invoiceNumber: inv.invoiceNumber, notes: inv.notes }, ['invoiceNumber', 'notes']);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerId ? invCustomerMap.get(inv.customerId) || null : null,
          status: inv.status,
          total: inv.total,
          matchField,
          snippet: createSnippet(matchField === 'invoiceNumber' ? inv.invoiceNumber : inv.notes)
        };
      });

      // 5. Search crmQuotes
      const quoteCondition = or(
        buildPatternConditions(crmQuotes.quoteNumber),
        buildPatternConditions(crmQuotes.title),
        buildPatternConditions(crmQuotes.description),
        buildPatternConditions(crmQuotes.customerName)
      );
      const quoteResults = await db
        .select({
          id: crmQuotes.id,
          quoteNumber: crmQuotes.quoteNumber,
          title: crmQuotes.title,
          description: crmQuotes.description,
          customerName: crmQuotes.customerName,
          status: crmQuotes.status,
        })
        .from(crmQuotes)
        .where(quoteCondition)
        .limit(LIMIT);
      const quoteCount = await countMatches(crmQuotes, quoteCondition);

      const quotes = quoteResults.map(q => {
        const matchField = findMatchField(q, ['quoteNumber', 'title', 'description', 'customerName']);
        return {
          id: q.id,
          quoteNumber: q.quoteNumber,
          title: q.title,
          customerName: q.customerName,
          status: q.status,
          matchField,
          snippet: createSnippet((q as any)[matchField])
        };
      });

      // 6. Search crmAgreements (also search customerName for better results)
      const agreementCondition = or(
        buildPatternConditions(crmAgreements.notes),
        buildPatternConditions(crmAgreements.customerName)
      );
      const agreementResults = await db
        .select({
          id: crmAgreements.id,
          customerName: crmAgreements.customerName,
          notes: crmAgreements.notes,
          status: crmAgreements.status,
        })
        .from(crmAgreements)
        .where(agreementCondition)
        .limit(LIMIT);
      const agreementCount = await countMatches(crmAgreements, agreementCondition);

      const agreements = agreementResults.map(ag => ({
        id: ag.id,
        customerName: ag.customerName,
        status: ag.status,
        matchField: 'notes',
        snippet: createSnippet(ag.notes)
      }));

      // 7. Search crmCustomerNotes
      const noteCondition = buildPatternConditions(crmCustomerNotes.body);
      const noteResults = await db
        .select({
          id: crmCustomerNotes.id,
          customerId: crmCustomerNotes.customerId,
          body: crmCustomerNotes.body,
        })
        .from(crmCustomerNotes)
        .where(noteCondition)
        .limit(LIMIT);
      const noteCount = await countMatches(crmCustomerNotes, noteCondition);

      // Get customer names for notes
      const noteCustomerIds = noteResults.map(n => n.customerId).filter(Boolean) as string[];
      const noteCustomerMap = new Map<string, string>();
      if (noteCustomerIds.length > 0) {
        const noteCustomers = await db.select({ id: crmCustomers.id, name: crmCustomers.name })
          .from(crmCustomers).where(inArray(crmCustomers.id, noteCustomerIds));
        noteCustomers.forEach(c => noteCustomerMap.set(c.id, c.name));
      }

      const notes = noteResults.map(n => ({
        id: n.id,
        customerId: n.customerId,
        customerName: noteCustomerMap.get(n.customerId) || null,
        snippet: createSnippet(n.body)
      }));

      // 8. Search crmProjects (uses title field, not name)
      const projectCondition = or(
        buildPatternConditions(crmProjects.title),
        buildPatternConditions(crmProjects.description)
      );
      const projectResults = await db
        .select({
          id: crmProjects.id,
          name: crmProjects.title,
          description: crmProjects.description,
          status: crmProjects.status,
        })
        .from(crmProjects)
        .where(projectCondition)
        .limit(LIMIT);
      const projectCount = await countMatches(crmProjects, projectCondition);

      const projects = projectResults.map(p => {
        const matchField = findMatchField({ name: p.name, description: p.description }, ['name', 'description']);
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          matchField,
          snippet: createSnippet(matchField === 'name' ? p.name : p.description)
        };
      });

      const totalCount = totalCustomerCount + workOrderCount + invoiceCount + 
                         quoteCount + agreementCount + noteCount + projectCount;

      return res.json({
        query,
        results: {
          customers: { items: allCustomers, total: totalCustomerCount, hasMore: totalCustomerCount > LIMIT },
          workOrders: { items: workOrders, total: workOrderCount, hasMore: workOrderCount > LIMIT },
          invoices: { items: invoices, total: invoiceCount, hasMore: invoiceCount > LIMIT },
          quotes: { items: quotes, total: quoteCount, hasMore: quoteCount > LIMIT },
          agreements: { items: agreements, total: agreementCount, hasMore: agreementCount > LIMIT },
          notes: { items: notes, total: noteCount, hasMore: noteCount > LIMIT },
          projects: { items: projects, total: projectCount, hasMore: projectCount > LIMIT }
        },
        totalCount,
        aiEnhanced,
        aiIntent: aiIntent ? {
          expandedTerms: aiIntent.expandedTerms,
          intent: aiIntent.intent
        } : null
      });
    } catch (error) {
      console.error("Error in GHQ search:", error);
      return res.status(500).json({ message: "Search failed" });
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
          errors.push("Residential accounts must have at least 1 location");
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

      // Also create a corresponding customer record in crmCustomers table
      const primarySite = sites && sites.length > 0 ? sites[0] : null;
      const primaryContact = contacts && contacts.length > 0 ? contacts[0] : null;
      const fullAddress = primarySite 
        ? `${primarySite.address1}${primarySite.address2 ? ', ' + primarySite.address2 : ''}, ${primarySite.city}, ${primarySite.state} ${primarySite.zip}`
        : null;
      
      const customerTypeMap: Record<string, "residential" | "commercial" | "property_manager"> = {
        "RESIDENTIAL": "residential",
        "COMMERCIAL": "commercial", 
        "PROPERTY_MANAGER": "property_manager",
      };
      
      const mappedCustomerType = customerTypeMap[newAccount.accountType] || "residential";
      const mappedStatus: "prospect" | "client" = newAccount.accountStatus === "ACTIVE" ? "client" : "prospect";
      
      const [newCustomer] = await db.insert(crmCustomers).values({
        name: newAccount.displayName,
        companyName: newAccount.companyName,
        email: primaryContact?.email || null,
        phone: primaryContact?.phone || null,
        customerType: mappedCustomerType,
        customerStatus: mappedStatus,
        sourceSystem: "crm_accounts",
        sourceId: newAccount.id,
      }).returning();
      autoSyncCustomer(newCustomer.id);

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
      return res.status(500).json({ message: "Failed to fetch locations" });
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
          message: "Invalid location data",
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
      return res.status(500).json({ message: "Failed to create location" });
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
        return res.status(404).json({ message: "Location not found" });
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
      return res.status(500).json({ message: "Failed to update location" });
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
        return res.status(404).json({ message: "Location not found" });
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

      return res.json({ message: "Location deleted successfully" });
    } catch (error) {
      console.error("Error deleting site:", error);
      return res.status(500).json({ message: "Failed to delete location" });
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

      // Batch approach: Collect all data first, then batch insert
      const accountsToInsert: any[] = [];
      const customerToAccountData: Map<string, any> = new Map();

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

          const accountData = {
            displayName: customer.name,
            companyName: customer.companyName,
            accountType,
            accountStatus,
            tags: customer.tags || [],
            sourceSystem: customer.sourceSystem || "migration",
            sourceId: customer.id,
          };

          accountsToInsert.push(accountData);
          customerToAccountData.set(customer.id, {
            customer,
            accountData,
            properties: allProperties.filter(p => p.customerId === customer.id),
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          results.errors.push(`Failed to prepare customer ${customer.name} (${customer.id}): ${errorMsg}`);
        }
      }

      // Batch insert all accounts
      let createdAccounts: any[] = [];
      if (accountsToInsert.length > 0) {
        createdAccounts = await db.insert(crmAccounts).values(accountsToInsert).returning();
        results.accountsCreated = createdAccounts.length;
      }

      // Create mapping from sourceId to account
      const sourceIdToAccount = new Map(createdAccounts.map(acc => [acc.sourceId, acc]));

      // Collect all sites and contacts to insert
      const sitesToInsert: any[] = [];
      const contactsToInsert: any[] = [];

      for (const [customerId, data] of customerToAccountData.entries()) {
        const account = sourceIdToAccount.get(customerId);
        if (!account) continue;

        const { customer, properties } = data;

        // Create sites from properties
        if (properties.length > 0) {
          for (let i = 0; i < properties.length; i++) {
            const prop = properties[i];
            sitesToInsert.push({
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
          }
        } else {
          // Create a placeholder site
          sitesToInsert.push({
            accountId: account.id,
            siteName: "Primary Site",
            address1: "Address pending",
            city: "Unknown",
            state: "GA",
            zip: "00000",
            isPrimary: true,
          });
        }

        // Create contact from customer's phone/email
        if (customer.phone || customer.email) {
          const nameParts = customer.name.split(" ");
          const firstName = nameParts[0] || customer.name;
          const lastName = nameParts.slice(1).join(" ") || undefined;

          contactsToInsert.push({
            accountId: account.id,
            firstName,
            lastName,
            phone: customer.phone,
            email: customer.email,
            contactRole: "PRIMARY",
            isPrimary: true,
          });
        }

        results.migrated.push({
          customerId: customer.id,
          customerName: customer.name,
          accountId: account.id,
        });
      }

      // Batch insert all sites
      if (sitesToInsert.length > 0) {
        await db.insert(crmSites).values(sitesToInsert);
        results.sitesCreated = sitesToInsert.length;
      }

      // Batch insert all contacts
      if (contactsToInsert.length > 0) {
        await db.insert(crmContacts).values(contactsToInsert);
        results.contactsCreated = contactsToInsert.length;
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
        message: `Migration complete: ${results.accountsCreated} accounts, ${results.sitesCreated} locations, ${results.contactsCreated} contacts created`,
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
        message: `Import complete: ${results.accountsCreated} accounts, ${results.sitesCreated} locations, ${results.contactsCreated} contacts created (${results.skipped} skipped)`,
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
  // CRM PROPERTIES ROUTES
  // ============================================

  // GET /api/crm/properties - List properties (optionally filtered by customerId)
  app.get("/api/crm/properties", requireCrmAuth, async (req, res) => {
    try {
      const { customerId } = req.query;
      
      let properties;
      if (customerId) {
        properties = await db.select().from(crmProperties).where(eq(crmProperties.customerId, customerId as string));
      } else {
        properties = await db.select().from(crmProperties);
      }
      
      return res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      return res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  // GET /api/crm/customers/:id/properties - List properties for a customer
  app.get("/api/crm/customers/:id/properties", requireCrmAuth, async (req, res) => {
    try {
      const customerId = req.params.id;
      const properties = await db.select().from(crmProperties).where(eq(crmProperties.customerId, customerId));
      return res.json(properties);
    } catch (error) {
      console.error("Error fetching customer properties:", error);
      return res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  // GET /api/crm/customers/:id/agreements - Get agreements with maintenance visits for a customer
  app.get("/api/crm/customers/:id/agreements", requireCrmAuth, async (req, res) => {
    try {
      const customerId = req.params.id;
      
      // Get all agreements for this customer
      const agreements = await db.select().from(crmAgreements).where(eq(crmAgreements.customerId, customerId)).orderBy(desc(crmAgreements.createdAt));
      
      // For each agreement, get related maintenance visits with their work orders
      const agreementsWithVisits = await Promise.all(
        agreements.map(async (agreement) => {
          // Get maintenance visits for this agreement
          const visits = await db.select().from(maintenanceVisits)
            .where(eq(maintenanceVisits.agreementId, agreement.id))
            .orderBy(asc(maintenanceVisits.cycleYear), asc(maintenanceVisits.visitNumber));
          
          // For visits that have a work order, fetch work order details
          const visitsWithWorkOrders = await Promise.all(
            visits.map(async (visit) => {
              if (visit.workOrderId) {
                const [workOrder] = await db.select({
                  id: crmWorkOrders.id,
                  workOrderNumber: crmWorkOrders.workOrderNumber,
                  title: crmWorkOrders.title,
                  status: crmWorkOrders.status,
                }).from(crmWorkOrders).where(eq(crmWorkOrders.id, visit.workOrderId));
                return { ...visit, workOrder: workOrder || null };
              }
              return { ...visit, workOrder: null };
            })
          );
          
          // Calculate visit completion summary
          const currentYear = new Date().getFullYear();
          const currentYearVisits = visitsWithWorkOrders.filter(v => v.cycleYear === currentYear);
          const completedVisits = currentYearVisits.filter(v => v.status === "completed").length;
          const totalVisits = agreement.visitsPerPeriod || 2;
          
          const maintenanceStatus = {
            completedThisYear: completedVisits,
            totalPerYear: totalVisits,
            summary: `${completedVisits} of ${totalVisits} visits complete`,
            nextPending: visitsWithWorkOrders.find(v => v.status === "pending") || null,
          };
          
          return { ...agreement, maintenanceVisits: visitsWithWorkOrders, maintenanceStatus };
        })
      );
      
      return res.json(agreementsWithVisits);
    } catch (error) {
      console.error("Error fetching customer agreements:", error);
      return res.status(500).json({ message: "Failed to fetch agreements" });
    }
  });

  // GET /api/crm/customers/:id/active-agreements - Get active and pending agreements for dispatch view
  app.get("/api/crm/customers/:id/active-agreements", requireCrmAuth, async (req, res) => {
    try {
      const customerId = req.params.id;
      
      // Get active and pending agreements for this customer with full details
      const agreements = await db.select({
        id: crmAgreements.id,
        agreementNumber: crmAgreements.agreementNumber,
        agreementPlan: crmAgreements.agreementPlan,
        agreementType: crmAgreements.agreementType,
        customAgreementTypeId: crmAgreements.customAgreementTypeId,
        status: crmAgreements.status,
        numberOfSystems: crmAgreements.numberOfSystems,
        agreementValue: crmAgreements.agreementValue,
        startDate: crmAgreements.startDate,
        endDate: crmAgreements.endDate,
        contractDate: crmAgreements.contractDate,
        price: crmAgreements.price,
        frequency: crmAgreements.frequency,
        visitsPerPeriod: crmAgreements.visitsPerPeriod,
        nextServiceDate: crmAgreements.nextServiceDate,
        nextInvoiceDate: crmAgreements.nextInvoiceDate,
        billingPreference: crmAgreements.billingPreference,
        autoRenew: crmAgreements.autoRenew,
        isInitialCycle: crmAgreements.isInitialCycle,
        isActive: crmAgreements.isActive,
        activationDate: crmAgreements.activationDate,
        notes: crmAgreements.notes,
        propertyId: crmAgreements.propertyId,
      })
        .from(crmAgreements)
        .where(and(
          eq(crmAgreements.customerId, customerId),
          or(
            eq(crmAgreements.status, "active"),
            eq(crmAgreements.status, "pending"),
            eq(crmAgreements.status, "grace_period")
          )
        ))
        .orderBy(desc(crmAgreements.createdAt));
      
      // For each agreement, get custom agreement type name and visit counts
      const agreementsWithDetails = await Promise.all(
        agreements.map(async (agreement) => {
          let displayName = agreement.agreementPlan || agreement.agreementType || "Agreement";
          
          if (agreement.customAgreementTypeId) {
            const [customType] = await db.select({ name: customAgreementTypes.name })
              .from(customAgreementTypes)
              .where(eq(customAgreementTypes.id, agreement.customAgreementTypeId));
            if (customType) {
              displayName = customType.name;
            }
          }
          
          // Get visit counts for this agreement
          const visits = await db.select({
            id: maintenanceVisits.id,
            status: maintenanceVisits.status,
            visitNumber: maintenanceVisits.visitNumber,
            scheduledDate: maintenanceVisits.scheduledDate,
            completedDate: maintenanceVisits.completedDate,
            cycleYear: maintenanceVisits.cycleYear,
          })
            .from(maintenanceVisits)
            .where(eq(maintenanceVisits.agreementId, agreement.id));
          
          const currentYear = new Date().getFullYear();
          const currentCycleVisits = visits.filter(v => v.cycleYear === currentYear);
          const completedVisits = currentCycleVisits.filter(v => v.status === "completed").length;
          const scheduledVisits = currentCycleVisits.filter(v => v.status === "scheduled" || v.status === "pending").length;
          const totalVisits = agreement.visitsPerPeriod || 2;
          
          // Get last completed visit date
          const completedVisitsSorted = visits
            .filter(v => v.status === "completed" && v.completedDate)
            .sort((a, b) => new Date(b.completedDate!).getTime() - new Date(a.completedDate!).getTime());
          const lastVisitDate = completedVisitsSorted.length > 0 ? completedVisitsSorted[0].completedDate : null;
          
          // Calculate price to display (agreementValue or price field)
          const displayPrice = agreement.agreementValue || agreement.price || "0.00";
          
          return {
            ...agreement,
            displayName,
            displayPrice,
            visitProgress: {
              completed: completedVisits,
              scheduled: scheduledVisits,
              total: totalVisits,
              remaining: Math.max(0, totalVisits - completedVisits),
              lastVisitDate,
            },
          };
        })
      );
      
      return res.json(agreementsWithDetails);
    } catch (error) {
      console.error("Error fetching customer active agreements:", error);
      return res.status(500).json({ message: "Failed to fetch active agreements" });
    }
  });

  // GET /api/crm/customers/:id/timeline - Get unified activity timeline for a customer
  app.get("/api/crm/customers/:id/timeline", requireCrmAuth, async (req, res) => {
    try {
      const customerId = req.params.id;
      
      interface TimelineEntry {
        id: string;
        type: 'work_order' | 'project' | 'agreement' | 'quote' | 'invoice' | 'note' | 'payment';
        title: string;
        description: string;
        timestamp: string;
        status?: string;
        amount?: string;
        linkUrl?: string;
      }
      
      const timeline: TimelineEntry[] = [];
      
      // Helper to safely convert dates/strings to ISO string
      const toISOTimestamp = (dateValue: Date | string | null | undefined): string => {
        if (!dateValue) return new Date().toISOString();
        if (typeof dateValue === 'string') return new Date(dateValue).toISOString();
        return dateValue.toISOString();
      };
      
      // Query work orders
      const workOrders = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.customerId, customerId));
      for (const wo of workOrders) {
        timeline.push({
          id: wo.id,
          type: 'work_order',
          title: wo.title || `Work Order #${wo.workOrderNumber || wo.id.slice(0, 8)}`,
          description: wo.description || wo.visitType || 'Work order created',
          timestamp: toISOTimestamp(wo.createdAt),
          status: wo.status || undefined,
          linkUrl: `/crm/work-orders/${wo.id}`,
        });
      }
      
      // Query projects
      const projects = await db.select().from(crmProjects).where(eq(crmProjects.customerId, customerId));
      for (const proj of projects) {
        timeline.push({
          id: proj.id,
          type: 'project',
          title: proj.title || proj.projectNumber || 'Project',
          description: proj.description || proj.projectType || 'Project created',
          timestamp: toISOTimestamp(proj.createdAt),
          status: proj.status || undefined,
          amount: proj.totalAmount ? `$${parseFloat(proj.totalAmount).toLocaleString()}` : undefined,
          linkUrl: `/crm/projects/${proj.id}`,
        });
      }
      
      // Query agreements
      const agreements = await db.select().from(crmAgreements).where(eq(crmAgreements.customerId, customerId));
      for (const agmt of agreements) {
        timeline.push({
          id: agmt.id,
          type: 'agreement',
          title: agmt.agreementPlan || 'Service Agreement',
          description: `${(agmt.frequency || 'annual').charAt(0).toUpperCase() + (agmt.frequency || 'annual').slice(1)} - ${agmt.visitsPerPeriod || 2} visits/period`,
          timestamp: toISOTimestamp(agmt.createdAt),
          status: agmt.status || undefined,
          amount: agmt.price ? `$${parseFloat(agmt.price).toLocaleString()}` : undefined,
          linkUrl: `/crm/customers/${customerId}?tab=agreements`,
        });
      }
      
      // Query quotes
      const quotes = await db.select().from(crmQuotes).where(eq(crmQuotes.customerId, customerId));
      for (const quote of quotes) {
        timeline.push({
          id: quote.id,
          type: 'quote',
          title: quote.title || `Quote #${quote.quoteNumber || quote.id.slice(0, 8)}`,
          description: quote.description || 'Quote created',
          timestamp: toISOTimestamp(quote.createdAt),
          status: quote.status || undefined,
          amount: quote.total ? `$${parseFloat(quote.total).toLocaleString()}` : undefined,
          linkUrl: `/crm/quotes/${quote.id}`,
        });
      }
      
      // Query invoices
      const invoices = await db.select().from(crmInvoices).where(eq(crmInvoices.customerId, customerId));
      for (const inv of invoices) {
        timeline.push({
          id: inv.id,
          type: 'invoice',
          title: `Invoice #${inv.invoiceNumber || inv.id.slice(0, 8)}`,
          description: inv.notes || 'Invoice created',
          timestamp: toISOTimestamp(inv.createdAt),
          status: inv.status || undefined,
          amount: inv.total ? `$${parseFloat(inv.total).toLocaleString()}` : undefined,
          linkUrl: `/crm/invoices/${inv.id}`,
        });
        
        // For paid invoices, add a payment entry
        if (inv.status === 'paid' && inv.paidAt) {
          timeline.push({
            id: `payment-${inv.id}`,
            type: 'payment',
            title: `Payment Received`,
            description: `Payment for Invoice #${inv.invoiceNumber || inv.id.slice(0, 8)}`,
            timestamp: toISOTimestamp(inv.paidAt),
            status: 'completed',
            amount: inv.total ? `$${parseFloat(inv.total).toLocaleString()}` : undefined,
            linkUrl: `/crm/invoices/${inv.id}`,
          });
        }
      }
      
      // Query customer notes
      const notes = await db.select().from(crmCustomerNotes).where(eq(crmCustomerNotes.customerId, customerId));
      for (const note of notes) {
        timeline.push({
          id: note.id,
          type: 'note',
          title: 'Note Added',
          description: note.body?.substring(0, 100) || 'Note created',
          timestamp: toISOTimestamp(note.createdAt),
        });
      }
      
      // Sort by timestamp descending (newest first)
      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return res.json(timeline);
    } catch (error) {
      console.error("Error fetching customer timeline:", error);
      return res.status(500).json({ message: "Failed to fetch timeline" });
    }
  });

  // POST /api/crm/customers/:id/properties - Create a property for a customer
  app.post("/api/crm/customers/:id/properties", requireCrmAuth, async (req, res) => {
    try {
      const customerId = req.params.id;
      const { address1, address2, city, state, zip, notes, tenantName, tenantPhone, tenantEmail, preferredPaymentMethod, billingOverride, billedTo, paymentTerms, paymentMethod, approvalRule } = req.body;

      if (!address1?.trim() || !city?.trim() || !state?.trim() || !zip?.trim()) {
        return res.status(400).json({ message: "Street address, city, state, and zip are required" });
      }

      // Validate tenant requirements when billing override is ON and billing to tenant
      if (billingOverride && billedTo === "tenant") {
        if (!tenantName?.trim()) {
          return res.status(400).json({ message: "Tenant name is required when billing to tenant" });
        }
        if (!tenantEmail?.trim()) {
          return res.status(400).json({ message: "Tenant email is required when billing to tenant" });
        }
      }

      // Get customer to determine auto property type
      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId)).limit(1);
      
      // Auto-set property type based on customer type (unless manually specified)
      // Property managers require manual selection per-property
      let autoPropertyType = null;
      const custType = customer?.customerType?.toLowerCase();
      if (custType === "residential" || custType === "commercial") {
        autoPropertyType = custType;
      }
      
      const { propertyType } = req.body;
      
      const [newProperty] = await db.insert(crmProperties).values({
        customerId,
        address1: address1.trim(),
        address2: address2?.trim() || null,
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        notes: notes?.trim() || null,
        tenantName: tenantName?.trim() || null,
        tenantPhone: tenantPhone?.trim() || null,
        tenantEmail: tenantEmail?.trim() || null,
        preferredPaymentMethod: preferredPaymentMethod || null,
        billingOverride: billingOverride || false,
        billedTo: billedTo || "property_manager",
        paymentTerms: paymentTerms || null,
        paymentMethod: paymentMethod || null,
        approvalRule: approvalRule || null,
        propertyType: propertyType || autoPropertyType,
      }).returning();

      return res.status(201).json(newProperty);
    } catch (error) {
      console.error("Error creating property:", error);
      return res.status(500).json({ message: "Failed to create property" });
    }
  });

  // PATCH /api/crm/properties/:id - Update a property
  app.patch("/api/crm/properties/:id", requireCrmAuth, async (req, res) => {
    try {
      const propertyId = req.params.id;
      const { address1, address2, city, state, zip, notes, tenantName, tenantPhone, tenantEmail, preferredPaymentMethod, billingOverride, billedTo, paymentTerms, paymentMethod, approvalRule, propertyType } = req.body;

      // Fetch existing property to get customer info
      const [existingProperty] = await db.select().from(crmProperties).where(eq(crmProperties.id, propertyId));
      if (!existingProperty) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Build update data with trimmed values
      const updateData: Record<string, any> = {};
      const finalAddress1 = address1 !== undefined ? address1.trim() : existingProperty.address1;
      const finalCity = city !== undefined ? city.trim() : existingProperty.city;
      const finalState = state !== undefined ? state.trim() : existingProperty.state;
      const finalZip = zip !== undefined ? zip.trim() : existingProperty.zip;
      const finalTenantName = tenantName !== undefined ? tenantName?.trim() || null : existingProperty.tenantName;
      const finalTenantEmail = tenantEmail !== undefined ? tenantEmail?.trim() || null : existingProperty.tenantEmail;
      const finalBillingOverride = billingOverride !== undefined ? billingOverride : existingProperty.billingOverride;
      const finalBilledTo = billedTo !== undefined ? billedTo : existingProperty.billedTo;

      // Validate required address fields
      if (!finalAddress1 || !finalCity || !finalState || !finalZip) {
        return res.status(400).json({ message: "Street address, city, state, and zip are required" });
      }

      // Fetch customer to check if Property Manager
      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, existingProperty.customerId));
      const isPropertyManager = customer?.customerType?.toLowerCase() === "property manager";

      // Validate tenant requirements for Property Manager when billing override is ON and billing to tenant
      if (isPropertyManager && finalBillingOverride && finalBilledTo === "tenant") {
        if (!finalTenantName) {
          return res.status(400).json({ message: "Tenant name is required when billing to tenant" });
        }
        if (!finalTenantEmail) {
          return res.status(400).json({ message: "Tenant email is required when billing to tenant" });
        }
      }

      // Build update object
      if (address1 !== undefined) updateData.address1 = address1.trim();
      if (address2 !== undefined) updateData.address2 = address2?.trim() || null;
      if (city !== undefined) updateData.city = city.trim();
      if (state !== undefined) updateData.state = state.trim();
      if (zip !== undefined) updateData.zip = zip.trim();
      if (notes !== undefined) updateData.notes = notes?.trim() || null;
      if (tenantName !== undefined) updateData.tenantName = tenantName?.trim() || null;
      if (tenantPhone !== undefined) updateData.tenantPhone = tenantPhone?.trim() || null;
      if (tenantEmail !== undefined) updateData.tenantEmail = tenantEmail?.trim() || null;
      if (preferredPaymentMethod !== undefined) updateData.preferredPaymentMethod = preferredPaymentMethod || null;
      if (billingOverride !== undefined) updateData.billingOverride = billingOverride;
      if (billedTo !== undefined) updateData.billedTo = billedTo;
      if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms || null;
      if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod || null;
      if (approvalRule !== undefined) updateData.approvalRule = approvalRule || null;
      if (propertyType !== undefined) updateData.propertyType = propertyType || null;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const [updatedProperty] = await db.update(crmProperties)
        .set(updateData)
        .where(eq(crmProperties.id, propertyId))
        .returning();

      return res.json(updatedProperty);
    } catch (error) {
      console.error("Error updating property:", error);
      return res.status(500).json({ message: "Failed to update property" });
    }
  });

  // ============================================
  // CRM WORK ORDER SUBTYPE ROUTES
  // ============================================

  // GET /api/crm/work-order-subtypes - List all subtypes
  app.get("/api/crm/work-order-subtypes", requireCrmAuth, async (req, res) => {
    try {
      const { visitType, activeOnly } = req.query;
      const conditions = [];

      if (visitType) {
        conditions.push(eq(workOrderSubtypes.visitType, visitType as any));
      }

      if (activeOnly === "true") {
        conditions.push(eq(workOrderSubtypes.isActive, true));
      }

      const subtypes = await db
        .select()
        .from(workOrderSubtypes)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(workOrderSubtypes.sortOrder));

      return res.json(subtypes);
    } catch (error) {
      console.error("Error fetching work order subtypes:", error);
      return res.status(500).json({ message: "Failed to fetch work order subtypes" });
    }
  });

  // POST /api/crm/work-order-subtypes - Create a new subtype
  app.post("/api/crm/work-order-subtypes", requireCrmAuth, async (req, res) => {
    try {
      const validatedData = insertWorkOrderSubtypeSchema.parse(req.body);
      const [newSubtype] = await db
        .insert(workOrderSubtypes)
        .values(validatedData)
        .returning();

      return res.status(201).json(newSubtype);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error("Error creating work order subtype:", error);
      return res.status(500).json({ message: "Failed to create work order subtype" });
    }
  });

  // PATCH /api/crm/work-order-subtypes/:id - Update a subtype
  app.patch("/api/crm/work-order-subtypes/:id", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;
      // Partial validation for PATCH
      const validatedData = insertWorkOrderSubtypeSchema.partial().parse(req.body);

      const [updatedSubtype] = await db
        .update(workOrderSubtypes)
        .set(validatedData)
        .where(eq(workOrderSubtypes.id, id))
        .returning();

      if (!updatedSubtype) {
        return res.status(404).json({ message: "Work order subtype not found" });
      }

      return res.json(updatedSubtype);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error("Error updating work order subtype:", error);
      return res.status(500).json({ message: "Failed to update work order subtype" });
    }
  });

  // DELETE /api/crm/work-order-subtypes/:id - Delete a subtype
  app.delete("/api/crm/work-order-subtypes/:id", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const [deletedSubtype] = await db
        .delete(workOrderSubtypes)
        .where(eq(workOrderSubtypes.id, id))
        .returning();

      if (!deletedSubtype) {
        return res.status(404).json({ message: "Work order subtype not found" });
      }

      return res.status(204).end();
    } catch (error) {
      console.error("Error deleting work order subtype:", error);
      return res.status(500).json({ message: "Failed to delete work order subtype" });
    }
  });

  // ============================================
  // CRM WORK ORDER ROUTES
  // ============================================

  // GET /api/crm/work-orders - List work orders with optional filters and pagination (OPTIMIZED)
  app.get("/api/crm/work-orders", requireCrmAuth, async (req, res) => {
    try {
      const { jobId, techId, date, status, customerId, projectId, dateFrom, dateTo, page = "1", limit = "25" } = req.query;
      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = Math.min(50, parseInt(limit as string, 10) || 25);
      const offset = (pageNum - 1) * limitNum;

      // Build query conditions
      const conditions: any[] = [];
      
      if (customerId) {
        conditions.push(eq(crmWorkOrders.customerId, customerId as string));
      }
      if (projectId) {
        conditions.push(eq(crmWorkOrders.projectId, projectId as string));
      }
      if (jobId) {
        conditions.push(eq(crmWorkOrders.jobId, jobId as string));
      }
      if (techId) {
        conditions.push(eq(crmWorkOrders.assignedTechId, techId as string));
      }
      if (status) {
        conditions.push(eq(crmWorkOrders.status, status as string));
      }

      // Date range filtering - respect ISO timestamps if provided, otherwise default to server local time
      let startDate: Date;
      let endDate: Date;
      if (dateFrom) {
        // If dateFrom is an ISO string with time, use it directly
        startDate = new Date(dateFrom as string);
      } else if (date) {
        startDate = new Date(date as string);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      }
      if (dateTo) {
        // If dateTo is an ISO string with time, use it directly
        endDate = new Date(dateTo as string);
      } else if (date) {
        endDate = new Date(date as string);
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setHours(23, 59, 59, 999);
      }
      
      conditions.push(sql`${crmWorkOrders.scheduledStart} >= ${startDate}`);
      conditions.push(sql`${crmWorkOrders.scheduledStart} <= ${endDate}`);

      const whereClause = and(...conditions);

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmWorkOrders)
        .where(whereClause);
      const total = Number(countResult?.count) || 0;

      // Get paginated work orders with customer and property data
      const workOrdersRaw = await db
        .select({
          workOrder: crmWorkOrders,
          customer: crmCustomers,
          property: crmProperties,
        })
        .from(crmWorkOrders)
        .leftJoin(crmCustomers, eq(crmWorkOrders.customerId, crmCustomers.id))
        .leftJoin(crmProperties, eq(crmWorkOrders.propertyId, crmProperties.id))
        .where(whereClause)
        .orderBy(desc(crmWorkOrders.scheduledStart))
        .limit(limitNum)
        .offset(offset);

      // Include customer and property objects on each work order
      const workOrders = workOrdersRaw.map(row => ({
        ...row.workOrder,
        customerName: row.customer?.name || null,
        customer: row.customer || null,
        property: row.property || null,
      }));

      return res.json({
        workOrders,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching work orders:", error);
      return res.status(500).json({ message: "Failed to fetch work orders" });
    }
  });

  // GET /api/crm/work-orders/list - List enriched work orders with date range and filters
  app.get("/api/crm/work-orders/list", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const { dateFrom, dateTo, techId, status, customerId, projectId } = req.query;

      let startDate: Date;
      let endDate: Date;

      if (dateFrom) {
        startDate = new Date(dateFrom as string);
      } else {
        // Default to 30 days ago to include recent past work orders
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
      }

      if (dateTo) {
        endDate = new Date(dateTo as string);
      } else {
        endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setHours(23, 59, 59, 999);
      }

      let workOrders: CrmWorkOrder[];
      if (customerId) {
        workOrders = await storage.getWorkOrdersByCustomerId(customerId as string);
      } else if (projectId) {
        workOrders = await storage.getWorkOrdersByProjectId(projectId as string);
      } else {
        // Get scheduled work orders in date range
        const scheduledWorkOrders = await storage.getWorkOrdersByDateRange(startDate, endDate);
        // Also get unscheduled work orders (no scheduledStart date) 
        const unscheduledWorkOrders = await db
          .select()
          .from(crmWorkOrders)
          .where(isNull(crmWorkOrders.scheduledStart))
          .orderBy(desc(crmWorkOrders.createdAt));
        // Combine both sets, avoiding duplicates
        const workOrderIds = new Set(scheduledWorkOrders.map(wo => wo.id));
        workOrders = [...scheduledWorkOrders, ...unscheduledWorkOrders.filter(wo => !workOrderIds.has(wo.id))];
      }

      if (techId) {
        workOrders = workOrders.filter(wo => wo.assignedTechId === techId);
      }

      if (status) {
        workOrders = workOrders.filter(wo => wo.status === status);
      }

      const enrichedWorkOrders = await Promise.all(
        workOrders.map(async (wo) => {
          let job = null;
          if (wo.jobId) {
            const [j] = await db.select().from(crmJobs).where(eq(crmJobs.id, wo.jobId));
            job = j || null;
          }

          let customer = null;
          if (wo.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, wo.customerId));
            customer = cust || null;
          } else if (job?.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, job.customerId));
            customer = cust || null;
          }

          let property = null;
          if (wo.propertyId) {
            const [prop] = await db.select().from(crmProperties).where(eq(crmProperties.id, wo.propertyId));
            property = prop || null;
          }

          let project = null;
          if (wo.projectId) {
            const [proj] = await db.select().from(crmProjects).where(eq(crmProjects.id, wo.projectId));
            project = proj || null;
          }

          let tech = null;
          if (wo.assignedTechId) {
            const [t] = await db.select().from(crmUsers).where(eq(crmUsers.id, wo.assignedTechId));
            tech = t || null;
          }

          return {
            ...wo,
            job,
            customer,
            property,
            project,
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

  // GET /api/crm/work-orders/:id - Get single work order with related details
  app.get("/api/crm/work-orders/:id", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      if (user.role === 'tech' && workOrder.assignedTechId !== user.id) {
        return res.status(403).json({ message: "Access denied - work order not assigned to you" });
      }

      let job = null;
      if (workOrder.jobId) {
        const [j] = await db.select().from(crmJobs).where(eq(crmJobs.id, workOrder.jobId));
        job = j || null;
      }

      let customer = null;
      if (workOrder.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, workOrder.customerId));
        customer = cust || null;
      } else if (job?.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, job.customerId));
        customer = cust || null;
      }

      let property = null;
      if (workOrder.propertyId) {
        const [prop] = await db.select().from(crmProperties).where(eq(crmProperties.id, workOrder.propertyId));
        property = prop || null;
      }

      let project = null;
      if (workOrder.projectId) {
        const [proj] = await db.select().from(crmProjects).where(eq(crmProjects.id, workOrder.projectId));
        project = proj || null;
      }

      let tech = null;
      if (workOrder.assignedTechId) {
        const [t] = await db.select().from(crmUsers).where(eq(crmUsers.id, workOrder.assignedTechId));
        tech = t || null;
      }

      return res.json({
        ...workOrder,
        job,
        customer,
        property,
        project,
        tech,
      });
    } catch (error) {
      console.error("Error fetching work order:", error);
      return res.status(500).json({ message: "Failed to fetch work order" });
    }
  });

  // POST /api/crm/work-orders - Create work order (standalone or linked to job/project)
  app.post("/api/crm/work-orders", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Validate required fields for standalone work orders
      const { customerId, propertyId, jobId, projectId, title, description, agreementId } = req.body;
      
      if (!customerId) {
        return res.status(400).json({ message: "customerId is required" });
      }
      if (!propertyId) {
        return res.status(400).json({ message: "propertyId is required" });
      }
      if (!title || (typeof title === 'string' && !title.trim())) {
        return res.status(400).json({ message: "Title is required" });
      }
      if (!description || (typeof description === 'string' && !description.trim())) {
        return res.status(400).json({ message: "Description is required" });
      }

      // Verify customer exists
      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Verify property exists
      const [property] = await db.select().from(crmProperties).where(eq(crmProperties.id, propertyId));
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Block maintenance work orders if property has a pending auto-invoice agreement
      const visitType = req.body.visitType;
      if (visitType === "MAINTENANCE") {
        const pendingAgreements = await db.select()
          .from(crmAgreements)
          .where(and(
            eq(crmAgreements.propertyId, propertyId),
            eq(crmAgreements.status, "pending"),
            eq(crmAgreements.billingPreference, "auto_invoice")
          ));
        
        if (pendingAgreements.length > 0) {
          return res.status(400).json({ 
            message: "Cannot schedule maintenance visit - this property has a pending maintenance agreement. Please wait until the agreement is active (first payment received)." 
          });
        }
      }

      // If jobId is provided, verify it exists
      if (jobId) {
        const [job] = await db.select().from(crmJobs).where(eq(crmJobs.id, jobId));
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }
      }

      // If projectId is provided, verify it exists
      if (projectId) {
        const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, projectId));
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }

      // Convert date strings to Date objects before validation
      // Use fromZonedTime to properly convert local time strings to UTC
      // (the client sends times in EST without timezone suffix)
      const bodyWithDates = {
        ...req.body,
        scheduledStart: req.body.scheduledStart 
          ? fromZonedTime(new Date(req.body.scheduledStart), APP_TIMEZONE)
          : undefined,
        scheduledEnd: req.body.scheduledEnd 
          ? fromZonedTime(new Date(req.body.scheduledEnd), APP_TIMEZONE)
          : undefined,
        startedAt: req.body.startedAt ? new Date(req.body.startedAt) : undefined,
        completedAt: req.body.completedAt ? new Date(req.body.completedAt) : undefined,
      };

      const result = insertCrmWorkOrderSchema.safeParse(bodyWithDates);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid work order data", errors: result.error.flatten() });
      }

      // For MAINTENANCE visit types, verify property has an active maintenance agreement
      // and hasn't already reached max visits for the current cycle
      if (result.data.visitType === "MAINTENANCE") {
        const activeAgreement = await db.select()
          .from(crmAgreements)
          .where(and(
            eq(crmAgreements.propertyId, propertyId),
            or(
              eq(crmAgreements.status, "active"),
              eq(crmAgreements.status, "pending"),
              eq(crmAgreements.status, "grace_period")
            )
          ))
          .orderBy(desc(crmAgreements.createdAt))
          .limit(1);
        
        if (activeAgreement.length === 0) {
          return res.status(400).json({ 
            message: "Cannot schedule maintenance work order",
            error: "NO_MAINTENANCE_AGREEMENT",
            details: "This property does not have an active maintenance agreement. Please create a maintenance agreement first or select a different visit type."
          });
        }
        
        // Check if all visits for this cycle have been scheduled/completed
        const agreement = activeAgreement[0];
        const totalVisits = agreement.visitsPerPeriod || 2;
        
        // Count all non-cancelled MAINTENANCE work orders for this property since agreement activation
        const startDate = agreement.activationDate 
          ? new Date(agreement.activationDate) 
          : new Date(agreement.startDate || agreement.createdAt || '2020-01-01');
        
        const existingVisits = await db.select({ count: count() })
          .from(crmWorkOrders)
          .where(
            and(
              eq(crmWorkOrders.propertyId, propertyId),
              eq(crmWorkOrders.visitType, "MAINTENANCE"),
              ne(crmWorkOrders.status, "cancelled"),
              gte(crmWorkOrders.createdAt, startDate)
            )
          );
        
        const visitCount = Number(existingVisits[0]?.count || 0);
        
        if (visitCount >= totalVisits) {
          return res.status(400).json({ 
            message: "Cannot schedule maintenance work order",
            error: "MAX_VISITS_REACHED",
            details: `This property has already reached the maximum of ${totalVisits} maintenance visits for this billing cycle. The agreement must be renewed before scheduling additional maintenance visits.`,
            visitInfo: {
              currentVisits: visitCount,
              maxVisits: totalVisits,
              agreementId: agreement.id,
              agreementNumber: agreement.agreementNumber
            }
          });
        }
      }

      // Check for scheduling conflicts
      const { assignedTechId, scheduledStart, scheduledEnd } = result.data;
      if (assignedTechId && scheduledStart && scheduledEnd) {
        const { hasConflict, conflictingOrder } = await checkSchedulingConflict(
          assignedTechId,
          scheduledStart,
          scheduledEnd
        );
        if (hasConflict) {
          return res.status(409).json({ 
            message: "Scheduling conflict",
            error: "SCHEDULING_CONFLICT",
            conflictingOrder: {
              id: conflictingOrder?.id,
              title: conflictingOrder?.title || 'Untitled',
              scheduledStart: conflictingOrder?.scheduledStart,
              scheduledEnd: conflictingOrder?.scheduledEnd,
            }
          });
        }
      }

      // Calculate work order number based on customer's existing work orders
      let workOrderNumber = 1;
      if (jobId) {
        const existingWorkOrders = await storage.getWorkOrdersByJobId(jobId);
        workOrderNumber = existingWorkOrders.length + 1;
      } else {
        const existingWorkOrders = await storage.getWorkOrdersByCustomerId(customerId);
        workOrderNumber = existingWorkOrders.length + 1;
      }

      const workOrder = await storage.createWorkOrder({
        ...result.data,
        customerId,
        propertyId,
        jobId: jobId || null,
        projectId: projectId || null,
        agreementId: agreementId || null,
        title: typeof title === 'string' ? title.trim() : title,
        description: typeof description === 'string' ? description.trim() : description,
        workOrderNumber,
      });

      await logCrmAudit(
        user.id,
        "work_order.created",
        "work_order",
        workOrder.id,
        { customerId, propertyId, jobId: workOrder.jobId, projectId: workOrder.projectId, workOrderNumber },
        req.ip
      );

      return res.status(201).json(workOrder);
    } catch (error) {
      console.error("Error creating work order:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create work order";
      return res.status(500).json({ message: errorMessage });
    }
  });

  // PATCH /api/crm/work-orders/:id - Update work order (including project linking)
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

      if (user.role === 'tech' && existingWorkOrder.assignedTechId !== user.id) {
        return res.status(403).json({ message: "Access denied - work order not assigned to you" });
      }

      // Prevent editing work orders that are "on_site" - only allow status, notes, and completion details
      if (existingWorkOrder.status === "on_site") {
        const lockedFields = ["assignedTechId", "scheduledStart", "scheduledEnd", "customerId", "propertyId", "title", "description", "priority", "visitType", "workSubtype", "projectId", "agreementId", "dispatchQueueStage"];
        const requestedUpdates = Object.keys(req.body);
        const disallowedUpdates = requestedUpdates.filter(k => lockedFields.includes(k));
        
        if (disallowedUpdates.length > 0) {
          return res.status(403).json({ 
            message: "Cannot modify work order while technician is on site. Only status, notes, and completion details can be updated.",
            blockedFields: disallowedUpdates
          });
        }
      }

      const allowedFields = insertCrmWorkOrderSchema.partial().pick({
        status: true,
        assignedTechId: true,
        checklist: true,
        partsUsed: true,
        techNotes: true,
        completionSummary: true,
        projectId: true,
        agreementId: true,
        title: true,
        description: true,
        priority: true,
        visitType: true,
        workSubtype: true,
        dispatchQueueStage: true,
        customerId: true,
        propertyId: true,
        dispatchNotes: true,
        isPending: true,
        pendingReason: true,
      }).extend({
        scheduledStart: z.union([z.string(), z.date(), z.null()]).optional(),
        scheduledEnd: z.union([z.string(), z.date(), z.null()]).optional(),
        startedAt: z.union([z.string(), z.date(), z.null()]).optional(),
        completedAt: z.union([z.string(), z.date(), z.null()]).optional(),
        pendingStartedAt: z.union([z.string(), z.date(), z.null()]).optional(),
        updateProjectCustomer: z.boolean().optional(),
      });

      const result = allowedFields.safeParse(req.body);
      if (!result.success) {
        console.error("Work order PATCH validation error:", JSON.stringify(result.error.flatten().fieldErrors), "Body:", JSON.stringify(req.body));
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: result.error.flatten().fieldErrors 
        });
      }

      const { status, assignedTechId, scheduledStart, scheduledEnd, techNotes, completionSummary, checklist, partsUsed, startedAt, completedAt, projectId, agreementId, title, description, priority, visitType, workSubtype, dispatchQueueStage, customerId, propertyId, updateProjectCustomer, dispatchNotes, isPending, pendingReason, pendingStartedAt } = result.data;

      // If projectId is provided (not null), verify it exists
      if (projectId !== undefined && projectId !== null) {
        const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, projectId));
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }

      // If customerId is being changed, validate the new customer exists
      if (customerId !== undefined && customerId !== null) {
        const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }
      }

      // If propertyId is being changed, validate it belongs to the customer
      if (propertyId !== undefined && propertyId !== null) {
        const targetCustomerId = customerId || existingWorkOrder.customerId;
        if (targetCustomerId) {
          const [property] = await db.select().from(crmProperties).where(
            and(eq(crmProperties.id, propertyId), eq(crmProperties.customerId, targetCustomerId))
          );
          if (!property) {
            return res.status(400).json({ message: "Property does not belong to the selected customer" });
          }
        }
      }

      // Check for scheduling conflicts
      const effectiveTechId = assignedTechId !== undefined ? assignedTechId : existingWorkOrder.assignedTechId;
      const effectiveStart = scheduledStart !== undefined ? scheduledStart : existingWorkOrder.scheduledStart;
      const effectiveEnd = scheduledEnd !== undefined ? scheduledEnd : existingWorkOrder.scheduledEnd;

      if (effectiveTechId && effectiveStart && effectiveEnd) {
        const { hasConflict, conflictingOrder } = await checkSchedulingConflict(
          effectiveTechId,
          effectiveStart,
          effectiveEnd,
          req.params.id // Exclude current work order
        );
        if (hasConflict) {
          return res.status(409).json({ 
            message: "Scheduling conflict",
            error: "SCHEDULING_CONFLICT",
            conflictingOrder: {
              id: conflictingOrder?.id,
              title: conflictingOrder?.title || 'Untitled',
              scheduledStart: conflictingOrder?.scheduledStart,
              scheduledEnd: conflictingOrder?.scheduledEnd,
            }
          });
        }
      }

      const updateData: Partial<InsertCrmWorkOrder> = {};
      if (status !== undefined) updateData.status = status;
      
      // Record status change timestamps for time tracking (only if not already set)
      if (status === "dispatched" && existingWorkOrder.status !== "dispatched" && !existingWorkOrder.dispatchedAt) {
        updateData.dispatchedAt = new Date();
      }
      if (status === "en_route" && existingWorkOrder.status !== "en_route" && !existingWorkOrder.enRouteAt) {
        updateData.enRouteAt = new Date();
      }
      if (status === "on_site" && existingWorkOrder.status !== "on_site" && !existingWorkOrder.onSiteAt) {
        updateData.onSiteAt = new Date();
      }
      if (status === "completed" && existingWorkOrder.status !== "completed" && !existingWorkOrder.completedAt) {
        updateData.completedAt = new Date();
      }
      
      if (assignedTechId !== undefined) updateData.assignedTechId = assignedTechId;
      if (scheduledStart !== undefined) updateData.scheduledStart = scheduledStart ? new Date(scheduledStart) : null;
      if (scheduledEnd !== undefined) updateData.scheduledEnd = scheduledEnd ? new Date(scheduledEnd) : null;
      if (techNotes !== undefined) updateData.techNotes = techNotes;
      if (completionSummary !== undefined) updateData.completionSummary = completionSummary;
      if (checklist !== undefined) updateData.checklist = checklist;
      if (partsUsed !== undefined) updateData.partsUsed = partsUsed;
      if (startedAt !== undefined) updateData.startedAt = startedAt ? new Date(startedAt) : null;
      if (completedAt !== undefined) updateData.completedAt = completedAt ? new Date(completedAt) : null;
      if (projectId !== undefined) updateData.projectId = projectId;
      if (agreementId !== undefined) updateData.agreementId = agreementId;
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (priority !== undefined) updateData.priority = priority;
      if (visitType !== undefined) updateData.visitType = visitType;
      if (workSubtype !== undefined) updateData.workSubtype = workSubtype;
      if (dispatchQueueStage !== undefined) updateData.dispatchQueueStage = dispatchQueueStage;
      if (customerId !== undefined) updateData.customerId = customerId;
      if (propertyId !== undefined) updateData.propertyId = propertyId;
      if (dispatchNotes !== undefined) updateData.dispatchNotes = dispatchNotes;
      if (isPending !== undefined) {
        updateData.isPending = isPending;
        
        // If turning off pending status, accumulate pending time
        if (isPending === false && existingWorkOrder.isPending === true && existingWorkOrder.pendingStartedAt) {
          const pendingDuration = Math.floor((new Date().getTime() - existingWorkOrder.pendingStartedAt.getTime()) / 60000);
          const currentTotal = existingWorkOrder.totalPendingMinutes || 0;
          updateData.totalPendingMinutes = currentTotal + Math.max(0, pendingDuration);
        }
      }
      if (pendingReason !== undefined) updateData.pendingReason = pendingReason;
      if (pendingStartedAt !== undefined) {
        updateData.pendingStartedAt = pendingStartedAt ? new Date(pendingStartedAt as string) : null;
      }

      // If customer is being changed and there's a linked project, update project too
      if (customerId !== undefined && customerId !== existingWorkOrder.customerId && updateProjectCustomer) {
        const linkedProjectId = projectId !== undefined ? projectId : existingWorkOrder.projectId;
        if (linkedProjectId) {
          await db.update(crmProjects)
            .set({ customerId: customerId })
            .where(eq(crmProjects.id, linkedProjectId));
        }
      }

      const workOrder = await storage.updateWorkOrder(req.params.id, updateData);

      // If work order status changed to "completed" and it's a MAINTENANCE visit,
      // update any linked maintenance visit to completed
      if (status === "completed" && workOrder?.visitType === "MAINTENANCE") {
        // Use the work order's agreementId to find the first pending visit for that agreement
        const effectiveAgreementId = workOrder.agreementId;
        
        if (effectiveAgreementId) {
          // Find the first pending visit for this agreement (by target date)
          const [pendingVisit] = await db.select()
            .from(maintenanceVisits)
            .where(and(
              eq(maintenanceVisits.agreementId, effectiveAgreementId),
              eq(maintenanceVisits.status, "pending")
            ))
            .orderBy(asc(maintenanceVisits.targetDate))
            .limit(1);
          
          if (pendingVisit) {
            // Mark the pending visit as completed and link it to this work order
            await db.update(maintenanceVisits)
              .set({ 
                status: "completed", 
                completedAt: new Date(),
                workOrderId: req.params.id,
                updatedAt: new Date() 
              })
              .where(eq(maintenanceVisits.id, pendingVisit.id));
            
            // Check if this is a pay-on-visit agreement that needs activation
            const [agreement] = await db.select()
              .from(crmAgreements)
              .where(eq(crmAgreements.id, effectiveAgreementId))
              .limit(1);
            
            if (agreement && agreement.billingPreference === "pay_on_visit" && 
                agreement.status === "pending" && agreement.isInitialCycle) {
              // First visit completed for pay-on-visit = initial payment collected, activate agreement
              const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
              await db.update(crmAgreements)
                .set({
                  status: "active",
                  activationDate: todayStr,
                  isInitialCycle: false,
                  updatedAt: new Date(),
                })
                .where(eq(crmAgreements.id, effectiveAgreementId));
              console.log(`[WorkOrder] Activated pay-on-visit agreement ${agreement.agreementNumber} after first visit completion`);
            }
            
            // Find the next pending visit for this agreement
            const [nextVisit] = await db.select()
              .from(maintenanceVisits)
              .where(and(
                eq(maintenanceVisits.agreementId, effectiveAgreementId),
                eq(maintenanceVisits.status, "pending")
              ))
              .orderBy(asc(maintenanceVisits.targetDate))
              .limit(1);
            
            // Update the agreement's next service date
            await db.update(crmAgreements)
              .set({ 
                nextServiceDate: nextVisit ? nextVisit.targetDate : null, 
                updatedAt: new Date() 
              })
              .where(eq(crmAgreements.id, effectiveAgreementId));
          }
        } else {
          // Fallback: If no agreementId on work order, try to find by customer/property
          // First, check if there are visits already linked to this work order
          const linkedVisits = await db.select()
            .from(maintenanceVisits)
            .where(eq(maintenanceVisits.workOrderId, req.params.id));
          
          if (linkedVisits.length > 0) {
            // Process pre-linked visits
            for (const visit of linkedVisits) {
              await db.update(maintenanceVisits)
                .set({ 
                  status: "completed", 
                  completedAt: new Date(),
                  updatedAt: new Date() 
                })
                .where(eq(maintenanceVisits.id, visit.id));
              
              if (visit.agreementId) {
                // Check if this is a pay-on-visit agreement that needs activation
                const [linkedAgreement] = await db.select()
                  .from(crmAgreements)
                  .where(eq(crmAgreements.id, visit.agreementId))
                  .limit(1);
                
                if (linkedAgreement && linkedAgreement.billingPreference === "pay_on_visit" && 
                    linkedAgreement.status === "pending" && linkedAgreement.isInitialCycle) {
                  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
                  await db.update(crmAgreements)
                    .set({
                      status: "active",
                      activationDate: todayStr,
                      isInitialCycle: false,
                      updatedAt: new Date(),
                    })
                    .where(eq(crmAgreements.id, visit.agreementId));
                  console.log(`[WorkOrder] Activated pay-on-visit agreement ${linkedAgreement.agreementNumber} after first visit completion (pre-linked)`);
                }
                
                const [nextVisit] = await db.select()
                  .from(maintenanceVisits)
                  .where(and(
                    eq(maintenanceVisits.agreementId, visit.agreementId),
                    eq(maintenanceVisits.status, "pending")
                  ))
                  .orderBy(asc(maintenanceVisits.targetDate))
                  .limit(1);
                
                await db.update(crmAgreements)
                  .set({ 
                    nextServiceDate: nextVisit ? nextVisit.targetDate : null, 
                    updatedAt: new Date() 
                  })
                  .where(eq(crmAgreements.id, visit.agreementId));
              }
            }
          } else if (workOrder?.customerId) {
            // No pre-linked visits - try to find an agreement for this customer/property
            // Check for both active and pending (for pay-on-visit initial activation)
            const agreementConditions = [
              eq(crmAgreements.customerId, workOrder.customerId),
              or(eq(crmAgreements.status, "active"), eq(crmAgreements.status, "pending"))
            ];
            
            // If property is specified, match by property too for more precision
            if (workOrder.propertyId) {
              agreementConditions.push(eq(crmAgreements.propertyId, workOrder.propertyId));
            }
            
            const [matchingAgreement] = await db.select()
              .from(crmAgreements)
              .where(and(...agreementConditions))
              .limit(1);
            
            if (matchingAgreement) {
              // Find the first pending visit for this agreement
              const [pendingVisit] = await db.select()
                .from(maintenanceVisits)
                .where(and(
                  eq(maintenanceVisits.agreementId, matchingAgreement.id),
                  eq(maintenanceVisits.status, "pending")
                ))
                .orderBy(asc(maintenanceVisits.targetDate))
                .limit(1);
              
              if (pendingVisit) {
                // Mark the pending visit as completed and link it to this work order
                await db.update(maintenanceVisits)
                  .set({ 
                    status: "completed", 
                    completedAt: new Date(),
                    workOrderId: req.params.id,
                    updatedAt: new Date() 
                  })
                  .where(eq(maintenanceVisits.id, pendingVisit.id));
                
                // Also update the work order to link it to the agreement
                await db.update(crmWorkOrders)
                  .set({ agreementId: matchingAgreement.id })
                  .where(eq(crmWorkOrders.id, req.params.id));
                
                // Check if this is a pay-on-visit agreement that needs activation
                if (matchingAgreement.billingPreference === "pay_on_visit" && 
                    matchingAgreement.status === "pending" && matchingAgreement.isInitialCycle) {
                  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
                  await db.update(crmAgreements)
                    .set({
                      status: "active",
                      activationDate: todayStr,
                      isInitialCycle: false,
                      updatedAt: new Date(),
                    })
                    .where(eq(crmAgreements.id, matchingAgreement.id));
                  console.log(`[WorkOrder] Activated pay-on-visit agreement ${matchingAgreement.agreementNumber} after first visit completion (customer/property match)`);
                }
                
                // Find the next pending visit for this agreement
                const [nextVisit] = await db.select()
                  .from(maintenanceVisits)
                  .where(and(
                    eq(maintenanceVisits.agreementId, matchingAgreement.id),
                    eq(maintenanceVisits.status, "pending")
                  ))
                  .orderBy(asc(maintenanceVisits.targetDate))
                  .limit(1);
                
                // Update the agreement's next service date
                await db.update(crmAgreements)
                  .set({ 
                    nextServiceDate: nextVisit ? nextVisit.targetDate : null, 
                    updatedAt: new Date() 
                  })
                  .where(eq(crmAgreements.id, matchingAgreement.id));
              }
            }
          }
        }
      }

      // Send SMS notifications for status changes to en_route or on_site
      let smsNotificationSent = false;
      if (status && (status === "en_route" || status === "on_site") && existingWorkOrder.status !== status) {
        try {
          // Get customer phone
          const customerId = workOrder?.customerId || existingWorkOrder.customerId;
          if (customerId) {
            const [customer] = await db.select().from(crmCustomers)
              .where(eq(crmCustomers.id, customerId)).limit(1);
            
            if (customer?.phone) {
              const notificationType = status === "en_route" ? "work_order_en_route" : "work_order_on_site";
              
              // Check if notification was already sent
              const alreadySent = await hasNotificationBeenSent(notificationType, req.params.id, "work_order");
              
              if (!alreadySent) {
                const messageBody = status === "en_route" 
                  ? await getWorkOrderEnRouteTemplate() 
                  : await getWorkOrderOnSiteTemplate();
                
                const smsResult = await sendAutomatedSms({
                  customerId,
                  phoneNumber: customer.phone,
                  messageBody,
                  notificationType,
                  workOrderId: req.params.id,
                });
                
                smsNotificationSent = smsResult.success;
                console.log(`[WorkOrder SMS] ${status} notification ${smsNotificationSent ? 'sent' : 'failed'} for work order ${req.params.id}`);
              }
            }
          }
        } catch (smsError) {
          console.error("[WorkOrder SMS] Error sending status notification:", smsError);
        }
      }

      await logCrmAudit(
        user.id,
        "work_order.updated",
        "work_order",
        req.params.id,
        { updates: Object.keys(updateData), smsNotificationSent },
        req.ip
      );

      return res.json({ ...workOrder, smsNotificationSent });
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

      // Check for linked invoices
      const linkedInvoices = await db.select({ id: crmInvoices.id })
        .from(crmInvoices)
        .where(eq(crmInvoices.workOrderId, req.params.id));
      
      if (linkedInvoices.length > 0) {
        return res.status(400).json({ 
          message: "Cannot delete work order with linked invoices. Please delete the invoice(s) first.",
          linkedInvoices: linkedInvoices.length
        });
      }

      // Check for linked quotes
      const linkedQuotes = await db.select({ id: crmQuotes.id })
        .from(crmQuotes)
        .where(eq(crmQuotes.workOrderId, req.params.id));
      
      if (linkedQuotes.length > 0) {
        return res.status(400).json({ 
          message: "Cannot delete work order with linked quotes. Please delete the quote(s) first.",
          linkedQuotes: linkedQuotes.length
        });
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

  // POST /api/crm/work-orders/:id/photos - Add photo to work order
  app.post("/api/crm/work-orders/:id/photos", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      const { id, url, objectPath, filename } = req.body;
      if (!id || !url || !objectPath || !filename) {
        return res.status(400).json({ message: "Missing required fields: id, url, objectPath, filename" });
      }

      const newPhoto = {
        id,
        url,
        objectPath,
        filename,
        uploadedAt: new Date().toISOString(),
      };

      const existingPhotos = (workOrder.photos as any[]) || [];
      const updatedPhotos = [...existingPhotos, newPhoto];

      await db.update(crmWorkOrders)
        .set({ photos: updatedPhotos })
        .where(eq(crmWorkOrders.id, req.params.id));

      await logCrmAudit(
        user.id,
        "work_order.photo_added",
        "work_order",
        req.params.id,
        { photoId: id, filename },
        req.ip
      );

      return res.status(201).json({ photo: newPhoto, photos: updatedPhotos });
    } catch (error) {
      console.error("Error adding photo to work order:", error);
      return res.status(500).json({ message: "Failed to add photo" });
    }
  });

  // DELETE /api/crm/work-orders/:id/photos/:photoId - Remove photo from work order
  app.delete("/api/crm/work-orders/:id/photos/:photoId", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      const existingPhotos = (workOrder.photos as any[]) || [];
      const updatedPhotos = existingPhotos.filter((p: any) => p.id !== req.params.photoId);

      if (existingPhotos.length === updatedPhotos.length) {
        return res.status(404).json({ message: "Photo not found" });
      }

      await db.update(crmWorkOrders)
        .set({ photos: updatedPhotos })
        .where(eq(crmWorkOrders.id, req.params.id));

      await logCrmAudit(
        user.id,
        "work_order.photo_removed",
        "work_order",
        req.params.id,
        { photoId: req.params.photoId },
        req.ip
      );

      return res.json({ photos: updatedPhotos });
    } catch (error) {
      console.error("Error removing photo from work order:", error);
      return res.status(500).json({ message: "Failed to remove photo" });
    }
  });

  // GET /api/crm/dispatch/work-orders - Get work orders for dispatch board
  app.get("/api/crm/dispatch/work-orders", requireCrmAuth, async (req, res) => {
    try {
      const dateParam = req.query.date as string;
      const statusParam = req.query.status as string;
      
      // Parse date - expecting YYYY-MM-DD format in local timezone (America/New_York)
      let targetDateStr: string;
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        targetDateStr = dateParam;
      } else {
        // Default to today in EST
        const now = new Date();
        const estNow = new Date(now.toLocaleString("en-US", { timeZone: APP_TIMEZONE }));
        targetDateStr = estNow.toISOString().split("T")[0];
      }

      // Convert local timezone (EST) date boundaries to UTC for database queries
      // Start of day in EST (e.g., Jan 1 00:00 EST = Jan 1 05:00 UTC)
      const startOfDayLocal = new Date(`${targetDateStr}T00:00:00`);
      const startOfDay = fromZonedTime(startOfDayLocal, APP_TIMEZONE);
      // End of day in EST (e.g., Jan 1 23:59 EST = Jan 2 04:59 UTC)
      const endOfDayLocal = new Date(`${targetDateStr}T23:59:59.999`);
      const endOfDay = fromZonedTime(endOfDayLocal, APP_TIMEZONE);

      let workOrders = await storage.getWorkOrdersByDateRange(startOfDay, endOfDay);
      
      // Also fetch unassigned work orders that have NO scheduled date (ready to be scheduled)
      // Work orders with a scheduled date will appear on their scheduled date via getWorkOrdersByDateRange
      const unassignedWorkOrders = await storage.getUnassignedWorkOrders();
      
      // Only add unassigned work orders that don't have a scheduled date
      // (ones with scheduled dates are already in the date-filtered results)
      const allWorkOrderIds = new Set(workOrders.map(wo => wo.id));
      for (const uwo of unassignedWorkOrders) {
        if (!allWorkOrderIds.has(uwo.id) && !uwo.scheduledStart) {
          workOrders.push(uwo);
        }
      }
      
      if (statusParam) {
        workOrders = workOrders.filter(wo => wo.status === statusParam);
      }

      const enrichedWorkOrders = await Promise.all(
        workOrders.map(async (wo) => {
          let job = null;
          if (wo.jobId) {
            const [j] = await db.select().from(crmJobs).where(eq(crmJobs.id, wo.jobId));
            job = j || null;
          }

          let customer = null;
          if (wo.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, wo.customerId));
            customer = cust || null;
          } else if (job?.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, job.customerId));
            customer = cust || null;
          }

          let property = null;
          if (wo.propertyId) {
            const [prop] = await db.select().from(crmProperties).where(eq(crmProperties.id, wo.propertyId));
            property = prop || null;
          }

          let project = null;
          if (wo.projectId) {
            const [proj] = await db.select().from(crmProjects).where(eq(crmProjects.id, wo.projectId));
            project = proj || null;
          }

          let tech = null;
          if (wo.assignedTechId) {
            const [t] = await db.select().from(crmUsers).where(eq(crmUsers.id, wo.assignedTechId));
            tech = t || null;
          }

          const enrichedWo = {
            ...wo,
            job,
            customer,
            property,
            project,
            tech,
          };
          // Debug: log isPending status for work orders that are pending
          if (wo.isPending) {
            console.log(`[Dispatch] Work order ${wo.id} isPending: ${wo.isPending}`);
          }
          return enrichedWo;
        })
      );

      return res.json(enrichedWorkOrders);
    } catch (error) {
      console.error("Error fetching dispatch work orders:", error);
      return res.status(500).json({ message: "Failed to fetch dispatch work orders" });
    }
  });

  // ============================================
  // CUSTOM AGREEMENT TYPES ROUTES
  // ============================================

  // GET /api/crm/custom-agreement-types - List all active custom agreement types
  app.get("/api/crm/custom-agreement-types", requireCrmAuth, async (req, res) => {
    try {
      const types = await db
        .select()
        .from(customAgreementTypes)
        .where(eq(customAgreementTypes.isActive, true))
        .orderBy(asc(customAgreementTypes.name));
      
      return res.json(types);
    } catch (error) {
      console.error("Error fetching custom agreement types:", error);
      return res.status(500).json({ message: "Failed to fetch custom agreement types" });
    }
  });

  // POST /api/crm/custom-agreement-types - Create a new custom agreement type
  // Also auto-creates a corresponding item in the Maintenance category
  app.post("/api/crm/custom-agreement-types", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const validated = insertCustomAgreementTypeSchema.parse(req.body);
      
      // Validate visits per period cannot exceed days in the period
      const frequency = validated.frequency || "annual";
      const visitsPerPeriod = validated.visitsPerPeriod || 2;
      const maxVisits = frequency === "weekly" ? 7 : frequency === "monthly" ? 30 : 365;
      
      if (visitsPerPeriod > maxVisits) {
        return res.status(400).json({ 
          message: `Visits per period cannot exceed ${maxVisits} for ${frequency} frequency` 
        });
      }
      
      const [created] = await db
        .insert(customAgreementTypes)
        .values(validated)
        .returning();
      
      // Auto-create a corresponding item in the Maintenance category
      await db.insert(crmItems).values({
        name: validated.name,
        description: validated.description || `${validated.name} - Custom Agreement Service`,
        category: "maintenance",
        itemType: "agreement",
        rate: validated.defaultPrice || "0",
        isActive: true,
      });
      
      return res.status(201).json(created);
    } catch (error) {
      console.error("Error creating custom agreement type:", error);
      return res.status(500).json({ message: "Failed to create custom agreement type" });
    }
  });

  // PATCH /api/crm/custom-agreement-types/:id - Update a custom agreement type
  app.patch("/api/crm/custom-agreement-types/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const [updated] = await db
        .update(customAgreementTypes)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(customAgreementTypes.id, req.params.id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Custom agreement type not found" });
      }
      
      return res.json(updated);
    } catch (error) {
      console.error("Error updating custom agreement type:", error);
      return res.status(500).json({ message: "Failed to update custom agreement type" });
    }
  });

  // DELETE /api/crm/custom-agreement-types/:id - Hard delete the agreement type and corresponding item
  app.delete("/api/crm/custom-agreement-types/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const [deleted] = await db
        .delete(customAgreementTypes)
        .where(eq(customAgreementTypes.id, req.params.id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ message: "Custom agreement type not found" });
      }
      
      // Also delete the corresponding item in the Maintenance category
      await db.delete(crmItems)
        .where(and(
          eq(crmItems.name, deleted.name),
          eq(crmItems.category, "maintenance")
        ));
      
      return res.json({ message: "Custom agreement type deleted" });
    } catch (error) {
      console.error("Error deleting custom agreement type:", error);
      return res.status(500).json({ message: "Failed to delete custom agreement type" });
    }
  });

  // GET /api/crm/work-subtypes/:visitType - Get dynamic work subtypes for a visit type
  app.get("/api/crm/work-subtypes/:visitType", requireCrmAuth, async (req, res) => {
    try {
      const visitType = req.params.visitType.toUpperCase() as keyof typeof workSubtypeByVisitType;
      
      if (visitType === "MAINTENANCE") {
        // Return "Preventative Maintenance" + all active custom agreement type names
        const customTypes = await db
          .select({ name: customAgreementTypes.name })
          .from(customAgreementTypes)
          .where(eq(customAgreementTypes.isActive, true))
          .orderBy(asc(customAgreementTypes.name));
        
        const subtypes = [
          "Preventative Maintenance",
          ...customTypes.map(t => t.name)
        ];
        
        return res.json(subtypes);
      }
      
      // For other visit types, return the static array
      const subtypes = workSubtypeByVisitType[visitType];
      if (!subtypes) {
        return res.status(400).json({ message: "Invalid visit type" });
      }
      
      return res.json([...subtypes]);
    } catch (error) {
      console.error("Error fetching work subtypes:", error);
      return res.status(500).json({ message: "Failed to fetch work subtypes" });
    }
  });

  // ============================================
  // CRM AGREEMENTS ROUTES
  // ============================================

  // GET /api/crm/agreements - List all agreements with search/filter
  app.get("/api/crm/agreements", requireCrmAuth, async (req, res) => {
    try {
      const { search, status, page = "1", limit = "25", tab = "all" } = req.query;
      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = parseInt(limit as string, 10) || 25;
      const offset = (pageNum - 1) * limitNum;

      // Date calculations for tab filtering
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayStr = today.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      const fifteenDaysFromNow = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);
      const fifteenDaysFromNowStr = fifteenDaysFromNow.toISOString().split('T')[0];

      let query = db.select().from(crmAgreements);
      let countQuery = db.select({ count: count() }).from(crmAgreements);

      const conditions = [];

      // Apply tab-based filtering (server-side filtering before pagination)
      // Status is stored directly in the status field: pending, active, grace_period, expired, cancelled
      if (tab === "all") {
        // All = everything except expired and cancelled
        conditions.push(
          or(
            eq(crmAgreements.status, "pending"),
            eq(crmAgreements.status, "active"),
            eq(crmAgreements.status, "grace_period")
          )
        );
      } else if (tab === "pending") {
        // Pending = awaiting first invoice payment
        conditions.push(eq(crmAgreements.status, "pending"));
      } else if (tab === "active") {
        // Active = fully operational agreements
        conditions.push(eq(crmAgreements.status, "active"));
      } else if (tab === "grace_period") {
        // Grace Period = renewal invoice sent, awaiting payment
        conditions.push(eq(crmAgreements.status, "grace_period"));
      } else if (tab === "expired") {
        // Expired = grace period passed without payment
        conditions.push(eq(crmAgreements.status, "expired"));
      } else if (tab === "upcoming_service") {
        // Upcoming Service = nextServiceDate between today and today+15
        conditions.push(
          and(
            sql`${crmAgreements.nextServiceDate} IS NOT NULL`,
            sql`${crmAgreements.nextServiceDate} >= ${todayStr}`,
            sql`${crmAgreements.nextServiceDate} <= ${fifteenDaysFromNowStr}`
          )
        );
      }

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

      // Compute status counts for ALL agreements (ignoring search/pagination)
      // Status is now stored directly as: pending, active, grace_period, expired, cancelled

      // Count pending: status='pending'
      const [pendingCount] = await db
        .select({ count: count() })
        .from(crmAgreements)
        .where(eq(crmAgreements.status, "pending"));

      // Count active: status='active'
      const [activeCount] = await db
        .select({ count: count() })
        .from(crmAgreements)
        .where(eq(crmAgreements.status, "active"));

      // Count grace_period: status='grace_period'
      const [gracePeriodCount] = await db
        .select({ count: count() })
        .from(crmAgreements)
        .where(eq(crmAgreements.status, "grace_period"));

      // Count expired: status='expired'
      const [expiredCount] = await db
        .select({ count: count() })
        .from(crmAgreements)
        .where(eq(crmAgreements.status, "expired"));

      // Count upcoming_service: nextServiceDate is 0-15 days from now
      const [upcomingServiceCount] = await db
        .select({ count: count() })
        .from(crmAgreements)
        .where(and(
          sql`${crmAgreements.nextServiceDate} IS NOT NULL`,
          sql`${crmAgreements.nextServiceDate} >= ${todayStr}`,
          sql`${crmAgreements.nextServiceDate} <= ${fifteenDaysFromNowStr}`
        ));

      const statusCounts = {
        pending: Number(pendingCount?.count || 0),
        active: Number(activeCount?.count || 0),
        grace_period: Number(gracePeriodCount?.count || 0),
        expired: Number(expiredCount?.count || 0),
        upcoming_service: Number(upcomingServiceCount?.count || 0),
        all_active: Number(pendingCount?.count || 0) + Number(activeCount?.count || 0) + Number(gracePeriodCount?.count || 0),
      };

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
        statusCounts,
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
      if (!normalizedBody.contractDate) delete normalizedBody.contractDate;
      if (!normalizedBody.appointmentDate) delete normalizedBody.appointmentDate;
      if (!normalizedBody.regionId) delete normalizedBody.regionId;

      const result = insertCrmAgreementSchema.safeParse(normalizedBody);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid agreement data", 
          errors: result.error.flatten() 
        });
      }

      // For pay-on-visit agreements, start as pending (awaiting first visit payment from tech)
      // For auto-invoice, start as pending (awaiting first invoice payment)
      const initialStatus = "pending";
      const activationDate = undefined;
      
      const [agreement] = await db
        .insert(crmAgreements)
        .values({
          ...result.data,
          status: initialStatus,
          activationDate: activationDate,
          // Keep isInitialCycle true for first cycle - it flips to false after first renewal
          isInitialCycle: true,
        })
        .returning();

      // Auto-generate maintenance visits if appointmentDate is provided
      if (agreement.appointmentDate) {
        const appointmentDate = new Date(agreement.appointmentDate);
        const cycleYear = appointmentDate.getFullYear();
        const visitsPerPeriod = agreement.visitsPerPeriod || 2;
        const frequency = agreement.frequency || "annual";
        
        // Calculate visit target dates based on frequency
        // Visits are evenly spaced within the period:
        // weekly: 7 days ÷ visits = days apart
        // monthly: 30 days ÷ visits = days apart
        // annual: 12 months ÷ visits = months apart
        const visits = [];
        
        // Helper to format date as YYYY-MM-DD without timezone issues
        const formatDateStr = (d: Date) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        for (let i = 0; i < visitsPerPeriod; i++) {
          const visitDate = new Date(appointmentDate);
          if (frequency === "weekly") {
            // Weekly: 7 days ÷ number of visits = days apart (minimum 1 day)
            const daysApart = Math.max(1, Math.round(7 / visitsPerPeriod));
            visitDate.setDate(visitDate.getDate() + (i * daysApart));
          } else if (frequency === "monthly") {
            // Monthly: 30 days ÷ number of visits = days apart (minimum 1 day)
            const daysApart = Math.max(1, Math.round(30 / visitsPerPeriod));
            visitDate.setDate(visitDate.getDate() + (i * daysApart));
          } else {
            // Annual: evenly spaced throughout the year (minimum 1 month)
            const monthsApart = Math.max(1, Math.round(12 / visitsPerPeriod));
            visitDate.setMonth(visitDate.getMonth() + (i * monthsApart));
          }
          
          const isLastVisit = i === visitsPerPeriod - 1;
          // For pay-on-visit agreements, the last visit is the renewal trigger
          const isRenewalTrigger = agreement.billingPreference === "pay_on_visit" && isLastVisit;
          
          visits.push({
            agreementId: agreement.id,
            visitNumber: i + 1,
            totalVisitsInCycle: visitsPerPeriod,
            cycleYear,
            targetDate: formatDateStr(visitDate),
            status: "pending" as const,
            isRenewalTrigger,
            renewalStatus: isRenewalTrigger ? "pending" as const : "none" as const,
          });
        }
        
        if (visits.length > 0) {
          await db.insert(maintenanceVisits).values(visits);
        }
      }

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

  // POST /api/crm/agreements/:id/send-invoice - Send renewal invoice for a single agreement
  app.post("/api/crm/agreements/:id/send-invoice", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const agreementId = req.params.id;
      
      const [agreement] = await db
        .select()
        .from(crmAgreements)
        .where(eq(crmAgreements.id, agreementId));

      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      console.log(`[AgreementRenewal] Manual invoice send for agreement ${agreement.agreementNumber} by ${user.email}`);
      
      const { processSingleAgreementRenewal } = await import("./services/agreementRenewalService");
      const result = await processSingleAgreementRenewal(agreement);
      
      await logCrmAudit(
        user.id,
        "agreement.invoice_sent",
        "agreement",
        agreementId,
        { 
          agreementNumber: agreement.agreementNumber,
          invoiceNumber: result.invoiceNumber,
          emailSent: result.emailSent,
          error: result.error
        },
        req.ip
      );

      if (result.error) {
        return res.status(500).json({ message: result.error, result });
      }

      return res.json(result);
    } catch (error) {
      console.error("Error sending agreement invoice:", error);
      return res.status(500).json({ message: "Failed to send agreement invoice" });
    }
  });

  // POST /api/crm/customers/import - Import customers from CSV
  app.post("/api/crm/customers/import", requireCrmSalesOrAbove, upload.single("file"), async (req, res) => {
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
      const imported: any[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = parseCSVLine(lines[i]);
          const row: Record<string, string> = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || "";
          });

          const customerData = {
            name: row["name"] || row["customer name"] || row["customername"] || row["customer"] || "",
            email: row["email"] || row["e-mail"] || null,
            phone: row["phone"] || row["telephone"] || row["tel"] || null,
            address1: row["address"] || row["street"] || row["address1"] || null,
            city: row["city"] || null,
            state: row["state"] || null,
            zip: row["zip"] || row["zipcode"] || row["postal code"] || null,
            notes: row["notes"] || row["note"] || null,
            fullAddress: null as string | null,
          };

          if (!customerData.name) {
            errors.push(`Row ${i + 1}: Missing customer name`);
            continue;
          }

          // Build full address if components are present
          if (customerData.address1 || customerData.city) {
            const addressParts = [customerData.address1, customerData.city, customerData.state, customerData.zip].filter(Boolean);
            customerData.fullAddress = addressParts.join(", ");
          }

          const [newCustomer] = await db.insert(crmCustomers).values({
            id: nanoid(),
            name: customerData.name,
            email: customerData.email,
            phone: customerData.phone,
            fullAddress: customerData.fullAddress,
            notes: customerData.notes,
          }).returning();
          autoSyncCustomer(newCustomer.id);

          imported.push(newCustomer);
        } catch (rowError) {
          errors.push(`Row ${i + 1}: ${rowError instanceof Error ? rowError.message : "Unknown error"}`);
        }
      }

      await logCrmAudit(
        user.id,
        "customers.imported",
        "crm_customers",
        null,
        { count: imported.length, errors: errors.length },
        req.ip
      );

      return res.json({
        imported: imported.length,
        errors: errors.length,
        errorDetails: errors.slice(0, 10),
      });
    } catch (error) {
      console.error("Error importing customers:", error);
      return res.status(500).json({ message: "Failed to import customers" });
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
  // MAINTENANCE REGIONS ROUTES
  // ============================================

  // GET /api/crm/maintenance-regions - List all maintenance regions
  app.get("/api/crm/maintenance-regions", requireCrmAuth, async (req, res) => {
    try {
      const regions = await db
        .select()
        .from(maintenanceRegions)
        .where(eq(maintenanceRegions.isActive, true))
        .orderBy(maintenanceRegions.name);
      return res.json(regions);
    } catch (error) {
      console.error("Error fetching maintenance regions:", error);
      return res.status(500).json({ message: "Failed to fetch maintenance regions" });
    }
  });

  // POST /api/crm/maintenance-regions - Create a new maintenance region
  app.post("/api/crm/maintenance-regions", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const { name, reminderDayOfMonth } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Region name is required" });
      }
      const [region] = await db
        .insert(maintenanceRegions)
        .values({
          name,
          reminderDayOfMonth: reminderDayOfMonth || 1,
        })
        .returning();
      return res.json(region);
    } catch (error: any) {
      console.error("Error creating maintenance region:", error);
      if (error.code === "23505") {
        return res.status(400).json({ message: "A region with this name already exists" });
      }
      return res.status(500).json({ message: "Failed to create maintenance region" });
    }
  });

  // PATCH /api/crm/maintenance-regions/:id - Update a maintenance region
  app.patch("/api/crm/maintenance-regions/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const { name, reminderDayOfMonth, isActive } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (reminderDayOfMonth !== undefined) updates.reminderDayOfMonth = reminderDayOfMonth;
      if (isActive !== undefined) updates.isActive = isActive;

      const [region] = await db
        .update(maintenanceRegions)
        .set(updates)
        .where(eq(maintenanceRegions.id, req.params.id))
        .returning();

      if (!region) {
        return res.status(404).json({ message: "Region not found" });
      }
      return res.json(region);
    } catch (error) {
      console.error("Error updating maintenance region:", error);
      return res.status(500).json({ message: "Failed to update maintenance region" });
    }
  });

  // ============================================
  // MAINTENANCE VISITS ROUTES
  // ============================================

  // GET /api/crm/agreements/:agreementId/visits - Get visits for an agreement
  app.get("/api/crm/agreements/:agreementId/visits", requireCrmAuth, async (req, res) => {
    try {
      const visits = await db
        .select()
        .from(maintenanceVisits)
        .where(eq(maintenanceVisits.agreementId, req.params.agreementId))
        .orderBy(maintenanceVisits.cycleYear, maintenanceVisits.visitNumber);
      return res.json(visits);
    } catch (error) {
      console.error("Error fetching maintenance visits:", error);
      return res.status(500).json({ message: "Failed to fetch maintenance visits" });
    }
  });

  // PATCH /api/crm/maintenance-visits/:id - Update a maintenance visit (link work order, mark complete, etc.)
  app.patch("/api/crm/maintenance-visits/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const { workOrderId, status, completedAt, notes } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (workOrderId !== undefined) updates.workOrderId = workOrderId;
      if (status !== undefined) updates.status = status;
      if (completedAt !== undefined) updates.completedAt = completedAt;
      if (notes !== undefined) updates.notes = notes;

      const [visit] = await db
        .update(maintenanceVisits)
        .set(updates)
        .where(eq(maintenanceVisits.id, req.params.id))
        .returning();

      if (!visit) {
        return res.status(404).json({ message: "Visit not found" });
      }
      return res.json(visit);
    } catch (error) {
      console.error("Error updating maintenance visit:", error);
      return res.status(500).json({ message: "Failed to update maintenance visit" });
    }
  });

  // ============================================
  // MAINTENANCE AGREEMENT TASKS ROUTES
  // ============================================

  // GET /api/crm/agreements/:agreementId/tasks - Get all tasks for an agreement with schedules, equipment, and parts
  app.get("/api/crm/agreements/:agreementId/tasks", requireCrmAuth, async (req, res) => {
    try {
      const { agreementId } = req.params;
      
      // Get all tasks for this agreement
      const tasks = await db
        .select()
        .from(maintenanceAgreementTasks)
        .where(eq(maintenanceAgreementTasks.agreementId, agreementId))
        .orderBy(maintenanceAgreementTasks.sortOrder, maintenanceAgreementTasks.createdAt);

      if (tasks.length === 0) {
        return res.json([]);
      }

      const taskIds = tasks.map(t => t.id);

      // Batch load schedules, equipment, and parts
      const [schedules, equipment, parts] = await Promise.all([
        db.select().from(maintenanceTaskSchedules).where(inArray(maintenanceTaskSchedules.taskId, taskIds)),
        db.select().from(maintenanceTaskEquipment).where(inArray(maintenanceTaskEquipment.taskId, taskIds)),
        db.select().from(maintenanceTaskParts).where(inArray(maintenanceTaskParts.taskId, taskIds)),
      ]);

      // Build maps for quick lookup
      const scheduleMap = new Map<string, typeof maintenanceTaskSchedules.$inferSelect>();
      schedules.forEach(s => scheduleMap.set(s.taskId, s));

      const equipmentMap = new Map<string, (typeof maintenanceTaskEquipment.$inferSelect)[]>();
      equipment.forEach(e => {
        if (!equipmentMap.has(e.taskId)) equipmentMap.set(e.taskId, []);
        equipmentMap.get(e.taskId)!.push(e);
      });

      const partsMap = new Map<string, (typeof maintenanceTaskParts.$inferSelect)[]>();
      parts.forEach(p => {
        if (!partsMap.has(p.taskId)) partsMap.set(p.taskId, []);
        partsMap.get(p.taskId)!.push(p);
      });

      // Enrich tasks with nested data
      const enrichedTasks = tasks.map(task => ({
        ...task,
        schedule: scheduleMap.get(task.id) || null,
        equipment: equipmentMap.get(task.id) || [],
        parts: partsMap.get(task.id) || [],
      }));

      return res.json(enrichedTasks);
    } catch (error) {
      console.error("Error fetching maintenance agreement tasks:", error);
      return res.status(500).json({ message: "Failed to fetch maintenance agreement tasks" });
    }
  });

  // POST /api/crm/agreements/:agreementId/tasks - Create a new task for an agreement
  app.post("/api/crm/agreements/:agreementId/tasks", requireCrmAuth, async (req, res) => {
    try {
      const { agreementId } = req.params;
      const parsed = insertMaintenanceAgreementTaskSchema.safeParse({ ...req.body, agreementId });
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid task data", errors: parsed.error.flatten() });
      }

      const [task] = await db
        .insert(maintenanceAgreementTasks)
        .values(parsed.data)
        .returning();

      return res.status(201).json(task);
    } catch (error) {
      console.error("Error creating maintenance agreement task:", error);
      return res.status(500).json({ message: "Failed to create maintenance agreement task" });
    }
  });

  // PUT /api/crm/agreements/:agreementId/tasks/:taskId - Update a task
  app.put("/api/crm/agreements/:agreementId/tasks/:taskId", requireCrmAuth, async (req, res) => {
    try {
      const { taskId } = req.params;
      const parsed = insertMaintenanceAgreementTaskSchema.partial().safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid task data", errors: parsed.error.flatten() });
      }

      const [task] = await db
        .update(maintenanceAgreementTasks)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(maintenanceAgreementTasks.id, taskId))
        .returning();

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      return res.json(task);
    } catch (error) {
      console.error("Error updating maintenance agreement task:", error);
      return res.status(500).json({ message: "Failed to update maintenance agreement task" });
    }
  });

  // DELETE /api/crm/agreements/:agreementId/tasks/:taskId - Delete a task (cascades to schedule, equipment, parts)
  app.delete("/api/crm/agreements/:agreementId/tasks/:taskId", requireCrmAuth, async (req, res) => {
    try {
      const { taskId } = req.params;

      const [deleted] = await db
        .delete(maintenanceAgreementTasks)
        .where(eq(maintenanceAgreementTasks.id, taskId))
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }

      return res.json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting maintenance agreement task:", error);
      return res.status(500).json({ message: "Failed to delete maintenance agreement task" });
    }
  });

  // POST /api/crm/agreements/:agreementId/tasks/:taskId/schedule - Create/update schedule for a task (upsert)
  app.post("/api/crm/agreements/:agreementId/tasks/:taskId/schedule", requireCrmAuth, async (req, res) => {
    try {
      const { taskId } = req.params;
      const parsed = insertMaintenanceTaskScheduleSchema.safeParse({ ...req.body, taskId });
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid schedule data", errors: parsed.error.flatten() });
      }

      // Delete existing schedule for this task (upsert behavior)
      await db.delete(maintenanceTaskSchedules).where(eq(maintenanceTaskSchedules.taskId, taskId));

      // Insert new schedule
      const [schedule] = await db
        .insert(maintenanceTaskSchedules)
        .values(parsed.data)
        .returning();

      return res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating/updating maintenance task schedule:", error);
      return res.status(500).json({ message: "Failed to create/update maintenance task schedule" });
    }
  });

  // POST /api/crm/agreements/:agreementId/tasks/:taskId/equipment - Add equipment to a task
  app.post("/api/crm/agreements/:agreementId/tasks/:taskId/equipment", requireCrmAuth, async (req, res) => {
    try {
      const { taskId } = req.params;
      const parsed = insertMaintenanceTaskEquipmentSchema.safeParse({ ...req.body, taskId });
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid equipment data", errors: parsed.error.flatten() });
      }

      const [equipment] = await db
        .insert(maintenanceTaskEquipment)
        .values(parsed.data)
        .returning();

      return res.status(201).json(equipment);
    } catch (error) {
      console.error("Error adding maintenance task equipment:", error);
      return res.status(500).json({ message: "Failed to add maintenance task equipment" });
    }
  });

  // DELETE /api/crm/agreements/:agreementId/tasks/:taskId/equipment/:equipmentId - Remove equipment
  app.delete("/api/crm/agreements/:agreementId/tasks/:taskId/equipment/:equipmentId", requireCrmAuth, async (req, res) => {
    try {
      const { equipmentId } = req.params;

      const [deleted] = await db
        .delete(maintenanceTaskEquipment)
        .where(eq(maintenanceTaskEquipment.id, equipmentId))
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Equipment not found" });
      }

      return res.json({ message: "Equipment removed successfully" });
    } catch (error) {
      console.error("Error removing maintenance task equipment:", error);
      return res.status(500).json({ message: "Failed to remove maintenance task equipment" });
    }
  });

  // POST /api/crm/agreements/:agreementId/tasks/:taskId/parts - Add a part to a task
  app.post("/api/crm/agreements/:agreementId/tasks/:taskId/parts", requireCrmAuth, async (req, res) => {
    try {
      const { taskId } = req.params;
      const parsed = insertMaintenanceTaskPartSchema.safeParse({ ...req.body, taskId });
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid part data", errors: parsed.error.flatten() });
      }

      const [part] = await db
        .insert(maintenanceTaskParts)
        .values(parsed.data)
        .returning();

      return res.status(201).json(part);
    } catch (error) {
      console.error("Error adding maintenance task part:", error);
      return res.status(500).json({ message: "Failed to add maintenance task part" });
    }
  });

  // DELETE /api/crm/agreements/:agreementId/tasks/:taskId/parts/:partId - Remove a part
  app.delete("/api/crm/agreements/:agreementId/tasks/:taskId/parts/:partId", requireCrmAuth, async (req, res) => {
    try {
      const { partId } = req.params;

      const [deleted] = await db
        .delete(maintenanceTaskParts)
        .where(eq(maintenanceTaskParts.id, partId))
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Part not found" });
      }

      return res.json({ message: "Part removed successfully" });
    } catch (error) {
      console.error("Error removing maintenance task part:", error);
      return res.status(500).json({ message: "Failed to remove maintenance task part" });
    }
  });

  // POST /api/crm/agreements/:agreementId/tasks/batch - Batch create/update tasks with nested schedule, equipment, parts
  app.post("/api/crm/agreements/:agreementId/tasks/batch", requireCrmAuth, async (req, res) => {
    try {
      const { agreementId } = req.params;
      const { tasks } = req.body;

      if (!Array.isArray(tasks)) {
        return res.status(400).json({ message: "tasks must be an array" });
      }

      const results: any[] = [];

      // Use a transaction for atomicity
      await db.transaction(async (tx) => {
        for (const taskData of tasks) {
          const { schedule, equipment, parts, ...taskFields } = taskData;

          // Validate and create/update task
          const taskParsed = insertMaintenanceAgreementTaskSchema.safeParse({ ...taskFields, agreementId });
          if (!taskParsed.success) {
            throw new Error(`Invalid task data: ${JSON.stringify(taskParsed.error.flatten())}`);
          }

          let task;
          if (taskFields.id) {
            // Update existing task
            const [updated] = await tx
              .update(maintenanceAgreementTasks)
              .set({ ...taskParsed.data, updatedAt: new Date() })
              .where(eq(maintenanceAgreementTasks.id, taskFields.id))
              .returning();
            task = updated;
          } else {
            // Create new task
            const [created] = await tx
              .insert(maintenanceAgreementTasks)
              .values(taskParsed.data)
              .returning();
            task = created;
          }

          if (!task) {
            throw new Error("Failed to create/update task");
          }

          // Handle schedule (upsert)
          if (schedule) {
            const scheduleParsed = insertMaintenanceTaskScheduleSchema.safeParse({ ...schedule, taskId: task.id });
            if (!scheduleParsed.success) {
              throw new Error(`Invalid schedule data: ${JSON.stringify(scheduleParsed.error.flatten())}`);
            }
            await tx.delete(maintenanceTaskSchedules).where(eq(maintenanceTaskSchedules.taskId, task.id));
            await tx.insert(maintenanceTaskSchedules).values(scheduleParsed.data);
          }

          // Handle equipment (delete existing and batch insert new)
          if (Array.isArray(equipment)) {
            await tx.delete(maintenanceTaskEquipment).where(eq(maintenanceTaskEquipment.taskId, task.id));

            if (equipment.length > 0) {
              const validatedEquipment = equipment.map(eq_item => {
                const eqParsed = insertMaintenanceTaskEquipmentSchema.safeParse({ ...eq_item, taskId: task.id });
                if (!eqParsed.success) {
                  throw new Error(`Invalid equipment data: ${JSON.stringify(eqParsed.error.flatten())}`);
                }
                return eqParsed.data;
              });
              await tx.insert(maintenanceTaskEquipment).values(validatedEquipment);
            }
          }

          // Handle parts (delete existing and batch insert new)
          if (Array.isArray(parts)) {
            await tx.delete(maintenanceTaskParts).where(eq(maintenanceTaskParts.taskId, task.id));

            if (parts.length > 0) {
              const validatedParts = parts.map(part => {
                const partParsed = insertMaintenanceTaskPartSchema.safeParse({ ...part, taskId: task.id });
                if (!partParsed.success) {
                  throw new Error(`Invalid part data: ${JSON.stringify(partParsed.error.flatten())}`);
                }
                return partParsed.data;
              });
              await tx.insert(maintenanceTaskParts).values(validatedParts);
            }
          }

          results.push(task);
        }
      });

      return res.status(201).json({ message: "Batch operation completed", tasks: results });
    } catch (error: any) {
      console.error("Error in batch maintenance task operation:", error);
      return res.status(500).json({ message: error.message || "Failed to complete batch operation" });
    }
  });

  // ============================================
  // CRM PROJECTS ROUTES
  // ============================================

  // GET /api/crm/projects - List all projects with filters (OPTIMIZED - batch loading)
  app.get("/api/crm/projects", requireCrmAuth, async (req, res) => {
    try {
      const { status, customerId, hasUpcomingWorkOrders, noWorkOrdersYet, agingApproved, hasSchedule, page = "1", limit = "25" } = req.query;
      const pageNum = parseInt(page as string, 10) || 1;
      // Allow higher limit for calendar view (hasSchedule=true)
      const maxLimit = hasSchedule === "true" ? 1000 : 50;
      const limitNum = Math.min(maxLimit, parseInt(limit as string, 10) || 25);
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];

      if (status) {
        const statuses = (status as string).split(",");
        if (statuses.length === 1) {
          conditions.push(eq(crmProjects.status, statuses[0]));
        } else {
          conditions.push(inArray(crmProjects.status, statuses));
        }
      }

      if (customerId) {
        conditions.push(eq(crmProjects.customerId, customerId as string));
      }

      // Filter for projects with scheduled dates (for calendar view)
      if (hasSchedule === "true") {
        conditions.push(isNotNull(crmProjects.startDate));
      }

      let query = db.select().from(crmProjects);
      let countQuery = db.select({ count: count() }).from(crmProjects);

      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        query = query.where(whereClause!) as typeof query;
        countQuery = countQuery.where(whereClause!) as typeof countQuery;
      }

      const [totalResult] = await countQuery;
      const total = totalResult?.count || 0;

      let projects = await query
        .orderBy(desc(crmProjects.createdAt))
        .limit(limitNum)
        .offset(offset);

      // BATCH LOAD: Get all customer IDs and project IDs, then load in one query each
      const customerIds = [...new Set(projects.map(p => p.customerId).filter(Boolean))] as string[];
      const projectIds = projects.map(p => p.id);

      // Batch load customers
      const customersMap = new Map<string, typeof crmCustomers.$inferSelect>();
      if (customerIds.length > 0) {
        const customersList = await db.select().from(crmCustomers).where(inArray(crmCustomers.id, customerIds));
        customersList.forEach(c => customersMap.set(c.id, c));
      }

      // Batch load work order counts and upcoming status per project
      const workOrderStats = await db
        .select({
          projectId: crmWorkOrders.projectId,
          count: sql<number>`count(*)`,
          upcomingCount: sql<number>`count(*) FILTER (WHERE ${crmWorkOrders.scheduledStart} > NOW())`,
        })
        .from(crmWorkOrders)
        .where(inArray(crmWorkOrders.projectId, projectIds))
        .groupBy(crmWorkOrders.projectId);

      const woStatsMap = new Map<string, { count: number; upcomingCount: number }>();
      workOrderStats.forEach(s => {
        if (s.projectId) {
          woStatsMap.set(s.projectId, { count: Number(s.count), upcomingCount: Number(s.upcomingCount) });
        }
      });

      // Enrich projects without N+1
      const enrichedProjects = projects.map((project) => {
        const customer = project.customerId ? customersMap.get(project.customerId) || null : null;
        const stats = woStatsMap.get(project.id) || { count: 0, upcomingCount: 0 };

        return {
          ...project,
          customerName: customer?.name || null,
          customer,
          workOrderCount: stats.count,
          hasUpcomingWorkOrders: stats.upcomingCount > 0,
        };
      });

      let filteredProjects = enrichedProjects;

      if (hasUpcomingWorkOrders === "true") {
        filteredProjects = filteredProjects.filter((p) => p.hasUpcomingWorkOrders);
      }

      if (noWorkOrdersYet === "true") {
        filteredProjects = filteredProjects.filter((p) => p.workOrderCount === 0);
      }

      if (agingApproved) {
        const daysAgo = parseInt(agingApproved as string, 10);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        filteredProjects = filteredProjects.filter(
          (p) =>
            p.status === "approved" &&
            p.workOrderCount === 0 &&
            p.approvedAt &&
            new Date(p.approvedAt) < cutoffDate
        );
      }

      return res.json({
        projects: filteredProjects,
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
      console.error("Error fetching projects:", error);
      return res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // GET /api/crm/projects/stats - Get project overview statistics
  app.get("/api/crm/projects/stats", requireCrmAuth, async (req, res) => {
    try {
      // Get all projects for stats calculation
      const allProjects = await db.select().from(crmProjects);
      
      const activeStatuses = ["lead", "equipment_ordered", "equipment_arrived", "approved", "in_progress"];
      const pendingStatuses = ["lead", "equipment_ordered"];
      
      const activeProjects = allProjects.filter(p => activeStatuses.includes(p.status));
      const pendingActions = allProjects.filter(p => pendingStatuses.includes(p.status));
      const completedProjects = allProjects.filter(p => p.status === "completed");
      
      // Calculate pipeline value from expectedValue of active projects
      const pipelineValue = activeProjects.reduce((sum, p) => {
        const val = p.expectedValue ? parseFloat(String(p.expectedValue)) : 0;
        return sum + val;
      }, 0);
      
      // Calculate completion rate
      const totalNonCancelled = allProjects.filter(p => p.status !== "cancelled").length;
      const completionRate = totalNonCancelled > 0 
        ? ((completedProjects.length / totalNonCancelled) * 100).toFixed(1)
        : "0.0";
      
      // Count by status
      const statusFunnel = {
        lead: allProjects.filter(p => p.status === "lead").length,
        equipment_ordered: allProjects.filter(p => p.status === "equipment_ordered").length,
        equipment_arrived: allProjects.filter(p => p.status === "equipment_arrived").length,
        approved: allProjects.filter(p => p.status === "approved").length,
        in_progress: allProjects.filter(p => p.status === "in_progress").length,
        completed: completedProjects.length,
        closed: allProjects.filter(p => p.status === "closed").length,
        cancelled: allProjects.filter(p => p.status === "cancelled").length,
      };
      
      return res.json({
        activeProjects: activeProjects.length,
        pendingActions: pendingActions.length,
        pipelineValue,
        completionRate,
        statusFunnel,
      });
    } catch (error) {
      console.error("Error fetching project stats:", error);
      return res.status(500).json({ message: "Failed to fetch project stats" });
    }
  });

  // GET /api/crm/projects/:id - Get single project with related work orders
  app.get("/api/crm/projects/:id", requireCrmAuth, async (req, res) => {
    try {
      const [project] = await db
        .select()
        .from(crmProjects)
        .where(eq(crmProjects.id, req.params.id));

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      let customer = null;
      if (project.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, project.customerId));
        customer = cust || null;
      }

      let property = null;
      if (project.propertyId) {
        const [prop] = await db.select().from(crmProperties).where(eq(crmProperties.id, project.propertyId));
        property = prop || null;
      }

      const workOrders = await db
        .select()
        .from(crmWorkOrders)
        .where(eq(crmWorkOrders.projectId, project.id))
        .orderBy(desc(crmWorkOrders.scheduledStart));

      return res.json({
        ...project,
        customerName: customer?.name || null,
        customer,
        property,
        workOrders,
        workOrderCount: workOrders.length,
      });
    } catch (error) {
      console.error("Error fetching project:", error);
      return res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  // POST /api/crm/projects - Create new project
  app.post("/api/crm/projects", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Pre-process date fields to convert ISO strings to Date objects
      // Append T12:00:00 to date-only strings to avoid timezone offset issues
      const body = { ...req.body };
      if (body.startDate !== undefined) {
        if (body.startDate && typeof body.startDate === 'string' && !body.startDate.includes('T')) {
          body.startDate = new Date(`${body.startDate}T12:00:00`);
        } else {
          body.startDate = body.startDate ? new Date(body.startDate) : null;
        }
      }
      if (body.endDate !== undefined) {
        if (body.endDate && typeof body.endDate === 'string' && !body.endDate.includes('T')) {
          body.endDate = new Date(`${body.endDate}T12:00:00`);
        } else {
          body.endDate = body.endDate ? new Date(body.endDate) : null;
        }
      }

      const result = insertCrmProjectSchema.safeParse(body);
      if (!result.success) {
        console.error("Project validation errors:", result.error.flatten());
        return res.status(400).json({
          message: "Invalid project data",
          errors: result.error.flatten(),
        });
      }

      const [project] = await db.insert(crmProjects).values(result.data).returning();

      await logCrmAudit(
        user.id,
        "project.created",
        "project",
        project.id,
        { title: project.title, projectType: project.projectType },
        req.ip
      );

      return res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      return res.status(500).json({ message: "Failed to create project" });
    }
  });

  // PATCH /api/crm/projects/:id - Update project
  app.patch("/api/crm/projects/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db
        .select()
        .from(crmProjects)
        .where(eq(crmProjects.id, req.params.id));

      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Pre-process date fields to convert ISO strings to Date objects
      const body = { ...req.body };
      if (body.startDate !== undefined) {
        body.startDate = body.startDate ? new Date(body.startDate) : null;
      }
      if (body.endDate !== undefined) {
        body.endDate = body.endDate ? new Date(body.endDate) : null;
      }
      if (body.proposalSentAt !== undefined) {
        body.proposalSentAt = body.proposalSentAt ? new Date(body.proposalSentAt) : null;
      }
      if (body.approvedAt !== undefined) {
        body.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
      }
      if (body.completedAt !== undefined) {
        body.completedAt = body.completedAt ? new Date(body.completedAt) : null;
      }
      if (body.closedAt !== undefined) {
        body.closedAt = body.closedAt ? new Date(body.closedAt) : null;
      }

      const allowedFields = insertCrmProjectSchema.partial();
      const result = allowedFields.safeParse(body);
      if (!result.success) {
        console.error("Project update validation error:", result.error.flatten().fieldErrors);
        return res.status(400).json({
          message: "Invalid request body",
          errors: result.error.flatten().fieldErrors,
        });
      }

      const [updated] = await db
        .update(crmProjects)
        .set({ ...result.data, updatedAt: new Date() })
        .where(eq(crmProjects.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "project.updated",
        "project",
        req.params.id,
        { updates: Object.keys(result.data) },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error updating project:", error);
      return res.status(500).json({ message: "Failed to update project" });
    }
  });

  // PATCH /api/crm/projects/:id/status - Update project status (pipeline transitions)
  app.patch("/api/crm/projects/:id/status", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { status } = req.body;
      if (!status || !projectStatusEnum.includes(status)) {
        return res.status(400).json({
          message: "Invalid status",
          validStatuses: projectStatusEnum,
        });
      }

      const [existing] = await db
        .select()
        .from(crmProjects)
        .where(eq(crmProjects.id, req.params.id));

      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      const updateData: Partial<InsertCrmProject> & { updatedAt: Date } = {
        status,
        updatedAt: new Date(),
      };

      if (status === "proposal_sent" && !existing.proposalSentAt) {
        updateData.proposalSentAt = new Date();
      } else if (status === "completed" && !existing.completedAt) {
        updateData.completedAt = new Date();
      } else if (status === "closed" && !existing.closedAt) {
        updateData.closedAt = new Date();
      }

      const [updated] = await db
        .update(crmProjects)
        .set(updateData)
        .where(eq(crmProjects.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "project.status_changed",
        "project",
        req.params.id,
        { previousStatus: existing.status, newStatus: status },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error updating project status:", error);
      return res.status(500).json({ message: "Failed to update project status" });
    }
  });

  // DELETE /api/crm/projects/:id - Delete project
  app.delete("/api/crm/projects/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db
        .select()
        .from(crmProjects)
        .where(eq(crmProjects.id, req.params.id));

      if (!existing) {
        return res.status(404).json({ message: "Project not found" });
      }

      const linkedWorkOrders = await db
        .select()
        .from(crmWorkOrders)
        .where(eq(crmWorkOrders.projectId, req.params.id));

      if (linkedWorkOrders.length > 0) {
        await db
          .update(crmWorkOrders)
          .set({ projectId: null })
          .where(eq(crmWorkOrders.projectId, req.params.id));
      }

      await db.delete(crmProjects).where(eq(crmProjects.id, req.params.id));

      await logCrmAudit(
        user.id,
        "project.deleted",
        "project",
        req.params.id,
        { title: existing.title, unlinkedWorkOrders: linkedWorkOrders.length },
        req.ip
      );

      return res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      return res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // ============================================
  // ACTIVITY FILE UPLOAD ENDPOINT
  // ============================================

  // POST /api/activities/upload - Upload files for activity attachments
  app.post("/api/activities/upload", requireCrmAuth, activityUpload.array('files', 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const attachments: ActivityAttachment[] = files.map(file => ({
        id: nanoid(),
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/api/activities/files/${file.filename}`
      }));

      return res.json(attachments);
    } catch (error: any) {
      console.error("Error uploading activity files:", error);
      if (error.message?.includes('File type')) {
        return res.status(400).json({ message: error.message });
      }
      return res.status(500).json({ message: "Failed to upload files" });
    }
  });

  // GET /api/activities/files/:filename - Protected endpoint to serve activity files
  app.get("/api/activities/files/:filename", requireCrmAuth, async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Validate filename to prevent path traversal
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ message: "Invalid filename" });
      }
      
      const filePath = path.join(activitiesUploadsDir, filename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Determine content type based on file extension
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      // Set headers for download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error serving activity file:", error);
      return res.status(500).json({ message: "Failed to serve file" });
    }
  });

  // ============================================
  // PROJECT ACTIVITY (TIMELINE) ROUTES
  // ============================================

  // GET /api/crm/projects/:id/activities - List activities for a project with filters
  app.get("/api/crm/projects/:id/activities", requireCrmAuth, async (req, res) => {
    try {
      const { type, startDate, endDate, pinnedOnly } = req.query;
      const projectId = req.params.id;

      // Build SQL query directly to avoid Drizzle ORM issues
      let sqlQuery = `
        SELECT 
          pa.id, pa.project_id as "projectId", pa.work_order_id as "workOrderId",
          pa.user_id as "userId", pa.activity_type as "activityType", 
          pa.title, pa.description, pa.metadata, pa.is_pinned as "isPinned",
          pa.created_at as "createdAt",
          u.name as "userName",
          wo.work_order_number as "workOrderNumber", wo.title as "workOrderTitle"
        FROM project_activities pa
        LEFT JOIN crm_users u ON pa.user_id = u.id
        LEFT JOIN crm_work_orders wo ON pa.work_order_id = wo.id
        WHERE pa.project_id = $1
      `;
      const params: any[] = [projectId];
      let paramIndex = 2;

      if (type && type !== "all") {
        sqlQuery += ` AND pa.activity_type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      if (pinnedOnly === "true") {
        sqlQuery += ` AND pa.is_pinned = true`;
      }

      if (startDate) {
        sqlQuery += ` AND pa.created_at >= $${paramIndex}`;
        params.push(new Date(startDate as string));
        paramIndex++;
      }

      if (endDate) {
        const endDateObj = new Date(endDate as string);
        endDateObj.setHours(23, 59, 59, 999);
        sqlQuery += ` AND pa.created_at <= $${paramIndex}`;
        params.push(endDateObj);
        paramIndex++;
      }

      sqlQuery += ` ORDER BY pa.created_at DESC`;

      const result = await db.execute(sql.raw(sqlQuery.replace(/\$(\d+)/g, (_, n) => {
        const val = params[parseInt(n) - 1];
        if (val === null || val === undefined) return 'NULL';
        if (val instanceof Date) return `'${val.toISOString()}'`;
        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
        return String(val);
      })));

      const activities = (result.rows || []).map((row: any) => ({
        id: row.id,
        projectId: row.projectId,
        workOrderId: row.workOrderId,
        userId: row.userId,
        activityType: row.activityType,
        title: row.title,
        description: row.description,
        metadata: row.metadata,
        isPinned: row.isPinned,
        createdAt: row.createdAt,
        userName: row.userName || null,
        workOrder: row.workOrderId ? {
          id: row.workOrderId,
          workOrderNumber: row.workOrderNumber,
          title: row.workOrderTitle,
        } : null,
      }));

      // DEBUG: Log fetched activities
      console.log(`[TIMELINE DEBUG] GET activities for project ${projectId}:`, {
        count: activities.length,
        ids: activities.slice(0, 10).map((a: any) => ({ id: a.id, type: a.activityType, title: a.title })),
        filters: { type, startDate, endDate, pinnedOnly },
      });

      return res.json(activities);
    } catch (error) {
      console.error("Error fetching project activities:", error);
      return res.status(500).json({ message: "Failed to fetch project activities" });
    }
  });

  // POST /api/crm/projects/:id/activities - Create a new activity
  app.post("/api/crm/projects/:id/activities", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const projectId = req.params.id;

      // Verify project exists
      const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const { activityType, metadata } = req.body;

      // Validate metadata based on activityType
      if (metadata) {
        let metadataValidation;
        switch (activityType) {
          case "note":
            metadataValidation = noteMetadataSchema.safeParse(metadata);
            break;
          case "photo":
            metadataValidation = photoMetadataSchema.safeParse(metadata);
            break;
          case "file":
            metadataValidation = fileMetadataSchema.safeParse(metadata);
            break;
          case "financial_update":
            metadataValidation = financialMetadataSchema.safeParse(metadata);
            break;
          case "approval":
            metadataValidation = approvalMetadataSchema.safeParse(metadata);
            break;
          default:
            metadataValidation = { success: true, data: metadata };
        }

        if (metadataValidation && !metadataValidation.success) {
          return res.status(400).json({ 
            message: `Invalid ${activityType} metadata`, 
            errors: metadataValidation.error?.errors 
          });
        }
      }

      const activityData = {
        ...req.body,
        activityType,
        projectId,
        userId: user.id,
      };

      const result = insertProjectActivitySchema.safeParse(activityData);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid activity data", errors: result.error.errors });
      }

      const [activity] = await db.insert(projectActivities).values(result.data).returning();

      // When equipment_status activity is created, automatically update project status to equipment_ordered
      // if current status is lead or proposal_sent
      if (activityType === "equipment_status") {
        const eligibleStatuses = ["lead", "proposal_sent"];
        if (eligibleStatuses.includes(project.status)) {
          await db
            .update(crmProjects)
            .set({ status: "equipment_ordered" })
            .where(eq(crmProjects.id, projectId));
          console.log(`[EQUIPMENT TRACKING] Updated project ${projectId} status from ${project.status} to equipment_ordered`);
        }
      }

      // DEBUG: Log created activity
      console.log(`[TIMELINE DEBUG] Activity CREATED:`, {
        id: activity.id,
        projectId: activity.projectId,
        workOrderId: activity.workOrderId,
        activityType: activity.activityType,
        title: activity.title,
        createdAt: activity.createdAt,
      });

      // DEBUG: Read back from DB to verify persistence
      const [readBack] = await db
        .select({
          id: projectActivities.id,
          projectId: projectActivities.projectId,
          workOrderId: projectActivities.workOrderId,
          activityType: projectActivities.activityType,
          title: projectActivities.title,
          createdAt: projectActivities.createdAt,
        })
        .from(projectActivities)
        .where(eq(projectActivities.id, activity.id));
      
      console.log(`[TIMELINE DEBUG] DB read-back for ${activity.id}:`, readBack);

      return res.status(201).json(activity);
    } catch (error) {
      console.error("Error creating project activity:", error);
      return res.status(500).json({ message: "Failed to create project activity" });
    }
  });

  // PATCH /api/crm/projects/:projectId/activities/:activityId - Update activity (toggle pin)
  app.patch("/api/crm/projects/:projectId/activities/:activityId", requireCrmAuth, async (req, res) => {
    try {
      const { activityId } = req.params;
      const { isPinned } = req.body;

      const [existing] = await db.select().from(projectActivities).where(eq(projectActivities.id, activityId));
      if (!existing) {
        return res.status(404).json({ message: "Activity not found" });
      }

      const [updated] = await db
        .update(projectActivities)
        .set({ isPinned: isPinned !== undefined ? isPinned : existing.isPinned })
        .where(eq(projectActivities.id, activityId))
        .returning();

      return res.json(updated);
    } catch (error) {
      console.error("Error updating project activity:", error);
      return res.status(500).json({ message: "Failed to update project activity" });
    }
  });

  // DELETE /api/crm/projects/:projectId/activities/:activityId - Delete activity
  app.delete("/api/crm/projects/:projectId/activities/:activityId", requireCrmAuth, async (req, res) => {
    try {
      const { projectId, activityId } = req.params;

      const [existing] = await db.select().from(projectActivities).where(eq(projectActivities.id, activityId));
      if (!existing) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // If deleting an equipment_status activity, revert project to "lead" status
      if (existing.activityType === "equipment_status") {
        console.log(`[DeleteActivity] Deleting equipment_status activity, reverting project ${projectId} to lead status`);
        await db.update(crmProjects)
          .set({ 
            status: "lead",
            updatedAt: new Date()
          })
          .where(eq(crmProjects.id, projectId));
      }

      await db.delete(projectActivities).where(eq(projectActivities.id, activityId));

      return res.json({ 
        message: "Activity deleted successfully",
        revertedStatus: existing.activityType === "equipment_status" ? "lead" : null
      });
    } catch (error) {
      console.error("Error deleting project activity:", error);
      return res.status(500).json({ message: "Failed to delete project activity" });
    }
  });

  // ============================================
  // CRM INVOICE ROUTES
  // ============================================

  // Helper to generate invoice number: INV-YYYYMMDD-XXX (sequential)
  // Uses America/New_York timezone (Eastern Time) for consistent date formatting
  async function generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, "");
    const prefix = `INV-${dateStr}-`;
    
    const todayInvoices = await db.select({ invoiceNumber: crmInvoices.invoiceNumber })
      .from(crmInvoices)
      .where(sql`${crmInvoices.invoiceNumber} LIKE ${prefix + '%'}`)
      .orderBy(desc(crmInvoices.invoiceNumber))
      .limit(1);
    
    let seq = 1;
    if (todayInvoices.length > 0 && todayInvoices[0].invoiceNumber) {
      const lastSeq = parseInt(todayInvoices[0].invoiceNumber.split('-').pop() || '0', 10);
      seq = lastSeq + 1;
    }
    
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  // GET /api/crm/invoices - List invoices with filters and pagination (OPTIMIZED)
  app.get("/api/crm/invoices", requireCrmAuth, async (req, res) => {
    try {
      const { customerId, status, workOrderId, projectId, agreementId, page = "1", limit = "25" } = req.query;
      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = Math.min(50, parseInt(limit as string, 10) || 25);
      const offset = (pageNum - 1) * limitNum;
      
      const conditions: any[] = [];
      if (customerId) {
        conditions.push(eq(crmInvoices.customerId, customerId as string));
      }
      if (status) {
        conditions.push(eq(crmInvoices.status, status as string));
      }
      if (workOrderId) {
        conditions.push(eq(crmInvoices.workOrderId, workOrderId as string));
      }
      if (projectId) {
        conditions.push(eq(crmInvoices.projectId, projectId as string));
      }
      if (agreementId) {
        conditions.push(eq(crmInvoices.agreementId, agreementId as string));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(crmInvoices)
        .where(whereClause);
      const total = Number(countResult?.count) || 0;
      
      // Get paginated invoices
      const invoices = await db
        .select()
        .from(crmInvoices)
        .where(whereClause)
        .orderBy(desc(crmInvoices.createdAt))
        .limit(limitNum)
        .offset(offset);
      
      // BATCH LOAD: Get unique IDs for customers and work orders (minimal data for list view)
      const customerIds = [...new Set(invoices.map(i => i.customerId).filter(Boolean))] as string[];
      const workOrderIds = [...new Set(invoices.map(i => i.workOrderId).filter(Boolean))] as string[];
      
      const customersMap = new Map<string, { id: string; name: string | null }>();
      if (customerIds.length > 0) {
        const customersList = await db
          .select({ id: crmCustomers.id, name: crmCustomers.name })
          .from(crmCustomers)
          .where(inArray(crmCustomers.id, customerIds));
        customersList.forEach(c => customersMap.set(c.id, c));
      }
      
      const workOrdersMap = new Map<string, { id: string; workOrderNumber: number | null; title: string | null }>();
      if (workOrderIds.length > 0) {
        const workOrdersList = await db
          .select({ id: crmWorkOrders.id, workOrderNumber: crmWorkOrders.workOrderNumber, title: crmWorkOrders.title })
          .from(crmWorkOrders)
          .where(inArray(crmWorkOrders.id, workOrderIds));
        workOrdersList.forEach(wo => workOrdersMap.set(wo.id, wo));
      }
      
      // Enrich with minimal customer and work order data for list view
      const enrichedInvoices = invoices.map((invoice) => ({
        ...invoice,
        customerName: invoice.customerId ? customersMap.get(invoice.customerId)?.name || null : null,
        workOrder: invoice.workOrderId ? workOrdersMap.get(invoice.workOrderId) || null : null,
      }));
      
      return res.json({
        invoices: enrichedInvoices,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching invoices:", error);
      return res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // GET /api/crm/invoices/:id - Get invoice with line items
  app.get("/api/crm/invoices/:id", requireCrmAuth, async (req, res) => {
    try {
      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const lineItems = await db.select().from(crmInvoiceLineItems)
        .where(eq(crmInvoiceLineItems.invoiceId, req.params.id))
        .orderBy(asc(crmInvoiceLineItems.sortOrder));
      
      let customer = null;
      if (invoice.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, invoice.customerId));
        customer = cust || null;
      }
      
      let workOrder = null;
      if (invoice.workOrderId) {
        const [wo] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, invoice.workOrderId));
        workOrder = wo || null;
      }
      
      let project = null;
      if (invoice.projectId) {
        const [proj] = await db.select().from(crmProjects).where(eq(crmProjects.id, invoice.projectId));
        project = proj || null;
      }
      
      return res.json({
        ...invoice,
        lineItems,
        customer,
        workOrder,
        project,
      });
    } catch (error) {
      console.error("Error fetching invoice:", error);
      return res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // POST /api/crm/invoices - Create invoice (requires workOrderId)
  app.post("/api/crm/invoices", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { lineItems, ...invoiceData } = req.body;
      
      if (!invoiceData.workOrderId) {
        return res.status(400).json({ message: "workOrderId is required - invoices must be tied to a work order" });
      }
      
      const [workOrder] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, invoiceData.workOrderId));
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      
      const invoiceNumber = await generateInvoiceNumber();
      
      const invoiceToCreate = {
        ...invoiceData,
        invoiceNumber,
        customerId: invoiceData.customerId || workOrder.customerId,
        propertyId: invoiceData.propertyId || workOrder.propertyId,
        projectId: invoiceData.projectId || workOrder.projectId,
        createdBy: user.id,
        subtotal: invoiceData.subtotal ?? "0",
        total: invoiceData.total ?? "0",
        amountPaid: invoiceData.amountPaid ?? "0",
        balanceDue: invoiceData.balanceDue ?? "0",
      };
      
      const parseResult = insertCrmInvoiceSchema.safeParse(invoiceToCreate);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parseResult.error.errors 
        });
      }
      
      const [invoice] = await db.insert(crmInvoices).values(parseResult.data).returning();
      autoSyncInvoice(invoice.id);
      
      await db.update(crmWorkOrders)
        .set({ 
          billingDisposition: "invoice_created" as const,
          invoiceId: invoice.id,
          updatedAt: new Date()
        })
        .where(eq(crmWorkOrders.id, invoiceData.workOrderId));
      
      let createdLineItems: CrmInvoiceLineItem[] = [];
      if (lineItems && Array.isArray(lineItems)) {
        // Validate discount line items before creating
        const discountValidation = validateDiscountLineItems(lineItems, [], 'invoice');
        if (!discountValidation.valid) {
          // Rollback: delete the invoice we just created
          await db.delete(crmInvoices).where(eq(crmInvoices.id, invoice.id));
          await db.update(crmWorkOrders)
            .set({ billingDisposition: null, invoiceId: null, updatedAt: new Date() })
            .where(eq(crmWorkOrders.id, invoiceData.workOrderId));
          return res.status(400).json({ message: discountValidation.error });
        }
        
        // Batch insert: Validate all items first, then insert in one operation
        const validatedItems = lineItems
          .map(item => insertCrmInvoiceLineItemSchema.safeParse({ ...item, invoiceId: invoice.id }))
          .filter(result => result.success)
          .map(result => result.data);

        if (validatedItems.length > 0) {
          createdLineItems = await db.insert(crmInvoiceLineItems).values(validatedItems).returning();
        }
      }
      
      await logCrmAudit(
        user.id,
        "invoice.created",
        "invoice",
        invoice.id,
        { invoiceNumber: invoice.invoiceNumber, workOrderId: invoice.workOrderId, customerId: invoice.customerId, total: invoice.total },
        req.ip
      );
      
      return res.status(201).json({ ...invoice, lineItems: createdLineItems });
    } catch (error) {
      console.error("Error creating invoice:", error);
      return res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  // POST /api/crm/invoices/from-quote - Create invoice from accepted quote
  app.post("/api/crm/invoices/from-quote", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { quoteId, selectedOption, workOrderId: providedWorkOrderId } = req.body;
      if (!quoteId) {
        return res.status(400).json({ message: "quoteId is required" });
      }

      // Get the quote with line items
      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, quoteId));
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Quote must be accepted
      if (quote.status !== "accepted") {
        return res.status(400).json({ message: "Only accepted quotes can be converted to invoices" });
      }

      // Determine workOrderId - use provided, fall back to quote's, or require selection
      let workOrderIdToUse = providedWorkOrderId || quote.workOrderId;

      // If no work order is linked, require one for invoice creation
      if (!workOrderIdToUse) {
        // Get available work orders - first try project, then fall back to customer
        let availableWorkOrders: Array<{ id: string; title: string | null; workOrderNumber: number | null; visitType: string | null; scheduledStart: Date | null }> = [];
        
        if (quote.projectId) {
          availableWorkOrders = await db.select({
            id: crmWorkOrders.id,
            title: crmWorkOrders.title,
            workOrderNumber: crmWorkOrders.workOrderNumber,
            visitType: crmWorkOrders.visitType,
            scheduledStart: crmWorkOrders.scheduledStart,
          }).from(crmWorkOrders).where(eq(crmWorkOrders.projectId, quote.projectId));
        } else if (quote.customerId) {
          // Fall back to customer's work orders if no project
          availableWorkOrders = await db.select({
            id: crmWorkOrders.id,
            title: crmWorkOrders.title,
            workOrderNumber: crmWorkOrders.workOrderNumber,
            visitType: crmWorkOrders.visitType,
            scheduledStart: crmWorkOrders.scheduledStart,
          }).from(crmWorkOrders)
            .where(eq(crmWorkOrders.customerId, quote.customerId))
            .orderBy(desc(crmWorkOrders.createdAt))
            .limit(20);
        }
        
        return res.status(400).json({ 
          message: "Invoices must be tied to a work order. Please select or create a work order first.",
          requiresWorkOrder: true,
          availableWorkOrders,
          quoteCustomerId: quote.customerId,
          quotePropertyId: quote.propertyId,
          quoteProjectId: quote.projectId,
        });
      }

      // If a new work order is being linked, update the quote
      if (providedWorkOrderId && providedWorkOrderId !== quote.workOrderId) {
        await db.update(crmQuotes)
          .set({ workOrderId: providedWorkOrderId })
          .where(eq(crmQuotes.id, quoteId));
      }

      // Check if this quote was already converted
      if (quote.status === "converted") {
        return res.status(400).json({ 
          message: "This quote has already been converted to an invoice"
        });
      }

      // Get quote line items
      let quoteLineItems = await db.select().from(crmQuoteLineItems).where(eq(crmQuoteLineItems.quoteId, quoteId));
      
      // For multi-option quotes, filter line items by selected option
      // Fall back to persisted selectedOption if not provided in request
      const optionToUse = selectedOption || quote.selectedOption;
      
      if (quote.quoteMode === "options") {
        const uniqueOptions = [...new Set(quoteLineItems.map(item => item.optionTag).filter(Boolean))];
        
        if (uniqueOptions.length > 1 && !optionToUse) {
          // Multi-option quote requires selecting an option
          return res.status(400).json({ 
            message: "This is a multi-option quote. Please select which option the customer chose.",
            requiresOptionSelection: true,
            availableOptions: uniqueOptions
          });
        }
        
        if (optionToUse) {
          quoteLineItems = quoteLineItems.filter(item => item.optionTag === optionToUse);
          
          // Verify we have line items after filtering
          if (quoteLineItems.length === 0) {
            return res.status(400).json({ 
              message: `No line items found for option "${optionToUse}". Please check that this quote has line items with this option tag.`,
              requiresOptionSelection: true,
              availableOptions: uniqueOptions
            });
          }
          
          // Update quote with selected option if not already set
          if (selectedOption && selectedOption !== quote.selectedOption) {
            await db.update(crmQuotes)
              .set({ selectedOption })
              .where(eq(crmQuotes.id, quoteId));
          }
        }
      }

      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber();

      // Calculate subtotal from the line items
      // For multi-option quotes with a selected option, always sum the filtered line items
      // (which only contain the selected option's items at this point)
      // For single-option quotes, use the quote's total if available (includes sell price margins)
      let subtotal = 0;
      
      if (quote.quoteMode === "options" && optionToUse) {
        // For multi-option quotes, sum the selected option's line items
        for (const item of quoteLineItems) {
          subtotal += parseFloat(item.lineTotal || "0");
        }
      } else {
        // For single-option quotes, use quote.total if available (preserves sell price)
        const quoteTotal = parseFloat(quote.total || "0");
        if (quoteTotal > 0) {
          subtotal = quoteTotal;
        } else {
          // Fall back to summing line items
          for (const item of quoteLineItems) {
            subtotal += parseFloat(item.lineTotal || "0");
          }
        }
      }

      // Calculate balance due (subtract any deposit already paid)
      const depositPaid = parseFloat(quote.depositAmount || "0");
      const balanceDue = Math.max(0, subtotal - depositPaid);

      // Build notes to include deposit info if applicable
      let invoiceNotes = quote.notes || "";
      if (depositPaid > 0) {
        const depositNote = `Deposit received: $${depositPaid.toFixed(2)} (paid ${quote.depositPaidAt ? new Date(quote.depositPaidAt).toLocaleDateString() : 'previously'})`;
        invoiceNotes = invoiceNotes ? `${invoiceNotes}\n\n${depositNote}` : depositNote;
      }

      // Create the invoice
      const invoiceData = {
        invoiceNumber,
        customerId: quote.customerId,
        propertyId: quote.propertyId,
        workOrderId: workOrderIdToUse,
        projectId: quote.projectId,
        status: "draft" as const,
        subtotal: String(subtotal),
        laborTotal: "0",
        total: String(subtotal),
        amountPaid: depositPaid > 0 ? String(depositPaid) : undefined,
        balanceDue: String(balanceDue),
        notes: invoiceNotes || undefined,
        createdBy: user.id,
      };

      const [invoice] = await db.insert(crmInvoices).values(invoiceData).returning();
      autoSyncInvoice(invoice.id);

      // Copy line items to invoice - Batch insert for better performance
      const invoiceLineItemsToInsert = quoteLineItems.map(quoteItem => ({
        invoiceId: invoice.id,
        lineType: quoteItem.lineType,
        description: quoteItem.description,
        partNumber: quoteItem.partNumber,
        quantity: quoteItem.quantity,
        unitPrice: quoteItem.unitPrice,
        amount: quoteItem.lineTotal, // Required column - same as lineTotal
        lineTotal: quoteItem.lineTotal,
        sortOrder: quoteItem.sortOrder,
        itemId: quoteItem.itemId,
        isDiscountLine: quoteItem.isDiscountLine,
        discountKind: quoteItem.discountKind,
      }));

      const createdLineItems = await db.insert(crmInvoiceLineItems).values(invoiceLineItemsToInsert).returning();

      // Update quote status to converted
      await db.update(crmQuotes)
        .set({ status: "converted" as const, updatedAt: new Date() })
        .where(eq(crmQuotes.id, quoteId));

      // Update work order billing disposition
      if (workOrderIdToUse) {
        await db.update(crmWorkOrders)
          .set({ 
            billingDisposition: "invoice_created" as const,
            invoiceId: invoice.id,
            updatedAt: new Date()
          })
          .where(eq(crmWorkOrders.id, workOrderIdToUse));
      }

      // Log audit
      await logCrmAudit(
        user.id,
        "invoice.created_from_quote",
        "invoice",
        invoice.id,
        { invoiceNumber, quoteId, workOrderId: quote.workOrderId, total: invoice.total },
        req.ip
      );

      return res.status(201).json({ 
        invoice: { ...invoice, lineItems: createdLineItems },
        message: "Invoice created from quote successfully"
      });
    } catch (error) {
      console.error("Error creating invoice from quote:", error);
      return res.status(500).json({ message: "Failed to create invoice from quote" });
    }
  });

  // PATCH /api/crm/invoices/:id - Update invoice (only draft invoices can be edited)
  app.patch("/api/crm/invoices/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existingInvoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!existingInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (existingInvoice.status !== "draft") {
        return res.status(400).json({ message: "Only draft invoices can be edited" });
      }

      const { notes, subtotal, laborTotal, total, balanceDue, dueDate } = req.body;
      const updates: Partial<CrmInvoice> = {};
      
      if (notes !== undefined) updates.notes = notes;
      if (subtotal !== undefined) updates.subtotal = subtotal;
      if (laborTotal !== undefined) updates.laborTotal = laborTotal;
      if (total !== undefined) updates.total = total;
      if (balanceDue !== undefined) updates.balanceDue = balanceDue;
      if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
      updates.updatedAt = new Date();
      
      const [updatedInvoice] = await db.update(crmInvoices)
        .set(updates)
        .where(eq(crmInvoices.id, req.params.id))
        .returning();
      autoSyncInvoice(updatedInvoice.id);
      
      await logCrmAudit(
        user.id,
        "invoice.updated",
        "invoice",
        req.params.id,
        { changes: updates },
        req.ip
      );
      
      return res.json(updatedInvoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      return res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  // DELETE /api/crm/invoices/:id - Delete invoice (any status)
  app.delete("/api/crm/invoices/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existingInvoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!existingInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (existingInvoice.workOrderId) {
        await db.update(crmWorkOrders)
          .set({ billingDisposition: null, invoiceId: null, updatedAt: new Date() })
          .where(eq(crmWorkOrders.id, existingInvoice.workOrderId));
      }
      
      // Deactivate Stripe payment link if it exists
      if (existingInvoice.stripePaymentLinkId) {
        try {
          const { getUncachableStripeClient } = await import("./stripeClient");
          const stripe = await getUncachableStripeClient();
          await stripe.paymentLinks.update(existingInvoice.stripePaymentLinkId, {
            active: false
          });
          console.log(`[Invoice] Deactivated Stripe payment link ${existingInvoice.stripePaymentLinkId} for deleted invoice ${existingInvoice.invoiceNumber}`);
        } catch (stripeErr) {
          console.error(`[Invoice] Failed to deactivate Stripe payment link:`, stripeErr);
          // Don't fail the delete - just log the error
        }
      }
      
      // Delete any auto-created maintenance agreements that reference this invoice
      // Agreements are linked by the notes field containing "Auto-created from Invoice {invoiceNumber}"
      if (existingInvoice.invoiceNumber) {
        const autoCreatedAgreements = await db.select()
          .from(crmAgreements)
          .where(sql`${crmAgreements.notes} LIKE ${'%Auto-created from Invoice ' + existingInvoice.invoiceNumber + '%'}`);
        
        for (const agreement of autoCreatedAgreements) {
          // First delete maintenance visits for this agreement
          await db.delete(maintenanceVisits).where(eq(maintenanceVisits.agreementId, agreement.id));
          // Then delete the agreement itself
          await db.delete(crmAgreements).where(eq(crmAgreements.id, agreement.id));
          console.log(`[Invoice] Deleted auto-created agreement ${agreement.agreementNumber} along with invoice ${existingInvoice.invoiceNumber}`);
        }
      }
      
      // IMPORTANT: Capture QuickBooks sync info BEFORE deleting the CRM invoice
      // The sync record will be CASCADE deleted when the CRM invoice is deleted
      const [qbSyncRecord] = await db.select()
        .from(quickbooksInvoiceSync)
        .where(eq(quickbooksInvoiceSync.crmInvoiceId, req.params.id))
        .limit(1);
      
      const capturedQbInvoiceId = qbSyncRecord?.quickbooksInvoiceId;
      const capturedRealmId = qbSyncRecord?.realmId;
      
      // Delete the CRM invoice (this will CASCADE delete the sync record)
      await db.delete(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      
      // Now delete from QuickBooks using the captured ID (fire and forget)
      if (capturedQbInvoiceId && capturedRealmId) {
        autoDeleteInvoice(req.params.id, capturedQbInvoiceId, capturedRealmId);
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

  // GET /api/crm/work-orders/:id/invoices - Get invoices for a work order
  app.get("/api/crm/work-orders/:id/invoices", requireCrmAuth, async (req, res) => {
    try {
      const [workOrder] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, req.params.id));
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      
      const invoices = await db.select().from(crmInvoices)
        .where(eq(crmInvoices.workOrderId, req.params.id))
        .orderBy(desc(crmInvoices.createdAt));
      
      return res.json(invoices);
    } catch (error) {
      console.error("Error fetching work order invoices:", error);
      return res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // GET /api/crm/projects/:id/invoices - Get invoices for a project (via work orders)
  app.get("/api/crm/projects/:id/invoices", requireCrmAuth, async (req, res) => {
    try {
      const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, req.params.id));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const invoices = await db.select().from(crmInvoices)
        .where(eq(crmInvoices.projectId, req.params.id))
        .orderBy(desc(crmInvoices.createdAt));
      
      const enrichedInvoices = await Promise.all(
        invoices.map(async (invoice) => {
          let workOrder = null;
          if (invoice.workOrderId) {
            const [wo] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, invoice.workOrderId));
            workOrder = wo || null;
          }
          return { ...invoice, workOrder };
        })
      );
      
      return res.json(enrichedInvoices);
    } catch (error) {
      console.error("Error fetching project invoices:", error);
      return res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // POST /api/crm/invoices/:id/send - Mark invoice as sent
  app.post("/api/crm/invoices/:id/send", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (invoice.status !== "draft") {
        return res.status(400).json({ message: "Only draft invoices can be sent" });
      }
      
      const [updatedInvoice] = await db.update(crmInvoices)
        .set({ 
          status: "sent" as const,
          sentAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(crmInvoices.id, req.params.id))
        .returning();
      autoSyncInvoice(updatedInvoice.id);
      
      await logCrmAudit(
        user.id,
        "invoice.sent",
        "invoice",
        req.params.id,
        { invoiceNumber: invoice.invoiceNumber },
        req.ip
      );
      
      return res.json(updatedInvoice);
    } catch (error) {
      console.error("Error sending invoice:", error);
      return res.status(500).json({ message: "Failed to send invoice" });
    }
  });

  // POST /api/crm/invoices/:id/pay - Mark invoice as paid (with payment details)
  app.post("/api/crm/invoices/:id/pay", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (invoice.status === "paid") {
        return res.status(400).json({ message: "Invoice is already paid" });
      }
      
      if (invoice.status === "void") {
        return res.status(400).json({ message: "Cannot pay a voided invoice" });
      }
      
      const { amountPaid, paymentMethod, paymentReference } = req.body;
      
      if (!amountPaid || parseFloat(amountPaid) <= 0) {
        return res.status(400).json({ message: "amountPaid is required and must be positive" });
      }
      
      const totalAmount = parseFloat(invoice.total || "0");
      const previouslyPaid = parseFloat(invoice.amountPaid || "0");
      const paidAmount = parseFloat(amountPaid);
      const totalPaid = previouslyPaid + paidAmount;
      const balanceDue = Math.max(0, totalAmount - totalPaid);
      
      // Determine status based on whether balance is fully paid
      // If fully paid, set to "paid"; if partial payment made, set to "partial"
      const newStatus = balanceDue <= 0.01 ? "paid" as const : "partial" as const;
      
      const [updatedInvoice] = await db.update(crmInvoices)
        .set({ 
          status: newStatus,
          amountPaid: totalPaid.toFixed(2),
          balanceDue: balanceDue.toFixed(2),
          paidAt: balanceDue <= 0.01 ? new Date() : null,
          paymentMethod: paymentMethod || null,
          paymentReference: paymentReference || null,
          updatedAt: new Date()
        })
        .where(eq(crmInvoices.id, req.params.id))
        .returning();
      
      // Sync invoice and payment to QuickBooks
      autoSyncInvoice(updatedInvoice.id);
      autoSyncPayment(updatedInvoice.id, paidAmount.toFixed(2));
      
      // Deactivate Stripe payment link if invoice is fully paid and has one
      if (newStatus === "paid" && invoice.stripePaymentLinkId) {
        try {
          const { getUncachableStripeClient } = await import("./stripeClient");
          const stripe = await getUncachableStripeClient();
          await stripe.paymentLinks.update(invoice.stripePaymentLinkId, {
            active: false
          });
          console.log(`[Invoice] Deactivated Stripe payment link ${invoice.stripePaymentLinkId} for invoice ${invoice.invoiceNumber}`);
        } catch (stripeErr) {
          console.error(`[Invoice] Failed to deactivate Stripe payment link:`, stripeErr);
          // Don't fail the payment - just log the error
        }
      }
      
      await logCrmAudit(
        user.id,
        balanceDue <= 0.01 ? "invoice.paid" : "invoice.payment",
        "invoice",
        req.params.id,
        { invoiceNumber: invoice.invoiceNumber, amountPaid: paidAmount, totalPaid, balanceDue, paymentMethod, paymentReference },
        req.ip
      );
      
      // Auto-create maintenance agreement if invoice is fully paid and contains maintenance items
      // BUT skip if invoice is already linked to an existing agreement (to avoid duplication)
      if (newStatus === "paid" && invoice.customerId && !invoice.agreementId) {
        try {
          // Find maintenance line items by joining with crmItems catalog or checking description
          const lineItemsWithCatalog = await db.select({
            lineItem: crmInvoiceLineItems,
            catalogItem: crmItems,
          })
            .from(crmInvoiceLineItems)
            .leftJoin(crmItems, eq(crmInvoiceLineItems.itemId, crmItems.id))
            .where(eq(crmInvoiceLineItems.invoiceId, req.params.id));
          
          // Get all active custom agreement types to check names against
          const allCustomTypes = await db.select()
            .from(customAgreementTypes)
            .where(eq(customAgreementTypes.isActive, true));
          const customTypeNames = allCustomTypes.map(ct => ct.name.toLowerCase());
          
          // Filter for maintenance items: catalog category "maintenance", description contains keywords, OR matches custom agreement type name
          const maintenanceLineItems = lineItemsWithCatalog.filter(row => {
            const catalogCategory = row.catalogItem?.category?.toLowerCase();
            const catalogName = row.catalogItem?.name?.toLowerCase() || "";
            const description = row.lineItem.description?.toLowerCase() || "";
            
            return catalogCategory === "maintenance" || 
              description.includes("maintenance") ||
              description.includes("preventative") ||
              customTypeNames.includes(catalogName) ||
              customTypeNames.includes(description);
          });
          
          if (maintenanceLineItems.length > 0) {
            // FIRST: Check if there's already an existing agreement for this customer+property
            // This prevents creating duplicate agreements when invoice is created separately from existing agreement
            const existingAgreementConditions = [
              eq(crmAgreements.customerId, invoice.customerId),
              or(
                eq(crmAgreements.status, "pending"),
                eq(crmAgreements.status, "active"),
                eq(crmAgreements.status, "grace_period")
              )
            ];
            
            // If invoice has a propertyId, also match on property
            if (invoice.propertyId) {
              existingAgreementConditions.push(eq(crmAgreements.propertyId, invoice.propertyId));
            }
            
            const [existingAgreement] = await db.select()
              .from(crmAgreements)
              .where(and(...existingAgreementConditions))
              .limit(1);
            
            if (existingAgreement) {
              // Link this invoice to the existing agreement instead of creating a new one
              await db.update(crmInvoices)
                .set({ agreementId: existingAgreement.id, updatedAt: new Date() })
                .where(eq(crmInvoices.id, req.params.id));
              
              console.log(`[Invoice] Linked invoice ${invoice.invoiceNumber} to existing agreement ${existingAgreement.agreementNumber} (skipped duplicate creation)`);
              
              // Now trigger agreement activation if needed (same logic as when invoice.agreementId exists)
              const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
              
              if (existingAgreement.status === "pending" && existingAgreement.isInitialCycle) {
                await db.update(crmAgreements)
                  .set({
                    status: "active",
                    activationDate: todayStr,
                    isInitialCycle: false,
                    graceExpiresAt: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(crmAgreements.id, existingAgreement.id));
                
                console.log(`[Invoice] Activated existing agreement ${existingAgreement.agreementNumber} after linking invoice ${invoice.invoiceNumber}`);
              }
            } else {
              // No existing agreement found - proceed with auto-creation
            
            // Calculate total maintenance amount from line items (use lineTotal, not total)
            const maintenanceTotal = maintenanceLineItems.reduce((sum, row) => {
              return sum + parseFloat(row.lineItem.lineTotal || "0");
            }, 0);
            
            // Get the total quantity from maintenance line items for numberOfSystems
            const totalQuantity = maintenanceLineItems.reduce((sum, row) => {
              return sum + (parseInt(row.lineItem.quantity || "1") || 1);
            }, 0);
            
            // Get the maintenance item name for the agreement plan (use description or catalog name)
            const maintenanceItemName = maintenanceLineItems[0].catalogItem?.name || 
              maintenanceLineItems[0].lineItem.description || 
              "Preventative Maintenance";
            
            // Look up the custom agreement type to get frequency and visits per period
            const [customType] = await db.select()
              .from(customAgreementTypes)
              .where(and(
                eq(customAgreementTypes.name, maintenanceItemName),
                eq(customAgreementTypes.isActive, true)
              ))
              .limit(1);
            
            // Standard Preventative Maintenance is ALWAYS annual with 2 visits
            // Only use custom type settings if explicitly matching a custom agreement type
            const agreementFrequency = customType ? (customType.frequency as "weekly" | "monthly" | "annual") : "annual";
            // Use custom type's visitsPerPeriod directly - visits are NOT multiplied by quantity
            // Only the price is multiplied by quantity (handled by line total from invoice)
            const agreementVisitsPerPeriod = customType?.visitsPerPeriod || 2;
            
            // Use "Preventative Maintenance" as default plan name if no custom type found
            const agreementPlanName = customType ? maintenanceItemName : "Preventative Maintenance";
            
            // Get customer info for the agreement
            const [customer] = await db.select().from(crmCustomers)
              .where(eq(crmCustomers.id, invoice.customerId));
            
            if (customer) {
              // Use timezone-aware date to ensure correct calendar day in Eastern Time
              const nowUtc = new Date();
              const todayStr = nowUtc.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }); // YYYY-MM-DD in Eastern
              const today = new Date(todayStr + 'T12:00:00'); // Use noon to avoid DST edge cases
              
              // For weekly/monthly: NO grace period - first appointment is same as contract date
              // For annual: 1 month grace period before first appointment
              const appointmentDate = new Date(today);
              if (agreementFrequency === "annual") {
                appointmentDate.setMonth(appointmentDate.getMonth() + 1);
              }
              // For weekly/monthly, appointmentDate stays as today (no grace period)
              
              // End date depends on frequency:
              // Weekly: exactly 7 days later
              // Monthly: exactly 30 days later
              // Annual: 1 year later
              const endDate = new Date(today);
              if (agreementFrequency === "weekly") {
                endDate.setDate(endDate.getDate() + 7);
              } else if (agreementFrequency === "monthly") {
                endDate.setDate(endDate.getDate() + 30);
              } else {
                // Annual - default 1 year
                endDate.setFullYear(endDate.getFullYear() + 1);
              }
              
              // Generate agreement number
              const dateStr = todayStr.replace(/-/g, "");
              const existingAgreements = await db.select({ agreementNumber: crmAgreements.agreementNumber })
                .from(crmAgreements)
                .where(sql`${crmAgreements.agreementNumber} LIKE ${'MA-' + dateStr + '%'}`)
                .orderBy(desc(crmAgreements.createdAt))
                .limit(1);
              
              let sequence = 1;
              if (existingAgreements.length > 0 && existingAgreements[0].agreementNumber) {
                const parts = existingAgreements[0].agreementNumber.split('-');
                if (parts.length >= 3) {
                  sequence = parseInt(parts[2]) + 1;
                }
              }
              const agreementNumber = `MA-${dateStr}-${String(sequence).padStart(3, '0')}`;
              
              // Get the property address - use invoice's property or fall back to customer's default property
              let propertyId = invoice.propertyId;
              let propertyAddress = customer.fullAddress || "";
              
              if (propertyId) {
                // Get the property address for the agreement
                const [property] = await db.select().from(crmProperties)
                  .where(eq(crmProperties.id, propertyId));
                if (property) {
                  propertyAddress = `${property.address1}${property.address2 ? ' ' + property.address2 : ''}, ${property.city}, ${property.state} ${property.zip}`;
                }
              } else {
                // If no property on invoice, try to find customer's default property
                const [defaultProperty] = await db.select().from(crmProperties)
                  .where(eq(crmProperties.customerId, invoice.customerId))
                  .limit(1);
                if (defaultProperty) {
                  propertyId = defaultProperty.id;
                  propertyAddress = `${defaultProperty.address1}${defaultProperty.address2 ? ' ' + defaultProperty.address2 : ''}, ${defaultProperty.city}, ${defaultProperty.state} ${defaultProperty.zip}`;
                }
              }
              
              // Helper to format dates as YYYY-MM-DD
              const formatDateStr = (d: Date) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              };
              
              const appointmentDateStr = formatDateStr(appointmentDate);
              const endDateStr = formatDateStr(endDate);
              
              // Create the maintenance agreement
              const [newAgreement] = await db.insert(crmAgreements).values({
                customerId: invoice.customerId,
                propertyId: propertyId || null,
                agreementNumber,
                customerName: customer.name,
                agreementPlan: agreementPlanName,
                address: propertyAddress,
                numberOfSystems: totalQuantity, // Use quantity from invoice line items
                price: maintenanceTotal.toFixed(2),
                contractDate: todayStr,
                appointmentDate: appointmentDateStr,
                startDate: todayStr,
                endDate: endDateStr,
                nextServiceDate: appointmentDateStr,
                nextInvoiceDate: todayStr,
                status: "active",
                autoRenew: true,
                visitsPerPeriod: agreementVisitsPerPeriod,
                frequency: agreementFrequency,
                customAgreementTypeId: customType?.id || null,
                notes: `Auto-created from Invoice ${invoice.invoiceNumber}`,
              }).returning();
              
              // Generate maintenance visits for the new agreement based on frequency
              // Visits are evenly spaced within the period:
              // Weekly: 7 days ÷ visits = spacing
              // Monthly: 30 days ÷ visits = spacing
              // Annual: spread evenly across the year (months apart)
              if (newAgreement) {
                for (let i = 0; i < agreementVisitsPerPeriod; i++) {
                  const visitDate = new Date(appointmentDate);
                  
                  if (agreementFrequency === "weekly") {
                    // Weekly: 7 days ÷ number of visits = days apart (minimum 1 day)
                    const daysApart = Math.max(1, Math.round(7 / agreementVisitsPerPeriod));
                    visitDate.setDate(visitDate.getDate() + (i * daysApart));
                  } else if (agreementFrequency === "monthly") {
                    // Monthly: 30 days ÷ number of visits = days apart (minimum 1 day)
                    const daysApart = Math.max(1, Math.round(30 / agreementVisitsPerPeriod));
                    visitDate.setDate(visitDate.getDate() + (i * daysApart));
                  } else {
                    // Annual: spread evenly across the year (minimum 1 month)
                    const monthsApart = Math.max(1, Math.round(12 / agreementVisitsPerPeriod));
                    visitDate.setMonth(visitDate.getMonth() + (i * monthsApart));
                  }
                  
                  await db.insert(maintenanceVisits).values({
                    agreementId: newAgreement.id,
                    cycleYear: visitDate.getFullYear(),
                    visitNumber: i + 1,
                    targetDate: formatDateStr(visitDate),
                    status: "pending",
                  });
                }
                
                console.log(`[Invoice] Auto-created ${agreementFrequency} maintenance agreement ${agreementNumber} for customer ${customer.name} from invoice ${invoice.invoiceNumber} (${totalQuantity} systems, ${agreementVisitsPerPeriod} visits)`);
              }
            }
            } // Close the else block for "no existing agreement found"
          }
        } catch (agreementError) {
          console.error("Error auto-creating maintenance agreement:", agreementError);
          // Don't fail the payment - just log the error
        }
      }
      
      // Handle agreement activation and visit resets when an agreement-linked invoice is paid
      if (newStatus === "paid" && invoice.agreementId) {
        try {
          const [agreement] = await db.select().from(crmAgreements)
            .where(eq(crmAgreements.id, invoice.agreementId));
          
          if (agreement) {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
            
            // If agreement is pending and this is the initial cycle, activate it
            if (agreement.status === "pending" && agreement.isInitialCycle) {
              await db.update(crmAgreements)
                .set({
                  status: "active",
                  activationDate: todayStr,
                  isInitialCycle: false,
                  graceExpiresAt: null,
                  updatedAt: new Date(),
                })
                .where(eq(crmAgreements.id, agreement.id));
              
              console.log(`[Invoice] Activated agreement ${agreement.agreementNumber} after first payment (Invoice ${invoice.invoiceNumber})`);
            } 
            // If agreement is active/grace_period and not initial cycle, this is a renewal payment - reset visits
            else if ((agreement.status === "active" || agreement.status === "grace_period") && !agreement.isInitialCycle) {
              // Reset all visits for this agreement to pending for the new cycle
              const currentYear = new Date().getFullYear();
              
              // Mark old visits as cancelled and create new pending visits
              await db.update(maintenanceVisits)
                .set({ status: "cancelled" as const, updatedAt: new Date() })
                .where(and(
                  eq(maintenanceVisits.agreementId, agreement.id),
                  eq(maintenanceVisits.status, "pending")
                ));
              
              // Create new visits for the new cycle
              const visitsPerPeriod = agreement.visitsPerPeriod || 2;
              const frequency = agreement.frequency || "annual";
              const appointmentDate = new Date(agreement.appointmentDate || todayStr);
              const isPayOnVisit = agreement.billingPreference === "pay_on_visit";
              
              for (let i = 0; i < visitsPerPeriod; i++) {
                const visitDate = new Date(appointmentDate);
                if (frequency === "weekly") {
                  const daysApart = Math.max(1, Math.round(7 / visitsPerPeriod));
                  visitDate.setDate(visitDate.getDate() + (i * daysApart));
                } else if (frequency === "monthly") {
                  const daysApart = Math.max(1, Math.round(30 / visitsPerPeriod));
                  visitDate.setDate(visitDate.getDate() + (i * daysApart));
                } else {
                  const monthsApart = Math.max(1, Math.round(12 / visitsPerPeriod));
                  visitDate.setMonth(visitDate.getMonth() + (i * monthsApart));
                }
                
                const isLastVisit = i === visitsPerPeriod - 1;
                const isRenewalTrigger = isPayOnVisit && isLastVisit;
                
                await db.insert(maintenanceVisits).values({
                  agreementId: agreement.id,
                  cycleYear: currentYear,
                  visitNumber: i + 1,
                  totalVisitsInCycle: visitsPerPeriod,
                  targetDate: visitDate.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }),
                  status: "pending",
                  isRenewalTrigger,
                  renewalStatus: isRenewalTrigger ? "pending" as const : "none" as const,
                });
              }
              
              // Calculate new end date by extending by one term based on frequency
              const currentEndDate = agreement.endDate ? new Date(agreement.endDate) : new Date(todayStr);
              const newEndDate = new Date(currentEndDate);
              if (frequency === "weekly") {
                newEndDate.setDate(newEndDate.getDate() + 7);
              } else if (frequency === "monthly") {
                newEndDate.setDate(newEndDate.getDate() + 30);
              } else {
                // Annual - add 1 year
                newEndDate.setFullYear(newEndDate.getFullYear() + 1);
              }
              const newEndDateStr = newEndDate.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
              
              // Calculate next invoice date (same as new end date for next renewal)
              const newNextInvoiceDate = newEndDateStr;
              
              // Update agreement back to active (clearing grace period), extend end date, update next invoice date
              await db.update(crmAgreements)
                .set({
                  status: "active",
                  graceExpiresAt: null,
                  endDate: newEndDateStr,
                  nextInvoiceDate: newNextInvoiceDate,
                  isInitialCycle: false,
                  updatedAt: new Date(),
                })
                .where(eq(crmAgreements.id, agreement.id));
              
              console.log(`[Invoice] Renewed agreement ${agreement.agreementNumber} - visits reset to 0/${visitsPerPeriod}, end date extended to ${newEndDateStr} (Invoice ${invoice.invoiceNumber})`);
            }
          }
        } catch (agreementError) {
          console.error("Error updating agreement on payment:", agreementError);
          // Don't fail the payment - just log the error
        }
      }
      
      // Handle pay-on-visit renewal invoices linked via maintenanceVisits.renewalInvoiceId
      if (newStatus === "paid") {
        try {
          // Check if this invoice is linked as a renewal invoice on any maintenance visit
          const [renewalVisit] = await db.select()
            .from(maintenanceVisits)
            .where(eq(maintenanceVisits.renewalInvoiceId, req.params.id))
            .limit(1);
          
          if (renewalVisit) {
            // Get the agreement for this visit
            const [agreement] = await db.select()
              .from(crmAgreements)
              .where(eq(crmAgreements.id, renewalVisit.agreementId));
            
            if (agreement && agreement.billingPreference === "pay_on_visit") {
              const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
              const currentYear = new Date().getFullYear();
              const visitsPerPeriod = agreement.visitsPerPeriod || 2;
              const frequency = agreement.frequency || "annual";
              
              // Mark the renewal visit as collected
              await db.update(maintenanceVisits)
                .set({ 
                  renewalStatus: "collected" as const, 
                  updatedAt: new Date() 
                })
                .where(eq(maintenanceVisits.id, renewalVisit.id));
              
              // Cancel any old pending visits for previous cycle
              await db.update(maintenanceVisits)
                .set({ status: "cancelled" as const, updatedAt: new Date() })
                .where(and(
                  eq(maintenanceVisits.agreementId, agreement.id),
                  eq(maintenanceVisits.status, "pending"),
                  ne(maintenanceVisits.id, renewalVisit.id)
                ));
              
              // Calculate new dates based on frequency
              const currentEndDate = agreement.endDate ? new Date(agreement.endDate) : new Date(todayStr);
              const newEndDate = new Date(currentEndDate);
              const appointmentDate = new Date(agreement.appointmentDate || todayStr);
              
              // Extend end date by one term
              if (frequency === "weekly") {
                newEndDate.setDate(newEndDate.getDate() + 7);
              } else if (frequency === "monthly") {
                newEndDate.setDate(newEndDate.getDate() + 30);
              } else {
                // Annual - add 1 year
                newEndDate.setFullYear(newEndDate.getFullYear() + 1);
              }
              const newEndDateStr = newEndDate.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
              
              // Create new visits for the next cycle
              for (let i = 0; i < visitsPerPeriod; i++) {
                const visitDate = new Date(appointmentDate);
                if (frequency === "weekly") {
                  const daysApart = Math.max(1, Math.round(7 / visitsPerPeriod));
                  visitDate.setDate(visitDate.getDate() + (i * daysApart));
                } else if (frequency === "monthly") {
                  const daysApart = Math.max(1, Math.round(30 / visitsPerPeriod));
                  visitDate.setDate(visitDate.getDate() + (i * daysApart));
                } else {
                  const monthsApart = Math.max(1, Math.round(12 / visitsPerPeriod));
                  visitDate.setMonth(visitDate.getMonth() + (i * monthsApart));
                }
                
                const isLastVisit = i === visitsPerPeriod - 1;
                
                await db.insert(maintenanceVisits).values({
                  agreementId: agreement.id,
                  cycleYear: currentYear,
                  visitNumber: i + 1,
                  totalVisitsInCycle: visitsPerPeriod,
                  targetDate: visitDate.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }),
                  status: "pending",
                  isRenewalTrigger: isLastVisit,
                  renewalStatus: isLastVisit ? "pending" as const : "none" as const,
                });
              }
              
              // Update agreement: extend end date, update next invoice date, ensure active status
              await db.update(crmAgreements)
                .set({
                  status: "active",
                  graceExpiresAt: null,
                  endDate: newEndDateStr,
                  nextInvoiceDate: newEndDateStr,
                  isInitialCycle: false,
                  updatedAt: new Date(),
                })
                .where(eq(crmAgreements.id, agreement.id));
              
              console.log(`[Invoice] Pay-on-visit renewal completed for agreement ${agreement.agreementNumber} - end date extended to ${newEndDateStr}, ${visitsPerPeriod} new visits created (Invoice ${invoice.invoiceNumber})`);
            }
          }
        } catch (renewalError) {
          console.error("Error processing pay-on-visit renewal:", renewalError);
          // Don't fail the payment - just log the error
        }
      }
      
      return res.json(updatedInvoice);
    } catch (error) {
      console.error("Error marking invoice as paid:", error);
      return res.status(500).json({ message: "Failed to mark invoice as paid" });
    }
  });

  // POST /api/crm/invoices/:id/void - Mark invoice as void (with reason)
  app.post("/api/crm/invoices/:id/void", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (invoice.status === "void") {
        return res.status(400).json({ message: "Invoice is already voided" });
      }
      
      // Allow voiding paid invoices - revenue will be reversed in dashboard/goals calculations
      // Note: Paid invoices can now be voided to correct mistakes or handle refunds
      
      const { voidReason } = req.body;
      
      if (!voidReason || typeof voidReason !== 'string' || voidReason.trim() === '') {
        return res.status(400).json({ message: "voidReason is required" });
      }
      
      const [updatedInvoice] = await db.update(crmInvoices)
        .set({ 
          status: "void" as const,
          voidedAt: new Date(),
          voidReason: voidReason.trim(),
          updatedAt: new Date()
        })
        .where(eq(crmInvoices.id, req.params.id))
        .returning();
      
      if (invoice.workOrderId) {
        await db.update(crmWorkOrders)
          .set({ billingDisposition: null, invoiceId: null, updatedAt: new Date() })
          .where(eq(crmWorkOrders.id, invoice.workOrderId));
      }
      
      // Deactivate Stripe payment link if it exists
      if (invoice.stripePaymentLinkId) {
        try {
          const { getUncachableStripeClient } = await import("./stripeClient");
          const stripe = await getUncachableStripeClient();
          await stripe.paymentLinks.update(invoice.stripePaymentLinkId, {
            active: false
          });
          console.log(`[Invoice] Deactivated Stripe payment link ${invoice.stripePaymentLinkId} for voided invoice ${invoice.invoiceNumber}`);
        } catch (stripeErr) {
          console.error(`[Invoice] Failed to deactivate Stripe payment link:`, stripeErr);
          // Don't fail the void - just log the error
        }
      }
      
      // Void in QuickBooks if synced
      autoVoidInvoice(req.params.id);
      
      await logCrmAudit(
        user.id,
        "invoice.voided",
        "invoice",
        req.params.id,
        { invoiceNumber: invoice.invoiceNumber, voidReason },
        req.ip
      );
      
      return res.json(updatedInvoice);
    } catch (error) {
      console.error("Error voiding invoice:", error);
      return res.status(500).json({ message: "Failed to void invoice" });
    }
  });

  // POST /api/crm/invoices/:id/send-email - Send invoice via email (supports multiple recipients)
  app.post("/api/crm/invoices/:id/send-email", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { recipientEmail, personalMessage } = req.body;

      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id)).limit(1);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get customer info
      let customerName = "Customer";
      let defaultEmail = "";
      
      if (invoice.customerId) {
        const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, invoice.customerId)).limit(1);
        if (customer) {
          defaultEmail = customer.email || "";
          customerName = customer.name || "Customer";
        }
      }

      // Parse multiple emails (comma, semicolon, or space separated)
      const emailInput = recipientEmail || defaultEmail;
      if (!emailInput) {
        return res.status(400).json({ message: "No recipient email provided and customer has no email" });
      }
      
      const emailList = emailInput
        .split(/[,;\s]+/)
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e && e.includes("@"));
      
      if (emailList.length === 0) {
        return res.status(400).json({ message: "No valid email addresses provided" });
      }

      const lineItems = await db.select().from(crmInvoiceLineItems)
        .where(eq(crmInvoiceLineItems.invoiceId, invoice.id))
        .orderBy(crmInvoiceLineItems.sortOrder);

      const sentByName = user.displayName || user.name || user.email;
      const subject = `Your Invoice from Giesbrecht HVAC - ${invoice.invoiceNumber}`;
      const replyToEmail = user.email;
      
      console.log("[Invoice Email] Sending to multiple recipients:", emailList);

      // Send to all recipients
      const results: { email: string; success: boolean; error?: string; messageId?: string }[] = [];
      
      for (const email of emailList) {
        const result = await sendCrmInvoiceEmail(
          invoice,
          lineItems,
          email,
          customerName,
          personalMessage,
          sentByName,
          {
            senderEmail: user.email,
            senderName: sentByName,
            replyToEmail,
          }
        );

        await db.insert(invoiceEmailLogs).values({
          invoiceId: invoice.id,
          direction: "outgoing",
          fromEmail: result.fromEmail || "invoices@ghvacinc.com",
          recipientEmail: email,
          recipientName: customerName,
          subject,
          htmlContent: result.htmlContent || null,
          textContent: result.textContent || null,
          status: result.success ? "sent" : "failed",
          errorMessage: result.error || null,
          sentBy: user.id,
          personalMessage: personalMessage || null,
          isManual: false,
          resendMessageId: result.messageId || null,
          replyToEmail,
        });

        results.push({ email, success: result.success, error: result.error, messageId: result.messageId });
      }

      const successCount = results.filter(r => r.success).length;
      const allSucceeded = successCount === emailList.length;

      // Update invoice status to sent if it was draft and at least one email succeeded
      if (successCount > 0 && invoice.status === "draft") {
        await db.update(crmInvoices)
          .set({ 
            status: "sent" as const,
            sentAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(crmInvoices.id, invoice.id));
        
        // Trigger instant QuickBooks sync when invoice becomes "sent"
        autoSyncInvoice(invoice.id);
      }

      // Send SMS for auto-pay maintenance clients
      let smsSent = false;
      if (successCount > 0 && invoice.agreementId && invoice.customerId) {
        try {
          // Check if this is an auto-pay maintenance agreement
          const [agreement] = await db.select().from(crmAgreements)
            .where(eq(crmAgreements.id, invoice.agreementId)).limit(1);
          
          if (agreement && agreement.billingPreference === "auto_invoice") {
            // Get customer phone
            const [customer] = await db.select().from(crmCustomers)
              .where(eq(crmCustomers.id, invoice.customerId)).limit(1);
            
            if (customer?.phone) {
              // Check if SMS was already sent for this invoice
              const alreadySent = await hasNotificationBeenSent("invoice_sms", invoice.id, "invoice");
              
              if (!alreadySent) {
                // Get the first email result's payment link URL (already generated during email send)
                const emailResult = results.find(r => r.success);
                // Build payment link from the portal URL
                const host = req.get('host') || process.env.REPLIT_DOMAINS?.split(',')[0] || 'app.ghvacinc.com';
                const protocol = req.protocol || 'https';
                const paymentLink = `${protocol}://${host}/portal/invoice/${invoice.id}`;
                
                const invoiceSmsBody = await getInvoiceSmsTemplate(invoice.invoiceNumber, paymentLink);
                const smsResult = await sendAutomatedSms({
                  customerId: invoice.customerId,
                  phoneNumber: customer.phone,
                  messageBody: invoiceSmsBody,
                  notificationType: "invoice_sms",
                  invoiceId: invoice.id,
                });
                
                smsSent = smsResult.success;
                console.log(`[Invoice SMS] Auto-pay maintenance invoice SMS ${smsSent ? 'sent' : 'failed'} for ${invoice.invoiceNumber}`);
              }
            }
          }
        } catch (smsError) {
          console.error("[Invoice SMS] Error sending SMS for invoice:", smsError);
        }
      }

      await logCrmAudit(
        user.id,
        "invoice.email_sent",
        "invoice",
        invoice.id,
        { invoiceNumber: invoice.invoiceNumber, recipients: emailList, successCount, smsSent },
        req.ip
      );

      return res.json({ 
        success: allSucceeded, 
        successCount,
        totalCount: emailList.length,
        results,
        smsSent,
      });
    } catch (error) {
      console.error("Error sending invoice email:", error);
      return res.status(500).json({ message: "Failed to send invoice email" });
    }
  });

  // GET /api/crm/invoices/:id/email-logs - Get email logs for an invoice
  app.get("/api/crm/invoices/:id/email-logs", requireCrmAuth, async (req, res) => {
    try {
      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id)).limit(1);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const logs = await db.select().from(invoiceEmailLogs)
        .where(eq(invoiceEmailLogs.invoiceId, invoice.id))
        .orderBy(desc(invoiceEmailLogs.sentAt));

      return res.json(logs);
    } catch (error) {
      console.error("Error fetching invoice email logs:", error);
      return res.status(500).json({ message: "Failed to fetch email logs" });
    }
  });

  // POST /api/crm/invoices/:id/line-items - Add line item to invoice
  app.post("/api/crm/invoices/:id/line-items", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (invoice.status !== "draft") {
        return res.status(400).json({ message: "Can only add line items to draft invoices" });
      }
      
      // Get existing line items for discount validation
      const existingLineItems = await db.select().from(crmInvoiceLineItems)
        .where(eq(crmInvoiceLineItems.invoiceId, req.params.id));
      
      // Validate discount line item rules
      const discountValidation = validateDiscountLineItem(req.body, existingLineItems, undefined, 'invoice');
      if (!discountValidation.valid) {
        return res.status(400).json({ message: discountValidation.error });
      }
      
      const lineItemData = { ...req.body, invoiceId: req.params.id };
      const parseResult = insertCrmInvoiceLineItemSchema.safeParse(lineItemData);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parseResult.error.errors 
        });
      }
      
      const [lineItem] = await db.insert(crmInvoiceLineItems).values(parseResult.data).returning();
      
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
  app.patch("/api/crm/invoices/:id/line-items/:lineItemId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (invoice.status !== "draft") {
        return res.status(400).json({ message: "Can only update line items on draft invoices" });
      }
      
      const [existingLineItem] = await db.select().from(crmInvoiceLineItems)
        .where(and(
          eq(crmInvoiceLineItems.id, req.params.lineItemId),
          eq(crmInvoiceLineItems.invoiceId, req.params.id)
        ));
      
      if (!existingLineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      
      const { description, partNumber, quantity, unitPrice, lineTotal, sortOrder, lineType, isDiscountLine, discountKind } = req.body;
      
      // Merge existing line item data with updates to validate the final state
      const mergedLineItem = {
        ...existingLineItem,
        ...(description !== undefined && { description }),
        ...(partNumber !== undefined && { partNumber }),
        ...(quantity !== undefined && { quantity }),
        ...(unitPrice !== undefined && { unitPrice }),
        ...(lineTotal !== undefined && { lineTotal }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(lineType !== undefined && { lineType }),
        ...(isDiscountLine !== undefined && { isDiscountLine }),
        ...(discountKind !== undefined && { discountKind }),
      };
      
      // Get all line items for this invoice for discount validation
      const allLineItems = await db.select().from(crmInvoiceLineItems)
        .where(eq(crmInvoiceLineItems.invoiceId, req.params.id));
      
      // Validate discount line item rules
      const discountValidation = validateDiscountLineItem(mergedLineItem, allLineItems, req.params.lineItemId, 'invoice');
      if (!discountValidation.valid) {
        return res.status(400).json({ message: discountValidation.error });
      }
      
      const updates: any = {};
      if (description !== undefined) updates.description = description;
      if (partNumber !== undefined) updates.partNumber = partNumber;
      if (quantity !== undefined) updates.quantity = quantity;
      if (unitPrice !== undefined) updates.unitPrice = unitPrice;
      if (lineTotal !== undefined) updates.lineTotal = lineTotal;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (lineType !== undefined) updates.lineType = lineType;
      if (isDiscountLine !== undefined) updates.isDiscountLine = isDiscountLine;
      if (discountKind !== undefined) updates.discountKind = discountKind;
      
      const [updatedLineItem] = await db.update(crmInvoiceLineItems)
        .set(updates)
        .where(eq(crmInvoiceLineItems.id, req.params.lineItemId))
        .returning();
      
      await logCrmAudit(
        user.id,
        "invoice_line_item.updated",
        "invoice_line_item",
        req.params.lineItemId,
        { invoiceId: req.params.id, changes: updates },
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

      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, req.params.id));
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (invoice.status !== "draft") {
        return res.status(400).json({ message: "Can only delete line items from draft invoices" });
      }
      
      const [existingLineItem] = await db.select().from(crmInvoiceLineItems)
        .where(and(
          eq(crmInvoiceLineItems.id, req.params.lineItemId),
          eq(crmInvoiceLineItems.invoiceId, req.params.id)
        ));
      
      if (!existingLineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      
      await db.delete(crmInvoiceLineItems).where(eq(crmInvoiceLineItems.id, req.params.lineItemId));
      
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
  // CRM ITEMS ROUTES
  // =============================================

  // GET /api/crm/items - List all items (with optional search query)
  app.get("/api/crm/items", requireCrmAuth, async (req, res) => {
    try {
      const { search } = req.query;
      
      let items: CrmItem[];
      if (search && typeof search === 'string' && search.trim()) {
        items = await storage.searchCrmItems(search.trim());
      } else {
        items = await storage.getAllCrmItems();
      }
      
      return res.json(items);
    } catch (error) {
      console.error("Error fetching CRM items:", error);
      return res.status(500).json({ message: "Failed to fetch items" });
    }
  });

  // GET /api/crm/items/:id - Get single item
  app.get("/api/crm/items/:id", requireCrmAuth, async (req, res) => {
    try {
      const item = await storage.getCrmItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      return res.json(item);
    } catch (error) {
      console.error("Error fetching CRM item:", error);
      return res.status(500).json({ message: "Failed to fetch item" });
    }
  });

  // POST /api/crm/items - Create item (requires sales or above)
  app.post("/api/crm/items", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = insertCrmItemSchema.parse(req.body);
      const item = await storage.createCrmItem(validatedData);
      
      await logCrmAudit(
        user.id,
        "item.created",
        "crm_item",
        item.id,
        { name: item.name },
        req.ip
      );
      
      return res.status(201).json(item);
    } catch (error) {
      console.error("Error creating CRM item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to create item" });
    }
  });

  // PATCH /api/crm/items/:id - Update item (requires sales or above)
  app.patch("/api/crm/items/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existingItem = await storage.getCrmItem(req.params.id);
      if (!existingItem) {
        return res.status(404).json({ message: "Item not found" });
      }

      const validatedData = insertCrmItemSchema.partial().parse(req.body);
      const item = await storage.updateCrmItem(req.params.id, validatedData);
      
      await logCrmAudit(
        user.id,
        "item.updated",
        "crm_item",
        req.params.id,
        { changes: validatedData },
        req.ip
      );
      
      return res.json(item);
    } catch (error) {
      console.error("Error updating CRM item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to update item" });
    }
  });

  // DELETE /api/crm/items/:id - Delete item (requires sales or above)
  app.delete("/api/crm/items/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existingItem = await storage.getCrmItem(req.params.id);
      if (!existingItem) {
        return res.status(404).json({ message: "Item not found" });
      }

      const deleted = await storage.deleteCrmItem(req.params.id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete item" });
      }
      
      await logCrmAudit(
        user.id,
        "item.deleted",
        "crm_item",
        req.params.id,
        { name: existingItem.name },
        req.ip
      );
      
      return res.json({ message: "Item deleted successfully" });
    } catch (error) {
      console.error("Error deleting CRM item:", error);
      return res.status(500).json({ message: "Failed to delete item" });
    }
  });

  // =============================================
  // CRM QUOTES ROUTES
  // =============================================

  // Helper to generate quote number: Q-YYYYMMDD-XXX (sequential)
  // Uses America/New_York timezone (Eastern Time) for consistent date formatting
  async function generateQuoteNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, "");
    const prefix = `Q-${dateStr}-`;
    
    const todayQuotes = await db.select({ quoteNumber: crmQuotes.quoteNumber })
      .from(crmQuotes)
      .where(sql`${crmQuotes.quoteNumber} LIKE ${prefix + '%'}`)
      .orderBy(desc(crmQuotes.quoteNumber))
      .limit(1);
    
    let seq = 1;
    if (todayQuotes.length > 0 && todayQuotes[0].quoteNumber) {
      const lastSeq = parseInt(todayQuotes[0].quoteNumber.split('-').pop() || '0', 10);
      seq = lastSeq + 1;
    }
    
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  // GET /api/crm/quotes - List quotes with filters and pagination (OPTIMIZED)
  app.get("/api/crm/quotes", requireCrmAuth, async (req, res) => {
    try {
      const { scope, status, customerId, projectId, workOrderId, quoteType, page = "1", limit = "25" } = req.query;
      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = Math.min(50, parseInt(limit as string, 10) || 25);
      const offset = (pageNum - 1) * limitNum;
      
      const conditions: any[] = [];
      if (scope) {
        conditions.push(eq(crmQuotes.scope, scope as string));
      }
      if (status) {
        conditions.push(eq(crmQuotes.status, status as string));
      }
      if (customerId) {
        conditions.push(eq(crmQuotes.customerId, customerId as string));
      }
      if (projectId) {
        conditions.push(eq(crmQuotes.projectId, projectId as string));
      }
      if (workOrderId) {
        conditions.push(eq(crmQuotes.workOrderId, workOrderId as string));
      }
      if (quoteType) {
        conditions.push(eq(crmQuotes.quoteType, quoteType as string));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Get total count with filters
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(crmQuotes)
        .where(whereClause);
      const total = Number(countResult[0]?.count) || 0;

      // Get paginated quotes with filters
      const quotesResult = await db.select({
        id: crmQuotes.id,
        quoteNumber: crmQuotes.quoteNumber,
        customerId: crmQuotes.customerId,
        customerName: crmQuotes.customerName,
        customerEmail: crmQuotes.customerEmail,
        customerPhone: crmQuotes.customerPhone,
        serviceAddress: crmQuotes.serviceAddress,
        title: crmQuotes.title,
        description: crmQuotes.description,
        subtotal: crmQuotes.subtotal,
        laborTotal: crmQuotes.laborTotal,
        total: crmQuotes.total,
        status: crmQuotes.status,
        validUntil: crmQuotes.validUntil,
        sentAt: crmQuotes.sentAt,
        viewedAt: crmQuotes.viewedAt,
        viewCount: crmQuotes.viewCount,
        acceptedAt: crmQuotes.acceptedAt,
        declinedAt: crmQuotes.declinedAt,
        workOrderId: crmQuotes.workOrderId,
        projectId: crmQuotes.projectId,
        scope: crmQuotes.scope,
        notes: crmQuotes.notes,
        quoteType: crmQuotes.quoteType,
        createdAt: crmQuotes.createdAt,
        updatedAt: crmQuotes.updatedAt,
      })
        .from(crmQuotes)
        .where(whereClause)
        .orderBy(desc(crmQuotes.createdAt))
        .limit(limitNum)
        .offset(offset);

      // Quick quotes store customerName directly, so no enrichment needed
      // Just pass through the quotes with their stored customerName
      const enrichedQuotes = quotesResult;

      return res.json({
        quotes: enrichedQuotes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching CRM quotes:", error);
      return res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  // GET /api/crm/quotes/:id - Get single quote with line items
  app.get("/api/crm/quotes/:id", requireCrmAuth, async (req, res) => {
    try {
      // Use raw SQL to fetch quote to bypass Drizzle ORM issues
      const quoteQuery = await db.execute(sql`
        SELECT 
          id, quote_number as "quoteNumber", customer_id as "customerId", 
          customer_name as "customerName", customer_email as "customerEmail",
          customer_phone as "customerPhone", service_address as "serviceAddress",
          title, description, line_items as "lineItems", subtotal, 
          labor_total as "laborTotal", total, status,
          valid_until as "validUntil", sent_at as "sentAt", viewed_at as "viewedAt",
          view_count as "viewCount", accepted_at as "acceptedAt", declined_at as "declinedAt",
          work_order_id as "workOrderId", project_id as "projectId", scope, notes,
          created_at as "createdAt", updated_at as "updatedAt",
          job_id as "jobId", account_id as "accountId", site_id as "siteId",
          contact_id as "contactId", created_by_id as "createdById",
          assigned_to_id as "assignedToId", internal_notes as "internalNotes",
          customer_notes as "customerNotes", property_id as "propertyId",
          accepted_by as "acceptedBy", decline_reason as "declineReason", created_by as "createdBy",
          ai_generated_quote as "aiGeneratedQuote", quote_mode as "quoteMode",
          quote_type as "quoteType", selected_option as "selectedOption",
          signed_at as "signedAt", signer_name as "signerName",
          deposit_paid_at as "depositPaidAt", deposit_amount as "depositAmount",
          stripe_payment_link_id as "stripePaymentLinkId"
        FROM crm_quotes 
        WHERE id = ${req.params.id}
        LIMIT 1
      `);
      const quote = quoteQuery.rows[0] as any;
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      // Fetch deposit percentage from settings
      let depositPercentage = 50; // default
      const depositSetting = await storage.getSetting('stripe_deposit_percentage');
      if (depositSetting) {
        const parsed = parseInt(depositSetting.value, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
          depositPercentage = parsed;
        }
      }
      quote.depositPercentage = depositPercentage;
      
      // Use raw SQL for line items too
      const lineItemsQuery = await db.execute(sql`
        SELECT 
          id, quote_id as "quoteId", line_type as "lineType", description,
          part_number as "partNumber", quantity, unit_price as "unitPrice",
          line_total as "lineTotal", sort_order as "sortOrder",
          item_id as "itemId", is_discount_line as "isDiscountLine",
          discount_kind as "discountKind", option_tag as "optionTag",
          image_url as "imageUrl", created_at as "createdAt"
        FROM crm_quote_line_items
        WHERE quote_id = ${req.params.id}
        ORDER BY sort_order ASC
      `);
      const lineItems = lineItemsQuery.rows as any[];
      
      let customer = null;
      if (quote.customerId) {
        const custQuery = await db.execute(sql`
          SELECT id, name, email, phone 
          FROM crm_customers WHERE id = ${quote.customerId} LIMIT 1
        `);
        customer = custQuery.rows[0] || null;
      }
      
      let workOrder = null;
      if (quote.workOrderId) {
        const woQuery = await db.execute(sql`
          SELECT id, title, status FROM crm_work_orders WHERE id = ${quote.workOrderId} LIMIT 1
        `);
        workOrder = woQuery.rows[0] || null;
      }
      
      let project = null;
      if (quote.projectId) {
        const projQuery = await db.execute(sql`
          SELECT id, title, status FROM crm_projects WHERE id = ${quote.projectId} LIMIT 1
        `);
        project = projQuery.rows[0] || null;
      }
      
      let assignedTo = null;
      if (quote.assignedToId) {
        const assignedQuery = await db.execute(sql`
          SELECT id, name as "displayName", role FROM crm_users WHERE id = ${quote.assignedToId} LIMIT 1
        `);
        assignedTo = assignedQuery.rows[0] || null;
      }
      
      return res.json({
        ...quote,
        lineItems,
        customer,
        workOrder,
        project,
        assignedTo,
      });
    } catch (error) {
      console.error("Error fetching CRM quote:", error);
      return res.status(500).json({ message: "Failed to fetch quote" });
    }
  });

  // POST /api/crm/quotes - Create quote (validate scope + workOrderId/projectId)
  app.post("/api/crm/quotes", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { lineItems, ...quoteData } = req.body;
      
      // Validate scope
      const scope = quoteData.scope;
      if (!scope || !['work_order', 'project'].includes(scope)) {
        return res.status(400).json({ message: "scope must be 'work_order' or 'project'" });
      }
      
      // Validate scope + workOrderId/projectId relationship
      if (scope === 'work_order') {
        if (!quoteData.workOrderId) {
          return res.status(400).json({ message: "workOrderId is required when scope is 'work_order'" });
        }
        quoteData.projectId = null;
        
        // Verify work order exists
        const [wo] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, quoteData.workOrderId));
        if (!wo) {
          return res.status(400).json({ message: "Work order not found" });
        }
      } else if (scope === 'project') {
        if (!quoteData.projectId) {
          return res.status(400).json({ message: "projectId is required when scope is 'project'" });
        }
        quoteData.workOrderId = null;
        
        // Verify project exists
        const [proj] = await db.select().from(crmProjects).where(eq(crmProjects.id, quoteData.projectId));
        if (!proj) {
          return res.status(400).json({ message: "Project not found" });
        }
      }

      // Generate quote number
      const quoteNumber = await generateQuoteNumber();

      // Validate with schema
      const parseResult = insertCrmQuoteSchema.safeParse({
        ...quoteData,
        quoteNumber,
        createdBy: user.id,
      });
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parseResult.error.errors 
        });
      }

      const [newQuote] = await db.insert(crmQuotes).values(parseResult.data).returning();

      // Create line items if provided
      let createdLineItems: CrmQuoteLineItem[] = [];
      if (lineItems && Array.isArray(lineItems)) {
        // Validate discount line items before creating
        const discountValidation = validateDiscountLineItems(lineItems, [], 'quote');
        if (!discountValidation.valid) {
          // Rollback: delete the quote we just created
          await db.delete(crmQuotes).where(eq(crmQuotes.id, newQuote.id));
          return res.status(400).json({ message: discountValidation.error });
        }
        
        for (const item of lineItems) {
          const lineItemData = { ...item, quoteId: newQuote.id };
          const lineItemParseResult = insertCrmQuoteLineItemSchema.safeParse(lineItemData);
          if (lineItemParseResult.success) {
            const [createdItem] = await db.insert(crmQuoteLineItems).values(lineItemParseResult.data).returning();
            createdLineItems.push(createdItem);
          }
        }
      }

      await logCrmAudit(
        user.id,
        "quote.created",
        "crm_quote",
        newQuote.id,
        { quoteNumber: newQuote.quoteNumber, scope, customerId: newQuote.customerId },
        req.ip
      );

      return res.status(201).json({ ...newQuote, lineItems: createdLineItems });
    } catch (error) {
      console.error("Error creating CRM quote:", error);
      return res.status(500).json({ message: "Failed to create quote" });
    }
  });

  // POST /api/crm/quotes/from-worksheet - Create quote from install pricing worksheet
  app.post("/api/crm/quotes/from-worksheet", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { customerId, newCustomer, installSubtype, inputs, lines, assignedToId } = req.body;

      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ message: "At least one line item is required" });
      }

      let targetCustomerId = customerId;

      // Create new customer if needed
      if (!customerId && newCustomer) {
        if (!newCustomer.name || !newCustomer.name.trim()) {
          return res.status(400).json({ message: "Customer name is required" });
        }

        const [createdCustomer] = await db.insert(crmCustomers).values({
          name: newCustomer.name.trim(),
          email: newCustomer.email?.trim() || null,
          phone: newCustomer.phone?.trim() || null,
          fullAddress: newCustomer.address?.trim() || null,
          customerStatus: "prospect",
          customerType: "residential",
        }).returning();
        autoSyncCustomer(createdCustomer.id);

        targetCustomerId = createdCustomer.id;

        await logCrmAudit(
          user.id,
          "customer.created",
          "crm_customer",
          createdCustomer.id,
          { name: createdCustomer.name, source: "worksheet" },
          req.ip
        );
      }

      if (!targetCustomerId) {
        return res.status(400).json({ message: "Either customerId or newCustomer is required" });
      }

      // Fetch customer data for the quote
      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, targetCustomerId));
      if (!customer) {
        return res.status(400).json({ message: "Customer not found" });
      }

      // Generate quote number
      const quoteNumber = await generateQuoteNumber();

      // Calculate totals from worksheet
      const { calcWorksheet } = await import("@shared/calcWorksheet");
      const worksheetLines = lines.map((l: { cost: number }) => ({
        cost: l.cost,
      }));
      const calcs = calcWorksheet(inputs, worksheetLines);

      // Validate assignedToId if provided - install quotes require exactly sales role
      if (assignedToId) {
        const [assignedUser] = await db.select().from(crmUsers).where(eq(crmUsers.id, assignedToId));
        if (!assignedUser) {
          return res.status(400).json({ message: "Assigned user not found" });
        }
        const validRoles = ["sales"];
        if (!validRoles.includes(assignedUser.role)) {
          return res.status(400).json({ message: "Assigned user must have sales role for install quotes" });
        }
      }

      // Create the quote
      const [newQuote] = await db.insert(crmQuotes).values({
        quoteNumber,
        customerId: targetCustomerId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerAddress: customer.fullAddress,
        scope: "project",
        status: "draft",
        title: `Install - ${installSubtype.charAt(0).toUpperCase() + installSubtype.slice(1)}`,
        description: "",
        subtotal: calcs.linesTotal.toString(),
        total: calcs.discountedSellPrice.toString(),
        createdBy: user.id,
        quoteType: "custom_install",
        assignedToId: assignedToId || null,
      }).returning();

      // Create line items from worksheet lines - store actual costs internally
      let sortOrder = 0;
      let equipmentSubtotal = 0;
      
      for (const line of lines) {
        const cost = line.cost || 0;
        if (cost === 0) continue; // Skip zero-cost items
        
        equipmentSubtotal += cost;
        
        await db.insert(crmQuoteLineItems).values({
          quoteId: newQuote.id,
          lineType: "part",
          description: line.description || line.category,
          unitPrice: cost.toString(),
          quantity: "1",
          lineTotal: cost.toString(),
          sortOrder: sortOrder++,
        });
      }

      // Add labor line item (visible internally, hidden from client-facing views)
      // This includes labor payroll + labor benefits
      const laborTotal = calcs.laborPayroll + calcs.laborBenefits;
      if (laborTotal > 0) {
        await db.insert(crmQuoteLineItems).values({
          quoteId: newQuote.id,
          lineType: "labor",
          description: `Installation Labor (${inputs.hoursToInstall} hrs)`,
          unitPrice: laborTotal.toString(),
          quantity: "1",
          lineTotal: laborTotal.toString(),
          sortOrder: sortOrder++,
        });
      }

      // Add warranty reserve if applicable (use lineType 'other' for internal tracking)
      if (inputs.warrantyReserveDollar > 0) {
        await db.insert(crmQuoteLineItems).values({
          quoteId: newQuote.id,
          lineType: "other",
          description: "Warranty Reserve",
          unitPrice: inputs.warrantyReserveDollar.toString(),
          quantity: "1",
          lineTotal: inputs.warrantyReserveDollar.toString(),
          sortOrder: sortOrder++,
        });
      }

      // Calculate the actual subtotal (equipment + labor + warranty for internal tracking)
      const internalSubtotal = equipmentSubtotal + laborTotal + inputs.warrantyReserveDollar;

      // Update the quote with the calculated selling price as the total
      await db.update(crmQuotes)
        .set({
          subtotal: internalSubtotal.toString(),
          laborTotal: laborTotal.toString(),
          total: calcs.discountedSellPrice.toString(),
          updatedAt: new Date(),
        })
        .where(eq(crmQuotes.id, newQuote.id));

      await logCrmAudit(
        user.id,
        "quote.created",
        "crm_quote",
        newQuote.id,
        { quoteNumber: newQuote.quoteNumber, source: "worksheet", installSubtype, customerId: targetCustomerId },
        req.ip
      );

      return res.status(201).json({ quoteId: newQuote.id });
    } catch (error) {
      console.error("Error creating quote from worksheet:", error);
      return res.status(500).json({ message: "Failed to create quote from worksheet" });
    }
  });

  // Proposal Sessions CRUD (autosave for proposal builder)
  // POST /api/crm/proposal-sessions - Create new builder session
  app.post("/api/crm/proposal-sessions", requireCrmAuth, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { customerId, siteId, selectionsJson, cartJson, pricingTotalsJson, aiNotes } = req.body;

      const [session] = await db.insert(proposalSessions).values({
        customerId: customerId || null,
        siteId: siteId || null,
        selectionsJson: selectionsJson || null,
        cartJson: cartJson || null,
        pricingTotalsJson: pricingTotalsJson || null,
        aiNotes: aiNotes || null,
        createdBy: user.id,
      }).returning();

      return res.status(201).json(session);
    } catch (error) {
      console.error("Error creating proposal session:", error);
      return res.status(500).json({ message: "Failed to create proposal session" });
    }
  });

  // GET /api/crm/proposal-sessions/:id - Get session by ID
  app.get("/api/crm/proposal-sessions/:id", requireCrmAuth, async (req, res) => {
    try {
      const [session] = await db.select().from(proposalSessions).where(eq(proposalSessions.id, req.params.id));
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      return res.json(session);
    } catch (error) {
      console.error("Error fetching proposal session:", error);
      return res.status(500).json({ message: "Failed to fetch proposal session" });
    }
  });

  // PATCH /api/crm/proposal-sessions/:id - Update existing session
  app.patch("/api/crm/proposal-sessions/:id", requireCrmAuth, async (req, res) => {
    try {
      const { customerId, siteId, selectionsJson, cartJson, pricingTotalsJson, aiNotes } = req.body;

      const [existing] = await db.select().from(proposalSessions).where(eq(proposalSessions.id, req.params.id));
      if (!existing) {
        return res.status(404).json({ message: "Session not found" });
      }

      const [updated] = await db.update(proposalSessions)
        .set({
          customerId: customerId !== undefined ? customerId : existing.customerId,
          siteId: siteId !== undefined ? siteId : existing.siteId,
          selectionsJson: selectionsJson !== undefined ? selectionsJson : existing.selectionsJson,
          cartJson: cartJson !== undefined ? cartJson : existing.cartJson,
          pricingTotalsJson: pricingTotalsJson !== undefined ? pricingTotalsJson : existing.pricingTotalsJson,
          aiNotes: aiNotes !== undefined ? aiNotes : existing.aiNotes,
          updatedAt: new Date(),
        })
        .where(eq(proposalSessions.id, req.params.id))
        .returning();

      return res.json(updated);
    } catch (error) {
      console.error("Error updating proposal session:", error);
      return res.status(500).json({ message: "Failed to update proposal session" });
    }
  });

  // DELETE /api/crm/proposal-sessions/:id - Delete session
  app.delete("/api/crm/proposal-sessions/:id", requireCrmAuth, async (req, res) => {
    try {
      const [existing] = await db.select().from(proposalSessions).where(eq(proposalSessions.id, req.params.id));
      if (!existing) {
        return res.status(404).json({ message: "Session not found" });
      }
      await db.delete(proposalSessions).where(eq(proposalSessions.id, req.params.id));
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting proposal session:", error);
      return res.status(500).json({ message: "Failed to delete proposal session" });
    }
  });

  // POST /api/crm/quotes/from-proposal - Create standalone quote from proposal builder
  app.post("/api/crm/quotes/from-proposal", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { customerId, propertyId, projectId, workOrderId, title, description, notes, lineItems, status, aiNotes, aiGeneratedQuote, quoteMode, quoteType, assignedToId } = req.body;

      if (!customerId) {
        return res.status(400).json({ message: "Customer is required" });
      }

      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ message: "At least one line item is required" });
      }

      // Validate status if provided
      const validStatuses = ["draft", "presented", "approved"];
      const quoteStatus = validStatuses.includes(status) ? status : "draft";

      // Verify customer exists
      const [existingCustomer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
      if (!existingCustomer) {
        return res.status(400).json({ message: "Customer not found" });
      }

      // Validate assignedToId if provided
      // Service quotes (quick, custom_service) require exactly admin role
      // Install quotes (proposal, custom_install) require exactly sales role
      if (assignedToId) {
        const [assignedUser] = await db.select().from(crmUsers).where(eq(crmUsers.id, assignedToId));
        if (!assignedUser) {
          return res.status(400).json({ message: "Assigned user not found" });
        }
        const isServiceQuote = quoteType === "quick" || quoteType === "custom_service";
        const validRoles = isServiceQuote ? ["admin"] : ["sales"];
        if (!validRoles.includes(assignedUser.role)) {
          const roleMsg = isServiceQuote 
            ? "Assigned user must have admin role for service quotes" 
            : "Assigned user must have sales role for install quotes";
          return res.status(400).json({ message: roleMsg });
        }
      }

      // Calculate totals from line items
      let subtotal = 0;
      for (const item of lineItems) {
        const lineTotal = (item.quantity || 1) * (item.unitPrice || 0);
        subtotal += lineTotal;
      }
      const total = subtotal;

      // Generate quote number
      const quoteNumber = await generateQuoteNumber();

      // Build notes with AI notes if provided
      const combinedNotes = [notes, aiNotes ? `AI Generated Notes:\n${aiNotes}` : null].filter(Boolean).join("\n\n");

      // Determine scope based on linked entities
      let scope: "standalone" | "project" | "work_order" = "standalone";
      if (projectId) scope = "project";
      else if (workOrderId) scope = "work_order";

      // Determine if this is an install or service quote when quoteType is explicitly provided
      // "proposal" and "custom_install" are install types, "quick" and "custom_service" are service types
      // Only set quoteCategory when we have an explicit quoteType to avoid misclassifying legacy/missing types
      let quoteCategory: "install" | "service" | null = null;
      if (quoteType === "proposal" || quoteType === "custom_install") {
        quoteCategory = "install";
      } else if (quoteType === "quick" || quoteType === "custom_service") {
        quoteCategory = "service";
      }
      const isInstallQuote = quoteCategory === "install";

      // Create the quote
      const [newQuote] = await db.insert(crmQuotes).values({
        quoteNumber,
        customerId,
        propertyId: propertyId || null,
        projectId: projectId || null,
        workOrderId: workOrderId || null,
        customerName: existingCustomer.name,
        customerAddress: existingCustomer.fullAddress || null,
        customerPhone: existingCustomer.phone || null,
        customerEmail: existingCustomer.email || null,
        scope,
        status: quoteStatus,
        title: title || "Proposal Quote",
        description: description || null,
        notes: combinedNotes || null,
        subtotal: subtotal.toFixed(2),
        total: total.toFixed(2),
        createdBy: user.id,
        acceptedAt: quoteStatus === "approved" ? new Date() : null,
        acceptedBy: quoteStatus === "approved" ? user.name : null,
        aiGeneratedQuote: aiGeneratedQuote || null,
        quoteMode: quoteMode || null,
        quoteType: quoteType || null,
        quoteCategory: quoteCategory,
        assignedToId: assignedToId || null,
      }).returning();

      // Create line items
      // Determine lineType based on quoteType - install quotes should use "install" lineType
      const defaultLineType = isInstallQuote ? "install" : "part";
      
      const createdLineItems = [];
      let sortOrder = 0;
      for (const item of lineItems) {
        if (!item.description?.trim()) continue;
        
        const quantity = item.quantity || 1;
        const unitPrice = item.unitPrice || 0;
        const lineTotal = quantity * unitPrice;

        const [createdItem] = await db.insert(crmQuoteLineItems).values({
          quoteId: newQuote.id,
          lineType: item.lineType || defaultLineType,
          description: item.description.trim(),
          quantity: quantity.toString(),
          unitPrice: unitPrice.toString(),
          lineTotal: lineTotal.toString(),
          sortOrder: sortOrder++,
          optionTag: item.optionTag || null,
          imageUrl: item.imageUrl || null,
        }).returning();
        createdLineItems.push(createdItem);
      }

      await logCrmAudit(
        user.id,
        "quote.created",
        "crm_quote",
        newQuote.id,
        { quoteNumber: newQuote.quoteNumber, scope: "standalone", source: "proposal-builder", customerId, status: quoteStatus },
        req.ip
      );

      return res.status(201).json({ quoteId: newQuote.id, quote: newQuote, lineItems: createdLineItems });
    } catch (error) {
      console.error("Error creating quote from proposal:", error);
      return res.status(500).json({ message: "Failed to create quote from proposal" });
    }
  });

  // POST /api/crm/quotes/quick - Create standalone quick quote
  app.post("/api/crm/quotes/quick", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { customerId, title, description, notes, lineItems, workOrderId, propertyId, projectId, assignedToId } = req.body;

      if (!customerId) {
        return res.status(400).json({ message: "Customer is required" });
      }

      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ message: "At least one line item is required" });
      }

      // Verify customer exists
      const [existingCustomer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
      if (!existingCustomer) {
        return res.status(400).json({ message: "Customer not found" });
      }

      // Calculate totals from line items
      let subtotal = 0;
      for (const item of lineItems) {
        const lineTotal = (item.quantity || 1) * (item.unitPrice || 0);
        subtotal += lineTotal;
      }
      const total = subtotal;

      // Generate quote number
      const quoteNumber = await generateQuoteNumber();

      // Create the quote with customer info
      const [newQuote] = await db.insert(crmQuotes).values({
        quoteNumber,
        customerId,
        customerName: existingCustomer.displayName || existingCustomer.name || "Customer",
        customerEmail: existingCustomer.email || null,
        customerPhone: existingCustomer.phone || null,
        serviceAddress: existingCustomer.address || null,
        scope: projectId ? "project" : (workOrderId ? "work_order" : "standalone"),
        workOrderId: workOrderId || null,
        propertyId: propertyId || null,
        projectId: projectId || null,
        status: "draft",
        title: title || "Quick Quote",
        description: description || null,
        notes: notes || null,
        subtotal: subtotal.toFixed(2),
        total: total.toFixed(2),
        createdBy: user.id,
        quoteType: "quick",
        assignedToId: assignedToId || null,
      }).returning();

      // Create line items
      const createdLineItems = [];
      let sortOrder = 0;
      for (const item of lineItems) {
        if (!item.description?.trim()) continue;
        
        const quantity = item.quantity || 1;
        const unitPrice = item.unitPrice || 0;
        const lineTotal = quantity * unitPrice;

        const [createdItem] = await db.insert(crmQuoteLineItems).values({
          quoteId: newQuote.id,
          lineType: item.isDiscountLine ? "discount" : (item.lineType || "part"),
          description: item.description.trim(),
          quantity: quantity.toString(),
          unitPrice: unitPrice.toString(),
          lineTotal: lineTotal.toString(),
          isDiscountLine: item.isDiscountLine || false,
          discountKind: item.discountKind || null,
          sortOrder: sortOrder++,
        }).returning();
        createdLineItems.push(createdItem);
      }

      await logCrmAudit(
        user.id,
        "quote.created",
        "crm_quote",
        newQuote.id,
        { quoteNumber: newQuote.quoteNumber, scope: "standalone", source: "quick", customerId },
        req.ip
      );

      return res.status(201).json({ quoteId: newQuote.id, quote: newQuote, lineItems: createdLineItems });
    } catch (error) {
      console.error("Error creating quick quote:", error);
      return res.status(500).json({ message: "Failed to create quick quote" });
    }
  });

  // PATCH /api/crm/quotes/:id - Update quote (only if draft)
  app.patch("/api/crm/quotes/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Don't allow changing scope/workOrderId/projectId after creation
      const { scope, workOrderId, projectId, status, assignedToId, ...updateData } = req.body;

      // assignedToId can be updated regardless of status
      if (assignedToId !== undefined) {
        await db.update(crmQuotes)
          .set({ assignedToId, updatedAt: new Date() })
          .where(eq(crmQuotes.id, req.params.id));
      }

      // Only draft quotes can be edited for other fields (status changes use dedicated endpoints)
      if (existing.status !== 'draft' && Object.keys(updateData).length > 0) {
        // If only assignedToId was being updated, that's already done
        if (assignedToId !== undefined) {
          const [updated] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
          return res.json(updated);
        }
        return res.status(400).json({ message: "Only draft quotes can be edited. Use status endpoints for sent/accepted/declined quotes." });
      }
      
      if (scope || workOrderId || projectId) {
        return res.status(400).json({ message: "Cannot change scope, workOrderId, or projectId after quote creation" });
      }
      
      if (status) {
        return res.status(400).json({ message: "Use /send, /accept, or /decline endpoints to change quote status" });
      }

      const [updated] = await db.update(crmQuotes)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(crmQuotes.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "quote.updated",
        "crm_quote",
        req.params.id,
        { changes: Object.keys(updateData) },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error updating CRM quote:", error);
      return res.status(500).json({ message: "Failed to update quote" });
    }
  });

  // DELETE /api/crm/quotes/:id - Delete quote (any status)
  app.delete("/api/crm/quotes/:id", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Line items are deleted via cascade
      await db.delete(crmQuotes).where(eq(crmQuotes.id, req.params.id));

      await logCrmAudit(
        user.id,
        "quote.deleted",
        "crm_quote",
        req.params.id,
        { quoteNumber: existing.quoteNumber },
        req.ip
      );

      return res.json({ message: "Quote deleted successfully" });
    } catch (error) {
      console.error("Error deleting CRM quote:", error);
      return res.status(500).json({ message: "Failed to delete quote" });
    }
  });

  // POST /api/crm/quotes/:id/line-items - Add line item to quote
  app.post("/api/crm/quotes/:id/line-items", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id));
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      // Allow adding for all statuses except accepted and converted
      const nonEditableStatuses = ["accepted", "converted"];
      if (nonEditableStatuses.includes(quote.status)) {
        return res.status(400).json({ message: "Cannot add line items to accepted or converted quotes" });
      }
      
      // Get existing line items for discount validation
      const existingLineItems = await db.select().from(crmQuoteLineItems)
        .where(eq(crmQuoteLineItems.quoteId, req.params.id));
      
      // Validate discount line item rules
      const discountValidation = validateDiscountLineItem(req.body, existingLineItems, undefined, 'quote');
      if (!discountValidation.valid) {
        return res.status(400).json({ message: discountValidation.error });
      }
      
      const lineItemData = { ...req.body, quoteId: req.params.id };
      const parseResult = insertCrmQuoteLineItemSchema.safeParse(lineItemData);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parseResult.error.errors 
        });
      }
      
      const [lineItem] = await db.insert(crmQuoteLineItems).values(parseResult.data).returning();
      
      await logCrmAudit(
        user.id,
        "quote_line_item.created",
        "quote_line_item",
        lineItem.id,
        { quoteId: req.params.id, description: lineItem.description },
        req.ip
      );
      
      return res.status(201).json(lineItem);
    } catch (error) {
      console.error("Error creating quote line item:", error);
      return res.status(500).json({ message: "Failed to create quote line item" });
    }
  });

  // PATCH /api/crm/quotes/:id/line-items/:lineItemId - Update line item
  app.patch("/api/crm/quotes/:id/line-items/:lineItemId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id));
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      // Allow editing for all statuses except accepted and converted
      const nonEditableStatuses = ["accepted", "converted"];
      if (nonEditableStatuses.includes(quote.status)) {
        return res.status(400).json({ message: "Cannot update line items on accepted or converted quotes" });
      }
      
      const [existingLineItem] = await db.select().from(crmQuoteLineItems)
        .where(and(
          eq(crmQuoteLineItems.id, req.params.lineItemId),
          eq(crmQuoteLineItems.quoteId, req.params.id)
        ));
      
      if (!existingLineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      
      const { description, partNumber, quantity, unitPrice, lineTotal, sortOrder, lineType, isDiscountLine, discountKind } = req.body;
      
      // Merge existing line item data with updates to validate the final state
      const mergedLineItem = {
        ...existingLineItem,
        ...(description !== undefined && { description }),
        ...(partNumber !== undefined && { partNumber }),
        ...(quantity !== undefined && { quantity }),
        ...(unitPrice !== undefined && { unitPrice }),
        ...(lineTotal !== undefined && { lineTotal }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(lineType !== undefined && { lineType }),
        ...(isDiscountLine !== undefined && { isDiscountLine }),
        ...(discountKind !== undefined && { discountKind }),
      };
      
      // Get all line items for this quote for discount validation
      const allLineItems = await db.select().from(crmQuoteLineItems)
        .where(eq(crmQuoteLineItems.quoteId, req.params.id));
      
      // Validate discount line item rules
      const discountValidation = validateDiscountLineItem(mergedLineItem, allLineItems, req.params.lineItemId, 'quote');
      if (!discountValidation.valid) {
        return res.status(400).json({ message: discountValidation.error });
      }
      
      const updates: any = {};
      if (description !== undefined) updates.description = description;
      if (partNumber !== undefined) updates.partNumber = partNumber;
      if (quantity !== undefined) updates.quantity = quantity;
      if (unitPrice !== undefined) updates.unitPrice = unitPrice;
      if (lineTotal !== undefined) updates.lineTotal = lineTotal;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (lineType !== undefined) updates.lineType = lineType;
      if (isDiscountLine !== undefined) updates.isDiscountLine = isDiscountLine;
      if (discountKind !== undefined) updates.discountKind = discountKind;
      
      const [updatedLineItem] = await db.update(crmQuoteLineItems)
        .set(updates)
        .where(eq(crmQuoteLineItems.id, req.params.lineItemId))
        .returning();
      
      await logCrmAudit(
        user.id,
        "quote_line_item.updated",
        "quote_line_item",
        req.params.lineItemId,
        { quoteId: req.params.id, changes: updates },
        req.ip
      );
      
      return res.json(updatedLineItem);
    } catch (error) {
      console.error("Error updating quote line item:", error);
      return res.status(500).json({ message: "Failed to update quote line item" });
    }
  });

  // DELETE /api/crm/quotes/:id/line-items/:lineItemId - Delete line item
  app.delete("/api/crm/quotes/:id/line-items/:lineItemId", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id));
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      
      // Allow deleting for all statuses except accepted and converted
      const nonEditableStatuses = ["accepted", "converted"];
      if (nonEditableStatuses.includes(quote.status)) {
        return res.status(400).json({ message: "Cannot delete line items from accepted or converted quotes" });
      }
      
      const [existingLineItem] = await db.select().from(crmQuoteLineItems)
        .where(and(
          eq(crmQuoteLineItems.id, req.params.lineItemId),
          eq(crmQuoteLineItems.quoteId, req.params.id)
        ));
      
      if (!existingLineItem) {
        return res.status(404).json({ message: "Line item not found" });
      }
      
      await db.delete(crmQuoteLineItems).where(eq(crmQuoteLineItems.id, req.params.lineItemId));
      
      await logCrmAudit(
        user.id,
        "quote_line_item.deleted",
        "quote_line_item",
        req.params.lineItemId,
        { quoteId: req.params.id, description: existingLineItem.description },
        req.ip
      );
      
      return res.json({ message: "Line item deleted successfully" });
    } catch (error) {
      console.error("Error deleting quote line item:", error);
      return res.status(500).json({ message: "Failed to delete quote line item" });
    }
  });

  // GET /api/crm/projects/:id/quotes - Get quotes for a project
  app.get("/api/crm/projects/:id/quotes", requireCrmAuth, async (req, res) => {
    try {
      const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, req.params.id));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const quotesResult = await db.select().from(crmQuotes)
        .where(eq(crmQuotes.projectId, req.params.id))
        .orderBy(desc(crmQuotes.createdAt));

      return res.json(quotesResult);
    } catch (error) {
      console.error("Error fetching project quotes:", error);
      return res.status(500).json({ message: "Failed to fetch project quotes" });
    }
  });

  // GET /api/crm/work-orders/:id/quotes - Get quotes for a work order
  app.get("/api/crm/work-orders/:id/quotes", requireCrmAuth, async (req, res) => {
    try {
      const [workOrder] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, req.params.id));
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      const quotesResult = await db.select().from(crmQuotes)
        .where(eq(crmQuotes.workOrderId, req.params.id))
        .orderBy(desc(crmQuotes.createdAt));

      return res.json(quotesResult);
    } catch (error) {
      console.error("Error fetching work order quotes:", error);
      return res.status(500).json({ message: "Failed to fetch work order quotes" });
    }
  });

  // POST /api/crm/quotes/:id/send - Mark quote as sent
  app.post("/api/crm/quotes/:id/send", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (existing.status !== 'draft') {
        return res.status(400).json({ message: "Only draft quotes can be sent" });
      }

      const [updated] = await db.update(crmQuotes)
        .set({ 
          status: 'sent', 
          sentAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(crmQuotes.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "quote.sent",
        "crm_quote",
        req.params.id,
        { quoteNumber: existing.quoteNumber },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error marking quote as sent:", error);
      return res.status(500).json({ message: "Failed to mark quote as sent" });
    }
  });

  // POST /api/crm/quotes/:id/accept - Mark quote as accepted
  app.post("/api/crm/quotes/:id/accept", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (existing.status !== 'sent') {
        return res.status(400).json({ message: "Only sent quotes can be accepted" });
      }

      const { acceptedBy, selectedOption } = req.body;

      // For multi-option quotes, require option selection
      if (existing.quoteMode === 'options') {
        // Get available options from line items
        const lineItems = await db.select().from(crmQuoteLineItems)
          .where(eq(crmQuoteLineItems.quoteId, req.params.id));
        
        const availableOptions = [...new Set(
          lineItems
            .map(item => item.optionTag)
            .filter((tag): tag is string => !!tag)
        )];

        // If no selectedOption provided and there are options to choose from
        if (!selectedOption && availableOptions.length > 0) {
          return res.status(400).json({
            message: "This is a multi-option quote. Please select which option the customer chose.",
            requiresOptionSelection: true,
            availableOptions,
          });
        }

        // Validate the selected option exists
        if (selectedOption && availableOptions.length > 0 && !availableOptions.includes(selectedOption)) {
          return res.status(400).json({
            message: `Invalid option selected. Available options: ${availableOptions.join(', ')}`,
          });
        }
      }

      const [updated] = await db.update(crmQuotes)
        .set({ 
          status: 'accepted', 
          acceptedAt: new Date(),
          acceptedBy: acceptedBy || null,
          selectedOption: selectedOption || existing.selectedOption || null,
          updatedAt: new Date() 
        })
        .where(eq(crmQuotes.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "quote.accepted",
        "crm_quote",
        req.params.id,
        { quoteNumber: existing.quoteNumber, acceptedBy, selectedOption },
        req.ip
      );

      // Add system email log entry for quote acceptance
      const now = new Date();
      await db.insert(quoteEmailLogs).values({
        quoteId: existing.id,
        direction: "system",
        fromEmail: "system",
        recipientEmail: existing.customerEmail || "",
        recipientName: acceptedBy || "Customer",
        subject: `Quote ${existing.quoteNumber} - Accepted`,
        textContent: `Quote was marked as accepted by ${user.name || user.email}${acceptedBy ? ` on behalf of ${acceptedBy}` : ""} at ${now.toLocaleString()}`,
        status: "sent",
        isManual: false,
        personalMessage: JSON.stringify({
          eventType: "quote_accepted",
          acceptedBy: acceptedBy || null,
          markedByUser: user.name || user.email,
          acceptedAt: now.toISOString(),
          selectedOption: selectedOption || null,
        }),
      });

      // Check if follow-up work order choice is needed (only for custom_service and quick types, AND has service items)
      let followUpContext = null;
      const followUpQuoteTypes = ["custom_service", "quick"];
      if (existing.workOrderId && followUpQuoteTypes.includes(existing.quoteType || "")) {
        // Check if quote has service-type items (not just maintenance)
        const hasServiceLineItems = await hasServiceItems(existing.id);
        if (hasServiceLineItems) {
          const [parentWorkOrder] = await db.select().from(crmWorkOrders)
            .where(eq(crmWorkOrders.id, existing.workOrderId)).limit(1);
          
          if (parentWorkOrder && (parentWorkOrder.status === "on_site" || parentWorkOrder.status === "completed")) {
            followUpContext = {
              customerId: parentWorkOrder.customerId,
              propertyId: parentWorkOrder.propertyId,
              projectId: parentWorkOrder.projectId,
              quoteId: existing.id,
              quoteTitle: existing.title || existing.quoteNumber,
            };
          }
        }
      }

      return res.json({
        ...updated,
        requiresFollowUpChoice: !!followUpContext,
        followUpContext,
      });
    } catch (error) {
      console.error("Error marking quote as accepted:", error);
      return res.status(500).json({ message: "Failed to mark quote as accepted" });
    }
  });

  // POST /api/crm/quotes/:id/accept-in-person - Accept quote with in-person signature
  app.post("/api/crm/quotes/:id/accept-in-person", requireCrmAuth, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { signatureImage, signerName, selectedOption } = req.body;

      if (!signatureImage || typeof signatureImage !== "string") {
        return res.status(400).json({ message: "Signature is required" });
      }

      if (!signerName || typeof signerName !== "string" || signerName.trim().length === 0) {
        return res.status(400).json({ message: "Signer name is required" });
      }

      const [existing] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (existing.status === "accepted") {
        return res.status(400).json({ message: "This quote has already been accepted" });
      }

      if (existing.status === "declined") {
        return res.status(400).json({ message: "This quote has been declined" });
      }

      if (existing.status === "expired") {
        return res.status(400).json({ message: "This quote has expired" });
      }

      // For multi-option quotes, validate option selection
      if (existing.quoteMode === 'options') {
        const lineItems = await db.select().from(crmQuoteLineItems)
          .where(eq(crmQuoteLineItems.quoteId, req.params.id));
        
        const availableOptions = [...new Set(
          lineItems
            .map(item => item.optionTag)
            .filter((tag): tag is string => !!tag)
        )];

        if (availableOptions.length > 0 && !selectedOption) {
          return res.status(400).json({
            message: "Please select which option the customer chose.",
          });
        }

        if (selectedOption && availableOptions.length > 0 && !availableOptions.includes(selectedOption)) {
          return res.status(400).json({
            message: `Invalid option selected. Available options: ${availableOptions.join(', ')}`,
          });
        }
      }

      const now = new Date();

      const [updated] = await db.update(crmQuotes)
        .set({
          status: "accepted",
          acceptedAt: now,
          acceptedBy: signerName.trim(),
          signatureImage,
          signerName: signerName.trim(),
          signerIp: "in-person",
          signedAt: now,
          updatedAt: now,
          ...(selectedOption && typeof selectedOption === "string" ? { selectedOption } : {}),
        })
        .where(eq(crmQuotes.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "quote.accepted_in_person",
        "crm_quote",
        req.params.id,
        { 
          quoteNumber: existing.quoteNumber, 
          signerName: signerName.trim(), 
          selectedOption: selectedOption || null,
          presentedBy: user.name || user.email,
        },
        req.ip
      );

      // Add system email log entry for in-person acceptance
      await db.insert(quoteEmailLogs).values({
        quoteId: existing.id,
        direction: "system",
        fromEmail: "system",
        recipientEmail: existing.customerEmail || "",
        recipientName: signerName.trim(),
        subject: `Quote ${existing.quoteNumber} - Accepted In Person`,
        textContent: `Quote was accepted in person by ${signerName.trim()}, presented by ${user.name || user.email} at ${now.toLocaleString()}`,
        status: "sent",
        isManual: false,
        personalMessage: JSON.stringify({
          eventType: "quote_accepted_in_person",
          signerName: signerName.trim(),
          presentedBy: user.name || user.email,
          signedAt: now.toISOString(),
          selectedOption: selectedOption || null,
        }),
      });

      // Log activity to projectActivities if quote has a projectId
      if (existing.projectId) {
        await db.insert(projectActivities).values({
          projectId: existing.projectId,
          type: "approval",
          title: "Quote Accepted In Person",
          notes: `Quote ${existing.quoteNumber} was accepted in person by ${signerName.trim()}${selectedOption ? ` (Option: ${selectedOption})` : ''}. Presented by ${user.name || user.email}.`,
          metadata: JSON.stringify({
            subType: "quote_accepted_in_person",
            quoteId: existing.id,
            quoteNumber: existing.quoteNumber,
            signerName: signerName.trim(),
            selectedOption: selectedOption || null,
            presentedBy: user.name || user.email,
          }),
          createdBy: user.id,
        });
      }

      console.log(`Quote ${existing.quoteNumber} accepted in person by ${signerName.trim()}, presented by ${user.name || user.email}`);

      // Check if follow-up work order choice is needed (only for custom_service and quick types, AND has service items)
      let followUpContext = null;
      const followUpQuoteTypes = ["custom_service", "quick"];
      if (existing.workOrderId && followUpQuoteTypes.includes(existing.quoteType || "")) {
        // Check if quote has service-type items (not just maintenance)
        const hasServiceLineItems = await hasServiceItems(existing.id);
        if (hasServiceLineItems) {
          const [parentWorkOrder] = await db.select().from(crmWorkOrders)
            .where(eq(crmWorkOrders.id, existing.workOrderId)).limit(1);
          
          if (parentWorkOrder && (parentWorkOrder.status === "on_site" || parentWorkOrder.status === "completed")) {
            followUpContext = {
              customerId: parentWorkOrder.customerId,
              propertyId: parentWorkOrder.propertyId,
              projectId: parentWorkOrder.projectId,
              quoteId: existing.id,
              quoteTitle: existing.title || existing.quoteNumber,
            };
          }
        }
      }

      return res.json({ 
        success: true, 
        message: "Quote accepted successfully",
        quote: updated,
        requiresFollowUpChoice: !!followUpContext,
        followUpContext,
      });
    } catch (error) {
      console.error("Error accepting quote in person:", error);
      return res.status(500).json({ message: "Failed to accept quote" });
    }
  });

  // POST /api/crm/quotes/:id/decline - Mark quote as declined
  app.post("/api/crm/quotes/:id/decline", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [existing] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Quote not found" });
      }

      if (existing.status !== 'sent') {
        return res.status(400).json({ message: "Only sent quotes can be declined" });
      }

      const { declineReason } = req.body;

      const [updated] = await db.update(crmQuotes)
        .set({ 
          status: 'declined', 
          declinedAt: new Date(),
          declineReason: declineReason || null,
          updatedAt: new Date() 
        })
        .where(eq(crmQuotes.id, req.params.id))
        .returning();

      await logCrmAudit(
        user.id,
        "quote.declined",
        "crm_quote",
        req.params.id,
        { quoteNumber: existing.quoteNumber, declineReason },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error marking quote as declined:", error);
      return res.status(500).json({ message: "Failed to mark quote as declined" });
    }
  });

  // POST /api/crm/quotes/:id/create-follow-up-work-order - Create follow-up work order for accepted quote
  app.post("/api/crm/quotes/:id/create-follow-up-work-order", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { mode } = req.body; // "parts_needed" or "schedule_now"
      console.log(`[create-follow-up-work-order] Request for quote ${req.params.id}, mode: ${mode}`);
      
      if (!mode || !["parts_needed", "schedule_now"].includes(mode)) {
        return res.status(400).json({ message: "Invalid mode. Must be 'parts_needed' or 'schedule_now'" });
      }

      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!quote) {
        console.log(`[create-follow-up-work-order] Quote ${req.params.id} not found`);
        return res.status(404).json({ message: "Quote not found" });
      }
      console.log(`[create-follow-up-work-order] Found quote ${quote.quoteNumber}, status: ${quote.status}, workOrderId: ${quote.workOrderId}`);
      
      if (quote.status !== "accepted") {
        console.log(`[create-follow-up-work-order] Quote ${quote.quoteNumber} is not accepted (status: ${quote.status})`);
        return res.status(400).json({ message: "Quote must be accepted first" });
      }
      if (!quote.workOrderId) {
        console.log(`[create-follow-up-work-order] Quote ${quote.quoteNumber} is not attached to a work order`);
        return res.status(400).json({ message: "Quote is not attached to a work order" });
      }

      const [parentWorkOrder] = await db.select().from(crmWorkOrders)
        .where(eq(crmWorkOrders.id, quote.workOrderId)).limit(1);
      if (!parentWorkOrder) {
        console.log(`[create-follow-up-work-order] Parent work order ${quote.workOrderId} not found`);
        return res.status(404).json({ message: "Parent work order not found" });
      }
      console.log(`[create-follow-up-work-order] Found parent work order ${parentWorkOrder.id}, status: ${parentWorkOrder.status}`);

      if (mode === "parts_needed") {
        console.log(`[create-follow-up-work-order] Creating parts_needed follow-up WO for quote ${quote.quoteNumber}`);
        const followUpWO = await createFollowUpWorkOrder(quote, parentWorkOrder, {
          dispatchQueueStage: "WaitingOnParts",
        });
        if (!followUpWO) {
          console.log(`[create-follow-up-work-order] Follow-up WO already exists for quote ${quote.id}`);
          return res.status(400).json({ message: "Follow-up work order already exists for this quote" });
        }
        console.log(`[create-follow-up-work-order] Created follow-up WO ${followUpWO.id} with stage WaitingOnParts`);
        await logCrmAudit(user.id, "workorder.created", "crm_work_order", followUpWO.id, 
          { source: "quote_follow_up", quoteId: quote.id }, req.ip);
        return res.json({ workOrder: followUpWO, mode: "parts_needed" });
      } else {
        // Return context for manual scheduling
        console.log(`[create-follow-up-work-order] Returning schedule_now context for quote ${quote.quoteNumber}`);
        return res.json({
          mode: "schedule_now",
          context: {
            customerId: parentWorkOrder.customerId,
            propertyId: parentWorkOrder.propertyId,
            projectId: parentWorkOrder.projectId,
            sourceQuoteId: quote.id,
            suggestedTitle: `Follow-up: ${quote.title || quote.quoteNumber}`,
            suggestedDescription: quote.description || `Follow-up work order for accepted quote ${quote.quoteNumber}`,
          }
        });
      }
    } catch (error) {
      console.error("[create-follow-up-work-order] Error:", error);
      return res.status(500).json({ message: "Failed to create follow-up work order" });
    }
  });

  // POST /api/crm/quotes/:id/send-email - Send quote via email (supports multiple recipients)
  app.post("/api/crm/quotes/:id/send-email", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { recipientEmail, personalMessage } = req.body;

      let [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      // Parse multiple emails (comma, semicolon, or space separated)
      const emailInput = recipientEmail || quote.customerEmail || "";
      if (!emailInput) {
        return res.status(400).json({ message: "No recipient email provided and quote has no customer email" });
      }
      
      const emailList = emailInput
        .split(/[,;\s]+/)
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e && e.includes("@"));
      
      if (emailList.length === 0) {
        return res.status(400).json({ message: "No valid email addresses provided" });
      }

      // Generate viewToken if one doesn't exist
      if (!quote.viewToken) {
        const { nanoid } = await import("nanoid");
        const viewToken = nanoid(32);
        [quote] = await db.update(crmQuotes)
          .set({ viewToken, updatedAt: new Date() })
          .where(eq(crmQuotes.id, quote.id))
          .returning();
      }

      // Build the public quote view URL
      const baseUrl = `https://${req.get("host")}`;
      const quoteViewUrl = `${baseUrl}/quote/${quote.viewToken}`;

      const lineItems = await db.select().from(crmQuoteLineItems)
        .where(eq(crmQuoteLineItems.quoteId, quote.id))
        .orderBy(crmQuoteLineItems.sortOrder);

      const sentByName = user.displayName || user.name || user.email;
      const subject = `Your Quote from Giesbrecht HVAC - ${quote.quoteNumber}`;

      // Use assigned user's email as Reply-To so customer replies go directly to them
      let replyToEmail = user.email; // Default to sender
      if (quote.assignedToId) {
        const [assignedUser] = await db.select({ email: crmUsers.email })
          .from(crmUsers)
          .where(eq(crmUsers.id, quote.assignedToId))
          .limit(1);
        if (assignedUser?.email) {
          replyToEmail = assignedUser.email;
        }
      }
      
      console.log("[Quote Email] Sending to multiple recipients:", emailList);

      // Send to all recipients
      const results: { email: string; success: boolean; error?: string; messageId?: string }[] = [];
      
      for (const email of emailList) {
        const result = await sendCrmQuoteEmail(quote, lineItems, email, personalMessage, sentByName, {
          senderEmail: user.email,
          senderName: sentByName,
          quoteViewUrl,
          replyToEmail,
        });

        await db.insert(quoteEmailLogs).values({
          quoteId: quote.id,
          direction: "outgoing",
          fromEmail: result.fromEmail || "quotes@ghvacinc.com",
          recipientEmail: email,
          recipientName: quote.customerName,
          subject: result.subject || subject,
          htmlContent: result.htmlContent || null,
          textContent: result.textContent || null,
          status: result.success ? "sent" : "failed",
          errorMessage: result.error || null,
          sentBy: user.id,
          personalMessage: personalMessage || null,
          isManual: false,
          resendMessageId: result.messageId || null,
          replyToEmail: result.replyToEmail || null,
        });

        results.push({ email, success: result.success, error: result.error, messageId: result.messageId });
      }

      const successCount = results.filter(r => r.success).length;
      const allSucceeded = successCount === emailList.length;

      // Update quote status to sent if at least one email succeeded
      if (successCount > 0) {
        await db.update(crmQuotes)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(crmQuotes.id, quote.id));

        await logCrmAudit(
          user.id,
          "quote.email_sent",
          "crm_quote",
          quote.id,
          { quoteNumber: quote.quoteNumber, recipients: emailList, successCount },
          req.ip
        );
      }

      return res.json({
        success: allSucceeded,
        successCount,
        totalCount: emailList.length,
        results,
      });
    } catch (error) {
      console.error("Error sending quote email:", error);
      return res.status(500).json({ message: "Failed to send quote email" });
    }
  });

  // POST /api/crm/quotes/:id/mark-sent - Manually mark quote as sent without sending email
  app.post("/api/crm/quotes/:id/mark-sent", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { note } = req.body;

      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const [updated] = await db.update(crmQuotes)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(eq(crmQuotes.id, quote.id))
        .returning();

      await db.insert(quoteEmailLogs).values({
        quoteId: quote.id,
        recipientEmail: quote.customerEmail || "manual",
        recipientName: quote.customerName,
        subject: `Quote ${quote.quoteNumber} - Marked as sent manually`,
        status: "sent",
        sentBy: user.id,
        personalMessage: note || null,
        isManual: true,
      });

      await logCrmAudit(
        user.id,
        "quote.marked_sent",
        "crm_quote",
        quote.id,
        { quoteNumber: quote.quoteNumber, note },
        req.ip
      );

      return res.json(updated);
    } catch (error) {
      console.error("Error marking quote as sent:", error);
      return res.status(500).json({ message: "Failed to mark quote as sent" });
    }
  });

  // GET /api/crm/quotes/:id/email-logs - Get email logs for a quote
  app.get("/api/crm/quotes/:id/email-logs", requireCrmAuth, async (req, res) => {
    try {
      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, req.params.id)).limit(1);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const logs = await db.select().from(quoteEmailLogs)
        .where(eq(quoteEmailLogs.quoteId, quote.id))
        .orderBy(desc(quoteEmailLogs.sentAt));

      return res.json(logs);
    } catch (error) {
      console.error("Error fetching quote email logs:", error);
      return res.status(500).json({ message: "Failed to fetch email logs" });
    }
  });

  // ============================================
  // CRM FOLLOW-UP ROUTES
  // ============================================

  // Helper function to recalculate and update customer's nextFollowUpAt
  async function updateCustomerNextFollowUp(customerId: string) {
    const pendingFollowUps = await db.select()
      .from(crmFollowUps)
      .where(and(
        eq(crmFollowUps.customerId, customerId),
        isNull(crmFollowUps.completedAt)
      ))
      .orderBy(asc(crmFollowUps.dueAt))
      .limit(1);

    const nextFollowUpAt = pendingFollowUps.length > 0 ? pendingFollowUps[0].dueAt : null;

    await db.update(crmCustomers)
      .set({ nextFollowUpAt, updatedAt: new Date() })
      .where(eq(crmCustomers.id, customerId));
  }

  // GET /api/crm/follow-ups - List all follow-ups with optional filters
  app.get("/api/crm/follow-ups", requireCrmAuth, async (req, res) => {
    try {
      const { customerId, assignedUserId, status } = req.query;
      const conditions: any[] = [];

      if (customerId && typeof customerId === 'string') {
        conditions.push(eq(crmFollowUps.customerId, customerId));
      }
      if (assignedUserId && typeof assignedUserId === 'string') {
        conditions.push(eq(crmFollowUps.assignedUserId, assignedUserId));
      }

      const now = new Date();
      if (status === 'completed') {
        conditions.push(sql`${crmFollowUps.completedAt} IS NOT NULL`);
      } else if (status === 'due') {
        conditions.push(isNull(crmFollowUps.completedAt));
        conditions.push(sql`${crmFollowUps.dueAt} >= ${now}`);
      } else if (status === 'overdue') {
        conditions.push(isNull(crmFollowUps.completedAt));
        conditions.push(sql`${crmFollowUps.dueAt} < ${now}`);
      }

      const followUps = await db.select()
        .from(crmFollowUps)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(crmFollowUps.dueAt));

      return res.json(followUps);
    } catch (error) {
      console.error("Error fetching follow-ups:", error);
      return res.status(500).json({ message: "Failed to fetch follow-ups" });
    }
  });

  // GET /api/crm/follow-ups/:id - Get single follow-up
  app.get("/api/crm/follow-ups/:id", requireCrmAuth, async (req, res) => {
    try {
      const [followUp] = await db.select()
        .from(crmFollowUps)
        .where(eq(crmFollowUps.id, req.params.id))
        .limit(1);

      if (!followUp) {
        return res.status(404).json({ message: "Follow-up not found" });
      }

      return res.json(followUp);
    } catch (error) {
      console.error("Error fetching follow-up:", error);
      return res.status(500).json({ message: "Failed to fetch follow-up" });
    }
  });

  // POST /api/crm/follow-ups - Create follow-up
  app.post("/api/crm/follow-ups", requireCrmAuth, async (req, res) => {
    try {
      const currentUser = await getCurrentCrmUser(req);
      
      // Convert dueAt string to Date if needed
      const bodyWithDate = {
        ...req.body,
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
      };
      
      const parseResult = insertCrmFollowUpSchema.safeParse(bodyWithDate);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid follow-up data", errors: parseResult.error.errors });
      }

      const data = parseResult.data;
      
      // Verify customer exists
      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, data.customerId)).limit(1);
      if (!customer) {
        return res.status(400).json({ message: "Customer not found" });
      }

      const [newFollowUp] = await db.insert(crmFollowUps)
        .values({
          ...data,
          createdBy: currentUser?.id || null,
        })
        .returning();

      // Update customer's nextFollowUpAt
      await updateCustomerNextFollowUp(data.customerId);

      return res.status(201).json(newFollowUp);
    } catch (error) {
      console.error("Error creating follow-up:", error);
      return res.status(500).json({ message: "Failed to create follow-up" });
    }
  });

  // PATCH /api/crm/follow-ups/:id - Update follow-up (mark complete, update outcome)
  app.patch("/api/crm/follow-ups/:id", requireCrmAuth, async (req, res) => {
    try {
      const [existingFollowUp] = await db.select()
        .from(crmFollowUps)
        .where(eq(crmFollowUps.id, req.params.id))
        .limit(1);

      if (!existingFollowUp) {
        return res.status(404).json({ message: "Follow-up not found" });
      }

      const updateData: Partial<InsertCrmFollowUp> & { completedAt?: Date | null } = {};
      
      if (req.body.followUpType !== undefined) updateData.followUpType = req.body.followUpType;
      if (req.body.dueAt !== undefined) updateData.dueAt = new Date(req.body.dueAt);
      if (req.body.notes !== undefined) updateData.notes = req.body.notes;
      if (req.body.outcome !== undefined) updateData.outcome = req.body.outcome;
      if (req.body.assignedUserId !== undefined) updateData.assignedUserId = req.body.assignedUserId;
      
      // Handle marking as complete/incomplete
      if (req.body.completedAt !== undefined) {
        updateData.completedAt = req.body.completedAt ? new Date(req.body.completedAt) : null;
      }

      const [updatedFollowUp] = await db.update(crmFollowUps)
        .set(updateData)
        .where(eq(crmFollowUps.id, req.params.id))
        .returning();

      // Update customer's nextFollowUpAt
      await updateCustomerNextFollowUp(existingFollowUp.customerId);

      return res.json(updatedFollowUp);
    } catch (error) {
      console.error("Error updating follow-up:", error);
      return res.status(500).json({ message: "Failed to update follow-up" });
    }
  });

  // DELETE /api/crm/follow-ups/:id - Delete follow-up
  app.delete("/api/crm/follow-ups/:id", requireCrmAuth, async (req, res) => {
    try {
      const [existingFollowUp] = await db.select()
        .from(crmFollowUps)
        .where(eq(crmFollowUps.id, req.params.id))
        .limit(1);

      if (!existingFollowUp) {
        return res.status(404).json({ message: "Follow-up not found" });
      }

      await db.delete(crmFollowUps).where(eq(crmFollowUps.id, req.params.id));

      // Update customer's nextFollowUpAt
      await updateCustomerNextFollowUp(existingFollowUp.customerId);

      return res.json({ message: "Follow-up deleted successfully" });
    } catch (error) {
      console.error("Error deleting follow-up:", error);
      return res.status(500).json({ message: "Failed to delete follow-up" });
    }
  });

  // ============================================
  // CRM PROSPECT MANAGEMENT ROUTES
  // ============================================

  // GET /api/crm/prospects - Get customers with active sales stages (not null and not 'won')
  app.get("/api/crm/prospects", requireCrmAuth, async (req, res) => {
    try {
      const { status } = req.query;
      
      let whereClause;
      if (status === 'won' || status === 'lost') {
        whereClause = eq(crmCustomers.salesStage, status);
      } else if (status) {
        whereClause = eq(crmCustomers.salesStage, status as string);
      } else {
        whereClause = and(
          sql`${crmCustomers.salesStage} IS NOT NULL`,
          sql`${crmCustomers.salesStage} != 'won'`,
          sql`${crmCustomers.salesStage} != 'lost'`
        );
      }
      
      const prospects = await db.select()
        .from(crmCustomers)
        .where(whereClause)
        .orderBy(asc(crmCustomers.nextFollowUpAt));

      return res.json(prospects);
    } catch (error) {
      console.error("Error fetching prospects:", error);
      return res.status(500).json({ message: "Failed to fetch prospects" });
    }
  });

  // GET /api/crm/prospects/metrics - Get prospect funnel metrics
  app.get("/api/crm/prospects/metrics", requireCrmAuth, async (req, res) => {
    try {
      const allProspects = await db.select()
        .from(crmCustomers)
        .where(sql`${crmCustomers.salesStage} IS NOT NULL`);
      
      const activeProspects = allProspects.filter(p => 
        p.salesStage !== 'won' && p.salesStage !== 'lost'
      );
      const wonProspects = allProspects.filter(p => p.salesStage === 'won');
      const lostProspects = allProspects.filter(p => p.salesStage === 'lost');
      
      // Get pending follow-ups count
      const pendingFollowUps = await db.select({ count: sql<number>`count(*)` })
        .from(crmFollowUps)
        .where(sql`${crmFollowUps.completedAt} IS NULL`);
      
      // Calculate conversion rate
      const totalClosed = wonProspects.length + lostProspects.length;
      const conversionRate = totalClosed > 0 
        ? (wonProspects.length / totalClosed) * 100 
        : 0;
      
      // Calculate pipeline value (sum of potentialValue for active prospects)
      const pipelineValue = activeProspects.reduce((sum, p) => sum + (p.potentialValue || 0), 0);
      
      // Build funnel counts
      const funnelCounts = {
        new: activeProspects.filter(p => p.salesStage === 'new').length,
        contacted: activeProspects.filter(p => p.salesStage === 'contacted').length,
        quote_sent: activeProspects.filter(p => p.salesStage === 'quote_sent').length,
        negotiating: activeProspects.filter(p => p.salesStage === 'negotiating').length,
        won: wonProspects.length,
        lost: lostProspects.length,
      };
      
      return res.json({
        activeProspects: activeProspects.length,
        pendingActions: Number(pendingFollowUps[0]?.count || 0),
        conversionRate: conversionRate.toFixed(1),
        pipelineValue,
        funnelCounts,
      });
    } catch (error) {
      console.error("Error fetching prospect metrics:", error);
      return res.status(500).json({ message: "Failed to fetch prospect metrics" });
    }
  });

  // GET /api/crm/prospects/overview-analytics - Get comprehensive sales analytics for funnel overview
  app.get("/api/crm/prospects/overview-analytics", requireCrmAuth, async (req, res) => {
    try {
      const { employee } = req.query;
      const employeeFilter = employee && typeof employee === 'string' ? employee : null;

      // Get all sales reps (users with role 'sales' or 'owner')
      const salesReps = await db.select({
        id: crmUsers.id,
        name: crmUsers.name,
        role: crmUsers.role,
      })
        .from(crmUsers)
        .where(and(
          or(eq(crmUsers.role, 'sales'), eq(crmUsers.role, 'owner')),
          eq(crmUsers.isActive, true)
        ));

      // Create a map for quick lookup
      const salesRepMap = new Map(salesReps.map(rep => [rep.id, rep.name]));

      // Get all prospects with a sales stage
      let prospectsQuery = db.select()
        .from(crmCustomers)
        .where(sql`${crmCustomers.salesStage} IS NOT NULL`);
      
      const allProspects = await prospectsQuery;

      // Filter by employee if provided
      const filteredProspects = employeeFilter 
        ? allProspects.filter(p => p.assignedSalesRepId === employeeFilter)
        : allProspects;

      // ============================================
      // 1. SALES REP LEADERBOARD
      // ============================================
      // When employee filter is applied, only show that rep's stats
      const repsToShow = employeeFilter 
        ? salesReps.filter(rep => rep.id === employeeFilter)
        : salesReps;
      
      const leaderboard = repsToShow.map(rep => {
        const repProspects = allProspects.filter(p => p.assignedSalesRepId === rep.id);
        const leadsAssigned = repProspects.length;
        
        // quote_sent or later stages: quote_sent, negotiating, won, lost
        const quotesGenerated = repProspects.filter(p => 
          p.salesStage === 'quote_sent' || 
          p.salesStage === 'negotiating' || 
          p.salesStage === 'won' || 
          p.salesStage === 'lost'
        ).length;
        
        const wonProspects = repProspects.filter(p => p.salesStage === 'won');
        const wins = wonProspects.length;
        
        // Conversion rate: wins / leadsAssigned * 100
        const conversionRate = leadsAssigned > 0 
          ? Math.round((wins / leadsAssigned) * 100 * 10) / 10 
          : 0;
        
        // Total revenue: sum of potentialValue for won prospects
        const totalRevenue = wonProspects.reduce((sum, p) => sum + (p.potentialValue || 0), 0);
        
        return {
          repId: rep.id,
          repName: rep.name,
          leadsAssigned,
          quotesGenerated,
          wins,
          conversionRate,
          totalRevenue,
        };
      });

      // ============================================
      // 2. STALLED DEALS (7+ days without activity)
      // ============================================
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const activeProspects = filteredProspects.filter(p => 
        p.salesStage !== 'won' && p.salesStage !== 'lost'
      );
      
      const stalledDeals = activeProspects
        .filter(prospect => {
          // Check updatedAt
          const lastActivity = prospect.updatedAt ? new Date(prospect.updatedAt) : null;
          
          // Check if nextFollowUpAt is in the past
          const nextFollowUp = prospect.nextFollowUpAt ? new Date(prospect.nextFollowUpAt) : null;
          const followUpIsPast = nextFollowUp && nextFollowUp < now;
          
          // Stalled if: updatedAt is more than 7 days ago, OR nextFollowUp is past and more than 7 days ago
          if (lastActivity && lastActivity < sevenDaysAgo) {
            return true;
          }
          if (followUpIsPast && nextFollowUp < sevenDaysAgo) {
            return true;
          }
          return false;
        })
        .map(prospect => {
          // Calculate days since activity
          const lastActivity = prospect.updatedAt ? new Date(prospect.updatedAt) : now;
          const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
          
          return {
            customerId: prospect.id,
            customerName: prospect.name,
            salesStage: prospect.salesStage || '',
            daysSinceActivity,
            potentialValue: prospect.potentialValue,
            assignedSalesRepName: prospect.assignedSalesRepId 
              ? salesRepMap.get(prospect.assignedSalesRepId) || null 
              : null,
          };
        })
        .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

      // ============================================
      // 3. 30-DAY REVENUE FORECAST (Weighted Pipeline)
      // ============================================
      const stageWeights: Record<string, number> = {
        'new': 0.10,
        'contacted': 0.25,
        'quote_sent': 0.50,
        'negotiating': 0.75,
      };
      
      const forecastStages = ['new', 'contacted', 'quote_sent', 'negotiating'];
      
      const breakdown = forecastStages.map(stage => {
        const stageProspects = filteredProspects.filter(p => p.salesStage === stage);
        const count = stageProspects.length;
        const totalValue = stageProspects.reduce((sum, p) => sum + (p.potentialValue || 0), 0);
        const weight = stageWeights[stage] || 0;
        const weightedValue = Math.round(totalValue * weight);
        
        return {
          stage,
          count,
          totalValue,
          weightedValue,
          weight,
        };
      });
      
      const totalWeightedForecast = breakdown.reduce((sum, b) => sum + b.weightedValue, 0);

      return res.json({
        leaderboard,
        stalledDeals,
        forecast: {
          totalWeightedForecast,
          breakdown,
        },
      });
    } catch (error) {
      console.error("Error fetching prospect overview analytics:", error);
      return res.status(500).json({ message: "Failed to fetch prospect overview analytics" });
    }
  });

  // PATCH /api/crm/customers/:id/stage - Update customer's salesStage
  app.patch("/api/crm/customers/:id/stage", requireCrmAuth, async (req, res) => {
    try {
      const { salesStage } = req.body;
      
      if (!salesStage || !salesStageEnum.includes(salesStage)) {
        return res.status(400).json({ 
          message: "Invalid sales stage", 
          validStages: salesStageEnum 
        });
      }

      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, req.params.id)).limit(1);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const updateData: any = {
        salesStage,
        updatedAt: new Date(),
      };

      // Set convertedAt when moving to 'won'
      if (salesStage === 'won' && customer.salesStage !== 'won') {
        updateData.convertedAt = new Date();
        updateData.customerStatus = 'client';
      }

      const [updatedCustomer] = await db.update(crmCustomers)
        .set(updateData)
        .where(eq(crmCustomers.id, req.params.id))
        .returning();

      return res.json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer sales stage:", error);
      return res.status(500).json({ message: "Failed to update sales stage" });
    }
  });

  // PATCH /api/crm/customers/:id/interest - Update customer's interestLevel
  app.patch("/api/crm/customers/:id/interest", requireCrmAuth, async (req, res) => {
    try {
      const { interestLevel } = req.body;
      
      if (!interestLevel || !interestLevelEnum.includes(interestLevel)) {
        return res.status(400).json({ 
          message: "Invalid interest level", 
          validLevels: interestLevelEnum 
        });
      }

      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, req.params.id)).limit(1);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const [updatedCustomer] = await db.update(crmCustomers)
        .set({
          interestLevel,
          updatedAt: new Date(),
        })
        .where(eq(crmCustomers.id, req.params.id))
        .returning();

      return res.json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer interest level:", error);
      return res.status(500).json({ message: "Failed to update interest level" });
    }
  });

  // PATCH /api/crm/customers/:id/portal-access - Toggle customer portal access
  app.patch("/api/crm/customers/:id/portal-access", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }

      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, req.params.id)).limit(1);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const [updatedCustomer] = await db.update(crmCustomers)
        .set({
          portalEnabled: enabled,
          updatedAt: new Date(),
        })
        .where(eq(crmCustomers.id, req.params.id))
        .returning();

      await logCrmAudit(user.id, "portal_access_toggled", "customer", req.params.id, {
        customerName: customer.name,
        portalEnabled: enabled,
        previousValue: customer.portalEnabled,
      });

      return res.json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer portal access:", error);
      return res.status(500).json({ message: "Failed to update portal access" });
    }
  });

  // ============================================
  // SERVICE CALL CHECKLISTS API
  // ============================================

  // GET /api/crm/checklists - List all checklist templates with their questions
  app.get("/api/crm/checklists", requireCrmAuth, async (req, res) => {
    try {
      const checklists = await db.select().from(serviceCallChecklists).orderBy(asc(serviceCallChecklists.serviceType), asc(serviceCallChecklists.name));
      
      const checklistsWithQuestions = await Promise.all(
        checklists.map(async (checklist) => {
          const questions = await db.select()
            .from(checklistQuestions)
            .where(eq(checklistQuestions.checklistId, checklist.id))
            .orderBy(asc(checklistQuestions.sortOrder));
          return { ...checklist, questions };
        })
      );
      
      res.json(checklistsWithQuestions);
    } catch (error) {
      console.error("Error fetching checklists:", error);
      res.status(500).json({ message: "Failed to fetch checklists" });
    }
  });

  // GET /api/crm/checklists/:serviceType - Get checklist by service type
  app.get("/api/crm/checklists/:serviceType", requireCrmAuth, async (req, res) => {
    try {
      const { serviceType } = req.params;
      
      if (!serviceCallTypeEnum.includes(serviceType as any)) {
        return res.status(400).json({ message: "Invalid service type" });
      }
      
      const [checklist] = await db.select()
        .from(serviceCallChecklists)
        .where(and(
          eq(serviceCallChecklists.serviceType, serviceType),
          eq(serviceCallChecklists.isActive, true)
        ))
        .limit(1);
      
      if (!checklist) {
        return res.status(404).json({ message: "Checklist not found for this service type" });
      }
      
      const questions = await db.select()
        .from(checklistQuestions)
        .where(eq(checklistQuestions.checklistId, checklist.id))
        .orderBy(asc(checklistQuestions.sortOrder));
      
      res.json({ ...checklist, questions });
    } catch (error) {
      console.error("Error fetching checklist by service type:", error);
      res.status(500).json({ message: "Failed to fetch checklist" });
    }
  });

  // POST /api/crm/checklists - Create new checklist template (admin and sales)
  app.post("/api/crm/checklists", requireCrmAuth, async (req, res) => {
    try {
      const parsed = insertServiceCallChecklistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid checklist data", errors: parsed.error.errors });
      }
      
      const [newChecklist] = await db.insert(serviceCallChecklists)
        .values(parsed.data)
        .returning();
      
      res.status(201).json(newChecklist);
    } catch (error) {
      console.error("Error creating checklist:", error);
      res.status(500).json({ message: "Failed to create checklist" });
    }
  });

  // PUT /api/crm/checklists/:id - Update checklist template (admin and sales)
  app.put("/api/crm/checklists/:id", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const [existing] = await db.select().from(serviceCallChecklists).where(eq(serviceCallChecklists.id, id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Checklist not found" });
      }
      
      const updateSchema = insertServiceCallChecklistSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid checklist data", errors: parsed.error.errors });
      }
      
      const [updated] = await db.update(serviceCallChecklists)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(serviceCallChecklists.id, id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating checklist:", error);
      res.status(500).json({ message: "Failed to update checklist" });
    }
  });

  // DELETE /api/crm/checklists/:id - Delete checklist template (admin and sales)
  app.delete("/api/crm/checklists/:id", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const [existing] = await db.select().from(serviceCallChecklists).where(eq(serviceCallChecklists.id, id)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Checklist not found" });
      }
      
      await db.delete(serviceCallChecklists).where(eq(serviceCallChecklists.id, id));
      
      res.json({ message: "Checklist deleted successfully" });
    } catch (error) {
      console.error("Error deleting checklist:", error);
      res.status(500).json({ message: "Failed to delete checklist" });
    }
  });

  // GET /api/crm/checklists/:checklistId/questions - Get questions for a checklist
  app.get("/api/crm/checklists/:checklistId/questions", requireCrmAuth, async (req, res) => {
    try {
      const { checklistId } = req.params;
      
      const [checklist] = await db.select().from(serviceCallChecklists).where(eq(serviceCallChecklists.id, checklistId)).limit(1);
      if (!checklist) {
        return res.status(404).json({ message: "Checklist not found" });
      }
      
      const questions = await db.select()
        .from(checklistQuestions)
        .where(eq(checklistQuestions.checklistId, checklistId))
        .orderBy(asc(checklistQuestions.sortOrder));
      
      res.json(questions);
    } catch (error) {
      console.error("Error fetching checklist questions:", error);
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  // POST /api/crm/checklists/:checklistId/questions - Add question to checklist (admin and sales)
  app.post("/api/crm/checklists/:checklistId/questions", requireCrmAuth, async (req, res) => {
    try {
      const { checklistId } = req.params;
      
      const [checklist] = await db.select().from(serviceCallChecklists).where(eq(serviceCallChecklists.id, checklistId)).limit(1);
      if (!checklist) {
        return res.status(404).json({ message: "Checklist not found" });
      }
      
      const parsed = insertChecklistQuestionSchema.safeParse({ ...req.body, checklistId });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid question data", errors: parsed.error.errors });
      }
      
      const [newQuestion] = await db.insert(checklistQuestions)
        .values(parsed.data)
        .returning();
      
      res.status(201).json(newQuestion);
    } catch (error) {
      console.error("Error creating checklist question:", error);
      res.status(500).json({ message: "Failed to create question" });
    }
  });

  // PUT /api/crm/checklists/questions/:questionId - Update question (admin and sales)
  app.put("/api/crm/checklists/questions/:questionId", requireCrmAuth, async (req, res) => {
    try {
      const { questionId } = req.params;
      
      const [existing] = await db.select().from(checklistQuestions).where(eq(checklistQuestions.id, questionId)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      const updateSchema = insertChecklistQuestionSchema.partial().omit({ checklistId: true });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid question data", errors: parsed.error.errors });
      }
      
      const [updated] = await db.update(checklistQuestions)
        .set(parsed.data)
        .where(eq(checklistQuestions.id, questionId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating question:", error);
      res.status(500).json({ message: "Failed to update question" });
    }
  });

  // DELETE /api/crm/checklists/questions/:questionId - Delete question (admin and sales)
  app.delete("/api/crm/checklists/questions/:questionId", requireCrmAuth, async (req, res) => {
    try {
      const { questionId } = req.params;
      
      const [existing] = await db.select().from(checklistQuestions).where(eq(checklistQuestions.id, questionId)).limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      await db.delete(checklistQuestions).where(eq(checklistQuestions.id, questionId));
      
      res.json({ message: "Question deleted successfully" });
    } catch (error) {
      console.error("Error deleting question:", error);
      res.status(500).json({ message: "Failed to delete question" });
    }
  });

  // POST /api/crm/work-orders/:workOrderId/checklist-response - Save checklist response for a work order
  app.post("/api/crm/work-orders/:workOrderId/checklist-response", requireCrmAuth, async (req, res) => {
    try {
      const { workOrderId } = req.params;
      
      const [workOrder] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, workOrderId)).limit(1);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      
      const parsed = insertWorkOrderChecklistResponseSchema.safeParse({ ...req.body, workOrderId });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid response data", errors: parsed.error.errors });
      }
      
      // Validate required questions are answered
      const { checklistId, answers } = parsed.data;
      const requiredQuestions = await db.select()
        .from(checklistQuestions)
        .where(and(
          eq(checklistQuestions.checklistId, checklistId),
          eq(checklistQuestions.isRequired, true)
        ));
      
      const missingRequired: string[] = [];
      for (const q of requiredQuestions) {
        const answer = answers[q.id];
        if (answer === undefined || answer === null || answer === "") {
          missingRequired.push(q.question);
        }
      }
      
      if (missingRequired.length > 0) {
        return res.status(400).json({ 
          message: "Required checklist questions not answered",
          missingQuestions: missingRequired
        });
      }
      
      const [existingResponse] = await db.select()
        .from(workOrderChecklistResponses)
        .where(eq(workOrderChecklistResponses.workOrderId, workOrderId))
        .limit(1);
      
      if (existingResponse) {
        const [updated] = await db.update(workOrderChecklistResponses)
          .set({
            ...parsed.data,
            completedAt: new Date(),
          })
          .where(eq(workOrderChecklistResponses.id, existingResponse.id))
          .returning();
        return res.json(updated);
      }
      
      const [newResponse] = await db.insert(workOrderChecklistResponses)
        .values({
          ...parsed.data,
          completedAt: new Date(),
        })
        .returning();
      
      res.status(201).json(newResponse);
    } catch (error) {
      console.error("Error saving checklist response:", error);
      res.status(500).json({ message: "Failed to save checklist response" });
    }
  });

  // GET /api/crm/work-orders/:workOrderId/checklist-response - Get checklist response for a work order
  app.get("/api/crm/work-orders/:workOrderId/checklist-response", requireCrmAuth, async (req, res) => {
    try {
      const { workOrderId } = req.params;
      
      const [workOrder] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, workOrderId)).limit(1);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      
      const [response] = await db.select()
        .from(workOrderChecklistResponses)
        .where(eq(workOrderChecklistResponses.workOrderId, workOrderId))
        .limit(1);
      
      if (!response) {
        return res.status(404).json({ message: "No checklist response found for this work order" });
      }
      
      const [checklist] = await db.select()
        .from(serviceCallChecklists)
        .where(eq(serviceCallChecklists.id, response.checklistId))
        .limit(1);
      
      const questions = checklist ? await db.select()
        .from(checklistQuestions)
        .where(eq(checklistQuestions.checklistId, checklist.id))
        .orderBy(asc(checklistQuestions.sortOrder)) : [];
      
      res.json({
        ...response,
        checklist: checklist ? { ...checklist, questions } : null,
      });
    } catch (error) {
      console.error("Error fetching checklist response:", error);
      res.status(500).json({ message: "Failed to fetch checklist response" });
    }
  });

  // POST /api/ai/summarize-checklist - Generate AI summary of checklist answers
  app.post("/api/ai/summarize-checklist", requireCrmAuth, async (req, res) => {
    try {
      const { questions, answers, serviceType } = req.body;
      
      if (!questions || !answers) {
        return res.status(400).json({ message: "Questions and answers are required" });
      }
      
      // Build a text representation of the checklist answers
      const questionAnswerPairs: string[] = [];
      for (const q of questions) {
        const answer = answers[q.id];
        if (answer !== undefined && answer !== "") {
          let answerText = String(answer);
          if (q.questionType === "yes_no") {
            answerText = answer === true || answer === "true" ? "Yes" : "No";
          }
          questionAnswerPairs.push(`${q.question}: ${answerText}`);
        }
      }
      
      // Try AI summarization with fallback to text concatenation
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        
        const serviceTypeDisplay = serviceType?.replace(/_/g, " ").toLowerCase() || "service call";
        
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are helping format service call intake information for HVAC technicians. 
Summarize the checklist answers into a clear, concise paragraph for technicians to read quickly.
Focus on key diagnostic details. Write in third person (e.g., "Customer reports..." not "I").
Keep it under 100 words. No bullet points - just a flowing summary.`
            },
            {
              role: "user",
              content: `Service type: ${serviceTypeDisplay}\n\nChecklist answers:\n${questionAnswerPairs.join("\n")}`
            }
          ],
          max_tokens: 200,
          temperature: 0.3,
        });
        
        const summary = completion.choices[0]?.message?.content?.trim() || questionAnswerPairs.join(". ") + ".";
        res.json({ summary });
        
      } catch (aiError) {
        console.error("AI summarization failed, using fallback:", aiError);
        // Fallback: simple text concatenation
        const fallbackSummary = questionAnswerPairs.join(". ") + ".";
        res.json({ summary: fallbackSummary, fallback: true });
      }
      
    } catch (error) {
      console.error("Error summarizing checklist:", error);
      res.status(500).json({ message: "Failed to summarize checklist" });
    }
  });

  // ===== Goals Tracker API =====
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Helper function to import goals from Excel file
  async function importGoalsFromExcel(year: number): Promise<string[]> {
    const excelPath = path.join(process.cwd(), "attached_assets/12-03-2025_GHVAC_1767440304627.xlsx");
    
    if (!fs.existsSync(excelPath)) {
      console.log('[Goals] Excel file not found, skipping import');
      return [];
    }
    
    // Read file as buffer for ES module compatibility
    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const importedMonths: string[] = [];
    
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const monthName = monthNames[monthIndex];
      const sheet = workbook.Sheets[monthName];
      
      if (!sheet) continue;
      
      const data = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
      
      let dailyServiceGoal = 0;
      let dailyInstallGoal = 0;
      let dailyMaintenanceGoal = 0;
      let daysCount = 0;
      
      // Row 2 (index 2) contains "Budgeted Monthly Sales Volume for Break-Even Plus Profit Goal + OH Adjustments"
      // Value is in Column B (index 1)
      const row2 = data[2] as any[];
      const budgetedMonthlySalesGoal = row2 && row2[1] ? parseFloat(row2[1]) || 0 : 0;
      
      for (let i = 18; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || !row[0] || !String(row[0]).startsWith("Day")) break;
        
        const serviceGoal = parseFloat(row[1]) || 0;
        const installGoal = parseFloat(row[3]) || 0;
        const maintenanceGoal = parseFloat(row[5]) || 0;
        
        dailyServiceGoal += serviceGoal;
        dailyInstallGoal += installGoal;
        dailyMaintenanceGoal += maintenanceGoal;
        daysCount++;
      }
      
      if (daysCount > 0) {
        const avgDailyService = dailyServiceGoal / daysCount;
        const avgDailyInstall = dailyInstallGoal / daysCount;
        const avgDailyMaintenance = dailyMaintenanceGoal / daysCount;
        
        const monthlyServiceGoal = dailyServiceGoal;
        const monthlyInstallGoal = dailyInstallGoal;
        const monthlyMaintenanceGoal = dailyMaintenanceGoal;
        const monthlySalesGoal = monthlyServiceGoal + monthlyInstallGoal + monthlyMaintenanceGoal;
        
        const [existing] = await db.select().from(monthlyGoals)
          .where(and(eq(monthlyGoals.year, year), eq(monthlyGoals.month, monthIndex + 1)));
        
        if (existing) {
          await db.update(monthlyGoals)
            .set({
              dailyServiceGoal: avgDailyService.toFixed(2),
              dailyInstallGoal: avgDailyInstall.toFixed(2),
              dailyMaintenanceGoal: avgDailyMaintenance.toFixed(2),
              monthlyServiceGoal: monthlyServiceGoal.toFixed(2),
              monthlyInstallGoal: monthlyInstallGoal.toFixed(2),
              monthlyMaintenanceGoal: monthlyMaintenanceGoal.toFixed(2),
              monthlySalesGoal: monthlySalesGoal.toFixed(2),
              budgetedMonthlySalesGoal: budgetedMonthlySalesGoal.toFixed(2),
              serviceWorkDays: daysCount,
              updatedAt: new Date(),
            })
            .where(eq(monthlyGoals.id, existing.id));
        } else {
          await db.insert(monthlyGoals).values({
            year,
            month: monthIndex + 1,
            dailyServiceGoal: avgDailyService.toFixed(2),
            dailyInstallGoal: avgDailyInstall.toFixed(2),
            dailyMaintenanceGoal: avgDailyMaintenance.toFixed(2),
            monthlyServiceGoal: monthlyServiceGoal.toFixed(2),
            monthlyInstallGoal: monthlyInstallGoal.toFixed(2),
            monthlyMaintenanceGoal: monthlyMaintenanceGoal.toFixed(2),
            monthlySalesGoal: monthlySalesGoal.toFixed(2),
            budgetedMonthlySalesGoal: budgetedMonthlySalesGoal.toFixed(2),
            serviceWorkDays: daysCount,
          });
        }
        
        importedMonths.push(monthName);
      }
    }
    
    return importedMonths;
  }

  // Bootstrap function to auto-import goals on server startup
  async function bootstrapMonthlyGoals(): Promise<void> {
    const year = new Date().getFullYear();
    
    // Check if goals exist for current year
    const existingGoals = await db.select().from(monthlyGoals)
      .where(eq(monthlyGoals.year, year));
    
    if (existingGoals.length >= 12) {
      console.log(`[Goals] All 12 months already populated for ${year}`);
      return;
    }
    
    console.log(`[Goals] Importing missing goals for ${year}...`);
    const imported = await importGoalsFromExcel(year);
    
    if (imported.length > 0) {
      console.log(`[Goals] Successfully imported goals for ${imported.length} months: ${imported.join(', ')}`);
    }
  }

  // GET /api/crm/goals/:year/:month - Get goals for a specific month
  app.get("/api/crm/goals/:year/:month", requireCrmAuth, async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }
      
      const [goal] = await db.select().from(monthlyGoals)
        .where(and(eq(monthlyGoals.year, year), eq(monthlyGoals.month, month)));
      
      if (!goal) {
        return res.status(404).json({ message: "Goals not found for this month" });
      }
      
      res.json(goal);
    } catch (error) {
      console.error("Error fetching monthly goals:", error);
      res.status(500).json({ message: "Failed to fetch monthly goals" });
    }
  });

  // POST /api/crm/goals/import - Parse Excel file and import all monthly goals (uses shared helper)
  app.post("/api/crm/goals/import", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const year = req.body.year || new Date().getFullYear();
      const importedMonths = await importGoalsFromExcel(year);
      
      res.json({ 
        message: `Successfully imported goals for ${importedMonths.length} months`,
        months: importedMonths,
        year 
      });
    } catch (error) {
      console.error("Error importing goals:", error);
      res.status(500).json({ message: "Failed to import goals" });
    }
  });

  // GET /api/crm/goals/tracker - Get current month's goals vs actual revenue data
  app.get("/api/crm/goals/tracker", requireCrmAuth, async (req, res) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const dayOfMonth = now.getDate();
      const monthName = monthNames[month - 1];
      
      // Get goals for current month
      const [goals] = await db.select().from(monthlyGoals)
        .where(and(eq(monthlyGoals.year, year), eq(monthlyGoals.month, month)));
      
      // Calculate start of month and today in Eastern timezone
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
      const startOfToday = new Date(year, month - 1, dayOfMonth, 0, 0, 0);
      const endOfToday = new Date(year, month - 1, dayOfMonth, 23, 59, 59);
      
      // Get paid invoices for current month with work order visit types
      const paidInvoices = await db.select({
        total: crmInvoices.total,
        paidAt: crmInvoices.paidAt,
        visitType: crmWorkOrders.visitType,
      })
        .from(crmInvoices)
        .leftJoin(crmWorkOrders, eq(crmInvoices.workOrderId, crmWorkOrders.id))
        .where(and(
          eq(crmInvoices.status, "paid"),
          isNotNull(crmInvoices.paidAt),
          gt(crmInvoices.paidAt, startOfMonth),
        ));
      
      // Categorize revenue by visit type
      let serviceActualMTD = 0;
      let installActualMTD = 0;
      let maintenanceActualMTD = 0;
      let serviceActualToday = 0;
      let installActualToday = 0;
      let maintenanceActualToday = 0;
      
      for (const invoice of paidInvoices) {
        const amount = parseFloat(invoice.total || "0");
        const paidAt = invoice.paidAt ? new Date(invoice.paidAt) : null;
        const isToday = paidAt && paidAt >= startOfToday && paidAt <= endOfToday;
        
        switch (invoice.visitType) {
          case "SERVICE":
            serviceActualMTD += amount;
            if (isToday) serviceActualToday += amount;
            break;
          case "INSTALL":
            installActualMTD += amount;
            if (isToday) installActualToday += amount;
            break;
          case "MAINTENANCE":
            maintenanceActualMTD += amount;
            if (isToday) maintenanceActualToday += amount;
            break;
          default:
            // Count untyped invoices as service
            serviceActualMTD += amount;
            if (isToday) serviceActualToday += amount;
        }
      }
      
      // Calculate goals and metrics
      const dailyServiceGoal = parseFloat(goals?.dailyServiceGoal || "0");
      const dailyInstallGoal = parseFloat(goals?.dailyInstallGoal || "0");
      const dailyMaintenanceGoal = parseFloat(goals?.dailyMaintenanceGoal || "0");
      
      const mtdServiceGoal = dailyServiceGoal * dayOfMonth;
      const mtdInstallGoal = dailyInstallGoal * dayOfMonth;
      const mtdMaintenanceGoal = dailyMaintenanceGoal * dayOfMonth;
      
      const dailyTotalGoal = dailyServiceGoal + dailyInstallGoal + dailyMaintenanceGoal;
      const dailyTotalActual = serviceActualToday + installActualToday + maintenanceActualToday;
      const mtdTotalGoal = mtdServiceGoal + mtdInstallGoal + mtdMaintenanceGoal;
      const mtdTotalActual = serviceActualMTD + installActualMTD + maintenanceActualMTD;
      
      const monthlySalesGoal = parseFloat(goals?.monthlySalesGoal || "0");
      
      const buildCategory = (dailyGoal: number, dailyActual: number, mtdGoal: number, mtdActual: number) => ({
        dailyGoal,
        dailyActual,
        mtdGoal,
        mtdActual,
        difference: mtdActual - mtdGoal,
        percentComplete: mtdGoal > 0 ? Math.round((mtdActual / mtdGoal) * 100) : 0,
      });
      
      // Get all technicians (including supervisors who function as techs)
      const techs = await db.select({
        id: crmUsers.id,
        name: crmUsers.name,
      }).from(crmUsers).where(sql`${crmUsers.role} IN ('tech', 'supervisor')`);
      
      const techCount = techs.length || 1; // Avoid division by zero
      
      // Calculate individual tech goals (total goal / number of techs)
      const techDailyServiceGoal = dailyServiceGoal / techCount;
      const techDailyInstallGoal = dailyInstallGoal / techCount;
      const techDailyMaintenanceGoal = dailyMaintenanceGoal / techCount;
      const techDailyTotalGoal = dailyTotalGoal / techCount;
      
      const techMtdServiceGoal = mtdServiceGoal / techCount;
      const techMtdInstallGoal = mtdInstallGoal / techCount;
      const techMtdMaintenanceGoal = mtdMaintenanceGoal / techCount;
      const techMtdTotalGoal = mtdTotalGoal / techCount;
      
      // Get paid invoices with tech assignment for current month
      const techInvoices = await db.select({
        total: crmInvoices.total,
        paidAt: crmInvoices.paidAt,
        visitType: crmWorkOrders.visitType,
        assignedTechId: crmWorkOrders.assignedTechId,
      })
        .from(crmInvoices)
        .leftJoin(crmWorkOrders, eq(crmInvoices.workOrderId, crmWorkOrders.id))
        .where(and(
          eq(crmInvoices.status, "paid"),
          isNotNull(crmInvoices.paidAt),
          gt(crmInvoices.paidAt, startOfMonth),
        ));
      
      // Build technician breakdown
      const technicians = techs.map(tech => {
        let serviceMTD = 0;
        let installMTD = 0;
        let maintenanceMTD = 0;
        
        for (const invoice of techInvoices) {
          if (invoice.assignedTechId !== tech.id) continue;
          
          const amount = parseFloat(invoice.total || "0");
          switch (invoice.visitType) {
            case "SERVICE":
              serviceMTD += amount;
              break;
            case "INSTALL":
              installMTD += amount;
              break;
            case "MAINTENANCE":
              maintenanceMTD += amount;
              break;
            default:
              serviceMTD += amount;
          }
        }
        
        const totalMTD = serviceMTD + installMTD + maintenanceMTD;
        
        return {
          id: tech.id,
          name: tech.name,
          service: {
            dailyGoal: techDailyServiceGoal,
            mtdGoal: techMtdServiceGoal,
            mtdActual: serviceMTD,
            difference: serviceMTD - techMtdServiceGoal,
            percentComplete: techMtdServiceGoal > 0 ? Math.round((serviceMTD / techMtdServiceGoal) * 100) : 0,
          },
          install: {
            dailyGoal: techDailyInstallGoal,
            mtdGoal: techMtdInstallGoal,
            mtdActual: installMTD,
            difference: installMTD - techMtdInstallGoal,
            percentComplete: techMtdInstallGoal > 0 ? Math.round((installMTD / techMtdInstallGoal) * 100) : 0,
          },
          maintenance: {
            dailyGoal: techDailyMaintenanceGoal,
            mtdGoal: techMtdMaintenanceGoal,
            mtdActual: maintenanceMTD,
            difference: maintenanceMTD - techMtdMaintenanceGoal,
            percentComplete: techMtdMaintenanceGoal > 0 ? Math.round((maintenanceMTD / techMtdMaintenanceGoal) * 100) : 0,
          },
          total: {
            dailyGoal: techDailyTotalGoal,
            mtdGoal: techMtdTotalGoal,
            mtdActual: totalMTD,
            difference: totalMTD - techMtdTotalGoal,
            percentComplete: techMtdTotalGoal > 0 ? Math.round((totalMTD / techMtdTotalGoal) * 100) : 0,
          },
        };
      });
      
      res.json({
        month: monthName,
        year,
        dayOfMonth,
        daysInMonth: new Date(year, month, 0).getDate(),
        hasGoals: !!goals,
        service: buildCategory(dailyServiceGoal, serviceActualToday, mtdServiceGoal, serviceActualMTD),
        install: buildCategory(dailyInstallGoal, installActualToday, mtdInstallGoal, installActualMTD),
        maintenance: buildCategory(dailyMaintenanceGoal, maintenanceActualToday, mtdMaintenanceGoal, maintenanceActualMTD),
        total: buildCategory(dailyTotalGoal, dailyTotalActual, mtdTotalGoal, mtdTotalActual),
        sales: {
          mtdGoal: monthlySalesGoal,
          mtdActual: mtdTotalActual,
          difference: mtdTotalActual - monthlySalesGoal,
          percentComplete: monthlySalesGoal > 0 ? Math.round((mtdTotalActual / monthlySalesGoal) * 100) : 0,
        },
        technicians,
      });
    } catch (error) {
      console.error("Error fetching goals tracker:", error);
      res.status(500).json({ message: "Failed to fetch goals tracker data" });
    }
  });

  // GET /api/crm/mobile/my-performance - Get performance data for the authenticated user
  app.get("/api/crm/mobile/my-performance", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const startOfMonth = new Date(year, month - 1, 1);

      // Get monthly goals
      const [goals] = await db.select()
        .from(monthlyGoals)
        .where(and(
          eq(monthlyGoals.year, year),
          eq(monthlyGoals.month, month)
        ));

      if (user.role === "tech" || user.role === "supervisor") {
        // Tech performance data - invoice-payment-driven attribution
        // Revenue counts as soon as invoice is paid, regardless of work order status
        // Count both techs and supervisors for goal division
        const techCount = await db.select({ count: count() })
          .from(crmUsers)
          .where(and(sql`${crmUsers.role} IN ('tech', 'supervisor')`, eq(crmUsers.isActive, true)));
        const numTechs = Number(techCount[0]?.count) || 1;

        // Get all work orders assigned to this tech (any status)
        const techWorkOrders = await db
          .select({ id: crmWorkOrders.id })
          .from(crmWorkOrders)
          .where(eq(crmWorkOrders.assignedTechId, user.id));

        const workOrderIds = techWorkOrders.map(wo => wo.id);
        
        // Get revenue from PAID invoices for this tech's work orders (paid this month)
        // Use paidAt if available, otherwise fall back to updatedAt for legacy invoices
        let serviceRevenue = 0;
        let paidInvoiceCount = 0;
        if (workOrderIds.length > 0) {
          const revenueResult = await db
            .select({
              total: sql<string>`COALESCE(SUM(CAST(${crmInvoices.total} AS DECIMAL(10,2))), 0)`,
              count: sql<number>`COUNT(*)`,
            })
            .from(crmInvoices)
            .where(and(
              inArray(crmInvoices.workOrderId, workOrderIds),
              eq(crmInvoices.status, "paid"),
              sql`COALESCE(${crmInvoices.paidAt}, ${crmInvoices.updatedAt}) >= ${startOfMonth}`
            ));
          serviceRevenue = parseFloat(revenueResult[0]?.total || "0");
          paidInvoiceCount = Number(revenueResult[0]?.count) || 0;
        }

        // Service jobs = number of distinct work orders with paid invoices this month
        const serviceJobs = paidInvoiceCount;
        const perTicketAvg = serviceJobs > 0 ? serviceRevenue / serviceJobs : 0;

        // Get quoted amount for this tech's work orders (draft or sent - potential revenue not yet won)
        let quotedAmount = 0;
        if (workOrderIds.length > 0) {
          const quotedResult = await db
            .select({
              total: sql<string>`COALESCE(SUM(CAST(${crmQuotes.total} AS DECIMAL(10,2))), 0)`,
            })
            .from(crmQuotes)
            .where(and(
              inArray(crmQuotes.workOrderId, workOrderIds),
              sql`${crmQuotes.status} IN ('draft', 'sent')`,
              sql`${crmQuotes.createdAt} >= ${startOfMonth}`
            ));
          quotedAmount = parseFloat(quotedResult[0]?.total || "0");
        }

        // Get maintenance agreements completed by this tech
        const maintenanceAgreementsCount = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(maintenanceVisits)
          .innerJoin(crmWorkOrders, eq(maintenanceVisits.workOrderId, crmWorkOrders.id))
          .where(and(
            eq(crmWorkOrders.assignedTechId, user.id),
            eq(maintenanceVisits.status, "completed"),
            sql`${maintenanceVisits.completedAt} >= ${startOfMonth}`
          ));

        // Calculate tech's individual goal (same as dashboard: daily goal * days in range / numTechs)
        const dailyServiceGoal = parseFloat(goals?.dailyServiceGoal || "0");
        const daysInMonth = new Date(year, month, 0).getDate();
        const dayOfMonth = now.getDate();
        const techDailyGoal = numTechs > 0 ? dailyServiceGoal / numTechs : 0;
        const techGoal = techDailyGoal * dayOfMonth; // Goal through today

        // Calculate potential: sold + quoted (if no quotes, potential = sold showing 100% conversion)
        // When there's no activity at all, fall back to goal
        const salesOpportunity = serviceRevenue + quotedAmount;
        const potential = salesOpportunity > 0 ? salesOpportunity : techGoal;

        res.json({
          role: "tech",
          serviceRevenue,
          quotedAmount,
          serviceJobs,
          perTicketAvg,
          maintenanceAgreements: maintenanceAgreementsCount[0]?.count || 0,
          goal: potential,
          goalTarget: techGoal,
        });
      } else if (user.role === "sales" || user.role === "owner" || user.role === "admin") {
        // Sales performance data
        const installGoal = parseFloat(goals?.monthlyInstallGoal || "0");
        
        // Count only users with 'sales' role to divide goal
        const salesCount = await db.select({ count: count() })
          .from(crmUsers)
          .where(and(
            eq(crmUsers.role, "sales"),
            eq(crmUsers.isActive, true)
          ));
        const numSalespeople = Number(salesCount[0]?.count) || 1;
        const individualInstallGoal = numSalespeople > 0 ? installGoal / numSalespeople : installGoal;

        // Get quotes created/assigned to this user
        const salesQuotes = await db.select({
          total: crmQuotes.total,
          status: crmQuotes.status,
        })
          .from(crmQuotes)
          .where(and(
            or(eq(crmQuotes.createdById, user.id), eq(crmQuotes.assignedToId, user.id)),
            gt(crmQuotes.createdAt, startOfMonth)
          ));

        let quotesGenerated = salesQuotes.length;
        let sentQuotesTotal = 0;
        let acceptedQuotesTotal = 0;
        let wonCount = 0;
        let lostCount = 0;

        for (const quote of salesQuotes) {
          const amount = parseFloat(quote.total || "0");
          if (quote.status === "sent" || quote.status === "accepted" || quote.status === "declined") {
            sentQuotesTotal += amount;
          }
          if (quote.status === "accepted") {
            acceptedQuotesTotal += amount;
            wonCount++;
          }
          if (quote.status === "declined") {
            lostCount++;
          }
        }

        // Get customers in negotiating stage assigned to this user
        const negotiatingCustomers = await db.select({ count: count() })
          .from(crmCustomers)
          .where(and(
            eq(crmCustomers.assignedSalesRepId, user.id),
            eq(crmCustomers.salesStage, "negotiating")
          ));
        const negotiatingCount = negotiatingCustomers[0]?.count || 0;

        // Get leads received (new prospects assigned to this user)
        const leadsReceived = await db.select({ count: count() })
          .from(crmCustomers)
          .where(and(
            eq(crmCustomers.assignedSalesRepId, user.id),
            eq(crmCustomers.customerStatus, "prospect"),
            gt(crmCustomers.createdAt, startOfMonth)
          ));

        // Get sales visits (work orders of type SALES assigned to this user)
        const salesVisits = await db.select({ count: count() })
          .from(crmWorkOrders)
          .where(and(
            eq(crmWorkOrders.assignedTechId, user.id),
            eq(crmWorkOrders.visitType, "INSTALL"),
            gt(crmWorkOrders.scheduledStart, startOfMonth)
          ));

        // Calculate closing rate and average sale
        const closedDeals = wonCount + lostCount;
        const closingRate = closedDeals > 0 ? (wonCount / closedDeals) * 100 : 0;
        const averageSale = wonCount > 0 ? acceptedQuotesTotal / wonCount : 0;

        res.json({
          role: "sales",
          leadsReceived: leadsReceived[0]?.count || 0,
          salesVisits: salesVisits[0]?.count || 0,
          quotesGenerated,
          averageSale,
          closingRate,
          wonCount,
          negotiatingCount,
          lostCount,
          sold: acceptedQuotesTotal,
          quoted: sentQuotesTotal,
          goal: individualInstallGoal, // Divided by number of salespeople like tech goal
        });
      } else {
        res.json({ role: user.role, message: "No performance data for this role" });
      }
    } catch (error) {
      console.error("Error fetching my performance:", error);
      res.status(500).json({ message: "Failed to fetch performance data" });
    }
  });

  // ============================================
  // CRM MESSAGING ROUTES
  // ============================================

  // GET /api/crm/messaging/unread-count - Get total unread message count
  app.get("/api/crm/messaging/unread-count", requireCrmAuth, async (req, res) => {
    try {
      const result = await db.select({ 
        totalUnread: sql<number>`COALESCE(SUM(${crmMessagingConversations.unreadInboundCount}), 0)::int`
      }).from(crmMessagingConversations);
      
      return res.json({ unreadCount: result[0]?.totalUnread || 0 });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      return res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // GET /api/crm/messaging/conversations - List conversations with filters
  app.get("/api/crm/messaging/conversations", requireCrmAuth, async (req, res) => {
    try {
      const { status, assignedToId, customerId, search } = req.query;
      
      const filters: { status?: string; assignedToId?: string; customerId?: string; search?: string } = {};
      if (status && typeof status === "string") filters.status = status;
      if (assignedToId && typeof assignedToId === "string") filters.assignedToId = assignedToId;
      if (customerId && typeof customerId === "string") filters.customerId = customerId;
      if (search && typeof search === "string") filters.search = search;

      const conversations = await storage.getMessagingConversations(filters);
      
      // Attach customer info to each conversation
      const conversationsWithCustomers = await Promise.all(
        conversations.map(async (conv) => {
          let customer = null;
          if (conv.customerId) {
            const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, conv.customerId));
            customer = cust || null;
          }
          return { ...conv, customer };
        })
      );

      return res.json(conversationsWithCustomers);
    } catch (error) {
      console.error("Error fetching messaging conversations:", error);
      return res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // POST /api/crm/messaging/conversations - Create new conversation
  app.post("/api/crm/messaging/conversations", requireCrmAuth, async (req, res) => {
    try {
      const parseResult = insertCrmMessagingConversationSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parseResult.error.errors });
      }

      const conversation = await storage.createMessagingConversation(parseResult.data);
      return res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating messaging conversation:", error);
      return res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // GET /api/crm/messaging/conversations/:id - Get single conversation with messages
  app.get("/api/crm/messaging/conversations/:id", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const conversation = await storage.getMessagingConversationById(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // If this is a Textline conversation, fetch messages from Textline and cache them
      // Try phone number first (more reliable), fall back to UUID
      if (conversation.externalSource === "textline" && textlineClient.isConfigured()) {
        let textlineMessages: any[] = [];
        
        // Try phone number first if available
        if (conversation.phoneNumber) {
          try {
            const phoneResult = await textlineClient.getConversationMessagesByPhone(conversation.phoneNumber);
            if (!phoneResult.error) {
              textlineMessages = phoneResult.messages;
            }
          } catch (e) {
            console.error("[Textline] Phone lookup failed, will try UUID:", e);
          }
        }
        
        // Fall back to UUID if phone failed or wasn't available
        if (textlineMessages.length === 0 && conversation.externalConversationId) {
          try {
            const uuidResult = await textlineClient.getConversationMessages(conversation.externalConversationId);
            if (!uuidResult.error) {
              textlineMessages = uuidResult.messages;
            }
          } catch (e) {
            console.error("[Textline] UUID lookup failed:", e);
          }
        }
        
        if (textlineMessages.length > 0) {
          // Get existing message external IDs to avoid duplicates
          const existingMessages = await storage.getMessagesForConversation(id);
          const existingExternalIds = new Set(existingMessages.map(m => m.externalMessageId).filter(Boolean));
          
          // Insert new messages from Textline
          for (const tm of textlineMessages) {
            if (!existingExternalIds.has(tm.uuid)) {
              try {
                await storage.createMessage({
                  conversationId: id,
                  body: tm.body,
                  direction: tm.direction as any,
                  channel: "sms" as any,
                  status: "delivered" as any,
                  externalMessageId: tm.uuid,
                  sentAt: tm.created_at ? new Date(tm.created_at) : undefined,
                  deliveredAt: tm.delivered_at ? new Date(tm.delivered_at) : undefined,
                  readAt: tm.read_at ? new Date(tm.read_at) : undefined,
                  attachments: tm.attachments?.map(a => ({ url: a.url, filename: a.filename, contentType: a.content_type })) as any,
                });
              } catch (e) {
                console.error("[Textline] Error caching message:", e);
              }
            }
          }
        }
      }

      const messages = await storage.getMessagesForConversation(id);
      const tags = await storage.getConversationTags(id);

      let customer = null;
      if (conversation.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, conversation.customerId));
        customer = cust || null;
      }

      return res.json({ conversation, messages, tags, customer });
    } catch (error) {
      console.error("Error fetching conversation details:", error);
      return res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // PATCH /api/crm/messaging/conversations/:id - Update conversation
  app.patch("/api/crm/messaging/conversations/:id", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, assignedToId, snoozeUntil, subject } = req.body;

      const existing = await storage.getMessagingConversationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const updates: Record<string, any> = {};
      if (status !== undefined) updates.status = status;
      if (assignedToId !== undefined) updates.assignedToId = assignedToId;
      if (snoozeUntil !== undefined) updates.snoozeUntil = snoozeUntil ? new Date(snoozeUntil) : null;
      if (subject !== undefined) updates.subject = subject;

      const updated = await storage.updateMessagingConversation(id, updates);
      return res.json(updated);
    } catch (error) {
      console.error("Error updating conversation:", error);
      return res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // POST /api/crm/messaging/conversations/:id/messages - Send a message
  app.post("/api/crm/messaging/conversations/:id/messages", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existing = await storage.getMessagingConversationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const { body, channel, attachments: msgAttachments } = req.body;

      // Get phone number from conversation directly, or from linked customer
      let recipientPhone: string | null = existing.phoneNumber || null;
      if (!recipientPhone && existing.customerId) {
        const [customer] = await db.select({ phone: crmCustomers.phone }).from(crmCustomers).where(eq(crmCustomers.id, existing.customerId));
        recipientPhone = customer?.phone || null;
      }
      
      if (!recipientPhone) {
        return res.status(400).json({ message: "No phone number found for this conversation" });
      }

      const messageData = {
        conversationId: id,
        body: body || "",
        channel: channel || "sms",
        attachments: msgAttachments || null,
        direction: "outbound" as const,
        status: "queued" as const,
        authorUserId: user.id,
        sentAt: new Date(),
      };

      const parseResult = insertCrmMessagingMessageSchema.safeParse(messageData);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid message data", errors: parseResult.error.errors });
      }

      const message = await storage.createMessage(parseResult.data);

      const adapter = getMessagingAdapter();
      const adapterResult = await adapter.sendMessage({
        conversationId: id,
        body: body || "",
        channel: channel || "sms",
        recipientPhone: recipientPhone,
        externalConversationId: existing.externalConversationId || undefined,
      });

      if (adapterResult.success) {
        const updateData: Record<string, any> = { status: adapterResult.status };
        if (adapterResult.externalMessageId) {
          updateData.externalMessageId = adapterResult.externalMessageId;
        }
        await storage.updateMessage(message.id, updateData);
        if (adapterResult.externalConversationId && !existing.externalConversationId) {
          await storage.updateMessagingConversation(id, { 
            externalConversationId: adapterResult.externalConversationId,
            externalSource: "textline" as any
          });
        }
        const updatedMessage = await db.select().from(crmMessagingMessages).where(eq(crmMessagingMessages.id, message.id));
        return res.status(201).json(updatedMessage[0] || message);
      } else {
        await storage.updateMessage(message.id, { 
          status: "failed" as any, 
          errorMessage: adapterResult.errorMessage 
        });
        const updatedMessage = await db.select().from(crmMessagingMessages).where(eq(crmMessagingMessages.id, message.id));
        return res.status(201).json(updatedMessage[0] || message);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      return res.status(500).json({ message: "Failed to send message" });
    }
  });

  // POST /api/crm/messaging/conversations/:id/read - Mark conversation as read
  app.post("/api/crm/messaging/conversations/:id/read", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await storage.getMessagingConversationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const updated = await storage.updateMessagingConversation(id, { unreadInboundCount: 0 } as any);
      return res.json(updated);
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      return res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // GET /api/crm/messaging/conversations/:id/tags - Get conversation tags
  app.get("/api/crm/messaging/conversations/:id/tags", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await storage.getMessagingConversationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const tags = await storage.getConversationTags(id);
      return res.json(tags);
    } catch (error) {
      console.error("Error fetching conversation tags:", error);
      return res.status(500).json({ message: "Failed to fetch tags" });
    }
  });

  // POST /api/crm/messaging/conversations/:id/tags - Add tag
  app.post("/api/crm/messaging/conversations/:id/tags", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { tag } = req.body;

      if (!tag || typeof tag !== "string") {
        return res.status(400).json({ message: "Tag is required and must be a string" });
      }

      const existing = await storage.getMessagingConversationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const created = await storage.addConversationTag(id, tag);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Error adding conversation tag:", error);
      return res.status(500).json({ message: "Failed to add tag" });
    }
  });

  // DELETE /api/crm/messaging/conversations/:id/tags/:tag - Remove tag
  app.delete("/api/crm/messaging/conversations/:id/tags/:tag", requireCrmAuth, async (req, res) => {
    try {
      const { id, tag } = req.params;

      const existing = await storage.getMessagingConversationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      await storage.removeConversationTag(id, tag);
      return res.json({ message: "Tag removed" });
    } catch (error) {
      console.error("Error removing conversation tag:", error);
      return res.status(500).json({ message: "Failed to remove tag" });
    }
  });

  // DELETE /api/crm/messaging/conversations/:id - Delete a conversation and all its messages
  app.delete("/api/crm/messaging/conversations/:id", requireCrmAuth, async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await storage.getMessagingConversationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const deleted = await storage.deleteMessagingConversation(id);
      if (deleted) {
        return res.json({ message: "Conversation deleted successfully" });
      } else {
        return res.status(500).json({ message: "Failed to delete conversation" });
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
      return res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  // POST /api/webhooks/textline - Textline webhook for inbound messages (no auth)
  app.post("/api/webhooks/textline", async (req, res) => {
    try {
      const payload = req.body;
      const webhookType = payload.webhook;
      const eventType = payload.event_type;
      
      console.log("[Textline Webhook] Received event:", webhookType || eventType, JSON.stringify(payload, null, 2));
      
      // Handle inbound messages - check multiple possible payload structures
      const post = payload.data?.post || payload.post;
      const conversation = payload.data?.conversation || payload.conversation;
      
      // Determine if inbound: check direction field OR creator.type === "customer"
      const direction = post?.direction;
      const creatorType = post?.creator?.type;
      const isInbound = direction === "inbound" || creatorType === "customer";
      
      // Check for various webhook event types
      const isMessageEvent = webhookType === "new_customer_post" || 
                            eventType === "message.created" || 
                            eventType === "post.created";
      
      if (isMessageEvent && isInbound) {
        const conversationUuid = conversation?.uuid;
        const phoneNumber = conversation?.phone_number || conversation?.customer?.phone_number;
        const contactName = conversation?.contact_name || conversation?.customer?.name;
        const messageUuid = post?.uuid;
        const messageBody = post?.body || "";
        const createdAt = post?.created_at ? new Date(post.created_at * 1000) : new Date();
        
        if (!conversationUuid || !phoneNumber) {
          console.log("[Textline Webhook] Missing conversation UUID or phone number", { conversationUuid, phoneNumber });
          return res.status(200).json({ message: "OK - missing data" });
        }
        
        console.log("[Textline Webhook] Processing inbound message:", { conversationUuid, phoneNumber, messageBody: messageBody.substring(0, 50) });
        
        // First try to find by external ID
        let localConversation = await storage.getMessagingConversationByExternalId(conversationUuid, "textline");
        
        // If not found, try by phone number
        if (!localConversation) {
          localConversation = await storage.getMessagingConversationByPhone(phoneNumber);
          
          // If found by phone, update to link with Textline
          if (localConversation && !localConversation.externalConversationId) {
            await storage.updateMessagingConversation(localConversation.id, {
              externalSource: "textline" as any,
              externalConversationId: conversationUuid,
            });
          }
        }
        
        let customerId: string | undefined;
        const customer = await storage.getCrmCustomerByPhone(phoneNumber);
        if (customer) {
          customerId = customer.id;
        }
        
        if (!localConversation) {
          localConversation = await storage.createMessagingConversation({
            customerId: customerId || null,
            phoneNumber: phoneNumber,
            customerName: contactName || null,
            subject: contactName || phoneNumber,
            externalSource: "textline" as any,
            externalConversationId: conversationUuid,
            status: "open" as any,
          });
          console.log("[Textline Webhook] Created new conversation:", localConversation.id);
        } else if (customerId && !localConversation.customerId) {
          await storage.updateMessagingConversation(localConversation.id, { customerId });
        }
        
        // Check if message already exists (avoid duplicates)
        const existingMessages = await storage.getMessagesForConversation(localConversation.id);
        const isDuplicate = existingMessages.some(m => m.externalMessageId === messageUuid);
        
        if (!isDuplicate) {
          await storage.createMessage({
            conversationId: localConversation.id,
            direction: "inbound" as any,
            channel: "sms" as any,
            body: messageBody,
            externalMessageId: messageUuid,
            status: "delivered" as any,
            sentAt: createdAt,
          });
          
          console.log("[Textline Webhook] Created inbound message for conversation:", localConversation.id);
        } else {
          console.log("[Textline Webhook] Skipped duplicate message:", messageUuid);
        }
      }
      
      return res.status(200).json({ message: "OK" });
    } catch (error) {
      console.error("[Textline Webhook] Error:", error);
      return res.status(200).json({ message: "OK - error logged" });
    }
  });

  // POST /api/crm/messaging/sync-textline - Sync conversations from Textline
  app.post("/api/crm/messaging/sync-textline", requireCrmAuth, async (req, res) => {
    try {
      if (!textlineClient.isConfigured()) {
        return res.status(400).json({ message: "Textline API is not configured" });
      }
      
      let created = 0;
      let updated = 0;
      let linked = 0;
      let page = 0;
      let hasMore = true;
      
      while (hasMore) {
        const result = await textlineClient.getConversations(page, 50);
        
        if (result.error) {
          return res.status(500).json({ message: "Error fetching from Textline: " + result.error });
        }
        
        for (const textlineConvo of result.conversations) {
          // Skip conversations without a phone number
          if (!textlineConvo.phone_number) {
            console.log("[Textline Sync] Skipping conversation without phone number:", textlineConvo.uuid);
            continue;
          }
          
          // First check by external ID, then check by phone number to avoid duplicates
          let existingConvo = await storage.getMessagingConversationByExternalId(textlineConvo.uuid, "textline");
          
          // If not found by external ID, check by phone number to link existing conversations
          if (!existingConvo) {
            existingConvo = await storage.getMessagingConversationByPhone(textlineConvo.phone_number);
          }
          
          let customerId: string | undefined;
          const customer = await storage.getCrmCustomerByPhone(textlineConvo.phone_number);
          if (customer) {
            customerId = customer.id;
          }
          
          if (!existingConvo) {
            await storage.createMessagingConversation({
              customerId: customerId || null,
              phoneNumber: textlineConvo.phone_number,
              customerName: textlineConvo.contact_name || null,
              subject: textlineConvo.contact_name || textlineConvo.phone_number,
              externalSource: "textline" as any,
              externalConversationId: textlineConvo.uuid,
              status: textlineConvo.status === "resolved" ? "resolved" as any : "open" as any,
              lastMessageAt: textlineConvo.last_message_at ? new Date(textlineConvo.last_message_at) : undefined,
            });
            created++;
            if (customerId) linked++;
          } else {
            const updates: Record<string, any> = {};
            if (customerId && !existingConvo.customerId) {
              updates.customerId = customerId;
              linked++;
            }
            if (textlineConvo.last_message_at) {
              updates.lastMessageAt = new Date(textlineConvo.last_message_at);
            }
            // Update external source and ID if missing (link existing local conversation to Textline)
            if (!existingConvo.externalConversationId || existingConvo.externalSource !== "textline") {
              updates.externalSource = "textline";
              updates.externalConversationId = textlineConvo.uuid;
            }
            if (Object.keys(updates).length > 0) {
              await storage.updateMessagingConversation(existingConvo.id, updates);
              updated++;
            }
          }
        }
        
        hasMore = result.hasMore;
        page++;
        
        if (page > 100) {
          console.log("[Textline Sync] Stopping after 100 pages (5000 conversations)");
          break;
        }
      }
      
      return res.json({
        message: "Sync completed",
        created,
        updated,
        linked,
      });
    } catch (error) {
      console.error("Error syncing Textline conversations:", error);
      return res.status(500).json({ message: "Failed to sync Textline conversations" });
    }
  });

  // POST /api/crm/messaging/start-conversation - Start a new conversation with a phone number
  app.post("/api/crm/messaging/start-conversation", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { phoneNumber, message, customerId, customerName } = req.body;

      if (!phoneNumber || typeof phoneNumber !== "string") {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message is required" });
      }

      // Normalize phone number (basic cleanup)
      const cleanPhone = phoneNumber.replace(/[^\d+]/g, "");
      if (cleanPhone.length < 10) {
        return res.status(400).json({ message: "Invalid phone number" });
      }

      // Check if a conversation already exists for this phone number
      let conversation = await storage.getMessagingConversationByPhone(cleanPhone);

      // Look up customer by phone if customerId not provided
      let resolvedCustomerId = customerId;
      let resolvedCustomerName = customerName;
      if (!resolvedCustomerId) {
        const customer = await storage.getCrmCustomerByPhone(cleanPhone);
        if (customer) {
          resolvedCustomerId = customer.id;
          resolvedCustomerName = customer.name;
        }
      }

      // Send message via Textline (this creates a conversation if needed)
      if (!textlineClient.isConfigured()) {
        return res.status(400).json({ message: "Textline API is not configured" });
      }

      const sendResult = await textlineClient.sendMessage({
        phoneNumber: cleanPhone,
        body: message,
      });

      if (!sendResult.success) {
        return res.status(500).json({ message: sendResult.errorMessage || "Failed to send message via Textline" });
      }

      // Create or update local conversation record
      if (!conversation) {
        conversation = await storage.createMessagingConversation({
          customerId: resolvedCustomerId || null,
          phoneNumber: cleanPhone,
          customerName: resolvedCustomerName || null,
          subject: resolvedCustomerName || cleanPhone,
          externalSource: "textline" as any,
          externalConversationId: sendResult.conversationUuid || null,
          status: "open" as any,
          lastMessageAt: new Date(),
        });
      } else {
        // Update existing conversation with external ID if we didn't have it
        const updates: Record<string, any> = { 
          status: "open",
          lastMessageAt: new Date() 
        };
        if (sendResult.conversationUuid && !conversation.externalConversationId) {
          updates.externalConversationId = sendResult.conversationUuid;
          updates.externalSource = "textline";
        }
        if (resolvedCustomerId && !conversation.customerId) {
          updates.customerId = resolvedCustomerId;
        }
        await storage.updateMessagingConversation(conversation.id, updates);
      }

      // Create the message record locally
      await storage.createMessage({
        conversationId: conversation.id,
        direction: "outbound" as any,
        channel: "sms" as any,
        body: message,
        externalMessageId: sendResult.messageUuid || null,
        status: "sent" as any,
        authorUserId: user.id,
        sentAt: new Date(),
      });

      return res.status(201).json({
        conversationId: conversation.id,
        message: "Message sent successfully",
      });
    } catch (error) {
      console.error("Error starting conversation:", error);
      return res.status(500).json({ message: "Failed to start conversation" });
    }
  });

  // GET /api/crm/messaging/customers/search - Search customers for new message dialog
  app.get("/api/crm/messaging/customers/search", requireCrmAuth, async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== "string" || q.length < 2) {
        return res.json([]);
      }

      // Search for customers with matching name or phone
      const results = await db.select({
        id: crmCustomers.id,
        name: crmCustomers.name,
        phone: crmCustomers.phone,
        email: crmCustomers.email,
      })
      .from(crmCustomers)
      .where(
        or(
          ilike(crmCustomers.name, `%${q}%`),
          ilike(crmCustomers.phone, `%${q}%`)
        )
      )
      .limit(10);

      // Filter out customers without phone numbers
      const customersWithPhones = results.filter(c => c.phone && c.phone.trim() !== "");

      return res.json(customersWithPhones);
    } catch (error) {
      console.error("Error searching customers for messaging:", error);
      return res.status(500).json({ message: "Failed to search customers" });
    }
  });

  // ============================================
  // PUBLIC QUOTE VIEW & E-SIGNATURE ROUTES
  // ============================================

  // GET /api/public/quotes/:token - Fetch quote by viewToken (public, no auth)
  app.get("/api/public/quotes/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.viewToken, token)).limit(1);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found or link is invalid" });
      }

      // Track quote views - update viewedAt (first view) and increment viewCount (every view)
      const now = new Date();
      const currentViewCount = quote.viewCount || 0;
      const isFirstView = !quote.viewedAt;
      
      await db.update(crmQuotes)
        .set({ 
          viewedAt: quote.viewedAt || now, // Only set on first view
          viewCount: currentViewCount + 1,
          updatedAt: now 
        })
        .where(eq(crmQuotes.id, quote.id));
      
      // Log the view event in quote email logs (for activity history)
      await db.insert(quoteEmailLogs).values({
        quoteId: quote.id,
        direction: "system",
        fromEmail: "system",
        recipientEmail: quote.customerEmail || "",
        recipientName: quote.customerName,
        subject: isFirstView ? `Quote ${quote.quoteNumber} - First Viewed` : `Quote ${quote.quoteNumber} - Viewed Again`,
        textContent: isFirstView 
          ? `Quote was viewed for the first time by the customer`
          : `Quote was viewed again by the customer (view #${currentViewCount + 1})`,
        status: "sent",
        isManual: false,
        personalMessage: JSON.stringify({
          eventType: "quote_viewed",
          viewCount: currentViewCount + 1,
          isFirstView,
          viewedAt: now.toISOString(),
        }),
      });
      
      console.log(`[QuoteView] Quote ${quote.quoteNumber} viewed (view #${currentViewCount + 1})`);

      const lineItems = await db.select().from(crmQuoteLineItems)
        .where(eq(crmQuoteLineItems.quoteId, quote.id))
        .orderBy(crmQuoteLineItems.sortOrder);

      // Fetch deposit percentage from settings
      let depositPercentage = 50; // default
      const depositSetting = await storage.getSetting('stripe_deposit_percentage');
      if (depositSetting) {
        const parsed = parseInt(depositSetting.value, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
          depositPercentage = parsed;
        }
      }

      // Return only public-safe fields, exclude internal data
      const publicQuote = {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        customerName: quote.customerName,
        serviceAddress: quote.serviceAddress,
        title: quote.title,
        description: quote.description,
        subtotal: quote.subtotal,
        laborTotal: quote.laborTotal,
        total: quote.total,
        status: quote.status,
        validUntil: quote.validUntil,
        createdAt: quote.createdAt,
        acceptedAt: quote.acceptedAt,
        acceptedBy: quote.acceptedBy,
        signedAt: quote.signedAt,
        signerName: quote.signerName,
        customerNotes: quote.customerNotes,
        aiGeneratedQuote: quote.aiGeneratedQuote,
        quoteMode: quote.quoteMode,
        selectedOption: quote.selectedOption,
        quoteType: quote.quoteType,
        depositPaidAt: quote.depositPaidAt,
        depositAmount: quote.depositAmount,
        stripePaymentLinkId: quote.stripePaymentLinkId,
        depositPercentage,
      };

      const publicLineItems = lineItems.map((item) => ({
        id: item.id,
        lineType: item.lineType,
        description: item.description,
        partNumber: item.partNumber,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        sortOrder: item.sortOrder,
        optionTag: item.optionTag,
        imageUrl: item.imageUrl,
      }));

      return res.json({ quote: publicQuote, lineItems: publicLineItems });
    } catch (error) {
      console.error("Error fetching public quote:", error);
      return res.status(500).json({ message: "Failed to load quote" });
    }
  });

  // POST /api/public/quotes/:token/sign - Accept signature and update quote status
  app.post("/api/public/quotes/:token/sign", async (req, res) => {
    try {
      const { token } = req.params;
      const { signatureImage, signerName, selectedOption } = req.body;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      if (!signatureImage || typeof signatureImage !== "string") {
        return res.status(400).json({ message: "Signature is required" });
      }

      if (!signerName || typeof signerName !== "string" || signerName.trim().length === 0) {
        return res.status(400).json({ message: "Signer name is required" });
      }

      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.viewToken, token)).limit(1);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found or link is invalid" });
      }

      if (quote.status === "accepted") {
        return res.status(400).json({ message: "This quote has already been accepted" });
      }

      if (quote.status === "declined") {
        return res.status(400).json({ message: "This quote has been declined" });
      }

      if (quote.status === "expired") {
        return res.status(400).json({ message: "This quote has expired" });
      }

      // Capture IP address
      const signerIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() 
        || req.socket?.remoteAddress 
        || "unknown";

      const now = new Date();

      const [updated] = await db.update(crmQuotes)
        .set({
          status: "accepted",
          acceptedAt: now,
          acceptedBy: signerName.trim(),
          signatureImage,
          signerName: signerName.trim(),
          signerIp,
          signedAt: now,
          updatedAt: now,
          ...(selectedOption && typeof selectedOption === "string" ? { selectedOption } : {}),
        })
        .where(eq(crmQuotes.id, quote.id))
        .returning();

      // Log activity to projectActivities if quote has a projectId
      if (quote.projectId) {
        await db.insert(projectActivities).values({
          projectId: quote.projectId,
          type: "approval",
          title: "Quote Accepted",
          description: `Quote ${quote.quoteNumber} was electronically signed and accepted by ${signerName.trim()}`,
          metadata: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            total: quote.total,
            signerName: signerName.trim(),
            signedAt: now.toISOString(),
          },
        });
      }

      // Add system email log entry for quote acceptance
      await db.insert(quoteEmailLogs).values({
        quoteId: quote.id,
        direction: "system",
        fromEmail: "system",
        recipientEmail: quote.customerEmail || "",
        recipientName: signerName.trim(),
        subject: `Quote ${quote.quoteNumber} - Signed & Accepted`,
        textContent: `Quote was electronically signed and accepted by ${signerName.trim()} at ${now.toLocaleString()}`,
        status: "sent",
        isManual: false,
        personalMessage: JSON.stringify({
          eventType: "quote_accepted",
          signerName: signerName.trim(),
          signerIp,
          signedAt: now.toISOString(),
        }),
      });

      console.log(`[PublicSign] Quote ${quote.quoteNumber} signed and accepted by ${signerName.trim()} from IP ${signerIp}`);

      // Auto-create follow-up work order if quote is attached to a work order AND has service items
      // Service quote types (quick, custom_service) always trigger; other types need service items check
      console.log(`[PublicSign] Quote ${quote.quoteNumber}: workOrderId=${quote.workOrderId}, quoteType=${updated.quoteType}`);
      
      if (quote.workOrderId) {
        // Check if quote has service-type items (service, labor, parts - not just maintenance)
        const hasServiceLineItems = await hasServiceItems(quote.id);
        console.log(`[PublicSign] Quote ${quote.quoteNumber}: hasServiceLineItems=${hasServiceLineItems}`);
        
        if (hasServiceLineItems) {
          const [parentWorkOrder] = await db.select().from(crmWorkOrders)
            .where(eq(crmWorkOrders.id, quote.workOrderId)).limit(1);
          
          console.log(`[PublicSign] Quote ${quote.quoteNumber}: parentWorkOrder status=${parentWorkOrder?.status}`);
          
          if (parentWorkOrder && (parentWorkOrder.status === "on_site" || parentWorkOrder.status === "completed")) {
            const followUpWO = await createFollowUpWorkOrder(updated, parentWorkOrder, {
              dispatchQueueStage: "WaitingOnParts",
            });
            if (followUpWO) {
              console.log(`[PublicSign] Auto-created follow-up work order ${followUpWO.workOrderNumber} for quote ${quote.quoteNumber}`);
            } else {
              console.log(`[PublicSign] Follow-up work order NOT created (already exists?) for quote ${quote.quoteNumber}`);
            }
          } else {
            console.log(`[PublicSign] Quote ${quote.quoteNumber}: parent work order not on_site/completed, status=${parentWorkOrder?.status}`);
          }
        } else {
          console.log(`[PublicSign] Quote ${quote.quoteNumber} has no service items, skipping follow-up work order creation`);
        }
      } else {
        console.log(`[PublicSign] Quote ${quote.quoteNumber}: skipping follow-up (no workOrderId)`);
      }

      return res.json({ 
        success: true, 
        message: "Quote accepted successfully",
        quote: updated,
      });
    } catch (error) {
      console.error("Error signing quote:", error);
      return res.status(500).json({ message: "Failed to accept quote" });
    }
  });

  // ============================================
  // RESEND INBOUND EMAIL WEBHOOK
  // ============================================

  // GET /api/webhooks/resend/inbound - Test endpoint to verify webhook is reachable
  app.get("/api/webhooks/resend/inbound", (req, res) => {
    console.log("[Resend Inbound] Test GET request received - webhook is reachable");
    return res.status(200).json({ 
      status: "ok", 
      message: "Resend inbound webhook is configured and reachable",
      timestamp: new Date().toISOString()
    });
  });

  // POST /api/webhooks/resend/inbound - Receive incoming email replies from Resend
  app.post("/api/webhooks/resend/inbound", async (req, res) => {
    console.log("[Resend Inbound] POST request received at", new Date().toISOString());
    try {
      // Get raw body for signature verification
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
      
      // Validate webhook signature using Svix
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      if (webhookSecret) {
        const { Webhook } = await import("svix");
        const svixId = req.headers["svix-id"] as string;
        const svixTimestamp = req.headers["svix-timestamp"] as string;
        const svixSignature = req.headers["svix-signature"] as string;
        
        if (!svixId || !svixTimestamp || !svixSignature) {
          console.log("[Resend Inbound] Missing Svix headers for signature verification");
          return res.status(400).json({ error: "Missing signature headers" });
        }
        
        try {
          const wh = new Webhook(webhookSecret);
          wh.verify(rawBody, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
          });
          console.log("[Resend Inbound] Webhook signature verified successfully");
        } catch (verifyError) {
          console.log("[Resend Inbound] Webhook signature verification failed:", verifyError);
          return res.status(401).json({ error: "Invalid webhook signature" });
        }
      }

      // Parse the body
      const payload = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
      console.log("[Resend Inbound] Received webhook:", JSON.stringify(payload, null, 2));

      // Handle different event types from Resend
      const eventType = payload.type;
      const eventData = payload.data || payload;
      
      // For email.received events, extract email data
      const { from, to, subject, html, text, headers } = eventData;

      if (!from || !subject) {
        console.log("[Resend Inbound] Missing required fields");
        return res.status(200).json({ received: true, processed: false, reason: "Missing fields" });
      }

      // Extract sender email from the "from" field (could be "Name <email>" or just "email")
      const fromEmailMatch = from.match(/<([^>]+)>/) || [null, from];
      const senderEmail = fromEmailMatch[1] || from;
      const senderNameMatch = from.match(/^([^<]+)</);
      const senderName = senderNameMatch ? senderNameMatch[1].trim() : null;

      // Try to find the invoice from the subject line (format: "Re: Your Invoice from Giesbrecht HVAC - INV-XXXXXXXX-XXX")
      const invoiceNumberMatch = subject.match(/INV-\d{8}-\d{3}/i);
      if (invoiceNumberMatch) {
        const invoiceNumber = invoiceNumberMatch[0].toUpperCase();
        console.log("[Resend Inbound] Found invoice number:", invoiceNumber);

        // Find the invoice
        const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.invoiceNumber, invoiceNumber)).limit(1);
        if (!invoice) {
          console.log("[Resend Inbound] Invoice not found:", invoiceNumber);
          return res.status(200).json({ received: true, processed: false, reason: "Invoice not found" });
        }

        // Forward the email to the invoice creator
        let forwardedTo: string | null = null;
        if (invoice.createdBy) {
          const [createdByUser] = await db.select({ email: crmUsers.email, name: crmUsers.name, displayName: crmUsers.displayName })
            .from(crmUsers)
            .where(eq(crmUsers.id, invoice.createdBy))
            .limit(1);
          
          if (createdByUser?.email) {
            try {
              const { Resend } = await import("resend");
              const resend = new Resend(process.env.RESEND_API_KEY);
              
              const customerName = senderName || senderEmail;
              const forwardSubject = `[Customer Reply] ${subject}`;
              const forwardHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 16px;">
                    <strong>Customer Reply for Invoice ${invoiceNumber}</strong><br/>
                    <span style="color: #64748b;">From: ${customerName} (${senderEmail})</span>
                  </div>
                  <div style="padding: 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                    ${html || text?.replace(/\n/g, '<br/>') || '<em>No message content</em>'}
                  </div>
                  <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 4px; font-size: 13px; color: #64748b;">
                    <a href="https://${req.get("host")}/crm/invoices/${invoice.id}" style="color: #f59e0b;">View Invoice in CRM</a>
                  </div>
                </div>
              `;
              
              await resend.emails.send({
                from: "invoices@ghvacinc.com",
                to: [createdByUser.email],
                subject: forwardSubject,
                html: forwardHtml,
              });
              
              forwardedTo = createdByUser.email;
              console.log("[Resend Inbound] Forwarded invoice reply to creator:", createdByUser.email);
            } catch (forwardError) {
              console.error("[Resend Inbound] Failed to forward invoice email:", forwardError);
            }
          }
        }

        return res.status(200).json({ received: true, processed: true, invoiceNumber, forwardedTo });
      }

      // Try to find the quote from the subject line (format: "Re: Your Quote from Giesbrecht HVAC - Q-YYYYMMDD-XXX")
      const quoteNumberMatch = subject.match(/Q-\d{8}-\d{3}/i);
      if (!quoteNumberMatch) {
        console.log("[Resend Inbound] Could not extract quote or invoice number from subject:", subject);
        return res.status(200).json({ received: true, processed: false, reason: "No quote or invoice number found" });
      }

      const quoteNumber = quoteNumberMatch[0].toUpperCase();
      console.log("[Resend Inbound] Found quote number:", quoteNumber);

      // Find the quote
      const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.quoteNumber, quoteNumber)).limit(1);
      if (!quote) {
        console.log("[Resend Inbound] Quote not found:", quoteNumber);
        return res.status(200).json({ received: true, processed: false, reason: "Quote not found" });
      }

      // Forward the email to the assigned salesperson
      let forwardedTo: string | null = null;
      if (quote.assignedToId) {
        const [assignedUser] = await db.select({ email: crmUsers.email, name: crmUsers.name, displayName: crmUsers.displayName })
          .from(crmUsers)
          .where(eq(crmUsers.id, quote.assignedToId))
          .limit(1);
        
        if (assignedUser?.email) {
          try {
            const { Resend } = await import("resend");
            const resend = new Resend(process.env.RESEND_API_KEY);
            
            const customerName = senderName || senderEmail;
            const forwardSubject = `[Customer Reply] ${subject}`;
            const forwardHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 12px 16px; margin-bottom: 16px;">
                  <strong>Customer Reply for Quote ${quoteNumber}</strong><br/>
                  <span style="color: #64748b;">From: ${customerName} (${senderEmail})</span>
                </div>
                <div style="padding: 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                  ${html || text?.replace(/\n/g, '<br/>') || '<em>No message content</em>'}
                </div>
                <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 4px; font-size: 13px; color: #64748b;">
                  <a href="https://${req.get("host")}/crm/quotes/${quote.id}" style="color: #0ea5e9;">View Quote in CRM</a>
                </div>
              </div>
            `;
            
            await resend.emails.send({
              from: "quotes@ghvacinc.com",
              to: [assignedUser.email],
              subject: forwardSubject,
              html: forwardHtml,
            });
            
            forwardedTo = assignedUser.email;
            console.log("[Resend Inbound] Forwarded reply to assigned user:", assignedUser.email);
          } catch (forwardError) {
            console.error("[Resend Inbound] Failed to forward email to assigned user:", forwardError);
          }
        }
      }

      return res.status(200).json({ received: true, processed: true, quoteNumber, forwardedTo });
    } catch (error) {
      console.error("[Resend Inbound] Error processing webhook:", error);
      return res.status(200).json({ received: true, processed: false, error: "Processing error" });
    }
  });

  // ============================================
  // CUSTOMER PORTAL ROUTES
  // ============================================

  const PORTAL_SESSION_COOKIE = "portal_session";

  // Middleware to authenticate customer portal users via session cookie
  async function requireCustomerPortalAuth(req: any, res: any, next: any) {
    const sessionToken = req.cookies?.[PORTAL_SESSION_COOKIE];
    if (!sessionToken) {
      return res.status(401).json({ message: "Unauthorized - Portal login required" });
    }

    try {
      const sessions = await db.select()
        .from(customerPortalSessions)
        .where(and(
          eq(customerPortalSessions.sessionToken, sessionToken),
          gt(customerPortalSessions.expiresAt, new Date())
        ))
        .limit(1);

      if (sessions.length === 0) {
        res.clearCookie(PORTAL_SESSION_COOKIE);
        return res.status(401).json({ message: "Session expired or invalid" });
      }

      const session = sessions[0];
      const accounts = await db.select()
        .from(customerPortalAccounts)
        .where(and(
          eq(customerPortalAccounts.id, session.accountId),
          eq(customerPortalAccounts.isActive, true)
        ))
        .limit(1);

      if (accounts.length === 0) {
        return res.status(401).json({ message: "Account not found or inactive" });
      }

      const account = accounts[0];
      const customers = await db.select()
        .from(crmCustomers)
        .where(eq(crmCustomers.id, account.customerId))
        .limit(1);

      if (customers.length === 0) {
        return res.status(401).json({ message: "Customer not found" });
      }

      req.portalAccount = account;
      req.portalCustomer = customers[0];
      next();
    } catch (error) {
      console.error("Portal auth error:", error);
      res.status(500).json({ message: "Authentication error" });
    }
  }

  // GET /api/admin/settings/automated-sms - Get automated SMS enabled status
  app.get("/api/admin/settings/automated-sms", requireCrmAdmin, async (req, res) => {
    try {
      const setting = await storage.getSetting("automated_sms_enabled");
      const enabled = setting ? setting.value !== "false" : true;
      return res.json({ enabled });
    } catch (error) {
      console.error("Error getting automated SMS setting:", error);
      return res.status(500).json({ message: "Failed to get setting" });
    }
  });

  // PUT /api/admin/settings/automated-sms - Update automated SMS enabled status
  app.put("/api/admin/settings/automated-sms", requireCrmAdmin, async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }
      await storage.setSetting("automated_sms_enabled", enabled ? "true" : "false");
      return res.json({ enabled });
    } catch (error) {
      console.error("Error updating automated SMS setting:", error);
      return res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // SMS Templates configuration
  const SMS_TEMPLATE_CONFIG = [
    { key: "sms_template_maintenance_10_day", description: "Maintenance 10-Day Reminder", defaultValue: "Hi! Your scheduled maintenance visit is coming up in 10 days. Please call us to confirm your appointment. - GHVAC" },
    { key: "sms_template_maintenance_5_day", description: "Maintenance 5-Day Reminder", defaultValue: "Reminder: Your maintenance visit is in 5 days. Please call to schedule if you haven't already. - GHVAC" },
    { key: "sms_template_work_order_en_route", description: "Technician En Route", defaultValue: "Your GHVAC technician is on the way! They should arrive shortly." },
    { key: "sms_template_work_order_on_site", description: "Technician On Site", defaultValue: "Your GHVAC technician has arrived and is ready to help!" },
    { key: "sms_template_invoice", description: "Invoice Payment (uses {invoiceNumber} and {paymentLink} placeholders)", defaultValue: "Your invoice #{invoiceNumber} is ready. Pay online: {paymentLink} - GHVAC" },
  ];

  // GET /api/admin/settings/sms-templates - Get all SMS templates
  app.get("/api/admin/settings/sms-templates", requireCrmAdmin, async (req, res) => {
    try {
      const templates = await Promise.all(
        SMS_TEMPLATE_CONFIG.map(async (config) => {
          const setting = await storage.getSetting(config.key);
          return {
            key: config.key,
            description: config.description,
            value: setting?.value || config.defaultValue,
            defaultValue: config.defaultValue,
          };
        })
      );
      return res.json({ templates });
    } catch (error) {
      console.error("Error getting SMS templates:", error);
      return res.status(500).json({ message: "Failed to get SMS templates" });
    }
  });

  // PUT /api/admin/settings/sms-templates - Update SMS templates
  app.put("/api/admin/settings/sms-templates", requireCrmAdmin, async (req, res) => {
    try {
      const { templates } = req.body;
      if (!Array.isArray(templates)) {
        return res.status(400).json({ message: "templates must be an array" });
      }
      
      const validKeys = SMS_TEMPLATE_CONFIG.map(c => c.key);
      for (const template of templates) {
        if (!template.key || typeof template.value !== "string") {
          return res.status(400).json({ message: "Each template must have a key and value" });
        }
        if (!validKeys.includes(template.key)) {
          return res.status(400).json({ message: `Invalid template key: ${template.key}` });
        }
        await storage.setSetting(template.key, template.value);
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error updating SMS templates:", error);
      return res.status(500).json({ message: "Failed to update SMS templates" });
    }
  });

  // GET /api/admin/settings/automated-email - Get automated email enabled status
  app.get("/api/admin/settings/automated-email", requireCrmAdmin, async (req, res) => {
    try {
      const setting = await storage.getSetting("automated_email_enabled");
      const enabled = setting ? setting.value !== "false" : true;
      return res.json({ enabled });
    } catch (error) {
      console.error("Error getting automated email setting:", error);
      return res.status(500).json({ message: "Failed to get setting" });
    }
  });

  // PUT /api/admin/settings/automated-email - Update automated email enabled status
  app.put("/api/admin/settings/automated-email", requireCrmAdmin, async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }
      await storage.setSetting("automated_email_enabled", enabled ? "true" : "false");
      return res.json({ enabled });
    } catch (error) {
      console.error("Error updating automated email setting:", error);
      return res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Email Templates configuration
  const EMAIL_TEMPLATE_CONFIG = [
    { key: "email_template_quote_subject", description: "Quote Email Subject", defaultValue: "Your Quote from {brand_name} - {quote_number}", placeholders: "{brand_name}, {quote_number}, {customer_name}, {quote_total}" },
    { key: "email_template_quote_intro", description: "Quote Email Introduction", defaultValue: "Thank you for considering {brand_name} for your HVAC needs. We've prepared a detailed quote for you to review.", placeholders: "{brand_name}, {quote_number}, {customer_name}, {quote_total}" },
    { key: "email_template_quote_signature", description: "Quote Email Signature", defaultValue: "Thank you for choosing {brand_name}. We look forward to serving you!", placeholders: "{brand_name}, {quote_number}, {customer_name}, {quote_total}" },
    { key: "email_template_invoice_subject", description: "Invoice Email Subject", defaultValue: "Your Invoice from {brand_name} - {invoice_number}", placeholders: "{brand_name}, {invoice_number}, {customer_name}, {balance_due}, {due_date}" },
    { key: "email_template_invoice_intro", description: "Invoice Email Introduction", defaultValue: "Please find your invoice details below. Thank you for your business.", placeholders: "{brand_name}, {invoice_number}, {customer_name}, {balance_due}, {due_date}" },
    { key: "email_template_invoice_signature", description: "Invoice Email Signature", defaultValue: "Thank you for choosing {brand_name}. We appreciate your business!", placeholders: "{brand_name}, {invoice_number}, {customer_name}, {balance_due}, {due_date}" },
  ];

  // GET /api/admin/settings/email-templates - Get all email templates
  app.get("/api/admin/settings/email-templates", requireCrmAdmin, async (req, res) => {
    try {
      const templates = await Promise.all(
        EMAIL_TEMPLATE_CONFIG.map(async (config) => {
          const setting = await storage.getSetting(config.key);
          return {
            key: config.key,
            description: config.description,
            value: setting?.value || config.defaultValue,
            defaultValue: config.defaultValue,
            placeholders: config.placeholders,
          };
        })
      );
      return res.json({ templates });
    } catch (error) {
      console.error("Error getting email templates:", error);
      return res.status(500).json({ message: "Failed to get email templates" });
    }
  });

  // PUT /api/admin/settings/email-templates - Update email templates
  app.put("/api/admin/settings/email-templates", requireCrmAdmin, async (req, res) => {
    try {
      const { templates } = req.body;
      if (!Array.isArray(templates)) {
        return res.status(400).json({ message: "templates must be an array" });
      }
      
      const validKeys = EMAIL_TEMPLATE_CONFIG.map(c => c.key);
      for (const template of templates) {
        if (!template.key || typeof template.value !== "string") {
          return res.status(400).json({ message: "Each template must have a key and value" });
        }
        if (!validKeys.includes(template.key)) {
          return res.status(400).json({ message: `Invalid template key: ${template.key}` });
        }
        await storage.setSetting(template.key, template.value);
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error updating email templates:", error);
      return res.status(500).json({ message: "Failed to update email templates" });
    }
  });

  // POST /api/admin/trigger-maintenance-reminders - Manually trigger maintenance reminders
  app.post("/api/admin/trigger-maintenance-reminders", requireCrmAuth, async (req, res) => {
    const user = await getCurrentCrmUser(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (user.role !== "owner" && user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const summary = await processMaintenanceReminders();
      return res.json({ success: true, summary });
    } catch (error) {
      console.error("Error triggering maintenance reminders:", error);
      return res.status(500).json({ message: "Failed to process reminders" });
    }
  });

  // POST /api/admin/trigger-renewal-processing - Manually trigger agreement renewal processing
  app.post("/api/admin/trigger-renewal-processing", requireCrmAuth, async (req, res) => {
    const user = await getCurrentCrmUser(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (user.role !== "owner" && user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const summary = await processAgreementRenewals();
      return res.json({ success: true, summary });
    } catch (error) {
      console.error("Error triggering renewal processing:", error);
      return res.status(500).json({ message: "Failed to process renewals" });
    }
  });

  // GET /api/admin/agreements-for-invoice - Get agreements available for manual invoice trigger
  app.get("/api/admin/agreements-for-invoice", requireCrmAuth, async (req, res) => {
    const user = await getCurrentCrmUser(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (user.role !== "owner" && user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const search = (req.query.search as string) || "";
      let query = db.select({
        id: crmAgreements.id,
        agreementNumber: crmAgreements.agreementNumber,
        customerName: crmAgreements.customerName,
        agreementPlan: crmAgreements.agreementPlan,
        status: crmAgreements.status,
        price: crmAgreements.price,
      })
      .from(crmAgreements)
      .orderBy(desc(crmAgreements.createdAt))
      .limit(50);
      
      if (search) {
        query = db.select({
          id: crmAgreements.id,
          agreementNumber: crmAgreements.agreementNumber,
          customerName: crmAgreements.customerName,
          agreementPlan: crmAgreements.agreementPlan,
          status: crmAgreements.status,
          price: crmAgreements.price,
        })
        .from(crmAgreements)
        .where(or(
          ilike(crmAgreements.customerName, `%${search}%`),
          ilike(crmAgreements.agreementNumber, `%${search}%`)
        ))
        .orderBy(desc(crmAgreements.createdAt))
        .limit(50);
      }
      
      const agreements = await query;
      return res.json(agreements);
    } catch (error) {
      console.error("Error fetching agreements for invoice:", error);
      return res.status(500).json({ message: "Failed to fetch agreements" });
    }
  });

  // POST /api/admin/trigger-agreement-invoice/:agreementId - Manually send invoice for specific agreement
  app.post("/api/admin/trigger-agreement-invoice/:agreementId", requireCrmAuth, async (req, res) => {
    const user = await getCurrentCrmUser(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (user.role !== "owner" && user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const { agreementId } = req.params;
      
      const [agreement] = await db.select()
        .from(crmAgreements)
        .where(eq(crmAgreements.id, agreementId))
        .limit(1);
      
      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }
      
      const result = await processSingleAgreementRenewal(agreement);
      
      // Build message based on what was sent
      let message = `Invoice ${result.invoiceNumber} created`;
      if (result.emailSent && result.smsSent) {
        message += ` and sent via email and text to ${agreement.customerName}`;
      } else if (result.emailSent) {
        message += ` and emailed to ${agreement.customerName}`;
      } else if (result.smsSent) {
        message += ` and texted to ${agreement.customerName}`;
      } else {
        message += ` (no email or text sent - customer may not have contact info)`;
      }
      
      return res.json({ 
        success: true, 
        result,
        message
      });
    } catch (error) {
      console.error("Error triggering agreement invoice:", error);
      return res.status(500).json({ message: "Failed to send agreement invoice" });
    }
  });

  // =============================================
  // QUICKBOOKS INTEGRATION ROUTES
  // =============================================
  
  const {
    getAuthorizationUrl: getQBAuthUrl,
    exchangeCodeForTokens: exchangeQBTokens,
    saveConnection: saveQBConnection,
    getActiveConnection: getActiveQBConnection,
    disconnectQuickBooks,
    getConnectionStatus: getQBConnectionStatus,
    syncCustomerToQuickBooks,
    syncAllCustomersToQuickBooks,
    syncInvoiceToQuickBooks,
    syncAllInvoicesToQuickBooks,
    syncPaymentToQuickBooks,
    getSyncLogs: getQBSyncLogs
  } = await import("./services/quickbooksService");
  
  // Import QuickBooks OAuth states table for persistent state storage
  const { quickbooksOauthStates } = await import("@shared/schema");
  
  // GET /api/quickbooks/status - Get QuickBooks connection status
  app.get("/api/quickbooks/status", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const status = await getQBConnectionStatus();
      res.json(status);
    } catch (error: any) {
      console.error("[QuickBooks] Status error:", error);
      res.status(500).json({ message: "Failed to get QuickBooks status" });
    }
  });
  
  // GET /api/quickbooks/connect - Initiate OAuth flow
  app.get("/api/quickbooks/connect", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const environment = (req.query.environment as "sandbox" | "production") || "sandbox";
      const state = randomUUID();
      
      // Store state in database for persistent CSRF protection (survives server restarts)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await db.insert(quickbooksOauthStates).values({
        state,
        environment,
        expiresAt,
      });
      
      // Clean up expired states
      await db.delete(quickbooksOauthStates)
        .where(lt(quickbooksOauthStates.expiresAt, new Date()));
      
      console.log(`[QuickBooks] Created OAuth state: ${state.substring(0, 8)}... (expires ${expiresAt.toISOString()})`);
      
      const authUrl = getQBAuthUrl(state, environment);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("[QuickBooks] Connect error:", error);
      res.status(500).json({ message: "Failed to initiate QuickBooks connection" });
    }
  });
  
  // GET /api/quickbooks/callback - OAuth callback
  app.get("/api/quickbooks/callback", async (req, res) => {
    try {
      const { code, state, realmId, error } = req.query;
      
      if (error) {
        console.error("[QuickBooks] OAuth error:", error);
        return res.redirect("/crm/settings/quickbooks?error=oauth_denied");
      }
      
      if (!code || !state || !realmId) {
        return res.redirect("/crm/settings/quickbooks?error=missing_params");
      }
      
      // Verify state from database (persisted across server restarts)
      const [stateRecord] = await db.select()
        .from(quickbooksOauthStates)
        .where(and(
          eq(quickbooksOauthStates.state, state as string),
          gt(quickbooksOauthStates.expiresAt, new Date())
        ))
        .limit(1);
      
      if (!stateRecord) {
        console.error("[QuickBooks] Invalid or expired state:", (state as string).substring(0, 8));
        return res.redirect("/crm/settings/quickbooks?error=invalid_state");
      }
      
      // Delete the used state
      await db.delete(quickbooksOauthStates)
        .where(eq(quickbooksOauthStates.id, stateRecord.id));
      
      console.log(`[QuickBooks] Validated OAuth state: ${(state as string).substring(0, 8)}...`);
      
      // Exchange code for tokens
      const tokens = await exchangeQBTokens(code as string, realmId as string);
      
      // Save connection
      await saveQBConnection(
        realmId as string,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.accessTokenExpiresIn,
        tokens.refreshTokenExpiresIn,
        stateRecord.environment || "sandbox"
      );
      
      console.log(`[QuickBooks] Connected to realm ${realmId} (${stateRecord.environment})`);
      res.redirect("/crm/settings/quickbooks?success=connected");
    } catch (error: any) {
      console.error("[QuickBooks] Callback error:", error);
      res.redirect("/crm/settings/quickbooks?error=token_exchange_failed");
    }
  });
  
  // POST /api/quickbooks/disconnect - Disconnect from QuickBooks
  app.post("/api/quickbooks/disconnect", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await disconnectQuickBooks();
      res.json({ success: true, message: "Disconnected from QuickBooks" });
    } catch (error: any) {
      console.error("[QuickBooks] Disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect from QuickBooks" });
    }
  });
  
  // POST /api/quickbooks/sync/customers - Sync all customers to QuickBooks
  // This runs in the background to avoid timeout issues with large datasets
  app.post("/api/quickbooks/sync/customers", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Start sync in background and return immediately
      const backgroundSync = req.query.background === "true";
      
      if (backgroundSync) {
        // Fire and forget - sync runs in background
        syncAllCustomersToQuickBooks().then(result => {
          console.log(`[QuickBooks] Background customer sync finished: ${result.succeeded} succeeded, ${result.failed} failed`);
        }).catch(err => {
          console.error("[QuickBooks] Background customer sync error:", err);
        });
        
        return res.json({ 
          success: true, 
          message: "Customer sync started in background. Refresh status to see progress.",
          background: true 
        });
      }
      
      // Synchronous sync (may timeout for large datasets)
      const result = await syncAllCustomersToQuickBooks();
      res.json({ success: result.failed === 0, ...result });
    } catch (error: any) {
      console.error("[QuickBooks] Customer sync error:", error);
      res.status(500).json({ message: "Failed to sync customers" });
    }
  });
  
  // POST /api/quickbooks/sync/customer/:customerId - Sync single customer
  app.post("/api/quickbooks/sync/customer/:customerId", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const result = await syncCustomerToQuickBooks(req.params.customerId);
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Customer sync error:", error);
      res.status(500).json({ message: "Failed to sync customer" });
    }
  });
  
  // POST /api/quickbooks/sync/invoices - Sync all invoices to QuickBooks
  // This runs in the background to avoid timeout issues
  app.post("/api/quickbooks/sync/invoices", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Start sync in background and return immediately
      const backgroundSync = req.query.background === "true";
      
      if (backgroundSync) {
        // Fire and forget - sync runs in background
        syncAllInvoicesToQuickBooks().then(result => {
          console.log(`[QuickBooks] Background invoice sync finished: ${result.succeeded} succeeded, ${result.failed} failed, ${result.paymentsSynced || 0} payments synced`);
        }).catch(err => {
          console.error("[QuickBooks] Background invoice sync error:", err);
        });
        
        return res.json({ 
          success: true, 
          message: "Invoice sync started in background. Refresh status to see progress.",
          background: true 
        });
      }
      
      // Synchronous sync
      const result = await syncAllInvoicesToQuickBooks();
      res.json({ success: result.failed === 0, ...result });
    } catch (error: any) {
      console.error("[QuickBooks] Invoice sync error:", error);
      res.status(500).json({ message: "Failed to sync invoices" });
    }
  });
  
  // POST /api/quickbooks/sync/invoice/:invoiceId - Sync invoice to QuickBooks
  app.post("/api/quickbooks/sync/invoice/:invoiceId", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const result = await syncInvoiceToQuickBooks(req.params.invoiceId);
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Invoice sync error:", error);
      res.status(500).json({ message: "Failed to sync invoice" });
    }
  });
  
  // POST /api/quickbooks/sync/payment/:invoiceId - Record payment in QuickBooks
  app.post("/api/quickbooks/sync/payment/:invoiceId", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { amount, paymentDate } = req.body;
      if (!amount) {
        return res.status(400).json({ message: "Amount is required" });
      }
      
      const result = await syncPaymentToQuickBooks(
        req.params.invoiceId,
        amount,
        paymentDate ? new Date(paymentDate) : undefined
      );
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Payment sync error:", error);
      res.status(500).json({ message: "Failed to sync payment" });
    }
  });
  
  // GET /api/quickbooks/sync-logs - Get sync history
  app.get("/api/quickbooks/sync-logs", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const limit = parseInt(req.query.limit as string) || 20;
      const logs = await getQBSyncLogs(limit);
      res.json(logs);
    } catch (error: any) {
      console.error("[QuickBooks] Sync logs error:", error);
      res.status(500).json({ message: "Failed to get sync logs" });
    }
  });
  
  // POST /api/quickbooks/sync-all - Manually trigger full background sync
  app.post("/api/quickbooks/sync-all", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { runBackgroundSync } = await import("./services/quickbooksService");
      const result = await runBackgroundSync();
      res.json({
        success: true,
        message: "Sync completed",
        ...result
      });
    } catch (error: any) {
      console.error("[QuickBooks] Sync all error:", error);
      res.status(500).json({ message: "Failed to run sync" });
    }
  });

  // =============================================
  // QUICKBOOKS CLASS MANAGEMENT
  // =============================================

  // GET /api/quickbooks/classes - Get all classes
  app.get("/api/quickbooks/classes", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getAllLocalClasses } = await import("./services/quickbooksService");
      const classes = await getAllLocalClasses();
      res.json(classes);
    } catch (error: any) {
      console.error("[QuickBooks] Get classes error:", error);
      res.status(500).json({ message: "Failed to get classes" });
    }
  });

  // POST /api/quickbooks/classes/pull - Pull classes from QuickBooks
  app.post("/api/quickbooks/classes/pull", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { pullClassesFromQuickBooks } = await import("./services/quickbooksService");
      const result = await pullClassesFromQuickBooks();
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Pull classes error:", error);
      res.status(500).json({ message: "Failed to pull classes" });
    }
  });

  // POST /api/quickbooks/classes/sync - Sync all classes to QuickBooks
  app.post("/api/quickbooks/classes/sync", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { syncAllClassesToQuickBooks } = await import("./services/quickbooksService");
      const result = await syncAllClassesToQuickBooks();
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Sync classes error:", error);
      res.status(500).json({ message: "Failed to sync classes" });
    }
  });

  // POST /api/quickbooks/classes/:classId/sync - Sync single class to QuickBooks
  app.post("/api/quickbooks/classes/:classId/sync", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { pushClassToQuickBooks } = await import("./services/quickbooksService");
      const result = await pushClassToQuickBooks(req.params.classId);
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Sync class error:", error);
      res.status(500).json({ message: "Failed to sync class" });
    }
  });

  // POST /api/quickbooks/classes - Create a new class
  app.post("/api/quickbooks/classes", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { name, classType, subType } = req.body;
      
      if (!name || !classType || !subType) {
        return res.status(400).json({ message: "Name, classType, and subType are required" });
      }
      
      const validClassTypes = ["Service", "Install", "Maintenance", "Discount"];
      const validSubTypes = ["Residential", "Commercial", "Crawlspace", "Promotional", "Maintenance"];
      
      if (!validClassTypes.includes(classType)) {
        return res.status(400).json({ message: `classType must be one of: ${validClassTypes.join(", ")}` });
      }
      
      if (!validSubTypes.includes(subType)) {
        return res.status(400).json({ message: `subType must be one of: ${validSubTypes.join(", ")}` });
      }
      
      const [created] = await db.insert(quickbooksClasses)
        .values({
          name,
          classType,
          subType,
          isActive: true,
        })
        .returning();
      
      res.status(201).json(created);
    } catch (error: any) {
      console.error("[QuickBooks] Create class error:", error);
      res.status(500).json({ message: "Failed to create class" });
    }
  });

  // PATCH /api/quickbooks/classes/:classId - Update class (name, classType, subType, active status)
  app.patch("/api/quickbooks/classes/:classId", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { name, classType, subType, isActive } = req.body;
      const updateData: any = { updatedAt: new Date() };
      
      if (name !== undefined) updateData.name = name;
      if (classType !== undefined) {
        const validClassTypes = ["Service", "Install", "Maintenance", "Discount"];
        if (!validClassTypes.includes(classType)) {
          return res.status(400).json({ message: `classType must be one of: ${validClassTypes.join(", ")}` });
        }
        updateData.classType = classType;
      }
      if (subType !== undefined) {
        const validSubTypes = ["Residential", "Commercial", "Crawlspace", "Promotional", "Maintenance"];
        if (!validSubTypes.includes(subType)) {
          return res.status(400).json({ message: `subType must be one of: ${validSubTypes.join(", ")}` });
        }
        updateData.subType = subType;
      }
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const [updated] = await db.update(quickbooksClasses)
        .set(updateData)
        .where(eq(quickbooksClasses.id, req.params.classId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Class not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("[QuickBooks] Update class error:", error);
      res.status(500).json({ message: "Failed to update class" });
    }
  });

  // =============================================
  // CATEGORY-CLASS MAPPING
  // =============================================

  // GET /api/quickbooks/category-mappings - Get category-to-class mappings
  app.get("/api/quickbooks/category-mappings", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getCategoryClassMappings } = await import("./services/quickbooksService");
      const mappings = await getCategoryClassMappings();
      res.json(mappings);
    } catch (error: any) {
      console.error("[QuickBooks] Get category mappings error:", error);
      res.status(500).json({ message: "Failed to get category mappings" });
    }
  });

  // POST /api/quickbooks/category-mappings - Save category-to-class mapping
  app.post("/api/quickbooks/category-mappings", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { categoryName, classId } = req.body;
      if (!categoryName) {
        return res.status(400).json({ message: "Category name is required" });
      }
      
      const { saveCategoryClassMapping } = await import("./services/quickbooksService");
      const result = await saveCategoryClassMapping(categoryName, classId || null);
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Save category mapping error:", error);
      res.status(500).json({ message: "Failed to save category mapping" });
    }
  });

  // POST /api/quickbooks/category-mappings/bulk - Bulk save category-to-class mappings
  app.post("/api/quickbooks/category-mappings/bulk", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { mappings } = req.body;
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ message: "Mappings array is required" });
      }
      
      // Validate that all mappings have valid class IDs
      const invalidMappings = mappings.filter(m => m.categoryName && !m.classId);
      if (invalidMappings.length > 0) {
        const missingCategories = invalidMappings.map(m => m.categoryName).join(", ");
        return res.status(400).json({ 
          message: `All categories must be mapped to a class. Missing mappings for: ${missingCategories}` 
        });
      }
      
      // Validate that class IDs are valid
      const classIds = mappings.filter(m => m.classId).map(m => m.classId);
      if (classIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        const validClasses = await db.select({ id: quickbooksClasses.id })
          .from(quickbooksClasses)
          .where(inArray(quickbooksClasses.id, classIds));
        const validClassIds = new Set(validClasses.map(c => c.id));
        const invalidClassIds = classIds.filter(id => !validClassIds.has(id));
        if (invalidClassIds.length > 0) {
          return res.status(400).json({ 
            message: "One or more selected classes do not exist" 
          });
        }
      }
      
      const { saveCategoryClassMapping } = await import("./services/quickbooksService");
      let saved = 0;
      let errors = 0;
      
      for (const mapping of mappings) {
        const result = await saveCategoryClassMapping(mapping.categoryName, mapping.classId || null);
        if (result.success) {
          saved++;
        } else {
          errors++;
        }
      }
      
      res.json({ success: errors === 0, saved, errors });
    } catch (error: any) {
      console.error("[QuickBooks] Bulk save category mappings error:", error);
      res.status(500).json({ message: "Failed to save category mappings" });
    }
  });

  // =============================================
  // QUICKBOOKS ACCOUNTS (CHART OF ACCOUNTS)
  // =============================================

  // GET /api/quickbooks/accounts - Get all accounts
  app.get("/api/quickbooks/accounts", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getActiveConnection } = await import("./services/quickbooksService");
      const conn = await getActiveConnection();
      if (!conn) {
        return res.json([]);
      }
      
      const accounts = await db.select()
        .from(quickbooksAccounts)
        .where(eq(quickbooksAccounts.realmId, conn.realmId));
      
      res.json(accounts);
    } catch (error: any) {
      console.error("[QuickBooks] Get accounts error:", error);
      res.status(500).json({ message: "Failed to get accounts" });
    }
  });

  // GET /api/quickbooks/accounts/parents - Get parent accounts only
  app.get("/api/quickbooks/accounts/parents", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getActiveConnection, getParentAccounts } = await import("./services/quickbooksService");
      const conn = await getActiveConnection();
      if (!conn) {
        return res.json([]);
      }
      
      const parents = await getParentAccounts(conn.realmId);
      res.json(parents);
    } catch (error: any) {
      console.error("[QuickBooks] Get parent accounts error:", error);
      res.status(500).json({ message: "Failed to get parent accounts" });
    }
  });

  // POST /api/quickbooks/accounts/pull - Pull accounts from QuickBooks
  app.post("/api/quickbooks/accounts/pull", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { pullAccountsFromQuickBooks } = await import("./services/quickbooksService");
      const result = await pullAccountsFromQuickBooks();
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Pull accounts error:", error);
      res.status(500).json({ message: "Failed to pull accounts" });
    }
  });

  // POST /api/quickbooks/accounts/sub-account - Create a sub-account
  app.post("/api/quickbooks/accounts/sub-account", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { name, parentAccountId, categoryType, propertyType } = req.body;
      
      if (!name || !parentAccountId || !categoryType || !propertyType) {
        return res.status(400).json({ 
          message: "name, parentAccountId, categoryType, and propertyType are required" 
        });
      }
      
      const validCategoryTypes = ["Service", "Install", "Maintenance", "Discount"];
      if (!validCategoryTypes.includes(categoryType)) {
        return res.status(400).json({ 
          message: `categoryType must be one of: ${validCategoryTypes.join(", ")}` 
        });
      }
      
      const validPropertyTypes = ["Residential", "Commercial", "None"];
      if (!validPropertyTypes.includes(propertyType)) {
        return res.status(400).json({ 
          message: `propertyType must be one of: ${validPropertyTypes.join(", ")}` 
        });
      }
      
      const { createSubAccountInQuickBooks } = await import("./services/quickbooksService");
      const result = await createSubAccountInQuickBooks(name, parentAccountId, categoryType, propertyType);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("[QuickBooks] Create sub-account error:", error);
      res.status(500).json({ message: "Failed to create sub-account" });
    }
  });

  // PATCH /api/quickbooks/accounts/:accountId - Update account mapping
  app.patch("/api/quickbooks/accounts/:accountId", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { categoryType, propertyType, isActive } = req.body;
      const updateData: any = { updatedAt: new Date() };
      
      if (categoryType !== undefined) {
        const validCategoryTypes = ["Service", "Install", "Maintenance", "Discount", null];
        if (!validCategoryTypes.includes(categoryType)) {
          return res.status(400).json({ 
            message: "categoryType must be one of: Service, Install, Maintenance, Discount, or null" 
          });
        }
        updateData.categoryType = categoryType;
      }
      
      if (propertyType !== undefined) {
        const validPropertyTypes = ["Residential", "Commercial", null];
        if (!validPropertyTypes.includes(propertyType)) {
          return res.status(400).json({ 
            message: "propertyType must be one of: Residential, Commercial, or null" 
          });
        }
        updateData.propertyType = propertyType;
      }
      
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const [updated] = await db.update(quickbooksAccounts)
        .set(updateData)
        .where(eq(quickbooksAccounts.id, req.params.accountId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error("[QuickBooks] Update account error:", error);
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  // =============================================
  // QUICKBOOKS ITEMS (Products & Services)
  // =============================================

  // GET /api/quickbooks/items - Get all items
  app.get("/api/quickbooks/items", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getQuickbooksItems } = await import("./services/quickbooksService");
      const items = await getQuickbooksItems();
      res.json(items);
    } catch (error: any) {
      console.error("[QuickBooks] Get items error:", error);
      res.status(500).json({ message: "Failed to get items" });
    }
  });

  // POST /api/quickbooks/items/pull - Pull items from QuickBooks
  app.post("/api/quickbooks/items/pull", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { pullItemsFromQuickBooks } = await import("./services/quickbooksService");
      const result = await pullItemsFromQuickBooks();
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("[QuickBooks] Pull items error:", error);
      res.status(500).json({ message: "Failed to pull items" });
    }
  });

  // POST /api/quickbooks/items/provision - Auto-provision items for mapped sub-accounts
  app.post("/api/quickbooks/items/provision", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { provisionItemsForSubAccounts } = await import("./services/quickbooksService");
      const result = await provisionItemsForSubAccounts();
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Provision items error:", error);
      res.status(500).json({ message: "Failed to provision items", error: error.message });
    }
  });

  // POST /api/quickbooks/items/push - Push all items to QuickBooks with correct IncomeAccountRef
  app.post("/api/quickbooks/items/push", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { pushAllItemsToQuickBooks } = await import("./services/quickbooksService");
      const result = await pushAllItemsToQuickBooks();
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Push items error:", error);
      res.status(500).json({ message: "Failed to push items", error: error.message });
    }
  });

  // GET /api/quickbooks/invoice/:qbInvoiceId/debug - Debug a QuickBooks invoice
  app.get("/api/quickbooks/invoice/:qbInvoiceId/debug", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getQuickBooksInvoiceDetails } = await import("./services/quickbooksService");
      const result = await getQuickBooksInvoiceDetails(req.params.qbInvoiceId);
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Debug invoice error:", error);
      res.status(500).json({ message: "Failed to get invoice details", error: error.message });
    }
  });

  // POST /api/quickbooks/invoice/:crmInvoiceId/resync - Resync a CRM invoice to QuickBooks with correct ItemRefs
  app.post("/api/quickbooks/invoice/:crmInvoiceId/resync", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { resyncInvoiceToQuickBooks } = await import("./services/quickbooksService");
      const result = await resyncInvoiceToQuickBooks(req.params.crmInvoiceId);
      res.json(result);
    } catch (error: any) {
      console.error("[QuickBooks] Resync invoice error:", error);
      res.status(500).json({ message: "Failed to resync invoice", error: error.message });
    }
  });

  // POST /api/quickbooks/items - Create an item
  app.post("/api/quickbooks/items", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { name, description, categoryType, propertyType, incomeAccountId, itemType } = req.body;
      
      if (!name || !categoryType || !propertyType) {
        return res.status(400).json({ 
          message: "name, categoryType, and propertyType are required" 
        });
      }
      
      const { createQuickbooksItem } = await import("./services/quickbooksService");
      const result = await createQuickbooksItem({
        name,
        description,
        categoryType,
        propertyType,
        incomeAccountId,
        itemType: itemType || "Service"
      });
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("[QuickBooks] Create item error:", error);
      res.status(500).json({ message: "Failed to create item" });
    }
  });

  // PATCH /api/quickbooks/items/:itemId - Update item mapping
  app.patch("/api/quickbooks/items/:itemId", requireCrmAuth, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user || (user.role !== "owner" && user.role !== "admin")) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { categoryType, propertyType, incomeAccountId, isActive } = req.body;
      const updates: any = {};
      
      if (categoryType !== undefined) updates.categoryType = categoryType;
      if (propertyType !== undefined) updates.propertyType = propertyType;
      if (incomeAccountId !== undefined) updates.incomeAccountId = incomeAccountId;
      if (isActive !== undefined) updates.isActive = isActive;
      
      const { updateQuickbooksItemMapping } = await import("./services/quickbooksService");
      const result = await updateQuickbooksItemMapping(
        req.params.itemId,
        updates
      );
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("[QuickBooks] Update item error:", error);
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  // POST /api/admin/portal/generate-link/:customerId - Generate portal login link for a customer
  app.post("/api/admin/portal/generate-link/:customerId", requireCrmAuth, async (req, res) => {
    try {
      const { customerId } = req.params;

      const customerResult = await db.select()
        .from(crmCustomers)
        .where(eq(crmCustomers.id, customerId))
        .limit(1);

      if (customerResult.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const customer = customerResult[0];

      let account = await db.select()
        .from(customerPortalAccounts)
        .where(eq(customerPortalAccounts.customerId, customerId))
        .limit(1)
        .then(rows => rows[0]);

      if (!account) {
        const [newAccount] = await db.insert(customerPortalAccounts)
          .values({
            customerId,
            email: customer.email,
            phone: customer.phone,
            isActive: true,
          })
          .returning();
        account = newAccount;
      }

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(customerPortalLoginTokens)
        .values({
          accountId: account.id,
          token,
          expiresAt,
        });

      const loginUrl = `/portal/login?token=${token}`;

      res.json({
        success: true,
        loginUrl,
        expiresAt: expiresAt.toISOString(),
        customerName: customer.name,
      });
    } catch (error) {
      console.error("Error generating portal link:", error);
      res.status(500).json({ message: "Failed to generate portal link" });
    }
  });

  // POST /api/portal/auth/validate-token - Validate login token and create session
  app.post("/api/portal/auth/validate-token", async (req, res) => {
    try {
      const { token } = req.body;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Token required" });
      }

      const tokenResult = await db.select()
        .from(customerPortalLoginTokens)
        .where(and(
          eq(customerPortalLoginTokens.token, token),
          isNull(customerPortalLoginTokens.usedAt),
          gt(customerPortalLoginTokens.expiresAt, new Date())
        ))
        .limit(1);

      if (tokenResult.length === 0) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      const loginToken = tokenResult[0];

      await db.update(customerPortalLoginTokens)
        .set({ usedAt: new Date() })
        .where(eq(customerPortalLoginTokens.id, loginToken.id));

      const account = await db.select()
        .from(customerPortalAccounts)
        .where(and(
          eq(customerPortalAccounts.id, loginToken.accountId),
          eq(customerPortalAccounts.isActive, true)
        ))
        .limit(1)
        .then(rows => rows[0]);

      if (!account) {
        return res.status(401).json({ message: "Account not found or inactive" });
      }

      const customer = await db.select()
        .from(crmCustomers)
        .where(eq(crmCustomers.id, account.customerId))
        .limit(1)
        .then(rows => rows[0]);

      if (!customer) {
        return res.status(401).json({ message: "Customer not found" });
      }

      if (!customer.portalEnabled) {
        return res.status(403).json({ message: "Portal access is not enabled for this account" });
      }

      const sessionToken = randomUUID();
      const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(customerPortalSessions)
        .values({
          accountId: account.id,
          sessionToken,
          expiresAt: sessionExpiresAt,
        });

      await db.update(customerPortalAccounts)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(customerPortalAccounts.id, account.id));

      res.cookie(PORTAL_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
      });
    } catch (error) {
      console.error("Error validating portal token:", error);
      res.status(500).json({ message: "Failed to validate token" });
    }
  });

  // GET /api/portal/auth/me - Get current logged-in customer info
  app.get("/api/portal/auth/me", requireCustomerPortalAuth, async (req: any, res) => {
    const customer = req.portalCustomer;
    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    });
  });

  // POST /api/portal/auth/logout - Destroy session
  app.post("/api/portal/auth/logout", async (req, res) => {
    const sessionToken = req.cookies?.[PORTAL_SESSION_COOKIE];

    if (sessionToken) {
      await db.delete(customerPortalSessions)
        .where(eq(customerPortalSessions.sessionToken, sessionToken))
        .catch(console.error);
    }

    res.clearCookie(PORTAL_SESSION_COOKIE);
    res.json({ success: true });
  });

  // GET /api/portal/dashboard - Returns customer's dashboard data
  app.get("/api/portal/dashboard", requireCustomerPortalAuth, async (req: any, res) => {
    try {
      const customerId = req.portalCustomer.id;
      const customer = req.portalCustomer;

      // Get all invoices for the customer
      const allInvoices = await db.select({
        id: crmInvoices.id,
        invoiceNumber: crmInvoices.invoiceNumber,
        total: crmInvoices.total,
        balanceDue: crmInvoices.balanceDue,
        status: crmInvoices.status,
        createdAt: crmInvoices.createdAt,
      })
        .from(crmInvoices)
        .where(eq(crmInvoices.customerId, customerId))
        .orderBy(desc(crmInvoices.createdAt));

      // Calculate open invoices (not paid, not void)
      const openInvoices = allInvoices.filter(inv => inv.status !== "paid" && inv.status !== "void");
      const openInvoicesTotal = openInvoices.reduce((sum, inv) => sum + parseFloat(inv.balanceDue || "0"), 0);

      // Get agreements for the customer
      const agreements = await db.select({
        id: crmAgreements.id,
        agreementNumber: crmAgreements.agreementNumber,
        agreementPlan: crmAgreements.agreementPlan,
        status: crmAgreements.status,
        startDate: crmAgreements.startDate,
        endDate: crmAgreements.endDate,
      })
        .from(crmAgreements)
        .where(eq(crmAgreements.customerId, customerId));

      const activeAgreements = agreements.filter(a => a.status === "active").length;
      const totalAgreements = agreements.length;

      // Get recent service (most recent completed work order)
      const recentService = await db.select({
        id: crmWorkOrders.id,
        title: crmWorkOrders.title,
        completedAt: crmWorkOrders.completedAt,
        scheduledStart: crmWorkOrders.scheduledStart,
      })
        .from(crmWorkOrders)
        .where(and(
          eq(crmWorkOrders.customerId, customerId),
          eq(crmWorkOrders.status, "completed")
        ))
        .orderBy(desc(crmWorkOrders.completedAt))
        .limit(1);

      // Get quotes summary for the customer
      const allQuotes = await db.select({
        id: crmQuotes.id,
        status: crmQuotes.status,
        total: crmQuotes.total,
      })
        .from(crmQuotes)
        .where(eq(crmQuotes.customerId, customerId));

      const pendingQuotes = allQuotes.filter(q => q.status === "sent" || q.status === "draft");
      const pendingQuotesTotal = pendingQuotes.reduce((sum, q) => sum + parseFloat(q.total || "0"), 0);

      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
        },
        invoicesSummary: {
          openCount: openInvoices.length,
          openTotal: openInvoicesTotal.toFixed(2),
          totalCount: allInvoices.length,
        },
        agreementsSummary: {
          active: activeAgreements,
          total: totalAgreements,
        },
        quotesSummary: {
          pendingCount: pendingQuotes.length,
          pendingTotal: pendingQuotesTotal.toFixed(2),
          totalCount: allQuotes.length,
        },
        recentService: recentService.length > 0 ? {
          title: recentService[0].title,
          date: recentService[0].completedAt || recentService[0].scheduledStart,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching portal dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // GET /api/portal/invoices - Returns customer's invoices
  app.get("/api/portal/invoices", requireCustomerPortalAuth, async (req: any, res) => {
    try {
      const customerId = req.portalCustomer.id;

      const invoices = await db.select({
        id: crmInvoices.id,
        invoiceNumber: crmInvoices.invoiceNumber,
        total: crmInvoices.total,
        subtotal: crmInvoices.subtotal,
        amountPaid: crmInvoices.amountPaid,
        balanceDue: crmInvoices.balanceDue,
        status: crmInvoices.status,
        dueDate: crmInvoices.dueDate,
        paidAt: crmInvoices.paidAt,
        createdAt: crmInvoices.createdAt,
      })
        .from(crmInvoices)
        .where(eq(crmInvoices.customerId, customerId))
        .orderBy(desc(crmInvoices.createdAt));

      res.json({ invoices });
    } catch (error) {
      console.error("Error fetching portal invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // GET /api/portal/invoice/:id - Returns single invoice details (public for payment redirects)
  app.get("/api/portal/invoice/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const [invoice] = await db.select()
        .from(crmInvoices)
        .where(eq(crmInvoices.id, id));

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Track invoice view - use atomic increment and always update status if 'sent'
      if (invoice.status !== 'draft') {
        const updateData: any = { 
          viewCount: sql`COALESCE(${crmInvoices.viewCount}, 0) + 1`
        };
        
        // Set viewedAt only on first view
        if (!invoice.viewedAt) {
          updateData.viewedAt = new Date();
        }
        
        // Always update status from 'sent' to 'viewed' (handles resend scenario)
        if (invoice.status === 'sent') {
          updateData.status = 'viewed';
        }
        
        const [updated] = await db.update(crmInvoices)
          .set(updateData)
          .where(eq(crmInvoices.id, id))
          .returning({ viewCount: crmInvoices.viewCount, viewedAt: crmInvoices.viewedAt, status: crmInvoices.status });
        
        // Update the invoice object with new values
        if (updated) {
          invoice.viewCount = updated.viewCount;
          invoice.viewedAt = updated.viewedAt;
          invoice.status = updated.status;
        }
      }

      // Get line items
      const lineItems = await db.select()
        .from(crmInvoiceLineItems)
        .where(eq(crmInvoiceLineItems.invoiceId, id))
        .orderBy(crmInvoiceLineItems.sortOrder);

      // Get customer info if available
      let customerName = "Customer";
      let customerEmail = null;
      let customerPhone = null;
      if (invoice.customerId) {
        const [customer] = await db.select()
          .from(crmCustomers)
          .where(eq(crmCustomers.id, invoice.customerId));
        if (customer) {
          customerName = customer.name;
          customerEmail = customer.email;
          customerPhone = customer.phone;
        }
      }

      // Get property info if available  
      let serviceAddress = null;
      if (invoice.propertyId) {
        const [property] = await db.select()
          .from(crmProperties)
          .where(eq(crmProperties.id, invoice.propertyId));
        if (property) {
          serviceAddress = [property.address1, property.city, property.state, property.zip].filter(Boolean).join(", ");
        }
      }

      res.json({ 
        invoice: {
          ...invoice,
          customerName,
          customerEmail,
          customerPhone,
          serviceAddress,
        },
        lineItems,
      });
    } catch (error) {
      console.error("Error fetching portal invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // GET /api/portal/quotes - Returns customer's quotes
  app.get("/api/portal/quotes", requireCustomerPortalAuth, async (req: any, res) => {
    try {
      const customerId = req.portalCustomer.id;

      const quotesResult = await db.select({
        id: crmQuotes.id,
        quoteNumber: crmQuotes.quoteNumber,
        total: crmQuotes.total,
        subtotal: crmQuotes.subtotal,
        status: crmQuotes.status,
        quoteDate: crmQuotes.quoteDate,
        validUntil: crmQuotes.validUntil,
        title: crmQuotes.title,
        publicToken: crmQuotes.publicToken,
      })
        .from(crmQuotes)
        .where(eq(crmQuotes.customerId, customerId))
        .orderBy(desc(crmQuotes.quoteDate));

      res.json({ quotes: quotesResult });
    } catch (error) {
      console.error("Error fetching portal quotes:", error);
      res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  // GET /api/portal/agreements - Returns customer's maintenance agreements with visit tracking
  app.get("/api/portal/agreements", requireCustomerPortalAuth, async (req: any, res) => {
    try {
      const customerId = req.portalCustomer.id;

      const agreementsResult = await db.select({
        id: crmAgreements.id,
        agreementNumber: crmAgreements.agreementNumber,
        agreementPlan: crmAgreements.agreementPlan,
        status: crmAgreements.status,
        startDate: crmAgreements.startDate,
        endDate: crmAgreements.endDate,
        price: crmAgreements.price,
        frequency: crmAgreements.frequency,
        visitsPerPeriod: crmAgreements.visitsPerPeriod,
        nextServiceDate: crmAgreements.nextServiceDate,
      })
        .from(crmAgreements)
        .where(eq(crmAgreements.customerId, customerId))
        .orderBy(desc(crmAgreements.startDate));

      // For each agreement, get the maintenance visits
      const agreementsWithVisits = await Promise.all(
        agreementsResult.map(async (agreement) => {
          const visits = await db.select({
            id: maintenanceVisits.id,
            visitNumber: maintenanceVisits.visitNumber,
            cycleYear: maintenanceVisits.cycleYear,
            targetDate: maintenanceVisits.targetDate,
            completedAt: maintenanceVisits.completedAt,
            status: maintenanceVisits.status,
          })
            .from(maintenanceVisits)
            .where(eq(maintenanceVisits.agreementId, agreement.id))
            .orderBy(maintenanceVisits.targetDate);
          
          const completedVisits = visits.filter(v => v.status === "completed").length;
          const totalVisits = visits.length;
          const remainingVisits = totalVisits - completedVisits;
          
          return {
            ...agreement,
            visits,
            completedVisits,
            totalVisits,
            remainingVisits,
          };
        })
      );

      res.json({ agreements: agreementsWithVisits });
    } catch (error) {
      console.error("Error fetching portal agreements:", error);
      res.status(500).json({ message: "Failed to fetch agreements" });
    }
  });

  // GET /api/portal/service-history - Returns customer's completed work orders
  app.get("/api/portal/service-history", requireCustomerPortalAuth, async (req: any, res) => {
    try {
      const customerId = req.portalCustomer.id;

      const workOrders = await db.select({
        id: crmWorkOrders.id,
        orderNumber: crmWorkOrders.orderNumber,
        title: crmWorkOrders.title,
        status: crmWorkOrders.status,
        visitType: crmWorkOrders.visitType,
        scheduledStart: crmWorkOrders.scheduledStart,
        scheduledEnd: crmWorkOrders.scheduledEnd,
        completedAt: crmWorkOrders.completedAt,
        summary: crmWorkOrders.summary,
      })
        .from(crmWorkOrders)
        .where(and(
          eq(crmWorkOrders.customerId, customerId),
          eq(crmWorkOrders.status, "completed")
        ))
        .orderBy(desc(crmWorkOrders.completedAt));

      res.json({ workOrders });
    } catch (error) {
      console.error("Error fetching portal service history:", error);
      res.status(500).json({ message: "Failed to fetch service history" });
    }
  });

  // ============================================
  // MOBILE TIME TRACKING ENDPOINTS
  // ============================================

  // GET /api/mobile/time/current - Get active time entry for logged-in tech
  app.get("/api/mobile/time/current", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const activeEntry = await storage.getActiveTimeEntry(user.id);
      return res.json({ entry: activeEntry });
    } catch (error) {
      console.error("Error fetching active time entry:", error);
      return res.status(500).json({ message: "Failed to fetch active time entry" });
    }
  });

  // POST /api/mobile/time/clock-in - Clock in (optional body: { workOrderId })
  app.post("/api/mobile/time/clock-in", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const existingEntry = await storage.getActiveTimeEntry(user.id);
      if (existingEntry) {
        return res.status(400).json({ message: "Already clocked in" });
      }

      const { workOrderId } = req.body || {};
      const entry = await storage.clockIn(user.id, workOrderId, "mobile");
      return res.status(201).json(entry);
    } catch (error) {
      console.error("Error clocking in:", error);
      return res.status(500).json({ message: "Failed to clock in" });
    }
  });

  // POST /api/mobile/time/clock-out - Clock out current entry
  app.post("/api/mobile/time/clock-out", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const activeEntry = await storage.getActiveTimeEntry(user.id);
      if (!activeEntry) {
        return res.status(400).json({ message: "Not currently clocked in" });
      }

      const entry = await storage.clockOut(activeEntry.id);
      return res.json(entry);
    } catch (error) {
      console.error("Error clocking out:", error);
      return res.status(500).json({ message: "Failed to clock out" });
    }
  });

  // GET /api/mobile/time/history - Get recent time entries for logged-in tech (last 30 days)
  app.get("/api/mobile/time/history", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const entries = await storage.getTimeEntries({
        technicianId: user.id,
        startDate: thirtyDaysAgo,
      });
      return res.json(entries);
    } catch (error) {
      console.error("Error fetching time history:", error);
      return res.status(500).json({ message: "Failed to fetch time history" });
    }
  });

  // ============================================
  // CRM ADMIN TIME TRACKING ENDPOINTS
  // ============================================

  // GET /api/crm/time-entries - Get all time entries with filters
  app.get("/api/crm/time-entries", requireCrmAdmin, async (req, res) => {
    try {
      const { technicianId, startDate, endDate } = req.query;

      const filters: { technicianId?: string; startDate?: Date; endDate?: Date } = {};
      if (technicianId && typeof technicianId === "string") {
        filters.technicianId = technicianId;
      }
      if (startDate && typeof startDate === "string") {
        filters.startDate = new Date(startDate);
      }
      if (endDate && typeof endDate === "string") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include the full end date
        filters.endDate = end;
      }

      const entries = await storage.getTimeEntries(filters);
      
      // Enrich with technician names
      const users = await db.select().from(crmUsers);
      const userMap = new Map(users.map((u) => [u.id, u.name]));
      const enrichedEntries = entries.map((entry) => ({
        ...entry,
        technicianName: userMap.get(entry.technicianId) || "Unknown",
      }));
      
      return res.json(enrichedEntries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      return res.status(500).json({ message: "Failed to fetch time entries" });
    }
  });

  // PATCH /api/crm/time-entries/:id - Update a time entry (for admin adjustments)
  app.patch("/api/crm/time-entries/:id", requireCrmAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { clockInAt, clockOutAt, durationMinutes, notes, workOrderId } = req.body;

      const updates: Record<string, any> = {};
      if (clockInAt !== undefined) updates.clockInAt = new Date(clockInAt);
      if (clockOutAt !== undefined) updates.clockOutAt = clockOutAt ? new Date(clockOutAt) : null;
      if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
      if (notes !== undefined) updates.notes = notes;
      if (workOrderId !== undefined) updates.workOrderId = workOrderId || null;

      const entry = await storage.updateTimeEntry(id, updates);
      return res.json(entry);
    } catch (error: any) {
      console.error("Error updating time entry:", error);
      if (error.message === "Time entry not found") {
        return res.status(404).json({ message: "Time entry not found" });
      }
      return res.status(500).json({ message: "Failed to update time entry" });
    }
  });

  // GET /api/crm/time-breakdown - Get time breakdown (idle/drive/work) per employee
  // Available to all CRM users (tech and above) who can view dispatch board
  app.get("/api/crm/time-breakdown", requireCrmTechOrAbove, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate || typeof startDate !== "string" || typeof endDate !== "string") {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the full end date

      // Get all time entries in the date range
      const timeEntries = await storage.getTimeEntries({ startDate: start, endDate: end });

      // Get work orders with timing data that overlap the date range
      // Include work orders where any timing window (dispatch/onsite/complete) intersects range
      const workOrders = await db.select()
        .from(crmWorkOrders)
        .where(
          or(
            // Dispatched within range
            and(
              isNotNull(crmWorkOrders.dispatchedAt),
              gte(crmWorkOrders.dispatchedAt, start),
              lte(crmWorkOrders.dispatchedAt, end)
            ),
            // On-site within range
            and(
              isNotNull(crmWorkOrders.onSiteAt),
              gte(crmWorkOrders.onSiteAt, start),
              lte(crmWorkOrders.onSiteAt, end)
            ),
            // Completed within range
            and(
              isNotNull(crmWorkOrders.completedAt),
              gte(crmWorkOrders.completedAt, start),
              lte(crmWorkOrders.completedAt, end)
            )
          )
        );

      // Get all users (technicians)
      const users = await db.select().from(crmUsers);
      const techUsers = users.filter(u => ["tech", "supervisor", "sales"].includes(u.role || ""));

      // Calculate breakdown for each technician
      const breakdowns = techUsers.map(tech => {
        // Get time entries for this tech
        const techTimeEntries = timeEntries.filter(e => e.technicianId === tech.id);
        
        // Calculate total clocked time in minutes (skip entries without clock-out)
        let totalClockedMinutes = 0;
        for (const entry of techTimeEntries) {
          if (entry.durationMinutes) {
            totalClockedMinutes += entry.durationMinutes;
          } else if (entry.clockOutAt) {
            const duration = Math.floor((entry.clockOutAt.getTime() - entry.clockInAt.getTime()) / 60000);
            if (duration > 0) totalClockedMinutes += duration;
          }
          // Skip entries without clock-out (still in progress)
        }

        // Get work orders for this tech
        const techWorkOrders = workOrders.filter(wo => wo.assignedTechId === tech.id);

        // Calculate drive time (dispatchedAt to onSiteAt) in minutes
        let rawDriveTimeMinutes = 0;
        for (const wo of techWorkOrders) {
          if (wo.dispatchedAt && wo.onSiteAt) {
            const duration = Math.floor((wo.onSiteAt.getTime() - wo.dispatchedAt.getTime()) / 60000);
            if (duration > 0) rawDriveTimeMinutes += duration;
          }
        }

        // Calculate work time (onSiteAt to completedAt) in minutes
        let rawWorkTimeMinutes = 0;
        let totalPendingMinutes = 0;
        for (const wo of techWorkOrders) {
          if (wo.onSiteAt && wo.completedAt) {
            const duration = Math.floor((wo.completedAt.getTime() - wo.onSiteAt.getTime()) / 60000);
            if (duration > 0) rawWorkTimeMinutes += duration;
          }
          // Accumulate pending time from completed work orders
          if (wo.totalPendingMinutes && wo.totalPendingMinutes > 0) {
            totalPendingMinutes += wo.totalPendingMinutes;
          }
          // Also check currently pending work orders
          if (wo.isPending && wo.pendingStartedAt) {
            const currentPendingMinutes = Math.floor((new Date().getTime() - wo.pendingStartedAt.getTime()) / 60000);
            totalPendingMinutes += Math.max(0, currentPendingMinutes);
          }
        }
        
        // Subtract pending time from raw work time (pending time = idle, not work)
        rawWorkTimeMinutes = Math.max(0, rawWorkTimeMinutes - totalPendingMinutes);

        // Clamp drive + work time to not exceed total clocked time
        let driveTimeMinutes = 0;
        let workTimeMinutes = 0;
        
        if (totalClockedMinutes > 0) {
          const totalActiveMinutes = rawDriveTimeMinutes + rawWorkTimeMinutes;
          if (totalActiveMinutes > totalClockedMinutes) {
            // Scale down proportionally if active time exceeds clocked time
            const ratio = totalClockedMinutes / totalActiveMinutes;
            driveTimeMinutes = Math.floor(rawDriveTimeMinutes * ratio);
            workTimeMinutes = Math.floor(rawWorkTimeMinutes * ratio);
          } else {
            driveTimeMinutes = rawDriveTimeMinutes;
            workTimeMinutes = rawWorkTimeMinutes;
          }
        }
        // If no clock data, drive/work stay at 0

        // Idle time = total clocked time - drive time - work time
        const idleTimeMinutes = Math.max(0, totalClockedMinutes - driveTimeMinutes - workTimeMinutes);

        return {
          technicianId: tech.id,
          technicianName: tech.name,
          role: tech.role,
          totalClockedMinutes,
          driveTimeMinutes,
          workTimeMinutes,
          idleTimeMinutes,
          workOrdersCompleted: techWorkOrders.filter(wo => wo.status === "completed").length,
          // Also include daily breakdown
          entries: techTimeEntries.map(e => ({
            id: e.id,
            date: e.clockInAt.toISOString().split('T')[0],
            clockInAt: e.clockInAt,
            clockOutAt: e.clockOutAt,
            durationMinutes: e.durationMinutes || (e.clockOutAt ? Math.max(0, Math.floor((e.clockOutAt.getTime() - e.clockInAt.getTime()) / 60000)) : 0),
          })),
        };
      });

      return res.json({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        breakdowns: breakdowns.filter(b => b.totalClockedMinutes > 0 || b.workOrdersCompleted > 0 || b.entries.length > 0),
      });
    } catch (error) {
      console.error("Error calculating time breakdown:", error);
      return res.status(500).json({ message: "Failed to calculate time breakdown" });
    }
  });

  // ============================================
  // MOBILE MESSAGING ENDPOINTS
  // ============================================

  // GET /api/mobile/messaging/conversations - List conversations for logged-in tech
  app.get("/api/mobile/messaging/conversations", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { status, search } = req.query;
      const filters: { status?: string; search?: string } = {};
      if (status && typeof status === "string") filters.status = status;
      if (search && typeof search === "string") filters.search = search;

      const conversations = await storage.getMobileConversations(user.id, filters);
      return res.json(conversations);
    } catch (error) {
      console.error("Error fetching mobile conversations:", error);
      return res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // GET /api/mobile/messaging/conversations/:id - Get single conversation with messages
  app.get("/api/mobile/messaging/conversations/:id", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { id } = req.params;
      const conversation = await storage.getMessagingConversationById(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // If this is a Textline conversation, fetch messages from Textline and cache them
      // Try phone number first (more reliable), fall back to UUID
      if (conversation.externalSource === "textline" && textlineClient.isConfigured()) {
        let textlineMessages: any[] = [];
        
        // Try phone number first if available
        if (conversation.phoneNumber) {
          try {
            const phoneResult = await textlineClient.getConversationMessagesByPhone(conversation.phoneNumber);
            if (!phoneResult.error) {
              textlineMessages = phoneResult.messages;
            }
          } catch (e) {
            console.error("[Textline] Phone lookup failed, will try UUID:", e);
          }
        }
        
        // Fall back to UUID if phone failed or wasn't available
        if (textlineMessages.length === 0 && conversation.externalConversationId) {
          try {
            const uuidResult = await textlineClient.getConversationMessages(conversation.externalConversationId);
            if (!uuidResult.error) {
              textlineMessages = uuidResult.messages;
            }
          } catch (e) {
            console.error("[Textline] UUID lookup failed:", e);
          }
        }
        
        if (textlineMessages.length > 0) {
          // Get existing message external IDs to avoid duplicates
          const existingMessages = await storage.getMessagesForConversation(id);
          const existingExternalIds = new Set(existingMessages.map(m => m.externalMessageId).filter(Boolean));
          
          // Insert new messages from Textline
          for (const tm of textlineMessages) {
            if (!existingExternalIds.has(tm.uuid)) {
              try {
                await storage.createMessage({
                  conversationId: id,
                  body: tm.body,
                  direction: tm.direction as any,
                  channel: "sms" as any,
                  status: "delivered" as any,
                  externalMessageId: tm.uuid,
                  sentAt: tm.created_at ? new Date(tm.created_at) : undefined,
                  deliveredAt: tm.delivered_at ? new Date(tm.delivered_at) : undefined,
                  readAt: tm.read_at ? new Date(tm.read_at) : undefined,
                  attachments: tm.attachments?.map(a => ({ url: a.url, filename: a.filename, contentType: a.content_type })) as any,
                });
              } catch (e) {
                console.error("[Textline] Error caching message:", e);
              }
            }
          }
        }
      }

      // Now fetch all messages (including newly cached ones)
      const messages = await storage.getMessagesForConversation(id);
      
      let customer = null;
      if (conversation.customerId) {
        const [cust] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, conversation.customerId));
        customer = cust || null;
      }

      return res.json({ conversation, messages, customer });
    } catch (error) {
      console.error("Error fetching mobile conversation details:", error);
      return res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // POST /api/mobile/messaging/conversations - Create new conversation for a customer
  app.post("/api/mobile/messaging/conversations", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { customerId, initialMessage } = req.body;
      
      if (!customerId) {
        return res.status(400).json({ message: "customerId is required" });
      }

      const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, customerId));
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      if (!customer.phone) {
        return res.status(400).json({ message: "Customer has no phone number" });
      }

      const conversationData = {
        customerId,
        phoneNumber: customer.phone,
        customerName: customer.name,
        assignedToId: user.id,
        status: "open" as const,
        lastMessageAt: new Date(),
      };

      const conversation = await storage.createMessagingConversation(conversationData);

      if (initialMessage && typeof initialMessage === "string" && initialMessage.trim()) {
        const messageData = {
          conversationId: conversation.id,
          body: initialMessage.trim(),
          channel: "sms" as const,
          direction: "outbound" as const,
          status: "sent" as const,
          authorUserId: user.id,
          sentAt: new Date(),
        };
        await storage.createMessage(messageData);
      }

      return res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating mobile conversation:", error);
      return res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // POST /api/mobile/messaging/conversations/:id/messages - Send a new message
  app.post("/api/mobile/messaging/conversations/:id/messages", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { id } = req.params;
      const conversation = await storage.getMessagingConversationById(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const { body } = req.body;
      
      if (!body || typeof body !== "string" || !body.trim()) {
        return res.status(400).json({ message: "Message body is required" });
      }

      const messageBody = body.trim();

      // Store message locally first
      const messageData = {
        conversationId: id,
        body: messageBody,
        channel: "sms" as const,
        direction: "outbound" as const,
        status: "queued" as const,
        authorUserId: user.id,
        sentAt: new Date(),
      };

      const message = await storage.createMessage(messageData);

      // Send via messaging adapter (Textline if configured, local otherwise)
      const adapter = getMessagingAdapter();
      const adapterResult = await adapter.sendMessage({
        conversationId: id,
        body: messageBody,
        channel: "sms",
        recipientPhone: conversation.phoneNumber || undefined,
        externalConversationId: conversation.externalConversationId || undefined,
      });

      if (!adapterResult.success) {
        console.error("[Mobile] Message send failed:", adapterResult.errorMessage);
        // Update message status to failed
        await storage.updateMessage(message.id, { status: "failed" });
        return res.status(500).json({ message: adapterResult.errorMessage || "Failed to send SMS" });
      }

      // Update message status and external ID
      await storage.updateMessage(message.id, { 
        status: adapterResult.status,
        externalMessageId: adapterResult.externalMessageId,
      });
      
      // Update conversation lastMessageAt
      await storage.updateMessagingConversation(id, {
        lastMessageAt: new Date(),
        lastOutboundAt: new Date(),
      });

      return res.status(201).json(message);
    } catch (error) {
      console.error("Error sending mobile message:", error);
      return res.status(500).json({ message: "Failed to send message" });
    }
  });

  // GET /api/mobile/messaging/contacts - Search customers for new conversations
  app.get("/api/mobile/messaging/contacts", requireCrmTechOrAbove, async (req, res) => {
    try {
      const { search } = req.query;
      
      if (!search || typeof search !== "string") {
        return res.json([]);
      }

      const customers = await storage.searchCrmCustomers(search, 20);
      return res.json(customers);
    } catch (error) {
      console.error("Error searching mobile contacts:", error);
      return res.status(500).json({ message: "Failed to search contacts" });
    }
  });

  // GET /api/mobile/customers - Mobile customer lookup (for field technicians)
  app.get("/api/mobile/customers", requireCrmTechOrAbove, async (req, res) => {
    try {
      const { search, limit = "20" } = req.query as Record<string, string | undefined>;
      const limitNum = Math.min(50, Math.max(1, parseInt(limit || "20") || 20));
      const searchTerm = search?.trim() || "";
      
      // If no search term, return empty (don't load all customers)
      if (!searchTerm) {
        return res.json([]);
      }

      const customers = await storage.searchCrmCustomers(searchTerm, limitNum);
      return res.json(customers);
    } catch (error) {
      console.error("Error fetching mobile customers:", error);
      return res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  // GET /api/mobile/work-orders/available-slots - Get available time slots for a given date
  app.get("/api/mobile/work-orders/available-slots", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { date, techId, durationMinutes = "60" } = req.query as Record<string, string | undefined>;
      
      if (!date) {
        return res.status(400).json({ message: "Date is required" });
      }

      // Use provided techId or default to current user
      const targetTechId = techId || user.id;
      const duration = parseInt(durationMinutes) || 60;
      const slotsNeeded = Math.ceil(duration / 30); // How many 30-min slots needed

      // Constants matching dispatch board (8am to 8pm)
      const START_HOUR = 8;
      const END_HOUR = 20;
      const STEP_MINUTES = 30;

      // Parse the date properly - add T00:00:00 to avoid UTC interpretation
      // date comes in as "2026-01-09", we need to treat it as local time
      const [year, month, day] = date.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day); // month is 0-indexed
      
      const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
      const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

      // Get existing work orders for this tech on this date
      const existingOrders = await db.select({
        scheduledStart: crmWorkOrders.scheduledStart,
        scheduledEnd: crmWorkOrders.scheduledEnd,
      })
      .from(crmWorkOrders)
      .where(and(
        eq(crmWorkOrders.assignedTechId, targetTechId),
        isNotNull(crmWorkOrders.scheduledStart),
        isNotNull(crmWorkOrders.scheduledEnd),
        gte(crmWorkOrders.scheduledStart, dayStart),
        lte(crmWorkOrders.scheduledStart, dayEnd),
        sql`${crmWorkOrders.status} NOT IN ('cancelled', 'completed')`
      ));

      // Build time slots
      const slots: Array<{ 
        start: string; 
        end: string; 
        label: string;
        available: boolean;
      }> = [];

      for (let hour = START_HOUR; hour < END_HOUR; hour++) {
        for (let minute = 0; minute < 60; minute += STEP_MINUTES) {
          const slotStart = new Date(targetDate);
          slotStart.setHours(hour, minute, 0, 0);
          
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + duration);

          // Don't show slots that would extend past business hours
          if (slotEnd.getHours() > END_HOUR || (slotEnd.getHours() === END_HOUR && slotEnd.getMinutes() > 0)) {
            continue;
          }

          // Check if this slot conflicts with any existing orders
          const hasConflict = existingOrders.some(order => {
            if (!order.scheduledStart || !order.scheduledEnd) return false;
            const orderStart = new Date(order.scheduledStart);
            const orderEnd = new Date(order.scheduledEnd);
            // Overlap: slotStart < orderEnd AND slotEnd > orderStart
            return slotStart < orderEnd && slotEnd > orderStart;
          });

          // Format time for display
          const formatTime = (d: Date) => {
            const h = d.getHours();
            const m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return m === 0 ? `${displayHour} ${ampm}` : `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
          };

          // Format as local time string (without Z suffix) so frontend interprets correctly
          const formatLocalISO = (d: Date) => {
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            const hr = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${yr}-${mo}-${dy}T${hr}:${mi}:00`;
          };

          slots.push({
            start: formatLocalISO(slotStart),
            end: formatLocalISO(slotEnd),
            label: `${formatTime(slotStart)} - ${formatTime(slotEnd)}`,
            available: !hasConflict,
          });
        }
      }

      return res.json({ slots, date: targetDate.toISOString().split('T')[0] });
    } catch (error) {
      console.error("Error fetching available slots:", error);
      return res.status(500).json({ message: "Failed to fetch available slots" });
    }
  });

  // POST /api/mobile/work-orders/:id/assign-to-me - Supervisor self-assign work order
  app.post("/api/mobile/work-orders/:id/assign-to-me", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Only supervisors can self-assign from mobile
      if (!isSupervisor(user.role)) {
        return res.status(403).json({ message: "Only supervisors can assign work orders to themselves" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      // Update the work order to assign to the supervisor
      const updatedWorkOrder = await storage.updateWorkOrder(workOrder.id, {
        assignedTechId: user.id,
      });

      await logCrmAudit(
        user.id,
        "work_order.self_assigned",
        "work_order",
        workOrder.id,
        { previousTechId: workOrder.assignedTechId, newTechId: user.id },
        req.ip
      );

      return res.json(updatedWorkOrder);
    } catch (error) {
      console.error("Error self-assigning work order:", error);
      return res.status(500).json({ message: "Failed to assign work order" });
    }
  });

  // PATCH /api/mobile/work-orders/:id - Supervisor edit their assigned work order
  app.patch("/api/mobile/work-orders/:id", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      // Only supervisors can edit work orders from mobile, and only their assigned ones
      if (!isSupervisor(user.role)) {
        return res.status(403).json({ message: "Only supervisors can edit work orders from mobile" });
      }

      if (workOrder.assignedTechId !== user.id) {
        return res.status(403).json({ message: "You can only edit work orders assigned to you" });
      }

      // Define allowed fields for supervisor mobile editing
      const allowedFieldsSchema = z.object({
        scheduledStart: z.union([z.string(), z.date(), z.null()]).optional(),
        scheduledEnd: z.union([z.string(), z.date(), z.null()]).optional(),
        priority: z.enum(["low", "normal", "high", "emergency"]).optional(),
        dispatchNotes: z.string().optional(),
        techNotes: z.string().optional(),
        visitType: z.string().optional(),
        workSubtype: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
      });

      const result = allowedFieldsSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid request body", 
          errors: result.error.flatten().fieldErrors 
        });
      }

      const updateData: Partial<InsertCrmWorkOrder> = {};
      
      // Handle datetime fields - convert local timezone strings to proper UTC dates
      if (result.data.scheduledStart !== undefined) {
        if (result.data.scheduledStart) {
          // Input is in local time format (e.g., "2026-01-06T10:00"), convert to UTC
          updateData.scheduledStart = fromZonedTime(result.data.scheduledStart, APP_TIMEZONE);
        } else {
          updateData.scheduledStart = null;
        }
      }
      if (result.data.scheduledEnd !== undefined) {
        if (result.data.scheduledEnd) {
          updateData.scheduledEnd = fromZonedTime(result.data.scheduledEnd, APP_TIMEZONE);
        } else {
          updateData.scheduledEnd = null;
        }
      }
      if (result.data.priority !== undefined) {
        updateData.priority = result.data.priority;
      }
      if (result.data.dispatchNotes !== undefined) {
        updateData.dispatchNotes = result.data.dispatchNotes;
      }
      if (result.data.techNotes !== undefined) {
        updateData.techNotes = result.data.techNotes;
      }
      if (result.data.visitType !== undefined) {
        updateData.visitType = result.data.visitType;
      }
      if (result.data.workSubtype !== undefined) {
        updateData.workSubtype = result.data.workSubtype;
      }
      if (result.data.title !== undefined) {
        updateData.title = result.data.title;
      }
      if (result.data.description !== undefined) {
        updateData.description = result.data.description;
      }

      const updatedWorkOrder = await storage.updateWorkOrder(workOrder.id, updateData);

      await logCrmAudit(
        user.id,
        "work_order.mobile_edited",
        "work_order",
        workOrder.id,
        { fields: Object.keys(updateData) },
        req.ip
      );

      return res.json(updatedWorkOrder);
    } catch (error) {
      console.error("Error editing work order from mobile:", error);
      return res.status(500).json({ message: "Failed to update work order" });
    }
  });

  // ============================================
  // MOBILE MAINTENANCE RENEWAL ENDPOINTS
  // ============================================

  // GET /api/mobile/work-orders/:id/renewal-info - Get renewal info for a work order
  // Also detects pay-on-visit agreements needing initial payment
  app.get("/api/mobile/work-orders/:id/renewal-info", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrderId = req.params.id;
      
      // Get work order details first
      const [workOrder] = await db.select()
        .from(crmWorkOrders)
        .where(eq(crmWorkOrders.id, workOrderId))
        .limit(1);
      
      if (!workOrder) {
        return res.json({
          isRenewalVisit: false,
          paymentType: null,
          renewalStatus: "none",
          agreementInfo: null,
          visitInfo: null
        });
      }
      
      // Check if this work order is linked to a maintenance visit
      const [visit] = await db.select()
        .from(maintenanceVisits)
        .where(eq(maintenanceVisits.workOrderId, workOrderId))
        .limit(1);
      
      // If no direct visit link, check if this is a MAINTENANCE type work order
      // and find an agreement by matching propertyId
      if (!visit) {
        // Only check for agreements if work order is maintenance type
        if (workOrder.visitType !== "MAINTENANCE") {
          return res.json({
            isRenewalVisit: false,
            paymentType: null,
            renewalStatus: "none",
            agreementInfo: null,
            visitInfo: null
          });
        }
        
        // Find pay-on-visit agreements for this property
        const [agreementByProperty] = await db.select()
          .from(crmAgreements)
          .where(
            and(
              eq(crmAgreements.propertyId, workOrder.propertyId!),
              eq(crmAgreements.billingPreference, "pay_on_visit"),
              or(
                eq(crmAgreements.status, "pending"),
                eq(crmAgreements.status, "active")
              )
            )
          )
          .orderBy(desc(crmAgreements.createdAt))
          .limit(1);
        
        if (!agreementByProperty) {
          return res.json({
            isRenewalVisit: false,
            paymentType: null,
            renewalStatus: "none",
            agreementInfo: null,
            visitInfo: null
          });
        }
        
        // Calculate visit info based on agreement settings
        const totalVisits = agreementByProperty.visitsPerPeriod || 2;
        
        // For pending agreements, it's always the first visit (activation)
        // For active agreements, count completed MAINTENANCE work orders for this property
        // since the agreement was activated to determine current visit number
        let currentVisitNumber = 1;
        let isLastVisit = false;
        
        if (agreementByProperty.status === "active") {
          // Count COMPLETED maintenance work orders for this property since activation
          // to determine current visit number (completed visits + 1)
          const startDate = agreementByProperty.activationDate 
            ? new Date(agreementByProperty.activationDate) 
            : new Date(agreementByProperty.startDate || agreementByProperty.createdAt || '2020-01-01');
          
          // Count only COMPLETED maintenance work orders EXCLUDING the current one
          // This ensures the visit number stays correct even when viewing a completed work order
          const completedOrders = await db.select({ count: count() })
            .from(crmWorkOrders)
            .where(
              and(
                eq(crmWorkOrders.propertyId, workOrder.propertyId!),
                eq(crmWorkOrders.visitType, "MAINTENANCE"),
                eq(crmWorkOrders.status, "completed"),
                gte(crmWorkOrders.createdAt, startDate),
                sql`${crmWorkOrders.id} != ${workOrderId}` // Exclude current work order
              )
            );
          
          const completedCount = Number(completedOrders[0]?.count || 0);
          // Current visit = completed visits (before this one) + 1, cycling through totalVisits
          // e.g., 0 completed before = visit 1, 1 completed before = visit 2, 2 completed before = visit 1 (new cycle)
          currentVisitNumber = (completedCount % totalVisits) + 1;
          isLastVisit = currentVisitNumber === totalVisits;
          console.log(`[RenewalInfo] Property ${workOrder.propertyId}: completedCount=${completedCount}, currentVisitNumber=${currentVisitNumber}, totalVisits=${totalVisits}, isLastVisit=${isLastVisit}, agreementStatus=${agreementByProperty.status}`);
        }
        
        // Determine payment type
        let paymentType: "initial" | "renewal" | null = null;
        let renewalStatus = "none";
        
        if (agreementByProperty.status === "pending" && agreementByProperty.isInitialCycle) {
          paymentType = "initial";
          renewalStatus = "pending";
        } else if (agreementByProperty.status === "active" && isLastVisit) {
          paymentType = "renewal";
          renewalStatus = "pending";
        }
        
        return res.json({
          isRenewalVisit: paymentType !== null,
          paymentType,
          renewalStatus,
          agreementInfo: {
            id: agreementByProperty.id,
            agreementNumber: agreementByProperty.agreementNumber,
            price: agreementByProperty.price,
            customerName: agreementByProperty.customerName,
            billingPreference: agreementByProperty.billingPreference,
            status: agreementByProperty.status,
            agreementPlan: agreementByProperty.agreementPlan
          },
          visitInfo: {
            visitNumber: currentVisitNumber,
            totalVisitsInCycle: totalVisits,
            targetDate: null,
            isRenewalTrigger: isLastVisit
          }
        });
      }
      
      // Get agreement info
      const [agreement] = await db.select()
        .from(crmAgreements)
        .where(eq(crmAgreements.id, visit.agreementId))
        .limit(1);
      
      if (!agreement) {
        return res.json({
          isRenewalVisit: false,
          paymentType: null,
          renewalStatus: "none",
          agreementInfo: null,
          visitInfo: {
            visitNumber: visit.visitNumber,
            totalVisitsInCycle: visit.totalVisitsInCycle,
            targetDate: visit.targetDate
          }
        });
      }
      
      // Determine if payment is needed
      let isRenewalVisit = false;
      let paymentType: "initial" | "renewal" | null = null;
      let renewalStatus = visit.renewalStatus || "none";
      
      // Check if this is a pay-on-visit agreement in pending status (needs initial payment)
      if (agreement.billingPreference === "pay_on_visit" && 
          agreement.status === "pending" && 
          agreement.isInitialCycle) {
        isRenewalVisit = true;
        paymentType = "initial";
        // If renewalStatus is "none" (default), treat as "pending" so the UI shows the payment prompt
        renewalStatus = visit.renewalStatus === "none" ? "pending" : visit.renewalStatus;
      }
      // Check if this is a renewal trigger visit for pay-on-visit
      else if (visit.isRenewalTrigger && agreement.billingPreference === "pay_on_visit") {
        isRenewalVisit = true;
        paymentType = "renewal";
      }
      
      return res.json({
        isRenewalVisit,
        paymentType,
        renewalStatus,
        agreementInfo: {
          id: agreement.id,
          agreementNumber: agreement.agreementNumber,
          price: agreement.price,
          customerName: agreement.customerName,
          billingPreference: agreement.billingPreference,
          status: agreement.status,
          agreementPlan: agreement.agreementPlan
        },
        visitInfo: {
          visitNumber: visit.visitNumber,
          totalVisitsInCycle: visit.totalVisitsInCycle,
          targetDate: visit.targetDate,
          isRenewalTrigger: visit.isRenewalTrigger
        }
      });
    } catch (error) {
      console.error("Error fetching renewal info:", error);
      return res.status(500).json({ message: "Failed to fetch renewal info" });
    }
  });

  // POST /api/mobile/work-orders/:id/collect-renewal - Collect renewal or initial payment
  // Handles both renewal payments (isRenewalTrigger visits) and initial payments (pay-on-visit pending agreements)
  app.post("/api/mobile/work-orders/:id/collect-renewal", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrderId = req.params.id;
      const { paymentType } = req.body; // "initial" or "renewal"
      
      // Get the work order
      const [workOrder] = await db.select().from(crmWorkOrders).where(eq(crmWorkOrders.id, workOrderId));
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      
      // First check if this is an initial payment for a pay-on-visit agreement
      const [anyVisit] = await db.select()
        .from(maintenanceVisits)
        .where(eq(maintenanceVisits.workOrderId, workOrderId))
        .limit(1);
      
      if (anyVisit && paymentType === "initial") {
        const [agreement] = await db.select()
          .from(crmAgreements)
          .where(eq(crmAgreements.id, anyVisit.agreementId))
          .limit(1);
        
        if (agreement && 
            agreement.billingPreference === "pay_on_visit" && 
            agreement.status === "pending" && 
            agreement.isInitialCycle) {
          
          // Check if invoice already created for this visit
          if (anyVisit.renewalInvoiceId) {
            return res.status(400).json({ message: "Invoice already created for this visit. Please complete or void the existing invoice." });
          }
          
          // Create invoice for initial payment
          const invoiceNumber = await generateInvoiceNumber();
          const paymentAmount = String(agreement.price || "0");
          
          const invoiceToCreate = {
            invoiceNumber,
            workOrderId: workOrderId,
            customerId: workOrder.customerId,
            propertyId: workOrder.propertyId,
            agreementId: agreement.id,
            status: "draft" as const,
            subtotal: paymentAmount,
            total: paymentAmount,
            amountPaid: "0",
            balanceDue: paymentAmount,
            createdBy: user.id,
            notes: `Maintenance Agreement Initial Payment - ${agreement.agreementNumber}`,
          };
          
          const parseResult = insertCrmInvoiceSchema.safeParse(invoiceToCreate);
          if (!parseResult.success) {
            return res.status(400).json({ 
              message: "Failed to create invoice", 
              errors: parseResult.error.errors 
            });
          }
          
          const [invoice] = await db.insert(crmInvoices).values(parseResult.data).returning();
          
          // Add line item
          const lineItem = {
            invoiceId: invoice.id,
            description: `Maintenance Agreement - ${agreement.agreementPlan || "Service Plan"} (Year 1)`,
            quantity: "1",
            unitPrice: paymentAmount,
            lineTotal: paymentAmount,
          };
          await db.insert(crmInvoiceLineItems).values(lineItem);
          
          // Update the visit with the invoice ID and pending_payment status
          await db.update(maintenanceVisits)
            .set({ 
              renewalInvoiceId: invoice.id, 
              renewalStatus: "pending_payment" as const, 
              updatedAt: new Date() 
            })
            .where(eq(maintenanceVisits.id, anyVisit.id));
          
          await logCrmAudit(
            user.id,
            "agreement.initial_payment_invoice_created",
            "maintenance_visit",
            anyVisit.id,
            { invoiceId: invoice.id, agreementId: agreement.id, amount: paymentAmount },
            req.ip
          );
          
          return res.status(201).json({ ...invoice, paymentType: "initial" });
        }
      }
      
      // Fall back to renewal trigger visit logic
      const [visit] = await db.select()
        .from(maintenanceVisits)
        .where(and(
          eq(maintenanceVisits.workOrderId, workOrderId),
          eq(maintenanceVisits.isRenewalTrigger, true)
        ))
        .limit(1);
      
      if (!visit) {
        // FALLBACK: For manual MAINTENANCE work orders without a maintenanceVisits link,
        // try to find a pay-on-visit agreement by property match
        if (workOrder.propertyId && workOrder.visitType === "MAINTENANCE") {
          const [agreementByProperty] = await db.select()
            .from(crmAgreements)
            .where(and(
              eq(crmAgreements.propertyId, workOrder.propertyId),
              eq(crmAgreements.billingPreference, "pay_on_visit"),
              or(
                eq(crmAgreements.status, "pending"),
                eq(crmAgreements.status, "active")
              )
            ))
            .limit(1);
          
          if (agreementByProperty) {
            // Handle initial payment for pending agreements
            if (agreementByProperty.status === "pending" && paymentType === "initial") {
              // Create invoice for initial payment
              const invoiceNumber = await generateInvoiceNumber();
              const paymentAmount = String(agreementByProperty.price || "0");
              
              const invoiceToCreate = {
                invoiceNumber,
                workOrderId: workOrderId,
                customerId: workOrder.customerId,
                propertyId: workOrder.propertyId,
                agreementId: agreementByProperty.id,
                status: "draft" as const,
                subtotal: paymentAmount,
                total: paymentAmount,
                amountPaid: "0",
                balanceDue: paymentAmount,
                createdBy: user.id,
                notes: `Maintenance Agreement Initial Payment - ${agreementByProperty.agreementNumber}`,
              };
              
              const parseResult = insertCrmInvoiceSchema.safeParse(invoiceToCreate);
              if (!parseResult.success) {
                return res.status(400).json({ 
                  message: "Failed to create invoice", 
                  errors: parseResult.error.errors 
                });
              }
              
              const [invoice] = await db.insert(crmInvoices).values(parseResult.data).returning();
              
              // Add line item
              const lineItem = {
                invoiceId: invoice.id,
                description: `Maintenance Agreement - ${agreementByProperty.agreementPlan || "Service Plan"} (Year 1)`,
                quantity: "1",
                unitPrice: paymentAmount,
                lineTotal: paymentAmount,
              };
              await db.insert(crmInvoiceLineItems).values(lineItem);
              
              await logCrmAudit(
                user.id,
                "agreement.initial_payment_invoice_created_via_property",
                "agreement",
                agreementByProperty.id,
                { invoiceId: invoice.id, workOrderId, amount: paymentAmount },
                req.ip
              );
              
              return res.status(201).json({ ...invoice, paymentType: "initial" });
            }
            
            // Handle renewal payment for active agreements
            if (agreementByProperty.status === "active" && paymentType === "renewal") {
              // Create invoice for renewal amount
              const invoiceNumber = await generateInvoiceNumber();
              const renewalAmount = String(agreementByProperty.price || "0");
              
              const invoiceToCreate = {
                invoiceNumber,
                workOrderId: workOrderId,
                customerId: workOrder.customerId,
                propertyId: workOrder.propertyId,
                agreementId: agreementByProperty.id,
                status: "draft" as const,
                subtotal: renewalAmount,
                total: renewalAmount,
                amountPaid: "0",
                balanceDue: renewalAmount,
                createdBy: user.id,
                notes: `Maintenance Agreement Renewal - ${agreementByProperty.agreementNumber}`,
              };
              
              const parseResult = insertCrmInvoiceSchema.safeParse(invoiceToCreate);
              if (!parseResult.success) {
                return res.status(400).json({ 
                  message: "Failed to create invoice", 
                  errors: parseResult.error.errors 
                });
              }
              
              const [invoice] = await db.insert(crmInvoices).values(parseResult.data).returning();
              
              // Add line item for the renewal
              const lineItem = {
                invoiceId: invoice.id,
                description: `Maintenance Agreement Renewal - ${agreementByProperty.agreementPlan || "Service Plan"}`,
                quantity: "1",
                unitPrice: renewalAmount,
                lineTotal: renewalAmount,
              };
              await db.insert(crmInvoiceLineItems).values(lineItem);
              
              await logCrmAudit(
                user.id,
                "agreement.renewal_invoice_created_via_property",
                "agreement",
                agreementByProperty.id,
                { invoiceId: invoice.id, workOrderId, amount: renewalAmount },
                req.ip
              );
              
              return res.status(201).json({ ...invoice, paymentType: "renewal" });
            }
          }
        }
        
        return res.status(400).json({ message: "This work order is not a renewal visit" });
      }
      
      if (visit.renewalStatus === "collected") {
        return res.status(400).json({ message: "Renewal payment already collected" });
      }
      if (visit.renewalStatus === "declined") {
        return res.status(400).json({ message: "Renewal was already declined" });
      }
      // Prevent duplicate invoice creation - if renewalInvoiceId is set, invoice already created
      if (visit.renewalInvoiceId) {
        return res.status(400).json({ message: "Renewal invoice already created. Please complete or void the existing invoice before creating another." });
      }
      
      // Get the agreement
      const [agreement] = await db.select()
        .from(crmAgreements)
        .where(eq(crmAgreements.id, visit.agreementId))
        .limit(1);
      
      if (!agreement) {
        return res.status(404).json({ message: "Agreement not found" });
      }
      
      // Check if agreement allows renewal
      if (agreement.autoRenew === false) {
        return res.status(400).json({ message: "This agreement is not set to auto-renew. Cannot collect renewal payment." });
      }
      
      // Create invoice for renewal amount
      const invoiceNumber = await generateInvoiceNumber();
      const renewalAmount = String(agreement.price || "0");
      
      const invoiceToCreate = {
        invoiceNumber,
        workOrderId: workOrderId,
        customerId: workOrder.customerId,
        propertyId: workOrder.propertyId,
        agreementId: agreement.id,
        status: "draft" as const,
        subtotal: renewalAmount,
        total: renewalAmount,
        amountPaid: "0",
        balanceDue: renewalAmount,
        createdBy: user.id,
        notes: `Maintenance Agreement Renewal - ${agreement.agreementNumber}`,
      };
      
      const parseResult = insertCrmInvoiceSchema.safeParse(invoiceToCreate);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Failed to create invoice", 
          errors: parseResult.error.errors 
        });
      }
      
      const [invoice] = await db.insert(crmInvoices).values(parseResult.data).returning();
      
      // Add line item for the renewal
      const lineItem = {
        invoiceId: invoice.id,
        description: `Maintenance Agreement Renewal - ${agreement.agreementPlan}`,
        quantity: "1",
        unitPrice: renewalAmount,
        lineTotal: renewalAmount,
      };
      await db.insert(crmInvoiceLineItems).values(lineItem);
      
      // Update the visit with the renewal invoice ID and set status to pending_payment
      // The invoice-paid handler will flip renewalStatus to "collected" when payment settles
      await db.update(maintenanceVisits)
        .set({ renewalInvoiceId: invoice.id, renewalStatus: "pending_payment" as const, updatedAt: new Date() })
        .where(eq(maintenanceVisits.id, visit.id));
      
      await logCrmAudit(
        user.id,
        "renewal.invoice_created",
        "maintenance_visit",
        visit.id,
        { invoiceId: invoice.id, agreementId: agreement.id, amount: renewalAmount, status: "pending_payment" },
        req.ip
      );
      
      return res.status(201).json({ ...invoice, paymentType: "renewal" });
    } catch (error) {
      console.error("Error collecting renewal:", error);
      return res.status(500).json({ message: "Failed to collect renewal" });
    }
  });

  // POST /api/mobile/work-orders/:id/decline-renewal - Decline renewal
  app.post("/api/mobile/work-orders/:id/decline-renewal", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrderId = req.params.id;
      
      // Find the renewal trigger visit for this work order
      const [visit] = await db.select()
        .from(maintenanceVisits)
        .where(and(
          eq(maintenanceVisits.workOrderId, workOrderId),
          eq(maintenanceVisits.isRenewalTrigger, true)
        ))
        .limit(1);
      
      if (!visit) {
        return res.status(400).json({ message: "This work order is not a renewal visit" });
      }
      
      if (visit.renewalStatus === "collected") {
        return res.status(400).json({ message: "Renewal has already been collected" });
      }
      
      if (visit.renewalStatus === "declined") {
        return res.status(400).json({ message: "Renewal has already been declined" });
      }
      
      // Update maintenance visit renewal status to declined
      await db.update(maintenanceVisits)
        .set({
          renewalStatus: "declined",
          updatedAt: new Date()
        })
        .where(eq(maintenanceVisits.id, visit.id));
      
      // Update agreement status to expired
      await db.update(crmAgreements)
        .set({
          status: "expired",
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(crmAgreements.id, visit.agreementId));
      
      await logCrmAudit(
        user.id,
        "renewal.declined",
        "maintenance_visit",
        visit.id,
        { agreementId: visit.agreementId },
        req.ip
      );
      
      return res.json({ success: true, message: "Renewal declined, agreement expired" });
    } catch (error) {
      console.error("Error declining renewal:", error);
      return res.status(500).json({ message: "Failed to decline renewal" });
    }
  });

  // POST /api/mobile/work-orders/:workOrderId/create-agreement - Create maintenance agreement from mobile invoice tab
  app.post("/api/mobile/work-orders/:workOrderId/create-agreement", requireCrmTechOrAbove, async (req, res) => {
    try {
      const user = await getCurrentCrmUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workOrderId = req.params.workOrderId;
      const { numberOfSystems, contractDate, startDate, billingPreference, autoRenew, notes, payingNow } = req.body;

      // Validate required fields (startDate is now optional - defaults to contractDate + 1 month)
      if (!numberOfSystems || !contractDate || !billingPreference) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Get the work order with customer and property info
      const [workOrder] = await db.select()
        .from(crmWorkOrders)
        .where(eq(crmWorkOrders.id, workOrderId))
        .limit(1);

      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }

      // Fetch customer info for required fields
      const [customer] = await db.select()
        .from(crmCustomers)
        .where(eq(crmCustomers.id, workOrder.customerId))
        .limit(1);

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Fetch property info if available
      const [property] = workOrder.propertyId ? await db.select()
        .from(crmProperties)
        .where(eq(crmProperties.id, workOrder.propertyId))
        .limit(1) : [null];

      // Calculate price: $229 for first system, -$10 for each additional
      let totalPrice = 0;
      for (let i = 0; i < numberOfSystems; i++) {
        totalPrice += 229 - (10 * i);
      }

      // Parse dates - startDate defaults to contractDate + 1 month if not provided
      const parsedContractDate = new Date(contractDate);
      const parsedStartDate = startDate 
        ? new Date(startDate) 
        : new Date(parsedContractDate.getFullYear(), parsedContractDate.getMonth() + 1, parsedContractDate.getDate());
      const endDate = new Date(parsedStartDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      const nextServiceDate = new Date(parsedStartDate);
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 1);

      // Generate agreement number
      const agreementNumber = `AGR-${Date.now()}`;

      // Build service address from property
      const serviceAddress = property 
        ? [property.address1, property.city, property.state, property.zip].filter(Boolean).join(", ") 
        : null;

      // Create the agreement
      const agreementId = nanoid();
      const agreementData = {
        id: agreementId,
        agreementNumber,
        customerId: workOrder.customerId,
        customerName: customer.name,
        serviceAddress,
        propertyId: workOrder.propertyId,
        agreementPlan: "Preventative Maintenance",
        numberOfSystems,
        agreementValue: totalPrice.toFixed(2),
        frequency: "annual",
        visitsPerPeriod: 2,
        billingPreference,
        contractDate: parsedContractDate,
        startDate: parsedStartDate,
        endDate,
        nextServiceDate,
        nextInvoiceDate: parsedStartDate,
        autoRenew: autoRenew ?? true,
        status: payingNow ? "active" : "pending",
        isActive: payingNow ?? false,
        activationDate: payingNow ? new Date() : null,
        isInitialCycle: !payingNow,
        notes: notes || null,
        sourceWorkOrderId: workOrderId,
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(crmAgreements).values(agreementData);

      // Log agreement creation
      await logCrmAudit(
        user.id,
        "agreement.created",
        "crm_agreement",
        agreementId,
        { workOrderId, numberOfSystems, price: totalPrice, payingNow, billingPreference },
        req.ip
      );

      // If paying now, create invoice and mark as paid
      if (payingNow) {
        const invoiceNumber = `INV-${Date.now()}`;
        const invoiceId = nanoid();
        
        // Create invoice
        const invoice = {
          id: invoiceId,
          invoiceNumber,
          workOrderId,
          customerId: workOrder.customerId,
          propertyId: workOrder.propertyId,
          customerName: customer?.name || "Unknown Customer",
          customerEmail: customer?.email || null,
          customerPhone: customer?.phone || null,
          serviceAddress: property ? [property.address1, property.city, property.state, property.zip].filter(Boolean).join(", ") : null,
          subtotal: totalPrice.toFixed(2),
          laborTotal: "0.00",
          taxTotal: "0.00",
          total: totalPrice.toFixed(2),
          amountPaid: totalPrice.toFixed(2),
          balanceDue: "0.00",
          status: "paid",
          paidDate: new Date(),
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(crmInvoices).values(invoice);

        // Create line item for the invoice
        const lineItemId = nanoid();
        const lineItem = {
          id: lineItemId,
          invoiceId,
          description: `Preventative Maintenance Agreement (${numberOfSystems} system${numberOfSystems > 1 ? 's' : ''})`,
          quantity: 1,
          unitPrice: totalPrice.toFixed(2),
          total: totalPrice.toFixed(2),
          lineType: "maintenance" as const,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(crmInvoiceLineItems).values(lineItem);

        // Update agreement to mark as activated
        await db.update(crmAgreements)
          .set({
            isInitialCycle: false,
            activationDate: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(crmAgreements.id, agreementId));

        await logCrmAudit(
          user.id,
          "agreement.activated",
          "crm_agreement",
          agreementId,
          { invoiceId, amount: totalPrice },
          req.ip
        );

        return res.status(201).json({
          success: true,
          payingNow: true,
          agreement: agreementData,
          invoice,
        });
      } else {
        // Not paying now - return line item data for frontend to add to invoice
        const lineItemData = {
          description: `Preventative Maintenance Agreement (${numberOfSystems} system${numberOfSystems > 1 ? 's' : ''})`,
          unitPrice: totalPrice.toFixed(2),
          quantity: 1,
          lineType: "maintenance",
        };

        return res.status(201).json({
          success: true,
          payingNow: false,
          agreement: agreementData,
          lineItemData,
        });
      }
    } catch (error) {
      console.error("Error creating agreement:", error);
      return res.status(500).json({ message: "Failed to create agreement" });
    }
  });

  // ============================================================================
  // Bouncie Fleet Tracking API
  // ============================================================================

  // GET /api/bouncie/status - Return Bouncie connection status
  app.get("/api/bouncie/status", async (req, res) => {
    try {
      const { bouncieService } = await import("./services/bouncieService");
      
      const configured = bouncieService.isConfigured();
      const hasApiKey = bouncieService.hasApiKey();
      const connected = await bouncieService.isConnected();
      const settings = await bouncieService.getSettings();

      return res.json({ 
        configured,
        connected,
        hasApiKey,
        lastSync: settings?.lastSyncAt?.toISOString() ?? null,
        connectedAt: settings?.connectedAt?.toISOString() ?? null,
      });
    } catch (error) {
      console.error("Error fetching Bouncie status:", error);
      return res.status(500).json({ message: "Failed to fetch Bouncie status" });
    }
  });

  // GET /api/bouncie/connect - Redirect to Bouncie OAuth authorization
  app.get("/api/bouncie/connect", async (req, res) => {
    try {
      const { bouncieService } = await import("./services/bouncieService");
      
      if (!bouncieService.isConfigured()) {
        return res.status(400).json({ message: "Bouncie credentials not configured" });
      }

      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const redirectUri = `${protocol}://${host}/api/bouncie/callback`;
      
      const authUrl = bouncieService.getAuthorizationUrl(redirectUri, "crm-connect");
      return res.redirect(authUrl);
    } catch (error) {
      console.error("Error initiating Bouncie connection:", error);
      return res.status(500).json({ message: "Failed to initiate Bouncie connection" });
    }
  });

  // GET /api/bouncie/callback - Handle OAuth callback from Bouncie
  app.get("/api/bouncie/callback", async (req, res) => {
    try {
      const { bouncieService } = await import("./services/bouncieService");
      const { code, state, error: authError } = req.query;

      if (authError) {
        console.error("Bouncie OAuth error:", authError);
        return res.redirect("/crm/settings/fleet?error=auth_denied");
      }

      if (!code || typeof code !== "string") {
        return res.redirect("/crm/settings/fleet?error=no_code");
      }

      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const redirectUri = `${protocol}://${host}/api/bouncie/callback`;

      const tokenResponse = await bouncieService.exchangeCodeForToken(code, redirectUri);

      const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
      
      await bouncieService.saveSettings({
        authorizationCode: code,
        accessToken: tokenResponse.access_token,
        tokenExpiresAt,
        connectedAt: new Date(),
      });

      return res.redirect("/crm/settings/fleet?success=connected");
    } catch (error) {
      console.error("Error handling Bouncie callback:", error);
      return res.redirect("/crm/settings/fleet?error=token_exchange_failed");
    }
  });

  // POST /api/bouncie/disconnect - Disconnect from Bouncie
  app.post("/api/bouncie/disconnect", async (req, res) => {
    try {
      const { bouncieService } = await import("./services/bouncieService");
      await bouncieService.disconnect();
      return res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Bouncie:", error);
      return res.status(500).json({ message: "Failed to disconnect from Bouncie" });
    }
  });

  // POST /api/bouncie/connect-with-code - Connect using authorization code from developer portal
  app.post("/api/bouncie/connect-with-code", async (req, res) => {
    try {
      const { bouncieService } = await import("./services/bouncieService");
      const { authorizationCode } = req.body;

      if (!authorizationCode) {
        return res.status(400).json({ message: "Authorization code is required" });
      }

      if (!bouncieService.isConfigured()) {
        return res.status(400).json({ message: "Bouncie credentials not configured" });
      }

      // Build the redirect URI - must match what's registered in Bouncie Developer Portal
      const host = req.headers.host || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const redirectUri = `${protocol}://${host}/api/bouncie/callback`;

      const tokenResponse = await bouncieService.exchangeCodeForToken(authorizationCode, redirectUri);

      const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
      
      await bouncieService.saveSettings({
        authorizationCode,
        accessToken: tokenResponse.access_token,
        tokenExpiresAt,
        connectedAt: new Date(),
      });

      return res.json({ success: true, message: "Successfully connected to Bouncie" });
    } catch (error: any) {
      console.error("Error connecting with code:", error);
      return res.status(500).json({ message: error.message || "Failed to connect with authorization code" });
    }
  });

  // POST /api/bouncie/sync - Sync vehicles from Bouncie
  app.post("/api/bouncie/sync", async (req, res) => {
    try {
      const { bouncieService } = await import("./services/bouncieService");
      
      const connected = await bouncieService.isConnected();
      if (!connected) {
        return res.status(400).json({ message: "Not connected to Bouncie. Please connect first." });
      }

      const result = await bouncieService.syncVehicles();
      return res.json({ 
        success: true, 
        message: `Synced ${result.total} vehicles (${result.created} new, ${result.updated} updated)`,
        ...result,
      });
    } catch (error: any) {
      console.error("Error syncing Bouncie vehicles:", error);
      return res.status(500).json({ message: error.message || "Failed to sync vehicles" });
    }
  });

  // POST /api/bouncie/refresh-locations - Refresh vehicle locations
  app.post("/api/bouncie/refresh-locations", async (req, res) => {
    try {
      const { bouncieService } = await import("./services/bouncieService");
      await bouncieService.refreshLocations();
      return res.json({ success: true });
    } catch (error) {
      console.error("Error refreshing locations:", error);
      return res.status(500).json({ message: "Failed to refresh locations" });
    }
  });

  // GET /api/bouncie/vehicles - List all vehicles
  app.get("/api/bouncie/vehicles", async (req, res) => {
    try {
      const vehicles = await db.select().from(bouncieVehicles).orderBy(asc(bouncieVehicles.createdAt));
      return res.json(vehicles);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      return res.status(500).json({ message: "Failed to fetch vehicles" });
    }
  });

  // POST /api/bouncie/vehicles - Create a new vehicle
  app.post("/api/bouncie/vehicles", async (req, res) => {
    try {
      const body = req.body;

      // Validate required fields
      if (!body.vehicleName) {
        return res.status(400).json({ message: "vehicleName is required" });
      }

      // Parse and validate body with schema
      const parsed = insertBouncieVehicleSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid vehicle data", errors: parsed.error.flatten() });
      }

      // Create vehicle
      const [vehicle] = await db.insert(bouncieVehicles).values(parsed.data).returning();

      return res.status(201).json(vehicle);
    } catch (error) {
      console.error("Error creating vehicle:", error);
      return res.status(500).json({ message: "Failed to create vehicle" });
    }
  });

  // PATCH /api/bouncie/vehicles/:id - Update a vehicle
  app.patch("/api/bouncie/vehicles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body;

      // Verify vehicle exists
      const [existing] = await db.select().from(bouncieVehicles).where(eq(bouncieVehicles.id, id));
      if (!existing) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // Parse and validate update data (use partial schema validation)
      const updateData = insertBouncieVehicleSchema.partial().safeParse(body);
      if (!updateData.success) {
        return res.status(400).json({ message: "Invalid vehicle data", errors: updateData.error.flatten() });
      }

      // Update vehicle with updatedAt timestamp
      const [updated] = await db.update(bouncieVehicles)
        .set({
          ...updateData.data,
          updatedAt: new Date(),
        })
        .where(eq(bouncieVehicles.id, id))
        .returning();

      return res.json(updated);
    } catch (error) {
      console.error("Error updating vehicle:", error);
      return res.status(500).json({ message: "Failed to update vehicle" });
    }
  });

  // DELETE /api/bouncie/vehicles/:id - Delete a vehicle
  app.delete("/api/bouncie/vehicles/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // Verify vehicle exists before deletion
      const [existing] = await db.select().from(bouncieVehicles).where(eq(bouncieVehicles.id, id));
      if (!existing) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // Delete vehicle
      await db.delete(bouncieVehicles).where(eq(bouncieVehicles.id, id));

      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      return res.status(500).json({ message: "Failed to delete vehicle" });
    }
  });

  // POST /api/bouncie/vehicles/:id/assign - Assign vehicle to technician
  app.post("/api/bouncie/vehicles/:id/assign", async (req, res) => {
    try {
      const { id } = req.params;
      const { technicianId } = req.body;

      // Verify vehicle exists
      const [existing] = await db.select().from(bouncieVehicles).where(eq(bouncieVehicles.id, id));
      if (!existing) {
        return res.status(404).json({ message: "Vehicle not found" });
      }

      // If technicianId is provided, verify technician exists
      if (technicianId) {
        const [technician] = await db.select().from(crmUsers).where(eq(crmUsers.id, technicianId));
        if (!technician) {
          return res.status(404).json({ message: "Technician not found" });
        }
      }

      // Update vehicle with new technician assignment
      const [updated] = await db.update(bouncieVehicles)
        .set({
          technicianId: technicianId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(bouncieVehicles.id, id))
        .returning();

      return res.json(updated);
    } catch (error) {
      console.error("Error assigning vehicle:", error);
      return res.status(500).json({ message: "Failed to assign vehicle" });
    }
  });

  // ============================================================================
  // Public Invoice Payment Link Tracking
  // ============================================================================
  
  // Track click on invoice payment link and redirect to Stripe
  app.get("/api/public/invoice/:invoiceId/pay", async (req, res) => {
    try {
      const { invoiceId } = req.params;
      
      // Get the invoice
      const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, invoiceId));
      if (!invoice) {
        return res.status(404).send("Invoice not found");
      }
      
      // Check if invoice has a stored Stripe payment link URL
      // For legacy invoices without stored URL, show a friendly error
      if (!invoice.stripePaymentLinkUrl) {
        // If the invoice has a stripePaymentLinkId, the admin can regenerate the link
        if (invoice.stripePaymentLinkId) {
          console.log(`[InvoicePaymentClick] Invoice ${invoice.invoiceNumber} has legacy payment link ID but no URL stored`);
        }
        return res.status(400).send("Payment link expired or not available. Please contact us for a new payment link.");
      }
      
      // Track the click - increment payment link click count and update last clicked timestamp
      const now = new Date();
      const currentClickCount = invoice.paymentLinkClickCount || 0;
      
      await db.update(crmInvoices)
        .set({
          paymentLinkClickCount: currentClickCount + 1,
          lastPaymentLinkClickedAt: now,
          updatedAt: now,
        })
        .where(eq(crmInvoices.id, invoiceId));
      
      // Log the click event in invoice email logs for activity history
      await db.insert(invoiceEmailLogs).values({
        invoiceId: invoice.id,
        direction: "system",
        fromEmail: "system",
        recipientEmail: "system@tracking",
        recipientName: "Customer",
        subject: `Payment Link Clicked - Invoice ${invoice.invoiceNumber}`,
        textContent: `Customer clicked the payment link (click #${currentClickCount + 1})`,
        status: "sent",
        isManual: false,
        personalMessage: JSON.stringify({
          eventType: "payment_link_clicked",
          clickCount: currentClickCount + 1,
          clickedAt: now.toISOString(),
        }),
      });
      
      console.log(`[InvoicePaymentClick] Invoice ${invoice.invoiceNumber} payment link clicked (click #${currentClickCount + 1})`);
      
      // Redirect to the Stripe payment link
      res.redirect(invoice.stripePaymentLinkUrl);
    } catch (error) {
      console.error("Error tracking invoice payment link click:", error);
      res.status(500).send("An error occurred");
    }
  });
  
  // ============================================================================
  // App Settings API - Financing Link
  // ============================================================================
  
  // Get financing link (public endpoint for quote presentation)
  app.get("/api/public/financing-link", async (req, res) => {
    try {
      const [setting] = await db.select()
        .from(appSettings)
        .where(eq(appSettings.key, "financing_link"))
        .limit(1);
      
      res.json({
        financingLink: setting?.value || DEFAULT_FINANCING_LINK,
        isDefault: !setting?.value
      });
    } catch (error) {
      console.error("Error fetching financing link:", error);
      res.json({ financingLink: DEFAULT_FINANCING_LINK, isDefault: true });
    }
  });
  
  // Update financing link (requires admin auth)
  app.put("/api/app-settings/financing-link", requireCrmAdmin, async (req, res) => {
    try {
      const { financingLink } = req.body;
      
      if (!financingLink || typeof financingLink !== 'string') {
        return res.status(400).json({ message: "Invalid financing link" });
      }
      
      // Validate URL format
      try {
        new URL(financingLink);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }
      
      // Upsert the setting
      await db.insert(appSettings)
        .values({
          key: "financing_link",
          value: financingLink,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: financingLink,
            updatedAt: new Date()
          }
        });
      
      res.json({ success: true, financingLink });
    } catch (error) {
      console.error("Error updating financing link:", error);
      res.status(500).json({ message: "Failed to update financing link" });
    }
  });
  
  // Reset financing link to default (requires admin auth)
  app.delete("/api/app-settings/financing-link", requireCrmAdmin, async (req, res) => {
    try {
      await db.delete(appSettings)
        .where(eq(appSettings.key, "financing_link"));
      
      res.json({ success: true, financingLink: DEFAULT_FINANCING_LINK });
    } catch (error) {
      console.error("Error resetting financing link:", error);
      res.status(500).json({ message: "Failed to reset financing link" });
    }
  });

  // ============================================================================
  // Public Online Booking API
  // ============================================================================

  // POST /api/public/book - Submit online booking (creates work order in NeedsScheduling queue)
  app.post("/api/public/book", async (req, res) => {
    try {
      const {
        zipCode,
        serviceType,
        problems,
        systemType,
        projectType,
        timeline,
        selectedDate,
        selectedTimeSlot,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        notes,
      } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !phone || !address || !city) {
        return res.status(400).json({ message: "Missing required customer information" });
      }

      if (!selectedDate || !selectedTimeSlot) {
        return res.status(400).json({ message: "Please select a date and time" });
      }

      // Normalize inputs for duplicate check
      const cleanPhoneForCheck = phone.replace(/\D/g, '').slice(-10);
      const normalizedEmail = email.trim().toLowerCase();

      // Check for duplicate bookings within last 24 hours from same phone or email
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const recentBookings = await db.select()
        .from(crmWorkOrders)
        .where(
          and(
            eq(crmWorkOrders.bookingSource, "online"),
            gte(crmWorkOrders.createdAt, oneDayAgo)
          )
        );

      // Check if any recent booking matches this phone or email
      for (const booking of recentBookings) {
        if (booking.customerId) {
          const [customer] = await db.select()
            .from(crmCustomers)
            .where(eq(crmCustomers.id, booking.customerId));
          
          if (customer) {
            // Check phone match (normalized to last 10 digits)
            const customerPhone = (customer.phone || "").replace(/\D/g, '').slice(-10);
            const phoneMatch = cleanPhoneForCheck.length >= 10 && customerPhone.length >= 10 && 
                               cleanPhoneForCheck === customerPhone;
            
            // Check email match (case-insensitive, trimmed)
            const customerEmail = (customer.email || "").trim().toLowerCase();
            const emailMatch = normalizedEmail && customerEmail && normalizedEmail === customerEmail;
            
            if (phoneMatch || emailMatch) {
              return res.status(400).json({ 
                message: "You already have a booking request pending. We'll contact you soon to schedule your appointment.",
                duplicateBooking: true
              });
            }
          }
        }
      }

      const customerName = `${firstName} ${lastName}`;
      const fullAddress = `${address}, ${city}, GA ${zipCode}`;

      // Clean phone number
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.length === 10 
        ? `${cleanPhone.slice(0,3)}-${cleanPhone.slice(3,6)}-${cleanPhone.slice(6)}`
        : phone;

      // Try to find existing customer by phone or email
      let customerId: string | null = null;
      let propertyId: string | null = null;
      let existingCustomer: typeof crmCustomers.$inferSelect | null = null;

      const existingByPhone = await db.select()
        .from(crmCustomers)
        .where(ilike(crmCustomers.phone, `%${cleanPhone.slice(-10)}%`))
        .limit(1);

      if (existingByPhone.length > 0) {
        customerId = existingByPhone[0].id;
        existingCustomer = existingByPhone[0];
      } else {
        const existingByEmail = await db.select()
          .from(crmCustomers)
          .where(ilike(crmCustomers.email, email))
          .limit(1);

        if (existingByEmail.length > 0) {
          customerId = existingByEmail[0].id;
          existingCustomer = existingByEmail[0];
        }
      }

      // If existing customer found, update their name if it looks like an address
      // (FieldEdge imported customers often have addresses as names)
      if (existingCustomer && customerId) {
        const existingName = existingCustomer.name || "";
        const nameContainsNumber = /^\d/.test(existingName) || /\d{3,}/.test(existingName);
        const nameLooksLikeAddress = nameContainsNumber || existingName.toLowerCase().includes(" ln") || 
          existingName.toLowerCase().includes(" rd") || existingName.toLowerCase().includes(" st") ||
          existingName.toLowerCase().includes(" dr") || existingName.toLowerCase().includes(" ave");
        
        if (nameLooksLikeAddress) {
          await db.update(crmCustomers)
            .set({ name: customerName })
            .where(eq(crmCustomers.id, customerId));
          console.log(`[OnlineBooking] Updated customer name from "${existingName}" to "${customerName}"`);
        }
      }

      // If no existing customer, create one
      if (!customerId) {
        const [newCustomer] = await db.insert(crmCustomers).values({
          name: customerName,
          email: email,
          phone: formattedPhone,
          customerStatus: "Customer",
          customerType: "Residential",
          leadSource: "Online Booking",
        }).returning();
        customerId = newCustomer.id;

        // Create property for new customer
        const [newProperty] = await db.insert(crmProperties).values({
          customerId: customerId,
          name: "Primary",
          address: fullAddress,
          propertyType: "residential",
        }).returning();
        propertyId = newProperty.id;
      } else {
        // Get existing property
        const existingProperty = await db.select()
          .from(crmProperties)
          .where(eq(crmProperties.customerId, customerId))
          .limit(1);
        
        if (existingProperty.length > 0) {
          propertyId = existingProperty[0].id;
        }
      }

      // Generate work order number
      const maxWoResult = await db.select({ max: sql`MAX(work_order_number)` })
        .from(crmWorkOrders);
      const nextWoNumber = (maxWoResult[0]?.max as number || 0) + 1;

      // Build comprehensive description with all booking info
      const descriptionParts: string[] = [];
      
      if (systemType) {
        descriptionParts.push(`System Type: ${systemType}`);
      }
      
      if (problems && problems.length > 0) {
        descriptionParts.push(`Issues/Reasons: ${problems.join(", ")}`);
      }
      
      if (projectType) {
        const projectTypeLabel = projectType === "replacement" ? "Replacement" : "New Installation";
        descriptionParts.push(`Project Type: ${projectTypeLabel}`);
      }
      
      if (timeline) {
        const timelineLabels: Record<string, string> = {
          next_week: "Next week",
          within_month: "Within the month",
          in_two_months: "In two months",
          asap: "As soon as possible",
        };
        descriptionParts.push(`Timeline: ${timelineLabels[timeline] || timeline}`);
      }
      
      if (notes) {
        descriptionParts.push(`Customer Notes: ${notes}`);
      }

      const description = descriptionParts.join("\n");

      // Determine visit type
      const visitType = serviceType === "consultation" ? "SALES" : "SERVICE";
      const title = serviceType === "consultation" 
        ? "Comfort Consultation (Online Booking)"
        : "HVAC Service Call (Online Booking)";

      // Format preferred time slot for display
      const timeSlotMap: Record<string, string> = {
        "09:00-11:00": "9 AM - 11 AM",
        "11:00-13:00": "11 AM - 1 PM",
        "13:00-15:00": "1 PM - 3 PM",
        "15:00-17:00": "3 PM - 5 PM",
      };
      const preferredTimeDisplay = timeSlotMap[selectedTimeSlot] || selectedTimeSlot;
      const preferredDate = new Date(selectedDate);
      const formattedDate = preferredDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });

      // Create work order with NeedsScheduling status and online booking source
      const [workOrder] = await db.insert(crmWorkOrders).values({
        customerId,
        propertyId,
        workOrderNumber: nextWoNumber,
        title,
        description,
        visitType: visitType as any,
        workSubtype: serviceType === "consultation" ? "Comfort Consultation" : "Service Call",
        status: "scheduled",
        priority: "normal",
        dispatchQueueStage: "NeedsScheduling",
        bookingSource: "online",
        preferredTimeSlot: `${formattedDate} ${preferredTimeDisplay}`,
        dispatchNotes: `ONLINE BOOKING - Preferred time: ${formattedDate} ${preferredTimeDisplay}`,
      }).returning();

      console.log(`[OnlineBooking] Created work order #${nextWoNumber} for ${customerName} (${email})`);

      // TODO: Send confirmation email to customer

      res.json({
        success: true,
        workOrderNumber: nextWoNumber,
        message: "Booking submitted successfully",
      });
    } catch (error) {
      console.error("Error processing online booking:", error);
      res.status(500).json({ message: "Failed to process booking" });
    }
  });

  // ============================================================================
  // Marketing Campaigns API
  // ============================================================================

  // GET /api/crm/marketing/campaigns - Get all marketing campaigns
  app.get("/api/crm/marketing/campaigns", requireCrmAuth, async (req, res) => {
    try {
      const campaigns = await db.select().from(marketingCampaigns).orderBy(marketingCampaigns.createdAt);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching marketing campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // ============================================================================
  // Review Automation Settings API
  // ============================================================================

  // GET /api/admin/settings/review-automation - Get review automation settings
  app.get("/api/admin/settings/review-automation", requireCrmAdmin, async (req, res) => {
    try {
      const enabledSetting = await storage.getSetting("review_automation_enabled");
      const linkSetting = await storage.getSetting("google_review_link");
      const templateSetting = await storage.getSetting("sms_template_review_request");
      
      res.json({
        enabled: enabledSetting?.value !== "false",
        googleReviewLink: linkSetting?.value || "",
        messageTemplate: templateSetting?.value || "Thanks for choosing GHVAC! We'd love your feedback - please leave us a Google review: {reviewLink} - GHVAC"
      });
    } catch (error) {
      console.error("Error fetching review automation settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // PUT /api/admin/settings/review-automation - Update review automation settings
  app.put("/api/admin/settings/review-automation", requireCrmAdmin, async (req, res) => {
    try {
      const { enabled, googleReviewLink, messageTemplate } = req.body;
      
      if (typeof enabled === "boolean") {
        await storage.setSetting("review_automation_enabled", enabled ? "true" : "false");
      }
      if (googleReviewLink !== undefined) {
        await storage.setSetting("google_review_link", googleReviewLink);
      }
      if (messageTemplate !== undefined) {
        await storage.setSetting("sms_template_review_request", messageTemplate);
      }
      
      // Sync campaign isActive status with the new enabled setting
      await syncCampaignActiveStatus();
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating review automation settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // POST /api/admin/trigger-review-requests - Manually trigger review request processing
  app.post("/api/admin/trigger-review-requests", requireCrmAdmin, async (req, res) => {
    try {
      const summary = await processReviewRequests();
      res.json({ success: true, summary });
    } catch (error) {
      console.error("Error triggering review requests:", error);
      res.status(500).json({ message: "Failed to process review requests" });
    }
  });

  // POST /api/admin/import-fieldedge - Import historical data from FieldEdge CSV files
  app.post("/api/admin/import-fieldedge", requireCrmAdmin, async (req, res) => {
    try {
      console.log("[FieldEdge Import] Starting import via API...");
      const result = await runFullFieldEdgeImport();
      res.json({ 
        success: true, 
        workOrders: {
          imported: result.workOrders.imported,
          skipped: result.workOrders.skipped,
          errors: result.workOrders.errors.length
        },
        invoices: {
          imported: result.invoices.imported,
          linked: result.invoices.linked,
          skipped: result.invoices.skipped,
          errors: result.invoices.errors.length
        }
      });
    } catch (error: any) {
      console.error("Error running FieldEdge import:", error);
      res.status(500).json({ message: "Failed to import FieldEdge data", error: error.message });
    }
  });

  // ===============================
  // PRICEBOOK API ENDPOINTS
  // ===============================

  // GET /api/pricebook/packages - List all active pricebook packages
  app.get("/api/pricebook/packages", requireCrmAuth, async (req, res) => {
    try {
      const packages = await db
        .select()
        .from(pricebookPackages)
        .where(eq(pricebookPackages.isActive, true))
        .orderBy(
          asc(pricebookPackages.unitType),
          asc(pricebookPackages.tier),
          asc(pricebookPackages.tonnage),
          asc(pricebookPackages.packageLevel)
        );

      // Return raw cent values - frontend handles conversion
      res.json(packages);
    } catch (error: any) {
      console.error("Error fetching pricebook packages:", error);
      res.status(500).json({ message: "Failed to fetch packages", error: error.message });
    }
  });

  // GET /api/pricebook/packages/export - Export HVAC packages as CSV for Google Sheets
  app.get("/api/pricebook/packages/export", requireCrmSalesOrAbove, async (req, res) => {
    try {
      // Fetch all HVAC packages
      const hvacPackages = await db
        .select()
        .from(pricebookPackages)
        .where(eq(pricebookPackages.isActive, true))
        .orderBy(
          asc(pricebookPackages.unitType),
          asc(pricebookPackages.tier),
          asc(pricebookPackages.tonnage),
          asc(pricebookPackages.packageLevel)
        );

      // CSV headers for HVAC packages (matching Google Sheets import format)
      const headers = [
        "unitType", "tier", "tonnage", "packageLevel", "monthlyPayment", "totalInvestment",
        "outdoorBrand", "outdoorModel", "outdoorName", "coilModel", "coilName",
        "indoorHeatModel", "indoorHeatName", "thermostatModel", "thermostatName",
        "accessoryModels", "outdoorImageUrl", "thermostatImageUrl", "furnaceImageUrl"
      ];

      // Build CSV rows with Google Sheets IMAGE() formula for image columns
      const rows = hvacPackages.map(pkg => {
        const outdoorImg = pkg.outdoorImageUrl ? `=IMAGE("${pkg.outdoorImageUrl}")` : "";
        const thermostatImg = pkg.thermostatImageUrl ? `=IMAGE("${pkg.thermostatImageUrl}")` : "";
        const furnaceImg = pkg.furnaceImageUrl ? `=IMAGE("${pkg.furnaceImageUrl}")` : "";

        return [
          pkg.unitType,
          pkg.tier,
          pkg.tonnage,
          pkg.packageLevel,
          (pkg.monthlyPayment / 100).toFixed(2),
          (pkg.totalInvestment / 100).toFixed(2),
          pkg.outdoorBrand || "",
          pkg.outdoorModel || "",
          pkg.outdoorName || "",
          pkg.coilModel || "",
          pkg.coilName || "",
          pkg.indoorHeatModel || "",
          pkg.indoorHeatName || "",
          pkg.thermostatModel || "",
          pkg.thermostatName || "",
          pkg.accessoryModels || "",
          outdoorImg,
          thermostatImg,
          furnaceImg
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=hvac-packages.csv");
      res.send(csv);
    } catch (error: any) {
      console.error("Error exporting packages:", error);
      res.status(500).json({ message: "Failed to export packages", error: error.message });
    }
  });

  // POST /api/pricebook/packages/import - Import packages from JSON
  app.post("/api/pricebook/packages/import", requireCrmSalesOrAbove, async (req, res) => {
    console.log('[IMPORT_DEBUG] /api/pricebook/packages/import called at:', new Date().toISOString());
    console.log('[IMPORT_DEBUG] Request origin:', req.headers.origin || req.headers.referer || 'no-origin');
    console.log('[IMPORT_DEBUG] Auth header:', req.headers.authorization ? 'Bearer ***' : 'no-auth');
    try {
      const { packages: packagesToImport } = req.body;

      if (!Array.isArray(packagesToImport)) {
        return res.status(400).json({ message: "packages must be an array" });
      }

      let imported = 0;
      let updated = 0;

      for (const pkg of packagesToImport) {
        // Convert dollar amounts to cents
        const monthlyPaymentCents = Math.round(parseFloat(pkg.monthlyPayment || "0") * 100);
        const totalInvestmentCents = Math.round(parseFloat(pkg.totalInvestment || "0") * 100);

        // Check for existing package by unique key
        const existing = await db
          .select()
          .from(pricebookPackages)
          .where(
            and(
              eq(pricebookPackages.unitType, pkg.unitType),
              eq(pricebookPackages.tier, pkg.tier),
              eq(pricebookPackages.tonnage, pkg.tonnage),
              eq(pricebookPackages.packageLevel, pkg.packageLevel),
              eq(pricebookPackages.outdoorModel, pkg.outdoorModel || "")
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing - preserve CRM-only fields (like images) if not provided in import
          const updates: Record<string, any> = {
            monthlyPayment: monthlyPaymentCents,
            totalInvestment: totalInvestmentCents,
            isActive: true,
            updatedAt: new Date(),
          };
          if (pkg.outdoorBrand) updates.outdoorBrand = pkg.outdoorBrand;
          if (pkg.outdoorName) updates.outdoorName = pkg.outdoorName;
          if (pkg.coilModel) updates.coilModel = pkg.coilModel;
          if (pkg.coilName) updates.coilName = pkg.coilName;
          if (pkg.indoorHeatModel) updates.indoorHeatModel = pkg.indoorHeatModel;
          if (pkg.indoorHeatName) updates.indoorHeatName = pkg.indoorHeatName;
          if (pkg.thermostatModel) updates.thermostatModel = pkg.thermostatModel;
          if (pkg.thermostatName) updates.thermostatName = pkg.thermostatName;
          if (pkg.accessoryModels) updates.accessoryModels = pkg.accessoryModels;
          if (pkg.outdoorImageUrl) updates.outdoorImageUrl = pkg.outdoorImageUrl;
          if (pkg.thermostatImageUrl) updates.thermostatImageUrl = pkg.thermostatImageUrl;
          if (pkg.furnaceImageUrl) updates.furnaceImageUrl = pkg.furnaceImageUrl;
          
          // Log if this update will change images (existing has them, but we're not setting any)
          if (existing[0].outdoorImageUrl && !updates.outdoorImageUrl) {
            console.log('[IMPORT_DEBUG] UPDATE will NOT overwrite existing outdoor image for:', 
              pkg.unitType, pkg.tier, pkg.tonnage, pkg.packageLevel);
          }
          
          await db
            .update(pricebookPackages)
            .set(updates)
            .where(eq(pricebookPackages.id, existing[0].id));
          updated++;
        } else {
          // Insert new
          await db.insert(pricebookPackages).values({
            unitType: pkg.unitType,
            tier: pkg.tier,
            tonnage: pkg.tonnage,
            packageLevel: pkg.packageLevel,
            monthlyPayment: monthlyPaymentCents,
            totalInvestment: totalInvestmentCents,
            outdoorBrand: pkg.outdoorBrand || null,
            outdoorModel: pkg.outdoorModel || null,
            outdoorName: pkg.outdoorName || null,
            coilModel: pkg.coilModel || null,
            coilName: pkg.coilName || null,
            indoorHeatModel: pkg.indoorHeatModel || null,
            indoorHeatName: pkg.indoorHeatName || null,
            thermostatModel: pkg.thermostatModel || null,
            thermostatName: pkg.thermostatName || null,
            accessoryModels: pkg.accessoryModels || null,
            outdoorImageUrl: pkg.outdoorImageUrl || null,
            thermostatImageUrl: pkg.thermostatImageUrl || null,
            furnaceImageUrl: pkg.furnaceImageUrl || null,
            isActive: true,
          });
          imported++;
        }
      }

      res.json({ 
        message: "Import completed", 
        imported, 
        updated, 
        total: packagesToImport.length 
      });
    } catch (error: any) {
      console.error("Error importing pricebook packages:", error);
      res.status(500).json({ message: "Failed to import packages", error: error.message });
    }
  });

  // POST /api/pricebook/packages/adjust-prices - Apply bulk price adjustment
  app.post("/api/pricebook/packages/adjust-prices", requireCrmSalesOrAbove, async (req, res) => {
    try {
      const { adjustmentType, percentageChange, unitTypeFilter, tierFilter } = req.body;

      if (!adjustmentType || !["hvac", "crawlspace"].includes(adjustmentType)) {
        return res.status(400).json({ message: "adjustmentType must be 'hvac' or 'crawlspace'" });
      }

      if (typeof percentageChange !== "number") {
        return res.status(400).json({ message: "percentageChange must be a number" });
      }

      const multiplier = 1 + percentageChange / 100;
      let packagesAffected = 0;
      const crmUser = getCurrentCrmUser(req);

      if (adjustmentType === "hvac") {
        // Build where conditions
        const conditions = [eq(pricebookPackages.isActive, true)];
        if (unitTypeFilter) {
          conditions.push(eq(pricebookPackages.unitType, unitTypeFilter));
        }
        if (tierFilter) {
          conditions.push(eq(pricebookPackages.tier, tierFilter));
        }

        // Get matching packages
        const matchingPackages = await db
          .select()
          .from(pricebookPackages)
          .where(and(...conditions));

        // Update each package
        for (const pkg of matchingPackages) {
          const newMonthlyPayment = Math.round(pkg.monthlyPayment * multiplier);
          const newTotalInvestment = Math.round(pkg.totalInvestment * multiplier);

          await db
            .update(pricebookPackages)
            .set({
              monthlyPayment: newMonthlyPayment,
              totalInvestment: newTotalInvestment,
              updatedAt: new Date(),
            })
            .where(eq(pricebookPackages.id, pkg.id));
        }

        packagesAffected = matchingPackages.length;
      } else if (adjustmentType === "crawlspace") {
        // Get matching crawlspace tiers
        const conditions = [eq(crawlspaceTiers.isActive, true)];
        
        const matchingTiers = await db
          .select()
          .from(crawlspaceTiers)
          .where(and(...conditions));

        // Update each tier
        for (const tier of matchingTiers) {
          const newRollPrice = Math.round(tier.rollPrice * multiplier);

          await db
            .update(crawlspaceTiers)
            .set({
              rollPrice: newRollPrice,
              updatedAt: new Date(),
            })
            .where(eq(crawlspaceTiers.id, tier.id));
        }

        packagesAffected = matchingTiers.length;
      }

      // Record the adjustment
      await db.insert(packagePriceAdjustments).values({
        adjustmentType,
        unitTypeFilter: unitTypeFilter || null,
        tierFilter: tierFilter || null,
        percentageChange: Math.round(percentageChange * 100), // Store as basis points
        packagesAffected,
        appliedBy: crmUser?.email || "unknown",
      });

      res.json({
        message: "Price adjustment applied",
        adjustmentType,
        percentageChange,
        packagesAffected,
      });
    } catch (error: any) {
      console.error("Error adjusting prices:", error);
      res.status(500).json({ message: "Failed to adjust prices", error: error.message });
    }
  });

  // GET /api/pricebook/crawlspace-tiers - List all active crawlspace tiers
  app.get("/api/pricebook/crawlspace-tiers", requireCrmAuth, async (req, res) => {
    try {
      const tiers = await db
        .select()
        .from(crawlspaceTiers)
        .where(eq(crawlspaceTiers.isActive, true))
        .orderBy(asc(crawlspaceTiers.milThickness));

      // Convert cents to dollars for response
      const tiersWithDollars = tiers.map(tier => ({
        ...tier,
        rollPrice: (tier.rollPrice / 100).toFixed(2),
      }));

      res.json(tiersWithDollars);
    } catch (error: any) {
      console.error("Error fetching crawlspace tiers:", error);
      res.status(500).json({ message: "Failed to fetch crawlspace tiers", error: error.message });
    }
  });

  // GET /api/pricebook/adjustments - List recent price adjustments (last 20)
  app.get("/api/pricebook/adjustments", requireCrmAuth, async (req, res) => {
    try {
      const adjustments = await db
        .select()
        .from(packagePriceAdjustments)
        .orderBy(desc(packagePriceAdjustments.appliedAt))
        .limit(20);

      // Convert basis points back to percentage for display
      const adjustmentsFormatted = adjustments.map(adj => ({
        ...adj,
        percentageChange: adj.percentageChange / 100,
      }));

      res.json(adjustmentsFormatted);
    } catch (error: any) {
      console.error("Error fetching price adjustments:", error);
      res.status(500).json({ message: "Failed to fetch adjustments", error: error.message });
    }
  });

  // GET /api/pricebook/sheets/status - Check if Google Sheets sync is configured
  app.get("/api/pricebook/sheets/status", requireCrmAuth, async (req, res) => {
    try {
      const configured = packageSheetsService.isConfigured();
      res.json({
        configured,
        spreadsheetId: configured ? packageSheetsService.getSpreadsheetId() : undefined,
      });
    } catch (error: any) {
      console.error("Error checking sheets status:", error);
      res.status(500).json({ message: "Failed to check sheets status", error: error.message });
    }
  });

  // POST /api/pricebook/sheets/sync - Sync packages from Google Sheets
  app.post("/api/pricebook/sheets/sync", requireCrmSalesOrAbove, async (req, res) => {
    try {
      if (!packageSheetsService.isConfigured()) {
        return res.status(400).json({
          message: "Google Sheets sync not configured. Set PRICEBOOK_SHEETS_ID environment variable.",
        });
      }

      const crmUser = getCurrentCrmUser(req);
      console.log(`Pricebook sheets sync initiated by ${crmUser?.email || 'unknown'}`);

      // Use the shared sync function (delta-only, preserves CRM data not in sheet)
      const result = await syncPricebookPackages();

      // Log the sync action
      if (crmUser) {
        await logCrmAudit(
          crmUser.id,
          "pricebook_sheets_sync",
          "pricebook",
          undefined,
          { hvacPackagesCount: result.total }
        );
      }

      res.json({
        message: "Pricebook sync completed",
        hvacPackages: result.total,
        updated: result.updated,
        inserted: result.inserted,
      });
    } catch (error: any) {
      console.error("Error during pricebook sheets sync:", error);
      res.status(500).json({ message: "Failed to sync from sheets", error: error.message });
    }
  });

  const httpServer = createServer(app);

  // Defer expensive startup operations to run after server is ready (allows health checks to pass)
  setTimeout(() => {
    // Customer auto-sync from Google Sheets (every 1 minute with delta-only updates)
    startAutoSync(1);
    console.log('Customer auto-sync started (every 1 minute)');

    // Start daily weather refresh
    scheduleWeatherRefresh();

    // Start weather impact jobs (refreshes call_daily and weather_daily every 6 hours)
    scheduleWeatherImpactJobs();

    // Start agreement renewal job (runs daily, creates invoices for due agreements)
    scheduleAgreementRenewals();

    // Start maintenance reminder job (sends 10-day and 5-day SMS reminders for upcoming visits)
    scheduleMaintenanceReminders();

    // Start review request scheduler (sends Google review requests 2 hours after work order completion)
    startReviewRequestScheduler();

    // Start Bouncie fleet location sync (every 5 minutes for real-time GPS tracking)
    startBouncieBackgroundSync(5);

    // Start pricebook auto-sync (every 1 minute with delta-only updates from pricebook-export sheet)
    // TEMPORARILY DISABLED for debugging
    // startPricebookAutoSync(1);
    // console.log('Pricebook auto-sync started (every 1 minute)');
    console.log('Pricebook auto-sync DISABLED for debugging');

    // Seed vector store with sales book if empty (async, don't block startup)
    seedVectorStoreWithSalesBook().then(success => {
      if (success) {
        console.log('Vector store knowledge base initialized');
      }
    }).catch(err => {
      console.error('Error seeding vector store on startup:', err);
    });

    // Auto-import monthly goals from Excel if not already populated
    bootstrapMonthlyGoals().catch(err => {
      console.error('Error bootstrapping monthly goals:', err);
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
TOTAL: $${quote.total}`;
}
