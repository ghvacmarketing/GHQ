import QuickBooks from "node-quickbooks";
import { db } from "../db";
import { 
  quickbooksConnection, 
  quickbooksCustomerSync, 
  quickbooksInvoiceSync,
  quickbooksPaymentSync,
  quickbooksSyncLog,
  quickbooksClasses,
  quickbooksCategoryClassMap,
  quickbooksAccounts,
  crmCustomers,
  crmInvoices,
  crmInvoiceLineItems,
  crmItems,
  crmProperties,
  crmWorkOrders,
  type QuickbooksConnection,
  type QuickbooksClass,
  type QuickbooksCategoryClassMap,
  type QuickbooksAccount,
  type CrmCustomer,
  type CrmInvoice,
  type CrmItemCategory,
  type PropertyType,
  type DiscountKind
} from "@shared/schema";
import { eq, and, isNull, isNotNull, inArray, notInArray, sql } from "drizzle-orm";

const QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID || "";
const QUICKBOOKS_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET || "";
const QUICKBOOKS_REDIRECT_URI = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/quickbooks/callback`
  : "http://localhost:5000/api/quickbooks/callback";

const QB_SANDBOX_BASE_URL = "https://sandbox-quickbooks.api.intuit.com";
const QB_PRODUCTION_BASE_URL = "https://quickbooks.api.intuit.com";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_AUTHORIZATION_URL = "https://appcenter.intuit.com/connect/oauth2";

export function getAuthorizationUrl(state: string, environment: "sandbox" | "production" = "sandbox"): string {
  const params = new URLSearchParams({
    client_id: QUICKBOOKS_CLIENT_ID,
    redirect_uri: QUICKBOOKS_REDIRECT_URI,
    scope: "com.intuit.quickbooks.accounting",
    response_type: "code",
    state: state,
  });
  
  return `${QB_AUTHORIZATION_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, realmId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}> {
  const auth = Buffer.from(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`).toString("base64");
  
  const response = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "Authorization": `Basic ${auth}`
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: QUICKBOOKS_REDIRECT_URI
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[QuickBooks] Token exchange failed:", errorText);
    throw new Error(`Token exchange failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresIn: data.expires_in, // Usually 3600 (1 hour)
    refreshTokenExpiresIn: data.x_refresh_token_expires_in // Usually 8726400 (100 days)
  };
}

export async function refreshAccessToken(connection: QuickbooksConnection): Promise<QuickbooksConnection> {
  const auth = Buffer.from(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`).toString("base64");
  
  const response = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "Authorization": `Basic ${auth}`
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[QuickBooks] Token refresh failed:", errorText);
    throw new Error(`Token refresh failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  const now = new Date();
  const accessTokenExpiresAt = new Date(now.getTime() + data.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(now.getTime() + data.x_refresh_token_expires_in * 1000);
  
  const [updated] = await db.update(quickbooksConnection)
    .set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      updatedAt: now
    })
    .where(eq(quickbooksConnection.id, connection.id))
    .returning();
  
  console.log(`[QuickBooks] Refreshed tokens for realm ${connection.realmId}`);
  return updated;
}

export async function getActiveConnection(): Promise<QuickbooksConnection | null> {
  const [connection] = await db.select()
    .from(quickbooksConnection)
    .where(eq(quickbooksConnection.isActive, true))
    .limit(1);
  
  if (!connection) return null;
  
  // Check if access token needs refresh (with 5 minute buffer)
  const now = new Date();
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  
  if (connection.accessTokenExpiresAt.getTime() - bufferTime < now.getTime()) {
    // Check if refresh token is still valid
    if (connection.refreshTokenExpiresAt < now) {
      console.error("[QuickBooks] Refresh token expired, need to reconnect");
      await db.update(quickbooksConnection)
        .set({ isActive: false })
        .where(eq(quickbooksConnection.id, connection.id));
      return null;
    }
    
    return await refreshAccessToken(connection);
  }
  
  return connection;
}

export async function saveConnection(
  realmId: string,
  accessToken: string,
  refreshToken: string,
  accessTokenExpiresIn: number,
  refreshTokenExpiresIn: number,
  environment: "sandbox" | "production"
): Promise<QuickbooksConnection> {
  const now = new Date();
  const accessTokenExpiresAt = new Date(now.getTime() + accessTokenExpiresIn * 1000);
  const refreshTokenExpiresAt = new Date(now.getTime() + refreshTokenExpiresIn * 1000);
  
  // First deactivate any existing connections
  await db.update(quickbooksConnection)
    .set({ isActive: false })
    .where(eq(quickbooksConnection.isActive, true));
  
  // Check if connection already exists for this realm
  const existing = await db.select()
    .from(quickbooksConnection)
    .where(eq(quickbooksConnection.realmId, realmId))
    .limit(1);
  
  if (existing.length > 0) {
    const [updated] = await db.update(quickbooksConnection)
      .set({
        accessToken,
        refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        environment,
        isActive: true,
        updatedAt: now
      })
      .where(eq(quickbooksConnection.realmId, realmId))
      .returning();
    return updated;
  }
  
  const [created] = await db.insert(quickbooksConnection)
    .values({
      realmId,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      environment,
      isActive: true
    })
    .returning();
  
  return created;
}

export async function disconnectQuickBooks(): Promise<void> {
  await db.update(quickbooksConnection)
    .set({ isActive: false })
    .where(eq(quickbooksConnection.isActive, true));
  console.log("[QuickBooks] Disconnected");
}

function getQuickBooksClient(connection: QuickbooksConnection): QuickBooks {
  const useSandbox = connection.environment === "sandbox";
  
  return new QuickBooks(
    QUICKBOOKS_CLIENT_ID,
    QUICKBOOKS_CLIENT_SECRET,
    connection.accessToken,
    false, // No token secret for OAuth 2.0
    connection.realmId,
    useSandbox, // Use sandbox?
    false, // Debug mode
    null, // Minor version
    "2.0", // OAuth version
    connection.refreshToken
  );
}

// =============================================
// CUSTOMER SYNC
// =============================================

export async function syncCustomerToQuickBooks(
  customerId: string,
  connection?: QuickbooksConnection
): Promise<{ success: boolean; quickbooksId?: string; error?: string }> {
  try {
    const conn = connection || await getActiveConnection();
    if (!conn) {
      return { success: false, error: "No active QuickBooks connection" };
    }
    
    // Get CRM customer
    const [customer] = await db.select()
      .from(crmCustomers)
      .where(eq(crmCustomers.id, customerId))
      .limit(1);
    
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    
    // Check if already synced
    const [existingSync] = await db.select()
      .from(quickbooksCustomerSync)
      .where(and(
        eq(quickbooksCustomerSync.crmCustomerId, customerId),
        eq(quickbooksCustomerSync.realmId, conn.realmId)
      ))
      .limit(1);
    
    const qbo = getQuickBooksClient(conn);
    
    // Build QuickBooks customer object
    const qbCustomer: any = {
      DisplayName: customer.name,
      PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
      PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
    };
    
    // Add billing address if available (fullAddress is stored as a single field in CRM)
    if (customer.fullAddress) {
      qbCustomer.BillAddr = {
        Line1: customer.fullAddress,
      };
    }
    
    return new Promise((resolve) => {
      if (existingSync) {
        // Update existing customer in QuickBooks
        qbCustomer.Id = existingSync.quickbooksCustomerId;
        qbCustomer.sparse = true;
        
        // First get the current SyncToken
        qbo.getCustomer(existingSync.quickbooksCustomerId, async (err: any, existing: any) => {
          if (err) {
            console.error("[QuickBooks] Error fetching customer:", err);
            resolve({ success: false, error: err.message || "Failed to fetch customer" });
            return;
          }
          
          qbCustomer.SyncToken = existing.SyncToken;
          
          qbo.updateCustomer(qbCustomer, async (updateErr: any, updated: any) => {
            if (updateErr) {
              console.error("[QuickBooks] Error updating customer:", updateErr);
              await db.update(quickbooksCustomerSync)
                .set({ 
                  syncStatus: "error", 
                  lastError: updateErr.message || "Update failed",
                  updatedAt: new Date()
                })
                .where(eq(quickbooksCustomerSync.id, existingSync.id));
              resolve({ success: false, error: updateErr.message || "Failed to update customer" });
              return;
            }
            
            await db.update(quickbooksCustomerSync)
              .set({ 
                syncStatus: "synced", 
                lastSyncAt: new Date(),
                lastError: null,
                updatedAt: new Date()
              })
              .where(eq(quickbooksCustomerSync.id, existingSync.id));
            
            console.log(`[QuickBooks] Updated customer ${customer.name} (QB ID: ${updated.Id})`);
            resolve({ success: true, quickbooksId: updated.Id });
          });
        });
      } else {
        // Create new customer in QuickBooks
        qbo.createCustomer(qbCustomer, async (err: any, created: any) => {
          if (err) {
            console.error("[QuickBooks] Error creating customer:", err);
            // Record the failure to prevent infinite retries
            try {
              await db.insert(quickbooksCustomerSync)
                .values({
                  crmCustomerId: customerId,
                  quickbooksCustomerId: "",
                  realmId: conn.realmId,
                  syncStatus: "error",
                  lastError: err.message || "Failed to create customer",
                  lastSyncAt: new Date()
                });
            } catch (insertErr) {
              // Record may already exist, update it
              await db.update(quickbooksCustomerSync)
                .set({
                  syncStatus: "error",
                  lastError: err.message || "Failed to create customer",
                  updatedAt: new Date()
                })
                .where(and(
                  eq(quickbooksCustomerSync.crmCustomerId, customerId),
                  eq(quickbooksCustomerSync.realmId, conn.realmId)
                ));
            }
            resolve({ success: false, error: err.message || "Failed to create customer" });
            return;
          }
          
          // Save sync mapping
          await db.insert(quickbooksCustomerSync)
            .values({
              crmCustomerId: customerId,
              quickbooksCustomerId: created.Id,
              realmId: conn.realmId,
              syncStatus: "synced",
              lastSyncAt: new Date()
            });
          
          console.log(`[QuickBooks] Created customer ${customer.name} (QB ID: ${created.Id})`);
          resolve({ success: true, quickbooksId: created.Id });
        });
      }
    });
  } catch (error: any) {
    console.error("[QuickBooks] Customer sync error:", error);
    return { success: false, error: error.message || "Sync failed" };
  }
}

export async function syncAllCustomersToQuickBooks(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
  status: string;
}> {
  const conn = await getActiveConnection();
  if (!conn) {
    return { processed: 0, succeeded: 0, failed: 0, errors: ["No active QuickBooks connection"], status: "error" };
  }
  
  // Log sync start
  const [logEntry] = await db.insert(quickbooksSyncLog)
    .values({
      realmId: conn.realmId,
      syncType: "customer",
      direction: "push",
      status: "started"
    })
    .returning();
  
  // Get all CRM customers (all customers, no isActive filter on crmCustomers table)
  // Process ALL customers (both new and already synced for updates)
  const customers = await db.select()
    .from(crmCustomers);
  
  console.log(`[QuickBooks] Starting customer sync: ${customers.length} total customers`);
  
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  
  // Process in batches to avoid overwhelming the API
  const BATCH_SIZE = 50;
  const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches
  
  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    
    console.log(`[QuickBooks] Processing customer batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(customers.length / BATCH_SIZE)}`);
    
    for (const customer of batch) {
      try {
        const result = await syncCustomerToQuickBooks(customer.id, conn);
        if (result.success) {
          succeeded++;
        } else {
          failed++;
          if (errors.length < 20) { // Limit error messages stored
            errors.push(`${customer.name}: ${result.error}`);
          }
        }
      } catch (err: any) {
        failed++;
        if (errors.length < 20) {
          errors.push(`${customer.name}: ${err.message || "Unknown error"}`);
        }
      }
    }
    
    // Add delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < customers.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  // Update log - use 'completed' even with some failures since we processed all
  const logStatus = failed === 0 ? "completed" : "failed";
  await db.update(quickbooksSyncLog)
    .set({
      status: logStatus,
      recordsProcessed: succeeded,
      recordsFailed: failed,
      errorMessage: errors.length > 0 ? errors.slice(0, 10).join("; ") : null,
      completedAt: new Date()
    })
    .where(eq(quickbooksSyncLog.id, logEntry.id));
  
  console.log(`[QuickBooks] Customer sync complete: ${succeeded} succeeded, ${failed} failed`);
  
  return { processed: customers.length, succeeded, failed, errors, status: succeeded > 0 ? "completed" : "failed" };
}

// =============================================
// INVOICE SYNC
// =============================================

export async function syncInvoiceToQuickBooks(
  invoiceId: string,
  connection?: QuickbooksConnection
): Promise<{ success: boolean; quickbooksId?: string; error?: string }> {
  try {
    const conn = connection || await getActiveConnection();
    if (!conn) {
      return { success: false, error: "No active QuickBooks connection" };
    }
    
    // Get CRM invoice with customer
    const [invoice] = await db.select()
      .from(crmInvoices)
      .where(eq(crmInvoices.id, invoiceId))
      .limit(1);
    
    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }
    
    if (!invoice.customerId) {
      return { success: false, error: "Invoice has no associated customer" };
    }
    
    const customerId = invoice.customerId;
    
    // Get customer sync mapping
    const [customerSync] = await db.select()
      .from(quickbooksCustomerSync)
      .where(and(
        eq(quickbooksCustomerSync.crmCustomerId, customerId),
        eq(quickbooksCustomerSync.realmId, conn.realmId)
      ))
      .limit(1);
    
    if (!customerSync) {
      // Need to sync customer first
      const customerResult = await syncCustomerToQuickBooks(customerId, conn);
      if (!customerResult.success) {
        return { success: false, error: `Customer sync failed: ${customerResult.error}` };
      }
    }
    
    // Get updated customer sync
    const [updatedCustomerSync] = await db.select()
      .from(quickbooksCustomerSync)
      .where(and(
        eq(quickbooksCustomerSync.crmCustomerId, customerId),
        eq(quickbooksCustomerSync.realmId, conn.realmId)
      ))
      .limit(1);
    
    if (!updatedCustomerSync) {
      return { success: false, error: "Failed to get customer sync mapping" };
    }
    
    // Check if invoice already synced
    const [existingSync] = await db.select()
      .from(quickbooksInvoiceSync)
      .where(and(
        eq(quickbooksInvoiceSync.crmInvoiceId, invoiceId),
        eq(quickbooksInvoiceSync.realmId, conn.realmId)
      ))
      .limit(1);
    
    const qbo = getQuickBooksClient(conn);
    
    // Fetch line items from separate table with their item details for category lookup
    const lineItems = await db.select()
      .from(crmInvoiceLineItems)
      .where(eq(crmInvoiceLineItems.invoiceId, invoiceId));
    
    // Prefetch all items for efficiency (avoid N+1 queries)
    const itemIds = lineItems.map(li => li.itemId).filter((id): id is string => !!id);
    const itemsById = new Map<string, typeof crmItems.$inferSelect>();
    if (itemIds.length > 0) {
      const items = await db.select().from(crmItems).where(inArray(crmItems.id, itemIds));
      items.forEach(item => itemsById.set(item.id, item));
    }
    
    // Get property for determining class subType (residential/commercial)
    // Priority: invoice.propertyId -> workOrder.propertyId -> customer type fallback
    let propertyType: PropertyType | null = null;
    let customerType: string | null = null;
    
    // Get customer info for fallback
    const [customer] = await db.select()
      .from(crmCustomers)
      .where(eq(crmCustomers.id, customerId))
      .limit(1);
    if (customer?.customerType) {
      customerType = customer.customerType;
    }
    
    if (invoice.propertyId) {
      const [property] = await db.select()
        .from(crmProperties)
        .where(eq(crmProperties.id, invoice.propertyId))
        .limit(1);
      if (property?.propertyType) {
        propertyType = property.propertyType as PropertyType;
      }
    } else if (invoice.workOrderId) {
      const [workOrder] = await db.select()
        .from(crmWorkOrders)
        .where(eq(crmWorkOrders.id, invoice.workOrderId))
        .limit(1);
      if (workOrder?.propertyId) {
        const [property] = await db.select()
          .from(crmProperties)
          .where(eq(crmProperties.id, workOrder.propertyId))
          .limit(1);
        if (property?.propertyType) {
          propertyType = property.propertyType as PropertyType;
        }
      }
    }
    
    // Fall back to customer type if property type not set
    if (!propertyType && customerType) {
      if (customerType === "residential" || customerType === "commercial") {
        propertyType = customerType as PropertyType;
      }
    }
    
    // Prefetch all active QuickBooks classes for this realm for efficient lookup
    const allClasses = await db.select()
      .from(quickbooksClasses)
      .where(and(
        eq(quickbooksClasses.realmId, conn.realmId),
        eq(quickbooksClasses.isActive, true)
      ));
    
    // Build lookup map: "classType:subType" -> quickbooksClassId (actual QB ID)
    const classLookup = new Map<string, string>();
    for (const cls of allClasses) {
      if (cls.quickbooksClassId) {
        const key = `${cls.classType}:${cls.subType}`;
        classLookup.set(key, cls.quickbooksClassId);
      }
    }
    
    // Also map local class IDs to QB IDs (for explicit overrides)
    const localIdToQbId = new Map<string, string>();
    for (const cls of allClasses) {
      if (cls.quickbooksClassId) {
        localIdToQbId.set(cls.id, cls.quickbooksClassId);
      }
    }
    
    // Prefetch all active QuickBooks items for this realm for P&L routing via ItemRef
    const allItems = await db.select()
      .from(quickbooksItems)
      .where(and(
        eq(quickbooksItems.realmId, conn.realmId),
        eq(quickbooksItems.isActive, true)
      ));
    
    // Build item lookup map: "categoryType:propertyType" -> quickbooksItemId (actual QB Item ID)
    const itemLookup = new Map<string, string>();
    for (const qbItem of allItems) {
      if (qbItem.quickbooksItemId && qbItem.categoryType && qbItem.propertyType) {
        const key = `${qbItem.categoryType}:${qbItem.propertyType}`;
        itemLookup.set(key, qbItem.quickbooksItemId);
      }
    }
    console.log(`[QuickBooks Items] Built lookup with ${itemLookup.size} items: ${Array.from(itemLookup.keys()).join(", ")}`);
    
    // Helper function to get classType from item category
    const categoryToClassType = (category: CrmItemCategory | null): "Service" | "Install" | "Maintenance" | "Discount" | null => {
      if (!category) return null;
      switch (category) {
        case "service": return "Service";
        case "install": return "Install";
        case "maintenance": return "Maintenance";
        case "discount": return "Discount";
        default: return null;
      }
    };
    
    // Helper function to get subType for discounts based on discountKind
    const discountKindToSubType = (kind: DiscountKind | null): "Promotional" | "Maintenance" | null => {
      if (!kind) return null;
      switch (kind) {
        case "promotion": return "Promotional";
        case "maintenance": return "Maintenance";
        default: return null;
      }
    };
    
    // Helper function to capitalize property type for subType matching
    const propertyTypeToSubType = (pt: PropertyType | null): "Residential" | "Commercial" | null => {
      if (!pt) return null;
      return pt === "residential" ? "Residential" : "Commercial";
    };
    
    // Build line items with ClassRef and ItemRef for class assignment and P&L routing
    const qbLineItems: any[] = [];
    for (const item of lineItems) {
      const lineItem: any = {
        Amount: parseFloat(item.lineTotal || "0"),
        DetailType: "SalesItemLineDetail",
        Description: item.description || `Line item`,
        SalesItemLineDetail: {
          Qty: parseFloat(item.quantity || "1"),
          UnitPrice: parseFloat(item.unitPrice || "0"),
        }
      };
      
      // Determine classType and subType for this line item (used for both ClassRef and ItemRef)
      let lineClassType: "Service" | "Install" | "Maintenance" | "Discount" | null = null;
      let lineSubType: "Residential" | "Commercial" | "Promotional" | "Maintenance" | null = null;
      
      // Priority 1: Explicit quickbooksSubAccountId override on line item
      // The sub-account has an associated Item that we'll use for P&L routing
      if (item.quickbooksSubAccountId) {
        // Look up the sub-account and its associated QuickBooks Item
        const [subAccount] = await db.select()
          .from(quickbooksAccounts)
          .where(eq(quickbooksAccounts.id, item.quickbooksSubAccountId))
          .limit(1);
        
        if (subAccount) {
          // Use the sub-account's category and property type for ItemRef lookup
          lineClassType = subAccount.categoryType as "Service" | "Install" | "Maintenance" | "Discount" | null;
          lineSubType = subAccount.propertyType as "Residential" | "Commercial" | null;
          
          // Find the associated QuickBooks Item for this sub-account
          const [linkedItem] = await db.select()
            .from(quickbooksItems)
            .where(eq(quickbooksItems.incomeAccountId, item.quickbooksSubAccountId))
            .limit(1);
          
          if (linkedItem?.quickbooksItemId) {
            lineItem.SalesItemLineDetail.ItemRef = { value: linkedItem.quickbooksItemId };
            console.log(`[QuickBooks SubAccount] Assigned ItemRef ${linkedItem.quickbooksItemId} for sub-account ${subAccount.name}`);
          }
        }
      }
      
      // Priority 2: Calculate ItemRef from category + property type (if not already set via sub-account)
      // Only run if ItemRef was not already set by Priority 1 (explicit sub-account override)
      const hasExplicitItemRef = !!lineItem.SalesItemLineDetail.ItemRef;
      
      if (item.isDiscountLine && !hasExplicitItemRef) {
        // For discount lines, use discountKind to determine subType
        const discountSubType = discountKindToSubType(item.discountKind as DiscountKind | null);
        if (discountSubType) {
          lineClassType = "Discount";
          lineSubType = discountSubType;
        } else {
          console.log(`[QuickBooks SubAccount] Discount line without discountKind: ${item.description}`);
        }
      } else if (item.itemId && !hasExplicitItemRef) {
        // For regular items, use category + property type
        const crmItem = itemsById.get(item.itemId);
        if (crmItem?.category) {
          const classType = categoryToClassType(crmItem.category as CrmItemCategory);
          const subType = propertyTypeToSubType(propertyType);
          lineClassType = classType;
          lineSubType = subType;
          
          if (!classType || !subType) {
            console.log(`[QuickBooks SubAccount] Missing classType (${classType}) or subType (${subType}) for item: ${crmItem.name}`);
          }
        } else {
          console.log(`[QuickBooks SubAccount] Item ${item.itemId} has no category set`);
        }
      } else if (!item.isDiscountLine && !item.itemId && !hasExplicitItemRef) {
        // Priority 3: For line items without itemId (e.g., maintenance agreement renewals),
        // try to infer category from description
        const description = (item.description || "").toLowerCase();
        let inferredClassType: "Service" | "Install" | "Maintenance" | null = null;
        
        if (description.includes("maintenance") || description.includes("preventative") || description.includes("agreement")) {
          inferredClassType = "Maintenance";
        } else if (description.includes("install") || description.includes("installation")) {
          inferredClassType = "Install";
        } else if (description.includes("service") || description.includes("repair") || description.includes("diagnostic")) {
          inferredClassType = "Service";
        }
        
        lineClassType = inferredClassType;
        lineSubType = propertyTypeToSubType(propertyType);
        
        if (!inferredClassType) {
          console.log(`[QuickBooks SubAccount] No itemId and couldn't infer category from description: "${item.description}"`);
        } else if (!propertyType) {
          console.log(`[QuickBooks SubAccount] No property type for line item: "${item.description}"`);
        }
      }
      
      // Add ItemRef for P&L routing based on category + property type
      // Only run if ItemRef wasn't already set via explicit sub-account override
      if (!hasExplicitItemRef && lineClassType && lineSubType) {
        // For discounts, subType might be "Promotional" or "Maintenance" - map to Residential/Commercial if needed
        const itemSubType = (lineSubType === "Promotional" || lineSubType === "Maintenance") 
          ? propertyTypeToSubType(propertyType) 
          : lineSubType;
        
        if (itemSubType) {
          const itemKey = `${lineClassType}:${itemSubType}`;
          const qbItemId = itemLookup.get(itemKey);
          if (qbItemId) {
            lineItem.SalesItemLineDetail.ItemRef = { value: qbItemId };
            console.log(`[QuickBooks Items] Assigned ItemRef ${qbItemId} for key: ${itemKey}`);
          } else {
            console.log(`[QuickBooks Items] No item found for key: ${itemKey} (available: ${Array.from(itemLookup.keys()).join(", ")})`);
          }
        }
      }
      
      qbLineItems.push(lineItem);
    }
    
    // Build QuickBooks invoice with safe date handling
    let txnDate: string | undefined;
    let dueDateStr: string | undefined;
    
    try {
      if (invoice.createdAt) {
        const d = invoice.createdAt instanceof Date ? invoice.createdAt : new Date(invoice.createdAt);
        if (!isNaN(d.getTime())) {
          txnDate = d.toISOString().split('T')[0];
        }
      }
    } catch {
      console.log(`[QuickBooks] Invalid createdAt for invoice ${invoice.invoiceNumber}`);
    }
    
    try {
      if (invoice.dueDate) {
        // Handle both Date objects and date strings (with or without time)
        let d: Date;
        if (invoice.dueDate instanceof Date) {
          d = invoice.dueDate;
        } else if (typeof invoice.dueDate === 'string') {
          // String format: might be "2026-02-07" or "2026-02-07T00:00:00Z"
          const dueDateStr = invoice.dueDate as string;
          d = dueDateStr.includes('T') ? new Date(dueDateStr) : new Date(dueDateStr + 'T00:00:00');
        } else {
          d = new Date(invoice.dueDate);
        }
        if (!isNaN(d.getTime())) {
          dueDateStr = d.toISOString().split('T')[0];
        }
      }
    } catch {
      console.log(`[QuickBooks] Invalid dueDate for invoice ${invoice.invoiceNumber}`);
    }
    
    const qbInvoice: any = {
      CustomerRef: { value: updatedCustomerSync.quickbooksCustomerId },
      DocNumber: invoice.invoiceNumber,
      TxnDate: txnDate,
      DueDate: dueDateStr,
      Line: qbLineItems
    };
    
    // Add a service line if no line items
    if (qbInvoice.Line.length === 0) {
      qbInvoice.Line = [{
        Amount: parseFloat(invoice.total || "0"),
        DetailType: "SalesItemLineDetail",
        Description: "Services rendered",
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: parseFloat(invoice.total || "0"),
        }
      }];
    }
    
    return new Promise((resolve) => {
      if (existingSync) {
        // Update existing invoice
        qbInvoice.Id = existingSync.quickbooksInvoiceId;
        qbInvoice.sparse = true;
        
        qbo.getInvoice(existingSync.quickbooksInvoiceId, async (err: any, existing: any) => {
          if (err) {
            resolve({ success: false, error: err.message || "Failed to fetch invoice" });
            return;
          }
          
          qbInvoice.SyncToken = existing.SyncToken;
          
          qbo.updateInvoice(qbInvoice, async (updateErr: any, updated: any) => {
            if (updateErr) {
              await db.update(quickbooksInvoiceSync)
                .set({ 
                  syncStatus: "error", 
                  lastError: updateErr.message || "Update failed",
                  updatedAt: new Date()
                })
                .where(eq(quickbooksInvoiceSync.id, existingSync.id));
              resolve({ success: false, error: updateErr.message || "Failed to update invoice" });
              return;
            }
            
            await db.update(quickbooksInvoiceSync)
              .set({ 
                syncStatus: "synced", 
                lastSyncAt: new Date(),
                lastError: null,
                updatedAt: new Date()
              })
              .where(eq(quickbooksInvoiceSync.id, existingSync.id));
            
            console.log(`[QuickBooks] Updated invoice ${invoice.invoiceNumber} (QB ID: ${updated.Id})`);
            resolve({ success: true, quickbooksId: updated.Id });
          });
        });
      } else {
        // Create new invoice
        qbo.createInvoice(qbInvoice, async (err: any, created: any) => {
          if (err) {
            console.error("[QuickBooks] Error creating invoice:", err);
            // Record the failure to prevent infinite retries
            try {
              await db.insert(quickbooksInvoiceSync)
                .values({
                  crmInvoiceId: invoiceId,
                  quickbooksInvoiceId: "",
                  realmId: conn.realmId,
                  syncStatus: "error",
                  lastError: err.message || "Failed to create invoice",
                  lastSyncAt: new Date()
                });
            } catch (insertErr) {
              // Record may already exist, update it
              await db.update(quickbooksInvoiceSync)
                .set({
                  syncStatus: "error",
                  lastError: err.message || "Failed to create invoice",
                  updatedAt: new Date()
                })
                .where(and(
                  eq(quickbooksInvoiceSync.crmInvoiceId, invoiceId),
                  eq(quickbooksInvoiceSync.realmId, conn.realmId)
                ));
            }
            resolve({ success: false, error: err.message || "Failed to create invoice" });
            return;
          }
          
          await db.insert(quickbooksInvoiceSync)
            .values({
              crmInvoiceId: invoiceId,
              quickbooksInvoiceId: created.Id,
              realmId: conn.realmId,
              syncStatus: "synced",
              lastSyncAt: new Date()
            });
          
          console.log(`[QuickBooks] Created invoice ${invoice.invoiceNumber} (QB ID: ${created.Id})`);
          resolve({ success: true, quickbooksId: created.Id });
        });
      }
    });
  } catch (error: any) {
    console.error("[QuickBooks] Invoice sync error:", error);
    return { success: false, error: error.message || "Sync failed" };
  }
}

// Sync all invoices to QuickBooks with batching and payment sync
export async function syncAllInvoicesToQuickBooks(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
  paymentsSynced?: number;
}> {
  const conn = await getActiveConnection();
  if (!conn) {
    return { processed: 0, succeeded: 0, failed: 0, errors: ["No active QuickBooks connection"] };
  }
  
  // Log sync start
  const [logEntry] = await db.insert(quickbooksSyncLog)
    .values({
      realmId: conn.realmId,
      syncType: "invoice",
      direction: "push",
      status: "started"
    })
    .returning();
  
  // Get all CRM invoices that have a customer and are not draft (sent, paid, or void)
  const invoices = await db.select()
    .from(crmInvoices)
    .where(and(
      isNotNull(crmInvoices.customerId),
      inArray(crmInvoices.status, ["sent", "paid", "void"])
    ));
  
  console.log(`[QuickBooks] Starting invoice sync: ${invoices.length} total invoices`);
  
  let succeeded = 0;
  let failed = 0;
  let paymentsSynced = 0;
  const errors: string[] = [];
  
  // Rate limiting constants
  const BATCH_SIZE = 25; // Smaller batches for invoices (more complex)
  const DELAY_BETWEEN_BATCHES = 1500; // 1.5 seconds between batches
  
  // Process in batches
  for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
    const batch = invoices.slice(i, i + BATCH_SIZE);
    console.log(`[QuickBooks] Processing invoice batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(invoices.length / BATCH_SIZE)}`);
    
    for (const invoice of batch) {
      // Sync the invoice
      const result = await syncInvoiceToQuickBooks(invoice.id, conn);
      if (result.success) {
        succeeded++;
        
        // If invoice is paid, also sync the payment (if not already synced)
        if (invoice.status === "paid" && invoice.total) {
          // Check if payment already synced
          const [existingPayment] = await db.select()
            .from(quickbooksPaymentSync)
            .where(and(
              eq(quickbooksPaymentSync.crmInvoiceId, invoice.id),
              eq(quickbooksPaymentSync.realmId, conn.realmId)
            ))
            .limit(1);
          
          if (!existingPayment) {
            // Sync payment
            const paidDate = invoice.paidAt ? new Date(invoice.paidAt) : undefined;
            const paymentResult = await syncPaymentToQuickBooks(
              invoice.id,
              invoice.total,
              paidDate,
              conn
            );
            if (paymentResult.success) {
              paymentsSynced++;
              console.log(`[QuickBooks] Synced payment for invoice ${invoice.invoiceNumber}`);
            } else {
              console.warn(`[QuickBooks] Failed to sync payment for ${invoice.invoiceNumber}: ${paymentResult.error}`);
            }
          }
        }
      } else {
        failed++;
        errors.push(`${invoice.invoiceNumber}: ${result.error}`);
      }
    }
    
    // Add delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < invoices.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  // Update log
  await db.update(quickbooksSyncLog)
    .set({
      status: failed === 0 ? "completed" : "failed",
      recordsProcessed: succeeded,
      recordsFailed: failed,
      errorMessage: errors.length > 0 ? errors.slice(0, 10).join("; ") : null,
      completedAt: new Date()
    })
    .where(eq(quickbooksSyncLog.id, logEntry.id));
  
  console.log(`[QuickBooks] Invoice sync complete: ${succeeded} succeeded, ${failed} failed, ${paymentsSynced} payments synced`);
  
  return { processed: invoices.length, succeeded, failed, errors, paymentsSynced };
}

// =============================================
// PAYMENT SYNC
// =============================================

export async function syncPaymentToQuickBooks(
  invoiceId: string,
  paymentAmount: string,
  paymentDate?: Date,
  connection?: QuickbooksConnection
): Promise<{ success: boolean; quickbooksId?: string; error?: string }> {
  try {
    const conn = connection || await getActiveConnection();
    if (!conn) {
      return { success: false, error: "No active QuickBooks connection" };
    }
    
    // Get invoice sync mapping
    const [invoiceSync] = await db.select()
      .from(quickbooksInvoiceSync)
      .where(and(
        eq(quickbooksInvoiceSync.crmInvoiceId, invoiceId),
        eq(quickbooksInvoiceSync.realmId, conn.realmId)
      ))
      .limit(1);
    
    if (!invoiceSync) {
      // Need to sync invoice first
      const invoiceResult = await syncInvoiceToQuickBooks(invoiceId, conn);
      if (!invoiceResult.success) {
        return { success: false, error: `Invoice sync failed: ${invoiceResult.error}` };
      }
    }
    
    // Get updated invoice sync
    const [updatedInvoiceSync] = await db.select()
      .from(quickbooksInvoiceSync)
      .where(and(
        eq(quickbooksInvoiceSync.crmInvoiceId, invoiceId),
        eq(quickbooksInvoiceSync.realmId, conn.realmId)
      ))
      .limit(1);
    
    if (!updatedInvoiceSync) {
      return { success: false, error: "Failed to get invoice sync mapping" };
    }
    
    // Get invoice to get customer
    const [invoice] = await db.select()
      .from(crmInvoices)
      .where(eq(crmInvoices.id, invoiceId))
      .limit(1);
    
    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }
    
    if (!invoice.customerId) {
      return { success: false, error: "Invoice has no associated customer" };
    }
    
    // Get customer sync mapping
    const [customerSync] = await db.select()
      .from(quickbooksCustomerSync)
      .where(and(
        eq(quickbooksCustomerSync.crmCustomerId, invoice.customerId),
        eq(quickbooksCustomerSync.realmId, conn.realmId)
      ))
      .limit(1);
    
    if (!customerSync) {
      return { success: false, error: "Customer not synced to QuickBooks" };
    }
    
    const qbo = getQuickBooksClient(conn);
    const amount = parseFloat(paymentAmount);
    
    // Build QuickBooks payment
    const qbPayment: any = {
      CustomerRef: { value: customerSync.quickbooksCustomerId },
      TotalAmt: amount,
      TxnDate: paymentDate 
        ? paymentDate.toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0],
      Line: [{
        Amount: amount,
        LinkedTxn: [{
          TxnId: updatedInvoiceSync.quickbooksInvoiceId,
          TxnType: "Invoice"
        }]
      }]
    };
    
    return new Promise((resolve) => {
      qbo.createPayment(qbPayment, async (err: any, created: any) => {
        if (err) {
          console.error("[QuickBooks] Error creating payment:", err);
          resolve({ success: false, error: err.message || "Failed to create payment" });
          return;
        }
        
        await db.insert(quickbooksPaymentSync)
          .values({
            crmInvoiceId: invoiceId,
            quickbooksPaymentId: created.Id,
            realmId: conn.realmId,
            amount: paymentAmount,
            syncStatus: "synced",
            lastSyncAt: new Date()
          });
        
        console.log(`[QuickBooks] Created payment for invoice ${invoice.invoiceNumber} (QB ID: ${created.Id})`);
        resolve({ success: true, quickbooksId: created.Id });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Payment sync error:", error);
    return { success: false, error: error.message || "Sync failed" };
  }
}

// =============================================
// CONNECTION STATUS
// =============================================

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  connection?: QuickbooksConnection;
  syncStats?: {
    customers: number;
    invoices: number;
    payments: number;
    totalCustomers: number;
    totalInvoices: number;
  };
}> {
  const connection = await getActiveConnection();
  
  if (!connection) {
    return { connected: false };
  }
  
  // Get sync counts - only count successfully synced records for current realm
  let customerCount = 0;
  let invoiceCount = 0;
  let paymentCount = 0;
  let totalCustomers = 0;
  let totalInvoices = 0;
  
  try {
    const [customerResult] = await db.select({ count: db.$count(quickbooksCustomerSync) })
      .from(quickbooksCustomerSync)
      .where(and(
        eq(quickbooksCustomerSync.realmId, connection.realmId),
        eq(quickbooksCustomerSync.syncStatus, "synced")
      ));
    customerCount = customerResult?.count ?? 0;
    
    const [invoiceResult] = await db.select({ count: db.$count(quickbooksInvoiceSync) })
      .from(quickbooksInvoiceSync)
      .where(and(
        eq(quickbooksInvoiceSync.realmId, connection.realmId),
        eq(quickbooksInvoiceSync.syncStatus, "synced")
      ));
    invoiceCount = invoiceResult?.count ?? 0;
    
    const [paymentResult] = await db.select({ count: db.$count(quickbooksPaymentSync) })
      .from(quickbooksPaymentSync)
      .where(and(
        eq(quickbooksPaymentSync.realmId, connection.realmId),
        eq(quickbooksPaymentSync.syncStatus, "synced")
      ));
    paymentCount = paymentResult?.count ?? 0;
    
    // Get total CRM records
    const [totalCustomerResult] = await db.select({ count: db.$count(crmCustomers) })
      .from(crmCustomers);
    totalCustomers = totalCustomerResult?.count ?? 0;
    
    const [totalInvoiceResult] = await db.select({ count: db.$count(crmInvoices) })
      .from(crmInvoices);
    totalInvoices = totalInvoiceResult?.count ?? 0;
  } catch (err) {
    console.error("[QuickBooks] Error getting sync counts:", err);
  }
  
  return {
    connected: true,
    connection,
    syncStats: {
      customers: customerCount,
      invoices: invoiceCount,
      payments: paymentCount,
      totalCustomers,
      totalInvoices
    }
  };
}

export async function getSyncLogs(limit: number = 20): Promise<any[]> {
  const logs = await db.select()
    .from(quickbooksSyncLog)
    .orderBy(quickbooksSyncLog.startedAt)
    .limit(limit);
  
  return logs;
}

// =============================================
// CLASS SYNC
// =============================================

export async function getLocalClasses(): Promise<QuickbooksClass[]> {
  return db.select().from(quickbooksClasses).where(eq(quickbooksClasses.isActive, true));
}

export async function getAllLocalClasses(): Promise<QuickbooksClass[]> {
  return db.select().from(quickbooksClasses);
}

export async function pullClassesFromQuickBooks(
  connection?: QuickbooksConnection
): Promise<{ success: boolean; classesImported: number; error?: string }> {
  try {
    const conn = connection || await getActiveConnection();
    if (!conn) {
      return { success: false, classesImported: 0, error: "No active QuickBooks connection" };
    }
    
    const qbo = getQuickBooksClient(conn);
    
    return new Promise((resolve) => {
      qbo.findClasses({}, async (err: any, result: any) => {
        if (err) {
          console.error("[QuickBooks] Error fetching classes:", err);
          resolve({ success: false, classesImported: 0, error: err.message || "Failed to fetch classes" });
          return;
        }
        
        const qbClasses = result?.QueryResponse?.Class || [];
        let imported = 0;
        
        for (const qbClass of qbClasses) {
          const existing = await db.select()
            .from(quickbooksClasses)
            .where(and(
              eq(quickbooksClasses.quickbooksClassId, qbClass.Id),
              eq(quickbooksClasses.realmId, conn.realmId)
            ))
            .limit(1);
          
          if (existing.length > 0) {
            await db.update(quickbooksClasses)
              .set({
                name: qbClass.Name || qbClass.FullyQualifiedName,
                syncToken: qbClass.SyncToken,
                isActive: qbClass.Active !== false,
                lastSyncedAt: new Date(),
                updatedAt: new Date()
              })
              .where(eq(quickbooksClasses.id, existing[0].id));
          } else {
            const classType = parseClassType(qbClass.Name);
            const subType = parseSubType(qbClass.Name);
            
            await db.insert(quickbooksClasses)
              .values({
                name: qbClass.Name || qbClass.FullyQualifiedName,
                classType,
                subType,
                quickbooksClassId: qbClass.Id,
                realmId: conn.realmId,
                syncToken: qbClass.SyncToken,
                isActive: qbClass.Active !== false,
                lastSyncedAt: new Date()
              });
            imported++;
          }
        }
        
        console.log(`[QuickBooks] Pulled ${qbClasses.length} classes, imported ${imported} new`);
        resolve({ success: true, classesImported: imported });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Pull classes error:", error);
    return { success: false, classesImported: 0, error: error.message || "Pull failed" };
  }
}

function parseClassType(name: string): "Service" | "Install" | "Maintenance" | "Discount" {
  const lower = name.toLowerCase();
  if (lower.includes("service")) return "Service";
  if (lower.includes("install")) return "Install";
  if (lower.includes("maintenance")) return "Maintenance";
  if (lower.includes("discount")) return "Discount";
  return "Service";
}

function parseSubType(name: string): "Residential" | "Commercial" | "Crawlspace" | "Promotional" | "Maintenance" {
  const lower = name.toLowerCase();
  if (lower.includes("residential")) return "Residential";
  if (lower.includes("commercial")) return "Commercial";
  if (lower.includes("crawlspace")) return "Crawlspace";
  if (lower.includes("promotional")) return "Promotional";
  if (lower.includes("maintenance") && lower.includes("discount")) return "Maintenance";
  return "Residential";
}

export async function pushClassToQuickBooks(
  classId: string,
  connection?: QuickbooksConnection
): Promise<{ success: boolean; quickbooksId?: string; error?: string }> {
  try {
    const conn = connection || await getActiveConnection();
    if (!conn) {
      return { success: false, error: "No active QuickBooks connection" };
    }
    
    const [localClass] = await db.select()
      .from(quickbooksClasses)
      .where(eq(quickbooksClasses.id, classId))
      .limit(1);
    
    if (!localClass) {
      return { success: false, error: "Class not found" };
    }
    
    const qbo = getQuickBooksClient(conn);
    
    const qbClass: any = {
      Name: localClass.name,
      Active: localClass.isActive
    };
    
    return new Promise((resolve) => {
      if (localClass.quickbooksClassId) {
        qbClass.Id = localClass.quickbooksClassId;
        qbClass.sparse = true;
        
        qbo.getClass(localClass.quickbooksClassId, async (err: any, existing: any) => {
          if (err) {
            console.error("[QuickBooks] Error fetching class:", err);
            resolve({ success: false, error: err.message || "Failed to fetch class" });
            return;
          }
          
          qbClass.SyncToken = existing.SyncToken;
          
          qbo.updateClass(qbClass, async (updateErr: any, updated: any) => {
            if (updateErr) {
              console.error("[QuickBooks] Error updating class:", updateErr);
              resolve({ success: false, error: updateErr.message || "Failed to update class" });
              return;
            }
            
            await db.update(quickbooksClasses)
              .set({
                syncToken: updated.SyncToken,
                lastSyncedAt: new Date(),
                updatedAt: new Date()
              })
              .where(eq(quickbooksClasses.id, classId));
            
            console.log(`[QuickBooks] Updated class ${localClass.name} (QB ID: ${updated.Id})`);
            resolve({ success: true, quickbooksId: updated.Id });
          });
        });
      } else {
        qbo.createClass(qbClass, async (err: any, created: any) => {
          if (err) {
            console.error("[QuickBooks] Error creating class:", err);
            resolve({ success: false, error: err.message || "Failed to create class" });
            return;
          }
          
          await db.update(quickbooksClasses)
            .set({
              quickbooksClassId: created.Id,
              realmId: conn.realmId,
              syncToken: created.SyncToken,
              lastSyncedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(quickbooksClasses.id, classId));
          
          console.log(`[QuickBooks] Created class ${localClass.name} (QB ID: ${created.Id})`);
          resolve({ success: true, quickbooksId: created.Id });
        });
      }
    });
  } catch (error: any) {
    console.error("[QuickBooks] Push class error:", error);
    return { success: false, error: error.message || "Push failed" };
  }
}

export async function syncAllClassesToQuickBooks(
  connection?: QuickbooksConnection
): Promise<{ success: boolean; synced: number; errors: number; error?: string }> {
  try {
    const conn = connection || await getActiveConnection();
    if (!conn) {
      return { success: false, synced: 0, errors: 0, error: "No active QuickBooks connection" };
    }
    
    const classes = await db.select()
      .from(quickbooksClasses)
      .where(eq(quickbooksClasses.isActive, true));
    
    let synced = 0;
    let errors = 0;
    
    for (const cls of classes) {
      const result = await pushClassToQuickBooks(cls.id, conn);
      if (result.success) {
        synced++;
      } else {
        errors++;
      }
    }
    
    console.log(`[QuickBooks] Synced ${synced} classes, ${errors} errors`);
    return { success: errors === 0, synced, errors };
  } catch (error: any) {
    console.error("[QuickBooks] Sync all classes error:", error);
    return { success: false, synced: 0, errors: 0, error: error.message || "Sync failed" };
  }
}

// =============================================
// CATEGORY-CLASS MAPPING
// =============================================

export async function getCategoryClassMappings(realmId?: string): Promise<QuickbooksCategoryClassMap[]> {
  const conn = await getActiveConnection();
  const realm = realmId || conn?.realmId;
  
  if (!realm) {
    return [];
  }
  
  return db.select()
    .from(quickbooksCategoryClassMap)
    .where(eq(quickbooksCategoryClassMap.realmId, realm));
}

export async function saveCategoryClassMapping(
  categoryName: string,
  classId: string | null,
  realmId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const conn = await getActiveConnection();
    const realm = realmId || conn?.realmId;
    
    if (!realm) {
      return { success: false, error: "No active QuickBooks connection" };
    }
    
    const existing = await db.select()
      .from(quickbooksCategoryClassMap)
      .where(and(
        eq(quickbooksCategoryClassMap.categoryName, categoryName),
        eq(quickbooksCategoryClassMap.realmId, realm)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      if (classId === null) {
        await db.delete(quickbooksCategoryClassMap)
          .where(eq(quickbooksCategoryClassMap.id, existing[0].id));
      } else {
        await db.update(quickbooksCategoryClassMap)
          .set({
            quickbooksClassId: classId,
            updatedAt: new Date()
          })
          .where(eq(quickbooksCategoryClassMap.id, existing[0].id));
      }
    } else if (classId !== null) {
      await db.insert(quickbooksCategoryClassMap)
        .values({
          categoryName,
          quickbooksClassId: classId,
          realmId: realm
        });
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("[QuickBooks] Save category mapping error:", error);
    return { success: false, error: error.message || "Save failed" };
  }
}

export async function getClassForCategory(categoryName: string, realmId?: string): Promise<QuickbooksClass | null> {
  const conn = await getActiveConnection();
  const realm = realmId || conn?.realmId;
  
  if (!realm) {
    return null;
  }
  
  const [mapping] = await db.select()
    .from(quickbooksCategoryClassMap)
    .where(and(
      eq(quickbooksCategoryClassMap.categoryName, categoryName),
      eq(quickbooksCategoryClassMap.realmId, realm)
    ))
    .limit(1);
  
  if (!mapping || !mapping.quickbooksClassId) {
    const [defaultMapping] = await db.select()
      .from(quickbooksCategoryClassMap)
      .where(and(
        eq(quickbooksCategoryClassMap.isDefault, true),
        eq(quickbooksCategoryClassMap.realmId, realm)
      ))
      .limit(1);
    
    if (!defaultMapping || !defaultMapping.quickbooksClassId) {
      return null;
    }
    
    const [defaultClass] = await db.select()
      .from(quickbooksClasses)
      .where(eq(quickbooksClasses.id, defaultMapping.quickbooksClassId))
      .limit(1);
    
    return defaultClass || null;
  }
  
  const [cls] = await db.select()
    .from(quickbooksClasses)
    .where(eq(quickbooksClasses.id, mapping.quickbooksClassId))
    .limit(1);
  
  return cls || null;
}

// ============================================
// AUTOMATIC SYNC TRIGGERS (fire-and-forget)
// ============================================

/**
 * Automatically sync a customer to QuickBooks when created/updated.
 * This is a fire-and-forget operation - it won't block the main request.
 */
export async function autoSyncCustomer(customerId: string): Promise<void> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return; // No active connection, skip sync
    }
    
    // Fire and forget - don't await
    syncCustomerToQuickBooks(customerId).then(result => {
      if (result.success) {
        console.log(`[QuickBooks Auto] Customer ${customerId} synced successfully`);
      } else {
        console.log(`[QuickBooks Auto] Customer ${customerId} sync failed: ${result.error}`);
      }
    }).catch(err => {
      console.error(`[QuickBooks Auto] Customer ${customerId} sync error:`, err);
    });
  } catch (error) {
    console.error("[QuickBooks Auto] Customer sync trigger error:", error);
  }
}

/**
 * Automatically sync an invoice to QuickBooks when created/updated.
 * This is a fire-and-forget operation - it won't block the main request.
 * Ensures customer is synced first if needed.
 */
export async function autoSyncInvoice(invoiceId: string): Promise<void> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return; // No active connection, skip sync
    }
    
    // Get invoice to find customer
    const [invoice] = await db.select()
      .from(crmInvoices)
      .where(eq(crmInvoices.id, invoiceId))
      .limit(1);
    
    if (!invoice || !invoice.customerId) {
      return;
    }
    
    // Fire and forget - sync customer first, then invoice
    (async () => {
      try {
        // Ensure customer is synced first
        const customerResult = await syncCustomerToQuickBooks(invoice.customerId!);
        if (!customerResult.success) {
          console.log(`[QuickBooks Auto] Invoice ${invoiceId} skipped - customer sync failed: ${customerResult.error}`);
          return;
        }
        
        // Now sync the invoice
        const invoiceResult = await syncInvoiceToQuickBooks(invoiceId);
        if (invoiceResult.success) {
          console.log(`[QuickBooks Auto] Invoice ${invoiceId} synced successfully`);
        } else {
          console.log(`[QuickBooks Auto] Invoice ${invoiceId} sync failed: ${invoiceResult.error}`);
        }
      } catch (err) {
        console.error(`[QuickBooks Auto] Invoice ${invoiceId} sync error:`, err);
      }
    })();
  } catch (error) {
    console.error("[QuickBooks Auto] Invoice sync trigger error:", error);
  }
}

/**
 * Check if QuickBooks is connected
 */
export async function isQuickBooksConnected(): Promise<boolean> {
  try {
    const conn = await getActiveConnection();
    return !!conn;
  } catch {
    return false;
  }
}

/**
 * Void an invoice in QuickBooks when it's voided/deleted in CRM.
 * QuickBooks prefers voiding over deleting - deleted invoices cannot be recovered.
 */
export async function voidInvoiceInQuickBooks(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return { success: true }; // No connection, nothing to do
    }
    
    // Check if this invoice was synced to QuickBooks
    const [syncRecord] = await db.select()
      .from(quickbooksInvoiceSync)
      .where(eq(quickbooksInvoiceSync.crmInvoiceId, invoiceId))
      .limit(1);
    
    if (!syncRecord || !syncRecord.quickbooksInvoiceId) {
      return { success: true }; // Never synced, nothing to do
    }
    
    const qbo = getQuickBooksClient(conn);
    
    return new Promise((resolve) => {
      // First get the invoice to get SyncToken
      qbo.getInvoice(syncRecord.quickbooksInvoiceId, async (err: any, invoice: any) => {
        if (err) {
          // If 404, invoice already deleted in QB
          if (err.statusCode === 404 || err.message?.includes('not found')) {
            await db.update(quickbooksInvoiceSync)
              .set({ syncStatus: "error", lastError: "Voided/deleted", updatedAt: new Date() })
              .where(eq(quickbooksInvoiceSync.id, syncRecord.id));
            resolve({ success: true });
            return;
          }
          resolve({ success: false, error: err.message || "Failed to fetch invoice" });
          return;
        }
        
        // Void the invoice
        const voidInvoiceData = {
          Id: invoice.Id,
          SyncToken: invoice.SyncToken,
          sparse: true
        };
        
        // @ts-ignore - voidInvoice exists in node-quickbooks but not in the type definitions
        qbo.voidInvoice(voidInvoiceData, async (voidErr: any, voided: any) => {
          if (voidErr) {
            console.error("[QuickBooks] Error voiding invoice:", voidErr);
            resolve({ success: false, error: voidErr.message || "Failed to void invoice" });
            return;
          }
          
          // Update sync record
          await db.update(quickbooksInvoiceSync)
            .set({ 
              syncStatus: "error", 
              lastError: "Voided in QuickBooks",
              lastSyncAt: new Date(),
              updatedAt: new Date() 
            })
            .where(eq(quickbooksInvoiceSync.id, syncRecord.id));
          
          console.log(`[QuickBooks] Voided invoice (QB ID: ${invoice.Id})`);
          resolve({ success: true });
        });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Void invoice error:", error);
    return { success: false, error: error.message || "Void failed" };
  }
}

/**
 * Auto void invoice in QuickBooks (fire-and-forget)
 */
export async function autoVoidInvoice(invoiceId: string): Promise<void> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return;
    }
    
    // Fire and forget
    voidInvoiceInQuickBooks(invoiceId).then(result => {
      if (result.success) {
        console.log(`[QuickBooks Auto] Invoice ${invoiceId} voided in QuickBooks`);
      } else {
        console.log(`[QuickBooks Auto] Invoice ${invoiceId} void failed: ${result.error}`);
      }
    }).catch(err => {
      console.error(`[QuickBooks Auto] Invoice ${invoiceId} void error:`, err);
    });
  } catch (error) {
    console.error("[QuickBooks Auto] Invoice void trigger error:", error);
  }
}

/**
 * Delete an invoice from QuickBooks when it's deleted in CRM.
 * QuickBooks API uses DELETE method with Id and SyncToken.
 */
export async function deleteInvoiceFromQuickBooks(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return { success: true }; // No connection, nothing to do
    }
    
    // Check if this invoice was synced to QuickBooks
    const [syncRecord] = await db.select()
      .from(quickbooksInvoiceSync)
      .where(eq(quickbooksInvoiceSync.crmInvoiceId, invoiceId))
      .limit(1);
    
    if (!syncRecord || !syncRecord.quickbooksInvoiceId) {
      return { success: true }; // Never synced, nothing to do
    }
    
    const qbo = getQuickBooksClient(conn);
    
    return new Promise((resolve) => {
      // First get the invoice to get SyncToken
      qbo.getInvoice(syncRecord.quickbooksInvoiceId, async (err: any, invoice: any) => {
        if (err) {
          // If 404, invoice already deleted in QB - clean up sync record
          if (err.statusCode === 404 || err.message?.includes('not found')) {
            await db.delete(quickbooksInvoiceSync)
              .where(eq(quickbooksInvoiceSync.id, syncRecord.id));
            resolve({ success: true });
            return;
          }
          resolve({ success: false, error: err.message || "Failed to fetch invoice" });
          return;
        }
        
        // Try to delete the invoice first (QuickBooks will reject if it has linked payments/credits)
        const deleteInvoiceData = {
          Id: invoice.Id,
          SyncToken: invoice.SyncToken
        };
        
        // @ts-ignore - deleteInvoice exists in node-quickbooks but not in the type definitions
        qbo.deleteInvoice(deleteInvoiceData, async (deleteErr: any, deleted: any) => {
          if (deleteErr) {
            // Check if delete failed due to linked transactions (payments, credits, refunds)
            // Common error codes: 6270, 610, 6200 for linked transaction errors
            const errorCode = deleteErr?.Fault?.Error?.[0]?.code || "";
            const errorMessage = deleteErr?.Fault?.Error?.[0]?.Message || deleteErr.message || "";
            const hasLinkedTxn = invoice.LinkedTxn && invoice.LinkedTxn.length > 0;
            
            // If delete failed due to linked payments/credits, fall back to void
            if (hasLinkedTxn || 
                errorCode === "6270" || errorCode === "610" || errorCode === "6200" ||
                errorMessage.toLowerCase().includes("linked") ||
                errorMessage.toLowerCase().includes("payment") ||
                errorMessage.toLowerCase().includes("delete")) {
              
              console.log(`[QuickBooks] Invoice ${invoice.Id} has linked transactions or cannot be deleted, voiding instead...`);
              
              const voidInvoiceData = {
                Id: invoice.Id,
                SyncToken: invoice.SyncToken,
                sparse: true
              };
              
              // @ts-ignore - voidInvoice exists in node-quickbooks but not in the type definitions
              qbo.voidInvoice(voidInvoiceData, async (voidErr: any, voided: any) => {
                if (voidErr) {
                  console.error("[QuickBooks] Error voiding invoice:", voidErr);
                  resolve({ success: false, error: voidErr.message || "Failed to void invoice (delete also failed)" });
                  return;
                }
                
                // Delete the sync record since invoice is voided
                await db.delete(quickbooksInvoiceSync)
                  .where(eq(quickbooksInvoiceSync.id, syncRecord.id));
                
                console.log(`[QuickBooks] Voided invoice (QB ID: ${invoice.Id}) - had linked payments/credits`);
                resolve({ success: true });
              });
            } else {
              // Unknown error - report it
              console.error("[QuickBooks] Error deleting invoice:", deleteErr);
              resolve({ success: false, error: errorMessage || "Failed to delete invoice" });
            }
            return;
          }
          
          // Delete succeeded - clean up sync record
          await db.delete(quickbooksInvoiceSync)
            .where(eq(quickbooksInvoiceSync.id, syncRecord.id));
          
          console.log(`[QuickBooks] Deleted invoice (QB ID: ${invoice.Id})`);
          resolve({ success: true });
        });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Delete invoice error:", error);
    return { success: false, error: error.message || "Delete failed" };
  }
}

/**
 * Auto delete invoice from QuickBooks (fire-and-forget)
 */
export async function autoDeleteInvoice(invoiceId: string): Promise<void> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return;
    }
    
    // Fire and forget
    deleteInvoiceFromQuickBooks(invoiceId).then(result => {
      if (result.success) {
        console.log(`[QuickBooks Auto] Invoice ${invoiceId} deleted from QuickBooks`);
      } else {
        console.log(`[QuickBooks Auto] Invoice ${invoiceId} delete failed: ${result.error}`);
      }
    }).catch(err => {
      console.error(`[QuickBooks Auto] Invoice ${invoiceId} delete error:`, err);
    });
  } catch (error) {
    console.error("[QuickBooks Auto] Invoice delete trigger error:", error);
  }
}

/**
 * Automatically sync a payment to QuickBooks when an invoice is paid.
 * This is a fire-and-forget operation - it won't block the main request.
 */
export async function autoSyncPayment(invoiceId: string, paymentAmount: string): Promise<void> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return; // No active connection, skip sync
    }
    
    // Fire and forget
    (async () => {
      try {
        // Sync payment to QuickBooks
        const result = await syncPaymentToQuickBooks(invoiceId, paymentAmount, new Date());
        if (result.success) {
          console.log(`[QuickBooks Auto] Payment for invoice ${invoiceId} synced (QB ID: ${result.quickbooksId})`);
        } else {
          console.log(`[QuickBooks Auto] Payment sync failed for invoice ${invoiceId}: ${result.error}`);
        }
      } catch (err) {
        console.error(`[QuickBooks Auto] Payment sync error for invoice ${invoiceId}:`, err);
      }
    })();
  } catch (error) {
    console.error("[QuickBooks Auto] Payment sync trigger error:", error);
  }
}

// =============================================
// BACKGROUND SYNC JOB
// =============================================

const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 2000;
let isSyncRunning = false;

/**
 * Sync all unsynced customers to QuickBooks in batches.
 * Only syncs customers that haven't been synced or haven't failed permanently.
 */
export async function syncAllUnsyncedCustomers(): Promise<{ synced: number; failed: number; total: number }> {
  const conn = await getActiveConnection();
  if (!conn) {
    console.log("[QuickBooks Background] No active connection, skipping customer sync");
    return { synced: 0, failed: 0, total: 0 };
  }
  
  // Find customers that are NOT in the sync table for this realm (including failed ones)
  // We exclude records that already exist in the sync table (whether synced or failed)
  const existingCustomerIds = db.select({ id: quickbooksCustomerSync.crmCustomerId })
    .from(quickbooksCustomerSync)
    .where(eq(quickbooksCustomerSync.realmId, conn.realmId));
  
  const unsyncedCustomers = await db.select({ id: crmCustomers.id })
    .from(crmCustomers)
    .where(sql`${crmCustomers.id} NOT IN (${existingCustomerIds})`)
    .limit(500); // Process up to 500 per run
  
  if (unsyncedCustomers.length === 0) {
    return { synced: 0, failed: 0, total: 0 };
  }
  
  console.log(`[QuickBooks Background] Found ${unsyncedCustomers.length} unsynced customers`);
  
  let synced = 0;
  let failed = 0;
  
  for (let i = 0; i < unsyncedCustomers.length; i += BATCH_SIZE) {
    const batch = unsyncedCustomers.slice(i, i + BATCH_SIZE);
    
    for (const customer of batch) {
      try {
        const result = await syncCustomerToQuickBooks(customer.id, conn);
        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }
    
    // Delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < unsyncedCustomers.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }
  
  console.log(`[QuickBooks Background] Customer sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed, total: unsyncedCustomers.length };
}

/**
 * Sync all unsynced invoices to QuickBooks in batches.
 * Only syncs invoices that have a customer (required for QB) and haven't been attempted before.
 */
export async function syncAllUnsyncedInvoices(): Promise<{ synced: number; failed: number; total: number }> {
  const conn = await getActiveConnection();
  if (!conn) {
    console.log("[QuickBooks Background] No active connection, skipping invoice sync");
    return { synced: 0, failed: 0, total: 0 };
  }
  
  // Find invoices that are NOT in the sync table for this realm (including failed ones)
  const existingInvoiceIds = db.select({ id: quickbooksInvoiceSync.crmInvoiceId })
    .from(quickbooksInvoiceSync)
    .where(eq(quickbooksInvoiceSync.realmId, conn.realmId));
  
  const unsyncedInvoices = await db.select({ id: crmInvoices.id, customerId: crmInvoices.customerId })
    .from(crmInvoices)
    .where(and(
      sql`${crmInvoices.id} NOT IN (${existingInvoiceIds})`,
      isNotNull(crmInvoices.customerId)
    ))
    .limit(200); // Process up to 200 per run
  
  if (unsyncedInvoices.length === 0) {
    return { synced: 0, failed: 0, total: 0 };
  }
  
  console.log(`[QuickBooks Background] Found ${unsyncedInvoices.length} unsynced invoices`);
  
  let synced = 0;
  let failed = 0;
  
  for (let i = 0; i < unsyncedInvoices.length; i += BATCH_SIZE) {
    const batch = unsyncedInvoices.slice(i, i + BATCH_SIZE);
    
    for (const invoice of batch) {
      try {
        // Ensure customer is synced first
        if (invoice.customerId) {
          await syncCustomerToQuickBooks(invoice.customerId, conn);
        }
        
        const result = await syncInvoiceToQuickBooks(invoice.id, conn);
        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }
    
    // Delay between batches
    if (i + BATCH_SIZE < unsyncedInvoices.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }
  
  console.log(`[QuickBooks Background] Invoice sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed, total: unsyncedInvoices.length };
}

/**
 * Sync payments for all paid invoices that don't have payment records in QuickBooks.
 */
export async function syncAllUnsyncedPayments(): Promise<{ synced: number; failed: number; total: number }> {
  const conn = await getActiveConnection();
  if (!conn) {
    console.log("[QuickBooks Background] No active connection, skipping payment sync");
    return { synced: 0, failed: 0, total: 0 };
  }
  
  // Find paid invoices that are synced but don't have payment records
  const invoicesWithPayments = db.select({ id: quickbooksPaymentSync.crmInvoiceId })
    .from(quickbooksPaymentSync)
    .where(eq(quickbooksPaymentSync.realmId, conn.realmId));
  
  const paidInvoicesWithoutPaymentSync = await db.select({
    id: crmInvoices.id,
    total: crmInvoices.total,
    paidAt: crmInvoices.paidAt
  })
    .from(crmInvoices)
    .innerJoin(quickbooksInvoiceSync, and(
      eq(quickbooksInvoiceSync.crmInvoiceId, crmInvoices.id),
      eq(quickbooksInvoiceSync.realmId, conn.realmId),
      eq(quickbooksInvoiceSync.syncStatus, "synced")
    ))
    .where(and(
      eq(crmInvoices.status, "paid"),
      sql`${crmInvoices.id} NOT IN (${invoicesWithPayments})`
    ))
    .limit(100);
  
  if (paidInvoicesWithoutPaymentSync.length === 0) {
    return { synced: 0, failed: 0, total: 0 };
  }
  
  console.log(`[QuickBooks Background] Found ${paidInvoicesWithoutPaymentSync.length} paid invoices without payment sync`);
  
  let synced = 0;
  let failed = 0;
  
  for (const invoice of paidInvoicesWithoutPaymentSync) {
    try {
      const result = await syncPaymentToQuickBooks(
        invoice.id,
        invoice.total || "0",
        invoice.paidAt || new Date(),
        conn
      );
      if (result.success) {
        synced++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }
  }
  
  console.log(`[QuickBooks Background] Payment sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed, total: paidInvoicesWithoutPaymentSync.length };
}

/**
 * Run the full background sync job - syncs customers, invoices, and payments.
 * Uses a mutex to prevent concurrent sync runs.
 */
export async function runBackgroundSync(): Promise<{
  customers: { synced: number; failed: number; total: number };
  invoices: { synced: number; failed: number; total: number };
  payments: { synced: number; failed: number; total: number };
  skipped?: boolean;
}> {
  // Prevent concurrent syncs
  if (isSyncRunning) {
    console.log("[QuickBooks Background] Sync already in progress, skipping");
    return {
      customers: { synced: 0, failed: 0, total: 0 },
      invoices: { synced: 0, failed: 0, total: 0 },
      payments: { synced: 0, failed: 0, total: 0 },
      skipped: true
    };
  }
  
  isSyncRunning = true;
  
  try {
    console.log("[QuickBooks Background] Starting background sync job...");
    
    const conn = await getActiveConnection();
    if (!conn) {
      console.log("[QuickBooks Background] No active connection, skipping sync");
      return {
        customers: { synced: 0, failed: 0, total: 0 },
        invoices: { synced: 0, failed: 0, total: 0 },
        payments: { synced: 0, failed: 0, total: 0 }
      };
    }
    
    const customers = await syncAllUnsyncedCustomers();
    const invoices = await syncAllUnsyncedInvoices();
    const payments = await syncAllUnsyncedPayments();
    
    console.log(`[QuickBooks Background] Sync complete - Customers: ${customers.synced}/${customers.total}, Invoices: ${invoices.synced}/${invoices.total}, Payments: ${payments.synced}/${payments.total}`);
    
    return { customers, invoices, payments };
  } finally {
    isSyncRunning = false;
  }
}

let backgroundSyncInterval: NodeJS.Timeout | null = null;

/**
 * Start the background sync scheduler (runs every 15 minutes).
 */
export function startBackgroundSyncScheduler(): void {
  if (backgroundSyncInterval) {
    console.log("[QuickBooks Background] Scheduler already running");
    return;
  }
  
  const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  
  // Run immediately on startup
  setTimeout(() => {
    runBackgroundSync().catch(err => {
      console.error("[QuickBooks Background] Initial sync error:", err);
    });
  }, 10000); // Wait 10 seconds after startup
  
  backgroundSyncInterval = setInterval(() => {
    runBackgroundSync().catch(err => {
      console.error("[QuickBooks Background] Scheduled sync error:", err);
    });
  }, SYNC_INTERVAL_MS);
  
  console.log("[QuickBooks Background] Scheduler started (runs every 15 minutes)");
}

/**
 * Stop the background sync scheduler.
 */
export function stopBackgroundSyncScheduler(): void {
  if (backgroundSyncInterval) {
    clearInterval(backgroundSyncInterval);
    backgroundSyncInterval = null;
    console.log("[QuickBooks Background] Scheduler stopped");
  }
}

// =============================================
// QUICKBOOKS ACCOUNTS (CHART OF ACCOUNTS)
// =============================================

/**
 * Pull Income accounts from QuickBooks to populate parent accounts.
 * This imports existing accounts like Service, Install, Maintenance, Discount.
 */
export async function pullAccountsFromQuickBooks(): Promise<{ 
  success: boolean; 
  imported: number; 
  error?: string 
}> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return { success: false, imported: 0, error: "No active QuickBooks connection" };
    }
    
    const qbo = getQuickBooksClient(conn);
    
    return new Promise((resolve) => {
      // Query all Income accounts
      // @ts-ignore - findAccounts exists in node-quickbooks but not in the type definitions
      qbo.findAccounts({ AccountType: "Income" }, async (err: any, accounts: any) => {
        if (err) {
          console.error("[QuickBooks] Error fetching accounts:", err);
          resolve({ success: false, imported: 0, error: err.message || "Failed to fetch accounts" });
          return;
        }
        
        const accountList = accounts?.QueryResponse?.Account || [];
        console.log(`[QuickBooks] Found ${accountList.length} income accounts`);
        
        let imported = 0;
        
        for (const account of accountList) {
          try {
            // Check if account already exists
            const [existing] = await db.select()
              .from(quickbooksAccounts)
              .where(and(
                eq(quickbooksAccounts.quickbooksAccountId, account.Id),
                eq(quickbooksAccounts.realmId, conn.realmId)
              ))
              .limit(1);
            
            if (existing) {
              // Update existing account
              await db.update(quickbooksAccounts)
                .set({
                  name: account.Name,
                  fullyQualifiedName: account.FullyQualifiedName,
                  accountSubType: account.AccountSubType,
                  syncToken: account.SyncToken,
                  quickbooksParentAccountId: account.ParentRef?.value || null,
                  isActive: account.Active !== false,
                  currentBalance: account.CurrentBalance?.toString(),
                  lastSyncedAt: new Date(),
                  updatedAt: new Date()
                })
                .where(eq(quickbooksAccounts.id, existing.id));
            } else {
              // Determine if this is a parent account (no ParentRef)
              const isParent = !account.ParentRef;
              
              // Try to match category type based on account name
              let categoryType: "Service" | "Install" | "Maintenance" | "Discount" | null = null;
              const nameLower = account.Name.toLowerCase();
              if (nameLower.includes("service")) categoryType = "Service";
              else if (nameLower.includes("install")) categoryType = "Install";
              else if (nameLower.includes("maintenance")) categoryType = "Maintenance";
              else if (nameLower.includes("discount")) categoryType = "Discount";
              
              // Try to match property type for sub-accounts
              let propertyType: "Residential" | "Commercial" | null = null;
              if (!isParent) {
                if (nameLower.includes("residential")) propertyType = "Residential";
                else if (nameLower.includes("commercial")) propertyType = "Commercial";
              }
              
              // Insert new account
              await db.insert(quickbooksAccounts).values({
                name: account.Name,
                fullyQualifiedName: account.FullyQualifiedName,
                accountType: "Income",
                accountSubType: account.AccountSubType,
                categoryType,
                propertyType,
                isParent,
                quickbooksAccountId: account.Id,
                quickbooksParentAccountId: account.ParentRef?.value || null,
                realmId: conn.realmId,
                syncToken: account.SyncToken,
                isActive: account.Active !== false,
                currentBalance: account.CurrentBalance?.toString(),
                lastSyncedAt: new Date()
              });
              imported++;
            }
          } catch (insertErr) {
            console.error(`[QuickBooks] Error inserting account ${account.Name}:`, insertErr);
          }
        }
        
        // Link parent account IDs after all accounts are imported
        await linkParentAccountIds(conn.realmId);
        
        console.log(`[QuickBooks] Imported ${imported} new accounts`);
        resolve({ success: true, imported });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Pull accounts error:", error);
    return { success: false, imported: 0, error: error.message || "Pull failed" };
  }
}

/**
 * Link parent account IDs based on QuickBooks parent references
 */
async function linkParentAccountIds(realmId: string): Promise<void> {
  const allAccounts = await db.select()
    .from(quickbooksAccounts)
    .where(eq(quickbooksAccounts.realmId, realmId));
  
  const qbIdToLocalId = new Map<string, string>();
  for (const acc of allAccounts) {
    if (acc.quickbooksAccountId) {
      qbIdToLocalId.set(acc.quickbooksAccountId, acc.id);
    }
  }
  
  for (const acc of allAccounts) {
    if (acc.quickbooksParentAccountId) {
      const parentLocalId = qbIdToLocalId.get(acc.quickbooksParentAccountId);
      if (parentLocalId && parentLocalId !== acc.parentAccountId) {
        await db.update(quickbooksAccounts)
          .set({ parentAccountId: parentLocalId, updatedAt: new Date() })
          .where(eq(quickbooksAccounts.id, acc.id));
      }
    }
  }
}

/**
 * Create a sub-account in QuickBooks under a parent account.
 * Also auto-provisions a hidden QuickBooks Item that routes revenue to this sub-account.
 */
export async function createSubAccountInQuickBooks(
  name: string,
  parentAccountId: string,
  categoryType: "Service" | "Install" | "Maintenance" | "Discount",
  propertyType: "Residential" | "Commercial"
): Promise<{ success: boolean; accountId?: string; itemId?: string; error?: string }> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return { success: false, error: "No active QuickBooks connection" };
    }
    
    // Get parent account
    const [parentAccount] = await db.select()
      .from(quickbooksAccounts)
      .where(eq(quickbooksAccounts.id, parentAccountId))
      .limit(1);
    
    if (!parentAccount || !parentAccount.quickbooksAccountId) {
      return { success: false, error: "Parent account not found or not synced to QuickBooks" };
    }
    
    const qbo = getQuickBooksClient(conn);
    
    // Create the sub-account in QuickBooks with ServiceFeeIncome detail type
    const newAccount = {
      Name: name,
      AccountType: "Income",
      AccountSubType: "ServiceFeeIncome", // Always use Service/Fee Income as requested
      ParentRef: { value: parentAccount.quickbooksAccountId }
    };
    
    return new Promise((resolve) => {
      // @ts-ignore - createAccount exists in node-quickbooks but not in the type definitions
      qbo.createAccount(newAccount, async (err: any, account: any) => {
        if (err) {
          console.error("[QuickBooks] Error creating sub-account:", err);
          resolve({ success: false, error: err.message || "Failed to create sub-account" });
          return;
        }
        
        // Save sub-account to CRM database
        const [insertedAccount] = await db.insert(quickbooksAccounts).values({
          name: account.Name,
          fullyQualifiedName: account.FullyQualifiedName,
          accountType: "Income",
          accountSubType: account.AccountSubType,
          categoryType,
          propertyType,
          isParent: false,
          parentAccountId: parentAccountId,
          quickbooksAccountId: account.Id,
          quickbooksParentAccountId: parentAccount.quickbooksAccountId,
          realmId: conn.realmId,
          syncToken: account.SyncToken,
          isActive: true,
          lastSyncedAt: new Date()
        }).returning();
        
        console.log(`[QuickBooks] Created sub-account: ${account.FullyQualifiedName} (QB ID: ${account.Id})`);
        
        // Now auto-provision a hidden QuickBooks Item that routes to this sub-account
        const itemName = `${parentAccount.name}:${name}`;
        const qbItem = {
          Name: itemName,
          Description: `Auto-generated item for ${account.FullyQualifiedName}`,
          Type: "Service",
          IncomeAccountRef: { value: account.Id, name: account.FullyQualifiedName }
        };
        
        // @ts-ignore - createItem exists in node-quickbooks but not in the type definitions
        qbo.createItem(qbItem, async (itemErr: any, item: any) => {
          if (itemErr) {
            console.error("[QuickBooks] Error creating auto-provisioned item:", itemErr);
            // Still return success for sub-account, but note item creation failed
            resolve({ 
              success: true, 
              accountId: insertedAccount.id,
              error: "Sub-account created but auto-item creation failed"
            });
            return;
          }
          
          // Save the hidden item to CRM database
          // @ts-ignore - TypeScript inference issue inside Promise callback, types are correct
          const [insertedItem] = await db.insert(quickbooksItems).values({
            name: item.Name,
            description: item.Description || null,
            categoryType,
            propertyType,
            incomeAccountId: insertedAccount.id,
            itemType: "Service",
            quickbooksItemId: item.Id,
            quickbooksIncomeAccountId: account.Id,
            realmId: conn.realmId,
            syncToken: item.SyncToken,
            isActive: true,
            lastSyncedAt: new Date()
          }).returning();
          
          console.log(`[QuickBooks] Auto-provisioned item: ${item.Name} (QB ID: ${item.Id})`);
          resolve({ 
            success: true, 
            accountId: insertedAccount.id,
            itemId: insertedItem.id
          });
        });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Create sub-account error:", error);
    return { success: false, error: error.message || "Create failed" };
  }
}

/**
 * Get all QuickBooks accounts for a realm
 */
export async function getQuickBooksAccounts(realmId: string): Promise<QuickbooksAccount[]> {
  return db.select()
    .from(quickbooksAccounts)
    .where(and(
      eq(quickbooksAccounts.realmId, realmId),
      eq(quickbooksAccounts.isActive, true)
    ));
}

/**
 * Get parent accounts only
 */
export async function getParentAccounts(realmId: string): Promise<QuickbooksAccount[]> {
  return db.select()
    .from(quickbooksAccounts)
    .where(and(
      eq(quickbooksAccounts.realmId, realmId),
      eq(quickbooksAccounts.isParent, true),
      eq(quickbooksAccounts.isActive, true)
    ));
}

/**
 * Get sub-accounts for a parent
 */
export async function getSubAccounts(parentAccountId: string): Promise<QuickbooksAccount[]> {
  return db.select()
    .from(quickbooksAccounts)
    .where(eq(quickbooksAccounts.parentAccountId, parentAccountId));
}

/**
 * Build account lookup map for invoice sync: categoryType:propertyType -> quickbooksAccountId
 */
export async function buildAccountLookup(realmId: string): Promise<Map<string, string>> {
  const accounts = await db.select()
    .from(quickbooksAccounts)
    .where(and(
      eq(quickbooksAccounts.realmId, realmId),
      eq(quickbooksAccounts.isActive, true),
      eq(quickbooksAccounts.isParent, false)
    ));
  
  const lookup = new Map<string, string>();
  for (const acc of accounts) {
    if (acc.categoryType && acc.propertyType && acc.quickbooksAccountId) {
      const key = `${acc.categoryType}:${acc.propertyType}`;
      lookup.set(key, acc.quickbooksAccountId);
    }
  }
  
  return lookup;
}

// =============================================
// QUICKBOOKS ITEMS (PRODUCTS & SERVICES)
// =============================================

import { quickbooksItems, type QuickbooksItem, type InsertQuickbooksItem } from "@shared/schema";

/**
 * Get all QuickBooks items for a realm
 */
export async function getQuickbooksItems(realmId?: string): Promise<QuickbooksItem[]> {
  if (realmId) {
    return db.select()
      .from(quickbooksItems)
      .where(eq(quickbooksItems.realmId, realmId));
  }
  return db.select().from(quickbooksItems);
}

/**
 * Get a QuickBooks item by category and property type
 */
export async function getQuickbooksItemByMapping(
  categoryType: string,
  propertyType: string,
  realmId: string
): Promise<QuickbooksItem | null> {
  const [item] = await db.select()
    .from(quickbooksItems)
    .where(and(
      eq(quickbooksItems.categoryType, categoryType as any),
      eq(quickbooksItems.propertyType, propertyType as any),
      eq(quickbooksItems.realmId, realmId),
      eq(quickbooksItems.isActive, true)
    ))
    .limit(1);
  return item || null;
}

/**
 * Create a QuickBooks item in CRM and push to QuickBooks
 */
export async function createQuickbooksItem(
  data: InsertQuickbooksItem
): Promise<{ success: boolean; item?: QuickbooksItem; error?: string }> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return { success: false, error: "No active QuickBooks connection" };
    }
    
    // Get the linked income account for IncomeAccountRef
    let incomeAccountRef: { value: string; name?: string } | null = null;
    if (data.incomeAccountId) {
      const [account] = await db.select()
        .from(quickbooksAccounts)
        .where(eq(quickbooksAccounts.id, data.incomeAccountId))
        .limit(1);
      if (account?.quickbooksAccountId) {
        incomeAccountRef = { 
          value: account.quickbooksAccountId,
          name: account.fullyQualifiedName || account.name
        };
      }
    }
    
    const qbo = getQuickBooksClient(conn);
    
    // Create the item in QuickBooks
    const qbItem = {
      Name: data.name,
      Description: data.description || "",
      Type: data.itemType || "Service",
      ...(incomeAccountRef && { IncomeAccountRef: incomeAccountRef })
    };
    
    return new Promise((resolve) => {
      // @ts-ignore - createItem exists in node-quickbooks but not in the type definitions
      qbo.createItem(qbItem, async (err: any, item: any) => {
        if (err) {
          console.error("[QuickBooks] Error creating item:", err);
          resolve({ success: false, error: err.message || "Failed to create item" });
          return;
        }
        
        // Save to CRM database
        // @ts-ignore - TypeScript inference issue inside Promise callback, types are correct
        const [inserted] = await db.insert(quickbooksItems).values({
          name: data.name,
          description: data.description || null,
          categoryType: data.categoryType,
          propertyType: data.propertyType,
          incomeAccountId: data.incomeAccountId || null,
          itemType: data.itemType || "Service",
          quickbooksItemId: item.Id,
          quickbooksIncomeAccountId: incomeAccountRef?.value || null,
          realmId: conn.realmId,
          syncToken: item.SyncToken,
          isActive: true,
          lastSyncedAt: new Date()
        }).returning();
        
        console.log(`[QuickBooks] Created item: ${item.Name} (QB ID: ${item.Id})`);
        resolve({ success: true, item: inserted });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Create item error:", error);
    return { success: false, error: error.message || "Create failed" };
  }
}

/**
 * Pull existing items from QuickBooks
 */
export async function pullItemsFromQuickBooks(): Promise<{ 
  success: boolean; 
  imported: number; 
  error?: string 
}> {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return { success: false, imported: 0, error: "No active QuickBooks connection" };
    }
    
    const qbo = getQuickBooksClient(conn);
    
    return new Promise((resolve) => {
      // Query all Service and NonInventory items
      // @ts-ignore - findItems exists in node-quickbooks but not in the type definitions
      qbo.findItems({ Type: "Service" }, async (err: any, items: any) => {
        if (err) {
          console.error("[QuickBooks] Error fetching items:", err);
          resolve({ success: false, imported: 0, error: err.message || "Failed to fetch items" });
          return;
        }
        
        const itemList = items?.QueryResponse?.Item || [];
        console.log(`[QuickBooks] Found ${itemList.length} service items`);
        
        let imported = 0;
        
        for (const item of itemList) {
          try {
            // Check if item already exists
            const [existing] = await db.select()
              .from(quickbooksItems)
              .where(and(
                eq(quickbooksItems.quickbooksItemId, item.Id),
                eq(quickbooksItems.realmId, conn.realmId)
              ))
              .limit(1);
            
            if (existing) {
              // Update existing item
              await db.update(quickbooksItems)
                .set({
                  name: item.Name,
                  description: item.Description,
                  syncToken: item.SyncToken,
                  quickbooksIncomeAccountId: item.IncomeAccountRef?.value || null,
                  isActive: item.Active !== false,
                  unitPrice: item.UnitPrice?.toString(),
                  lastSyncedAt: new Date(),
                  updatedAt: new Date()
                })
                .where(eq(quickbooksItems.id, existing.id));
            } else {
              // Insert new item (with default category/property types that admin can update)
              await db.insert(quickbooksItems).values({
                name: item.Name,
                description: item.Description,
                categoryType: "Service", // Default - admin can update
                propertyType: "Residential", // Default - admin can update
                quickbooksItemId: item.Id,
                quickbooksIncomeAccountId: item.IncomeAccountRef?.value || null,
                realmId: conn.realmId,
                syncToken: item.SyncToken,
                itemType: item.Type,
                isActive: item.Active !== false,
                unitPrice: item.UnitPrice?.toString(),
                lastSyncedAt: new Date()
              });
              imported++;
            }
          } catch (insertErr) {
            console.error(`[QuickBooks] Error saving item ${item.Name}:`, insertErr);
          }
        }
        
        console.log(`[QuickBooks] Imported ${imported} new items`);
        resolve({ success: true, imported });
      });
    });
  } catch (error: any) {
    console.error("[QuickBooks] Pull items error:", error);
    return { success: false, imported: 0, error: error.message || "Pull failed" };
  }
}

/**
 * Update a QuickBooks item's mapping in CRM
 */
export async function updateQuickbooksItemMapping(
  itemId: string,
  updates: { 
    name?: string; 
    description?: string | null; 
    categoryType?: "Service" | "Install" | "Maintenance" | "Discount";
    propertyType?: "Residential" | "Commercial";
    incomeAccountId?: string | null;
    isActive?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.update(quickbooksItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quickbooksItems.id, itemId));
    return { success: true };
  } catch (error: any) {
    console.error("[QuickBooks] Update item error:", error);
    return { success: false, error: error.message || "Update failed" };
  }
}

/**
 * Build item lookup map for invoice sync: categoryType:propertyType -> quickbooksItemId
 */
export async function buildItemLookup(realmId: string): Promise<Map<string, string>> {
  const items = await db.select()
    .from(quickbooksItems)
    .where(and(
      eq(quickbooksItems.realmId, realmId),
      eq(quickbooksItems.isActive, true)
    ));
  
  const lookup = new Map<string, string>();
  for (const item of items) {
    if (item.categoryType && item.propertyType && item.quickbooksItemId) {
      const key = `${item.categoryType}:${item.propertyType}`;
      lookup.set(key, item.quickbooksItemId);
    }
  }
  
  return lookup;
}
