import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, X } from "lucide-react";
import type { QuotePart } from "@shared/schema";

interface SelectedPartsProps {
  parts: QuotePart[];
  totals: {
    subtotal: string;
    labor: string;
    tax: string;
    total: string;
  };
  onUpdate: (updates: { parts: QuotePart[] }) => void;
}

export default function SelectedParts({ parts, totals, onUpdate }: SelectedPartsProps) {
  const removePart = (partId: string) => {
    const updatedParts = parts.filter(part => part.id !== partId);
    onUpdate({ parts: updatedParts });
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <CheckCircle className="text-primary mr-3 h-5 w-5" />
          <h2 className="text-lg font-semibold text-card-foreground">Selected Items</h2>
        </div>
        <div className="space-y-3">
          {parts.map((part) => (
            <div
              key={part.id}
              className="flex items-center justify-between p-3 bg-muted/20 rounded-lg"
              data-testid={`selected-part-${part.id}`}
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-card-foreground">{part.description}</p>
                <p className="text-xs text-muted-foreground">
                  {part.partNumber && `Model: ${part.partNumber}`}
                  {part.quantity && part.quantity !== 1 && (
                    part.description.toLowerCase().includes('refrigerant') ? 
                    ` • ${part.quantity} lbs` : 
                    part.description.toLowerCase().includes('copper') || part.description.toLowerCase().includes('insulation') ?
                    ` • ${part.quantity} ft` :
                    ` • Qty: ${part.quantity}`
                  )}
                </p>
              </div>
              <div className="text-right mr-3">
                <p className="text-sm font-semibold text-primary">
                  ${(parseFloat(part.price) * (part.quantity || 1)).toFixed(2)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removePart(part.id)}
                className="text-destructive hover:text-destructive/80"
                data-testid={`button-remove-${part.id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        
        <div className="border-t border-border pt-4 mt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Subtotal:</span>
            <span className="text-sm font-medium text-card-foreground" data-testid="text-subtotal">
              ${totals.subtotal}
            </span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Labor:</span>
            <span className="text-sm font-medium text-card-foreground" data-testid="text-labor">
              ${totals.labor}
            </span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Tax:</span>
            <span className="text-sm font-medium text-card-foreground" data-testid="text-tax">
              ${totals.tax}
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="font-semibold text-card-foreground">Total:</span>
            <span className="text-lg font-bold text-primary" data-testid="text-total">
              ${totals.total}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
