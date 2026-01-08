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
import type { CrmUser, QuickbooksConnection, QuickbooksSyncLog, QuickbooksClass } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderTree, Download, Upload } from "lucide-react";
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

const CLASS_TYPES = ["Service", "Install", "Maintenance", "Discount"] as const;
const SUB_TYPES = ["Residential", "Commercial", "Crawlspace", "Promotional", "Maintenance"] as const;

type ClassType = typeof CLASS_TYPES[number];
type SubType = typeof SUB_TYPES[number];

interface ConnectionStatus {
  connected: boolean;
  connection?: QuickbooksConnection;
  syncStats?: {
    customers: number;
    invoices: number;
    payments: number;
  };
}

interface ClassFormData {
  name: string;
  classType: ClassType;
  subType: SubType;
}

export default function CrmSettingsQuickBooks() {
  usePageTitle("QuickBooks Integration");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingClass, setEditingClass] = useState<QuickbooksClass | null>(null);
  const [deleteConfirmClass, setDeleteConfirmClass] = useState<QuickbooksClass | null>(null);
  const [formData, setFormData] = useState<ClassFormData>({
    name: "",
    classType: "Service",
    subType: "Residential",
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

  const { data: syncLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery<QuickbooksSyncLog[]>({
    queryKey: ["/api/quickbooks/sync-logs"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser && status?.connected,
  });

  const { data: classes, isLoading: classesLoading, refetch: refetchClasses } = useQuery<QuickbooksClass[]>({
    queryKey: ["/api/quickbooks/classes"],
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
      window.open(authUrl, '_blank');
      toast({
        title: "QuickBooks Login Opened",
        description: "Complete the login in the new tab, then return here and refresh the page.",
      });
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
        toast({
          title: result.success ? "Sync Complete" : "Sync Completed with Errors",
          description: `${result.succeeded} invoices synced, ${result.failed} failed`,
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

  const syncClassesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/classes/sync");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/classes"] });
      toast({
        title: "Classes Synced",
        description: result.message || "Classes synced to QuickBooks",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync classes to QuickBooks",
        variant: "destructive",
      });
    },
  });

  const pullClassesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/quickbooks/classes/pull");
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/classes"] });
      toast({
        title: "Classes Pulled",
        description: result.message || "Classes pulled from QuickBooks",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Pull Failed",
        description: error.message || "Failed to pull classes from QuickBooks",
        variant: "destructive",
      });
    },
  });

  const createClassMutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      const response = await apiRequest("POST", "/api/quickbooks/classes", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/classes"] });
      setShowAddDialog(false);
      setFormData({ name: "", classType: "Service", subType: "Residential" });
      toast({
        title: "Class Created",
        description: "New class created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Create Failed",
        description: error.message || "Failed to create class",
        variant: "destructive",
      });
    },
  });

  const updateClassMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ClassFormData & { isActive: boolean }> }) => {
      const response = await apiRequest("PATCH", `/api/quickbooks/classes/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/classes"] });
      setEditingClass(null);
      setFormData({ name: "", classType: "Service", subType: "Residential" });
      toast({
        title: "Class Updated",
        description: "Class updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update class",
        variant: "destructive",
      });
    },
  });

  const deleteClassMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/quickbooks/classes/${id}`, { isActive: false });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quickbooks/classes"] });
      setDeleteConfirmClass(null);
      toast({
        title: "Class Deleted",
        description: "Class has been deactivated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete class",
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

  const handleOpenAddDialog = () => {
    setFormData({ name: "", classType: "Service", subType: "Residential" });
    setShowAddDialog(true);
  };

  const handleOpenEditDialog = (qbClass: QuickbooksClass) => {
    setFormData({
      name: qbClass.name,
      classType: qbClass.classType as ClassType,
      subType: qbClass.subType as SubType,
    });
    setEditingClass(qbClass);
  };

  const handleSubmitAdd = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    createClassMutation.mutate(formData);
  };

  const handleSubmitEdit = () => {
    if (!editingClass) return;
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    updateClassMutation.mutate({
      id: editingClass.id,
      data: formData,
    });
  };

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

  const activeClasses = classes?.filter(c => c.isActive) || [];
  const inactiveClasses = classes?.filter(c => !c.isActive) || [];

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
                      <div className="text-2xl font-bold">{status.syncStats?.customers || 0}</div>
                      <div className="text-sm text-slate-500">Customers Synced</div>
                    </div>
                    <div className="text-center p-4 bg-slate-50 rounded-lg">
                      <FileText className="h-6 w-6 mx-auto mb-2 text-amber-600" />
                      <div className="text-2xl font-bold">{status.syncStats?.invoices || 0}</div>
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

                  <div className="flex flex-wrap gap-3">
                    <Button 
                      onClick={() => syncCustomersMutation.mutate()}
                      disabled={syncCustomersMutation.isPending}
                      data-testid="btn-sync-customers"
                    >
                      {syncCustomersMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sync All Customers
                    </Button>
                    <Button 
                      onClick={() => syncInvoicesMutation.mutate()}
                      disabled={syncInvoicesMutation.isPending}
                      data-testid="btn-sync-invoices"
                    >
                      {syncInvoicesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sync All Invoices
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        refetchStatus();
                        refetchLogs();
                      }}
                      data-testid="btn-refresh-status"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Status
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
                <CardTitle>Sync History</CardTitle>
                <CardDescription>Recent synchronization activity</CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : syncLogs && syncLogs.length > 0 ? (
                  <div className="space-y-2">
                    {syncLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {log.status === "completed" ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : log.status === "failed" ? (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <Clock className="h-5 w-5 text-amber-600" />
                          )}
                          <div>
                            <p className="font-medium capitalize">
                              {log.syncType} sync ({log.direction})
                            </p>
                            <p className="text-sm text-slate-500">
                              {log.startedAt && new Date(log.startedAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-green-600">{log.recordsProcessed} synced</p>
                          {(log.recordsFailed ?? 0) > 0 && (
                            <p className="text-red-600">{log.recordsFailed} failed</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">No sync history yet</p>
                )}
              </CardContent>
            </Card>
          )}

          {status?.connected && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FolderTree className="h-6 w-6 text-blue-600" />
                    <div>
                      <CardTitle>Manage Classes</CardTitle>
                      <CardDescription>Create and manage QuickBooks classes for invoice tracking</CardDescription>
                    </div>
                  </div>
                  <Button onClick={handleOpenAddDialog} data-testid="btn-add-class">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Class
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {classesLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : activeClasses.length > 0 ? (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Sub Type</TableHead>
                          <TableHead>Sync Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeClasses.map((qbClass) => (
                          <TableRow key={qbClass.id} data-testid={`class-row-${qbClass.id}`}>
                            <TableCell className="font-medium">{qbClass.name}</TableCell>
                            <TableCell>{qbClass.classType}</TableCell>
                            <TableCell>{qbClass.subType}</TableCell>
                            <TableCell>
                              {qbClass.quickbooksClassId ? (
                                <Badge className="bg-green-100 text-green-800" data-testid={`status-synced-${qbClass.id}`}>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Synced
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-800" data-testid={`status-pending-${qbClass.id}`}>
                                  <Clock className="h-3 w-3 mr-1" />
                                  Not Synced
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEditDialog(qbClass)}
                                  data-testid={`btn-edit-class-${qbClass.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteConfirmClass(qbClass)}
                                  data-testid={`btn-delete-class-${qbClass.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    <Separator />
                    
                    <div className="flex gap-3">
                      <Button
                        onClick={() => syncClassesMutation.mutate()}
                        disabled={syncClassesMutation.isPending}
                        data-testid="btn-sync-classes"
                      >
                        {syncClassesMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Push to QuickBooks
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => pullClassesMutation.mutate()}
                        disabled={pullClassesMutation.isPending}
                        data-testid="btn-pull-classes"
                      >
                        {pullClassesMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Pull from QuickBooks
                      </Button>
                    </div>

                    {inactiveClasses.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-sm font-medium text-slate-500 mb-2">Inactive Classes ({inactiveClasses.length})</h4>
                        <div className="text-sm text-slate-400">
                          {inactiveClasses.map(c => c.name).join(", ")}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-500 mb-4">No classes configured yet</p>
                    <Button onClick={handleOpenAddDialog} variant="outline" data-testid="btn-add-first-class">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Class
                    </Button>
                    <div className="mt-4 flex justify-center gap-3">
                      <Button
                        variant="outline"
                        onClick={() => pullClassesMutation.mutate()}
                        disabled={pullClassesMutation.isPending}
                        data-testid="btn-pull-classes-empty"
                      >
                        {pullClassesMutation.isPending ? (
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
              <p><strong>Classes:</strong> Classes help categorize invoices for reporting. Create classes here, then sync them to QuickBooks.</p>
              <p className="text-amber-600"><strong>Note:</strong> For testing, use Sandbox mode first. Switch to Production when you're ready to sync real data.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Class</DialogTitle>
            <DialogDescription>
              Create a new QuickBooks class for tracking invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Service - Residential"
                data-testid="input-class-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="classType">Class Type</Label>
              <Select
                value={formData.classType}
                onValueChange={(value: ClassType) => setFormData({ ...formData, classType: value })}
              >
                <SelectTrigger data-testid="select-class-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subType">Sub Type</Label>
              <Select
                value={formData.subType}
                onValueChange={(value: SubType) => setFormData({ ...formData, subType: value })}
              >
                <SelectTrigger data-testid="select-sub-type">
                  <SelectValue placeholder="Select sub type" />
                </SelectTrigger>
                <SelectContent>
                  {SUB_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitAdd} 
              disabled={createClassMutation.isPending}
              data-testid="btn-submit-add-class"
            >
              {createClassMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create Class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingClass} onOpenChange={(open) => !open && setEditingClass(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
            <DialogDescription>
              Update the class details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Service - Residential"
                data-testid="input-edit-class-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-classType">Class Type</Label>
              <Select
                value={formData.classType}
                onValueChange={(value: ClassType) => setFormData({ ...formData, classType: value })}
              >
                <SelectTrigger data-testid="select-edit-class-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subType">Sub Type</Label>
              <Select
                value={formData.subType}
                onValueChange={(value: SubType) => setFormData({ ...formData, subType: value })}
              >
                <SelectTrigger data-testid="select-edit-sub-type">
                  <SelectValue placeholder="Select sub type" />
                </SelectTrigger>
                <SelectContent>
                  {SUB_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingClass(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitEdit} 
              disabled={updateClassMutation.isPending}
              data-testid="btn-submit-edit-class"
            >
              {updateClassMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmClass} onOpenChange={(open) => !open && setDeleteConfirmClass(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmClass?.name}"? This will deactivate the class but it can be restored later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmClass && deleteClassMutation.mutate(deleteConfirmClass.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="btn-confirm-delete-class"
            >
              {deleteClassMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
