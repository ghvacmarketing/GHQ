import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: {
    logQuery(query, params) {
      // Log ALL SQL touching pricebook_packages for comprehensive debugging
      if (query.includes('pricebook_packages')) {
        console.log('[Drizzle SQL]', query, params);
      }
    }
  }
});