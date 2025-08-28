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
    const partsList = quote.parts.map((part: any) => 
      `• ${part.description} (${part.partNumber}) - Qty: ${part.quantity || 1} - $${part.price}`
    ).join('\n');

    return `GHVAC SERVICE QUOTE

Customer: ${quote.customerName}
Technician: ${quote.technician}
Date: ${date}

PARTS & SERVICES:
${partsList}

Subtotal: $${quote.subtotal}
Labor: $${quote.labor}
Tax: $${quote.tax}
TOTAL: $${quote.total}

Quote valid for 30 days.
All work comes with GHVAC warranty.`;
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
