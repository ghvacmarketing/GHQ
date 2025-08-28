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
}: PartsSelectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [partQuantities, setPartQuantities] = useState<{ [key: string]: number }>({});

  const { data: parts = [], isLoading } = useQuery<Part[]>({
    queryKey: ["/api/parts"],
  });

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
    const partWithQuantity: QuotePart = {
      id: part.partNumber,
      partNumber: part.partNumber,
      description: part.description,
      category: part.category,
      price: part.price.toString(),
      availability: part.availability,
      vendor: part.vendor,
      warranty: part.warranty,
      isCustom: false,
      quantity,
    };

    const existingPartIndex = selectedParts.findIndex(p => p.partNumber === part.partNumber);
    if (existingPartIndex >= 0) {
      const updatedParts = [...selectedParts];
      updatedParts[existingPartIndex] = {
        ...updatedParts[existingPartIndex],
        quantity: (updatedParts[existingPartIndex].quantity || 1) + quantity,
      };
      onUpdate({ parts: updatedParts });
    } else {
      onUpdate({ parts: [...selectedParts, partWithQuantity] });
    }
    
    // Reset quantity after adding
    setPartQuantities(prev => ({
      ...prev,
      [part.partNumber]: 1,
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
              className="flex items-center"
              data-testid="button-add-custom-part"
            >
              <Plus className="mr-1 h-4 w-4" />
              Custom
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
            className="flex items-center"
            data-testid="button-add-custom-part"
          >
            <Plus className="mr-1 h-4 w-4" />
            Custom
          </Button>
        </div>

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
                          <p className="text-xs text-muted-foreground">Model: {part.partNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-primary">
                            ${part.price.toFixed(2)}
                            {part.category.toLowerCase() === 'refrigerants' && '/lb'}
                            {part.category.toLowerCase() !== 'refrigerants' && '/ea'}
                          </p>
                          <Badge 
                            variant={
                              part.availability === 'In Stock' ? 'default' : 
                              part.availability === 'Out of Stock' || part.availability === 'Backordered' ? 'destructive' : 
                              'secondary'
                            } 
                            className="text-xs"
                          >
                            {part.availability}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Input
                          type="number"
                          placeholder={part.category.toLowerCase() === 'refrigerants' ? 'lbs' : 'qty'}
                          min="1"
                          step={part.category.toLowerCase() === 'refrigerants' ? '0.1' : '1'}
                          value={partQuantities[part.partNumber] || ''}
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
