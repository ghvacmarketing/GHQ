import { useState } from "react";
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
}

interface CustomPartForm {
  selectedPart: string;
  partNumber: string;
  description: string;
  price: string;
  availability: string;
  vendor: string;
  warranty?: boolean;
}

export default function CustomPartModal({ isOpen, onClose, onAddPart }: CustomPartModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<CustomPartForm>({
    selectedPart: "",
    partNumber: "",
    description: "",
    price: "",
    availability: "In Stock",
    vendor: "",
    warranty: undefined,
  });

  // Suggested parts from common inventory
  const suggestedParts = [
    { id: "contactor-30a", name: "30A Contactor", price: "45.00", category: "Electrical" },
    { id: "capacitor-dual", name: "Dual Run Capacitor", price: "25.00", category: "Electrical" },
    { id: "disconnect-60a", name: "60A Disconnect Switch", price: "35.00", category: "Electrical" },
    { id: "fuse-30a", name: "30A Time Delay Fuse", price: "8.50", category: "Electrical" },
    { id: "thermostat-digital", name: "Digital Thermostat", price: "125.00", category: "Controls" },
    { id: "filter-16x25", name: "16x25x1 Air Filter", price: "12.00", category: "Filters" },
    { id: "belt-4l", name: "4L Blower Belt", price: "15.00", category: "Parts" },
    { id: "motor-condenser", name: "Condenser Fan Motor", price: "185.00", category: "Motors" },
    { id: "custom", name: "Custom Part (Enter Details)", price: "", category: "Custom" }
  ];

  const createCustomPartMutation = useMutation({
    mutationFn: async (partData: any) => {
      const response = await apiRequest("POST", "/api/parts/custom", partData);
      return response.json();
    },
    onSuccess: (data) => {
      const quotePart: QuotePart = {
        id: data.id,
        partNumber: data.partNumber,
        description: data.description,
        category: "Custom",
        price: data.price,
        availability: data.availability,
        vendor: data.vendor,
        warranty: data.warranty,
        isCustom: true,
        quantity: 1,
      };
      
      onAddPart(quotePart);
      handleClose();
      
      toast({
        title: "Custom Part Added",
        description: "The custom part has been added to your quote.",
      });
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
      selectedPart: "",
      partNumber: "",
      description: "",
      price: "",
      availability: "In Stock",
      vendor: "",
      warranty: undefined,
    });
    onClose();
  };

  const handlePartSelection = (partId: string) => {
    const selectedPart = suggestedParts.find(p => p.id === partId);
    if (selectedPart && partId !== "custom") {
      // Auto-fill form for suggested parts
      updateFormData({
        selectedPart: partId,
        partNumber: selectedPart.id.toUpperCase(),
        description: selectedPart.name,
        price: selectedPart.price,
        vendor: "Standard",
      });
    } else {
      // Clear form for custom entry
      updateFormData({
        selectedPart: partId,
        partNumber: "",
        description: "",
        price: "",
        vendor: "",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.selectedPart || !formData.partNumber || !formData.description || !formData.price || formData.warranty === undefined) {
      toast({
        title: "Missing Information",
        description: "Please complete all required fields including warranty selection.",
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
          <DialogTitle>Add Custom Part</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="partSelect" className="block text-sm font-medium text-card-foreground mb-2">
              Select Part *
            </Label>
            <Select value={formData.selectedPart} onValueChange={handlePartSelection}>
              <SelectTrigger className="w-full" data-testid="select-part-dropdown">
                <SelectValue placeholder="Choose from suggested parts or custom" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                {suggestedParts.map((part) => (
                  <SelectItem key={part.id} value={part.id} className="text-popover-foreground">
                    {part.name} {part.price && `- $${part.price}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.selectedPart && (
            <>
              <div>
                <Label htmlFor="partNumber" className="block text-sm font-medium text-card-foreground mb-2">
                  Part Number *
                </Label>
                <Input
                  id="partNumber"
                  type="text"
                  placeholder="Enter part number"
                  value={formData.partNumber}
                  onChange={(e) => updateFormData({ partNumber: e.target.value })}
                  className="w-full"
                  data-testid="input-custom-part-number"
                  required
                  readOnly={formData.selectedPart !== "custom"}
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
                  readOnly={formData.selectedPart !== "custom"}
                />
              </div>
            </>
          )}
          
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
              placeholder="Vendor name"
              value={formData.vendor}
              onChange={(e) => updateFormData({ vendor: e.target.value })}
              className="w-full"
              data-testid="input-custom-vendor"
            />
          </div>
          
          {formData.selectedPart && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-card-foreground">
                Warranty covered part? *
              </Label>
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant={formData.warranty === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateFormData({ warranty: true })}
                  className="flex-1"
                  data-testid="button-custom-warranty-yes"
                >
                  Yes
                </Button>
                <Button
                  type="button"
                  variant={formData.warranty === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateFormData({ warranty: false })}
                  className="flex-1"
                  data-testid="button-custom-warranty-no"
                >
                  No
                </Button>
              </div>
              {formData.warranty === undefined && (
                <p className="text-xs text-destructive">Please select Yes or No</p>
              )}
            </div>
          )}
          
          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              className="flex-1"
              data-testid="button-cancel-custom-part"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCustomPartMutation.isPending}
              className="flex-1"
              data-testid="button-add-custom-part"
            >
              {createCustomPartMutation.isPending ? "Adding..." : "Add Part"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
