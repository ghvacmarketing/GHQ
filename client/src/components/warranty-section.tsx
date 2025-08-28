import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";

interface WarrantySectionProps {
  ghvacInstalled: boolean;
  yearsSinceInstallation?: string;
  onUpdate: (updates: { ghvacInstalled?: boolean; yearsSinceInstallation?: string }) => void;
}

export default function WarrantySection({
  ghvacInstalled,
  yearsSinceInstallation,
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
          <div className="flex items-center space-x-3">
            <Checkbox
              id="ghvacInstalled"
              checked={ghvacInstalled}
              onCheckedChange={(checked) => onUpdate({ ghvacInstalled: !!checked })}
              data-testid="checkbox-ghvac-installed"
            />
            <Label htmlFor="ghvacInstalled" className="text-sm font-medium text-card-foreground">
              Originally installed by GHVAC?
            </Label>
          </div>
          
          {ghvacInstalled && (
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
