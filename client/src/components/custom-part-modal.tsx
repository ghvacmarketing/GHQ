import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { QuotePart } from "@shared/schema";

interface CustomPartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPart: (part: QuotePart) => void;
  prefillData?: any;
}

interface CustomPartForm {
  partNumber: string;
  description: string;
  price: string;
  availability: string;
  vendor: string;
  warranty?: boolean;
  quantity: string;
  category: string;
}

export default function CustomPartModal({ isOpen, onClose, onAddPart, prefillData }: CustomPartModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [multiplePartsMode, setMultiplePartsMode] = useState(false);
  const [multiplePartsList, setMultiplePartsList] = useState<CustomPartForm[]>([]);
  
  const [formData, setFormData] = useState<CustomPartForm>({
    partNumber: "",
    description: "",
    price: "",
    availability: "In Stock",
    vendor: "",
    warranty: undefined,
    quantity: "1",
    category: "Custom",
  });

  // Handle prefilled data from conditional requirements
  useEffect(() => {
    if (prefillData?.requiredParts && prefillData.requiredParts.length > 0) {
      console.log('Prefill data received:', prefillData.requiredParts);
      setMultiplePartsMode(true);
      setMultiplePartsList(prefillData.requiredParts.map((part: any, index: number) => ({
        partNumber: "", // No part numbers for materials
        description: part.description,
        price: part.price || "0",
        availability: "Required",
        vendor: "GHVAC",
        warranty: false,
        quantity: part.quantity || "1",
        category: part.category || "Materials",
      })));
      console.log('Multiple parts list set:', prefillData.requiredParts);
    }
  }, [prefillData]);

  const createCustomPartMutation = useMutation({
    mutationFn: async (partData: any) => {
      const response = await apiRequest("POST", "/api/parts/custom", partData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Part Added",
        description: "Custom part has been added to your quote.",
      });
      
      // Create the quote part object
      const quotePart: QuotePart = {
        id: data.id || `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        partNumber: formData.partNumber || "",
        description: formData.description,
        category: formData.category || "Custom",
        price: formData.price || "0",
        availability: formData.availability || "In Stock",
        vendor: formData.vendor || "",
        warranty: formData.warranty || false,
        isCustom: true,
        quantity: parseFloat(formData.quantity) || 1,
      };

      onAddPart(quotePart);
      handleClose();
      queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add custom part. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setFormData({
      partNumber: "",
      description: "",
      price: "",
      availability: "In Stock",
      vendor: "",
      warranty: undefined,
      quantity: "1",
      category: "Custom",
    });
    setMultiplePartsMode(false);
    setMultiplePartsList([]);
    onClose();
  };

  const handleMultiplePartsSubmit = () => {
    console.log('Submitting multiple parts:', multiplePartsList);
    // Build all parts first with unique IDs
    const timestamp = Date.now();
    const partsToAdd: QuotePart[] = multiplePartsList.map((part, index) => ({
      id: `required-${timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      partNumber: part.partNumber || "",
      description: part.description,
      category: part.category,
      price: part.price,
      availability: part.availability,
      vendor: part.vendor,
      warranty: part.warranty || false,
      isCustom: true,
      quantity: parseFloat(part.quantity) || 1,
    }));

    console.log('Parts to add:', partsToAdd);

    // Add all parts synchronously
    partsToAdd.forEach(part => {
      console.log('Adding part:', part);
      onAddPart(part);
    });

    toast({
      title: "Parts Added",
      description: `${multiplePartsList.length} required parts added to your quote.`,
    });

    // Close immediately after adding all parts
    handleClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Handle multiple parts mode
    if (multiplePartsMode) {
      handleMultiplePartsSubmit();
      return;
    }

    if (!formData.description.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter a part description.",
        variant: "destructive",
      });
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price.",
        variant: "destructive",
      });
      return;
    }

    createCustomPartMutation.mutate({
      partNumber: formData.partNumber,
      description: formData.description,
      category: "Custom",
      price: price.toString(),
      availability: formData.availability,
      vendor: formData.vendor,
      warranty: formData.warranty,
      isCustom: true,
    });
  };

  const updateFormData = (updates: Partial<CustomPartForm>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-md mx-auto my-8 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {multiplePartsMode ? "Add Required Parts" : "Add Other Part"}
          </DialogTitle>
        </DialogHeader>
        
        {multiplePartsMode ? (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              The following parts are required for your service:
            </div>
            
            {multiplePartsList.map((part, index) => (
              <div key={index} className="border rounded-lg p-3 bg-muted/50">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{part.description}</div>
                    <div className="text-sm text-muted-foreground">
                      Quantity: {part.quantity} | Category: {part.category}
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    ${part.price}
                  </div>
                </div>
              </div>
            ))}
            
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleMultiplePartsSubmit}
                className="flex-1"
                data-testid="button-add-required-parts"
              >
                Add All Parts
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="partNumber" className="block text-sm font-medium text-card-foreground mb-2">
              Part Number
            </Label>
            <Input
              id="partNumber"
              type="text"
              placeholder="Enter part number (optional)"
              value={formData.partNumber}
              onChange={(e) => updateFormData({ partNumber: e.target.value })}
              className="w-full"
              data-testid="input-custom-part-number"
            />
          </div>
          
          <div>
            <Label htmlFor="description" className="block text-sm font-medium text-card-foreground mb-2">
              Description *
            </Label>
            <Input
              id="description"
              type="text"
              placeholder="Part description"
              value={formData.description}
              onChange={(e) => updateFormData({ description: e.target.value })}
              className="w-full"
              data-testid="input-custom-description"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price" className="block text-sm font-medium text-card-foreground mb-2">
                Price *
              </Label>
              <Input
                id="price"
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => updateFormData({ price: e.target.value })}
                className="w-full"
                data-testid="input-custom-price"
                required
              />
            </div>
            <div>
              <Label htmlFor="availability" className="block text-sm font-medium text-card-foreground mb-2">
                Availability
              </Label>
              <Select value={formData.availability} onValueChange={(value) => updateFormData({ availability: value })}>
                <SelectTrigger className="w-full" data-testid="select-custom-availability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem value="In Stock" className="text-popover-foreground">In Stock</SelectItem>
                  <SelectItem value="2-3 Days" className="text-popover-foreground">2-3 Days</SelectItem>
                  <SelectItem value="1 Week" className="text-popover-foreground">1 Week</SelectItem>
                  <SelectItem value="Backordered" className="text-popover-foreground">Backordered</SelectItem>
                  <SelectItem value="Out of Stock" className="text-popover-foreground">Out of Stock</SelectItem>
                  <SelectItem value="Special Order" className="text-popover-foreground">Special Order</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="vendor" className="block text-sm font-medium text-card-foreground mb-2">
              Vendor
            </Label>
            <Input
              id="vendor"
              type="text"
              placeholder="Vendor (optional)"
              value={formData.vendor}
              onChange={(e) => updateFormData({ vendor: e.target.value })}
              className="w-full"
              data-testid="input-custom-vendor"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="warranty"
              checked={formData.warranty}
              onCheckedChange={(checked) => updateFormData({ warranty: checked as boolean })}
              data-testid="checkbox-custom-warranty"
            />
            <Label htmlFor="warranty" className="text-sm font-medium text-card-foreground">
              Part has warranty
            </Label>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              className="flex-1"
              data-testid="button-cancel-custom-part"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={createCustomPartMutation.isPending}
              data-testid="button-submit-custom-part"
            >
              {createCustomPartMutation.isPending ? "Adding..." : "Add Part"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}