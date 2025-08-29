import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, X, CheckCircle } from "lucide-react";
import type { QuotePart } from "@shared/schema";

interface ConditionalRequirementsProps {
  selectedParts: QuotePart[];
  onAddParts: (parts: QuotePart[]) => void;
  onAddCustomPart: (prefillData?: any) => void;
}

interface ServiceRequirement {
  partId: string;
  partDescription: string;
  serviceType: string;
  failureType?: string;
  acidTest?: string;
  systemCapacity?: string;
  completed: boolean;
}

export default function ConditionalRequirements({ selectedParts, onAddParts, onAddCustomPart }: ConditionalRequirementsProps) {
  const [requirements, setRequirements] = useState<ServiceRequirement[]>([]);

  // Get parts that need conditional requirements
  const getPartsNeedingRequirements = () => {
    if (!selectedParts || selectedParts.length === 0) return [];
    
    return selectedParts.filter(part => {
      const desc = part.description.toLowerCase();
      return desc.includes('compressor') || desc.includes('evaporator');
    });
  };

  // Initialize requirements for new parts
  const initializeRequirements = () => {
    const partsNeedingRequirements = getPartsNeedingRequirements();
    const existingRequirementIds = requirements.map(req => req.partId);
    
    const newRequirements = partsNeedingRequirements
      .filter(part => !existingRequirementIds.includes(part.id))
      .map(part => ({
        partId: part.id,
        partDescription: part.description,
        serviceType: part.description.toLowerCase().includes('compressor') ? 'compressor' : 'evaporator',
        failureType: '',
        acidTest: '',
        systemCapacity: '',
        completed: false,
      }));

    if (newRequirements.length > 0) {
      setRequirements(prev => [...prev, ...newRequirements]);
    }

    // Remove requirements for parts that are no longer in the cart
    const currentPartIds = partsNeedingRequirements.map(part => part.id);
    setRequirements(prev => prev.filter(req => currentPartIds.includes(req.partId)));
  };

  // Initialize requirements when parts change
  useEffect(() => {
    initializeRequirements();
  }, [selectedParts]);

  const updateRequirement = (partId: string, updates: Partial<ServiceRequirement>) => {
    setRequirements(prev => prev.map(req => 
      req.partId === partId ? { ...req, ...updates } : req
    ));
  };

  const getRequiredPartsInfo = (req: ServiceRequirement) => {
    const partsInfo: string[] = [];

    if (req.serviceType === "compressor") {
      // ALWAYS REQUIRED
      partsInfo.push("Refrigerant Filter Dryer");

      // CONDITIONAL: Based on failure type OR acid test result
      const needsAcidTreatment = 
        req.failureType === "electrical" || 
        req.acidTest === "positive";

      const needsRefrigerantReplacement = 
        req.failureType === "electrical" || 
        req.acidTest === "positive";

      if (needsAcidTreatment) {
        partsInfo.push("Acid Away");
      }

      if (needsRefrigerantReplacement && req.systemCapacity) {
        const pounds = parseFloat(req.systemCapacity);
        partsInfo.push(`Refrigerant (${pounds} lbs)`);
      }
    }

    if (req.serviceType === "evaporator") {
      // ALWAYS REQUIRED
      partsInfo.push("Refrigerant Filter Dryer");
      
      if (req.systemCapacity) {
        const pounds = parseFloat(req.systemCapacity);
        partsInfo.push(`Refrigerant (${pounds} lbs)`);
      }
    }

    return partsInfo;
  };

  const isRequirementComplete = (req: ServiceRequirement) => {
    if (!req.systemCapacity) return false;
    
    if (req.serviceType === "compressor") {
      // Need either failure type OR acid test result
      return (req.failureType || req.acidTest) && req.systemCapacity;
    }
    
    if (req.serviceType === "evaporator") {
      return req.systemCapacity;
    }
    
    return false;
  };

  const markAsCompleted = async (partId: string) => {
    const req = requirements.find(r => r.partId === partId);
    if (!req) return;

    updateRequirement(partId, { completed: true });
    
    // Fetch current settings to get Google Sheets pricing
    try {
      const response = await fetch('/api/settings');
      const settings = await response.json();
      
      // Generate required parts based on the requirement
      const requiredPartsInfo = getRequiredPartsInfo(req);
      const requiredParts = requiredPartsInfo.map((partInfo, index) => {
        // Parse part info to extract name and quantity/unit
        let partName = partInfo;
        let unitInfo = '';
        let price = '0';
        
        // Handle refrigerant with pounds
        if (partInfo.includes('Refrigerant (') && partInfo.includes(' lbs)')) {
          const match = partInfo.match(/Refrigerant \((\d+(?:\.\d+)?)\s*lbs?\)/);
          if (match) {
            partName = 'Refrigerant';
            unitInfo = match[1]; // Just the number of pounds as quantity
            // Get refrigerant price per lb from Google Sheets
            price = (settings.partsPrices?.refrigerant || 65).toString();
          }
        } else if (partName === 'Refrigerant Filter Dryer') {
          // Get filter dryer price from Google Sheets
          price = (settings.partsPrices?.refrigerantFilterDryer || 70).toString();
        } else if (partName === 'Acid Away') {
          // Get acid away price from Google Sheets
          price = (settings.partsPrices?.acidAway || 60).toString();
        }
        
        return {
          description: partName,
          price: price,
          quantity: unitInfo || '1',
          category: 'Materials'
        };
      });

      // Open custom part modal with pre-filled parts
      onAddCustomPart({ requiredParts });
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
      // Fallback to default prices if fetch fails
      const requiredPartsInfo = getRequiredPartsInfo(req);
      const requiredParts = requiredPartsInfo.map((partInfo, index) => {
        let partName = partInfo;
        let unitInfo = '';
        let price = '0';
        
        if (partInfo.includes('Refrigerant (') && partInfo.includes(' lbs)')) {
          const match = partInfo.match(/Refrigerant \((\d+(?:\.\d+)?)\s*lbs?\)/);
          if (match) {
            partName = 'Refrigerant';
            unitInfo = match[1]; // Just the number of pounds as quantity
            price = '65'; // Default $65/lb
          }
        } else if (partName === 'Refrigerant Filter Dryer') {
          price = '70'; // Default $70
        } else if (partName === 'Acid Away') {
          price = '60'; // Default $60
        }
        
        return {
          description: partName,
          price: price,
          quantity: unitInfo || '1',
          category: 'Materials'
        };
      });
      
      onAddCustomPart({ requiredParts });
    }
  };

  const removeRequirement = (partId: string) => {
    setRequirements(prev => prev.filter(req => req.partId !== partId));
  };

  const incompleteRequirements = requirements.filter(req => !req.completed);
  const completedRequirements = requirements.filter(req => req.completed);
  

  if (requirements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Incomplete Requirements */}
      {incompleteRequirements.map((req) => (
        <Card key={req.partId} className="slide-in border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="text-orange-600 mr-2 h-4 w-4" />
                <CardTitle className="text-sm text-orange-800">
                  {req.partDescription} Requirements
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeRequirement(req.partId)}
                className="h-6 w-6 p-0 text-orange-600 hover:text-orange-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Compressor-specific fields */}
            {req.serviceType === "compressor" && (
              <>
                <div>
                  <Label className="text-xs font-medium">Failure Type</Label>
                  <RadioGroup
                    value={req.failureType}
                    onValueChange={(value) => updateRequirement(req.partId, { failureType: value })}
                    className="mt-1"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="electrical" id={`electrical-${req.partId}`} />
                      <Label htmlFor={`electrical-${req.partId}`} className="text-xs">Electrical Short/Burnout</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mechanical" id={`mechanical-${req.partId}`} />
                      <Label htmlFor={`mechanical-${req.partId}`} className="text-xs">Mechanical Failure</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs font-medium">Acid Test Result</Label>
                  <Select
                    value={req.acidTest}
                    onValueChange={(value) => updateRequirement(req.partId, { acidTest: value })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select result" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive">Positive (Acid Present)</SelectItem>
                      <SelectItem value="negative">Negative (No Acid)</SelectItem>
                      <SelectItem value="not-performed">Not Performed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* System Capacity - shown for both service types */}
            <div>
              <Label className="text-xs font-medium">System Capacity (lbs)</Label>
              <Select
                value={req.systemCapacity}
                onValueChange={(value) => updateRequirement(req.partId, { systemCapacity: value })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select capacity" />
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

            {/* Requirements Summary */}
            {isRequirementComplete(req) && (
              <div className="bg-white border border-gray-200 rounded-lg p-2">
                <h4 className="font-medium text-xs mb-1">Required Parts:</h4>
                <ul className="text-xs space-y-0.5 text-gray-700">
                  {getRequiredPartsInfo(req).map((info, index) => (
                    <li key={index}>• {info}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Complete Button */}
            {isRequirementComplete(req) && (
              <Button
                onClick={() => markAsCompleted(req.partId)}
                className="w-full h-8 text-xs"
                size="sm"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Required Parts
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Completed Requirements */}
      {completedRequirements.map((req) => (
        <Card key={req.partId} className="border-green-200 bg-green-50/50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle className="text-green-600 mr-2 h-4 w-4" />
                <span className="text-sm text-green-800 font-medium">
                  {req.partDescription} - Requirements Complete
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateRequirement(req.partId, { completed: false })}
                className="h-6 px-2 text-xs text-green-600 hover:text-green-800"
              >
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}