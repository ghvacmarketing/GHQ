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
  warranty: boolean;
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
    warranty: false,
  });

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
      partNumber: "",
      description: "",
      price: "",
      availability: "In Stock",
      vendor: "",
      warranty: false,
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.partNumber || !formData.description || !formData.price) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
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
      <DialogContent className="w-full max-w-md mx-4">
        <DialogHeader>
          <DialogTitle>Add Custom Part</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                <SelectContent>
                  <SelectItem value="In Stock">In Stock</SelectItem>
                  <SelectItem value="2-3 Days">2-3 Days</SelectItem>
                  <SelectItem value="1 Week">1 Week</SelectItem>
                  <SelectItem value="Special Order">Special Order</SelectItem>
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
          
          <div className="flex items-center space-x-3">
            <Checkbox
              id="warrantyPart"
              checked={formData.warranty}
              onCheckedChange={(checked) => updateFormData({ warranty: !!checked })}
              data-testid="checkbox-custom-warranty"
            />
            <Label htmlFor="warrantyPart" className="text-sm font-medium text-card-foreground">
              Warranty covered part
            </Label>
          </div>
          
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
