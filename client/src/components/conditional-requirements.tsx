import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus } from "lucide-react";
import type { QuotePart } from "@shared/schema";

interface ConditionalRequirementsProps {
  selectedParts: QuotePart[];
  onAddParts: (parts: QuotePart[]) => void;
}

interface ServiceRequirement {
  serviceType: string;
  failureType?: string;
  acidTest?: string;
  systemCapacity?: string;
}

export default function ConditionalRequirements({ selectedParts, onAddParts }: ConditionalRequirementsProps) {
  const [requirement, setRequirement] = useState<ServiceRequirement>({
    serviceType: "",
    failureType: "",
    acidTest: "",
    systemCapacity: "",
  });

  // Check if any trigger parts are present
  const hasTriggerParts = () => {
    if (!selectedParts || selectedParts.length === 0) return false;
    const triggerKeywords = ['compressor', 'evaporator'];
    return selectedParts.some(part => 
      triggerKeywords.some(keyword => 
        part.description.toLowerCase().includes(keyword)
      )
    );
  };

  // Auto-detect service type from selected parts
  const getDetectedServiceType = () => {
    if (!selectedParts || selectedParts.length === 0) return '';
    const compressorParts = selectedParts.filter(part => 
      part.description.toLowerCase().includes('compressor')
    );
    const evaporatorParts = selectedParts.filter(part => 
      part.description.toLowerCase().includes('evaporator')
    );
    
    if (compressorParts.length > 0) return 'compressor';
    if (evaporatorParts.length > 0) return 'evaporator';
    return '';
  };

  const getRequiredParts = (): QuotePart[] => {
    const parts: QuotePart[] = [];

    if (requirement.serviceType === "compressor") {
      // ALWAYS REQUIRED: Filter dryer replacement for every compressor replacement
      parts.push({
        id: "req-filter-dryer",
        partNumber: "RFD-REQ",
        description: "Refrigerant Filter Dryer (Required)",
        category: "Materials",
        price: "45.00",
        availability: "Required",
        warranty: false,
        isCustom: false,
        quantity: 1,
      });

      // CONDITIONAL: Based on failure type OR acid test result
      const needsAcidTreatment = 
        requirement.failureType === "electrical" || 
        requirement.acidTest === "positive";

      const needsRefrigerantReplacement = 
        requirement.failureType === "electrical" || 
        requirement.acidTest === "positive";

      if (needsAcidTreatment) {
        parts.push({
          id: "req-acid-away",
          partNumber: "AA-REQ",
          description: "Acid Away (Required for electrical failure/acid contamination)",
          category: "Materials",
          price: "85.00",
          availability: "Required",
          warranty: false,
          isCustom: false,
          quantity: 1,
        });
      }

      if (needsRefrigerantReplacement && requirement.systemCapacity) {
        const pounds = parseFloat(requirement.systemCapacity);
        parts.push({
          id: "req-refrigerant",
          partNumber: "REF-REQ",
          description: "Refrigerant (Full system replacement)",
          category: "Materials",
          price: "12.50",
          availability: "Required",
          warranty: false,
          isCustom: false,
          quantity: pounds,
        });
      }
    }

    if (requirement.serviceType === "evaporator") {
      // ALWAYS REQUIRED: Filter dryer replacement for every evaporator replacement
      parts.push({
        id: "req-evap-filter-dryer",
        partNumber: "RFD-EVAP-REQ",
        description: "Refrigerant Filter Dryer (Required for evaporator)",
        category: "Materials",
        price: "45.00",
        availability: "Required",
        warranty: false,
        isCustom: false,
        quantity: 1,
      });

      // ALWAYS REQUIRED: Full refrigerant replacement for evaporator
      if (requirement.systemCapacity) {
        const pounds = parseFloat(requirement.systemCapacity);
        parts.push({
          id: "req-evap-refrigerant",
          partNumber: "REF-EVAP-REQ",
          description: "Refrigerant (Full system replacement for evaporator)",
          category: "Materials",
          price: "12.50",
          availability: "Required",
          warranty: false,
          isCustom: false,
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
      // Reset form
      setRequirement({
        serviceType: "",
        failureType: "",
        acidTest: "",
        systemCapacity: "",
      });
    }
  };

  const detectedServiceType = getDetectedServiceType();

  if (!hasTriggerParts()) {
    return null; // Don't show if no trigger parts are selected
  }

  return (
    <Card className="slide-in border-orange-200 bg-orange-50/50">
      <CardHeader className="pb-4">
        <div className="flex items-center">
          <AlertTriangle className="text-orange-600 mr-3 h-5 w-5" />
          <CardTitle className="text-lg text-orange-800">Service Requirements</CardTitle>
        </div>
        {detectedServiceType && (
          <p className="text-sm text-orange-700 mt-2">
            Detected {detectedServiceType} replacement - please complete the requirements below
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Service Type Selection */}
        <div>
          <Label className="text-sm font-medium">Service Type</Label>
          <RadioGroup
            value={requirement.serviceType}
            onValueChange={(value) => setRequirement(prev => ({ 
              ...prev, 
              serviceType: value,
              failureType: "", // Reset dependent fields
              acidTest: "",
            }))}
            className="mt-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="compressor" id="compressor" data-testid="radio-compressor" />
              <Label htmlFor="compressor">Compressor Replacement</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="evaporator" id="evaporator" data-testid="radio-evaporator" />
              <Label htmlFor="evaporator">Evaporator Coil Replacement</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Compressor-specific fields */}
        {requirement.serviceType === "compressor" && (
          <>
            <div>
              <Label className="text-sm font-medium">Failure Type</Label>
              <RadioGroup
                value={requirement.failureType}
                onValueChange={(value) => setRequirement(prev => ({ ...prev, failureType: value }))}
                className="mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="electrical" id="electrical" data-testid="radio-electrical" />
                  <Label htmlFor="electrical">Electrical Short/Burnout</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mechanical" id="mechanical" data-testid="radio-mechanical" />
                  <Label htmlFor="mechanical">Mechanical Failure</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-gray-600 mt-1">
                Electrical failures require acid treatment and full refrigerant replacement
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium">Acid Test Result</Label>
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
              <p className="text-xs text-gray-600 mt-1">
                Positive acid test overrides failure type - requires acid treatment and refrigerant replacement
              </p>
            </div>
          </>
        )}

        {/* System Capacity - shown for both service types */}
        {requirement.serviceType && (
          <div>
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

        {/* Requirements Summary */}
        {requirement.serviceType && (
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <h4 className="font-medium text-sm mb-2">Required Parts:</h4>
            <ul className="text-xs space-y-1 text-gray-700">
              {requirement.serviceType === "compressor" && (
                <>
                  <li>• Filter Dryer (Always Required)</li>
                  {(requirement.failureType === "electrical" || requirement.acidTest === "positive") && (
                    <>
                      <li>• Acid Away Treatment (Electrical failure/Acid contamination)</li>
                      {requirement.systemCapacity && (
                        <li>• {requirement.systemCapacity} lbs Refrigerant (Full replacement)</li>
                      )}
                    </>
                  )}
                  {requirement.failureType === "mechanical" && requirement.acidTest !== "positive" && (
                    <li>• No acid treatment or refrigerant replacement needed (Mechanical failure only)</li>
                  )}
                </>
              )}
              {requirement.serviceType === "evaporator" && (
                <>
                  <li>• Filter Dryer (Always Required)</li>
                  {requirement.systemCapacity && (
                    <li>• {requirement.systemCapacity} lbs Refrigerant (Always Required)</li>
                  )}
                </>
              )}
            </ul>
          </div>
        )}

        {/* Add Parts Button */}
        {requirement.serviceType && requirement.systemCapacity && (
          <Button
            onClick={handleAddRequiredParts}
            className="w-full flex items-center justify-center"
            data-testid="button-add-required-parts"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Required Parts
          </Button>
        )}
      </CardContent>
    </Card>
  );
}