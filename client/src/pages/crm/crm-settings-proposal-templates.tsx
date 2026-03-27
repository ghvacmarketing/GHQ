import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getQueryFn } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import type { CrmUser, ProposalTemplate } from "@shared/schema";
import RichTextEditor from "@/components/rich-text-editor";

const SYSTEM_VARIABLES = [
  { key: "customerName", label: "Customer Name", description: "The customer's full name" },
  { key: "address", label: "Address", description: "Project/service address" },
  { key: "equipmentSummary", label: "Equipment Summary", description: "Selected equipment description" },
  { key: "totalPrice", label: "Total Price", description: "Quoted total price" },
  { key: "date", label: "Date", description: "Current date (auto-filled)" },
  { key: "projectName", label: "Project Name", description: "Name of the project" },
  { key: "preparedFor", label: "Prepared For", description: "Recipient name (defaults to customer name)" },
];

function VariableBank({ onInsert }: { onInsert?: (variable: string) => void }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string) => {
    const variable = `{{${key}}}`;
    navigator.clipboard.writeText(variable);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
    onInsert?.(variable);
  };

  return (
    <div className="border rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-2 mb-3">
        <Braces className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">Variable Bank</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">Click to copy. Paste into your template — these get auto-filled when generating proposals.</p>
      <div className="flex flex-wrap gap-1.5">
        {SYSTEM_VARIABLES.map((v) => (
          <button
            key={v.key}
            onClick={() => handleCopy(v.key)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer"
            title={v.description}
          >
            {copiedKey === v.key ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-2.5 w-2.5 text-slate-400" />
                {`{{${v.key}}}`}
              </>
            )}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-2">
        You can also type custom variables like {"{{anyName}}"} — they'll appear as-is if no matching data is found.
      </p>
    </div>
  );
}

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
  const [variableBankOpen, setVariableBankOpen] = useState(true);

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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/crm/settings">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-800">Proposal Templates</h1>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
            <Plus className="h-4 w-4 mr-1.5" />
            New Template
          </Button>
        </div>

        <VariableBank />

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-lg">
            <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 mb-4">No templates yet</p>
            <div className="flex items-center gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                Load Default
              </Button>
              <Button onClick={openCreateDialog} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
                <Plus className="h-3 w-3 mr-1.5" />
                Create New
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border bg-white hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate">{template.name}</span>
                  {template.isDefault && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 bg-amber-50 flex-shrink-0">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {!template.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDefaultMutation.mutate(template.id)}
                      disabled={setDefaultMutation.isPending}
                      title="Set as default"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openDuplicateDialog(template)}
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEditDialog(template)}
                    title="Edit"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-600"
                    onClick={() => {
                      setDeletingTemplate(template);
                      setDeleteDialogOpen(true);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
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
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name..."
                  className="text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={templateIsDefault}
                  onChange={(e) => setTemplateIsDefault(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Default
              </label>
            </div>

            <div>
              <button
                onClick={() => setVariableBankOpen(!variableBankOpen)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-2"
              >
                <Braces className="h-3 w-3" />
                Variables
                {variableBankOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {variableBankOpen && <VariableBank />}
            </div>

            <div className="min-h-[400px] border rounded-md">
              <RichTextEditor value={templateBody} onChange={setTemplateBody} />
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
              {editingTemplate ? "Save" : "Create"}
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
