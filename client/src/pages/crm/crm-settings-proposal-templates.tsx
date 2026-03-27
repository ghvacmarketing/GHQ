import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getQueryFn } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Plus,
  Edit,
  Trash2,
  Star,
  ArrowLeft,
  FileText,
  Loader2,
  Copy,
} from "lucide-react";
import { Link } from "wouter";
import type { CrmUser, ProposalTemplate } from "@shared/schema";
import RichTextEditor from "@/components/rich-text-editor";

export default function CrmSettingsProposalTemplates() {
  usePageTitle("Proposal Templates");
  const { toast } = useToast();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: templates = [], isLoading } = useQuery<ProposalTemplate[]>({
    queryKey: ["/api/crm/proposal-templates"],
  });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProposalTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<ProposalTemplate | null>(null);

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/crm/proposal-templates/seed-default"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-templates"] });
      toast({ title: "Default template created" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; body: string; isDefault: boolean }) =>
      apiRequest("POST", "/api/crm/proposal-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-templates"] });
      setEditDialogOpen(false);
      toast({ title: "Template created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; body: string; isDefault: boolean }) =>
      apiRequest("PATCH", `/api/crm/proposal-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-templates"] });
      setEditDialogOpen(false);
      toast({ title: "Template updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/proposal-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-templates"] });
      setDeleteDialogOpen(false);
      toast({ title: "Template deleted" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/crm/proposal-templates/${id}`, { isDefault: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-templates"] });
      toast({ title: "Default template updated" });
    },
  });

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateBody("");
    setTemplateIsDefault(templates.length === 0);
    setEditDialogOpen(true);
  };

  const openEditDialog = (template: ProposalTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateBody(template.body);
    setTemplateIsDefault(template.isDefault);
    setEditDialogOpen(true);
  };

  const openDuplicateDialog = (template: ProposalTemplate) => {
    setEditingTemplate(null);
    setTemplateName(template.name + " (Copy)");
    setTemplateBody(template.body);
    setTemplateIsDefault(false);
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!templateName.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    if (!templateBody.trim() || templateBody.trim() === "<p></p>") {
      toast({ title: "Template body is required", variant: "destructive" });
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, name: templateName, body: templateBody, isDefault: templateIsDefault });
    } else {
      createMutation.mutate({ name: templateName, body: templateBody, isDefault: templateIsDefault });
    }
  };

  if (authLoading) return null;
  if (!currentUser) return null;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/crm/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-800">Proposal Templates</h1>
            <p className="text-sm text-slate-500 mt-1">
              Create and manage templates for proposals and quotes. Use variables like {"{{customerName}}"}, {"{{address}}"}, {"{{equipmentSummary}}"}, {"{{totalPrice}}"}, {"{{date}}"}, {"{{projectName}}"} for auto-fill.
            </p>
          </div>
          <Button onClick={openCreateDialog} className="bg-[#711419] hover:bg-[#5a1014]">
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No templates yet</h3>
              <p className="text-sm text-slate-500 mb-6">Get started by loading the default Installation Agreement template or create your own.</p>
              <div className="flex items-center gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                >
                  {seedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Load Default Template
                </Button>
                <Button onClick={openCreateDialog} className="bg-[#711419] hover:bg-[#5a1014]">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{template.name}</CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created {new Date(template.createdAt!).toLocaleDateString()}
                      </p>
                    </div>
                    {template.isDefault && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 flex-shrink-0">
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(template.id)}
                        disabled={setDefaultMutation.isPending}
                        title="Set as default"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDuplicateDialog(template)}
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(template)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeletingTemplate(template);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    className="text-sm text-slate-500 line-clamp-3 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: template.body.replace(/<[^>]*>/g, " ").slice(0, 300) + (template.body.length > 300 ? "..." : ""),
                    }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "New Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Template Name</label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Installation Agreement, Service Contract..."
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={templateIsDefault}
                onChange={(e) => setTemplateIsDefault(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="isDefault" className="text-sm text-slate-600">Set as default template</label>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                Template Body
              </label>
              <p className="text-xs text-slate-400 mb-2">
                Available variables: {"{{customerName}}"}, {"{{address}}"}, {"{{equipmentSummary}}"}, {"{{totalPrice}}"}, {"{{date}}"}, {"{{projectName}}"}
              </p>
              <div className="min-h-[400px] border rounded-md">
                <RichTextEditor value={templateBody} onChange={setTemplateBody} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[#711419] hover:bg-[#5a1014]"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTemplate?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTemplate && deleteMutation.mutate(deletingTemplate.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
