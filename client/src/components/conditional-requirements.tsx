import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus } from "lucide-react";
import type { QuotePart } from "@shared/schema";

interface ConditionalRequirementsProps {
  onAddParts: (parts: QuotePart[]) => void;
}

interface ServiceRequirement {
  serviceType: string;
  failureType?: string;
  acidTest?: string;
  systemCapacity?: string;
}

export default function ConditionalRequirements({ onAddParts }: ConditionalRequirementsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [requirement, setRequirement] = useState<ServiceRequirement>({
    serviceType: "",
    failureType: "",
    acidTest: "",
    systemCapacity: "",
  });

  const getRequiredParts = (): QuotePart[] => {
    const parts: QuotePart[] = [];

    if (requirement.serviceType === "compressor") {
      // Always required for compressor replacement
      parts.push({
        id: "filter-dryer",
        name: "Filter Dryer",
        category: "Parts",
        price: 45.00,
        availability: "Available",
        unit: "qty",
        quantity: 1,
      });

      // Conditional based on failure type
      if (requirement.failureType === "electrical") {
        parts.push({
          id: "acid-away",
          name: "Acid Away Treatment",
          category: "Chemicals",
          price: 85.00,
          availability: "Available",
          unit: "qty",
          quantity: 1,
        });

        // Add refrigerant based on system capacity
        if (requirement.systemCapacity) {
          const pounds = parseFloat(requirement.systemCapacity);
          parts.push({
            id: "r410a",
            name: "R410A Refrigerant",
            category: "Refrigerants",
            price: 12.50,
            availability: "Available",
            unit: "lbs",
            quantity: pounds,
          });
        }
      }

      // Acid test overrides
      if (requirement.acidTest === "positive") {
        // Remove existing acid away if present
        const acidAwayIndex = parts.findIndex(p => p.id === "acid-away");
        if (acidAwayIndex === -1) {
          parts.push({
            id: "acid-away",
            name: "Acid Away Treatment",
            category: "Chemicals",
            price: 85.00,
            availability: "Available",
            unit: "qty",
            quantity: 1,
          });
        }

        // Add refrigerant if not already added
        if (requirement.systemCapacity && !parts.find(p => p.id === "r410a")) {
          const pounds = parseFloat(requirement.systemCapacity);
          parts.push({
            id: "r410a",
            name: "R410A Refrigerant",
            category: "Refrigerants",
            price: 12.50,
            availability: "Available",
            unit: "lbs",
            quantity: pounds,
          });
        }
      }
    }

    if (requirement.serviceType === "evaporator") {
      // Always required for evaporator replacement
      parts.push({
        id: "evap-filter-dryer",
        name: "Evaporator Filter Dryer",
        category: "Parts",
        price: 55.00,
        availability: "Available",
        unit: "qty",
        quantity: 1,
      });

      // Always need full refrigerant replacement
      if (requirement.systemCapacity) {
        const pounds = parseFloat(requirement.systemCapacity);
        parts.push({
          id: "r410a",
          name: "R410A Refrigerant",
          category: "Refrigerants",
          price: 12.50,
          availability: "Available",
          unit: "lbs",
          quantity: pounds,
        });
      }
    }

    return parts;
  };

  const handleAddRequiredParts = () => {
    const requiredParts = getRequiredParts();
    if (requiredParts.length > 0) {
      onAddParts(requiredParts);
    }
  };

  const canAddParts = requirement.serviceType && 
    (requirement.serviceType === "evaporator" || 
     (requirement.serviceType === "compressor" && requirement.failureType));

  const requiredParts = getRequiredParts();

  if (!isExpanded) {
    return (
      <Card className="slide-in">
        <CardContent className="p-4">
          <Button
            variant="outline"
            onClick={() => setIsExpanded(true)}
            className="w-full"
            data-testid="button-show-service-requirements"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Major Service Requirements (Compressor/Evaporator)
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="slide-in">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-card-foreground">
          <div className="flex items-center">
            <AlertTriangle className="text-primary mr-3 h-5 w-5" />
            Service Requirements
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(false)}
            data-testid="button-hide-service-requirements"
          >
            Hide
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Label className="text-sm font-medium">Service Type</Label>
          <RadioGroup
            value={requirement.serviceType}
            onValueChange={(value) => setRequirement(prev => ({ ...prev, serviceType: value }))}
            data-testid="radio-service-type"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="compressor" id="compressor" />
              <Label htmlFor="compressor">Compressor Replacement</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="evaporator" id="evaporator" />
              <Label htmlFor="evaporator">Evaporator Coil Replacement</Label>
            </div>
          </RadioGroup>
        </div>

        {requirement.serviceType === "compressor" && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Failure Type</Label>
            <RadioGroup
              value={requirement.failureType}
              onValueChange={(value) => setRequirement(prev => ({ ...prev, failureType: value }))}
              data-testid="radio-failure-type"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="electrical" id="electrical" />
                <Label htmlFor="electrical">Electrical Short/Burnout</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mechanical" id="mechanical" />
                <Label htmlFor="mechanical">Mechanical Failure</Label>
              </div>
            </RadioGroup>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Acid Test Result (if performed)</Label>
              <Select
                value={requirement.acidTest}
                onValueChange={(value) => setRequirement(prev => ({ ...prev, acidTest: value }))}
              >
                <SelectTrigger data-testid="select-acid-test">
                  <SelectValue placeholder="Select acid test result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive (Acid Present)</SelectItem>
                  <SelectItem value="negative">Negative (No Acid)</SelectItem>
                  <SelectItem value="not-performed">Not Performed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {(requirement.serviceType === "compressor" || requirement.serviceType === "evaporator") && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">System Capacity (lbs)</Label>
            <Select
              value={requirement.systemCapacity}
              onValueChange={(value) => setRequirement(prev => ({ ...prev, systemCapacity: value }))}
            >
              <SelectTrigger data-testid="select-system-capacity">
                <SelectValue placeholder="Select system capacity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 lbs (Small Residential)</SelectItem>
                <SelectItem value="3">3 lbs (Medium Residential)</SelectItem>
                <SelectItem value="4">4 lbs (Large Residential)</SelectItem>
                <SelectItem value="6">6 lbs (Small Commercial)</SelectItem>
                <SelectItem value="8">8 lbs (Medium Commercial)</SelectItem>
                <SelectItem value="10">10 lbs (Large Commercial)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {requiredParts.length > 0 && (
          <div className="bg-muted/20 p-3 rounded-lg space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Required Parts:</Label>
            <ul className="text-sm space-y-1">
              {requiredParts.map((part) => (
                <li key={part.id} className="flex justify-between">
                  <span>• {part.name}</span>
                  <span className="text-muted-foreground">
                    {part.quantity} {part.unit} - ${(part.price * part.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          onClick={handleAddRequiredParts}
          disabled={!canAddParts || requiredParts.length === 0}
          className="w-full"
          data-testid="button-add-required-parts"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Required Parts ({requiredParts.length})
        </Button>
      </CardContent>
    </Card>
  );
}