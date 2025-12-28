import { parse } from 'csv-parse/sync';
import { db } from '../server/db';
import { customers } from '../shared/schema';
import * as fs from 'fs';

async function importCSV() {
  const csvContent = fs.readFileSync('attached_assets/Customers_2025-12-28_1766934928365.csv', 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });
  
  console.log(`Parsed ${records.length} records`);
  
  let inserted = 0;
  let prospects = 0;
  let customersCount = 0;
  
  // Build batch insert values
  const batchSize = 500;
  const values: any[] = [];
  
  for (const record of records) {
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
    
    values.push({
      displayName,
      customerType,
      customerStatus,
      fullAddress,
      phone,
      email,
      leadSource,
    });
  }
  
  // Insert in batches
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    try {
      await db.insert(customers).values(batch);
      inserted += batch.length;
      console.log(`Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(values.length/batchSize)}`);
    } catch (err: any) {
      console.error('Batch insert error:', err.message);
    }
  }
  
  console.log(`Inserted ${inserted} customers. Prospects: ${prospects}, Customers: ${customersCount}`);
  process.exit(0);
}

importCSV().catch(console.error);
