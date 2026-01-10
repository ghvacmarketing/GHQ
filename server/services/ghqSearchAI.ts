import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// CRM Knowledge Base for search context
const CRM_SEARCH_KNOWLEDGE = `
## GHVAC Business Knowledge

### Customer Types
- Residential: Single-family homes, condos, apartments
- Commercial: Businesses, offices, retail, restaurants
- Property Manager: Manages multiple properties (residential or commercial)

### Service Types
- Service Call: Diagnostic, repair, troubleshooting
- Installation: New equipment, system replacement, upgrade
- Maintenance: Tune-up, preventive maintenance, filter change
- Crawlspace: Encapsulation, moisture control, vapor barrier

### Equipment & Systems
- AC/Air Conditioner: Cooling system, condenser, compressor
- Heat Pump: Heating/cooling combo, mini-split, ductless
- Furnace: Heating, gas furnace, electric furnace
- Ductwork: Ducts, duct sealing, duct replacement
- Air Quality: Dehumidifier, humidifier, air purifier, UV light, filtration

### Common Brands
Trane, Carrier, Lennox, Rheem, Goodman, Daikin, Aprilaire, Honeywell

### Tonnage (System Sizing)
- 1.5-2 ton: Small homes (600-1200 sq ft)
- 2.5-3 ton: Medium homes (1200-1800 sq ft)
- 3.5-4 ton: Large homes (1800-2400 sq ft)
- 5+ ton: Very large/commercial

### Package Types
- Standard Package: Basic installation
- Elite Package: Premium with 10-year maintenance, labor warranty, priority service

### Agreement Types
- Maintenance Agreement: Scheduled tune-ups, filter changes
- Service Agreement: Repair coverage, priority scheduling

### Work Order Statuses
- Scheduled, Dispatched, En Route, On Site, Completed

### Project Statuses
- Lead, Proposal Sent, Approved, In Progress, Completed, Closed

### Invoice/Quote Statuses
- Draft, Sent, Paid, Void (invoices)
- Draft, Sent, Accepted, Declined, Expired (quotes)

### Common Search Patterns
- "broken AC" → service call, repair, not cooling
- "new system" → installation, replacement, upgrade
- "tune up" → maintenance, preventive, seasonal
- "leaking" → refrigerant, water damage, condensate
- "no heat" → furnace, heat pump, thermostat
`;

export interface SearchIntentResult {
  originalQuery: string;
  expandedTerms: string[];
  categoryWeights: {
    customers: number;
    workOrders: number;
    invoices: number;
    quotes: number;
    agreements: number;
    notes: number;
    projects: number;
  };
  intent: string;
}

const intentCache = new Map<string, { result: SearchIntentResult; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30;

export async function interpretSearchIntent(query: string): Promise<SearchIntentResult | null> {
  const normalizedQuery = query.toLowerCase().trim();
  
  const cached = intentCache.get(normalizedQuery);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a search assistant for GHVAC's CRM system. Given a user's search query, interpret their intent and expand it into relevant search terms using your knowledge of HVAC terminology and business operations.

${CRM_SEARCH_KNOWLEDGE}

The CRM contains these categories:
- customers: Customer names, companies, addresses, contact info, customer types (residential/commercial/property manager)
- workOrders: Service visits, repairs, installations (titles, descriptions, tech notes, equipment details)
- invoices: Invoice numbers, amounts, payment status
- quotes: Quote numbers, titles, equipment proposals, pricing
- agreements: Maintenance agreements, service contracts, renewal dates
- notes: Customer notes, service history, technician comments
- projects: Large installation projects, multi-phase work, proposals

Use your HVAC knowledge to:
1. Expand industry terms (e.g., "AC" → air conditioner, cooling, condenser)
2. Recognize equipment brands and models
3. Understand service types and relate them to categories
4. Identify if searching for customer vs work vs financial records

Return a JSON object with:
- expandedTerms: Array of 3-8 related search terms (synonyms, HVAC terms, abbreviations)
- categoryWeights: Object with weights 0-1 for each category (higher = more likely to find relevant results)
- intent: Brief description of what user is looking for`
        },
        {
          role: "user",
          content: `Search query: "${query}"`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    
    const result: SearchIntentResult = {
      originalQuery: query,
      expandedTerms: Array.isArray(parsed.expandedTerms) 
        ? parsed.expandedTerms.slice(0, 8).map((t: any) => String(t).toLowerCase())
        : [query],
      categoryWeights: {
        customers: parsed.categoryWeights?.customers ?? 0.5,
        workOrders: parsed.categoryWeights?.workOrders ?? 0.5,
        invoices: parsed.categoryWeights?.invoices ?? 0.3,
        quotes: parsed.categoryWeights?.quotes ?? 0.4,
        agreements: parsed.categoryWeights?.agreements ?? 0.5,
        notes: parsed.categoryWeights?.notes ?? 0.4,
        projects: parsed.categoryWeights?.projects ?? 0.4,
      },
      intent: parsed.intent || "General search",
    };

    intentCache.set(normalizedQuery, { result, timestamp: Date.now() });
    
    return result;
  } catch (error) {
    console.error("[GHQ AI] Error interpreting search intent:", error);
    return null;
  }
}

export function buildExpandedSearchPatterns(intent: SearchIntentResult): string[] {
  const patterns = new Set<string>();
  
  patterns.add(`%${intent.originalQuery}%`);
  
  for (const term of intent.expandedTerms) {
    if (term && term.length >= 2) {
      patterns.add(`%${term}%`);
    }
  }
  
  return Array.from(patterns).slice(0, 10);
}
