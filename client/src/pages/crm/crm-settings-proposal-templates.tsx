import { useState, useRef, useCallback } from "react";
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
  X,
  Save,
  ImageIcon,
  Upload,
} from "lucide-react";
import { Link } from "wouter";
import type { CrmUser, ProposalTemplate, ProposalTemplateImage } from "@shared/schema";
import ProposalEditor from "@/components/proposal-editor";

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

function ImageLibrarySection() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageName, setImageName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deletingImage, setDeletingImage] = useState<ProposalTemplateImage | null>(null);
  const [showImages, setShowImages] = useState(false);

  const { data: images = [] } = useQuery<ProposalTemplateImage[]>({
    queryKey: ["/api/crm/proposal-template-images"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; url: string }) =>
      apiRequest("POST", "/api/crm/proposal-template-images", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-template-images"] });
      toast({ title: "Image saved to library" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/proposal-template-images/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-template-images"] });
      setDeletingImage(null);
      toast({ title: "Image removed from library" });
    },
  });

  const doUpload = useCallback(async (file: File, name: string) => {
    setUploading(true);
    try {
      const res = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await res.json();
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      const finalName = name.trim() || file.name.replace(/\.[^.]+$/, '');
      createMutation.mutate({ name: finalName, url: objectPath });
      setImageName("");
      setPendingFile(null);
      setTimeout(() => fileInputRef.current?.click(), 150);
    } catch (err) {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [createMutation, toast]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: "Only image files are supported", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image must be under 10MB", variant: "destructive" });
      return;
    }
    setPendingFile(file);
    setImageName(file.name.replace(/\.[^.]+$/, ''));
    setTimeout(() => nameInputRef.current?.select(), 50);
  }, [toast]);

  const handleSave = useCallback(() => {
    if (!pendingFile) return;
    doUpload(pendingFile, imageName);
  }, [pendingFile, imageName, doUpload]);

  return (
    <>
      <div className="border rounded-lg bg-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <ImageIcon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700 flex-1">Image Library</span>

          {pendingFile ? (
            <div className="flex items-center gap-2">
              <Input
                ref={nameInputRef}
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                placeholder="Name this image"
                className="text-sm h-7 w-44"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs px-3"
                onClick={handleSave}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-slate-400"
                onClick={() => { setPendingFile(null); setImageName(""); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {images.length > 0 && (
                <button
                  onClick={() => setShowImages(!showImages)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
                >
                  {images.length} image{images.length !== 1 ? 's' : ''}
                  {showImages ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Image
              </Button>
            </div>
          )}
        </div>

        {showImages && images.length > 0 && (
          <div className="px-4 pb-3 border-t pt-3">
            <div className="space-y-1">
              {images.map((img) => (
                <div key={img.id} className="group flex items-center gap-3 py-1.5 px-2 rounded hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded border overflow-hidden bg-slate-50 flex-shrink-0">
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm text-slate-600 flex-1 truncate">{img.name}</span>
                  <button
                    onClick={() => setDeletingImage(img)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingImage} onOpenChange={(open) => !open && setDeletingImage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Image</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deletingImage?.name}" from the library? This won't affect images already used in templates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingImage && deleteMutation.mutate(deletingImage.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

  const { data: libraryImages = [] } = useQuery<ProposalTemplateImage[]>({
    queryKey: ["/api/crm/proposal-template-images"],
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<ProposalTemplate | null>(null);
  const [variableBankOpen, setVariableBankOpen] = useState(true);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateIsDefault, setTemplateIsDefault] = useState(false);

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
      setEditingId(null);
      toast({ title: "Template created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; body: string; isDefault: boolean }) =>
      apiRequest("PATCH", `/api/crm/proposal-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-templates"] });
      setEditingId(null);
      toast({ title: "Template updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/proposal-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/proposal-templates"] });
      setDeleteDialogOpen(false);
      if (editingId === deletingTemplate?.id) setEditingId(null);
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

  const startCreate = () => {
    setEditingId("new");
    setTemplateName("");
    setTemplateBody("");
    setTemplateIsDefault(templates.length === 0);
  };

  const startEdit = (template: ProposalTemplate) => {
    setEditingId(template.id);
    setTemplateName(template.name);
    setTemplateBody(template.body);
    setTemplateIsDefault(template.isDefault);
  };

  const startDuplicate = (template: ProposalTemplate) => {
    setEditingId("new");
    setTemplateName(template.name + " (Copy)");
    setTemplateBody(template.body);
    setTemplateIsDefault(false);
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
    if (editingId === "new") {
      createMutation.mutate({ name: templateName, body: templateBody, isDefault: templateIsDefault });
    } else if (editingId) {
      updateMutation.mutate({ id: editingId, name: templateName, body: templateBody, isDefault: templateIsDefault });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  if (authLoading) return null;
  if (!currentUser) return null;

  const isEditing = editingId !== null;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          {isEditing ? (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Link href="/crm/settings">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-800">Proposal Templates</h1>
          </div>
          {!isEditing && (
            <Button onClick={startCreate} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
              <Plus className="h-4 w-4 mr-1.5" />
              New Template
            </Button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name..."
                  className="text-base font-medium"
                  autoFocus
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

            <ProposalEditor
              value={templateBody}
              onChange={setTemplateBody}
              imageLibrary={libraryImages}

            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-[#711419] hover:bg-[#5a1014]"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                {editingId === "new" ? "Create Template" : "Save Changes"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ImageLibrarySection />

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
                  <Button onClick={startCreate} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
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
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border bg-white hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => startEdit(template)}
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
                          onClick={(e) => { e.stopPropagation(); setDefaultMutation.mutate(template.id); }}
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
                        onClick={(e) => { e.stopPropagation(); startDuplicate(template); }}
                        title="Duplicate"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
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
          </>
        )}
      </div>

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
