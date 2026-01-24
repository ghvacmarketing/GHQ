import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Tag,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { type CrmUser, type CrmLeadType } from "@shared/schema";

export default function CrmSettingsLeadTypes() {
  usePageTitle("Lead Type Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingLeadType, setEditingLeadType] = useState<CrmLeadType | null>(null);
  const [deletingLeadType, setDeletingLeadType] = useState<CrmLeadType | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    isActive: true,
    sortOrder: 0,
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: leadTypes = [], isLoading: leadTypesLoading } = useQuery<CrmLeadType[]>({
    queryKey: ["/api/crm/lead-types"],
    enabled: !!currentUser,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/crm/lead-types", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-types"] });
      toast({ title: "Lead type created successfully" });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create lead type",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/crm/lead-types/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-types"] });
      toast({ title: "Lead type updated successfully" });
      setShowEditDialog(false);
      setEditingLeadType(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update lead type",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/lead-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/lead-types"] });
      toast({ title: "Lead type deleted successfully" });
      setShowDeleteDialog(false);
      setDeletingLeadType(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete lead type",
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
      name: "",
      isActive: true,
      sortOrder: 0,
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = (leadType: CrmLeadType) => {
    setEditingLeadType(leadType);
    setFormData({
      name: leadType.name,
      isActive: leadType.isActive ?? true,
      sortOrder: leadType.sortOrder ?? 0,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (leadType: CrmLeadType) => {
    setDeletingLeadType(leadType);
    setShowDeleteDialog(true);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Lead type name is required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingLeadType || !formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Lead type name is required",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ id: editingLeadType.id, data: formData });
  };

  const handleDelete = () => {
    if (deletingLeadType) {
      deleteMutation.mutate(deletingLeadType.id);
    }
  };

  const sortedLeadTypes = [...leadTypes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
                Lead Types
              </h1>
              <p className="text-muted-foreground" data-testid="text-page-subtitle">
                Manage lead types for your CRM
              </p>
            </div>
            <Button
              onClick={openCreateDialog}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-add-lead-type"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Lead Type
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {leadTypesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : sortedLeadTypes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="empty-lead-types">
                <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No lead types configured</p>
                <p className="text-sm">Click "Add Lead Type" to create one</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedLeadTypes.map((leadType) => (
                  <div
                    key={leadType.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 hover:bg-slate-100 transition-colors"
                    data-testid={`lead-type-row-${leadType.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium" data-testid={`lead-type-name-${leadType.id}`}>
                        {leadType.name}
                      </span>
                      <Badge
                        variant={leadType.isActive ? "default" : "outline"}
                        className={leadType.isActive ? "bg-green-100 text-green-700" : ""}
                        data-testid={`lead-type-status-${leadType.id}`}
                      >
                        {leadType.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <span className="text-xs text-muted-foreground" data-testid={`lead-type-order-${leadType.id}`}>
                        Order: {leadType.sortOrder ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(leadType)}
                        data-testid={`button-edit-${leadType.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => openDeleteDialog(leadType)}
                        data-testid={`button-delete-${leadType.id}`}
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

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent data-testid="dialog-create-lead-type">
            <DialogHeader>
              <DialogTitle>Add Lead Type</DialogTitle>
              <DialogDescription>
                Create a new lead type for your CRM
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., New Installation, Service Call"
                  data-testid="input-lead-type-name"
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
                Create Lead Type
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent data-testid="dialog-edit-lead-type">
            <DialogHeader>
              <DialogTitle>Edit Lead Type</DialogTitle>
              <DialogDescription>
                Update the lead type details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editName">Name</Label>
                <Input
                  id="editName"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., New Installation, Service Call"
                  data-testid="input-edit-lead-type-name"
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
          <AlertDialogContent data-testid="dialog-delete-lead-type">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead Type</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingLeadType?.name}"? This action cannot be undone.
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
