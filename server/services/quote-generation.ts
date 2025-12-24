import OpenAI from "openai";
import { AIQuoteResponseSchema, type AIQuoteResponse, type QuoteMessage } from "@shared/schema";
import { storage } from "../storage";
import { searchVectorStore, getOrCreateVectorStore, listVectorStoreFiles } from "./vector-store";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// System instruction block - always sent with every request
const SYSTEM_INSTRUCTIONS = `You are GHVAC's professional HVAC quoting assistant. Your role is to generate accurate, sales-ready quotes for heating and cooling equipment installations.

BUSINESS RULES (MUST FOLLOW):
1. Pricing Tiers:
   - Budget: Entry-level equipment with basic features
   - Good: Reliable mid-range equipment with standard warranties
   - Better: Higher efficiency equipment with extended warranties
   - Best: Premium equipment with maximum efficiency and best warranties

2. Elite Package Rules:
   - Elite Package adds: 10-Year Maintenance Plan, 10-Year Labor Warranty, Install Upgrade Bundle, New Ducting System
   - Elite Package receives 20% discount on the total bundle price
   - Only available when customer selects the upgrade AND has all required Elite items

3. Discount Policy:
   - Standard quotes have no discount unless explicitly requested
   - Maximum discount without manager approval: 10%
   - Any discount must be justified (e.g., competitor pricing, bundle deal, loyalty)

4. Quote Accuracy:
   - ALWAYS use the EXACT prices provided in the input data
   - NEVER calculate, estimate, or modify pricing on your own
   - The subtotal, discount, and total MUST match the input data exactly

PRICING BREAKDOWN LAYOUT RULES (CRITICAL):
1. line_items: List ALL items (base package + add-ons + upgrades) with their individual prices
2. subtotal: Sum of all line item prices (base + add-ons + upgrades)
3. Elite Discount Row:
   - If Elite is ACTIVE (elite_discount_active=true): Show "Elite Bundle Discount (20%)" with negative amount
   - If Elite is NOT ACTIVE: Set elite_discount_active=false, elite_discount_amount=0
   - If Elite toggle is ON but requirements not met: Set elite_warning message
4. Total = Subtotal - Elite Discount Amount (when Elite active)
5. savings_note: Optional small muted note about savings, NOT a banner

BEHAVIORAL RULES:
1. Ask at most ONE clarifying question if critical information is missing; otherwise assume reasonable defaults
2. Be concise, professional, and sales-ready in all communications
3. Highlight value propositions, not just features
4. Emphasize warranties, efficiency ratings, and long-term savings

OUTPUT REQUIREMENTS:
- You MUST respond with valid JSON matching the exact schema provided
- All prices must be numbers (not strings)
- Keep customer_summary to 2-3 sentences maximum
- Warranties and next_steps should be actionable bullet points
- Format prices as numbers, the frontend will format as currency`;

export interface QuoteGenerationInput {
  conversationId?: string;
  customerName?: string;
  customerAddress?: string;
  customerNotes?: string;
  customInstructions?: string;
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
  let prompt = `Generate a professional HVAC quote with the following details:

CUSTOMER INFORMATION:
- Name: ${input.customerName || 'Valued Customer'}
${input.customerAddress ? `- Address: ${input.customerAddress}` : ''}
${input.customerNotes ? `- Notes: ${input.customerNotes}` : ''}

EQUIPMENT/SERVICES IN QUOTE:
${input.cartItems.map((item, i) => {
  let itemDetails = `
${i + 1}. ${item.name}
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
  
  if (item.isElite && item.eliteIncludes) {
    itemDetails += `\n   - Elite Includes: ${item.eliteIncludes.join(', ')}`;
  }
  if (item.eliteSavings) {
    itemDetails += `\n   - Elite Savings: $${item.eliteSavings.toLocaleString()}`;
  }
  
  return itemDetails;
}).join('\n')}

FINAL TOTALS (USE THESE EXACT VALUES):
- Subtotal: $${input.totals.subtotal.toLocaleString()}
- Elite Savings: $${input.totals.eliteSavings.toLocaleString()}
- Grand Total: $${input.totals.grandTotal.toLocaleString()}
- Monthly Payment (67-month financing): $${input.totals.monthlyPayment.toLocaleString()}/month`;

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
  const systemContent = SYSTEM_INSTRUCTIONS + knowledgeBaseContext;
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
            customer_summary: { type: "string" },
            selected_base_package: {
              type: "object",
              properties: {
                tier: { type: "string" },
                tonnage: { type: "string" },
                brand: { type: "string" },
                model: { type: "string" }
              },
              required: ["tier", "tonnage", "brand", "model"],
              additionalProperties: false
            },
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
            add_ons: {
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
            }
          },
          required: [
            "quote_title",
            "customer_summary",
            "selected_base_package",
            "line_items",
            "add_ons",
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
            "next_steps"
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
