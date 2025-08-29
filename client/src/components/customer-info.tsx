import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User } from "lucide-react";
import type { Technician } from "@shared/schema";

interface CustomerInfoProps {
  customerName: string;
  technician: string;
  technicians: Technician[];
  onUpdate: (updates: { customerName?: string; technician?: string }) => void;
  hasErrors?: {
    customerName?: boolean;
    technician?: boolean;
  };
}

export default function CustomerInfo({
  customerName,
  technician,
  technicians,
  onUpdate,
  hasErrors,
}: CustomerInfoProps) {
  return (
    <Card className="slide-in">
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <User className="text-primary mr-3 h-5 w-5" />
          <h2 className="text-lg font-semibold text-card-foreground">Customer Information</h2>
        </div>
        <div className="space-y-4">
          <div>
            <Label htmlFor="customerName" className="block text-sm font-medium text-card-foreground mb-2">
              Customer Name
            </Label>
            <Input
              id="customerName"
              type="text"
              placeholder="Enter customer name"
              value={customerName}
              onChange={(e) => onUpdate({ customerName: e.target.value })}
              className={`w-full ${hasErrors?.customerName ? 'border-destructive focus:border-destructive' : ''}`}
              data-testid="input-customer-name"
            />
            {hasErrors?.customerName && (
              <p className="text-xs text-destructive mt-1">Customer name is required</p>
            )}
          </div>
          <div>
            <Label htmlFor="technician" className="block text-sm font-medium text-card-foreground mb-2">
              Technician
            </Label>
            <Select value={technician} onValueChange={(value) => onUpdate({ technician: value })}>
              <SelectTrigger className={`w-full ${hasErrors?.technician ? 'border-destructive focus:border-destructive' : ''}`} data-testid="select-technician">
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.name} className="text-popover-foreground">
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasErrors?.technician && (
              <p className="text-xs text-destructive mt-1">Please select a technician</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
