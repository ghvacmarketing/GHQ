import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Eye, EyeOff, ExternalLink, Trash2, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Quote } from "@shared/schema";

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const [emailAddresses, setEmailAddresses] = useState<string[]>([]);
  const [newEmailAddress, setNewEmailAddress] = useState("");

  // Fetch current settings from Google Sheets
  const { data: currentSettings, refetch, isLoading } = useQuery({
    queryKey: ["/api/settings"],
    enabled: isAuthenticated,
  });

  const settings = currentSettings as any;

  // Initialize email addresses when settings load
  useEffect(() => {
    if ((currentSettings as any)?.emailSettings?.notificationEmails) {
      setEmailAddresses((currentSettings as any).emailSettings.notificationEmails);
    }
  }, [currentSettings]);

  // Fetch quotes for management
  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/quotes"],
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

  // Bulk delete quotes mutation
  const deleteQuotesMutation = useMutation({
    mutationFn: async (quoteIds: string[]) => {
      const response = await apiRequest("DELETE", "/api/quotes/bulk", { quoteIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      setSelectedQuotes(new Set());
      toast({
        title: "Quotes Deleted",
        description: `Successfully deleted ${data.deletedCount} quote(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete quotes. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Email settings mutation
  const saveEmailSettingsMutation = useMutation({
    mutationFn: async (emailSettings: { fromEmail: string; notificationEmails: string[] }) => {
      const response = await apiRequest("POST", "/api/admin/settings", { emailSettings });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Email Settings Saved",
        description: "Email notification settings updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save email settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddEmail = () => {
    if (newEmailAddress && !emailAddresses.includes(newEmailAddress)) {
      const updatedEmails = [...emailAddresses, newEmailAddress];
      setEmailAddresses(updatedEmails);
      setNewEmailAddress("");
      saveEmailSettingsMutation.mutate({
        fromEmail: settings?.emailSettings?.fromEmail || "quotes@ghvac.com",
        notificationEmails: updatedEmails
      });
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    const updatedEmails = emailAddresses.filter(email => email !== emailToRemove);
    setEmailAddresses(updatedEmails);
    saveEmailSettingsMutation.mutate({
      fromEmail: settings?.emailSettings?.fromEmail || "quotes@ghvac.com",
      notificationEmails: updatedEmails
    });
  };

  const handleSelectQuote = (quoteId: string, checked: boolean) => {
    const newSelected = new Set(selectedQuotes);
    if (checked) {
      newSelected.add(quoteId);
    } else {
      newSelected.delete(quoteId);
    }
    setSelectedQuotes(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuotes(new Set(quotes.map(q => q.id!)));
    } else {
      setSelectedQuotes(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (selectedQuotes.size === 0) return;
    deleteQuotesMutation.mutate(Array.from(selectedQuotes));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "draft": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      default: return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    }
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
                      value={`$${settings?.laborRate || 0}`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C5</p>
                  </div>
                  <div>
                    <Label>Warranty Reserve ($)</Label>
                    <Input
                      value={`$${settings?.warrantyReserve || 0}`}
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
                      value={`${((settings?.commissionPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C6</p>
                  </div>
                  <div>
                    <Label>Financing/Promotion (%)</Label>
                    <Input
                      value={`${((settings?.financingPromotionPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C7</p>
                  </div>
                  <div>
                    <Label>Profit (%)</Label>
                    <Input
                      value={`${((settings?.profitPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C8</p>
                  </div>
                  <div>
                    <Label>Overhead (%)</Label>
                    <Input
                      value={`${((settings?.overheadPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B41</p>
                  </div>
                  <div>
                    <Label>Labor Benefits (%)</Label>
                    <Input
                      value={`${((settings?.laborBenefitsPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B34</p>
                  </div>
                  <div>
                    <Label>Sales Tax (%)</Label>
                    <Input
                      value={`${((settings?.salesTaxPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B38</p>
                  </div>
                  <div>
                    <Label>Material Shrinkage (%)</Label>
                    <Input
                      value={`${((settings?.materialShrinkagePercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B25</p>
                  </div>
                </CardContent>
              </Card>

              {/* Parts Pricing */}
              {settings?.partsPrices && (
                <Card>
                  <CardHeader>
                    <CardTitle>Material Pricing</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Refrigerant Filter Dryer</Label>
                      <Input
                        value={`$${settings?.partsPrices.refrigerantFilterDryer || 0}`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D20</p>
                    </div>
                    <div>
                      <Label>Copper</Label>
                      <Input
                        value={`$${settings?.partsPrices.copper || 0}/ft`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D21</p>
                    </div>
                    <div>
                      <Label>Armaflex Insulation</Label>
                      <Input
                        value={`$${settings?.partsPrices.armaflexInsulation || 0}/ft`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D22</p>
                    </div>
                    <div>
                      <Label>Acid Away</Label>
                      <Input
                        value={`$${settings?.partsPrices.acidAway || 0}`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D23</p>
                    </div>
                    <div>
                      <Label>Refrigerant</Label>
                      <Input
                        value={`$${settings?.partsPrices.refrigerant || 0}/lb`}
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
                    {settings?.warrantyDiscounts && Object.entries(settings?.warrantyDiscounts).map(([year, discount]) => (
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

              {/* Email Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.9a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email Notifications
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Manage email addresses that receive quote notifications
                  </p>
                  {settings?.emailSettings?.developmentMode && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        🧪 <strong>Development Mode</strong> - Using Resend test domains (no verification required)<br/>
                        ✉️ You can add your personal Gmail/email addresses below for testing!
                      </p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Email List */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Current Recipients</Label>
                    {emailAddresses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No email addresses configured</p>
                    ) : (
                      <div className="space-y-2">
                        {emailAddresses.map((email, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                            <span className="text-sm">{email}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveEmail(email)}
                              className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                              data-testid={`button-remove-email-${index}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add New Email */}
                  <div className="space-y-2">
                    <Label htmlFor="new-email" className="text-sm font-medium">Add Email Address</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="new-email"
                        type="email"
                        placeholder="manager@ghvac.com"
                        value={newEmailAddress}
                        onChange={(e) => setNewEmailAddress(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                        data-testid="input-new-email"
                      />
                      <Button
                        onClick={handleAddEmail}
                        disabled={!newEmailAddress || emailAddresses.includes(newEmailAddress) || saveEmailSettingsMutation.isPending}
                        data-testid="button-add-email"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quote Management */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center">
                        <FileText className="h-5 w-5 mr-2" />
                        Quote Management
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        View and delete generated quotes
                      </p>
                    </div>
                    {selectedQuotes.size > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            disabled={deleteQuotesMutation.isPending}
                            data-testid="button-bulk-delete"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete {selectedQuotes.size} Quote{selectedQuotes.size !== 1 ? 's' : ''}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {selectedQuotes.size} selected quote{selectedQuotes.size !== 1 ? 's' : ''}? 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {quotes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No quotes found</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3 pb-3 border-b border-border">
                        <Checkbox
                          checked={selectedQuotes.size === quotes.length && quotes.length > 0}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                        <Label className="text-sm font-medium">
                          Select All ({quotes.length} quote{quotes.length !== 1 ? 's' : ''})
                        </Label>
                      </div>
                      
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {quotes.map((quote) => (
                          <div key={quote.id} className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50">
                            <Checkbox
                              checked={selectedQuotes.has(quote.id!)}
                              onCheckedChange={(checked) => handleSelectQuote(quote.id!, checked as boolean)}
                              data-testid={`checkbox-quote-${quote.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="font-medium text-sm truncate">{quote.customerName}</span>
                                <Badge className={getStatusColor(quote.status || 'draft') + " text-xs"}>
                                  {(quote.status || 'draft').charAt(0).toUpperCase() + (quote.status || 'draft').slice(1)}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{quote.technician}</span>
                                <span>{new Date(quote.createdAt!).toLocaleDateString()}</span>
                                <span className="font-medium text-foreground">${quote.total.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}