import { useState, useRef } from "react";
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
  AlertCircle, Loader2, Lock, BookOpen
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
  "rebate_request","head_of_household","scope_of_work","contractor_pre_approval",
  "project_completion","completion_attestations","reservation_summary","other",
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
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/crm/rebate-programs")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
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
              <Lock className="h-3.5 w-3.5 mr-1.5" />
              Close Case
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => { if (confirm("Delete this case? This cannot be undone.")) deleteCase.mutate(); }}
            disabled={deleteCase.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
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
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 flex-wrap">
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
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6">
          <TabsContent value="program_overview">
            <SummaryTab caseData={caseData} users={users} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="rebate_request">
            <ClientPropertyTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="head_of_household">
            <UtilityTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="scope_of_work">
            <ScopeTab caseData={caseData} caseId={id} onPatch={patchCase.mutate} saving={patchCase.isPending} onInvalidate={invalidate} />
          </TabsContent>
          <TabsContent value="contractor_pre_approval">
            <ExistingSystemTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="project_completion">
            <NewSystemTab caseData={caseData} onPatch={patchCase.mutate} saving={patchCase.isPending} />
          </TabsContent>
          <TabsContent value="completion_attestations">
            <WorkflowTab caseData={caseData} caseId={id} onInvalidate={invalidate} />
          </TabsContent>
          <TabsContent value="reservation_summary">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">Reservation Summary</p>
              <p className="text-xs text-slate-400 mt-1">Content coming soon.</p>
            </div>
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

// ─── Client/Property Tab ───────────────────────────────────────────────────────

function ClientPropertyTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const schema = insertRebateCaseSchema.pick({
    clientFirstName: true, clientLastName: true, clientEmail: true, clientPhone: true,
    clientDob: true, householdSize: true, householdIncome: true, amiBracket: true,
    propertyAddress: true, propertyCity: true, propertyState: true, propertyZip: true,
    propertyType: true, ownershipStatus: true, yearBuilt: true, squareFootage: true,
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientFirstName: caseData.clientFirstName ?? "",
      clientLastName: caseData.clientLastName ?? "",
      clientEmail: caseData.clientEmail ?? "",
      clientPhone: caseData.clientPhone ?? "",
      clientDob: caseData.clientDob ?? "",
      householdSize: caseData.householdSize ?? undefined,
      householdIncome: caseData.householdIncome ?? "",
      amiBracket: caseData.amiBracket ?? "",
      propertyAddress: caseData.propertyAddress ?? "",
      propertyCity: caseData.propertyCity ?? "",
      propertyState: caseData.propertyState ?? "",
      propertyZip: caseData.propertyZip ?? "",
      propertyType: caseData.propertyType ?? "",
      ownershipStatus: caseData.ownershipStatus ?? "",
      yearBuilt: caseData.yearBuilt ?? undefined,
      squareFootage: caseData.squareFootage ?? undefined,
    },
  });

  const onSubmit = (values: z.infer<typeof schema>) => onPatch(values as any);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Client Information</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { name: "clientFirstName", label: "First Name" },
                { name: "clientLastName", label: "Last Name" },
                { name: "clientEmail", label: "Email" },
                { name: "clientPhone", label: "Phone" },
                { name: "clientDob", label: "Date of Birth" },
                { name: "householdIncome", label: "Household Income" },
                { name: "amiBracket", label: "AMI Bracket" },
              ].map(({ name, label }) => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                    <FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              ))}
              <FormField control={form.control} name="householdSize" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Household Size</FormLabel>
                  <FormControl><Input className="h-8 text-sm" type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Property</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { name: "propertyAddress", label: "Address" },
                { name: "propertyCity", label: "City" },
                { name: "propertyState", label: "State" },
                { name: "propertyZip", label: "ZIP" },
                { name: "propertyType", label: "Property Type" },
                { name: "ownershipStatus", label: "Ownership" },
              ].map(({ name, label }) => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                    <FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              ))}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="yearBuilt" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">Year Built</FormLabel>
                    <FormControl><Input className="h-8 text-sm" type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="squareFootage" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">Sq Ft</FormLabel>
                    <FormControl><Input className="h-8 text-sm" type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl>
                  </FormItem>
                )} />
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

// ─── Utility Tab ───────────────────────────────────────────────────────────────

function UtilityTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const form = useForm({
    defaultValues: {
      electricUtility: caseData.electricUtility ?? "",
      electricAccountNumber: caseData.electricAccountNumber ?? "",
      gasUtility: caseData.gasUtility ?? "",
      gasAccountNumber: caseData.gasAccountNumber ?? "",
    },
  });
  const onSubmit = (v: any) => onPatch(v);
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card className="max-w-lg">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Utility Information</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            {[
              { name: "electricUtility", label: "Electric Utility" },
              { name: "electricAccountNumber", label: "Electric Account #" },
              { name: "gasUtility", label: "Gas Utility" },
              { name: "gasAccountNumber", label: "Gas Account #" },
            ].map(({ name, label }) => (
              <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">{label}</FormLabel>
                  <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                </FormItem>
              )} />
            ))}
          </CardContent>
        </Card>
        <div className="mt-3">
          <SaveBar onSave={form.handleSubmit(onSubmit)} saving={saving} dirty={form.formState.isDirty} />
        </div>
      </form>
    </Form>
  );
}

// ─── Existing System Tab ────────────────────────────────────────────────────────

function ExistingSystemTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const form = useForm({
    defaultValues: {
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
        <Card className="max-w-lg">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Existing Equipment</CardTitle></CardHeader>
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
        <div className="mt-3">
          <SaveBar onSave={form.handleSubmit(onSubmit)} saving={saving} dirty={form.formState.isDirty} />
        </div>
      </form>
    </Form>
  );
}

// ─── New System Tab ─────────────────────────────────────────────────────────────

function NewSystemTab({ caseData, onPatch, saving }: { caseData: CaseDetail; onPatch: (d: Partial<RebateCase>) => void; saving: boolean }) {
  const form = useForm({
    defaultValues: {
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
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Heating</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3">
              {["newHeatingType","newHeatingBrand","newHeatingModel","newHeatingSerial","newHeatingSeer","newHeatingHspf"].map(name => (
                <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-slate-500">{name.replace("newHeating","").replace(/([A-Z])/g," $1").trim()}</FormLabel>
                    <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                  </FormItem>
                )} />
              ))}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Cooling</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-3">
                {["newCoolingType","newCoolingBrand","newCoolingModel","newCoolingSerial"].map(name => (
                  <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">{name.replace("newCooling","").replace(/([A-Z])/g," $1").trim()}</FormLabel>
                      <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-slate-700">Water Heater</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-3">
                {["newWaterHeaterType","newWaterHeaterBrand","newWaterHeaterModel"].map(name => (
                  <FormField key={name} control={form.control} name={name as any} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-slate-500">{name.replace("newWaterHeater","").replace(/([A-Z])/g," $1").trim()}</FormLabel>
                      <FormControl><Input className="h-8 text-sm" {...field} /></FormControl>
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
  const form = useForm({
    defaultValues: {
      scopeSummary: caseData.scopeSummary ?? "",
      installCost: caseData.installCost ?? "",
    },
  });

  const toggleItem = useMutation({
    mutationFn: ({ itemId, isChecked }: { itemId: string; isChecked: boolean }) =>
      apiRequest("PATCH", `/api/crm/rebate-cases/${caseId}/scope-items/${itemId}`, { isChecked }),
    onSuccess: onInvalidate,
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });

  const checkedCount = (caseData.scopeChecklist ?? []).filter(i => i.isChecked).length;
  const totalItems = (caseData.scopeChecklist ?? []).length;

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(v => onPatch(v as any))}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-700">Scope Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <FormField control={form.control} name="scopeSummary" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Scope Description</FormLabel>
                  <FormControl>
                    <Textarea className="text-sm min-h-[80px] resize-none" placeholder="Describe the scope of work..." {...field} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="installCost" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-slate-500">Install Cost</FormLabel>
                  <FormControl><Input className="h-8 text-sm" placeholder="e.g. $12,500" {...field} /></FormControl>
                </FormItem>
              )} />
              <SaveBar onSave={form.handleSubmit(v => onPatch(v as any))} saving={saving} dirty={form.formState.isDirty} />
            </CardContent>
          </Card>
        </form>
      </Form>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-700">Scope Checklist</CardTitle>
            <span className="text-xs text-slate-500">{checkedCount} of {totalItems} complete</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
            <div
              className="bg-[#711419] h-1.5 rounded-full transition-all"
              style={{ width: totalItems > 0 ? `${(checkedCount / totalItems) * 100}%` : "0%" }}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          {(caseData.scopeChecklist ?? [])
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(item => (
              <button
                key={item.id}
                onClick={() => toggleItem.mutate({ itemId: item.id, isChecked: !item.isChecked })}
                disabled={toggleItem.isPending}
                className="w-full flex items-center gap-3 p-2.5 rounded-md text-sm text-left hover:bg-slate-50 transition-colors group"
              >
                {item.isChecked
                  ? <CheckCircle2 className="w-4 h-4 text-[#711419] flex-shrink-0" />
                  : <Circle className="w-4 h-4 text-slate-300 group-hover:text-slate-400 flex-shrink-0" />
                }
                <span className={item.isChecked ? "text-slate-500 line-through" : "text-slate-700"}>{item.itemName}</span>
              </button>
            ))}
          {(caseData.scopeChecklist ?? []).length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">No checklist items found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Workflow Tab ───────────────────────────────────────────────────────────────

function WorkflowTab({ caseData, caseId, onInvalidate }: { caseData: CaseDetail; caseId: string; onInvalidate: () => void }) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const { toast } = useToast();

  const updateStep = useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: Partial<RebateCaseWorkflowStep> }) =>
      apiRequest("PATCH", `/api/crm/rebate-cases/${caseId}/workflow-steps/${stepId}`, data),
    onSuccess: onInvalidate,
    onError: () => toast({ title: "Failed to update step", variant: "destructive" }),
  });

  const stepsMap = new Map((caseData.workflowSteps ?? []).map(s => [s.step, s]));
  const completeCount = (caseData.workflowSteps ?? []).filter(s => s.status === "complete").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">Neighborly Process Steps</h3>
        <span className="text-sm text-slate-500">{completeCount} of {WORKFLOW_STEPS_ORDER.length} complete</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
        <div
          className="bg-[#711419] h-2 rounded-full transition-all"
          style={{ width: `${(completeCount / WORKFLOW_STEPS_ORDER.length) * 100}%` }}
        />
      </div>
      {WORKFLOW_STEPS_ORDER.map((stepKey, idx) => {
        const step = stepsMap.get(stepKey);
        const isExpanded = expandedStep === stepKey;
        if (!step) return null;
        return (
          <Card key={stepKey} className="overflow-hidden">
            <button
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedStep(isExpanded ? null : stepKey)}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0
                ${step.status === "complete" ? "bg-[#711419] text-white" : "bg-slate-100 text-slate-600"}`}>
                {step.status === "complete" ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{WORKFLOW_STEP_LABELS[stepKey]}</span>
                  <Badge className={`text-xs border ${WORKFLOW_STEP_STATUS_COLORS[step.status]}`}>
                    {WORKFLOW_STEP_STATUS_LABELS[step.status]}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{WORKFLOW_STEP_DESCRIPTIONS[stepKey]}</p>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Status</label>
                  <Select
                    value={step.status}
                    onValueChange={v => updateStep.mutate({ stepId: step.id, data: { status: v as RebateWorkflowStepStatus } })}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["not_started","in_progress","complete","waiting","blocked"] as RebateWorkflowStepStatus[]).map(s => (
                        <SelectItem key={s} value={s}>{WORKFLOW_STEP_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Notes</label>
                  <Textarea
                    className="text-sm min-h-[60px] resize-none"
                    defaultValue={step.notes ?? ""}
                    onBlur={e => {
                      if (e.target.value !== (step.notes ?? "")) {
                        updateStep.mutate({ stepId: step.id, data: { notes: e.target.value || null } });
                      }
                    }}
                    placeholder="Notes for this step..."
                  />
                </div>
                {step.status !== "complete" && (
                  <Button
                    size="sm"
                    className="bg-[#711419] hover:bg-[#5a1014]"
                    onClick={() => updateStep.mutate({ stepId: step.id, data: { status: "complete" } })}
                    disabled={updateStep.isPending}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Mark Complete
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
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
