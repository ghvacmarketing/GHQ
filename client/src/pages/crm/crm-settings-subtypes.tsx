import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Tags,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import {
  workOrderVisitTypeEnum,
  type CrmUser,
  type WorkOrderSubtype,
  type WorkOrderVisitType,
} from "@shared/schema";

const VISIT_TYPE_LABELS: Record<WorkOrderVisitType, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  MAINTENANCE: "Maintenance",
  SALES: "Sales",
};

const VISIT_TYPE_COLORS: Record<WorkOrderVisitType, string> = {
  SERVICE: "bg-blue-100 text-blue-700",
  INSTALL: "bg-green-100 text-green-700",
  MAINTENANCE: "bg-amber-100 text-amber-700",
  SALES: "bg-purple-100 text-purple-700",
};

export default function CrmSettingsSubtypes() {
  usePageTitle("Subtype Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingSubtype, setEditingSubtype] = useState<WorkOrderSubtype | null>(null);
  const [deletingSubtype, setDeletingSubtype] = useState<WorkOrderSubtype | null>(null);
  const [activeTab, setActiveTab] = useState<WorkOrderVisitType>("SERVICE");

  const [formData, setFormData] = useState({
    visitType: "SERVICE" as WorkOrderVisitType,
    subtype: "",
    isActive: true,
    sortOrder: 0,
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: subtypes = [], isLoading: subtypesLoading } = useQuery<WorkOrderSubtype[]>({
    queryKey: ["/api/crm/work-order-subtypes"],
    enabled: !!currentUser,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/crm/work-order-subtypes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-order-subtypes"] });
      toast({ title: "Subtype created successfully" });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create subtype",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/crm/work-order-subtypes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-order-subtypes"] });
      toast({ title: "Subtype updated successfully" });
      setShowEditDialog(false);
      setEditingSubtype(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update subtype",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/work-order-subtypes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-order-subtypes"] });
      toast({ title: "Subtype deleted successfully" });
      setShowDeleteDialog(false);
      setDeletingSubtype(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete subtype",
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

  const resetForm = () => {
    setFormData({
      visitType: activeTab,
      subtype: "",
      isActive: true,
      sortOrder: 0,
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setFormData((prev) => ({ ...prev, visitType: activeTab }));
    setShowCreateDialog(true);
  };

  const openEditDialog = (subtype: WorkOrderSubtype) => {
    setEditingSubtype(subtype);
    setFormData({
      visitType: subtype.visitType,
      subtype: subtype.subtype,
      isActive: subtype.isActive ?? true,
      sortOrder: subtype.sortOrder ?? 0,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (subtype: WorkOrderSubtype) => {
    setDeletingSubtype(subtype);
    setShowDeleteDialog(true);
  };

  const handleCreate = () => {
    if (!formData.subtype.trim()) {
      toast({
        title: "Validation error",
        description: "Subtype name is required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingSubtype || !formData.subtype.trim()) {
      toast({
        title: "Validation error",
        description: "Subtype name is required",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ id: editingSubtype.id, data: formData });
  };

  const handleDelete = () => {
    if (deletingSubtype) {
      deleteMutation.mutate(deletingSubtype.id);
    }
  };

  const getSubtypesByVisitType = (visitType: WorkOrderVisitType) => {
    return subtypes
      .filter((s) => s.visitType === visitType)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  };

  if (authLoading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-auth">
        <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
      </div>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-foreground" data-testid="text-page-title">
                Work Order Subtypes
              </h1>
              <p className="text-muted-foreground" data-testid="text-page-subtitle">
                Manage subtypes for each work order visit type
              </p>
            </div>
            <Button
              onClick={openCreateDialog}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-add-subtype"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Subtype
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {subtypesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as WorkOrderVisitType)}>
                <TabsList className="grid w-full grid-cols-4" data-testid="tabs-visit-types">
                  {workOrderVisitTypeEnum.map((type) => (
                    <TabsTrigger
                      key={type}
                      value={type}
                      data-testid={`tab-${type.toLowerCase()}`}
                    >
                      {VISIT_TYPE_LABELS[type]}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {workOrderVisitTypeEnum.map((visitType) => (
                  <TabsContent key={visitType} value={visitType} className="mt-4">
                    <div className="space-y-2">
                      {getSubtypesByVisitType(visitType).length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground" data-testid={`empty-${visitType.toLowerCase()}`}>
                          <Tags className="h-12 w-12 mx-auto mb-3 opacity-30" />
                          <p>No subtypes for {VISIT_TYPE_LABELS[visitType]}</p>
                          <p className="text-sm">Click "Add Subtype" to create one</p>
                        </div>
                      ) : (
                        getSubtypesByVisitType(visitType).map((subtype) => (
                          <div
                            key={subtype.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 hover:bg-slate-100 transition-colors"
                            data-testid={`subtype-row-${subtype.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium" data-testid={`subtype-name-${subtype.id}`}>
                                {subtype.subtype}
                              </span>
                              <StatusDot
                                pill={subtype.isActive ? "bg-green-100 text-green-700" : ""}
                                data-testid={`subtype-status-${subtype.id}`}
                              >
                                {subtype.isActive ? "Active" : "Inactive"}
                              </StatusDot>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(subtype)}
                                data-testid={`button-edit-${subtype.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openDeleteDialog(subtype)}
                                data-testid={`button-delete-${subtype.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent data-testid="dialog-create-subtype">
            <DialogHeader>
              <DialogTitle>Add Subtype</DialogTitle>
              <DialogDescription>
                Create a new subtype for work orders
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="visitType">Visit Type</Label>
                <Select
                  value={formData.visitType}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, visitType: v as WorkOrderVisitType }))}
                >
                  <SelectTrigger id="visitType" data-testid="select-visit-type">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrderVisitTypeEnum.map((type) => (
                      <SelectItem key={type} value={type} data-testid={`option-${type.toLowerCase()}`}>
                        {VISIT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subtypeName">Subtype Name</Label>
                <Input
                  id="subtypeName"
                  value={formData.subtype}
                  onChange={(e) => setFormData((prev) => ({ ...prev, subtype: e.target.value }))}
                  placeholder="e.g., No Heat, Tune Up"
                  data-testid="input-subtype-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-sort-order"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: !!checked }))}
                  data-testid="checkbox-is-active"
                />
                <Label htmlFor="isActive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-submit-create"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Subtype
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent data-testid="dialog-edit-subtype">
            <DialogHeader>
              <DialogTitle>Edit Subtype</DialogTitle>
              <DialogDescription>
                Update the subtype details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editVisitType">Visit Type</Label>
                <Select
                  value={formData.visitType}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, visitType: v as WorkOrderVisitType }))}
                >
                  <SelectTrigger id="editVisitType" data-testid="select-edit-visit-type">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrderVisitTypeEnum.map((type) => (
                      <SelectItem key={type} value={type} data-testid={`edit-option-${type.toLowerCase()}`}>
                        {VISIT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSubtypeName">Subtype Name</Label>
                <Input
                  id="editSubtypeName"
                  value={formData.subtype}
                  onChange={(e) => setFormData((prev) => ({ ...prev, subtype: e.target.value }))}
                  placeholder="e.g., No Heat, Tune Up"
                  data-testid="input-edit-subtype-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSortOrder">Sort Order</Label>
                <Input
                  id="editSortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-edit-sort-order"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="editIsActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: !!checked }))}
                  data-testid="checkbox-edit-is-active"
                />
                <Label htmlFor="editIsActive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending}
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                data-testid="button-submit-edit"
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent data-testid="dialog-delete-subtype">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Subtype</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingSubtype?.subtype}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
