import { parse } from 'csv-parse/sync';
import { db } from '../server/db';
import { customers } from '../shared/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Create a checksum for a record to detect changes
function createChecksum(record: any): string {
  const data = JSON.stringify({
    displayName: record.displayName,
    customerType: record.customerType,
    customerStatus: record.customerStatus,
    fullAddress: record.fullAddress,
    phone: record.phone,
    email: record.email,
    leadSource: record.leadSource,
  });
  return crypto.createHash('md5').update(data).digest('hex');
}

// Normalize phone number for comparison
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, '').slice(-10); // Last 10 digits
}

// Normalize email for comparison
function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  return email.toLowerCase().trim();
}

async function importCSV() {
  const csvPath = process.argv[2] || 'attached_assets/Customers_2025-12-28_1766934928365.csv';
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });
  
  console.log(`Parsed ${records.length} records from CSV`);
  
  // Load all existing customers and build lookup maps
  console.log('Loading existing customers for deduplication...');
  const existingCustomers = await db.select().from(customers);
  console.log(`Found ${existingCustomers.length} existing customers`);
  
  // Build lookup maps for efficient matching
  const emailMap = new Map<string, typeof existingCustomers[0]>();
  const phoneMap = new Map<string, typeof existingCustomers[0]>();
  const nameAddressMap = new Map<string, typeof existingCustomers[0]>();
  
  for (const customer of existingCustomers) {
    const normEmail = normalizeEmail(customer.email);
    if (normEmail) emailMap.set(normEmail, customer);
    
    const normPhone = normalizePhone(customer.phone);
    if (normPhone) phoneMap.set(normPhone, customer);
    
    const key = `${customer.displayName}|${customer.fullAddress || ''}`;
    nameAddressMap.set(key, customer);
  }
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let prospects = 0;
  let customersCount = 0;
  
  // Process records one by one for proper upsert logic
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const displayName = record['Display Name']?.trim() || 'Unknown';
    let customerType = record['Customer Type']?.trim() || 'Residential';
    let customerStatus = record['Customer Status']?.trim() || 'Customer';
    const fullAddress = record['Full Address']?.trim() || null;
    const phone = record['Phone']?.trim() || null;
    const email = record['Email']?.trim() || null;
    const leadSource = record['Lead Source']?.trim() || null;
    
    if (!customerType) customerType = 'Residential';
    if (!customerStatus) customerStatus = 'Customer';
    
    if (customerStatus === 'Prospect') prospects++;
    else customersCount++;
    
    const customerData = {
      displayName,
      customerType,
      customerStatus,
      fullAddress,
      phone,
      email,
      leadSource,
    };
    
    const checksum = createChecksum(customerData);
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);
    
    try {
      // Find existing customer using pre-built lookup maps (efficient)
      let existingCustomer: typeof existingCustomers[0] | null = null;
      
      // Try to find by normalized email first
      if (normalizedEmail) {
        existingCustomer = emailMap.get(normalizedEmail) || null;
      }
      
      // If not found by email, try normalized phone
      if (!existingCustomer && normalizedPhone) {
        existingCustomer = phoneMap.get(normalizedPhone) || null;
      }
      
      // If still not found, try displayName + address combo
      if (!existingCustomer) {
        const key = `${displayName}|${fullAddress || ''}`;
        existingCustomer = nameAddressMap.get(key) || null;
      }
      
      if (existingCustomer) {
        // Check if data changed using checksum
        if (existingCustomer.checksum === checksum) {
          skipped++;
        } else {
          // Update existing customer
          await db.update(customers)
            .set({ ...customerData, checksum, lastSyncedAt: new Date() })
            .where(eq(customers.id, existingCustomer.id));
          updated++;
        }
      } else {
        // Insert new customer
        const [newCustomer] = await db.insert(customers).values({ ...customerData, checksum }).returning();
        created++;
        
        // Add to lookup maps for deduplication within the same batch
        if (normalizedEmail) emailMap.set(normalizedEmail, newCustomer);
        if (normalizedPhone) phoneMap.set(normalizedPhone, newCustomer);
        const key = `${displayName}|${fullAddress || ''}`;
        nameAddressMap.set(key, newCustomer);
      }
      
      if ((i + 1) % 100 === 0) {
        console.log(`Processed ${i + 1}/${records.length} records (Created: ${created}, Updated: ${updated}, Skipped: ${skipped})`);
      }
    } catch (err: any) {
      console.error(`Error processing record ${i + 1}:`, err.message);
    }
  }
  
  console.log('\n=== Import Summary ===');
  console.log(`Total records: ${records.length}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (unchanged): ${skipped}`);
  console.log(`Prospects: ${prospects}, Customers: ${customersCount}`);
  process.exit(0);
}

importCSV().catch(console.error);
