import OpenAI from "openai";
import { AIQuoteResponseSchema, type AIQuoteResponse, type QuoteMessage } from "@shared/schema";
import { storage } from "../storage";
import { searchVectorStore, getOrCreateVectorStore, listVectorStoreFiles } from "./vector-store";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// CRM Knowledge Base - comprehensive system knowledge for AI context
const CRM_KNOWLEDGE_CONTEXT = `
## GHVAC CRM KNOWLEDGE

### Pricing Rules
- Elite Package: 20% discount on combined total (includes 10-Year Maintenance, Labor Warranty, Install Bundle, Ducting)
- Maximum discretionary discount: 10% without manager approval
- Financing: 67 months standard, monthly = total / 67
- Overhead multiplier: 1.3-1.5x material cost

### Customer Types
- Residential: Single-family homes, condos - routes to "Residential" accounts
- Commercial: Businesses, offices - routes to "Commercial" accounts  
- Property Managers: Multiple properties, must select type per location

### Service Categories
- Service: Diagnostic/repair visits
- Install: New equipment, replacements ($5k+ typically)
- Maintenance: Preventive scheduled visits
- Crawlspace: Encapsulation, moisture control

### Quote Types
- Custom Install: High-value, deposit required, financing options shown
- Service: Repairs, may not need deposit
- Proposal: Formal proposals, triggers project on acceptance

### Equipment Sizing (Tonnage)
- 1.5 ton: 600-900 sq ft | 2.0 ton: 901-1,200 sq ft | 2.5 ton: 1,201-1,500 sq ft
- 3.0 ton: 1,501-1,800 sq ft | 3.5 ton: 1,801-2,100 sq ft | 4.0 ton: 2,101-2,400 sq ft
- 5.0 ton: 2,401-3,000 sq ft

### Common Brands
Trane, Carrier, Lennox, Rheem, Goodman, Daikin, Aprilaire (air quality)

### Elite Package Value Points
- 10-year maintenance coverage (10 annual tune-ups)
- Labor warranty on all repairs
- Priority scheduling
- Parts discount on future needs
- Peace of mind protection

### Handling Objections
- "Too expensive": Emphasize quality, longevity (15-20yr), warranty, financing options
- "Need discount": Max 10% discretionary, Elite already saves 20%
- "How long will it last": Quality systems 15-20+ years with maintenance
`;

// System instruction block - always sent with every request (SINGLE mode - combined quote)
const SYSTEM_INSTRUCTIONS = `You are GHVAC's professional HVAC quoting assistant. Generate professional "Comprehensive Home Comfort Proposal" documents.

${CRM_KNOWLEDGE_CONTEXT}

DOCUMENT FORMAT (FOLLOW EXACTLY):
1. quote_title: Format as "$TOTAL [Descriptive Title]" (e.g., "$25,599.00 Premium 3-Ton Trane HVAC System"). Do NOT use "OPTION:" prefix - this is a single combined quote.
2. package_description: 2-3 sentence sales paragraph highlighting the package value proposition
3. whats_included: Categorized bullet points grouped by component (e.g., "3.0 Ton Premium Ducting System", "Aprilaire E070 WiFi Dehumidifier")
4. best_for: One sentence describing ideal customer for this package
5. Pricing section: line_items → subtotal → elite_discount (if active) → total

BUSINESS RULES:
1. Elite Package: 10-Year Maintenance, Labor Warranty, Install Bundle, Ducting - receives 20% discount
2. Quote Accuracy: Use EXACT prices from input data. Total = Subtotal - Elite Discount
3. Discount Policy: Max 10% without manager approval

PRICING LAYOUT (CRITICAL):
- line_items: ALL items with individual prices
- subtotal: Sum of all line items BEFORE discount
- elite_discount_active: true only when Elite is applied
- elite_discount_amount: 20% of subtotal (when Elite active)
- total: Subtotal minus Elite Discount
- savings_note: Small note about savings (optional)

OUTPUT STRUCTURE:
- whats_included: Array of {category: string, items: string[]} - group benefits by component
- additional_enhancements: ALWAYS return empty array [] - do NOT suggest additional upgrades
- warranties_and_terms: 4-6 key warranty/term bullet points
- next_steps: 2-3 actionable next steps
- financing_text: Monthly payment info

All prices must be numbers (not strings). Format prices as numbers, frontend handles currency formatting.`;

// System instructions for OPTIONS mode - customer picks ONE option
const SYSTEM_INSTRUCTIONS_OPTIONS = `You are GHVAC's professional HVAC quoting assistant. Generate a "Comprehensive Home Comfort Proposal" with MULTIPLE OPTIONS for the customer to choose from.

${CRM_KNOWLEDGE_CONTEXT}

CRITICAL: This is an OPTIONS proposal. The customer will SELECT ONE OPTION, not buy all of them.

DOCUMENT FORMAT FOR OPTIONS MODE:
1. quote_title: Format as "Your Home Comfort Options" or similar title indicating choices
2. package_description: Explain that this proposal presents multiple options for the customer to choose from, each with different features and price points
3. whats_included: List what's included for EACH OPTION separately. Group by option name (e.g., "Good Package", "Better Package", "Best Package")
4. best_for: Describe who each tier is best for
5. Pricing: Each option in line_items should show its INDIVIDUAL price - do NOT add them together

IMPORTANT RULES FOR OPTIONS MODE:
1. Do NOT sum the options together - they are mutually exclusive choices
2. Each line_item represents a SEPARATE OPTION the customer can choose
3. The subtotal should equal the HIGHEST priced option (for reference), NOT the sum of all options
4. The total should be the highest priced option - the customer picks ONE
5. In the description for each line item, make it clear this is an option to choose
6. Use option names like "Good", "Better", "Best" or the provided package tags

PRICING FOR OPTIONS:
- line_items: Each option as a separate item with its own price
- subtotal: Use the HIGHEST option price (customer picks one)
- total: Same as subtotal (no combined total)
- elite_discount_active/amount: Apply per-option if that option has Elite
- financing_text: Show range of monthly payments for all options

All prices must be numbers (not strings). Format prices as numbers, frontend handles currency formatting.`;

export interface QuoteGenerationInput {
  conversationId?: string;
  customerName?: string;
  customerAddress?: string;
  customerNotes?: string;
  customInstructions?: string;
  quoteMode?: 'single' | 'options'; // "single" = combined quote, "options" = separate options for customer to choose
  cartItems: Array<{
    type: 'hvac' | 'crawlspace' | 'custom';
    name: string;
    description: string;
    basePrice: number;
    finalPrice: number;
    quantity: number;
    isElite: boolean;
    eliteIncludes?: string[];
    eliteSavings?: number;
    tier?: string;
    tonnage?: string;
    brand?: string;
    model?: string;
    packageTag?: string; // "Good", "Better", "Best", etc.
  }>;
  totals: {
    subtotal: number;
    eliteSavings: number;
    grandTotal: number;
    monthlyPayment: number;
  };
}

interface ConversationContext {
  rollingSummary: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

async function getConversationContext(conversationId: string): Promise<ConversationContext> {
  const conversation = await storage.getQuoteConversation(conversationId);
  const messages = await storage.getRecentQuoteMessages(conversationId, 10);
  
  return {
    rollingSummary: conversation?.rollingSummary || '',
    recentMessages: messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ 
        role: m.role as 'user' | 'assistant', 
        content: m.content 
      })),
  };
}

async function updateRollingSummary(conversationId: string, input: QuoteGenerationInput): Promise<void> {
  const summary = `Customer: ${input.customerName || 'Not specified'}
Equipment: ${input.cartItems.map(item => `${item.name} (${item.type}, ${item.isElite ? 'Elite' : 'Standard'})`).join(', ')}
Total Value: $${input.totals.grandTotal.toLocaleString()}
Elite Savings: $${input.totals.eliteSavings.toLocaleString()}
${input.customerNotes ? `Notes: ${input.customerNotes}` : ''}`;

  await storage.updateQuoteConversation(conversationId, { rollingSummary: summary });
}

function buildUserPrompt(input: QuoteGenerationInput, context?: ConversationContext): string {
  const isOptionsMode = input.quoteMode === 'options';
  
  let prompt = isOptionsMode 
    ? `Generate a professional HVAC OPTIONS PROPOSAL with the following details. IMPORTANT: This is an OPTIONS proposal where the customer will CHOOSE ONE option, not buy all of them.`
    : `Generate a professional HVAC quote with the following details:`;

  prompt += `

CUSTOMER INFORMATION:
- Name: ${input.customerName || 'Valued Customer'}
${input.customerAddress ? `- Address: ${input.customerAddress}` : ''}
${input.customerNotes ? `- Notes: ${input.customerNotes}` : ''}

${isOptionsMode ? 'OPTIONS FOR CUSTOMER TO CHOOSE FROM (each is a separate choice):' : 'EQUIPMENT/SERVICES IN QUOTE:'}
${input.cartItems.map((item, i) => {
  const optionLabel = item.packageTag || `Option ${i + 1}`;
  let itemDetails = isOptionsMode 
    ? `\n${optionLabel.toUpperCase()}: ${item.name}`
    : `\n${i + 1}. ${item.name}`;
  
  itemDetails += `
   - Type: ${item.type.toUpperCase()}
   - Description: ${item.description}
   - Quantity: ${item.quantity}
   - Package: ${item.isElite ? 'ELITE PACKAGE' : 'Standard'}`;
  
  if (item.tier) itemDetails += `\n   - Tier: ${item.tier}`;
  if (item.tonnage) itemDetails += `\n   - Tonnage: ${item.tonnage}`;
  if (item.brand) itemDetails += `\n   - Brand: ${item.brand}`;
  if (item.model) itemDetails += `\n   - Model: ${item.model}`;
  
  itemDetails += `\n   - Base Price: $${item.basePrice.toLocaleString()}`;
  itemDetails += `\n   - Final Price: $${item.finalPrice.toLocaleString()}`;
  itemDetails += `\n   - Monthly Payment: $${Math.round(item.finalPrice / 67).toLocaleString()}/month`;
  
  if (item.isElite && item.eliteIncludes) {
    itemDetails += `\n   - Elite Includes: ${item.eliteIncludes.join(', ')}`;
  }
  if (item.eliteSavings) {
    itemDetails += `\n   - Elite Savings: $${item.eliteSavings.toLocaleString()}`;
  }
  
  return itemDetails;
}).join('\n')}`;

  if (isOptionsMode) {
    // For options mode, show pricing range, not combined totals
    const prices = input.cartItems.map(item => item.finalPrice * item.quantity);
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const lowestMonthly = Math.round(lowestPrice / 67);
    const highestMonthly = Math.round(highestPrice / 67);
    
    prompt += `

PRICING SUMMARY (OPTIONS - DO NOT SUM TOGETHER):
- Price Range: $${lowestPrice.toLocaleString()} to $${highestPrice.toLocaleString()}
- Monthly Payment Range: $${lowestMonthly.toLocaleString()}/month to $${highestMonthly.toLocaleString()}/month
- Number of Options: ${input.cartItems.length}

IMPORTANT: Each line_item should represent ONE OPTION with its individual price. The customer picks ONE. Do NOT add the prices together.`;
  } else {
    prompt += `

FINAL TOTALS (USE THESE EXACT VALUES):
- Subtotal: $${input.totals.subtotal.toLocaleString()}
- Elite Savings: $${input.totals.eliteSavings.toLocaleString()}
- Grand Total: $${input.totals.grandTotal.toLocaleString()}
- Monthly Payment (67-month financing): $${input.totals.monthlyPayment.toLocaleString()}/month`;
  }

  if (context?.rollingSummary) {
    prompt += `\n\nCONVERSATION CONTEXT:
${context.rollingSummary}`;
  }

  if (input.customInstructions) {
    prompt += `\n\nSPECIAL INSTRUCTIONS FROM TECHNICIAN:
${input.customInstructions}

Apply these instructions when generating the quote. Adjust tone, emphasis, discounts, or terms as requested while following business rules.`;
  }

  prompt += `\n\nGenerate the quote JSON now. Use the EXACT prices provided above.`;
  
  return prompt;
}

export async function generateQuoteWithAI(input: QuoteGenerationInput): Promise<AIQuoteResponse> {
  let context: ConversationContext | undefined;
  let knowledgeBaseContext = "";
  
  // Load conversation context if conversation ID provided
  if (input.conversationId) {
    try {
      context = await getConversationContext(input.conversationId);
      await updateRollingSummary(input.conversationId, input);
    } catch (error) {
      console.error('Error loading conversation context:', error);
    }
  }

  // Search knowledge base for relevant product information
  try {
    const files = await listVectorStoreFiles();
    console.log(`Knowledge base has ${files.length} files`);
    
    if (files.length > 0) {
      const searchQuery = input.cartItems.map(item => 
        `${item.brand || ''} ${item.name} ${item.description}`.trim()
      ).join(', ');
      
      console.log(`Searching knowledge base for: ${searchQuery.substring(0, 100)}...`);
      
      const kbResult = await searchVectorStore(
        `Find product details, specifications, rebate programs, and selling points for: ${searchQuery}`
      );
      
      if (kbResult && kbResult.length > 0) {
        knowledgeBaseContext = `\n\nPRODUCT KNOWLEDGE BASE (use to enhance descriptions):\n${kbResult}`;
        console.log(`Added ${kbResult.length} chars of knowledge base context`);
      }
    } else {
      console.log('Knowledge base is empty - run seed to upload sales book');
    }
  } catch (error) {
    console.error('Error searching knowledge base (continuing without KB context):', error);
  }

  // Build messages array with knowledge base context
  // Use different system instructions for options mode vs single quote mode
  const baseInstructions = input.quoteMode === 'options' ? SYSTEM_INSTRUCTIONS_OPTIONS : SYSTEM_INSTRUCTIONS;
  const systemContent = baseInstructions + knowledgeBaseContext;
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemContent }
  ];

  // Add recent conversation history if available
  if (context?.recentMessages && context.recentMessages.length > 0) {
    for (const msg of context.recentMessages) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current user prompt
  const userPrompt = buildUserPrompt(input, context);
  messages.push({ role: 'user', content: userPrompt });

  // Store user message if conversation exists
  if (input.conversationId) {
    try {
      await storage.createQuoteMessage({
        conversationId: input.conversationId,
        role: 'user',
        content: input.customInstructions || 'Generate quote',
      });
    } catch (error) {
      console.error('Error storing user message:', error);
    }
  }

  // Call OpenAI with structured output and low temperature
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: messages,
    response_format: { 
      type: "json_schema",
      json_schema: {
        name: "quote_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            quote_title: { type: "string" },
            package_description: { type: "string" },
            whats_included: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  items: { type: "array", items: { type: "string" } }
                },
                required: ["category", "items"],
                additionalProperties: false
              }
            },
            best_for: { type: "string" },
            line_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  qty: { type: "number" },
                  price: { type: "number" },
                  description: { type: "string" }
                },
                required: ["name", "qty", "price", "description"],
                additionalProperties: false
              }
            },
            subtotal: { type: "number" },
            elite_discount_active: { type: "boolean" },
            elite_discount_percent: { type: "number" },
            elite_discount_amount: { type: "number" },
            elite_warning: { type: "string" },
            discount_percent: { type: "number" },
            discount_amount: { type: "number" },
            total: { type: "number" },
            savings_note: { type: "string" },
            financing_text: { type: "string" },
            warranties_and_terms: {
              type: "array",
              items: { type: "string" }
            },
            next_steps: {
              type: "array",
              items: { type: "string" }
            },
            additional_enhancements: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  price: { type: "number" },
                  description: { type: "string" },
                  whats_included: { type: "array", items: { type: "string" } },
                  recommended_for: { type: "string" }
                },
                required: ["name", "price", "description", "whats_included", "recommended_for"],
                additionalProperties: false
              }
            }
          },
          required: [
            "quote_title",
            "package_description",
            "whats_included",
            "best_for",
            "line_items",
            "subtotal",
            "elite_discount_active",
            "elite_discount_percent",
            "elite_discount_amount",
            "elite_warning",
            "discount_percent",
            "discount_amount",
            "total",
            "savings_note",
            "financing_text",
            "warranties_and_terms",
            "next_steps",
            "additional_enhancements"
          ],
          additionalProperties: false
        }
      }
    },
    temperature: 0.2, // Low temperature for consistent, predictable outputs
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const parsed = JSON.parse(content);
  const validated = AIQuoteResponseSchema.parse(parsed);

  // Store assistant response if conversation exists
  if (input.conversationId) {
    try {
      await storage.createQuoteMessage({
        conversationId: input.conversationId,
        role: 'assistant',
        content: JSON.stringify(validated),
      });
    } catch (error) {
      console.error('Error storing assistant message:', error);
    }
  }

  return validated;
}

// Create a new conversation for a quote session
export async function createQuoteConversation(customerName: string, customerId?: string, cartSnapshot?: Record<string, unknown>): Promise<string> {
  const conversation = await storage.createQuoteConversation({
    customerName,
    customerId,
    cartSnapshot: cartSnapshot as Record<string, unknown> | undefined,
  });
  return conversation.id;
}

// Get conversation history for display
export async function getConversationHistory(conversationId: string): Promise<QuoteMessage[]> {
  return storage.getQuoteMessages(conversationId);
}

// Legacy export for backward compatibility
export { AIQuoteResponseSchema as GeneratedQuoteSchema };
export type GeneratedQuote = AIQuoteResponse;
