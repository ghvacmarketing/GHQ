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
import type { CrmUser, QuickbooksConnection, QuickbooksAccount } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Download, Upload, Wallet, Zap } from "lucide-react";
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

type CategoryType = typeof CATEGORY_TYPES[number];
type PropertyType = typeof PROPERTY_TYPES[number];

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

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/quickbooks/connect?environment=${environment}`);
      const data = await response.json();
      return data.authUrl;
    },
    onSuccess: (authUrl: string) => {
      // Open in new tab to avoid X-Frame-Options issues when embedded in Replit webview
      const newWindow = window.open(authUrl, '_blank');
      if (!newWindow) {
        // Fallback if popup blocked
        window.location.href = authUrl;
      }
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

  const provisionItemsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/items/provision");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/accounts"] });
      if (result.provisioned > 0) {
        toast({
          title: "Items Provisioned",
          description: `Created ${result.provisioned} QuickBooks items for your sub-accounts. P&L routing is now active.`,
        });
      } else if (result.skipped > 0) {
        toast({
          title: "Already Set Up",
          description: `All ${result.skipped} mapped sub-accounts already have linked items.`,
        });
      } else {
        toast({
          title: "Nothing to Provision",
          description: "No mapped sub-accounts found. Set category and property type on sub-accounts first.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Provision Failed",
        description: error.message || "Failed to provision items",
        variant: "destructive",
      });
    },
  });

  const pushItemsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/items/push");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/items"] });
      if (result.updated > 0) {
        toast({
          title: "Items Updated",
          description: `Updated ${result.updated} items in QuickBooks with correct income account mappings.`,
        });
      } else if (result.skipped > 0) {
        toast({
          title: "Already Correct",
          description: `All ${result.skipped} items already point to the correct income accounts.`,
        });
      } else {
        toast({
          title: "Nothing to Update",
          description: "No items found to update.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Push Failed",
        description: error.message || "Failed to push items to QuickBooks",
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
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Wallet className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <CardTitle>Chart of Accounts</CardTitle>
                      <CardDescription>Map income accounts for P&L routing</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pullAccountsMutation.mutate()}
                      disabled={pullAccountsMutation.isPending}
                      data-testid="btn-pull-accounts"
                    >
                      {pullAccountsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Pull Accounts
                    </Button>
                    <Button size="sm" onClick={() => setShowAddAccountDialog(true)} data-testid="btn-add-sub-account">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Sub-Account
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {accountsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : accounts && accounts.length > 0 ? (
                  <div className="space-y-4">
                    {(() => {
                      const activeAccounts = accounts.filter(a => a.isActive);
                      const parentAccounts = activeAccounts.filter(a => a.isParent);
                      const subAccounts = activeAccounts.filter(a => !a.isParent);
                      const mappedSubAccounts = subAccounts.filter(a => a.categoryType && a.propertyType);
                      
                      return (
                        <>
                          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-slate-900">{parentAccounts.length}</div>
                              <div className="text-xs text-slate-500">Parent Accounts</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-slate-900">{subAccounts.length}</div>
                              <div className="text-xs text-slate-500">Sub-Accounts</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">{mappedSubAccounts.length}</div>
                              <div className="text-xs text-slate-500">Fully Mapped</div>
                            </div>
                          </div>
                          
                          {mappedSubAccounts.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                <div>
                                  <p className="font-medium text-amber-900">Activate P&L Routing</p>
                                  <p className="text-sm text-amber-700">Create QuickBooks Items to route invoice income to your sub-accounts</p>
                                </div>
                                <Button
                                  onClick={() => provisionItemsMutation.mutate()}
                                  disabled={provisionItemsMutation.isPending}
                                  className="bg-amber-600 hover:bg-amber-700"
                                  data-testid="btn-provision-items"
                                >
                                  {provisionItemsMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Zap className="h-4 w-4 mr-2" />
                                  )}
                                  Provision Items
                                </Button>
                              </div>
                              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div>
                                  <p className="font-medium text-blue-900">Fix P&L Routing</p>
                                  <p className="text-sm text-blue-700">Update existing Items in QuickBooks to point to the correct sub-accounts</p>
                                </div>
                                <Button
                                  onClick={() => pushItemsMutation.mutate()}
                                  disabled={pushItemsMutation.isPending}
                                  className="bg-blue-600 hover:bg-blue-700"
                                  data-testid="btn-push-items"
                                >
                                  {pushItemsMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4 mr-2" />
                                  )}
                                  Push to QuickBooks
                                </Button>
                              </div>
                            </div>
                          )}
                          
                          <Accordion type="multiple" className="w-full" defaultValue={parentAccounts.map(p => p.id)}>
                            {parentAccounts.map((parent) => {
                              const children = subAccounts.filter(
                                s => s.quickbooksParentAccountId === parent.quickbooksAccountId || 
                                     s.parentAccountId === parent.id ||
                                     (s.fullyQualifiedName && s.fullyQualifiedName.startsWith(parent.name + ":"))
                              );
                              const mappedChildren = children.filter(c => c.categoryType && c.propertyType);
                              
                              return (
                                <AccordionItem key={parent.id} value={parent.id} className="border rounded-lg px-4 mb-2">
                                  <AccordionTrigger className="hover:no-underline py-3">
                                    <div className="flex items-center justify-between w-full pr-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span className="font-semibold text-slate-900">{parent.name}</span>
                                        <Badge variant="outline" className="text-xs">
                                          {children.length} sub-account{children.length !== 1 ? 's' : ''}
                                        </Badge>
                                      </div>
                                      {children.length > 0 && (
                                        <Badge 
                                          variant={mappedChildren.length === children.length ? "default" : "secondary"}
                                          className={`text-xs ${mappedChildren.length === children.length ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}`}
                                        >
                                          {mappedChildren.length}/{children.length} mapped
                                        </Badge>
                                      )}
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="pb-4">
                                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100 mb-3"
                                      data-testid={`account-row-${parent.id}`}>
                                      <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span className="font-medium text-slate-700">{parent.name}</span>
                                        <Badge variant="outline" className="text-xs bg-white">Parent Account</Badge>
                                      </div>
                                      <Select
                                        value={parent.categoryType || "none"}
                                        onValueChange={(value) => {
                                          updateAccountMutation.mutate({
                                            id: parent.id,
                                            data: { categoryType: value === "none" ? undefined : value },
                                          });
                                        }}
                                      >
                                        <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-category-type-${parent.id}`}>
                                          <SelectValue placeholder="Category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">None</SelectItem>
                                          {CATEGORY_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {children.length > 0 ? (
                                      <div className="space-y-2">
                                        {children.map((child) => (
                                          <div 
                                            key={child.id} 
                                            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
                                            data-testid={`account-row-${child.id}`}
                                          >
                                            <div className="flex items-center gap-3">
                                              <div className={`w-1.5 h-1.5 rounded-full ${child.categoryType && child.propertyType ? 'bg-green-500' : 'bg-amber-400'}`}></div>
                                              <span className="font-medium text-slate-700">
                                                {child.fullyQualifiedName?.replace(parent.name + ":", "") || child.name}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <Select
                                                value={child.categoryType || "none"}
                                                onValueChange={(value) => {
                                                  updateAccountMutation.mutate({
                                                    id: child.id,
                                                    data: { categoryType: value === "none" ? undefined : value },
                                                  });
                                                }}
                                              >
                                                <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-category-type-${child.id}`}>
                                                  <SelectValue placeholder="Category" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="none">None</SelectItem>
                                                  {CATEGORY_TYPES.map((type) => (
                                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              <Select
                                                value={child.propertyType || "none"}
                                                onValueChange={(value) => {
                                                  updateAccountMutation.mutate({
                                                    id: child.id,
                                                    data: { propertyType: value === "none" ? undefined : value },
                                                  });
                                                }}
                                              >
                                                <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-property-type-${child.id}`}>
                                                  <SelectValue placeholder="Property" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="none">None</SelectItem>
                                                  {PROPERTY_TYPES.map((type) => (
                                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-slate-500 mt-2 pl-5">
                                        No sub-accounts yet. Click "Create Sub-Account" to add one.
                                      </p>
                                    )}
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>
                          
                          {subAccounts.filter(s => {
                            const hasParent = parentAccounts.some(p => 
                              s.quickbooksParentAccountId === p.quickbooksAccountId || 
                              s.parentAccountId === p.id ||
                              (s.fullyQualifiedName && s.fullyQualifiedName.startsWith(p.name + ":"))
                            );
                            return !hasParent;
                          }).length > 0 && (
                            <div className="border rounded-lg p-4">
                              <h4 className="font-semibold text-slate-900 mb-3">Other Accounts</h4>
                              <div className="space-y-2">
                                {subAccounts.filter(s => {
                                  const hasParent = parentAccounts.some(p => 
                                    s.quickbooksParentAccountId === p.quickbooksAccountId || 
                                    s.parentAccountId === p.id ||
                                    (s.fullyQualifiedName && s.fullyQualifiedName.startsWith(p.name + ":"))
                                  );
                                  return !hasParent;
                                }).map((account) => (
                                  <div 
                                    key={account.id}
                                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                                    data-testid={`account-row-${account.id}`}
                                  >
                                    <span className="font-medium text-slate-700">{account.name}</span>
                                    <div className="flex items-center gap-3">
                                      <Select
                                        value={account.categoryType || "none"}
                                        onValueChange={(value) => {
                                          updateAccountMutation.mutate({
                                            id: account.id,
                                            data: { categoryType: value === "none" ? undefined : value },
                                          });
                                        }}
                                      >
                                        <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-category-type-${account.id}`}>
                                          <SelectValue placeholder="Category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">None</SelectItem>
                                          {CATEGORY_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Select
                                        value={account.propertyType || "none"}
                                        onValueChange={(value) => {
                                          updateAccountMutation.mutate({
                                            id: account.id,
                                            data: { propertyType: value === "none" ? undefined : value },
                                          });
                                        }}
                                      >
                                        <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-property-type-${account.id}`}>
                                          <SelectValue placeholder="Property" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">None</SelectItem>
                                          {PROPERTY_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-lg">
                    <Wallet className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="font-semibold text-slate-900 mb-2">No Accounts Yet</h3>
                    <p className="text-slate-500 mb-4 text-sm">Pull your income accounts from QuickBooks to get started</p>
                    <Button
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
    </CrmLayout>
  );
}
