import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Cog, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { QuotePart } from "@shared/schema";

interface PartsSelectionProps {
  selectedParts: QuotePart[];
  onUpdate: (updates: { parts: QuotePart[] }) => void;
  onAddCustomPart: () => void;
  hasPartsError?: boolean;
  availableParts?: Part[]; // Optional parts data passed from parent
}

interface Part {
  partNumber: string;
  description: string;
  category: string;
  price: number;
  availability: string;
  vendor?: string;
  warranty: boolean;
}

export default function PartsSelection({
  selectedParts,
  onUpdate,
  onAddCustomPart,
  hasPartsError,
  availableParts,
}: PartsSelectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [partQuantities, setPartQuantities] = useState<{ [key: string]: number }>({});
  const [partPrices, setPartPrices] = useState<{ [key: string]: number }>({});
  const [partNumbers, setPartNumbers] = useState<{ [key: string]: string }>({});

  // Use provided parts or fallback to API call for compatibility
  const { data: partsFromAPI = [], isLoading } = useQuery<Part[]>({
    queryKey: ["/api/parts"],
    enabled: !availableParts, // Only fetch if parts not provided
  });
  
  const parts = availableParts || partsFromAPI;

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const addPart = (part: Part) => {
    const quantity = partQuantities[part.partNumber] || 1;
    const price = partPrices[part.partNumber] || Number(part.price);
    const customPartNumber = partNumbers[part.partNumber] || part.partNumber;
    
    // Generate unique ID for each part instance
    // This allows multiple of the same part (e.g., 2 compressors for different units)
    const uniqueId = `${part.partNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const partWithQuantity: QuotePart = {
      id: uniqueId,
      partNumber: customPartNumber,
      description: part.description,
      category: part.category,
      price: price.toString(),
      availability: part.availability,
      vendor: part.vendor,
      warranty: part.warranty,
      isCustom: false,
      quantity,
    };

    // Always add as new part - no auto-combining
    // This allows techs to add multiple instances for different equipment
    onUpdate({ parts: [...selectedParts, partWithQuantity] });
    
    // Reset quantity, price, and part number after adding
    setPartQuantities(prev => ({
      ...prev,
      [part.partNumber]: 1,
    }));
    setPartPrices(prev => ({
      ...prev,
      [part.partNumber]: Number(part.price),
    }));
    setPartNumbers(prev => ({
      ...prev,
      [part.partNumber]: part.partNumber,
    }));
  };

  const groupedParts = parts.reduce((acc, part) => {
    if (!acc[part.category]) {
      acc[part.category] = [];
    }
    acc[part.category].push(part);
    return acc;
  }, {} as Record<string, Part[]>);

  if (isLoading) {
    return (
      <Card className="slide-in">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Cog className="text-primary mr-3 h-5 w-5" />
              <h2 className="text-lg font-semibold text-card-foreground">Parts & Services</h2>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onAddCustomPart} 
              className="flex items-center justify-center h-8 px-3"
              data-testid="button-add-custom-part"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border rounded-lg p-4">
                <Skeleton className="h-6 w-32 mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`slide-in ${hasPartsError ? 'border-destructive' : ''}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Cog className="text-primary mr-3 h-5 w-5" />
            <h2 className="text-lg font-semibold text-card-foreground">Parts & Services</h2>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onAddCustomPart} 
            className="flex items-center justify-center h-8 px-3"
            data-testid="button-add-custom-part"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Other
          </Button>
        </div>
        
        {hasPartsError && (
          <div className="bg-destructive/10 border border-destructive rounded-lg p-3 mb-4">
            <p className="text-sm text-destructive font-medium">Please add at least one part or service to your quote</p>
          </div>
        )}

        <div className="space-y-4">
          {Object.entries(groupedParts).map(([category, categoryParts]) => (
            <div key={category} className="border border-border rounded-lg p-4">
              <button
                className="flex items-center justify-between w-full mb-3 text-left"
                onClick={() => toggleCategory(category)}
                data-testid={`button-toggle-${category.toLowerCase()}`}
              >
                <h3 className="font-medium text-card-foreground">{category}</h3>
                {expandedCategories.has(category) ? (
                  <ChevronUp className="text-muted-foreground h-4 w-4" />
                ) : (
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                )}
              </button>

              {expandedCategories.has(category) && (
                <div className="space-y-2">
                  {categoryParts.map((part) => (
                    <div
                      key={part.partNumber}
                      className="p-2 rounded bg-muted/20 hover:bg-muted/30 transition-colors"
                      data-testid={`part-${part.partNumber}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-card-foreground">{part.description}</p>
                          {part.category === 'Parts' && (
                            <div className="flex items-center space-x-1">
                              <span className="text-xs text-muted-foreground">Model:</span>
                              <Input
                                type="text"
                                value={partNumbers[part.partNumber] || ""}
                                onChange={(e) => {
                                  setPartNumbers(prev => ({
                                    ...prev,
                                    [part.partNumber]: e.target.value,
                                  }));
                                }}
                                className="w-24 h-5 text-xs placeholder:text-gray-400"
                                placeholder={part.partNumber}
                                data-testid={`input-model-${part.partNumber}`}
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="flex items-center space-x-1 mb-1">
                            <span className="text-xs text-muted-foreground">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={partPrices[part.partNumber] || Number(part.price) || ''}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setPartPrices(prev => ({
                                  ...prev,
                                  [part.partNumber]: value,
                                }));
                              }}
                              className="w-20 h-6 text-xs text-right"
                              data-testid={`input-price-${part.partNumber}`}
                            />
                            <span className="text-xs text-muted-foreground">
                              {part.description.toLowerCase().includes('copper') || part.description.toLowerCase().includes('insulation') ? '/ft' :
                               part.description.toLowerCase().includes('refrigerant') && !part.description.toLowerCase().includes('filter dryer') ? '/lb' : '/ea'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Input
                          type="number"
                          placeholder={
                            part.description.toLowerCase().includes('copper') || part.description.toLowerCase().includes('insulation') ? 'feet' :
                            part.description.toLowerCase().includes('refrigerant') && !part.description.toLowerCase().includes('filter dryer') ? 'lbs' : 'qty'
                          }
                          min="1"
                          step={
                            part.description.toLowerCase().includes('refrigerant') && !part.description.toLowerCase().includes('filter dryer') ? '0.1' : '1'
                          }
                          value={partQuantities[part.partNumber] || 1}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 1;
                            setPartQuantities(prev => ({
                              ...prev,
                              [part.partNumber]: value,
                            }));
                          }}
                          className="flex-1 h-8 text-xs"
                          data-testid={`input-quantity-${part.partNumber}`}
                        />
                        <Button
                          size="sm"
                          onClick={() => addPart(part)}
                          className="h-8 px-3 text-xs"
                          data-testid={`button-add-${part.partNumber}`}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
