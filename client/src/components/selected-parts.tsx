import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import type { QuotePart } from "@shared/schema";

interface SelectedPartsProps {
  parts: QuotePart[];
  totals: {
    subtotal: string;
    labor: string;
    tax: string;
    total: string;
    partsSubtotal?: string;
    ghvacCoveredParts?: string;
    materialShrinkage?: string;
    adjustedPartsTotal?: string;
    baseLaborCost?: string;
    laborBenefits?: string;
    totalLaborCost?: string;
    salesTax?: string;
    warrantyReserve?: string;
    directCost?: string;
    overhead?: string;
    profit?: string;
    financingCost?: string;
    commission?: string;
    fullSellingPrice?: string;
    priceBeforeWarranty?: string;
    warrantyCoverage?: number;
    isGHVACWarranty?: boolean;
  };
  onUpdate: (updates: { parts: QuotePart[] }) => void;
  disabled?: boolean;
}

export default function SelectedParts({ parts, totals, onUpdate, disabled = false }: SelectedPartsProps) {
  const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);

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
                    part.description.toLowerCase().includes('refrigerant') && !part.description.toLowerCase().includes('filter dryer') ? 
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
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        
        <div className="border-t border-border pt-4 mt-4">
          {/* Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetailedBreakdown(!showDetailedBreakdown)}
            className="w-full mb-3 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-toggle-breakdown"
          >
            {showDetailedBreakdown ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Hide Detailed Breakdown
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show Detailed Breakdown
              </>
            )}
          </Button>

          {/* Simple Summary View */}
          {!showDetailedBreakdown && (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Parts:</span>
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
                <span className="text-sm text-muted-foreground">Tax (parts only):</span>
                <span className="text-sm font-medium text-card-foreground" data-testid="text-tax">
                  ${totals.tax}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold text-card-foreground">Total Price:</span>
                <span className="text-lg font-bold text-primary" data-testid="text-total">
                  ${totals.total}
                </span>
              </div>
            </>
          )}

          {/* Detailed Breakdown View */}
          {showDetailedBreakdown && totals.partsSubtotal && (
            <div className="space-y-2 text-sm">
              {/* Parts Section */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">All Parts:</span>
                  <span className="font-medium">${totals.partsSubtotal}</span>
                </div>
                {totals.ghvacCoveredParts && parseFloat(totals.ghvacCoveredParts) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">GHVAC Covered (Control Board, Evap Coil, Compressor):</span>
                    <span className="text-green-600 dark:text-green-400">-${totals.ghvacCoveredParts}</span>
                  </div>
                )}
                {totals.materialShrinkage && parseFloat(totals.materialShrinkage) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Material Shrinkage (3%):</span>
                    <span className="font-medium">${totals.materialShrinkage}</span>
                  </div>
                )}
                {totals.adjustedPartsTotal && (
                  <div className="flex justify-between items-center font-medium">
                    <span>Adjusted Parts Total:</span>
                    <span>${totals.adjustedPartsTotal}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border my-2"></div>

              {/* Labor Section */}
              <div className="space-y-1">
                {totals.baseLaborCost && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Base Labor:</span>
                    <span className="font-medium">${totals.baseLaborCost}</span>
                  </div>
                )}
                {totals.laborBenefits && parseFloat(totals.laborBenefits) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Labor Benefits (34%):</span>
                    <span className="font-medium">${totals.laborBenefits}</span>
                  </div>
                )}
                {totals.totalLaborCost && (
                  <div className="flex justify-between items-center font-medium">
                    <span>Total Labor:</span>
                    <span>${totals.totalLaborCost}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border my-2"></div>

              {/* Other Costs */}
              <div className="space-y-1">
                {totals.salesTax && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Sales Tax:</span>
                    <span className="font-medium">${totals.salesTax}</span>
                  </div>
                )}
                {totals.warrantyReserve && parseFloat(totals.warrantyReserve) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Warranty Reserve:</span>
                    <span className="font-medium">${totals.warrantyReserve}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border my-2"></div>

              {/* Direct Cost */}
              {totals.directCost && (
                <div className="flex justify-between items-center font-medium bg-muted/30 p-2 rounded">
                  <span>Direct Cost:</span>
                  <span>${totals.directCost}</span>
                </div>
              )}

              <div className="border-t border-border my-2"></div>

              {/* Markup Components as % of Direct Cost */}
              <div className="space-y-1">
                {totals.overhead && totals.directCost && parseFloat(totals.overhead) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Overhead:</span>
                    <span className="font-medium">
                      {((parseFloat(totals.overhead) / parseFloat(totals.directCost)) * 100).toFixed(1)}% of DC
                    </span>
                  </div>
                )}
                {totals.profit && totals.directCost && parseFloat(totals.profit) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Profit:</span>
                    <span className="font-medium">
                      {((parseFloat(totals.profit) / parseFloat(totals.directCost)) * 100).toFixed(1)}% of DC
                    </span>
                  </div>
                )}
                {totals.financingCost && totals.directCost && parseFloat(totals.financingCost) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Financing:</span>
                    <span className="font-medium">
                      {((parseFloat(totals.financingCost) / parseFloat(totals.directCost)) * 100).toFixed(1)}% of DC
                    </span>
                  </div>
                )}
                {totals.commission && totals.directCost && parseFloat(totals.commission) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Commission:</span>
                    <span className="font-medium">
                      {((parseFloat(totals.commission) / parseFloat(totals.directCost)) * 100).toFixed(1)}% of DC
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-border my-2"></div>

              {/* Final Total with Warranty Calculation */}
              {totals.isGHVACWarranty && totals.warrantyCoverage && totals.warrantyCoverage > 0 ? (
                <>
                  {/* Full Selling Price */}
                  {totals.fullSellingPrice && (
                    <div className="flex justify-between items-center bg-muted/30 p-2 rounded">
                      <span className="font-medium">Full Selling Price:</span>
                      <span className="font-medium">${totals.fullSellingPrice}</span>
                    </div>
                  )}
                  
                  {/* GHVAC Covered Parts Subtraction */}
                  {totals.ghvacCoveredParts && parseFloat(totals.ghvacCoveredParts) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-xs">Less: GHVAC Covered Parts</span>
                      <span className="text-green-600 dark:text-green-400 text-sm">-${totals.ghvacCoveredParts}</span>
                    </div>
                  )}
                  
                  {/* Price Before Warranty */}
                  {totals.priceBeforeWarranty && (
                    <div className="flex justify-between items-center bg-muted/20 p-2 rounded">
                      <span className="font-medium text-sm">Price Before Warranty:</span>
                      <span className="font-medium">${totals.priceBeforeWarranty}</span>
                    </div>
                  )}
                  
                  {/* Warranty Coverage */}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Customer Pays (Warranty Coverage):</span>
                    <span className="text-sm font-medium">{(totals.warrantyCoverage * 100).toFixed(0)}%</span>
                  </div>

                  <div className="border-t-2 border-primary my-2"></div>
                  
                  {/* Customer Total */}
                  <div className="flex justify-between items-center pt-2 bg-green-50 dark:bg-green-950 p-3 rounded">
                    <span className="font-bold text-foreground">Customer Pays:</span>
                    <span className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="text-total-detailed">
                      ${totals.total}
                    </span>
                  </div>

                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-950 rounded text-xs text-green-700 dark:text-green-300">
                    ✓ GHVAC Warranty Active: Customer pays {(totals.warrantyCoverage * 100).toFixed(0)}% of non-covered costs. GHVAC covers control board, evap coil, and compressor.
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center pt-2 bg-primary/10 p-3 rounded">
                  <span className="font-bold text-foreground">Selling Price:</span>
                  <span className="text-xl font-bold text-primary" data-testid="text-total-detailed">
                    ${totals.total}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
