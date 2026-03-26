import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Trash2,
  Loader2,
  GripVertical,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, SalesbookBookmark } from "@shared/schema";

export default function CrmSettingsSalesbook() {
  usePageTitle("Salesbook Directory");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingBookmark, setDeletingBookmark] = useState<SalesbookBookmark | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPage, setEditPage] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPage, setNewPage] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
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
      setNewLabel("");
      setNewPage("");
      setShowAddRow(false);
      toast({ title: "Entry added" });
    },
    onError: () => toast({ title: "Failed to add entry", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; label?: string; pageNumber?: number }) => {
      const res = await apiRequest("PATCH", `/api/salesbook/bookmarks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salesbook/bookmarks"] });
      setEditingId(null);
      toast({ title: "Entry updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/salesbook/bookmarks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salesbook/bookmarks"] });
      setShowDeleteDialog(false);
      setDeletingBookmark(null);
      toast({ title: "Entry removed" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
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

  const startEdit = (bm: SalesbookBookmark) => {
    setEditingId(bm.id);
    setEditLabel(bm.label);
    setEditPage(String(bm.pageNumber));
  };

  const saveEdit = () => {
    if (!editingId) return;
    const pageNum = parseInt(editPage, 10);
    if (!editLabel.trim() || isNaN(pageNum) || pageNum < 1) {
      toast({ title: "Label and valid page number required", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingId, label: editLabel.trim(), pageNumber: pageNum });
  };

  const handleAdd = () => {
    const pageNum = parseInt(newPage, 10);
    if (!newLabel.trim() || isNaN(pageNum) || pageNum < 1) {
      toast({ title: "Label and valid page number required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      label: newLabel.trim(),
      pageNumber: pageNum,
      sortOrder: bookmarks.length,
    });
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
          <p className="text-slate-500">Only admins can manage the salesbook directory.</p>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="min-h-screen bg-white px-4 sm:px-8 py-6">
        <div className="max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/crm/settings")}
            className="mb-4 text-slate-500 hover:text-slate-800 -ml-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Settings
          </Button>

          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Salesbook Directory</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Manage the table of contents for the Sales Pricebook
              </p>
            </div>
            <a
              href="/price-book"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-[#711419] flex items-center gap-1 mt-1"
            >
              Open Salesbook
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[32px_1fr_72px_40px] gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2">
              <span />
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Section</span>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider text-center">Page</span>
              <span />
            </div>

            {bookmarksLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
              </div>
            ) : displayBookmarks.length === 0 && !showAddRow ? (
              <div className="text-center py-12 px-4">
                <p className="text-sm text-slate-400">No entries yet</p>
                <p className="text-xs text-slate-300 mt-1">
                  Add sections to build the salesbook table of contents
                </p>
              </div>
            ) : (
              <div>
                {displayBookmarks.map((bm, idx) => (
                  <div
                    key={bm.id}
                    draggable={editingId !== bm.id}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`grid grid-cols-[32px_1fr_72px_40px] gap-0 items-center px-3 py-0 border-b border-slate-100 last:border-b-0 transition-colors group ${
                      draggedIndex === idx ? "bg-slate-50" : "hover:bg-slate-50/50"
                    }`}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-slate-200 cursor-grab group-hover:text-slate-400 transition-colors" />

                    {editingId === bm.id ? (
                      <>
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="h-8 text-sm border-slate-200"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        />
                        <Input
                          type="number"
                          min={1}
                          value={editPage}
                          onChange={(e) => setEditPage(e.target.value)}
                          className="h-8 text-sm text-center border-slate-200 mx-1"
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        />
                        <div className="flex items-center gap-0.5 justify-end">
                          <button
                            onClick={saveEdit}
                            disabled={updateMutation.isPending}
                            className="p-1 text-emerald-500 hover:text-emerald-700 transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(bm)}
                          className="text-left py-2.5 text-sm text-slate-700 hover:text-slate-900 truncate transition-colors"
                        >
                          {bm.label}
                        </button>
                        <span className="text-xs text-slate-400 text-center tabular-nums">
                          {bm.pageNumber}
                        </span>
                        <button
                          onClick={() => {
                            setDeletingBookmark(bm);
                            setShowDeleteDialog(true);
                          }}
                          className="p-1 text-slate-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 justify-self-end"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showAddRow && (
              <div className="grid grid-cols-[32px_1fr_72px_40px] gap-0 items-center px-3 py-1.5 border-t border-slate-100 bg-slate-50/50">
                <span />
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Section name"
                  className="h-8 text-sm border-slate-200"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <Input
                  type="number"
                  min={1}
                  value={newPage}
                  onChange={(e) => setNewPage(e.target.value)}
                  placeholder="#"
                  className="h-8 text-sm text-center border-slate-200 mx-1"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <div className="flex items-center gap-0.5 justify-end">
                  <button
                    onClick={handleAdd}
                    disabled={createMutation.isPending}
                    className="p-1 text-emerald-500 hover:text-emerald-700 transition-colors"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => { setShowAddRow(false); setNewLabel(""); setNewPage(""); }}
                    className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAddRow(true)}
            className="mt-3 flex items-center gap-1.5 text-sm text-slate-400 hover:text-[#711419] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add entry
          </button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove entry</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deletingBookmark?.label}" from the directory?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingBookmark && deleteMutation.mutate(deletingBookmark.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
