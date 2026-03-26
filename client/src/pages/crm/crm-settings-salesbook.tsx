import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  GripVertical,
  BookOpen,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, SalesbookBookmark } from "@shared/schema";

export default function CrmSettingsSalesbook() {
  usePageTitle("Salesbook Bookmarks");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<SalesbookBookmark | null>(null);
  const [deletingBookmark, setDeletingBookmark] = useState<SalesbookBookmark | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formPage, setFormPage] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<SalesbookBookmark[] | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: bookmarks = [], isLoading: bookmarksLoading } = useQuery<SalesbookBookmark[]>({
    queryKey: ["/api/salesbook/bookmarks"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { label: string; pageNumber: number; sortOrder: number }) => {
      const res = await apiRequest("POST", "/api/salesbook/bookmarks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salesbook/bookmarks"] });
      setShowCreateDialog(false);
      setFormLabel("");
      setFormPage("");
      toast({ title: "Bookmark created" });
    },
    onError: () => toast({ title: "Failed to create bookmark", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; label?: string; pageNumber?: number }) => {
      const res = await apiRequest("PATCH", `/api/salesbook/bookmarks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salesbook/bookmarks"] });
      setShowEditDialog(false);
      setEditingBookmark(null);
      toast({ title: "Bookmark updated" });
    },
    onError: () => toast({ title: "Failed to update bookmark", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/salesbook/bookmarks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salesbook/bookmarks"] });
      setShowDeleteDialog(false);
      setDeletingBookmark(null);
      toast({ title: "Bookmark deleted" });
    },
    onError: () => toast({ title: "Failed to delete bookmark", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (order: string[]) => {
      const res = await apiRequest("PUT", "/api/salesbook/bookmarks/reorder", { order });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salesbook/bookmarks"] });
    },
  });

  const displayBookmarks = localOrder ?? bookmarks;

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
    setLocalOrder([...bookmarks]);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || !localOrder) return;
    const reordered = [...localOrder];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(index, 0, moved);
    setLocalOrder(reordered);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (localOrder) {
      reorderMutation.mutate(localOrder.map((b) => b.id));
    }
    setDraggedIndex(null);
    setLocalOrder(null);
  };

  if (authLoading) return null;
  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

  const isAdmin =
    currentUser.role === "owner" ||
    currentUser.role === "admin" ||
    currentUser.role === "supervisor";

  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="min-h-screen bg-white p-8 flex items-center justify-center">
          <div className="text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">Only admins can manage salesbook bookmarks.</p>
          </div>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="min-h-screen bg-white px-4 sm:px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/crm/settings")}
            className="mb-4 text-slate-600 hover:text-slate-900 -ml-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Settings
          </Button>

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Salesbook Bookmarks</h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage table of contents entries for the Sales Pricebook
              </p>
            </div>
            <Button
              onClick={() => {
                setFormLabel("");
                setFormPage("");
                setShowCreateDialog(true);
              }}
              className="bg-[#711419] hover:bg-[#5a1014]"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Bookmark
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Bookmarks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bookmarksLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : bookmarks.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500">No bookmarks yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Add bookmarks so salespeople can quickly jump to sections
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {displayBookmarks.map((bm, idx) => (
                    <div
                      key={bm.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        draggedIndex === idx
                          ? "border-[#711419] bg-red-50"
                          : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <GripVertical className="h-4 w-4 text-slate-300 cursor-grab flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-900 block truncate">
                          {bm.label}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        p. {bm.pageNumber}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-slate-600"
                          onClick={() => {
                            setEditingBookmark(bm);
                            setFormLabel(bm.label);
                            setFormPage(String(bm.pageNumber));
                            setShowEditDialog(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          onClick={() => {
                            setDeletingBookmark(bm);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Label</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. Furnaces"
              />
            </div>
            <div>
              <Label>Page Number</Label>
              <Input
                type="number"
                min={1}
                value={formPage}
                onChange={(e) => setFormPage(e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pageNum = parseInt(formPage, 10);
                if (!formLabel.trim() || isNaN(pageNum) || pageNum < 1) {
                  toast({ title: "Please fill in all fields", variant: "destructive" });
                  return;
                }
                createMutation.mutate({
                  label: formLabel.trim(),
                  pageNumber: pageNum,
                  sortOrder: bookmarks.length,
                });
              }}
              disabled={createMutation.isPending}
              className="bg-[#711419] hover:bg-[#5a1014]"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Label</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />
            </div>
            <div>
              <Label>Page Number</Label>
              <Input
                type="number"
                min={1}
                value={formPage}
                onChange={(e) => setFormPage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editingBookmark) return;
                const pageNum = parseInt(formPage, 10);
                if (!formLabel.trim() || isNaN(pageNum) || pageNum < 1) {
                  toast({ title: "Please fill in all fields", variant: "destructive" });
                  return;
                }
                updateMutation.mutate({
                  id: editingBookmark.id,
                  label: formLabel.trim(),
                  pageNumber: pageNum,
                });
              }}
              disabled={updateMutation.isPending}
              className="bg-[#711419] hover:bg-[#5a1014]"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bookmark</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBookmark?.label}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingBookmark && deleteMutation.mutate(deletingBookmark.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
