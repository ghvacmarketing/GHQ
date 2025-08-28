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
    partNumber: "",
    description: "",
    price: "",
    availability: "In Stock",
    vendor: "",
    warranty: undefined,
  });

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
        id: data.id || `custom-${Date.now()}`,
        partNumber: formData.partNumber,
        description: formData.description,
        category: "Custom",
        price: formData.price,
        availability: formData.availability,
        vendor: formData.vendor,
        warranty: formData.warranty || false,
        isCustom: true,
        quantity: 1,
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
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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
          <DialogTitle>Add Other Part</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}