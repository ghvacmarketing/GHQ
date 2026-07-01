import { useState, useEffect } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  ArrowLeft,
  Upload,
  Loader2,
  Shield,
  Package,
  Settings2,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Save,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";

interface MaterialItem {
  id: string;
  name: string;
  category: string;
  partNumber: string;
  unitCost: number;
  unit: string;
  vendor: string;
}

interface JobCostingSettings {
  overheadPercent: number;
  commissionPercent: number;
}

export default function CrmSettingsMaterialsCatalog() {
  usePageTitle("Materials Catalog - Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [importFile, setImportFile] = useState<File | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<MaterialItem | null>(null);

  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    partNumber: "",
    unitCost: "",
    unit: "",
    vendor: "",
  });

  const [costingSettings, setCostingSettings] = useState<JobCostingSettings>({
    overheadPercent: 30,
    commissionPercent: 6,
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: materials, isLoading: materialsLoading } = useQuery<MaterialItem[]>({
    queryKey: ["/api/crm/materials-catalog"],
    enabled: !!currentUser,
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<JobCostingSettings>({
    queryKey: ["/api/crm/job-costing-settings"],
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (settings) {
      setCostingSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const uploadCsvMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/crm/materials-catalog/upload-csv", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to upload catalog");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/materials-catalog"] });
      setImportFile(null);
      toast({
        title: "Catalog updated successfully",
        description: `Imported ${data.imported || data.count || 0} item(s)`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to upload catalog", description: error.message, variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: Omit<MaterialItem, "id">) => {
      const res = await apiRequest("POST", "/api/crm/materials-catalog", item);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/materials-catalog"] });
      setShowAddDialog(false);
      setNewItem({ name: "", category: "", partNumber: "", unitCost: "", unit: "", vendor: "" });
      toast({ title: "Item added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add item", description: error.message, variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (item: MaterialItem) => {
      const res = await apiRequest("PUT", `/api/crm/materials-catalog/${item.id}`, item);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/materials-catalog"] });
      setEditingItem(null);
      toast({ title: "Item updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update item", description: error.message, variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/crm/materials-catalog/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/materials-catalog"] });
      setDeleteItem(null);
      toast({ title: "Item deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete item", description: error.message, variant: "destructive" });
    },
  });

  const saveCostingSettingsMutation = useMutation({
    mutationFn: async (data: JobCostingSettings) => {
      const res = await apiRequest("PUT", "/api/crm/job-costing-settings", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/job-costing-settings"] });
      toast({ title: "Job costing settings saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save settings", description: error.message, variant: "destructive" });
    },
  });

  const handleUploadCsv = () => {
    if (!importFile) return;
    uploadCsvMutation.mutate(importFile);
  };

  const handleAddItem = () => {
    if (!newItem.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    addItemMutation.mutate({
      name: newItem.name,
      category: newItem.category,
      partNumber: newItem.partNumber,
      unitCost: parseFloat(newItem.unitCost) || 0,
      unit: newItem.unit,
      vendor: newItem.vendor,
    });
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;
    updateItemMutation.mutate(editingItem);
  };

  const handleDeleteItem = () => {
    if (!deleteItem) return;
    deleteItemMutation.mutate(deleteItem.id);
  };

  const handleSaveCostingSettings = () => {
    saveCostingSettingsMutation.mutate(costingSettings);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor";

  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/crm/settings">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Settings
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Materials Catalog is only available to administrators.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/crm/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Materials Catalog</h1>
            <p className="text-slate-500 text-sm">Manage materials and job costing settings</p>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Job Costing Settings
              </CardTitle>
              <CardDescription>
                Configure overhead and commission percentages for job costing calculations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="overhead-percent">Overhead Percentage</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="overhead-percent"
                          type="number"
                          min="0"
                          max="100"
                          value={costingSettings.overheadPercent}
                          onChange={(e) =>
                            setCostingSettings({
                              ...costingSettings,
                              overheadPercent: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-24"
                          data-testid="input-overhead-percent"
                        />
                        <span className="text-slate-500">%</span>
                      </div>
                      <p className="text-xs text-slate-500">Default: 30%</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="commission-percent">Sales Commission Percentage</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="commission-percent"
                          type="number"
                          min="0"
                          max="100"
                          value={costingSettings.commissionPercent}
                          onChange={(e) =>
                            setCostingSettings({
                              ...costingSettings,
                              commissionPercent: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-24"
                          data-testid="input-commission-percent"
                        />
                        <span className="text-slate-500">%</span>
                      </div>
                      <p className="text-xs text-slate-500">Default: 6%</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveCostingSettings}
                    disabled={saveCostingSettingsMutation.isPending}
                    className="bg-[#711419] hover:bg-[#5a1014]"
                    data-testid="button-save-costing"
                  >
                    {saveCostingSettingsMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Settings
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Materials Catalog
              </CardTitle>
              <CardDescription>
                Upload a CSV file to update the materials catalog. Existing items with matching part numbers will be updated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-slate-400 transition-colors"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".csv";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setImportFile(file);
                  };
                  input.click();
                }}
                data-testid="import-file-drop"
              >
                {importFile ? (
                  <div className="space-y-2">
                    <FileSpreadsheet className="h-10 w-10 mx-auto text-[#711419]" />
                    <p className="font-medium">{importFile.name}</p>
                    <p className="text-xs text-slate-500">{(importFile.size / 1024).toFixed(1)} KB</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportFile(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-slate-400" />
                    <p className="font-medium text-slate-600">Click to select a CSV file</p>
                    <p className="text-xs text-slate-500">Expected columns: Name, Category, Part Number, Unit Cost, Unit, Vendor</p>
                  </div>
                )}
              </div>

              <Button
                className="w-full bg-[#711419] hover:bg-[#5a1014]"
                onClick={handleUploadCsv}
                disabled={!importFile || uploadCsvMutation.isPending}
                data-testid="button-upload-catalog"
              >
                {uploadCsvMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Update Catalog
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Materials Catalog
                  </CardTitle>
                  <CardDescription>
                    {materials?.length || 0} items in catalog
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowAddDialog(true)}
                  className="bg-[#711419] hover:bg-[#5a1014]"
                  data-testid="button-add-item"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {materialsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : materials && materials.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.category || "-"}</TableCell>
                          <TableCell>{item.partNumber || "-"}</TableCell>
                          <TableCell className="text-right">
                            ${(typeof item.unitCost === 'number' ? item.unitCost : parseFloat(item.unitCost) || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>{item.unit || "-"}</TableCell>
                          <TableCell>{item.vendor || "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingItem(item)}
                                data-testid={`button-edit-${item.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteItem(item)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-delete-${item.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  <Package className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                  <p>No items in the catalog yet</p>
                  <p className="text-sm mt-1">Upload a CSV or add items manually</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Item</DialogTitle>
              <DialogDescription>Add a new material to the catalog</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="add-name">Name *</Label>
                <Input
                  id="add-name"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="Material name"
                  data-testid="input-add-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-category">Category</Label>
                  <Input
                    id="add-category"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    placeholder="Category"
                    data-testid="input-add-category"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-partNumber">Part Number</Label>
                  <Input
                    id="add-partNumber"
                    value={newItem.partNumber}
                    onChange={(e) => setNewItem({ ...newItem, partNumber: e.target.value })}
                    placeholder="Part number"
                    data-testid="input-add-partNumber"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-unitCost">Unit Cost</Label>
                  <Input
                    id="add-unitCost"
                    type="number"
                    step="0.01"
                    value={newItem.unitCost}
                    onChange={(e) => setNewItem({ ...newItem, unitCost: e.target.value })}
                    placeholder="0.00"
                    data-testid="input-add-unitCost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-unit">Unit</Label>
                  <Input
                    id="add-unit"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="each, ft, lb, etc."
                    data-testid="input-add-unit"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-vendor">Vendor</Label>
                <Input
                  id="add-vendor"
                  value={newItem.vendor}
                  onChange={(e) => setNewItem({ ...newItem, vendor: e.target.value })}
                  placeholder="Vendor name"
                  data-testid="input-add-vendor"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddItem}
                disabled={addItemMutation.isPending}
                className="bg-[#711419] hover:bg-[#5a1014]"
                data-testid="button-confirm-add"
              >
                {addItemMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Item"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
              <DialogDescription>Update material information</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input
                    id="edit-name"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    placeholder="Material name"
                    data-testid="input-edit-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">Category</Label>
                    <Input
                      id="edit-category"
                      value={editingItem.category}
                      onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                      placeholder="Category"
                      data-testid="input-edit-category"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-partNumber">Part Number</Label>
                    <Input
                      id="edit-partNumber"
                      value={editingItem.partNumber}
                      onChange={(e) => setEditingItem({ ...editingItem, partNumber: e.target.value })}
                      placeholder="Part number"
                      data-testid="input-edit-partNumber"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-unitCost">Unit Cost</Label>
                    <Input
                      id="edit-unitCost"
                      type="number"
                      step="0.01"
                      value={editingItem.unitCost}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, unitCost: parseFloat(e.target.value) || 0 })
                      }
                      placeholder="0.00"
                      data-testid="input-edit-unitCost"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-unit">Unit</Label>
                    <Input
                      id="edit-unit"
                      value={editingItem.unit}
                      onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                      placeholder="each, ft, lb, etc."
                      data-testid="input-edit-unit"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-vendor">Vendor</Label>
                  <Input
                    id="edit-vendor"
                    value={editingItem.vendor}
                    onChange={(e) => setEditingItem({ ...editingItem, vendor: e.target.value })}
                    placeholder="Vendor name"
                    data-testid="input-edit-vendor"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdateItem}
                disabled={updateItemMutation.isPending}
                className="bg-[#711419] hover:bg-[#5a1014]"
                data-testid="button-confirm-edit"
              >
                {updateItemMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Item</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deleteItem?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteItem}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete"
              >
                {deleteItemMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
