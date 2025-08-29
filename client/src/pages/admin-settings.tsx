import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Eye, EyeOff, ExternalLink } from "lucide-react";

export default function AdminSettings() {
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Fetch current settings from Google Sheets
  const { data: currentSettings, refetch, isLoading } = useQuery({
    queryKey: ["/api/settings"],
    enabled: isAuthenticated,
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "ghvacadmin") {
      setIsAuthenticated(true);
      toast({
        title: "Access Granted",
        description: "You can now view Google Sheets pricing data.",
      });
    } else {
      toast({
        title: "Access Denied",
        description: "Incorrect password.",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async () => {
    await refetch();
    toast({
      title: "Data Refreshed",
      description: "Latest pricing data pulled from Google Sheets.",
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Admin Access Required</CardTitle>
            <p className="text-center text-sm text-muted-foreground">
              Enter admin password to view Google Sheets pricing data
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="password">Admin Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className="pr-10"
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
              <h1 className="text-lg font-semibold text-foreground">Settings Dashboard</h1>
              <p className="text-xs text-muted-foreground">Live data from Google Sheets</p>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            data-testid="button-refresh-settings"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? "Refreshing..." : "Refresh Data"}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {/* Google Sheets Notice */}
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <ExternalLink className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-100">
                    Settings Managed via Google Sheets
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-200 mt-1">
                    All pricing data is automatically pulled from your Google Sheets spreadsheet. 
                    To update values, edit your spreadsheet and click "Refresh Data" above.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Settings Display */}
          {currentSettings && (
            <>
              {/* Labor & Basic Pricing */}
              <Card>
                <CardHeader>
                  <CardTitle>Labor & Basic Pricing</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Labor Rate ($/hour)</Label>
                    <Input
                      value={`$${currentSettings.laborRate || 0}`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C5</p>
                  </div>
                  <div>
                    <Label>Warranty Reserve ($)</Label>
                    <Input
                      value={`$${currentSettings.warrantyReserve || 0}`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell E39</p>
                  </div>
                </CardContent>
              </Card>

              {/* Business Percentages */}
              <Card>
                <CardHeader>
                  <CardTitle>Business Percentages</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Commission (%)</Label>
                    <Input
                      value={`${((currentSettings.commissionPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C6</p>
                  </div>
                  <div>
                    <Label>Financing/Promotion (%)</Label>
                    <Input
                      value={`${((currentSettings.financingPromotionPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C7</p>
                  </div>
                  <div>
                    <Label>Profit (%)</Label>
                    <Input
                      value={`${((currentSettings.profitPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C8</p>
                  </div>
                  <div>
                    <Label>Overhead (%)</Label>
                    <Input
                      value={`${((currentSettings.overheadPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B41</p>
                  </div>
                  <div>
                    <Label>Labor Benefits (%)</Label>
                    <Input
                      value={`${((currentSettings.laborBenefitsPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B34</p>
                  </div>
                  <div>
                    <Label>Sales Tax (%)</Label>
                    <Input
                      value={`${((currentSettings.salesTaxPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B38</p>
                  </div>
                  <div>
                    <Label>Material Shrinkage (%)</Label>
                    <Input
                      value={`${((currentSettings.materialShrinkagePercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B25</p>
                  </div>
                </CardContent>
              </Card>

              {/* Parts Pricing */}
              {currentSettings.partsPrices && (
                <Card>
                  <CardHeader>
                    <CardTitle>Material Pricing</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Refrigerant Filter Dryer</Label>
                      <Input
                        value={`$${currentSettings.partsPrices.refrigerantFilterDryer || 0}`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D20</p>
                    </div>
                    <div>
                      <Label>Copper</Label>
                      <Input
                        value={`$${currentSettings.partsPrices.copper || 0}/ft`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D21</p>
                    </div>
                    <div>
                      <Label>Armaflex Insulation</Label>
                      <Input
                        value={`$${currentSettings.partsPrices.armaflexInsulation || 0}/ft`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D22</p>
                    </div>
                    <div>
                      <Label>Acid Away</Label>
                      <Input
                        value={`$${currentSettings.partsPrices.acidAway || 0}`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D23</p>
                    </div>
                    <div>
                      <Label>Refrigerant</Label>
                      <Input
                        value={`$${currentSettings.partsPrices.refrigerant || 0}/lb`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D24</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Warranty Discounts */}
              <Card>
                <CardHeader>
                  <CardTitle>GHVAC Warranty Discounts</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Labor rate discounts based on years since GHVAC installation
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {currentSettings.warrantyDiscounts && Object.entries(currentSettings.warrantyDiscounts).map(([year, discount]) => (
                      <div key={year} className="text-center">
                        <Label className="text-xs">Year {year}</Label>
                        <Input
                          value={`${(Number(discount) * 100).toFixed(0)}%`}
                          readOnly
                          className="bg-muted text-center text-xs h-8"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}