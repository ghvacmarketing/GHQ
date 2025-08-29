import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";

interface WarrantySectionProps {
  ghvacInstalled?: boolean;
  yearsSinceInstallation?: string;
  laborHours?: string;
  onUpdate: (updates: { ghvacInstalled?: boolean; yearsSinceInstallation?: string; laborHours?: string }) => void;
}

export default function WarrantySection({
  ghvacInstalled,
  yearsSinceInstallation,
  laborHours,
  onUpdate,
}: WarrantySectionProps) {
  return (
    <Card className="slide-in">
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <Shield className="text-primary mr-3 h-5 w-5" />
          <h2 className="text-lg font-semibold text-card-foreground">Warranty & Pricing</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-card-foreground">
              Originally installed by Giesbrecht HVAC? *
            </Label>
            <div className="flex space-x-2">
              <Button
                type="button"
                variant={ghvacInstalled === true ? "default" : "outline"}
                size="sm"
                onClick={() => onUpdate({ ghvacInstalled: true })}
                className="flex-1"
                data-testid="button-warranty-yes"
              >
                Yes
              </Button>
              <Button
                type="button"
                variant={ghvacInstalled === false ? "default" : "outline"}
                size="sm"
                onClick={() => onUpdate({ ghvacInstalled: false })}
                className="flex-1"
                data-testid="button-warranty-no"
              >
                No
              </Button>
            </div>
            {ghvacInstalled === undefined && (
              <p className="text-xs text-destructive">Please select Yes or No</p>
            )}
          </div>
          
          <div className="space-y-3">
            <Label htmlFor="laborHours" className="block text-sm font-medium text-card-foreground">
              Labor Hours *
            </Label>
            <Input
              id="laborHours"
              type="number"
              placeholder="Enter hours (e.g. 1, 1.5, 2)"
              min="0.25"
              step="0.25"
              max="24"
              value={laborHours}
              onChange={(e) => onUpdate({ laborHours: e.target.value })}
              className="w-full"
              data-testid="input-labor-hours"
            />
            <p className="text-xs text-muted-foreground">
              Hours of labor to charge (increments of 0.25)
            </p>
            {!laborHours && (
              <p className="text-xs text-destructive">Please enter labor hours</p>
            )}
          </div>

          {ghvacInstalled === true && (
            <div className="p-3 bg-accent/20 rounded-lg slide-in">
              <Label htmlFor="yearsSince" className="block text-sm font-medium text-card-foreground mb-2">
                Years since installation
              </Label>
              <Input
                id="yearsSince"
                type="number"
                placeholder="1-10 years"
                min="1"
                max="10"
                value={yearsSinceInstallation}
                onChange={(e) => onUpdate({ yearsSinceInstallation: e.target.value })}
                className="w-full"
                data-testid="input-years-since-installation"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Prorated labor pricing will be applied
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
