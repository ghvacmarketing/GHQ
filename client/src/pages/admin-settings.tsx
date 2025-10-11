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
import { ArrowLeft, RefreshCw, Eye, EyeOff, ExternalLink, Trash2, FileText, FolderKanban, Plus, Edit } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Quote, Category, Process } from "@shared/schema";
import redlogo from "@assets/redlogo.webp";

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const [emailAddresses, setEmailAddresses] = useState<string[]>([]);
  const [newEmailAddress, setNewEmailAddress] = useState("");
  const [showQuotesList, setShowQuotesList] = useState(false);
  const [quotesPage, setQuotesPage] = useState(1);
  const [newTechnicianName, setNewTechnicianName] = useState("");
  const [newTechnicianEmail, setNewTechnicianEmail] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

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

  // Fetch quotes summary for admin dashboard (fast loading)
  const { data: quoteSummary } = useQuery<{
    totalQuotes: number;
    statusCounts: Record<string, number>;
    totalValue: number;
    recentQuotes: Quote[];
  }>({
    queryKey: ["/api/quotes/summary"],
    enabled: isAuthenticated,
  });

  // Fetch full quotes list only when needed (lazy loading)
  const { data: quotesResponse, isLoading: quotesLoading } = useQuery<{
    quotes: Quote[];
    pagination: any;
  }>({
    queryKey: ["/api/quotes", quotesPage],
    queryFn: () => fetch(`/api/quotes?page=${quotesPage}&limit=50`).then(res => res.json()),
    enabled: isAuthenticated && showQuotesList,
  });

  const quotes = quotesResponse?.quotes || [];
  const quotesTotal = quoteSummary?.totalQuotes || 0;

  // Fetch technicians
  const { data: technicians = [] } = useQuery({
    queryKey: ["/api/technicians"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/quotes/summary"] });
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

  // Technician mutations
  const createTechnicianMutation = useMutation({
    mutationFn: async (techData: { name: string; email: string }) => {
      const response = await apiRequest("POST", "/api/technicians", techData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initial-data"] });
      setNewTechnicianName("");
      setNewTechnicianEmail("");
      toast({
        title: "Technician Added",
        description: "New technician added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Add Failed",
        description: "Failed to add technician. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteTechnicianMutation = useMutation({
    mutationFn: async (techId: string) => {
      const response = await apiRequest("DELETE", `/api/technicians/${techId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initial-data"] });
      toast({
        title: "Technician Removed",
        description: "Technician removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to remove technician. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    enabled: isAuthenticated,
  });

  // Fetch processes
  const { data: processes = [] } = useQuery<Process[]>({
    queryKey: ['/api/processes'],
    enabled: isAuthenticated,
  });

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const lastOrder = categories.length > 0 
        ? Math.max(...categories.map(c => parseInt(c.order)))
        : 0;
      const response = await apiRequest('POST', '/api/categories', { name, order: String(lastOrder + 1) });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setNewCategoryName("");
      toast({ title: "Category added successfully" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest('PATCH', `/api/categories/${id}`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setEditingCategory(null);
      toast({ title: "Category updated successfully" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/categories/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      toast({ title: "Category deleted successfully" });
    },
  });

  // Process mutation
  const deleteProcessMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/processes/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processes'] });
      toast({ title: "Process deleted successfully" });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete process. Please try again.",
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

  const handleAddTechnician = () => {
    if (newTechnicianName && newTechnicianEmail) {
      createTechnicianMutation.mutate({
        name: newTechnicianName,
        email: newTechnicianEmail
      });
    }
  };

  const handleRemoveTechnician = (techId: string) => {
    deleteTechnicianMutation.mutate(techId);
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
      setSelectedQuotes(new Set(quotes.map((q: Quote) => q.id!)));
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
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <h1 className="font-semibold text-foreground text-sm sm:text-base truncate">Settings Dashboard</h1>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            data-testid="button-refresh-settings"
            className="pl-[8px] pr-[8px]"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? "Refreshing..." : "Refresh Data"}
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-md md:max-w-3xl lg:max-w-6xl">
        <div className="space-y-6">
          {/* Google Sheets Notice */}
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardContent className="p-6 pt-[5px] pb-[5px] pl-[10px] pr-[10px]">
              <div className="flex items-start space-x-3">
                <ExternalLink className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-100">
                    Settings Managed via Google Sheets
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-200 mt-1">Click "Refresh Data" above if recent changes aren't live.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Settings Display */}
          {currentSettings && settings && (
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

              {/* Technician Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Technician Management
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Add or remove technicians from the system
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Technician List */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Current Technicians</Label>
                    {(technicians as any[]).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No technicians configured</p>
                    ) : (
                      <div className="space-y-2">
                        {(technicians as any[]).map((tech: any, index: number) => (
                          <div key={tech.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                            <div className="flex-1">
                              <span className="text-sm font-medium">{tech.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">({tech.email})</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveTechnician(tech.id)}
                              className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                              data-testid={`button-remove-technician-${index}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add New Technician */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Add Technician</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="text"
                        placeholder="Name"
                        value={newTechnicianName}
                        onChange={(e) => setNewTechnicianName(e.target.value)}
                        className="flex-1"
                        data-testid="input-technician-name"
                      />
                      <Input
                        type="email"
                        placeholder="Email"
                        value={newTechnicianEmail}
                        onChange={(e) => setNewTechnicianEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddTechnician()}
                        className="flex-1"
                        data-testid="input-technician-email"
                      />
                      <Button
                        onClick={handleAddTechnician}
                        disabled={!newTechnicianName || !newTechnicianEmail || createTechnicianMutation.isPending}
                        data-testid="button-add-technician"
                        className="sm:w-auto w-full"
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="flex items-center">
                        <FileText className="h-5 w-5 mr-2 flex-shrink-0" />
                        Quote Management
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        View and delete generated quotes
                      </p>
                    </div>
                    {selectedQuotes.size > 0 && (
                      <div className="flex-shrink-0">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              disabled={deleteQuotesMutation.isPending}
                              data-testid="button-bulk-delete"
                              className="w-full sm:w-auto"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              <span className="hidden sm:inline">Delete {selectedQuotes.size} Quote{selectedQuotes.size !== 1 ? 's' : ''}</span>
                              <span className="sm:hidden">Delete ({selectedQuotes.size})</span>
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
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!showQuotesList ? (
                    // Show summary view (fast loading)
                    (<div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">{quoteSummary?.totalQuotes || 0}</div>
                          <div className="text-sm text-muted-foreground">Total Quotes</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">{quoteSummary?.statusCounts?.pending || 0}</div>
                          <div className="text-sm text-muted-foreground">Pending</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">{quoteSummary?.statusCounts?.approved || 0}</div>
                          <div className="text-sm text-muted-foreground">Approved</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">${quoteSummary?.totalValue ? Math.round(quoteSummary.totalValue).toLocaleString() : 0}</div>
                          <div className="text-sm text-muted-foreground">Total Value</div>
                        </div>
                      </div>
                      <div className="flex justify-center pt-2">
                        <Button 
                          onClick={() => setShowQuotesList(true)}
                          variant="outline"
                          className="w-full sm:w-auto"
                          data-testid="button-load-quotes"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Load Full Quotes List ({quoteSummary?.totalQuotes || 0})
                        </Button>
                      </div>
                    </div>)
                  ) : quotesLoading ? (
                    // Loading state
                    (<div className="text-center py-8 text-muted-foreground">
                      <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin" />
                      <p>Loading quotes...</p>
                    </div>)
                  ) : quotes.length === 0 ? (
                    // No quotes found
                    (<div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No quotes found</p>
                      <Button 
                        onClick={() => setShowQuotesList(false)}
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                      >
                        Back to Summary
                      </Button>
                    </div>)
                  ) : (
                    // Full quotes list
                    (<div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Button 
                          onClick={() => setShowQuotesList(false)}
                          variant="ghost"
                          size="sm"
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back to Summary
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Showing {quotes.length} of {quotesTotal} quotes
                        </span>
                      </div>
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
                        {quotes.map((quote: Quote) => (
                          <div key={quote.id} className="flex items-start sm:items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50">
                            <Checkbox
                              checked={selectedQuotes.has(quote.id!)}
                              onCheckedChange={(checked) => handleSelectQuote(quote.id!, checked as boolean)}
                              data-testid={`checkbox-quote-${quote.id}`}
                              className="mt-0.5 sm:mt-0 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-1">
                                <span className="font-medium text-sm truncate">{quote.customerName}</span>
                                <Badge className={getStatusColor(quote.status || 'draft') + " text-xs w-fit mt-1 sm:mt-0"}>
                                  {(quote.status || 'draft').charAt(0).toUpperCase() + (quote.status || 'draft').slice(1)}
                                </Badge>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground space-y-1 sm:space-y-0">
                                <span className="truncate">{quote.technician}</span>
                                <span className="text-xs">{new Date(quote.createdAt!).toLocaleDateString()}</span>
                                <span className="font-medium text-foreground">${parseFloat(quote.total).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>)
                  )}
                </CardContent>
              </Card>

              {/* Process Categories Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FolderKanban className="mr-3 h-5 w-5" />
                    Process Categories
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Manage categories for organizing your processes and systems
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add New Category */}
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Enter new category name"
                      onKeyPress={(e) => e.key === 'Enter' && newCategoryName && createCategoryMutation.mutate(newCategoryName)}
                      data-testid="input-new-category"
                    />
                    <Button 
                      onClick={() => newCategoryName && createCategoryMutation.mutate(newCategoryName)}
                      disabled={!newCategoryName || createCategoryMutation.isPending}
                      data-testid="button-add-category"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>

                  {/* Categories List */}
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div 
                        key={category.id} 
                        className="flex items-center justify-between p-3 border rounded-lg"
                        data-testid={`category-item-${category.id}`}
                      >
                        {editingCategory?.id === category.id ? (
                          <div className="flex-1 flex gap-2">
                            <Input
                              value={editingCategory.name}
                              onChange={(e) => setEditingCategory(prev => prev ? { ...prev, name: e.target.value } : null)}
                              data-testid={`input-edit-category-${category.id}`}
                            />
                            <Button 
                              size="sm" 
                              onClick={() => updateCategoryMutation.mutate({ id: category.id, name: editingCategory.name })}
                              disabled={!editingCategory.name}
                              data-testid={`button-save-category-${category.id}`}
                            >
                              Save
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setEditingCategory(null)}
                              data-testid={`button-cancel-category-${category.id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 font-medium" data-testid={`text-category-${category.id}`}>
                              {category.name}
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingCategory(category)}
                                data-testid={`button-edit-category-${category.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteCategoryMutation.mutate(category.id)}
                                disabled={deleteCategoryMutation.isPending}
                                data-testid={`button-delete-category-${category.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Process Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="mr-3 h-5 w-5" />
                    Processes Management
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    View and delete saved processes ({processes.length} total)
                  </p>
                </CardHeader>
                <CardContent>
                  {processes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No processes saved yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {processes.map((process) => (
                        <div 
                          key={process.id} 
                          className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50"
                          data-testid={`process-item-${process.id}`}
                        >
                          <div className="flex-1 min-w-0 mr-3">
                            <div className="font-medium truncate" data-testid={`process-name-${process.id}`}>
                              {process.name}
                            </div>
                            <div className="text-sm text-muted-foreground line-clamp-1">
                              {process.description}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {process.category}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {process.steps?.length || 0} steps
                              </span>
                            </div>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-delete-process-${process.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Process</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{process.name}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteProcessMutation.mutate(process.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
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