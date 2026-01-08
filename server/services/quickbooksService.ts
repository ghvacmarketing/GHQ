import QuickBooks from "node-quickbooks";
import { db } from "../db";
import { 
  quickbooksConnection, 
  quickbooksCustomerSync, 
  quickbooksInvoiceSync,
  quickbooksPaymentSync,
  quickbooksSyncLog,
  crmCustomers,
  crmInvoices,
  crmInvoiceLineItems,
  type QuickbooksConnection,
  type CrmCustomer,
  type CrmInvoice
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

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
}> {
  const conn = await getActiveConnection();
  if (!conn) {
    return { processed: 0, succeeded: 0, failed: 0, errors: ["No active QuickBooks connection"] };
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
  const customers = await db.select()
    .from(crmCustomers);
  
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (const customer of customers) {
    const result = await syncCustomerToQuickBooks(customer.id, conn);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
      errors.push(`${customer.name}: ${result.error}`);
    }
  }
  
  // Update log
  await db.update(quickbooksSyncLog)
    .set({
      status: failed === 0 ? "completed" : "failed",
      recordsProcessed: succeeded,
      recordsFailed: failed,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
      completedAt: new Date()
    })
    .where(eq(quickbooksSyncLog.id, logEntry.id));
  
  console.log(`[QuickBooks] Customer sync complete: ${succeeded} succeeded, ${failed} failed`);
  
  return { processed: customers.length, succeeded, failed, errors };
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
    
    // Fetch line items from separate table
    const lineItems = await db.select()
      .from(crmInvoiceLineItems)
      .where(eq(crmInvoiceLineItems.invoiceId, invoiceId));
    
    // Build QuickBooks invoice
    const qbInvoice: any = {
      CustomerRef: { value: updatedCustomerSync.quickbooksCustomerId },
      DocNumber: invoice.invoiceNumber,
      TxnDate: invoice.createdAt ? new Date(invoice.createdAt).toISOString().split('T')[0] : undefined,
      DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : undefined,
      Line: lineItems.map((item, index) => ({
        Amount: parseFloat(item.lineTotal || "0"),
        DetailType: "SalesItemLineDetail",
        Description: item.description || `Line item ${index + 1}`,
        SalesItemLineDetail: {
          Qty: parseFloat(item.quantity || "1"),
          UnitPrice: parseFloat(item.unitPrice || "0"),
        }
      }))
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
  };
}> {
  const connection = await getActiveConnection();
  
  if (!connection) {
    return { connected: false };
  }
  
  // Get sync counts
  const [customerCount] = await db.select({ count: db.$count(quickbooksCustomerSync) })
    .from(quickbooksCustomerSync)
    .where(eq(quickbooksCustomerSync.realmId, connection.realmId));
  
  const [invoiceCount] = await db.select({ count: db.$count(quickbooksInvoiceSync) })
    .from(quickbooksInvoiceSync)
    .where(eq(quickbooksInvoiceSync.realmId, connection.realmId));
  
  const [paymentCount] = await db.select({ count: db.$count(quickbooksPaymentSync) })
    .from(quickbooksPaymentSync)
    .where(eq(quickbooksPaymentSync.realmId, connection.realmId));
  
  return {
    connected: true,
    connection,
    syncStats: {
      customers: customerCount.count,
      invoices: invoiceCount.count,
      payments: paymentCount.count
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
