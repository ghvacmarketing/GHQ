import { useState, useRef, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  ArrowLeft, CheckCircle2, Circle, ChevronDown, ChevronUp,
  FileText, Trash2, Upload, Plus, User, Calendar, ClipboardList,
  Activity, Settings2, Zap, Home, Droplets, Wrench, Star, FolderOpen,
  AlertCircle, Loader2, Lock, BookOpen, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import type {
  RebateCase, RebateCaseWorkflowStep, RebateCaseScopeChecklist,
  RebateCaseDocument, RebateCaseActivityLog,
} from "@shared/schema";
import { insertRebateCaseSchema } from "@shared/schema";
import {
  PROGRAM_TYPE_LABELS, PROGRAM_TYPE_SHORT, APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS, APPLICATION_STATUS_COLORS,
  WORKFLOW_STEPS_ORDER, WORKFLOW_STEP_LABELS, WORKFLOW_STEP_DESCRIPTIONS,
  WORKFLOW_STEP_STATUS_LABELS, WORKFLOW_STEP_STATUS_COLORS,
  PRIORITY_LABELS, PRIORITY_COLORS,
  DOCUMENT_CATEGORY_LABELS,
} from "@/lib/rebate-constants";
import type { RebateDocumentCategory, RebateWorkflowStepStatus, CrmUser } from "@shared/schema";

type CaseDetail = RebateCase & {
  workflowSteps: RebateCaseWorkflowStep[];
  scopeChecklist: RebateCaseScopeChecklist[];
  documents: RebateCaseDocument[];
  activity: RebateCaseActivityLog[];
};


const DOC_CATEGORIES: RebateDocumentCategory[] = [
  "rebate_request","head_of_household","scope_of_work","electrical_wiring_pre_retrofit",
  "ahri_certificate","snugg_pro_pdf","fuel_switching_calculator","manual_j_report",
  "contractor_pre_approval","project_completion","completion_attestations","reservation_summary","other",
];

export default function CrmRebateCase() {
  const [, params] = useRoute("/crm/rebate-programs/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: caseData, isLoading } = useQuery<CaseDetail>({
    queryKey: ["/api/crm/rebate-cases", id],
    queryFn: () => fetch(`/api/crm/rebate-cases/${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", id] });

  const patchCase = useMutation({
    mutationFn: (data: Partial<RebateCase>) =>
      apiRequest("PATCH", `/api/crm/rebate-cases/${id}`, data),
    onSuccess: () => { invalidate(); toast({ title: "Saved" }); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const closeCase = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/crm/rebate-cases/${id}`, { applicationStatus: "closed" }),
    onSuccess: () => { invalidate(); toast({ title: "Case closed" }); },
    onError: () => toast({ title: "Failed to close case", variant: "destructive" }),
  });

  const deleteCase = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/crm/rebate-cases/${id}`),
    onSuccess: () => { navigate("/crm/rebate-programs"); toast({ title: "Case deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  if (authLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const stepsComplete = (caseData?.workflowSteps ?? []).filter(s => s.status === "complete").length;
  const totalSteps = WORKFLOW_STEPS_ORDER.length;
  const clientName = [caseData?.clientFirstName, caseData?.clientLastName].filter(Boolean).join(" ") || "Unnamed Client";
  const isClosed = caseData?.applicationStatus === "closed";

  return (
    <CrmLayout currentUser={currentUser}>
    {isLoading ? (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    ) : !caseData ? (
      <div className="p-6 text-center text-slate-500">
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        Case not found.
      </div>
    ) : (
    <div className="space-y-6">
      {/* Header row — matches customer profile style */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/crm/rebate-programs")}>
          <ArrowLeft className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <div className="flex items-center gap-1">
          {!isClosed && (
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-600 hover:text-slate-900"
              onClick={() => { if (confirm("Close this case?")) closeCase.mutate(); }}
              disabled={closeCase.isPending}
            >
              <Lock className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Close Case</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => { if (confirm("Delete this case? This cannot be undone.")) deleteCase.mutate(); }}
            disabled={deleteCase.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      {/* Title block */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">{clientName}</h1>
          {caseData.caseNumber && (
            <span className="text-slate-400 font-mono text-base">#{caseData.caseNumber}</span>
          )}
          <Badge className={`text-xs border ${APPLICATION_STATUS_COLORS[caseData.applicationStatus]}`}>
            {APPLICATION_STATUS_LABELS[caseData.applicationStatus]}
          </Badge>
          <Badge variant="outline" className="text-xs">{PROGRAM_TYPE_SHORT[caseData.programType]}</Badge>
          <Badge className={`text-xs ${PRIORITY_COLORS[caseData.priority]}`}>
            {PRIORITY_LABELS[caseData.priority]}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-slate-500">
            {caseData.propertyAddress ? `${caseData.propertyAddress}, ${caseData.propertyCity ?? ""}` : "No address on file"}
          </p>
          <span className="text-slate-200">·</span>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <div className={`w-2 h-2 rounded-full ${stepsComplete === totalSteps ? "bg-green-500" : "bg-amber-400"}`} />
            {stepsComplete} of {totalSteps} complete
          </div>
        </div>
      </div>

      {/* Tabs — underline style matching customer profile */}
      <Tabs defaultValue="program_overview">
        {/* Scrollable tab bar — never wraps, scrolls horizontally on small screens */}
        <div className="overflow-x-auto overflow-y-hidden border-b border-slate-200 -mx-4 sm:mx-0 px-4 sm:px-0">
          <TabsList className="min-w-max w-auto flex justify-start rounded-none bg-transparent h-auto p-0">
            {[
              { value: "program_overview",       label: "Program Overview",        icon: Star },
              { value: "rebate_request",          label: "Rebate Request",          icon: FileText },
              { value: "head_of_household",       label: "Head of Household",       icon: User },
              { value: "scope_of_work",           label: "Scope of Work",           icon: ClipboardList },
              { value: "contractor_pre_approval", label: "Contractor Pre-Approval", icon: CheckCircle2 },
              { value: "project_completion",      label: "Project Completion",      icon: Wrench },
              { value: "completion_attestations", label: "Completion Attestations", icon: Activity },
              { value: "reservation_summary",     label: "Reservation Summary",     icon: Calendar },
              { value: "documents",               label: "Documents",               icon: FolderOpen },
              { value: "activity",                label: "Activity Log",            icon: Activity },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2.5 sm:px-3.5 md:px-4 py-2 text-xs sm:text-sm whitespace-nowrap flex items-center gap-1.5"
              >
                <Icon className="h-3.5 w-3.5 hidden md:block flex-shrink-0" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6">
          <TabsContent value="program_overview">
            <SummaryTab caseData={caseData} users={users} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="rebate_request">
            <RebateRequestTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="head_of_household">
            <HeadOfHouseholdTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="scope_of_work">
            <ScopeTab caseData={caseData} caseId={id} onPatch={patchCase.mutate} saving={patchCase.isPending} onInvalidate={invalidate} />
          </TabsContent>
          <TabsContent value="contractor_pre_approval">
            <ContractorPreApprovalTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="project_completion">
            <ProjectCompletionTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="completion_attestations">
            <CompletionAttestationsTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="reservation_summary">
            <ReservationSummaryTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab caseData={caseData} caseId={id} onInvalidate={invalidate} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab caseData={caseData} caseId={id} users={users} onInvalidate={invalidate} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
    )}
    </CrmLayout>
  );
}

// ─── Summary Tab ───────────────────────────────────────────────────────────────

function SummaryTab({
  caseData, users, onPatch, saving,
}: {
  caseData: CaseDetail;
  users: CrmUser[];
  onPatch: (d: Partial<RebateCase>) => void;
  saving: boolean;
}) {
  const assignedUser = users.find(u => u.id === caseData.assignedToUserId);
  const fields: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Program", value: PROGRAM_TYPE_LABELS[caseData.programType] },
    { label: "Status", value: APPLICATION_STATUS_LABELS[caseData.applicationStatus] },
    { label: "Priority", value: PRIORITY_LABELS[caseData.priority] },
    { label: "Assigned To", value: assignedUser?.name ?? "Unassigned" },
    { label: "Case #", value: caseData.caseNumber ?? "—" },
    { label: "Rebate Amount", value: caseData.rebateAmount ?? "—" },
    { label: "Application Date", value: caseData.applicationDate ? format(new Date(caseData.applicationDate), "MMM d, yyyy") : "—" },
    { label: "Reservation Date", value: caseData.reservationDate ? format(new Date(caseData.reservationDate), "MMM d, yyyy") : "—" },
    { label: "Approval Date", value: caseData.approvalDate ? format(new Date(caseData.approvalDate), "MMM d, yyyy") : "—" },
    { label: "Paid Date", value: caseData.paidDate ? format(new Date(caseData.paidDate), "MMM d, yyyy") : "—" },
    { label: "Install Date", value: caseData.installDate ? format(new Date(caseData.installDate), "MMM d, yyyy") : "—" },
    { label: "Install Cost", value: caseData.installCost ?? "—" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Case Details</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <dl className="space-y-2">
            {fields.map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800 text-right max-w-xs">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Quick Edit</CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Status</label>
            <Select value={caseData.applicationStatus} onValueChange={v => onPatch({ applicationStatus: v as any })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {APPLICATION_STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Assigned To</label>
            <Select value={caseData.assignedToUserId ?? "unassigned"} onValueChange={v => onPatch({ assignedToUserId: v === "unassigned" ? null : v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.filter(u => u.isActive).map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Rebate Amount</label>
            <Input
              className="h-8 text-sm"
              defaultValue={caseData.rebateAmount ?? ""}
              onBlur={e => { if (e.target.value !== (caseData.rebateAmount ?? "")) onPatch({ rebateAmount: e.target.value || null }); }}
              placeholder="e.g. $4,000"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Notes</label>
            <Textarea
              className="text-sm min-h-[80px] resize-none"
              defaultValue={caseData.notes ?? ""}
              onBlur={e => { if (e.target.value !== (caseData.notes ?? "")) onPatch({ notes: e.target.value || null }); }}
              placeholder="Internal notes..."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shared form save bar ───────────────────────────────────────────────────────

function SaveBar({ onSave, saving, dirty }: { onSave: () => void; saving: boolean; dirty: boolean }) {
  if (!dirty) return null;
  return (
    <div className="flex justify-end pt-3 border-t border-slate-100">
      <Button onClick={onSave} disabled={saving} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
        Save Changes
      </Button>
    </div>
  );
}

// ─── Rebate Request Tab ────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

function RebateRequestSectionHeader({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="bg-[#711419] text-white px-4 py-2.5 rounded-sm mb-4">
      <span className="text-xs font-bold uppercase tracking-wide">{letter}{title ? `. ${title}` : ""}</span>
    </div>
  );
}

function FieldLabel({ code, label, required }: { code: string; label: string; required?: boolean }) {
  return (
    <div className="flex items-baseline gap-1 mb-1">
      <span className="text-sm font-semibold text-slate-800">{code}.</span>
      <span className="text-sm text-slate-700">{label}</span>
      {required && <span className="text-red-500 text-xs ml-0.5">*Required</span>}
    </div>
  );
}

// ─── Shared form layout helpers (used by Rebate Request and Scope tabs) ──────

const fInput = "w-full h-10 px-3 rounded-md bg-white border border-slate-300 text-sm text-slate-800 transition-colors focus:outline-none focus:border-[#711419] focus:ring-2 focus:ring-[#711419]/15 disabled:bg-slate-100 disabled:text-slate-500";
const fLabel = "block text-sm font-medium text-slate-700 mb-1.5";
const fCode = "font-semibold text-slate-900";
const fRow = "grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4";
const fTriplet = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4";

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
      <header className="bg-[#711419] px-4 sm:px-5 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">{title}</h3>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SubGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2">{title}</h4>
      {children}
    </div>
  );
}

function NestedPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-slate-50/60 border border-slate-200 border-l-4 border-l-[#711419] p-4 sm:p-5 space-y-5">
      {children}
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-6 mt-1.5">
      {[{ label: "Yes", val: true }, { label: "No", val: false }].map(o => (
        <label key={String(o.val)} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="radio" checked={value === o.val} onChange={() => onChange(o.val)} className="w-4 h-4 accent-[#711419]" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function RadioRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 mt-1.5">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="radio" checked={value === opt} onChange={() => onChange(opt)} className="w-4 h-4 accent-[#711419]" />
          {opt}
        </label>
      ))}
    </div>
  );
}

function Certify({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 mt-1 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#711419]" />
      <span className="text-sm text-slate-700">{children} <span className="text-red-500 font-medium">*Required</span></span>
    </label>
  );
}

function StickySaveBar({ dirty, saving, onSave, type = "submit" }: { dirty: boolean; saving: boolean; onSave?: () => void; type?: "submit" | "button" }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 left-0 right-0 mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex justify-end shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <Button type={type} onClick={onSave} disabled={saving} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
        Save Changes
      </Button>
    </div>
  );
}

function RebatePhotoUploader({
  caseId,
  photos,
  onInvalidate,
  category,
  label,
  accept = "image/*",
  required = false,
}: {
  caseId: string;
  photos: RebateCaseDocument[];
  onInvalidate: () => void;
  category: RebateDocumentCategory;
  label: string;
  accept?: string;
  required?: boolean;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadOne = async (file: File) => {
    const urlRes = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!urlRes.ok) throw new Error("Failed to get upload URL");
    const { uploadURL, objectPath } = await urlRes.json();
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!putRes.ok) throw new Error("Upload failed");
    const metaRes = await fetch(`/api/crm/rebate-cases/${caseId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: file.name,
        url: uploadURL,
        objectPath,
        category,
        contentType: file.type,
        size: file.size,
      }),
    });
    if (!metaRes.ok) throw new Error("Failed to save document");
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (accept === "image/*" && !f.type.startsWith("image/")) continue;
        await uploadOne(f);
      }
      onInvalidate();
      toast({ title: "Uploaded" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const deletePhoto = async (docId: string) => {
    try {
      await apiRequest("DELETE", `/api/crm/rebate-cases/${caseId}/documents/${docId}`);
      onInvalidate();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const fmtSize = (b?: number | null) => {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-1 text-[#711419]">*Required</span>}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="border-[#711419] text-[#711419] hover:bg-[#711419]/5"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
          {uploading ? "Uploading…" : "Upload Photos"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {photos.length === 0 ? (
        <div className="text-xs text-slate-500 italic">No photos uploaded yet.</div>
      ) : (
        <ul className="divide-y divide-slate-200 bg-white rounded border border-slate-200">
          {photos.map(p => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-[#711419] hover:underline truncate flex-1"
              >
                {p.name}
              </a>
              <span className="text-xs text-slate-500 shrink-0">{fmtSize(p.size)}</span>
              <button
                type="button"
                onClick={() => deletePhoto(p.id)}
                className="text-slate-400 hover:text-red-600 shrink-0"
                aria-label="Delete photo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RebateRequestTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  type FormState = {
    initiatorType: string;
    initiatorCompanyName: string;
    initiatorFirstName: string;
    initiatorLastName: string;
    initiatorPhone: string;
    initiatorEmail: string;
    propertyAddress: string;
    propertyAddressLine2: string;
    propertyCity: string;
    propertyState: string;
    propertyZip: string;
    addressCertified: boolean;
    constructionType: string;
    buildingType: string;
    buildingSubtype: string;
    isRented: boolean | null;
    bedroomCount: number | null;
    sqftRange: string;
  };

  const buildInitial = (d: CaseDetail): FormState => ({
    initiatorType: d.initiatorType ?? "Contractor/Installer",
    initiatorCompanyName: d.initiatorCompanyName ?? "Giesbrecht HVAC",
    initiatorFirstName: d.initiatorFirstName ?? "",
    initiatorLastName: d.initiatorLastName ?? "",
    initiatorPhone: d.initiatorPhone ?? "",
    initiatorEmail: d.initiatorEmail ?? "",
    propertyAddress: d.propertyAddress ?? "",
    propertyAddressLine2: d.propertyAddressLine2 ?? "",
    propertyCity: d.propertyCity ?? "",
    propertyState: d.propertyState ?? "GA",
    propertyZip: d.propertyZip ?? "",
    addressCertified: d.addressCertified ?? false,
    constructionType: d.constructionType ?? "",
    buildingType: d.buildingType ?? "",
    buildingSubtype: d.buildingSubtype ?? "",
    isRented: d.isRented ?? null,
    bedroomCount: d.bedroomCount ?? null,
    sqftRange: d.sqftRange ?? "",
  });

  const [values, setValues] = useState<FormState>(() => buildInitial(caseData));
  const initialRef = useRef<FormState>(values);
  useEffect(() => {
    const fresh = buildInitial(caseData);
    initialRef.current = fresh;
    setValues(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData.id]);
  const initial = initialRef.current;

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const set = <K extends keyof FormState>(key: K, v: FormState[K]) => setValues(prev => ({ ...prev, [key]: v }));

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    onPatch(values as Partial<RebateCase>);
  };

  return (
    <form onSubmit={handleSave} className="max-w-5xl mx-auto pb-24 space-y-5">
      <header>
        <h2 className="text-xl font-semibold text-slate-900 mb-1">A. Rebate Request</h2>
        <p className="text-sm text-slate-500">
          Contractor companies should use this page to fill out information about their organization and their proposed project. All fields are required.
        </p>
      </header>

      <FormCard title="Contractor / Initiator Information">
        <div className="space-y-5">
          <div className={fRow}>
            <div>
              <label className={fLabel}><span className={fCode}>A.1.</span> Who is initiating the energy rebate request?</label>
              <select className={fInput} value={values.initiatorType} onChange={e => set("initiatorType", e.target.value)}>
                <option value="Contractor/Installer">Contractor/Installer</option>
                <option value="Customer/Homeowner">Customer/Homeowner</option>
                <option value="Utility">Utility</option>
              </select>
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>A.2.</span> Company Name Starting the Application</label>
              <select className={fInput} value={values.initiatorCompanyName} onChange={e => set("initiatorCompanyName", e.target.value)}>
                <option value="Giesbrecht HVAC">Giesbrecht HVAC</option>
              </select>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-3"><span className={fCode}>A.3.</span> Primary Initiator Contact Name</p>
            <div className={fRow}>
              <div>
                <label className={fLabel}><span className={fCode}>A.3a.</span> First Name</label>
                <input className={fInput} value={values.initiatorFirstName} onChange={e => set("initiatorFirstName", e.target.value)} />
              </div>
              <div>
                <label className={fLabel}><span className={fCode}>A.3b.</span> Last Name</label>
                <input className={fInput} value={values.initiatorLastName} onChange={e => set("initiatorLastName", e.target.value)} />
              </div>
              <div>
                <label className={fLabel}><span className={fCode}>A.3c.</span> Phone Number</label>
                <input className={fInput} value={values.initiatorPhone} onChange={e => set("initiatorPhone", e.target.value)} />
              </div>
              <div>
                <label className={fLabel}><span className={fCode}>A.3d.</span> Email</label>
                <input type="email" className={fInput} value={values.initiatorEmail} onChange={e => set("initiatorEmail", e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </FormCard>

      <FormCard title="Property and Building Information">
        <div className="space-y-5">
          <div>
            <label className={fLabel}><span className={fCode}>A.4.</span> Project Home Address</label>
            <div className="space-y-2">
              <input className={fInput} placeholder="Address Line 1" value={values.propertyAddress} onChange={e => set("propertyAddress", e.target.value)} />
              <input className={fInput} placeholder="Address Line 2 (optional)" value={values.propertyAddressLine2} onChange={e => set("propertyAddressLine2", e.target.value)} />
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <input className={`${fInput} col-span-3 sm:col-span-3`} placeholder="City" value={values.propertyCity} onChange={e => set("propertyCity", e.target.value)} />
                <select className={`${fInput} col-span-1`} value={values.propertyState} onChange={e => set("propertyState", e.target.value)}>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input className={`${fInput} col-span-2`} placeholder="ZIP" value={values.propertyZip} onChange={e => set("propertyZip", e.target.value)} />
              </div>
            </div>
            <Certify checked={values.addressCertified} onChange={v => set("addressCertified", v)}>
              I certify the above address is complete and correct.
            </Certify>
          </div>

          <div className={fRow}>
            <div>
              <label className={fLabel}><span className={fCode}>A.5.</span> Is the building new or existing construction?</label>
              <select className={fInput} value={values.constructionType} onChange={e => set("constructionType", e.target.value)}>
                <option value="">Select...</option>
                <option value="Existing Construction">Existing Construction</option>
                <option value="New Construction">New Construction</option>
              </select>
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>A.6.</span> What is the building type?</label>
              <select className={fInput} value={values.buildingType} onChange={e => set("buildingType", e.target.value)}>
                <option value="">Select...</option>
                <option value="Single Family">Single Family</option>
                <option value="Multi-Family">Multi-Family</option>
                <option value="Mobile Home">Mobile Home</option>
                <option value="Commercial">Commercial</option>
              </select>
            </div>
          </div>

          {values.buildingType === "Single Family" && (
            <div className="sm:max-w-md">
              <label className={fLabel}><span className={fCode}>A.6a.</span> Single Family Building Type Details</label>
              <select className={fInput} value={values.buildingSubtype} onChange={e => set("buildingSubtype", e.target.value)}>
                <option value="">Select...</option>
                <option value="Single Family Attached">Single Family Attached</option>
                <option value="Single Family Detached">Single Family Detached</option>
                <option value="Townhouse">Townhouse</option>
                <option value="Manufactured Home">Manufactured Home</option>
              </select>
            </div>
          )}

          <div>
            <label className={fLabel}><span className={fCode}>A.7.</span> Is the building rented?</label>
            <YesNo value={values.isRented} onChange={v => set("isRented", v)} />
          </div>

          <div className={fRow}>
            <div>
              <label className={fLabel}><span className={fCode}>A.8.</span> Total Number of Bedrooms</label>
              <input type="number" min={0} className={fInput} value={values.bedroomCount ?? ""} onChange={e => set("bedroomCount", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>A.9.</span> Conditioned square footage of single family home</label>
              <select className={fInput} value={values.sqftRange} onChange={e => set("sqftRange", e.target.value)}>
                <option value="">Select range...</option>
                <option value="500 - 1,500 sq ft">500 – 1,500 sq ft</option>
                <option value="1,501 - 2,500 sq ft">1,501 – 2,500 sq ft</option>
                <option value="2,501 - 3,500 sq ft">2,501 – 3,500 sq ft</option>
                <option value="3,501 - 5,000 sq ft">3,501 – 5,000 sq ft</option>
                <option value="5,001+ sq ft">5,001+ sq ft</option>
              </select>
            </div>
          </div>
        </div>
      </FormCard>

      <StickySaveBar dirty={dirty} saving={saving} type="submit" />
    </form>
  );
}

// ─── Head of Household Tab ─────────────────────────────────────────────────────

function HeadOfHouseholdTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const [confirmed, setConfirmed] = useState<boolean>(caseData.hohConfirmed ?? false);
  const [confirmedDate, setConfirmedDate] = useState<string>(caseData.hohConfirmedDate ?? "");
  const [notes, setNotes] = useState<string>(caseData.hohNotes ?? "");
  useEffect(() => {
    setConfirmed(caseData.hohConfirmed ?? false);
    setConfirmedDate(caseData.hohConfirmedDate ?? "");
    setNotes(caseData.hohNotes ?? "");
  }, [caseData.id]);

  const savedState = { confirmed: caseData.hohConfirmed ?? false, confirmedDate: caseData.hohConfirmedDate ?? "", notes: caseData.hohNotes ?? "" };
  const dirty = confirmed !== savedState.confirmed || confirmedDate !== savedState.confirmedDate || notes !== savedState.notes;

  const handleConfirmToggle = (checked: boolean) => {
    setConfirmed(checked);
    if (checked && !confirmedDate) setConfirmedDate(new Date().toISOString().split("T")[0]);
    if (!checked) setConfirmedDate("");
  };

  const handleSave = () => onPatch({ hohConfirmed: confirmed, hohConfirmedDate: confirmedDate || null, hohNotes: notes || null } as any);

  const homeownerName = [caseData.clientFirstName, caseData.clientLastName].filter(Boolean).join(" ") || "Homeowner";

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-1">B. Head of Household Confirmation</h2>
        <p className="text-sm text-slate-500">
          This section tracks whether the homeowner has completed and signed their confirmation. No data entry from us — mark it confirmed once the homeowner has submitted their portion.
        </p>
      </header>

      {/* Status Banner */}
      <div className={`flex items-center gap-3 rounded-lg px-5 py-4 mb-6 border ${confirmed ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${confirmed ? "bg-green-100" : "bg-amber-100"}`}>
          {confirmed
            ? <CheckCircle2 className="w-5 h-5 text-green-600" />
            : <Clock className="w-5 h-5 text-amber-500" />}
        </div>
        <div>
          <p className={`text-sm font-semibold ${confirmed ? "text-green-800" : "text-amber-800"}`}>
            {confirmed ? "Confirmation Received" : "Awaiting Homeowner Confirmation"}
          </p>
          <p className={`text-xs mt-0.5 ${confirmed ? "text-green-600" : "text-amber-600"}`}>
            {confirmed
              ? `${homeownerName} has confirmed their household information${confirmedDate ? ` on ${confirmedDate}` : ""}.`
              : `Waiting for ${homeownerName} to complete and submit their confirmation.`}
          </p>
        </div>
      </div>

      {/* Confirmation Toggle */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => handleConfirmToggle(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-[#711419] cursor-pointer"
          />
          <div>
            <p className="text-sm font-semibold text-slate-800">Homeowner confirmation received</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Check this once the homeowner has completed and returned their signed Head of Household confirmation form.
            </p>
          </div>
        </label>

        {confirmed && (
          <div className="mt-4 ml-8">
            <label className="block text-sm text-slate-700 mb-1 font-medium">Date confirmed</label>
            <input
              type="date"
              value={confirmedDate}
              onChange={e => setConfirmedDate(e.target.value)}
              className="h-9 px-3 rounded-md bg-slate-50 border border-slate-300 text-sm text-slate-800 focus:outline-none focus:border-[#711419] focus:ring-1 focus:ring-[#711419]/30"
            />
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <label className="block text-sm font-semibold text-slate-800 mb-2">Notes</label>
        <textarea
          rows={4}
          placeholder="Any notes about the homeowner confirmation process…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-slate-50 border border-slate-300 text-sm text-slate-800 resize-none focus:outline-none focus:border-[#711419] focus:ring-1 focus:ring-[#711419]/30"
        />
      </div>

      {dirty && (
        <div className="sticky bottom-0 left-0 right-0 mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex justify-end shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
          <Button onClick={handleSave} disabled={saving} size="sm" className="bg-[#711419] hover:bg-[#5a1014]">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Contractor Pre-Approval Tab ───────────────────────────────────────────────

function ContractorPreApprovalTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const form = useForm({
    defaultValues: {
      contractorName: caseData.contractorName ?? "",
      contractorLicenseNumber: caseData.contractorLicenseNumber ?? "",
      preApprovalStatus: caseData.preApprovalStatus ?? "",
      preApprovalSubmittedDate: caseData.preApprovalSubmittedDate ? format(new Date(caseData.preApprovalSubmittedDate), "yyyy-MM-dd") : "",
      preApprovalApprovedDate: caseData.preApprovalApprovedDate ? format(new Date(caseData.preApprovalApprovedDate), "yyyy-MM-dd") : "",
      preApprovalNotes: caseData.preApprovalNotes ?? "",
      existingHeatingType: caseData.existingHeatingType ?? "",
      existingHeatingAge: caseData.existingHeatingAge ?? "",
      existingCoolingType: caseData.existingCoolingType ?? "",
      existingCoolingAge: caseData.existingCoolingAge ?? "",
      existingWaterHeaterType: caseData.existingWaterHeaterType ?? "",
      existingWaterHeaterAge: caseData.existingWaterHeaterAge ?? "",
    },
  });
  const onSubmit = (v: any) => {
    const cleaned: any = { ...v };
    ["existingHeatingAge","existingCoolingAge","existingWaterHeaterAge"].forEach(k => {
      cleaned[k] = v[k] ? Number(v[k]) : null;
    });
    onPatch(cleaned);
  };
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Contractor Information</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { name: "contractorName", label: "Contractor / Company Name" },
                { name: "contractorLicenseNumber", label: "License Number" },
              ].map(({ name, label }) => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                    <FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              ))}
              <Separator />
              <FormField control={form.control} name="preApprovalStatus" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Pre-Approval Status</FormLabel>
                  <FormControl>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select status…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_submitted">Not Submitted</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="denied">Denied</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )} />
              {[
                { name: "preApprovalSubmittedDate", label: "Submission Date" },
                { name: "preApprovalApprovedDate", label: "Approval Date" },
              ].map(({ name, label }) => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                    <FormControl><Input className="h-8 text-sm" type="date" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              ))}
              <FormField control={form.control} name="preApprovalNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Notes</FormLabel>
                  <FormControl>
                    <Textarea className="text-sm min-h-[80px] resize-none" placeholder="Pre-approval package notes…" {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Existing Equipment (for approval package)</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { name: "existingHeatingType", label: "Heating Type", type: "text" },
                { name: "existingHeatingAge", label: "Heating Age (years)", type: "number" },
                { name: "existingCoolingType", label: "Cooling Type", type: "text" },
                { name: "existingCoolingAge", label: "Cooling Age (years)", type: "number" },
                { name: "existingWaterHeaterType", label: "Water Heater Type", type: "text" },
                { name: "existingWaterHeaterAge", label: "Water Heater Age (years)", type: "number" },
              ].map(({ name, label, type }) => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                    <FormControl><Input className="h-8 text-sm" type={type} {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="mt-3">
          <SaveBar onSave={form.handleSubmit(onSubmit)} saving={saving} dirty={form.formState.isDirty} />
        </div>
      </form>
    </Form>
  );
}

// ─── Project Completion Tab ─────────────────────────────────────────────────────

function ProjectCompletionTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const form = useForm({
    defaultValues: {
      installDate: caseData.installDate ? format(new Date(caseData.installDate), "yyyy-MM-dd") : "",
      installCompletedDate: caseData.installCompletedDate ? format(new Date(caseData.installCompletedDate), "yyyy-MM-dd") : "",
      installCost: caseData.installCost ?? "",
      completionNotes: caseData.completionNotes ?? "",
      newHeatingType: caseData.newHeatingType ?? "",
      newHeatingBrand: caseData.newHeatingBrand ?? "",
      newHeatingModel: caseData.newHeatingModel ?? "",
      newHeatingSerial: caseData.newHeatingSerial ?? "",
      newHeatingSeer: caseData.newHeatingSeer ?? "",
      newHeatingHspf: caseData.newHeatingHspf ?? "",
      newCoolingType: caseData.newCoolingType ?? "",
      newCoolingBrand: caseData.newCoolingBrand ?? "",
      newCoolingModel: caseData.newCoolingModel ?? "",
      newCoolingSerial: caseData.newCoolingSerial ?? "",
      newWaterHeaterType: caseData.newWaterHeaterType ?? "",
      newWaterHeaterBrand: caseData.newWaterHeaterBrand ?? "",
      newWaterHeaterModel: caseData.newWaterHeaterModel ?? "",
    },
  });
  const onSubmit = (v: any) => onPatch(v);
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Installation Details</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-3">
                {[
                  { name: "installDate", label: "Installation Date", type: "date" },
                  { name: "installCompletedDate", label: "Completion Date", type: "date" },
                  { name: "installCost", label: "Installation Cost", type: "text" },
                ].map(({ name, label, type }) => (
                  <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                      <FormControl>
                        <Input className="h-8 text-sm" type={type} placeholder={type === "text" ? "e.g. $12,500" : undefined} {...field} value={field.value ?? ""} />
                      </FormControl>
                    </FormItem>
                  )} />
                ))}
                <FormField control={form.control} name="completionNotes" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">Completion Notes</FormLabel>
                    <FormControl>
                      <Textarea className="text-sm min-h-[80px] resize-none" placeholder="Notes about project completion…" {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )} />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">New Heating Equipment</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-3">
                {[
                  { name: "newHeatingType", label: "Type" },
                  { name: "newHeatingBrand", label: "Brand" },
                  { name: "newHeatingModel", label: "Model" },
                  { name: "newHeatingSerial", label: "Serial #" },
                  { name: "newHeatingSeer", label: "SEER Rating" },
                  { name: "newHeatingHspf", label: "HSPF Rating" },
                ].map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                      <FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">New Cooling Equipment</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-3">
                {[
                  { name: "newCoolingType", label: "Type" },
                  { name: "newCoolingBrand", label: "Brand" },
                  { name: "newCoolingModel", label: "Model" },
                  { name: "newCoolingSerial", label: "Serial #" },
                ].map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                      <FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">New Water Heater</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-3">
                {[
                  { name: "newWaterHeaterType", label: "Type" },
                  { name: "newWaterHeaterBrand", label: "Brand" },
                  { name: "newWaterHeaterModel", label: "Model" },
                ].map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                      <FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
        <div className="mt-3">
          <SaveBar onSave={form.handleSubmit(onSubmit)} saving={saving} dirty={form.formState.isDirty} />
        </div>
      </form>
    </Form>
  );
}

// ─── Scope of Work Tab ──────────────────────────────────────────────────────────

function ScopeTab({ caseData, caseId, onPatch, saving, onInvalidate }: {
  caseData: CaseDetail; caseId: string; onPatch: (d: Partial<RebateCase>) => void; saving: boolean; onInvalidate: () => void;
}) {
  const { toast } = useToast();

  type ScopeForm = {
    scopeCounty: string;
    scopeExpectedCompletionDate: string;
    scopeIsDiy: boolean | null;
    scopeAssociatedHerApp: boolean | null;
    scopeAssociatedDiyApp: boolean | null;
    electricUtilityType: string;
    electricMunicipalProvider: string;
    electricCompanyName: string;
    electricMeterNumber: string;
    electricAccountNumber: string;
    electricAccountCertified: boolean;
    hasGas: boolean | null;
    gasCertifiedNoGas: boolean;
    gasProviderType: string;
    gasLocalDistCompany: string;
    gasCompanyName: string;
    gasMeterNumber: string;
    gasAccountNumberScope: string;
    gasAccountCertified: boolean;
    hasDeliveredFuel: boolean | null;
    deliveredFuelCompany: string;
    // C.6–C.9 appliances
    scopeIncludesStove: boolean;
    scopeIncludesDryer: boolean;
    scopeIncludesWaterHeater: boolean;
    scopeIncludesHeatPump: boolean;
    // Heat pump sub-questions
    hpRebateRecipient: string;
    hpType: string;
    hpDucted: string;
    hpPrimarySource: boolean | null;
    hpExistingDistributionType: string;
    hpEnergyStarColdClimate: string;
    hpHeatingLoadPercent: string;
    hpHeatingCapacityBtu: string;
    hpCoolingCapacityBtu: string;
    hpMake: string;
    hpModel: string;
    hpExternalRebates: boolean | null;
    hpMaterialCost: string;
    hpInstallCost: string;
    hpFuelSwitching: boolean | null;
    // Limited assessment
    assessmentDate: string;
    assessmentYearBuilt: string;
    ceilingInsulationKnown: boolean | null;
    ceilingInsulationRValue: string;
    ceilingInsulationType: string;
    ductsInsulated: string;
    ductsSealed: string;
    envelopeAirSealed: string;
    ventilationCfmKnown: boolean | null;
    ventilationCfm: string;
    ventilationSystemType: string;
    coolingSystemType: string;
    // Cooling Systems
    coolingEfficiencyKnown: boolean | null;
    coolingEfficiencySeer: string;
    coolingFloorAreaKnown: boolean | null;
    coolingFloorAreaPct: string;
    // Heating System
    heatingSystemFuelType: string;
    heatingEfficiencyKnown: boolean | null;
    heatingHspf: string;
    heatingAfue: string;
    heatingFloorAreaKnown: boolean | null;
    heatingFloorAreaPct: string;
    electricalPanelAmps: string;
    // Electrical Upgrades
    scopeIncludesPanel: boolean;
    scopeIncludesWiring: boolean;
    wiringExternalRebates: boolean | null;
    wiringMaterialCost: string;
    wiringInstallCost: string;
    // Insulation
    scopeIncludesInsulation: boolean | null;
    // Financials
    totalExternalRebate: string;
    totalEstimatedProjectCost: string;
    estimatedRebate50Pct: string;
    estimatedRebate100Pct: string;
    scopeSummary: string;
    installCost: string;
  };

  const buildInitial = (d: CaseDetail): ScopeForm => ({
    scopeCounty: d.scopeCounty ?? "",
    scopeExpectedCompletionDate: d.scopeExpectedCompletionDate ?? "",
    scopeIsDiy: d.scopeIsDiy ?? null,
    scopeAssociatedHerApp: d.scopeAssociatedHerApp ?? null,
    scopeAssociatedDiyApp: d.scopeAssociatedDiyApp ?? null,
    electricUtilityType: d.electricUtilityType ?? "",
    electricMunicipalProvider: d.electricMunicipalProvider ?? "",
    electricCompanyName: d.electricCompanyName ?? "",
    electricMeterNumber: d.electricMeterNumber ?? "",
    electricAccountNumber: d.electricAccountNumber ?? "",
    electricAccountCertified: d.electricAccountCertified ?? false,
    hasGas: d.hasGas ?? null,
    gasCertifiedNoGas: d.gasCertifiedNoGas ?? false,
    gasProviderType: d.gasProviderType ?? "",
    gasLocalDistCompany: d.gasLocalDistCompany ?? "",
    gasCompanyName: d.gasCompanyName ?? "",
    gasMeterNumber: d.gasMeterNumber ?? "",
    gasAccountNumberScope: d.gasAccountNumberScope ?? "",
    gasAccountCertified: d.gasAccountCertified ?? false,
    hasDeliveredFuel: d.hasDeliveredFuel ?? null,
    deliveredFuelCompany: d.deliveredFuelCompany ?? "",
    scopeIncludesStove: d.scopeIncludesStove ?? false,
    scopeIncludesDryer: d.scopeIncludesDryer ?? false,
    scopeIncludesWaterHeater: d.scopeIncludesWaterHeater ?? false,
    scopeIncludesHeatPump: d.scopeIncludesHeatPump ?? false,
    hpRebateRecipient: d.hpRebateRecipient ?? "",
    hpType: d.hpType ?? "",
    hpDucted: d.hpDucted ?? "",
    hpPrimarySource: d.hpPrimarySource ?? null,
    hpExistingDistributionType: d.hpExistingDistributionType ?? "",
    hpEnergyStarColdClimate: d.hpEnergyStarColdClimate ?? "",
    hpHeatingLoadPercent: d.hpHeatingLoadPercent ?? "",
    hpHeatingCapacityBtu: d.hpHeatingCapacityBtu ?? "",
    hpCoolingCapacityBtu: d.hpCoolingCapacityBtu ?? "",
    hpMake: d.hpMake ?? "",
    hpModel: d.hpModel ?? "",
    hpExternalRebates: d.hpExternalRebates ?? null,
    hpMaterialCost: d.hpMaterialCost ?? "",
    hpInstallCost: d.hpInstallCost ?? "",
    hpFuelSwitching: d.hpFuelSwitching ?? null,
    assessmentDate: d.assessmentDate ?? "",
    assessmentYearBuilt: d.assessmentYearBuilt ?? "",
    ceilingInsulationKnown: d.ceilingInsulationKnown ?? null,
    ceilingInsulationRValue: d.ceilingInsulationRValue ?? "",
    ceilingInsulationType: d.ceilingInsulationType ?? "",
    ductsInsulated: d.ductsInsulated ?? "",
    ductsSealed: d.ductsSealed ?? "",
    envelopeAirSealed: d.envelopeAirSealed ?? "",
    ventilationCfmKnown: d.ventilationCfmKnown ?? null,
    ventilationCfm: d.ventilationCfm ?? "",
    ventilationSystemType: d.ventilationSystemType ?? "",
    coolingSystemType: d.coolingSystemType ?? "",
    coolingEfficiencyKnown: d.coolingEfficiencyKnown ?? null,
    coolingEfficiencySeer: d.coolingEfficiencySeer ?? "",
    coolingFloorAreaKnown: d.coolingFloorAreaKnown ?? null,
    coolingFloorAreaPct: d.coolingFloorAreaPct ?? "",
    heatingSystemFuelType: d.heatingSystemFuelType ?? "",
    heatingEfficiencyKnown: d.heatingEfficiencyKnown ?? null,
    heatingHspf: d.heatingHspf ?? "",
    heatingAfue: d.heatingAfue ?? "",
    heatingFloorAreaKnown: d.heatingFloorAreaKnown ?? null,
    heatingFloorAreaPct: d.heatingFloorAreaPct ?? "",
    electricalPanelAmps: d.electricalPanelAmps ?? "",
    scopeIncludesPanel: d.scopeIncludesPanel ?? false,
    scopeIncludesWiring: d.scopeIncludesWiring ?? false,
    wiringExternalRebates: d.wiringExternalRebates ?? null,
    wiringMaterialCost: d.wiringMaterialCost ?? "",
    wiringInstallCost: d.wiringInstallCost ?? "",
    scopeIncludesInsulation: d.scopeIncludesInsulation ?? null,
    totalExternalRebate: d.totalExternalRebate ?? "",
    totalEstimatedProjectCost: d.totalEstimatedProjectCost ?? "",
    estimatedRebate50Pct: d.estimatedRebate50Pct ?? "",
    estimatedRebate100Pct: d.estimatedRebate100Pct ?? "",
    scopeSummary: d.scopeSummary ?? "",
    installCost: d.installCost ?? "",
  });

  const [vals, setVals] = useState<ScopeForm>(() => buildInitial(caseData));
  const savedRef = useRef<ScopeForm>(vals);
  useEffect(() => {
    const f = buildInitial(caseData);
    savedRef.current = f;
    setVals(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData.id]);

  const dirty = JSON.stringify(vals) !== JSON.stringify(savedRef.current);
  const set = <K extends keyof ScopeForm>(k: K, v: ScopeForm[K]) => setVals(p => ({ ...p, [k]: v }));

  const toggleItem = useMutation({
    mutationFn: ({ itemId, isChecked }: { itemId: string; isChecked: boolean }) =>
      apiRequest("PATCH", `/api/crm/rebate-cases/${caseId}/scope-items/${itemId}`, { isChecked }),
    onSuccess: onInvalidate,
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });

  const checkedItems = (caseData.scopeChecklist ?? []).filter(i => i.isChecked);
  const allItems = [...(caseData.scopeChecklist ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const RadioGroup = ({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) => (
    <div className="flex gap-5 mt-1">
      {[{ label: "Yes", val: true }, { label: "No", val: false }].map(o => (
        <label key={String(o.val)} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
          <input type="radio" checked={value === o.val} onChange={() => onChange(o.val)} className="accent-[#711419]" />
          {o.label}
        </label>
      ))}
    </div>
  );

  const GA_COUNTIES = ["Appling","Atkinson","Bacon","Baker","Baldwin","Banks","Barrow","Bartow","Ben Hill","Berrien","Bibb","Bleckley","Brantley","Brooks","Bryan","Bulloch","Burke","Butts","Calhoun","Camden","Candler","Carroll","Catoosa","Charlton","Chatham","Chattahoochee","Chattooga","Cherokee","Clarke","Clay","Clayton","Clinch","Cobb","Coffee","Colquitt","Columbia","Cook","Coweta","Crawford","Crisp","Dade","Dawson","Decatur","DeKalb","Dodge","Dooly","Dougherty","Douglas","Early","Echols","Effingham","Elbert","Emanuel","Evans","Fannin","Fayette","Floyd","Forsyth","Franklin","Fulton","Gilmer","Glascock","Glynn","Gordon","Grady","Greene","Gwinnett","Habersham","Hall","Hancock","Haralson","Harris","Hart","Heard","Henry","Houston","Irwin","Jackson","Jasper","Jeff Davis","Jefferson","Jenkins","Johnson","Jones","Lamar","Lanier","Laurens","Lee","Liberty","Lincoln","Long","Lowndes","Lumpkin","Macon","Madison","Marion","McDuffie","McIntosh","Meriwether","Miller","Mitchell","Monroe","Montgomery","Morgan","Murray","Muscogee","Newton","Oconee","Oglethorpe","Paulding","Peach","Pickens","Pierce","Pike","Polk","Pulaski","Putnam","Quitman","Rabun","Randolph","Richmond","Rockdale","Schley","Screven","Seminole","Spalding","Stephens","Stewart","Sumter","Talbot","Taliaferro","Tattnall","Taylor","Telfair","Terrell","Thomas","Tift","Toombs","Towns","Treutlen","Troup","Turner","Twiggs","Union","Upson","Walker","Walton","Ware","Warren","Washington","Wayne","Webster","Wheeler","White","Whitfield","Wilcox","Wilkes","Wilkinson","Worth"];

  return (
    <div className="max-w-5xl mx-auto pb-24 space-y-5">
      <header>
        <h2 className="text-xl font-semibold text-slate-900 mb-1">C. Scope of Work</h2>
        <p className="text-sm text-slate-500">
          Fill out the scope of work for the project. Upload the ENERGY STAR or AHRI Certificate for all appliance upgrades.
        </p>
        {caseData.constructionType && (
          <div className="mt-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
            <span className="font-medium text-slate-700">Construction Type (from Section A):</span> {caseData.constructionType}
          </div>
        )}
      </header>

      <FormCard title="Project Information">
        <div className="space-y-5">
          <div className={fRow}>
            <div>
              <label className={fLabel}><span className={fCode}>County</span></label>
              <select className={fInput} value={vals.scopeCounty} onChange={e => set("scopeCounty", e.target.value)}>
                <option value="">Select county…</option>
                {GA_COUNTIES.map(c => <option key={c} value={c}>{c} County</option>)}
              </select>
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>C.1.</span> Expected completion date</label>
              <input type="date" className={fInput} value={vals.scopeExpectedCompletionDate} onChange={e => set("scopeExpectedCompletionDate", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={fLabel}><span className={fCode}>C.2.</span> Is this a DIY (homeowner/tenant) rebate?</label>
            <RadioGroup value={vals.scopeIsDiy} onChange={v => set("scopeIsDiy", v)} />
          </div>
          <div className={fRow}>
            <div>
              <label className={fLabel}>Is this project associated with another HER application at this address?</label>
              <RadioGroup value={vals.scopeAssociatedHerApp} onChange={v => set("scopeAssociatedHerApp", v)} />
            </div>
            <div>
              <label className={fLabel}>Is this project associated with another DIY application at this address?</label>
              <RadioGroup value={vals.scopeAssociatedDiyApp} onChange={v => set("scopeAssociatedDiyApp", v)} />
            </div>
          </div>
        </div>
      </FormCard>

      <FormCard title="Utility Information">
        <div className="space-y-6">
          <SubGroup title="Electric Information">
            <div>
              <label className={fLabel}><span className={fCode}>C.3.</span> Type of Electric Utility Provider</label>
              <select className={fInput} value={vals.electricUtilityType} onChange={e => set("electricUtilityType", e.target.value)}>
                <option value="">Select…</option>
                <option value="Municipal Utility">Municipal Utility</option>
                <option value="Electric Membership Cooperative">Electric Membership Cooperative</option>
                <option value="Investor-Owned Utility">Investor-Owned Utility</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {vals.electricUtilityType === "Municipal Utility" && (
              <div>
                <label className={fLabel}><span className={fCode}>C.3b.</span> Municipal Utility Provider</label>
                <select className={fInput} value={vals.electricMunicipalProvider} onChange={e => set("electricMunicipalProvider", e.target.value)}>
                  <option value="">Select…</option>
                  <option value="Other">Other</option>
                  <option value="Georgia Power">Georgia Power</option>
                  <option value="Snapping Shoals EMC">Snapping Shoals EMC</option>
                </select>
              </div>
            )}
            <div>
              <label className={fLabel}>Electric Utility Company Name</label>
              <input className={fInput} value={vals.electricCompanyName} onChange={e => set("electricCompanyName", e.target.value)} placeholder="e.g. Georgia Power" />
            </div>
            <div className={fRow}>
              <div>
                <label className={fLabel}><span className={fCode}>C.3b.</span> Meter Number <span className="font-normal text-slate-400 text-xs">(20 char limit)</span></label>
                <input className={fInput} maxLength={20} value={vals.electricMeterNumber} onChange={e => set("electricMeterNumber", e.target.value)} />
              </div>
              <div>
                <label className={fLabel}><span className={fCode}>C.3c.</span> Account Number <span className="font-normal text-slate-400 text-xs">(20 char limit)</span></label>
                <input className={fInput} maxLength={20} value={vals.electricAccountNumber} onChange={e => set("electricAccountNumber", e.target.value)} />
              </div>
            </div>
            <Certify checked={vals.electricAccountCertified} onChange={v => set("electricAccountCertified", v)}>
              I certify the above account and meter numbers are correct.
            </Certify>
          </SubGroup>

          <SubGroup title="Gas Utility Information">
            <div>
              <label className={fLabel}><span className={fCode}>C.4.</span> Do you have gas as a utility?</label>
              <RadioGroup value={vals.hasGas} onChange={v => set("hasGas", v)} />
            </div>
            {vals.hasGas === false && (
              <Certify checked={vals.gasCertifiedNoGas} onChange={v => set("gasCertifiedNoGas", v)}>
                I certify that I DO NOT have a gas utility or bill.
              </Certify>
            )}
            {vals.hasGas === true && (
              <NestedPanel>
                <div>
                  <label className={fLabel}><span className={fCode}>C.4a.</span> Type of Gas Utility Provider</label>
                  <select
                    className={fInput}
                    value={vals.gasProviderType}
                    onChange={e => set("gasProviderType", e.target.value)}
                  >
                    <option value="">Select…</option>
                    <option value="Local Distribution">Local Distribution</option>
                    <option value="Natural Gas Marketer">Natural Gas Marketer</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                {vals.gasProviderType === "Local Distribution" && (
                  <div>
                    <label className={fLabel}><span className={fCode}>C.4b.</span> Local Distribution Natural Gas Company</label>
                    <select
                      className={fInput}
                      value={vals.gasLocalDistCompany}
                      onChange={e => set("gasLocalDistCompany", e.target.value)}
                    >
                      <option value="">Select…</option>
                      <option value="Atlanta Gas Light Company">Atlanta Gas Light Company</option>
                      <option value="Liberty Utilities">Liberty Utilities</option>
                      <option value="Municipal Gas Authority of Georgia">Municipal Gas Authority of Georgia</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className={fLabel}>Natural gas utility company name</label>
                  <input className={fInput} value={vals.gasCompanyName} onChange={e => set("gasCompanyName", e.target.value)} />
                </div>
                <div className={fRow}>
                  <div>
                    <label className={fLabel}>Meter Number</label>
                    <input className={fInput} maxLength={20} value={vals.gasMeterNumber} onChange={e => set("gasMeterNumber", e.target.value)} />
                  </div>
                  <div>
                    <label className={fLabel}>Account Number</label>
                    <input className={fInput} maxLength={20} value={vals.gasAccountNumberScope} onChange={e => set("gasAccountNumberScope", e.target.value)} />
                  </div>
                </div>
                <Certify checked={vals.gasAccountCertified} onChange={v => set("gasAccountCertified", v)}>
                  I certify the above gas account and meter numbers are correct.
                </Certify>
              </NestedPanel>
            )}
          </SubGroup>

          <SubGroup title="Delivered Fuel Company Information">
            <div>
              <label className={fLabel}><span className={fCode}>C.5.</span> Do you have a delivered fuel company?</label>
              <RadioGroup value={vals.hasDeliveredFuel} onChange={v => set("hasDeliveredFuel", v)} />
            </div>
            {vals.hasDeliveredFuel === true && (
              <div>
                <label className={fLabel}>Delivered Fuel Company Name</label>
                <input className={fInput} value={vals.deliveredFuelCompany} onChange={e => set("deliveredFuelCompany", e.target.value)} />
              </div>
            )}
          </SubGroup>
        </div>
      </FormCard>

      <FormCard title="Project Details — Appliances">
        <div className="space-y-5">
          <div className={fRow}>
            <div>
              <label className={fLabel}><span className={fCode}>C.6.</span> Will the upgrades include an electric <strong>stove/cooktop/range/oven</strong>?</label>
              <RadioGroup value={vals.scopeIncludesStove ? true : vals.scopeIncludesStove === false ? false : null} onChange={v => set("scopeIncludesStove", v)} />
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>C.7.</span> Will the upgrades include a <strong>heat pump clothes dryer</strong>?</label>
              <RadioGroup value={vals.scopeIncludesDryer ? true : vals.scopeIncludesDryer === false ? false : null} onChange={v => set("scopeIncludesDryer", v)} />
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>C.8.</span> Will the upgrades include a <strong>heat pump water heater</strong>?</label>
              <RadioGroup value={vals.scopeIncludesWaterHeater ? true : vals.scopeIncludesWaterHeater === false ? false : null} onChange={v => set("scopeIncludesWaterHeater", v)} />
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>C.9.</span> Will the upgrades include a <strong>heat pump for space heating or cooling</strong>?</label>
              <RadioGroup value={vals.scopeIncludesHeatPump ? true : vals.scopeIncludesHeatPump === false ? false : null} onChange={v => set("scopeIncludesHeatPump", v)} />
            </div>
          </div>

          {vals.scopeIncludesHeatPump && (
            <NestedPanel>
              <div className={fRow}>
                <div>
                  <label className={fLabel}>Who will be receiving the rebate on this measure?</label>
                  <RadioRow options={["Contractor", "Distributor"]} value={vals.hpRebateRecipient} onChange={v => set("hpRebateRecipient", v)} />
                </div>
                <div>
                  <label className={fLabel}>Will the new heat pump for space heating and cooling be ducted or non-ducted?</label>
                  <RadioRow options={["Ducted", "Non-Ducted"]} value={vals.hpDucted} onChange={v => set("hpDucted", v)} />
                </div>
              </div>

              <div className={fRow}>
                <div>
                  <label className={fLabel}><span className={fCode}>a.</span> What type of heat pump will be installed?</label>
                  <select className={fInput} value={vals.hpType} onChange={e => set("hpType", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Central system with backup">Central system with backup</option>
                    <option value="Central system without backup">Central system without backup</option>
                    <option value="Mini-split">Mini-split</option>
                    <option value="Ground source heat pump">Ground source heat pump</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={fLabel}><span className={fCode}>b.</span> Primary heating and cooling distribution type of the existing system</label>
                  <select className={fInput} value={vals.hpExistingDistributionType} onChange={e => set("hpExistingDistributionType", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="None">None</option>
                    <option value="Forced air (ducts)">Forced air (ducts)</option>
                    <option value="Hydronic (radiators/baseboards)">Hydronic (radiators/baseboards)</option>
                    <option value="Radiant floor">Radiant floor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className={fRow}>
                <div>
                  <label className={fLabel}>Will the heat pump system serve as the primary heating and cooling source?</label>
                  <RadioGroup value={vals.hpPrimarySource} onChange={v => set("hpPrimarySource", v)} />
                </div>
                <div>
                  <label className={fLabel}><span className={fCode}>c.</span> Does the new heat pump meet ENERGY STAR™ requirements for cold climate heat pumps?</label>
                  <select className={fInput} value={vals.hpEnergyStarColdClimate} onChange={e => set("hpEnergyStarColdClimate", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div className={`${fTriplet} items-end`}>
                <div className="flex flex-col">
                  <label className={`${fLabel} min-h-10`}><span className={fCode}>d.</span> Heating load this system covers <span className="text-slate-400 font-normal">(choose closest)</span></label>
                  <div className="flex items-center gap-2">
                    <input className={fInput} placeholder="100" value={vals.hpHeatingLoadPercent} onChange={e => set("hpHeatingLoadPercent", e.target.value)} />
                    <span className="text-sm text-slate-500 flex-shrink-0">%</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className={`${fLabel} min-h-10`}><span className={fCode}>e.</span> Heating capacity <span className="text-slate-400 font-normal">(BTU/hr)</span></label>
                  <input className={fInput} placeholder="e.g. 20043" value={vals.hpHeatingCapacityBtu} onChange={e => set("hpHeatingCapacityBtu", e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={`${fLabel} min-h-10`}><span className={fCode}>f.</span> Cooling capacity <span className="text-slate-400 font-normal">(BTU/hr)</span></label>
                  <input className={fInput} placeholder="e.g. 32000" value={vals.hpCoolingCapacityBtu} onChange={e => set("hpCoolingCapacityBtu", e.target.value)} />
                </div>
              </div>

              <div className={fRow}>
                <div>
                  <label className={fLabel}>Make</label>
                  <input className={fInput} placeholder="e.g. Trane" value={vals.hpMake} onChange={e => set("hpMake", e.target.value)} />
                </div>
                <div>
                  <label className={fLabel}>Model</label>
                  <input className={fInput} placeholder="e.g. 5TWR7036A1000" value={vals.hpModel} onChange={e => set("hpModel", e.target.value)} />
                </div>
              </div>

              <div className={fRow}>
                <div>
                  <label className={fLabel}><span className={fCode}>g.</span> Are there any External Rebates (i.e. GA Power, WAP, etc.) that will apply to this measure's installation?</label>
                  <RadioGroup value={vals.hpExternalRebates} onChange={v => set("hpExternalRebates", v)} />
                </div>
                <div>
                  <label className={fLabel}>Will the upgrades include fuel-switching?</label>
                  <RadioGroup value={vals.hpFuelSwitching} onChange={v => set("hpFuelSwitching", v)} />
                </div>
              </div>

              <div className={`${fTriplet} items-end`}>
                <div className="flex flex-col">
                  <label className={`${fLabel} min-h-10`}>Estimated HVAC Heat Pump Material Costs</label>
                  <input className={fInput} placeholder="$ 0.00" value={vals.hpMaterialCost} onChange={e => set("hpMaterialCost", e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={`${fLabel} min-h-10`}>Estimated HVAC Heat Pump Install Costs</label>
                  <input className={fInput} placeholder="$ 0.00" value={vals.hpInstallCost} onChange={e => set("hpInstallCost", e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className={`${fLabel} min-h-10`}>Estimated HVAC Heat Pump Total Cost</label>
                  <input
                    className={`${fInput} bg-slate-100 text-slate-500`}
                    readOnly
                    value={
                      vals.hpMaterialCost && vals.hpInstallCost
                        ? `$ ${(parseFloat(vals.hpMaterialCost.replace(/[^0-9.]/g, "")) + parseFloat(vals.hpInstallCost.replace(/[^0-9.]/g, ""))).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : ""
                    }
                    placeholder="Auto-calculated"
                  />
                </div>
              </div>

              <RebatePhotoUploader
                caseId={caseId}
                photos={(caseData.documents ?? []).filter(d => d.category === "scope_of_work" && (d.contentType ?? "").startsWith("image/"))}
                onInvalidate={onInvalidate}
                category="scope_of_work"
                label="Upload geotagged photo(s) of heat pump for space heating and cooling pre-retrofit"
              />

              {caseData.constructionType && (
                <div className="sm:max-w-md">
                  <label className={fLabel}>Construction Type</label>
                  <div className={`${fInput} bg-slate-100 text-slate-600 flex items-center`}>
                    {caseData.constructionType}
                  </div>
                </div>
              )}

            </NestedPanel>
          )}
        </div>
      </FormCard>

      {caseData.constructionType === "Existing Construction" && vals.scopeIncludesHeatPump && (
        <FormCard title="Limited Assessment">
          <div className="space-y-5">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              Existing Constructions require a limited assessment for heat pumps. Please complete the limited assessment questions below.
            </div>

            <div className={fRow}>
              <div>
                <label className={fLabel}>Assessment Date</label>
                <input type="date" className={fInput} value={vals.assessmentDate} onChange={e => set("assessmentDate", e.target.value)} />
              </div>
              <div>
                <label className={fLabel}>What year was the home built?</label>
                <input className={fInput} placeholder="e.g. 1971" value={vals.assessmentYearBuilt} onChange={e => set("assessmentYearBuilt", e.target.value)} />
              </div>
            </div>

            <div>
              <label className={fLabel}>Is ceiling insulation R-value known?</label>
              <RadioGroup value={vals.ceilingInsulationKnown} onChange={v => set("ceilingInsulationKnown", v)} />
            </div>

            {vals.ceilingInsulationKnown && (
              <div className={fRow}>
                <div>
                  <label className={fLabel}>Ceiling Insulation R-Value</label>
                  <input className={fInput} placeholder="e.g. 28" value={vals.ceilingInsulationRValue} onChange={e => set("ceilingInsulationRValue", e.target.value)} />
                </div>
                <div>
                  <label className={fLabel}>Ceiling insulation type</label>
                  <select className={fInput} value={vals.ceilingInsulationType} onChange={e => set("ceilingInsulationType", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Batt insulation">Batt insulation</option>
                    <option value="Blown-in insulation">Blown-in insulation</option>
                    <option value="Spray foam">Spray foam</option>
                    <option value="Rigid board">Rigid board</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            )}

            <div className={fTriplet}>
              <div>
                <label className={fLabel}>Are the air ducts insulated?</label>
                <select className={fInput} value={vals.ductsInsulated} onChange={e => set("ductsInsulated", e.target.value)}>
                  <option value="">Select…</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
              <div>
                <label className={fLabel}>Are the air ducts sealed?</label>
                <select className={fInput} value={vals.ductsSealed} onChange={e => set("ductsSealed", e.target.value)}>
                  <option value="">Select…</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
              <div>
                <label className={fLabel}>Is envelope professionally air sealed?</label>
                <select className={fInput} value={vals.envelopeAirSealed} onChange={e => set("envelopeAirSealed", e.target.value)}>
                  <option value="">Select…</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
            </div>

            <div>
              <label className={fLabel}>Is whole home ventilation system rated flow CFM (cubic feet per minute) known?</label>
              <RadioGroup value={vals.ventilationCfmKnown} onChange={v => set("ventilationCfmKnown", v)} />
            </div>

            <div className={fRow}>
              {vals.ventilationCfmKnown && (
                <div>
                  <label className={fLabel}>Whole home ventilation system rated flow CFM</label>
                  <input className={fInput} placeholder="e.g. 1" value={vals.ventilationCfm} onChange={e => set("ventilationCfm", e.target.value)} />
                </div>
              )}
              <div>
                <label className={fLabel}><span className={fCode}>b.</span> Whole home ventilation system type</label>
                <select className={fInput} value={vals.ventilationSystemType} onChange={e => set("ventilationSystemType", e.target.value)}>
                  <option value="">Select…</option>
                  <option value="None">None</option>
                  <option value="HRV (Heat Recovery Ventilator)">HRV (Heat Recovery Ventilator)</option>
                  <option value="ERV (Energy Recovery Ventilator)">ERV (Energy Recovery Ventilator)</option>
                  <option value="Exhaust-only">Exhaust-only</option>
                  <option value="Supply-only">Supply-only</option>
                  <option value="Balanced (no heat recovery)">Balanced (no heat recovery)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className={fLabel}><span className={fCode}>c.</span> Cooling system type</label>
              <select className={fInput} value={vals.coolingSystemType} onChange={e => set("coolingSystemType", e.target.value)}>
                <option value="">Select…</option>
                <option value="Heat pump">Heat pump</option>
                <option value="Central air conditioner">Central air conditioner</option>
                <option value="Mini-split">Mini-split</option>
                <option value="Window unit(s)">Window unit(s)</option>
                <option value="No cooling">No cooling</option>
                <option value="Other">Other</option>
              </select>
            </div>

          </div>
        </FormCard>
      )}

      {caseData.constructionType === "Existing Construction" && vals.scopeIncludesHeatPump && (
        <FormCard title="Heating and Cooling System">
          <div className="space-y-5">
            <SubGroup title="Cooling Systems">
              <div className={fRow}>
                <div>
                  <label className={fLabel}>Is efficiency known?</label>
                  <RadioGroup value={vals.coolingEfficiencyKnown} onChange={v => set("coolingEfficiencyKnown", v)} />
                </div>
                {vals.coolingEfficiencyKnown && (
                  <div>
                    <label className={fLabel}>Efficiency SEER (Seasonal Energy Efficiency Ratio)</label>
                    <input className={fInput} placeholder="e.g. 16" value={vals.coolingEfficiencySeer} onChange={e => set("coolingEfficiencySeer", e.target.value)} />
                  </div>
                )}
              </div>
              <div className={fRow}>
                <div>
                  <label className={fLabel}>Is the percent of floor area served by cooling system known?</label>
                  <RadioGroup value={vals.coolingFloorAreaKnown} onChange={v => set("coolingFloorAreaKnown", v)} />
                </div>
                {vals.coolingFloorAreaKnown && (
                  <div>
                    <label className={fLabel}>Percent of floor area served by cooling system</label>
                    <div className="flex items-center gap-2">
                      <input className={fInput} placeholder="100" value={vals.coolingFloorAreaPct} onChange={e => set("coolingFloorAreaPct", e.target.value)} />
                      <span className="text-sm text-slate-500 flex-shrink-0">%</span>
                    </div>
                  </div>
                )}
              </div>
            </SubGroup>

            <SubGroup title="Heating System">
              <div className={fRow}>
                <div>
                  <label className={fLabel}>Fuel and system type</label>
                  <select className={fInput} value={vals.heatingSystemFuelType} onChange={e => set("heatingSystemFuelType", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Gas Propane Furnace">Gas Propane Furnace</option>
                    <option value="Natural Gas Furnace">Natural Gas Furnace</option>
                    <option value="Electric Furnace">Electric Furnace</option>
                    <option value="Heat Pump">Heat Pump</option>
                    <option value="Oil Furnace">Oil Furnace</option>
                    <option value="Electric Baseboard">Electric Baseboard</option>
                    <option value="No heating">No heating</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={fLabel}>Is efficiency known?</label>
                  <RadioGroup value={vals.heatingEfficiencyKnown} onChange={v => set("heatingEfficiencyKnown", v)} />
                </div>
              </div>
              {vals.heatingEfficiencyKnown && (
                <div className={fRow}>
                  <div>
                    <label className={fLabel}>Heating Seasonal Performance Factor (HSPF)</label>
                    <input className={fInput} placeholder="e.g. 8.5" value={vals.heatingHspf} onChange={e => set("heatingHspf", e.target.value)} />
                  </div>
                  <div>
                    <label className={fLabel}>Annual Fuel Utilization Efficiency (AFUE)</label>
                    <input className={fInput} placeholder="e.g. 0.80" value={vals.heatingAfue} onChange={e => set("heatingAfue", e.target.value)} />
                  </div>
                </div>
              )}
              <div className={fRow}>
                <div>
                  <label className={fLabel}>Is percent of floor area served by the heating system known?</label>
                  <RadioGroup value={vals.heatingFloorAreaKnown} onChange={v => set("heatingFloorAreaKnown", v)} />
                </div>
                {vals.heatingFloorAreaKnown && (
                  <div>
                    <label className={fLabel}>Percent of floor area served by heating system</label>
                    <div className="flex items-center gap-2">
                      <input className={fInput} placeholder="100" value={vals.heatingFloorAreaPct} onChange={e => set("heatingFloorAreaPct", e.target.value)} />
                      <span className="text-sm text-slate-500 flex-shrink-0">%</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="sm:max-w-xs">
                <label className={fLabel}>Electrical panel max amps</label>
                <input className={fInput} placeholder="e.g. 200" value={vals.electricalPanelAmps} onChange={e => set("electricalPanelAmps", e.target.value)} />
              </div>
            </SubGroup>
          </div>
        </FormCard>
      )}

      <FormCard title="Electrical Upgrades">
        <div className="space-y-5">
          <div className={fRow}>
            <div>
              <label className={fLabel}><span className={fCode}>C.10.</span> Will the upgrades include an <strong>electrical panel</strong>?</label>
              <RadioGroup value={vals.scopeIncludesPanel ? true : vals.scopeIncludesPanel === false ? false : null} onChange={v => set("scopeIncludesPanel", v)} />
            </div>
            <div>
              <label className={fLabel}><span className={fCode}>C.11.</span> Will the upgrades include <strong>electrical wiring</strong>?</label>
              <RadioGroup value={vals.scopeIncludesWiring ? true : vals.scopeIncludesWiring === false ? false : null} onChange={v => set("scopeIncludesWiring", v)} />
            </div>
          </div>

          {vals.scopeIncludesWiring && (
            <NestedPanel>
              <p className="text-sm font-semibold text-[#711419]">
                Please note: Electrical wiring must be paired with either another HEAR update or HER project.
              </p>
              <div>
                <label className={fLabel}><span className={fCode}>a.</span> Are there any External Rebates (i.e. GA Power, WAP, etc.) that will apply to this measure's installation?</label>
                <RadioGroup value={vals.wiringExternalRebates} onChange={v => set("wiringExternalRebates", v)} />
              </div>
              <div className={fTriplet}>
                <div>
                  <label className={fLabel}>Estimated Electrical wiring Material Costs</label>
                  <input className={fInput} placeholder="$ 0.00" value={vals.wiringMaterialCost} onChange={e => set("wiringMaterialCost", e.target.value)} />
                </div>
                <div>
                  <label className={fLabel}>Estimated Electrical wiring Install Costs</label>
                  <input className={fInput} placeholder="$ 0.00" value={vals.wiringInstallCost} onChange={e => set("wiringInstallCost", e.target.value)} />
                </div>
                <div>
                  <label className={fLabel}>Estimated Electrical wiring Total Cost</label>
                  <input
                    className={`${fInput} bg-slate-100 text-slate-500`}
                    readOnly
                    value={
                      vals.wiringMaterialCost && vals.wiringInstallCost
                        ? `$ ${(parseFloat(vals.wiringMaterialCost.replace(/[^0-9.]/g, "")) + parseFloat(vals.wiringInstallCost.replace(/[^0-9.]/g, ""))).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : ""
                    }
                    placeholder="Auto-calculated"
                  />
                </div>
              </div>

              <RebatePhotoUploader
                caseId={caseId}
                photos={(caseData.documents ?? []).filter(d => d.category === "electrical_wiring_pre_retrofit" && (d.contentType ?? "").startsWith("image/"))}
                onInvalidate={onInvalidate}
                category="electrical_wiring_pre_retrofit"
                label="Upload geotagged photo(s) of Electrical Wiring Pre-Retrofit"
              />
            </NestedPanel>
          )}

          <div>
            <label className={fLabel}>Will the project include <strong>insulation, air sealing, or ventilation upgrades</strong>?</label>
            <RadioGroup value={vals.scopeIncludesInsulation} onChange={v => set("scopeIncludesInsulation", v)} />
          </div>
        </div>
      </FormCard>

      <FormCard title="Electrification Measures">
        <p className="text-sm text-slate-600 mb-4"><span className={fCode}>D.1.</span> Select all measures included in the proposed scope of work:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {[...(caseData.scopeChecklist ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleItem.mutate({ itemId: item.id, isChecked: !item.isChecked })}
              disabled={toggleItem.isPending}
              className={`flex items-center gap-3 p-3 rounded-md border text-sm text-left transition-all ${
                item.isChecked ? "border-[#711419] bg-red-50 text-slate-800" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
              }`}
            >
              <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${item.isChecked ? "border-[#711419] bg-[#711419]" : "border-slate-300 bg-white"}`}>
                {item.isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <span className="font-medium">{item.itemName}</span>
            </button>
          ))}
        </div>
        {checkedItems.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-[#711419] font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {checkedItems.length} measure{checkedItems.length !== 1 ? "s" : ""} selected
          </div>
        )}
        {allItems.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No measures configured.</p>}
      </FormCard>

      <FormCard title="Scope Description & Cost">
        <div className="space-y-5">
          <div>
            <label className={fLabel}><span className={fCode}>D.2.</span> Describe the proposed scope of work</label>
            <textarea
              rows={4}
              className="w-full px-3 py-2 rounded-md bg-white border border-slate-300 text-sm text-slate-800 resize-none focus:outline-none focus:border-[#711419] focus:ring-2 focus:ring-[#711419]/15"
              placeholder="Describe all work to be performed, equipment to be installed, and any additional measures..."
              value={vals.scopeSummary}
              onChange={e => set("scopeSummary", e.target.value)}
            />
          </div>
          <div className="sm:max-w-xs">
            <label className={fLabel}><span className={fCode}>D.3.</span> Total Proposed Project Cost</label>
            <input className={fInput} placeholder="e.g. $12,500" value={vals.installCost} onChange={e => set("installCost", e.target.value)} />
          </div>
        </div>
      </FormCard>

      <FormCard title="Documentation">
        <p className="text-sm text-slate-600 mb-4">
          Please upload specification sheets, ENERGY STAR Certification or AHRI Certificate of the potential upgrade — Required for heat pump, water heater, clothes dryer, and electric stove/cooktop/range/oven upgrades (Please note if product changes during installation and no longer meets program requirements, rebate will not be paid)
        </p>
        <div className="space-y-3">
          <RebatePhotoUploader
            caseId={caseId}
            photos={(caseData.documents ?? []).filter(d => d.category === "ahri_certificate")}
            onInvalidate={onInvalidate}
            category="ahri_certificate"
            label="Specification sheets, ENERGY STAR Certification, or AHRI Certificate — Required for heat pump, water heater, clothes dryer, and electric stove/cooktop/range/oven upgrades"
            accept="*/*"
          />
          <RebatePhotoUploader
            caseId={caseId}
            photos={(caseData.documents ?? []).filter(d => d.category === "snugg_pro_pdf")}
            onInvalidate={onInvalidate}
            category="snugg_pro_pdf"
            label="SnuggPro-PDF — Required for insulation, air sealing, and ventilation projects, if project started in the HER program"
            accept="application/pdf,.pdf"
          />
          {vals.scopeIncludesHeatPump && (
            <>
              <RebatePhotoUploader
                caseId={caseId}
                photos={(caseData.documents ?? []).filter(d => d.category === "fuel_switching_calculator")}
                onInvalidate={onInvalidate}
                category="fuel_switching_calculator"
                label="Heat Pump Fuel-Switching Calculator — Required for heat pump for space heating and cooling projects"
                accept="*/*"
                required
              />
              <RebatePhotoUploader
                caseId={caseId}
                photos={(caseData.documents ?? []).filter(d => d.category === "manual_j_report")}
                onInvalidate={onInvalidate}
                category="manual_j_report"
                label="Manual J Report — Required for heat pump for space heating and cooling projects"
                accept="application/pdf,.pdf"
              />
            </>
          )}
        </div>
      </FormCard>

      <FormCard title="Estimated Project Financials">
        {(() => {
          const num = (v: string) => parseFloat((v ?? "").replace(/[^0-9.]/g, "")) || 0;
          const fmt = (n: number) => `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const hpTotal = num(vals.hpMaterialCost) + num(vals.hpInstallCost);
          const wiringTotal = num(vals.wiringMaterialCost) + num(vals.wiringInstallCost);
          const subTotals = hpTotal + wiringTotal;
          const propTotal = num(vals.installCost);
          const totalProjectCost = Math.max(subTotals, propTotal);
          const externalRebate = num(vals.totalExternalRebate);
          const eligibleBase = Math.max(totalProjectCost - externalRebate, 0);
          const rebate50 = eligibleBase * 0.5;
          const rebate100 = eligibleBase;
          return (
            <div className="space-y-5">
              <div>
                <label className={fLabel}>Final Total Project External Rebate</label>
                <input className={fInput} placeholder="$ 0.00" value={vals.totalExternalRebate} onChange={e => set("totalExternalRebate", e.target.value)} />
              </div>
              <div>
                <label className={fLabel}><span className={fCode}>C.21.</span> Total Estimated Project Costs</label>
                <input className={`${fInput} bg-slate-100 text-slate-600`} readOnly value={totalProjectCost > 0 ? fmt(totalProjectCost) : ""} placeholder="$ 0.00" />
              </div>
              <div className={fRow}>
                <div>
                  <label className={fLabel}>Estimated Rebate at 50%</label>
                  <input className={`${fInput} bg-slate-100 text-slate-600`} readOnly value={eligibleBase > 0 ? fmt(rebate50) : ""} placeholder="$ 0.00" />
                </div>
                <div>
                  <label className={fLabel}>Estimated Rebate at 100%</label>
                  <input className={`${fInput} bg-slate-100 text-slate-600`} readOnly value={eligibleBase > 0 ? fmt(rebate100) : ""} placeholder="$ 0.00" />
                </div>
              </div>
            </div>
          );
        })()}
      </FormCard>

      <StickySaveBar dirty={dirty} saving={saving} onSave={() => {
        const num = (v: string) => parseFloat((v ?? "").replace(/[^0-9.]/g, "")) || 0;
        const fmt = (n: number) => `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const hpTotal = num(vals.hpMaterialCost) + num(vals.hpInstallCost);
        const wiringTotal = num(vals.wiringMaterialCost) + num(vals.wiringInstallCost);
        const subTotals = hpTotal + wiringTotal;
        const propTotal = num(vals.installCost);
        const totalProjectCost = Math.max(subTotals, propTotal);
        const externalRebate = num(vals.totalExternalRebate);
        const eligibleBase = Math.max(totalProjectCost - externalRebate, 0);
        const computed = {
          ...vals,
          totalEstimatedProjectCost: totalProjectCost > 0 ? fmt(totalProjectCost) : "",
          estimatedRebate50Pct: eligibleBase > 0 ? fmt(eligibleBase * 0.5) : "",
          estimatedRebate100Pct: eligibleBase > 0 ? fmt(eligibleBase) : "",
        };
        onPatch(computed as any);
      }} type="button" />
    </div>
  );
}

// ─── Completion Attestations Tab ───────────────────────────────────────────────

function CompletionAttestationsTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const form = useForm({
    defaultValues: {
      customerAttestationSigned: caseData.customerAttestationSigned ?? false,
      customerAttestationDate: caseData.customerAttestationDate ? format(new Date(caseData.customerAttestationDate), "yyyy-MM-dd") : "",
      contractorAttestationSigned: caseData.contractorAttestationSigned ?? false,
      contractorAttestationDate: caseData.contractorAttestationDate ? format(new Date(caseData.contractorAttestationDate), "yyyy-MM-dd") : "",
      attestationNotes: caseData.attestationNotes ?? "",
    },
  });
  const onSubmit = (v: any) => onPatch(v);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-700">Customer Attestation</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                The customer certifies that the information provided is accurate, the work described was completed at the property, and they understand the terms of the rebate program.
              </p>
              <FormField control={form.control} name="customerAttestationSigned" render={({ field }) => (
                <FormItem>
                  <button
                    type="button"
                    onClick={() => field.onChange(!field.value)}
                    className={`flex items-center gap-3 w-full p-3 rounded-lg border-2 transition-colors text-left
                      ${field.value
                        ? "border-[#711419] bg-red-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"}`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                      ${field.value ? "bg-[#711419]" : "bg-white border-2 border-slate-300"}`}>
                      {field.value && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-sm font-medium text-slate-700">
                      {field.value ? "Customer has signed attestation" : "Mark as signed by customer"}
                    </span>
                  </button>
                </FormItem>
              )} />
              <FormField control={form.control} name="customerAttestationDate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Customer Signature Date</FormLabel>
                  <FormControl><Input className="h-8 text-sm" type="date" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-700">Contractor Attestation</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                The contractor certifies that the installed equipment meets all program requirements, is properly installed, and the information submitted in the rebate application is accurate.
              </p>
              <FormField control={form.control} name="contractorAttestationSigned" render={({ field }) => (
                <FormItem>
                  <button
                    type="button"
                    onClick={() => field.onChange(!field.value)}
                    className={`flex items-center gap-3 w-full p-3 rounded-lg border-2 transition-colors text-left
                      ${field.value
                        ? "border-[#711419] bg-red-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"}`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                      ${field.value ? "bg-[#711419]" : "bg-white border-2 border-slate-300"}`}>
                      {field.value && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-sm font-medium text-slate-700">
                      {field.value ? "Contractor has signed attestation" : "Mark as signed by contractor"}
                    </span>
                  </button>
                </FormItem>
              )} />
              <FormField control={form.control} name="contractorAttestationDate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Contractor Signature Date</FormLabel>
                  <FormControl><Input className="h-8 text-sm" type="date" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Attestation Notes</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <FormField control={form.control} name="attestationNotes" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea className="text-sm min-h-[80px] resize-none" placeholder="Notes about attestations or signatures…" {...field} value={field.value ?? ""} />
                </FormControl>
              </FormItem>
            )} />
          </CardContent>
        </Card>

        <div className="mt-3">
          <SaveBar onSave={form.handleSubmit(onSubmit)} saving={saving} dirty={form.formState.isDirty} />
        </div>
      </form>
    </Form>
  );
}

// ─── Reservation Summary Tab ───────────────────────────────────────────────────

function ReservationSummaryTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const form = useForm({
    defaultValues: {
      reservationNumber: caseData.reservationNumber ?? "",
      reservationDate: caseData.reservationDate ? format(new Date(caseData.reservationDate), "yyyy-MM-dd") : "",
      rebateAmount: caseData.rebateAmount ?? "",
      paymentReleaseAmount: caseData.paymentReleaseAmount ?? "",
      caseCloseoutDate: caseData.caseCloseoutDate ? format(new Date(caseData.caseCloseoutDate), "yyyy-MM-dd") : "",
      caseCloseoutNotes: caseData.caseCloseoutNotes ?? "",
    },
  });
  const onSubmit = (v: any) => onPatch(v);

  const isFullyAttested = caseData.customerAttestationSigned && caseData.contractorAttestationSigned;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {!isFullyAttested && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Both customer and contractor attestations should be signed before finalizing the reservation summary.</span>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Reservation Details</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { name: "reservationNumber", label: "Reservation #", placeholder: "e.g. RES-2024-00123" },
                { name: "reservationDate", label: "Reservation Date", type: "date" },
                { name: "rebateAmount", label: "Approved Rebate Amount", placeholder: "e.g. $4,000" },
                { name: "paymentReleaseAmount", label: "Payment Release Amount", placeholder: "e.g. $4,000" },
              ].map(({ name, label, placeholder, type }) => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" type={type ?? "text"} placeholder={placeholder} {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Case Close-out</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              <FormField control={form.control} name="caseCloseoutDate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Close-out Date</FormLabel>
                  <FormControl><Input className="h-8 text-sm" type="date" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="caseCloseoutNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Close-out Notes</FormLabel>
                  <FormControl>
                    <Textarea className="text-sm min-h-[120px] resize-none" placeholder="Final notes, payment instructions, or case close-out details…" {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )} />
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600">Attestation Status</p>
                <div className="flex items-center gap-2 text-sm">
                  {caseData.customerAttestationSigned
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                  <span className={caseData.customerAttestationSigned ? "text-slate-700" : "text-slate-400"}>
                    Customer attestation
                    {caseData.customerAttestationDate && ` — ${format(new Date(caseData.customerAttestationDate), "MMM d, yyyy")}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {caseData.contractorAttestationSigned
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                  <span className={caseData.contractorAttestationSigned ? "text-slate-700" : "text-slate-400"}>
                    Contractor attestation
                    {caseData.contractorAttestationDate && ` — ${format(new Date(caseData.contractorAttestationDate), "MMM d, yyyy")}`}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-3">
          <SaveBar onSave={form.handleSubmit(onSubmit)} saving={saving} dirty={form.formState.isDirty} />
        </div>
      </form>
    </Form>
  );
}

// ─── Documents Tab ──────────────────────────────────────────────────────────────

function DocumentsTab({ caseData, caseId, onInvalidate }: { caseData: CaseDetail; caseId: string; onInvalidate: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<RebateDocumentCategory>("other");
  const [uploading, setUploading] = useState(false);

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiRequest("DELETE", `/api/crm/rebate-cases/${caseId}/documents/${docId}`),
    onSuccess: onInvalidate,
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      // Step 1: Request a presigned upload URL
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: Upload the file directly to the presigned URL
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("File upload failed");

      // Step 3: Save document metadata
      const metaRes = await fetch(`/api/crm/rebate-cases/${caseId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: file.name,
          url: uploadURL,
          objectPath,
          category: uploadCategory,
          contentType: file.type,
          size: file.size,
        }),
      });
      if (!metaRes.ok) throw new Error("Failed to save document metadata");
      onInvalidate();
      toast({ title: "Document uploaded" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const docsByCategory = DOC_CATEGORIES.map(cat => ({
    cat,
    docs: (caseData.documents ?? []).filter(d => d.category === cat),
  })).filter(({ docs }) => docs.length > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Upload Document</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={uploadCategory} onValueChange={v => setUploadCategory(v as RebateDocumentCategory)}>
              <SelectTrigger className="h-9 text-sm w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{DOCUMENT_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              {uploading ? "Uploading..." : "Choose File"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {docsByCategory.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FolderOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No documents uploaded yet.</p>
          </CardContent>
        </Card>
      ) : (
        docsByCategory.map(({ cat, docs }) => (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-700">{DOCUMENT_CATEGORY_LABELS[cat]}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-50 group">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-blue-600 hover:underline truncate"
                  >
                    {doc.name}
                  </a>
                  {doc.createdAt && (
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {format(new Date(doc.createdAt), "MMM d")}
                    </span>
                  )}
                  <button
                    onClick={() => { if (confirm("Remove this document?")) deleteDoc.mutate(doc.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Tasks Tab ──────────────────────────────────────────────────────────────────

function TasksTab({ caseId, clientName }: { caseId: string; clientName: string }) {
  type TaskItem = { id: string; title: string; status: string; dueDate?: string | null; assignedUserId?: string | null };
  const { data: tasksData, isLoading } = useQuery<{ tasks: TaskItem[]; total: number } | TaskItem[]>({
    queryKey: ["/api/tasks/entity/rebate_case", caseId],
    queryFn: () => fetch(`/api/tasks/entity/rebate_case/${caseId}`, { credentials: "include" }).then(r => r.json()),
  });
  const tasks: TaskItem[] = Array.isArray(tasksData) ? tasksData : (tasksData as any)?.tasks ?? [];

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-700">Tasks</CardTitle>
          <span className="text-xs text-slate-500">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {tasks.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No tasks linked to this case yet.</p>
            <p className="text-xs text-slate-400 mt-1">Create a task from the Tasks section and link it to this rebate case.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-md border border-slate-100 text-sm">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === "completed" ? "bg-green-500" : task.status === "in_progress" ? "bg-blue-500" : "bg-slate-300"}`} />
                <span className="flex-1 text-slate-700">{task.title}</span>
                {task.dueDate && (
                  <span className="text-xs text-slate-400">{format(new Date(task.dueDate), "MMM d")}</span>
                )}
                <Badge variant="outline" className="text-xs capitalize">{task.status?.replace(/_/g," ")}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Activity Log Tab ───────────────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<string, { icon: any; bgColor: string; textColor: string; borderColor: string; label: string }> = {
  case_created:            { icon: Activity,      bgColor: "bg-[#711419]",      textColor: "text-white",        borderColor: "border-red-100",    label: "Case Created" },
  case_closed:             { icon: Lock,          bgColor: "bg-slate-700",      textColor: "text-white",        borderColor: "border-slate-200",  label: "Case Closed" },
  note_added:              { icon: FileText,      bgColor: "bg-blue-100",       textColor: "text-blue-600",     borderColor: "border-blue-100",   label: "Note" },
  document_uploaded:       { icon: Upload,        bgColor: "bg-purple-100",     textColor: "text-purple-600",   borderColor: "border-purple-100", label: "Document" },
  workflow_step_complete:  { icon: CheckCircle2,  bgColor: "bg-green-100",      textColor: "text-green-600",    borderColor: "border-green-100",  label: "Workflow Step" },
  status_changed:          { icon: Activity,      bgColor: "bg-amber-100",      textColor: "text-amber-600",    borderColor: "border-amber-100",  label: "Status Changed" },
  assignee_changed:        { icon: User,          bgColor: "bg-indigo-100",     textColor: "text-indigo-600",   borderColor: "border-indigo-100", label: "Reassigned" },
  scope_submitted:         { icon: ClipboardList, bgColor: "bg-teal-100",       textColor: "text-teal-600",     borderColor: "border-teal-100",   label: "Scope Submitted" },
};
const DEFAULT_ACTIVITY = { icon: Activity, bgColor: "bg-slate-100", textColor: "text-slate-500", borderColor: "border-slate-200", label: "Activity" };

function ActivityTab({ caseData, caseId, users, onInvalidate }: {
  caseData: CaseDetail; caseId: string; users: CrmUser[]; onInvalidate: () => void;
}) {
  const [note, setNote] = useState("");
  const { toast } = useToast();

  const addNote = useMutation({
    mutationFn: (description: string) =>
      apiRequest("POST", `/api/crm/rebate-cases/${caseId}/activity`, { action: "note_added", description }),
    onSuccess: () => { onInvalidate(); setNote(""); toast({ title: "Note added" }); },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  const usersMap = new Map(users.map(u => [u.id, u.name]));
  const entries = [...(caseData.activity ?? [])].sort(
    (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Add note */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-[#711419]" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            <Textarea
              className="text-sm min-h-[60px] resize-none flex-1"
              placeholder="Add a note..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <Button
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014] self-end"
              onClick={() => { if (note.trim()) addNote.mutate(note.trim()); }}
              disabled={!note.trim() || addNote.isPending}
            >
              {addNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="pt-6">
          {entries.length === 0 ? (
            <div className="text-center py-10">
              <Activity className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[92px] top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {entries.map(entry => {
                  const cfg = ACTIVITY_CONFIG[entry.action ?? ""] ?? DEFAULT_ACTIVITY;
                  const IconComp = cfg.icon;
                  return (
                    <div key={entry.id} className="flex items-start gap-4">
                      {/* Date column */}
                      <div className="w-[80px] text-right flex-shrink-0 pt-2">
                        {entry.createdAt && (
                          <>
                            <p className="text-xs font-medium text-slate-600">
                              {format(new Date(entry.createdAt), "MMM d, yyyy")}
                            </p>
                            <p className="text-xs text-slate-400">
                              {format(new Date(entry.createdAt), "h:mm a")}
                            </p>
                          </>
                        )}
                      </div>
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white shadow-sm ${cfg.bgColor}`}>
                        <IconComp className={`h-4 w-4 ${cfg.textColor}`} />
                      </div>
                      {/* Content card */}
                      <div className={`flex-1 p-4 rounded-lg border bg-white ${cfg.borderColor}`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-xs ${cfg.bgColor} ${cfg.textColor}`}>{cfg.label}</Badge>
                            {entry.userId && (
                              <span className="text-xs text-slate-400">
                                by {usersMap.get(entry.userId) ?? "Unknown"}
                              </span>
                            )}
                          </div>
                        </div>
                        {entry.description && (
                          <p className="text-sm text-slate-700">{entry.description}</p>
                        )}
                        {!entry.description && (
                          <p className="text-sm text-slate-500 capitalize">
                            {entry.action?.replace(/_/g, " ")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
