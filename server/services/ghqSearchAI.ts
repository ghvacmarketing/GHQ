import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
          content: `You are a search assistant for an HVAC CRM system. Given a user's search query, interpret their intent and expand it into relevant search terms.

The CRM contains these categories:
- customers: Customer names, companies, contact info
- workOrders: Service visits, repairs, installations (titles, descriptions, tech notes)
- invoices: Invoice numbers and notes
- quotes: Quote numbers, titles, descriptions
- agreements: Maintenance agreements and their notes
- notes: Customer notes and comments
- projects: Large projects with titles and descriptions

Return a JSON object with:
- expandedTerms: Array of 3-8 related search terms (synonyms, related concepts, abbreviations)
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
