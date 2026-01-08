import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft, 
  BookOpen, 
  Check, 
  X, 
  RefreshCw, 
  Link2, 
  Unlink, 
  Users, 
  FileText, 
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Plus,
  Pencil,
  Trash2
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, QuickbooksConnection, QuickbooksAccount, QuickbooksItem } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Wallet, Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORY_TYPES = ["Service", "Install", "Maintenance", "Discount"] as const;
const PROPERTY_TYPES = ["Residential", "Commercial"] as const;
const ITEM_TYPES = ["Service", "NonInventory"] as const;

type CategoryType = typeof CATEGORY_TYPES[number];
type PropertyType = typeof PROPERTY_TYPES[number];
type ItemType = typeof ITEM_TYPES[number];

interface ConnectionStatus {
  connected: boolean;
  connection?: QuickbooksConnection;
  syncStats?: {
    customers: number;
    invoices: number;
    payments: number;
    totalCustomers: number;
    totalInvoices: number;
  };
}

interface AccountFormData {
  name: string;
  parentAccountId: string;
  categoryType: CategoryType;
  propertyType: PropertyType;
}

interface ItemFormData {
  name: string;
  description: string;
  categoryType: CategoryType;
  propertyType: PropertyType;
  incomeAccountId: string;
  itemType: ItemType;
}

export default function CrmSettingsQuickBooks() {
  usePageTitle("QuickBooks Integration");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  const [accountFormData, setAccountFormData] = useState<AccountFormData>({
    name: "",
    parentAccountId: "",
    categoryType: "Service",
    propertyType: "Residential",
  });
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [itemFormData, setItemFormData] = useState<ItemFormData>({
    name: "",
    description: "",
    categoryType: "Service",
    propertyType: "Residential",
    incomeAccountId: "",
    itemType: "Service",
  });
  
  const searchParams = new URLSearchParams(window.location.search);
  const successParam = searchParams.get("success");
  const errorParam = searchParams.get("error");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<ConnectionStatus>({
    queryKey: ["/api/quickbooks/status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser,
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery<QuickbooksAccount[]>({
    queryKey: ["/api/quickbooks/accounts"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser && status?.connected,
  });

  const { data: parentAccounts } = useQuery<QuickbooksAccount[]>({
    queryKey: ["/api/quickbooks/accounts/parents"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser && status?.connected,
  });

  const { data: items, isLoading: itemsLoading } = useQuery<QuickbooksItem[]>({
    queryKey: ["/api/quickbooks/items"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser && status?.connected,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/quickbooks/connect?environment=${environment}`);
      const data = await response.json();
      return data.authUrl;
    },
    onSuccess: (authUrl: string) => {
      window.location.href = authUrl;
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to initiate QuickBooks connection",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/quickbooks/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from QuickBooks",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect",
        variant: "destructive",
      });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/sync-all");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      if (result.skipped) {
        toast({
          title: "Sync In Progress",
          description: "A sync is already running. Please wait for it to complete.",
        });
      } else {
        toast({
          title: "Sync Complete",
          description: `Synced ${result.customers?.synced || 0} customers, ${result.invoices?.synced || 0} invoices, ${result.payments?.synced || 0} payments`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync all records",
        variant: "destructive",
      });
    },
  });

  const syncCustomersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/sync/customers?background=true");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/sync-logs"] });
      if (result.background) {
        toast({
          title: "Sync Started",
          description: "Customer sync is running in the background. Refresh status to see progress.",
        });
      } else {
        toast({
          title: result.success ? "Sync Complete" : "Sync Completed with Errors",
          description: `${result.succeeded} customers synced, ${result.failed} failed`,
          variant: result.success ? "default" : "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync customers",
        variant: "destructive",
      });
    },
  });

  const syncInvoicesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/sync/invoices?background=true");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/sync-logs"] });
      if (result.background) {
        toast({
          title: "Sync Started",
          description: "Invoice sync is running in the background. Refresh status to see progress.",
        });
      } else {
        const paymentInfo = result.paymentsSynced ? `, ${result.paymentsSynced} payments` : "";
        toast({
          title: result.success ? "Sync Complete" : "Sync Completed with Errors",
          description: `${result.succeeded} invoices synced${paymentInfo}, ${result.failed} failed`,
          variant: result.success ? "default" : "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync invoices",
        variant: "destructive",
      });
    },
  });

  const pullAccountsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/accounts/pull");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/accounts/parents"] });
      toast({
        title: "Accounts Pulled",
        description: result.message || "Accounts pulled from QuickBooks",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Pull Failed",
        description: error.message || "Failed to pull accounts from QuickBooks",
        variant: "destructive",
      });
    },
  });

  const createSubAccountMutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
      const response = await apiRequest("POST", "/api/quickbooks/accounts/sub-account", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/accounts/parents"] });
      setShowAddAccountDialog(false);
      setAccountFormData({ name: "", parentAccountId: "", categoryType: "Service", propertyType: "Residential" });
      toast({
        title: "Sub-Account Created",
        description: "New sub-account created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Create Failed",
        description: error.message || "Failed to create sub-account",
        variant: "destructive",
      });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { categoryType?: string; propertyType?: string } }) => {
      const response = await apiRequest("PATCH", `/api/quickbooks/accounts/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/accounts"] });
      toast({
        title: "Account Updated",
        description: "Account mapping updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update account",
        variant: "destructive",
      });
    },
  });

  const pullItemsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/items/pull");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/items"] });
      toast({
        title: "Items Pulled",
        description: result.message || "Items pulled from QuickBooks",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Pull Failed",
        description: error.message || "Failed to pull items from QuickBooks",
        variant: "destructive",
      });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: ItemFormData) => {
      const response = await apiRequest("POST", "/api/quickbooks/items", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/items"] });
      setShowAddItemDialog(false);
      setItemFormData({
        name: "",
        description: "",
        categoryType: "Service",
        propertyType: "Residential",
        incomeAccountId: "",
        itemType: "Service",
      });
      toast({
        title: "Item Created",
        description: "New item created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Create Failed",
        description: error.message || "Failed to create item",
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { categoryType?: string; propertyType?: string; incomeAccountId?: string; isActive?: boolean } }) => {
      const response = await apiRequest("PATCH", `/api/quickbooks/items/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/items"] });
      toast({
        title: "Item Updated",
        description: "Item updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update item",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    if (successParam === "connected") {
      toast({
        title: "Connected",
        description: "Successfully connected to QuickBooks!",
      });
      window.history.replaceState({}, "", window.location.pathname);
      refetchStatus();
    } else if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_denied: "You denied the connection request",
        missing_params: "Missing required parameters from QuickBooks",
        invalid_state: "Invalid security state - please try again",
        token_exchange_failed: "Failed to exchange authorization code",
      };
      toast({
        title: "Connection Failed",
        description: errorMessages[errorParam] || "An error occurred during connection",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [successParam, errorParam, toast, refetchStatus]);

  if (authLoading || statusLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";

  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 max-w-4xl mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only administrators can manage QuickBooks integration.
            </AlertDescription>
          </Alert>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/crm/settings" className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">QuickBooks Integration</h1>
            <p className="text-slate-500">Connect and sync with QuickBooks Online</p>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-8 w-8 text-green-600" />
                  <div>
                    <CardTitle>Connection Status</CardTitle>
                    <CardDescription>
                      {status?.connected 
                        ? `Connected to QuickBooks ${status.connection?.environment === "production" ? "Production" : "Sandbox"}`
                        : "Not connected to QuickBooks"
                      }
                    </CardDescription>
                  </div>
                </div>
                <Badge 
                  variant={status?.connected ? "default" : "secondary"}
                  className={status?.connected ? "bg-green-100 text-green-800" : ""}
                >
                  {status?.connected ? (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </>
                  ) : (
                    <>
                      <X className="h-3 w-3 mr-1" />
                      Disconnected
                    </>
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {status?.connected ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                      <div className="text-2xl font-bold">
                        {status.syncStats?.customers || 0}
                        <span className="text-base font-normal text-slate-400"> / {status.syncStats?.totalCustomers || 0}</span>
                      </div>
                      <div className="text-sm text-slate-500">Customers Synced</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <FileText className="h-6 w-6 mx-auto mb-2 text-amber-600" />
                      <div className="text-2xl font-bold">
                        {status.syncStats?.invoices || 0}
                        <span className="text-base font-normal text-slate-400"> / {status.syncStats?.totalInvoices || 0}</span>
                      </div>
                      <div className="text-sm text-slate-500">Invoices Synced</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <CreditCard className="h-6 w-6 mx-auto mb-2 text-green-600" />
                      <div className="text-2xl font-bold">{status.syncStats?.payments || 0}</div>
                      <div className="text-sm text-slate-500">Payments Synced</div>
                    </div>
                  </div>
                  
                  {status.connection && (
                    <div className="text-sm text-slate-500">
                      <p>Company ID: {status.connection.realmId}</p>
                      {status.connection.lastSyncAt && (
                        <p>Last sync: {new Date(status.connection.lastSyncAt).toLocaleString()}</p>
                      )}
                    </div>
                  )}

                  <Separator />

                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">
                      Automatic sync is active. Customers and invoices sync automatically when created or updated. Background sync runs every 15 minutes to catch any unsynced records.
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-wrap gap-3">
                    <Button 
                      onClick={() => syncAllMutation.mutate()}
                      disabled={syncAllMutation.isPending}
                      data-testid="btn-sync-all"
                    >
                      {syncAllMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sync All Now
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      data-testid="btn-disconnect"
                    >
                      {disconnectMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Unlink className="h-4 w-4 mr-2" />
                      )}
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="environment"
                        checked={environment === "production"}
                        onCheckedChange={(checked) => setEnvironment(checked ? "production" : "sandbox")}
                        data-testid="switch-environment"
                      />
                      <Label htmlFor="environment">
                        {environment === "production" ? "Production" : "Sandbox"} Mode
                      </Label>
                    </div>
                  </div>
                  
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {environment === "sandbox" 
                        ? "Sandbox mode is for testing. No real data will be affected."
                        : "Production mode will sync with your real QuickBooks data."
                      }
                    </AlertDescription>
                  </Alert>

                  <Button 
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="btn-connect-quickbooks"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    Connect to QuickBooks
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {status?.connected && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Wallet className="h-6 w-6 text-green-600" />
                    <div>
                      <CardTitle>Chart of Accounts</CardTitle>
                      <CardDescription>Manage QuickBooks income accounts and sub-accounts for invoice line items</CardDescription>
                    </div>
                  </div>
                  <Button onClick={() => setShowAddAccountDialog(true)} data-testid="btn-add-sub-account">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Sub-Account
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {accountsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : accounts && accounts.length > 0 ? (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Account Type</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Property Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accounts.filter(a => a.isActive).map((account) => (
                          <TableRow key={account.id} data-testid={`account-row-${account.id}`}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {account.fullyQualifiedName || account.name}
                                {account.isParent && (
                                  <Badge variant="secondary" className="text-xs">
                                    Parent
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{account.accountType}</TableCell>
                            <TableCell>
                              <Select
                                value={account.categoryType || ""}
                                onValueChange={(value) => {
                                  updateAccountMutation.mutate({
                                    id: account.id,
                                    data: { categoryType: value || undefined },
                                  });
                                }}
                              >
                                <SelectTrigger className="w-32" data-testid={`select-category-type-${account.id}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">None</SelectItem>
                                  {CATEGORY_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                      {type}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {!account.isParent ? (
                                <Select
                                  value={account.propertyType || ""}
                                  onValueChange={(value) => {
                                    updateAccountMutation.mutate({
                                      id: account.id,
                                      data: { propertyType: value || undefined },
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-32" data-testid={`select-property-type-${account.id}`}>
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">None</SelectItem>
                                    {PROPERTY_TYPES.map((type) => (
                                      <SelectItem key={type} value={type}>
                                        {type}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    <Separator />
                    
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => pullAccountsMutation.mutate()}
                        disabled={pullAccountsMutation.isPending}
                        data-testid="btn-pull-accounts"
                      >
                        {pullAccountsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Pull from QuickBooks
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-500 mb-4">No accounts configured yet</p>
                    <div className="flex justify-center gap-3">
                      <Button
                        variant="outline"
                        onClick={() => pullAccountsMutation.mutate()}
                        disabled={pullAccountsMutation.isPending}
                        data-testid="btn-pull-accounts-empty"
                      >
                        {pullAccountsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Pull from QuickBooks
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {status?.connected && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="h-6 w-6 text-purple-600" />
                    <div>
                      <CardTitle>Products & Services</CardTitle>
                      <CardDescription>Manage QuickBooks items that link to income accounts for P&L routing</CardDescription>
                    </div>
                  </div>
                  <Button onClick={() => setShowAddItemDialog(true)} data-testid="btn-add-item">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {itemsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : items && items.length > 0 ? (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Category Type</TableHead>
                          <TableHead>Property Type</TableHead>
                          <TableHead>Income Account</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.id} data-testid={`item-row-${item.id}`}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-slate-600 max-w-48 truncate">{item.description || "-"}</TableCell>
                            <TableCell>
                              <Select
                                value={item.categoryType || ""}
                                onValueChange={(value) => {
                                  updateItemMutation.mutate({
                                    id: item.id,
                                    data: { categoryType: value || undefined },
                                  });
                                }}
                              >
                                <SelectTrigger className="w-32" data-testid={`select-item-category-${item.id}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORY_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                      {type}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={item.propertyType || ""}
                                onValueChange={(value) => {
                                  updateItemMutation.mutate({
                                    id: item.id,
                                    data: { propertyType: value || undefined },
                                  });
                                }}
                              >
                                <SelectTrigger className="w-32" data-testid={`select-item-property-${item.id}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {PROPERTY_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                      {type}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={item.incomeAccountId || ""}
                                onValueChange={(value) => {
                                  updateItemMutation.mutate({
                                    id: item.id,
                                    data: { incomeAccountId: value || undefined },
                                  });
                                }}
                              >
                                <SelectTrigger className="w-40" data-testid={`select-item-account-${item.id}`}>
                                  <SelectValue placeholder="Select account...">
                                    {accounts?.find(a => a.id === item.incomeAccountId)?.name || "Select account..."}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">None</SelectItem>
                                  {accounts?.filter(a => !a.isParent).map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                      {account.fullyQualifiedName || account.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {item.isActive ? (
                                <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
                              ) : (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    <Separator />
                    
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => pullItemsMutation.mutate()}
                        disabled={pullItemsMutation.isPending}
                        data-testid="btn-pull-items"
                      >
                        {pullItemsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Pull from QuickBooks
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-500 mb-4">No items configured yet</p>
                    <div className="flex justify-center gap-3">
                      <Button onClick={() => setShowAddItemDialog(true)} data-testid="btn-add-first-item">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Item
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => pullItemsMutation.mutate()}
                        disabled={pullItemsMutation.isPending}
                        data-testid="btn-pull-items-empty"
                      >
                        {pullItemsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Pull from QuickBooks
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p><strong>Customer Sync:</strong> CRM customers are automatically synced to QuickBooks when you click "Sync All Customers" or when syncing individual customers.</p>
              <p><strong>Invoice Sync:</strong> When you send an invoice from the CRM, it can be synced to QuickBooks. Use the sync button on individual invoices.</p>
              <p><strong>Payment Sync:</strong> When an invoice is marked as paid in the CRM, the payment is recorded in QuickBooks.</p>
              <p><strong>Chart of Accounts:</strong> Pull your income accounts from QuickBooks, then create sub-accounts (e.g., Service:Residential, Install:Commercial) to route revenue for accurate P&L tracking.</p>
              <p><strong>Products & Services:</strong> Create items that link to income sub-accounts. When invoices sync, revenue is routed to the correct account.</p>
              <p className="text-amber-600"><strong>Note:</strong> For testing, use Sandbox mode first. Switch to Production when you're ready to sync real data.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showAddAccountDialog} onOpenChange={setShowAddAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sub-Account</DialogTitle>
            <DialogDescription>
              Create a new sub-account under a parent account for detailed income tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                value={accountFormData.name}
                onChange={(e) => setAccountFormData({ ...accountFormData, name: e.target.value })}
                placeholder="e.g., Residential"
                data-testid="input-account-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-account">Parent Account *</Label>
              {(!parentAccounts || parentAccounts.length === 0) ? (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    No parent accounts found. Please click "Pull from QuickBooks" in the Chart of Accounts section first to import your income accounts.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={accountFormData.parentAccountId}
                  onValueChange={(value) => setAccountFormData({ ...accountFormData, parentAccountId: value })}
                >
                  <SelectTrigger data-testid="select-parent-account">
                    <SelectValue placeholder="Select parent account" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-category-type">Category Type</Label>
              <Select
                value={accountFormData.categoryType}
                onValueChange={(value: CategoryType) => setAccountFormData({ ...accountFormData, categoryType: value })}
              >
                <SelectTrigger data-testid="select-account-category-type">
                  <SelectValue placeholder="Select category type" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-property-type">Property Type</Label>
              <Select
                value={accountFormData.propertyType}
                onValueChange={(value: PropertyType) => setAccountFormData({ ...accountFormData, propertyType: value })}
              >
                <SelectTrigger data-testid="select-account-property-type">
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAccountDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!accountFormData.name.trim()) {
                  toast({
                    title: "Validation Error",
                    description: "Name is required",
                    variant: "destructive",
                  });
                  return;
                }
                if (!accountFormData.parentAccountId) {
                  toast({
                    title: "Validation Error",
                    description: "Parent account is required",
                    variant: "destructive",
                  });
                  return;
                }
                createSubAccountMutation.mutate(accountFormData);
              }}
              disabled={createSubAccountMutation.isPending}
              data-testid="btn-submit-add-account"
            >
              {createSubAccountMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create Sub-Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Item</DialogTitle>
            <DialogDescription>
              Create a new QuickBooks item for invoice line items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="item-name">Name *</Label>
              <Input
                id="item-name"
                value={itemFormData.name}
                onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                placeholder="e.g., HVAC Service - Residential"
                data-testid="input-item-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-description">Description</Label>
              <Input
                id="item-description"
                value={itemFormData.description}
                onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                placeholder="Item description for invoice lines"
                data-testid="input-item-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-category-type">Category Type *</Label>
              <Select
                value={itemFormData.categoryType}
                onValueChange={(value: CategoryType) => setItemFormData({ ...itemFormData, categoryType: value })}
              >
                <SelectTrigger data-testid="select-item-category-type">
                  <SelectValue placeholder="Select category type" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-property-type">Property Type *</Label>
              <Select
                value={itemFormData.propertyType}
                onValueChange={(value: PropertyType) => setItemFormData({ ...itemFormData, propertyType: value })}
              >
                <SelectTrigger data-testid="select-item-property-type">
                  <SelectValue placeholder="Select property type" />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-income-account">Income Account</Label>
              <Select
                value={itemFormData.incomeAccountId}
                onValueChange={(value) => setItemFormData({ ...itemFormData, incomeAccountId: value })}
              >
                <SelectTrigger data-testid="select-item-income-account">
                  <SelectValue placeholder="Select income account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.filter(a => !a.isParent).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.fullyQualifiedName || account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-type">Item Type</Label>
              <Select
                value={itemFormData.itemType}
                onValueChange={(value: ItemType) => setItemFormData({ ...itemFormData, itemType: value })}
              >
                <SelectTrigger data-testid="select-item-type">
                  <SelectValue placeholder="Select item type" />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!itemFormData.name.trim()) {
                  toast({
                    title: "Validation Error",
                    description: "Name is required",
                    variant: "destructive",
                  });
                  return;
                }
                if (!itemFormData.categoryType) {
                  toast({
                    title: "Validation Error",
                    description: "Category type is required",
                    variant: "destructive",
                  });
                  return;
                }
                if (!itemFormData.propertyType) {
                  toast({
                    title: "Validation Error",
                    description: "Property type is required",
                    variant: "destructive",
                  });
                  return;
                }
                createItemMutation.mutate(itemFormData);
              }}
              disabled={createItemMutation.isPending}
              data-testid="btn-submit-add-item"
            >
              {createItemMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
