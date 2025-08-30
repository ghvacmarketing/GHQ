import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Expand } from "lucide-react";
import type { Quote } from "@shared/schema";

interface QuotePreviewProps {
  quote: Quote;
  quoteText: string;
}

export default function QuotePreview({ quote, quoteText }: QuotePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const generatePreviewText = () => {
    const date = new Date().toLocaleDateString();
    
    // Show warranty status and free parts information
    let partsSection = "PARTS & SERVICES:\n";
    let warrantySection = "";
    
    if ((quote as any).isGHVACWarranty && (quote as any).freePartsSubtotal && parseFloat((quote as any).freePartsSubtotal) > 0) {
      // Show free parts separately from charged parts
      const chargedParts = quote.parts.filter((part: any) => 
        part.category === "Materials" || (part.isCustom && part.warranty === false)
      );
      const freeParts = quote.parts.filter((part: any) => 
        part.category !== "Materials" && !(part.isCustom && part.warranty === false)
      );
      
      if (chargedParts.length > 0) {
        partsSection += "MATERIALS & NON-WARRANTIED PARTS (DISCOUNTED):\n";
        partsSection += chargedParts.map((part: any) => 
          `• ${part.description} (${part.partNumber}) - Qty: ${part.quantity || 1} - $${part.price}`
        ).join('\n') + '\n';
      }
      
      if (freeParts.length > 0) {
        partsSection += "\nPARTS COVERED BY WARRANTY (FREE):\n";
        partsSection += freeParts.map((part: any) => 
          `• ${part.description} (${part.partNumber}) - Qty: ${part.quantity || 1} - $0.00 (was $${part.price})`
        ).join('\n');
      }
      
      const freePartsValue = parseFloat((quote as any).freePartsSubtotal);
      const warrantyDiscountPercent = Math.round(((quote as any).warrantyDiscount || 0) * 100);
      
      warrantySection = `\nGHVAC WARRANTY SAVINGS:
Parts covered by manufacturer warranty: $${(quote as any).freePartsSubtotal}
Labor & materials discount (${warrantyDiscountPercent}%): Applied
Total customer savings: $${freePartsValue.toFixed(2)}+`;
    } else {
      // Standard parts list for non-warranty jobs
      partsSection += quote.parts.map((part: any) => 
        `• ${part.description} (${part.partNumber}) - Qty: ${part.quantity || 1} - $${part.price}`
      ).join('\n');
    }

    return `GHVAC SERVICE QUOTE

Customer: ${quote.customerName}
Technician: ${quote.technician}
Date: ${date}

${partsSection}

Subtotal: $${quote.subtotal}
Labor: $${quote.labor}
Tax: $${quote.tax}
TOTAL: $${quote.total}`;
  };

  return (
    <Card data-testid="card-quote-preview">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileText className="text-primary mr-3 h-5 w-5" />
            <h2 className="text-lg font-semibold text-card-foreground">Quote Preview</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="button-expand-preview"
          >
            <Expand className="h-4 w-4" />
          </Button>
        </div>
        <div className="bg-muted/20 rounded-lg p-4">
          <div 
            className={`text-sm font-mono text-card-foreground leading-relaxed whitespace-pre-line ${
              isExpanded ? '' : 'max-h-48 overflow-hidden'
            }`}
            data-testid="text-quote-preview"
          >
            {generatePreviewText()}
          </div>
          {!isExpanded && (
            <div className="mt-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(true)}
                data-testid="button-show-more"
              >
                Show More
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
