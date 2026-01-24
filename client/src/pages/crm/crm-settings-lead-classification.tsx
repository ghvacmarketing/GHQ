import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Thermometer,
  Target,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { type CrmUser, type CrmLeadTempOption, type CrmLeadDriverOption } from "@shared/schema";

export default function CrmSettingsLeadClassification() {
  usePageTitle("Lead Classification Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showCreateTempDialog, setShowCreateTempDialog] = useState(false);
  const [showEditTempDialog, setShowEditTempDialog] = useState(false);
  const [showDeleteTempDialog, setShowDeleteTempDialog] = useState(false);
  const [editingTempOption, setEditingTempOption] = useState<CrmLeadTempOption | null>(null);
  const [deletingTempOption, setDeletingTempOption] = useState<CrmLeadTempOption | null>(null);

  const [showCreateDriverDialog, setShowCreateDriverDialog] = useState(false);
  const [showEditDriverDialog, setShowEditDriverDialog] = useState(false);
  const [showDeleteDriverDialog, setShowDeleteDriverDialog] = useState(false);
  const [editingDriverOption, setEditingDriverOption] = useState<CrmLeadDriverOption | null>(null);
  const [deletingDriverOption, setDeletingDriverOption] = useState<CrmLeadDriverOption | null>(null);

  const [tempFormData, setTempFormData] = useState({
    numericValue: 1,
    label: "",
    description: "",
    isActive: true,
    sortOrder: 0,
  });

  const [driverFormData, setDriverFormData] = useState({
    label: "",
    description: "",
    isActive: true,
    sortOrder: 0,
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: tempOptions = [], isLoading: tempLoading } = useQuery<CrmLeadTempOption[]>({
    queryKey: ["/api/crm/lead-temp-options"],
    enabled: !!currentUser,
  });

  const { data: driverOptions = [], isLoading: driverLoading } = useQuery<CrmLeadDriverOption[]>({
    queryKey: ["/api/crm/lead-driver-options"],
    enabled: !!currentUser,
  });

  const createTempMutation = useMutation({
    mutationFn: async (data: typeof tempFormData) => {
      const res = await apiRequest("POST", "/api/crm/lead-temp-options", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-temp-options"] });
      toast({ title: "Lead temperature option created successfully" });
      setShowCreateTempDialog(false);
      resetTempForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create lead temperature option",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateTempMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof tempFormData }) => {
      const res = await apiRequest("PATCH", `/api/crm/lead-temp-options/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-temp-options"] });
      toast({ title: "Lead temperature option updated successfully" });
      setShowEditTempDialog(false);
      setEditingTempOption(null);
      resetTempForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update lead temperature option",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteTempMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/lead-temp-options/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-temp-options"] });
      toast({ title: "Lead temperature option deleted successfully" });
      setShowDeleteTempDialog(false);
      setDeletingTempOption(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete lead temperature option",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const createDriverMutation = useMutation({
    mutationFn: async (data: typeof driverFormData) => {
      const res = await apiRequest("POST", "/api/crm/lead-driver-options", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-driver-options"] });
      toast({ title: "Customer driver option created successfully" });
      setShowCreateDriverDialog(false);
      resetDriverForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create customer driver option",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof driverFormData }) => {
      const res = await apiRequest("PATCH", `/api/crm/lead-driver-options/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-driver-options"] });
      toast({ title: "Customer driver option updated successfully" });
      setShowEditDriverDialog(false);
      setEditingDriverOption(null);
      resetDriverForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update customer driver option",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteDriverMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/lead-driver-options/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-driver-options"] });
      toast({ title: "Customer driver option deleted successfully" });
      setShowDeleteDriverDialog(false);
      setDeletingDriverOption(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete customer driver option",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const resetTempForm = () => {
    setTempFormData({
      numericValue: 1,
      label: "",
      description: "",
      isActive: true,
      sortOrder: 0,
    });
  };

  const resetDriverForm = () => {
    setDriverFormData({
      label: "",
      description: "",
      isActive: true,
      sortOrder: 0,
    });
  };

  const openCreateTempDialog = () => {
    resetTempForm();
    setShowCreateTempDialog(true);
  };

  const openEditTempDialog = (option: CrmLeadTempOption) => {
    setEditingTempOption(option);
    setTempFormData({
      numericValue: option.numericValue,
      label: option.label,
      description: option.description || "",
      isActive: option.isActive ?? true,
      sortOrder: option.sortOrder ?? 0,
    });
    setShowEditTempDialog(true);
  };

  const openDeleteTempDialog = (option: CrmLeadTempOption) => {
    setDeletingTempOption(option);
    setShowDeleteTempDialog(true);
  };

  const openCreateDriverDialog = () => {
    resetDriverForm();
    setShowCreateDriverDialog(true);
  };

  const openEditDriverDialog = (option: CrmLeadDriverOption) => {
    setEditingDriverOption(option);
    setDriverFormData({
      label: option.label,
      description: option.description || "",
      isActive: option.isActive ?? true,
      sortOrder: option.sortOrder ?? 0,
    });
    setShowEditDriverDialog(true);
  };

  const openDeleteDriverDialog = (option: CrmLeadDriverOption) => {
    setDeletingDriverOption(option);
    setShowDeleteDriverDialog(true);
  };

  const handleCreateTemp = () => {
    if (!tempFormData.label.trim()) {
      toast({
        title: "Validation error",
        description: "Label is required",
        variant: "destructive",
      });
      return;
    }
    if (tempFormData.numericValue < 1 || tempFormData.numericValue > 5) {
      toast({
        title: "Validation error",
        description: "Numeric value must be between 1 and 5",
        variant: "destructive",
      });
      return;
    }
    createTempMutation.mutate(tempFormData);
  };

  const handleUpdateTemp = () => {
    if (!editingTempOption || !tempFormData.label.trim()) {
      toast({
        title: "Validation error",
        description: "Label is required",
        variant: "destructive",
      });
      return;
    }
    if (tempFormData.numericValue < 1 || tempFormData.numericValue > 5) {
      toast({
        title: "Validation error",
        description: "Numeric value must be between 1 and 5",
        variant: "destructive",
      });
      return;
    }
    updateTempMutation.mutate({ id: editingTempOption.id, data: tempFormData });
  };

  const handleDeleteTemp = () => {
    if (deletingTempOption) {
      deleteTempMutation.mutate(deletingTempOption.id);
    }
  };

  const handleCreateDriver = () => {
    if (!driverFormData.label.trim()) {
      toast({
        title: "Validation error",
        description: "Label is required",
        variant: "destructive",
      });
      return;
    }
    createDriverMutation.mutate(driverFormData);
  };

  const handleUpdateDriver = () => {
    if (!editingDriverOption || !driverFormData.label.trim()) {
      toast({
        title: "Validation error",
        description: "Label is required",
        variant: "destructive",
      });
      return;
    }
    updateDriverMutation.mutate({ id: editingDriverOption.id, data: driverFormData });
  };

  const handleDeleteDriver = () => {
    if (deletingDriverOption) {
      deleteDriverMutation.mutate(deletingDriverOption.id);
    }
  };

  const sortedTempOptions = [...tempOptions].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const sortedDriverOptions = [...driverOptions].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  if (authLoading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-auth">
        <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
      </div>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back-to-settings"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Button>
          <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
            Lead Classification Settings
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">
            Manage lead temperature and customer driver options
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-[#711419]" />
                <CardTitle className="text-lg">Lead Temperature Options</CardTitle>
              </div>
              <Button
                onClick={openCreateTempDialog}
                size="sm"
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-add-temp-option"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            </CardHeader>
            <CardContent>
              {tempLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : sortedTempOptions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="empty-temp-options">
                  <Thermometer className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No lead temperature options configured</p>
                  <p className="text-sm">Click "Add Option" to create one</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedTempOptions.map((option) => (
                    <div
                      key={option.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 hover:bg-slate-100 transition-colors"
                      data-testid={`temp-option-row-${option.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono">
                            {option.numericValue}
                          </Badge>
                          <span className="font-medium" data-testid={`temp-option-label-${option.id}`}>
                            {option.label}
                          </span>
                          <Badge
                            variant={option.isActive ? "default" : "outline"}
                            className={option.isActive ? "bg-green-100 text-green-700" : ""}
                            data-testid={`temp-option-status-${option.id}`}
                          >
                            {option.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {option.description && (
                          <p className="text-sm text-muted-foreground mt-1 ml-12" data-testid={`temp-option-desc-${option.id}`}>
                            {option.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditTempDialog(option)}
                          data-testid={`button-edit-temp-${option.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openDeleteTempDialog(option)}
                          data-testid={`button-delete-temp-${option.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-[#711419]" />
                <CardTitle className="text-lg">Customer Driver Options</CardTitle>
              </div>
              <Button
                onClick={openCreateDriverDialog}
                size="sm"
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-add-driver-option"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            </CardHeader>
            <CardContent>
              {driverLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : sortedDriverOptions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="empty-driver-options">
                  <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No customer driver options configured</p>
                  <p className="text-sm">Click "Add Option" to create one</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedDriverOptions.map((option) => (
                    <div
                      key={option.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 hover:bg-slate-100 transition-colors"
                      data-testid={`driver-option-row-${option.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium" data-testid={`driver-option-label-${option.id}`}>
                            {option.label}
                          </span>
                          <Badge
                            variant={option.isActive ? "default" : "outline"}
                            className={option.isActive ? "bg-green-100 text-green-700" : ""}
                            data-testid={`driver-option-status-${option.id}`}
                          >
                            {option.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {option.description && (
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`driver-option-desc-${option.id}`}>
                            {option.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDriverDialog(option)}
                          data-testid={`button-edit-driver-${option.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => openDeleteDriverDialog(option)}
                          data-testid={`button-delete-driver-${option.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={showCreateTempDialog} onOpenChange={setShowCreateTempDialog}>
          <DialogContent data-testid="dialog-create-temp-option">
            <DialogHeader>
              <DialogTitle>Add Lead Temperature Option</DialogTitle>
              <DialogDescription>
                Create a new lead temperature option (1-5 scale)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="numericValue">Numeric Value (1-5)</Label>
                <Input
                  id="numericValue"
                  type="number"
                  min={1}
                  max={5}
                  value={tempFormData.numericValue}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, numericValue: parseInt(e.target.value) || 1 }))}
                  data-testid="input-temp-numeric-value"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tempLabel">Label</Label>
                <Input
                  id="tempLabel"
                  value={tempFormData.label}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Hot, Warm, Cold"
                  data-testid="input-temp-label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tempDescription">Description</Label>
                <Textarea
                  id="tempDescription"
                  value={tempFormData.description}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  data-testid="input-temp-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tempSortOrder">Sort Order</Label>
                <Input
                  id="tempSortOrder"
                  type="number"
                  value={tempFormData.sortOrder}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-temp-sort-order"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="tempIsActive"
                  checked={tempFormData.isActive}
                  onCheckedChange={(checked) => setTempFormData((prev) => ({ ...prev, isActive: !!checked }))}
                  data-testid="checkbox-temp-is-active"
                />
                <Label htmlFor="tempIsActive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateTempDialog(false)}
                data-testid="button-cancel-create-temp"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTemp}
                disabled={createTempMutation.isPending}
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-submit-create-temp"
              >
                {createTempMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Option
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditTempDialog} onOpenChange={setShowEditTempDialog}>
          <DialogContent data-testid="dialog-edit-temp-option">
            <DialogHeader>
              <DialogTitle>Edit Lead Temperature Option</DialogTitle>
              <DialogDescription>
                Update the lead temperature option details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editNumericValue">Numeric Value (1-5)</Label>
                <Input
                  id="editNumericValue"
                  type="number"
                  min={1}
                  max={5}
                  value={tempFormData.numericValue}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, numericValue: parseInt(e.target.value) || 1 }))}
                  data-testid="input-edit-temp-numeric-value"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTempLabel">Label</Label>
                <Input
                  id="editTempLabel"
                  value={tempFormData.label}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Hot, Warm, Cold"
                  data-testid="input-edit-temp-label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTempDescription">Description</Label>
                <Textarea
                  id="editTempDescription"
                  value={tempFormData.description}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  data-testid="input-edit-temp-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTempSortOrder">Sort Order</Label>
                <Input
                  id="editTempSortOrder"
                  type="number"
                  value={tempFormData.sortOrder}
                  onChange={(e) => setTempFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-edit-temp-sort-order"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="editTempIsActive"
                  checked={tempFormData.isActive}
                  onCheckedChange={(checked) => setTempFormData((prev) => ({ ...prev, isActive: !!checked }))}
                  data-testid="checkbox-edit-temp-is-active"
                />
                <Label htmlFor="editTempIsActive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowEditTempDialog(false)}
                data-testid="button-cancel-edit-temp"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateTemp}
                disabled={updateTempMutation.isPending}
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-submit-edit-temp"
              >
                {updateTempMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showDeleteTempDialog} onOpenChange={setShowDeleteTempDialog}>
          <AlertDialogContent data-testid="dialog-delete-temp-option">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead Temperature Option</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingTempOption?.label}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-temp">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTemp}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-temp"
              >
                {deleteTempMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showCreateDriverDialog} onOpenChange={setShowCreateDriverDialog}>
          <DialogContent data-testid="dialog-create-driver-option">
            <DialogHeader>
              <DialogTitle>Add Customer Driver Option</DialogTitle>
              <DialogDescription>
                Create a new customer driver option
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="driverLabel">Label</Label>
                <Input
                  id="driverLabel"
                  value={driverFormData.label}
                  onChange={(e) => setDriverFormData((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Price, Quality, Speed"
                  data-testid="input-driver-label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driverDescription">Description</Label>
                <Textarea
                  id="driverDescription"
                  value={driverFormData.description}
                  onChange={(e) => setDriverFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  data-testid="input-driver-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driverSortOrder">Sort Order</Label>
                <Input
                  id="driverSortOrder"
                  type="number"
                  value={driverFormData.sortOrder}
                  onChange={(e) => setDriverFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-driver-sort-order"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="driverIsActive"
                  checked={driverFormData.isActive}
                  onCheckedChange={(checked) => setDriverFormData((prev) => ({ ...prev, isActive: !!checked }))}
                  data-testid="checkbox-driver-is-active"
                />
                <Label htmlFor="driverIsActive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateDriverDialog(false)}
                data-testid="button-cancel-create-driver"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDriver}
                disabled={createDriverMutation.isPending}
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-submit-create-driver"
              >
                {createDriverMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Option
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDriverDialog} onOpenChange={setShowEditDriverDialog}>
          <DialogContent data-testid="dialog-edit-driver-option">
            <DialogHeader>
              <DialogTitle>Edit Customer Driver Option</DialogTitle>
              <DialogDescription>
                Update the customer driver option details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editDriverLabel">Label</Label>
                <Input
                  id="editDriverLabel"
                  value={driverFormData.label}
                  onChange={(e) => setDriverFormData((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Price, Quality, Speed"
                  data-testid="input-edit-driver-label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDriverDescription">Description</Label>
                <Textarea
                  id="editDriverDescription"
                  value={driverFormData.description}
                  onChange={(e) => setDriverFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  data-testid="input-edit-driver-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDriverSortOrder">Sort Order</Label>
                <Input
                  id="editDriverSortOrder"
                  type="number"
                  value={driverFormData.sortOrder}
                  onChange={(e) => setDriverFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-edit-driver-sort-order"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="editDriverIsActive"
                  checked={driverFormData.isActive}
                  onCheckedChange={(checked) => setDriverFormData((prev) => ({ ...prev, isActive: !!checked }))}
                  data-testid="checkbox-edit-driver-is-active"
                />
                <Label htmlFor="editDriverIsActive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowEditDriverDialog(false)}
                data-testid="button-cancel-edit-driver"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateDriver}
                disabled={updateDriverMutation.isPending}
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-submit-edit-driver"
              >
                {updateDriverMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showDeleteDriverDialog} onOpenChange={setShowDeleteDriverDialog}>
          <AlertDialogContent data-testid="dialog-delete-driver-option">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Customer Driver Option</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingDriverOption?.label}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-driver">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteDriver}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-driver"
              >
                {deleteDriverMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
