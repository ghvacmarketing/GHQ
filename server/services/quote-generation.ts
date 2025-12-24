import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export const GeneratedQuoteSchema = z.object({
  quote_title: z.string(),
  customer_facing_summary: z.string(),
  line_items: z.array(z.object({
    name: z.string(),
    qty: z.number(),
    price: z.number(),
    description: z.string(),
  })),
  subtotal: z.number(),
  discount_amount: z.number(),
  discount_percent: z.number(),
  total: z.number(),
  savings_text: z.string(),
  financing_text: z.string().optional(),
  warranties_and_terms: z.array(z.string()),
});

export type GeneratedQuote = z.infer<typeof GeneratedQuoteSchema>;

export interface QuoteGenerationInput {
  customerName?: string;
  customerAddress?: string;
  customerNotes?: string;
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
  }>;
  totals: {
    subtotal: number;
    eliteSavings: number;
    grandTotal: number;
    monthlyPayment: number;
  };
}

export async function generateQuoteWithAI(input: QuoteGenerationInput): Promise<GeneratedQuote> {
  const systemPrompt = `You are an HVAC service quote generator for GHVAC. Generate professional, customer-friendly quotes.

IMPORTANT RULES:
- Use the exact prices provided in the input - do not calculate or modify them
- Format all prices as numbers (not strings)
- Be professional but warm and approachable
- Highlight value and benefits, not just features
- If Elite Package is included, emphasize the savings and added value
- Keep the summary concise but informative (2-3 sentences max)

You MUST respond with valid JSON matching this exact structure:
{
  "quote_title": "string - Professional title for the quote",
  "customer_facing_summary": "string - Friendly 2-3 sentence summary of what they're getting",
  "line_items": [{"name": "string", "qty": number, "price": number, "description": "string"}],
  "subtotal": number,
  "discount_amount": number,
  "discount_percent": number,
  "total": number,
  "savings_text": "string - If savings exist, describe them; otherwise empty string",
  "financing_text": "string - Monthly payment info if applicable",
  "warranties_and_terms": ["string array of warranty/term bullet points"]
}`;

  const userPrompt = `Generate a professional HVAC quote for the following:

CUSTOMER INFO:
${input.customerName ? `Name: ${input.customerName}` : 'Name: Valued Customer'}
${input.customerAddress ? `Address: ${input.customerAddress}` : ''}
${input.customerNotes ? `Notes: ${input.customerNotes}` : ''}

EQUIPMENT/SERVICES:
${input.cartItems.map((item, i) => `
${i + 1}. ${item.name}
   Type: ${item.type.toUpperCase()}
   ${item.description}
   Quantity: ${item.quantity}
   ${item.isElite ? `Elite Package: YES (Includes: ${item.eliteIncludes?.join(', ') || 'Premium upgrades'})` : 'Standard Package'}
   Base Price: $${item.basePrice.toLocaleString()}
   Final Price: $${item.finalPrice.toLocaleString()}
   ${item.eliteSavings ? `Elite Savings: $${item.eliteSavings.toLocaleString()}` : ''}
`).join('\n')}

TOTALS:
- Subtotal: $${input.totals.subtotal.toLocaleString()}
- Elite Savings: $${input.totals.eliteSavings.toLocaleString()}
- Grand Total: $${input.totals.grandTotal.toLocaleString()}
- Monthly Payment (with approved financing): $${input.totals.monthlyPayment.toLocaleString()}/month

Generate the quote JSON now. Use EXACT prices from above.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const parsed = JSON.parse(content);
  return GeneratedQuoteSchema.parse(parsed);
}
