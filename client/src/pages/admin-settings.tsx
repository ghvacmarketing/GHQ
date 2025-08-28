import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Lock, Save, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PricingSettings {
  laborRate: number;
  commissionPercent: number;
  financingPromotionPercent: number;
  profitPercent: number;
  laborBenefitsPercent: number;
  salesTaxPercent: number;
  warrantyReserve: number;
  overheadPercent: number;
  warrantyDiscounts: Record<number, number>;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [settings, setSettings] = useState<PricingSettings>({
    laborRate: 65,
    commissionPercent: 0.03,
    financingPromotionPercent: 0.04,
    profitPercent: 0.21,
    laborBenefitsPercent: 0.34,
    salesTaxPercent: 0.08,
    warrantyReserve: 25,
    overheadPercent: 0.30,
    warrantyDiscounts: {
      2: 0.25, 3: 0.35, 4: 0.45, 5: 0.50, 6: 0.55,
      7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90
    }
  });

  // Fetch current settings
  const { data: currentSettings } = useQuery({
    queryKey: ["/api/settings"],
    enabled: isAuthenticated,
  });

  // Update settings when fetched
  useEffect(() => {
    if (currentSettings && isAuthenticated) {
      setSettings(currentSettings);
    }
  }, [currentSettings, isAuthenticated]);

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: PricingSettings) => {
      const response = await apiRequest("POST", "/api/admin/settings", newSettings);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings Saved",
        description: "Pricing settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings.",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "ghvacadmin") {
      setIsAuthenticated(true);
      toast({
        title: "Access Granted",
        description: "You can now edit pricing settings.",
      });
    } else {
      toast({
        title: "Access Denied",
        description: "Incorrect password.",
        variant: "destructive",
      });
    }
  };

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate(settings);
  };

  const updateSetting = (key: keyof PricingSettings, value: number) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateWarrantyDiscount = (year: number, discount: number) => {
    setSettings(prev => ({
      ...prev,
      warrantyDiscounts: {
        ...prev.warrantyDiscounts,
        [year]: discount / 100 // Convert percentage to decimal
      }
    }));
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans antialiased flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center">
              <Lock className="w-5 h-5 mr-2" />
              Admin Access Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter admin password"
                    data-testid="input-admin-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                data-testid="button-login"
              >
                Access Settings
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => window.location.href = "/"}
                data-testid="button-back-to-app"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to App
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = "/"}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Admin Settings</h1>
              <p className="text-xs text-muted-foreground">Pricing Configuration</p>
            </div>
          </div>
          <Button
            onClick={handleSaveSettings}
            disabled={saveSettingsMutation.isPending}
            data-testid="button-save-settings"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveSettingsMutation.isPending ? "Saving..." : "Save All"}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Basic Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Pricing</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="laborRate">Labor Rate ($/hour)</Label>
                <Input
                  id="laborRate"
                  type="number"
                  step="0.01"
                  value={settings.laborRate}
                  onChange={(e) => updateSetting('laborRate', parseFloat(e.target.value) || 0)}
                  data-testid="input-labor-rate"
                />
              </div>
              <div>
                <Label htmlFor="warrantyReserve">Warranty Reserve ($)</Label>
                <Input
                  id="warrantyReserve"
                  type="number"
                  step="0.01"
                  value={settings.warrantyReserve}
                  onChange={(e) => updateSetting('warrantyReserve', parseFloat(e.target.value) || 0)}
                  data-testid="input-warranty-reserve"
                />
              </div>
            </CardContent>
          </Card>

          {/* Percentages */}
          <Card>
            <CardHeader>
              <CardTitle>Percentage Settings</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="commission">Commission (%)</Label>
                <Input
                  id="commission"
                  type="number"
                  step="0.1"
                  value={(settings.commissionPercent * 100).toFixed(1)}
                  onChange={(e) => updateSetting('commissionPercent', (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-commission"
                />
              </div>
              <div>
                <Label htmlFor="financing">Financing/Promotion (%)</Label>
                <Input
                  id="financing"
                  type="number"
                  step="0.1"
                  value={(settings.financingPromotionPercent * 100).toFixed(1)}
                  onChange={(e) => updateSetting('financingPromotionPercent', (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-financing"
                />
              </div>
              <div>
                <Label htmlFor="profit">Profit (%)</Label>
                <Input
                  id="profit"
                  type="number"
                  step="0.1"
                  value={(settings.profitPercent * 100).toFixed(1)}
                  onChange={(e) => updateSetting('profitPercent', (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-profit"
                />
              </div>
              <div>
                <Label htmlFor="laborBenefits">Labor Benefits (%)</Label>
                <Input
                  id="laborBenefits"
                  type="number"
                  step="0.1"
                  value={(settings.laborBenefitsPercent * 100).toFixed(1)}
                  onChange={(e) => updateSetting('laborBenefitsPercent', (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-labor-benefits"
                />
              </div>
              <div>
                <Label htmlFor="salesTax">Sales Tax (%)</Label>
                <Input
                  id="salesTax"
                  type="number"
                  step="0.1"
                  value={(settings.salesTaxPercent * 100).toFixed(1)}
                  onChange={(e) => updateSetting('salesTaxPercent', (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-sales-tax"
                />
              </div>
              <div>
                <Label htmlFor="overhead">Overhead (%)</Label>
                <Input
                  id="overhead"
                  type="number"
                  step="0.1"
                  value={(settings.overheadPercent * 100).toFixed(1)}
                  onChange={(e) => updateSetting('overheadPercent', (parseFloat(e.target.value) || 0) / 100)}
                  data-testid="input-overhead"
                />
              </div>
            </CardContent>
          </Card>

          {/* Warranty Discounts */}
          <Card>
            <CardHeader>
              <CardTitle>Warranty Discounts by Year</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(settings.warrantyDiscounts).map(([year, discount]) => (
                <div key={year}>
                  <Label htmlFor={`warranty-${year}`}>{year} Year (%)</Label>
                  <Input
                    id={`warranty-${year}`}
                    type="number"
                    step="1"
                    value={(discount * 100).toFixed(0)}
                    onChange={(e) => updateWarrantyDiscount(parseInt(year), parseFloat(e.target.value) || 0)}
                    data-testid={`input-warranty-${year}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}