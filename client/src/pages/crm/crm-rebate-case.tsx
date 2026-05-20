import { useState, useMemo, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Award,
  Loader2,
  Save,
  Plus,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Activity,
  ListChecks,
  Workflow,
  Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  CrmUser,
  RebateCase,
  RebateCaseWorkflowStep,
  RebateCaseScopeChecklist,
  RebateCaseDocument,
  RebateCaseActivityLog,
  RebateApplicationStatus,
  RebatePriority,
  RebateWorkflowStepStatus,
  RebateDocumentCategory,
  Task,
} from "@shared/schema";
import {
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS,
  DOCUMENT_CATEGORY_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PROGRAM_TYPE_LABELS,
  WORKFLOW_STEP_DESCRIPTIONS,
  WORKFLOW_STEP_LABELS,
  WORKFLOW_STEP_STATUS_COLORS,
  WORKFLOW_STEP_STATUS_LABELS,
} from "@/lib/rebate-constants";

type RebateCaseDetail = RebateCase & {
  workflowSteps: RebateCaseWorkflowStep[];
  scopeChecklist: RebateCaseScopeChecklist[];
  documents: RebateCaseDocument[];
  activity: RebateCaseActivityLog[];
};

function fullName(c: Pick<RebateCase, "clientFirstName" | "clientLastName">): string {
  return [c.clientFirstName, c.clientLastName].filter(Boolean).join(" ") || "(no name)";
}

export default function CrmRebateCasePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  usePageTitle("Rebate Case");

  const { data: currentUser } = useQuery<CrmUser>({ queryKey: ["/api/crm/me"] });
  const { data: caseDetail, isLoading } = useQuery<RebateCaseDetail>({
    queryKey: ["/api/crm/rebate-cases", id],
  });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isLoading || !caseDetail) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Header */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/crm/rebate-programs")}
            className="mb-2 -ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Rebate Programs
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Award className="h-6 w-6 text-[#711419]" />
                <h1 className="text-2xl font-bold text-slate-900">{fullName(caseDetail)}</h1>
                <Badge variant="outline" className="font-mono text-xs">
                  {PROGRAM_TYPE_LABELS[caseDetail.programType].split(" ")[0]}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${APPLICATION_STATUS_COLORS[caseDetail.applicationStatus]}`}
                >
                  {APPLICATION_STATUS_LABELS[caseDetail.applicationStatus]}
                </Badge>
                <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[caseDetail.priority]}`}>
                  {PRIORITY_LABELS[caseDetail.priority]} priority
                </Badge>
              </div>
              <p className="text-sm text-slate-600 mt-1">
                {caseDetail.propertyAddress || "No property address on file"}
                {caseDetail.caseNumber && (
                  <span className="ml-3 font-mono text-xs">Case #{caseDetail.caseNumber}</span>
                )}
              </p>
            </div>
            <DeleteCaseButton caseId={caseDetail.id} onDeleted={() => navigate("/crm/rebate-programs")} />
          </div>
        </div>

        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 mb-4">
            <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
            <TabsTrigger value="workflow" data-testid="tab-workflow">Workflow</TabsTrigger>
            <TabsTrigger value="scope" data-testid="tab-scope">Scope</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <SummaryTab caseDetail={caseDetail} toast={toast} />
          </TabsContent>
          <TabsContent value="workflow">
            <WorkflowTab caseDetail={caseDetail} toast={toast} />
          </TabsContent>
          <TabsContent value="scope">
            <ScopeTab caseDetail={caseDetail} toast={toast} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab caseDetail={caseDetail} toast={toast} />
          </TabsContent>
          <TabsContent value="tasks">
            <TasksTab caseDetail={caseDetail} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab caseDetail={caseDetail} toast={toast} />
          </TabsContent>
        </Tabs>
      </div>
    </CrmLayout>
  );
}

function DeleteCaseButton({ caseId, onDeleted }: { caseId: string; onDeleted: () => void }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/rebate-cases/${caseId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases"] });
      toast({ title: "Rebate case deleted" });
      onDeleted();
    },
    onError: (e: any) => toast({ title: "Failed to delete", description: e?.message, variant: "destructive" }),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" data-testid="button-delete-case">
          <Trash2 className="h-4 w-4 mr-1" />
          Delete case
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this rebate case?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the case and all related workflow, scope, documents, and activity.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => mutation.mutate()}
            data-testid="button-confirm-delete-case"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// Summary tab — editable case fields
// ============================================================================

function SummaryTab({
  caseDetail,
  toast,
}: {
  caseDetail: RebateCaseDetail;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [form, setForm] = useState({
    caseNumber: caseDetail.caseNumber || "",
    applicationStatus: caseDetail.applicationStatus,
    priority: caseDetail.priority,
    rebateAmount: caseDetail.rebateAmount || "",
    notes: caseDetail.notes || "",
    // Client
    clientFirstName: caseDetail.clientFirstName || "",
    clientLastName: caseDetail.clientLastName || "",
    clientEmail: caseDetail.clientEmail || "",
    clientPhone: caseDetail.clientPhone || "",
    householdSize: caseDetail.householdSize?.toString() || "",
    householdIncome: caseDetail.householdIncome || "",
    amiBracket: caseDetail.amiBracket || "",
    // Property
    propertyAddress: caseDetail.propertyAddress || "",
    propertyCity: caseDetail.propertyCity || "",
    propertyState: caseDetail.propertyState || "",
    propertyZip: caseDetail.propertyZip || "",
    propertyType: caseDetail.propertyType || "",
    ownershipStatus: caseDetail.ownershipStatus || "",
    // Utility
    electricUtility: caseDetail.electricUtility || "",
    electricAccountNumber: caseDetail.electricAccountNumber || "",
    gasUtility: caseDetail.gasUtility || "",
    gasAccountNumber: caseDetail.gasAccountNumber || "",
    // Existing equipment
    existingHeatingType: caseDetail.existingHeatingType || "",
    existingCoolingType: caseDetail.existingCoolingType || "",
    existingWaterHeaterType: caseDetail.existingWaterHeaterType || "",
    // New equipment
    newHeatingBrand: caseDetail.newHeatingBrand || "",
    newHeatingModel: caseDetail.newHeatingModel || "",
    newCoolingBrand: caseDetail.newCoolingBrand || "",
    newCoolingModel: caseDetail.newCoolingModel || "",
    newWaterHeaterBrand: caseDetail.newWaterHeaterBrand || "",
    newWaterHeaterModel: caseDetail.newWaterHeaterModel || "",
    scopeSummary: caseDetail.scopeSummary || "",
    installCost: caseDetail.installCost || "",
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/crm/rebate-cases/${caseDetail.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases"] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e?.message, variant: "destructive" }),
  });

  function save() {
    updateMutation.mutate({
      ...form,
      householdSize: form.householdSize ? Number(form.householdSize) : null,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Case status</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Application status</Label>
            <Select
              value={form.applicationStatus}
              onValueChange={(v) => setForm({ ...form, applicationStatus: v as RebateApplicationStatus })}
            >
              <SelectTrigger data-testid="select-application-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {APPLICATION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as RebatePriority })}>
              <SelectTrigger data-testid="select-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["low", "normal", "high", "urgent"] as RebatePriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Case # (Neighborly)" value={form.caseNumber} onChange={(v) => setForm({ ...form, caseNumber: v })} testId="input-case-number" />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Client &amp; household</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First name *" value={form.clientFirstName} onChange={(v) => setForm({ ...form, clientFirstName: v })} testId="input-client-first-name" />
          <Field label="Last name" value={form.clientLastName} onChange={(v) => setForm({ ...form, clientLastName: v })} testId="input-client-last-name" />
          <Field label="Phone" value={form.clientPhone} onChange={(v) => setForm({ ...form, clientPhone: v })} testId="input-client-phone" />
          <Field label="Email" value={form.clientEmail} onChange={(v) => setForm({ ...form, clientEmail: v })} testId="input-client-email" />
          <Field label="Household size" value={form.householdSize} onChange={(v) => setForm({ ...form, householdSize: v.replace(/\D/g, "") })} testId="input-household-size" />
          <Field label="Household income" value={form.householdIncome} onChange={(v) => setForm({ ...form, householdIncome: v })} testId="input-household-income" />
          <Field label="AMI bracket" value={form.amiBracket} onChange={(v) => setForm({ ...form, amiBracket: v })} testId="input-ami-bracket" />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Property</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Address" value={form.propertyAddress} onChange={(v) => setForm({ ...form, propertyAddress: v })} testId="input-property-address" />
          <Field label="City" value={form.propertyCity} onChange={(v) => setForm({ ...form, propertyCity: v })} testId="input-property-city" />
          <Field label="State" value={form.propertyState} onChange={(v) => setForm({ ...form, propertyState: v })} testId="input-property-state" />
          <Field label="ZIP" value={form.propertyZip} onChange={(v) => setForm({ ...form, propertyZip: v })} testId="input-property-zip" />
          <Field label="Property type" value={form.propertyType} onChange={(v) => setForm({ ...form, propertyType: v })} testId="input-property-type" />
          <Field label="Ownership status" value={form.ownershipStatus} onChange={(v) => setForm({ ...form, ownershipStatus: v })} testId="input-ownership-status" />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Utility</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Electric utility" value={form.electricUtility} onChange={(v) => setForm({ ...form, electricUtility: v })} testId="input-electric-utility" />
          <Field label="Electric account #" value={form.electricAccountNumber} onChange={(v) => setForm({ ...form, electricAccountNumber: v })} testId="input-electric-account" />
          <Field label="Gas utility" value={form.gasUtility} onChange={(v) => setForm({ ...form, gasUtility: v })} testId="input-gas-utility" />
          <Field label="Gas account #" value={form.gasAccountNumber} onChange={(v) => setForm({ ...form, gasAccountNumber: v })} testId="input-gas-account" />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Existing equipment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Heating type" value={form.existingHeatingType} onChange={(v) => setForm({ ...form, existingHeatingType: v })} testId="input-existing-heating" />
          <Field label="Cooling type" value={form.existingCoolingType} onChange={(v) => setForm({ ...form, existingCoolingType: v })} testId="input-existing-cooling" />
          <Field label="Water heater type" value={form.existingWaterHeaterType} onChange={(v) => setForm({ ...form, existingWaterHeaterType: v })} testId="input-existing-wh" />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">New equipment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Heating brand" value={form.newHeatingBrand} onChange={(v) => setForm({ ...form, newHeatingBrand: v })} testId="input-new-heating-brand" />
          <Field label="Heating model" value={form.newHeatingModel} onChange={(v) => setForm({ ...form, newHeatingModel: v })} testId="input-new-heating-model" />
          <Field label="Cooling brand" value={form.newCoolingBrand} onChange={(v) => setForm({ ...form, newCoolingBrand: v })} testId="input-new-cooling-brand" />
          <Field label="Cooling model" value={form.newCoolingModel} onChange={(v) => setForm({ ...form, newCoolingModel: v })} testId="input-new-cooling-model" />
          <Field label="Water heater brand" value={form.newWaterHeaterBrand} onChange={(v) => setForm({ ...form, newWaterHeaterBrand: v })} testId="input-new-wh-brand" />
          <Field label="Water heater model" value={form.newWaterHeaterModel} onChange={(v) => setForm({ ...form, newWaterHeaterModel: v })} testId="input-new-wh-model" />
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Scope &amp; financials</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Install cost ($)" value={form.installCost} onChange={(v) => setForm({ ...form, installCost: v })} testId="input-install-cost" />
          <Field label="Rebate amount ($)" value={form.rebateAmount} onChange={(v) => setForm({ ...form, rebateAmount: v })} testId="input-rebate-amount" />
          <div className="md:col-span-2 space-y-1.5">
            <Label>Scope summary</Label>
            <Textarea
              rows={3}
              value={form.scopeSummary}
              onChange={(e) => setForm({ ...form, scopeSummary: e.target.value })}
              data-testid="input-scope-summary"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Internal notes about this case..."
            data-testid="input-case-notes"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button
          onClick={save}
          disabled={updateMutation.isPending}
          className="bg-[#711419] hover:bg-[#5a1014] text-white shadow-lg"
          data-testid="button-save-summary"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </div>
  );
}

// ============================================================================
// Workflow tab
// ============================================================================

function WorkflowTab({
  caseDetail,
  toast,
}: {
  caseDetail: RebateCaseDetail;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const updateStep = useMutation({
    mutationFn: async ({ stepId, data }: { stepId: string; data: any }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/crm/rebate-cases/${caseDetail.id}/workflow-steps/${stepId}`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
      toast({ title: "Step updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e?.message, variant: "destructive" }),
  });

  const sorted = useMemo(
    () => [...caseDetail.workflowSteps].sort((a, b) => a.sortOrder - b.sortOrder),
    [caseDetail.workflowSteps],
  );

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Workflow className="h-4 w-4 text-[#711419]" />
          Neighborly application workflow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((step, idx) => (
          <WorkflowStepRow
            key={step.id}
            step={step}
            index={idx}
            onUpdate={(data) => updateStep.mutate({ stepId: step.id, data })}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function WorkflowStepRow({
  step,
  index,
  onUpdate,
}: {
  step: RebateCaseWorkflowStep;
  index: number;
  onUpdate: (data: any) => void;
}) {
  const [notes, setNotes] = useState(step.notes || "");
  const [editingNotes, setEditingNotes] = useState(false);

  const Icon =
    step.status === "complete"
      ? CheckCircle2
      : step.status === "in_progress"
      ? Clock
      : step.status === "waiting"
      ? Clock
      : step.status === "blocked"
      ? AlertCircle
      : Circle;
  const iconColor =
    step.status === "complete"
      ? "text-green-600"
      : step.status === "in_progress"
      ? "text-blue-600"
      : step.status === "waiting"
      ? "text-orange-600"
      : step.status === "blocked"
      ? "text-red-600"
      : "text-slate-400";

  return (
    <div className="flex gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50/50">
      <div className="pt-0.5">
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="font-medium text-slate-900">
              <span className="text-slate-400 text-xs mr-1">#{index + 1}</span>
              {WORKFLOW_STEP_LABELS[step.step]}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{WORKFLOW_STEP_DESCRIPTIONS[step.step]}</p>
          </div>
          <Select
            value={step.status}
            onValueChange={(v) => onUpdate({ status: v as RebateWorkflowStepStatus })}
          >
            <SelectTrigger
              className={`w-[140px] h-8 text-xs ${WORKFLOW_STEP_STATUS_COLORS[step.status]}`}
              data-testid={`select-step-status-${step.step}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["not_started", "in_progress", "complete", "waiting", "blocked"] as RebateWorkflowStepStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {WORKFLOW_STEP_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {editingNotes ? (
          <div className="mt-2 space-y-2">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
              data-testid={`input-step-notes-${step.step}`}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 bg-[#711419] hover:bg-[#5a1014] text-white"
                onClick={() => {
                  onUpdate({ notes });
                  setEditingNotes(false);
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => {
                  setNotes(step.notes || "");
                  setEditingNotes(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-xs">
            {step.notes ? (
              <div className="flex items-start gap-2">
                <p className="text-slate-700 flex-1 whitespace-pre-wrap">{step.notes}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => setEditingNotes(true)}
                  data-testid={`button-edit-step-notes-${step.step}`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-slate-500"
                onClick={() => setEditingNotes(true)}
                data-testid={`button-add-step-notes-${step.step}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add notes
              </Button>
            )}
          </div>
        )}
        {step.completedAt && (
          <p className="text-[11px] text-slate-400 mt-1">
            Completed {new Date(step.completedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Scope checklist tab
// ============================================================================

function ScopeTab({
  caseDetail,
  toast,
}: {
  caseDetail: RebateCaseDetail;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = useMutation({
    mutationFn: async (itemName: string) => {
      const nextOrder = caseDetail.scopeChecklist.length;
      const res = await apiRequest("POST", `/api/crm/rebate-cases/${caseDetail.id}/scope-items`, {
        itemName,
        sortOrder: nextOrder,
      });
      return res.json();
    },
    onSuccess: () => {
      setNewItem("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
    },
    onError: (e: any) => toast({ title: "Failed to add", description: e?.message, variant: "destructive" }),
  });

  const toggleItem = useMutation({
    mutationFn: async ({ itemId, isChecked }: { itemId: string; isChecked: boolean }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/crm/rebate-cases/${caseDetail.id}/scope-items/${itemId}`,
        { isChecked },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/rebate-cases/${caseDetail.id}/scope-items/${itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
    },
  });

  const sorted = useMemo(
    () => [...caseDetail.scopeChecklist].sort((a, b) => a.sortOrder - b.sortOrder),
    [caseDetail.scopeChecklist],
  );

  const checkedCount = sorted.filter((i) => i.isChecked).length;

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[#711419]" />
          Scope of Work checklist
          <span className="text-xs font-normal text-slate-500 ml-2">
            {checkedCount} of {sorted.length} complete
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 p-2 rounded hover:bg-slate-50 group"
            data-testid={`scope-item-${item.id}`}
          >
            <Checkbox
              checked={item.isChecked}
              onCheckedChange={(checked) =>
                toggleItem.mutate({ itemId: item.id, isChecked: !!checked })
              }
              className="mt-0.5"
              data-testid={`checkbox-scope-${item.id}`}
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${item.isChecked ? "line-through text-slate-400" : "text-slate-700"}`}>
                {item.itemName}
              </p>
              {item.notes && <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-red-600"
              onClick={() => deleteItem.mutate(item.id)}
              data-testid={`button-delete-scope-${item.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add scope item..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && newItem.trim()) {
                addItem.mutate(newItem.trim());
              }
            }}
            data-testid="input-new-scope-item"
          />
          <Button
            onClick={() => newItem.trim() && addItem.mutate(newItem.trim())}
            disabled={!newItem.trim() || addItem.isPending}
            className="bg-[#711419] hover:bg-[#5a1014] text-white"
            data-testid="button-add-scope-item"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Documents tab
// ============================================================================

function DocumentsTab({
  caseDetail,
  toast,
}: {
  caseDetail: RebateCaseDetail;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<RebateDocumentCategory>("other");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addDoc = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/crm/rebate-cases/${caseDetail.id}/documents`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
      toast({ title: "Document uploaded" });
    },
    onError: (e: any) => toast({ title: "Failed to upload", description: e?.message, variant: "destructive" }),
  });

  const deleteDoc = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/rebate-cases/${caseDetail.id}/documents/${docId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
      toast({ title: "Document deleted" });
    },
  });

  async function handleFile(file: File) {
    try {
      setUploading(true);
      const tokenRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      });
      const { uploadURL } = await tokenRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Upload failed");

      await addDoc.mutateAsync({
        url: uploadURL,
        name: file.name,
        category,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<RebateDocumentCategory, RebateCaseDocument[]>();
    for (const d of caseDetail.documents) {
      const arr = map.get(d.category) || [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return map;
  }, [caseDetail.documents]);

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#711419]" />
          Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50 rounded-lg">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-xs">Category for next upload</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as RebateDocumentCategory)}>
              <SelectTrigger data-testid="select-document-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DOCUMENT_CATEGORY_LABELS) as RebateDocumentCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {DOCUMENT_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-[#711419] hover:bg-[#5a1014] text-white"
            data-testid="button-upload-document"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload file
          </Button>
        </div>

        {caseDetail.documents.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">No documents yet</p>
            <p className="text-sm mt-1">Upload signed forms, attestations, and supporting docs.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(Object.keys(DOCUMENT_CATEGORY_LABELS) as RebateDocumentCategory[]).map((cat) => {
              const docs = grouped.get(cat);
              if (!docs || docs.length === 0) return null;
              return (
                <div key={cat}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    {DOCUMENT_CATEGORY_LABELS[cat]}
                  </h4>
                  <div className="space-y-1">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 p-2 border border-slate-200 rounded hover:bg-slate-50 group"
                        data-testid={`document-${doc.id}`}
                      >
                        <FileText className="h-4 w-4 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{doc.name}</div>
                          <div className="text-xs text-slate-500">
                            {doc.size ? `${Math.round(doc.size / 1024)} KB` : ""}
                            {doc.size && doc.createdAt ? " · " : ""}
                            {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""}
                          </div>
                        </div>
                        <a href={doc.url} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 opacity-0 group-hover:opacity-100"
                          onClick={() => deleteDoc.mutate(doc.id)}
                          data-testid={`button-delete-document-${doc.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tasks tab
// ============================================================================

function TasksTab({ caseDetail }: { caseDetail: RebateCaseDetail }) {
  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { relatedEntityType: "rebate_case", relatedEntityId: caseDetail.id }],
    queryFn: async () => {
      const res = await fetch(
        `/api/tasks?relatedEntityType=rebate_case&relatedEntityId=${caseDetail.id}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load tasks");
      const body = await res.json();
      return Array.isArray(body) ? body : (body.tasks || []);
    },
  });

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-base">Related tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !tasks || tasks.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <p className="text-sm">No tasks linked to this rebate case yet.</p>
            <Link href="/crm/tasks/board">
              <Button variant="outline" size="sm" className="mt-3">
                Open Tasks board
              </Button>
            </Link>
            <p className="text-xs text-slate-400 mt-2">
              Create a task and set Related Entity = Rebate Case to link it here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <Link key={t.id} href={`/crm/tasks/${t.id}`}>
                <div className="p-3 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm text-slate-900">{t.title}</div>
                    <Badge variant="outline" className="text-xs">{t.status}</Badge>
                  </div>
                  {t.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Activity tab
// ============================================================================

function ActivityTab({
  caseDetail,
  toast,
}: {
  caseDetail: RebateCaseDetail;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [note, setNote] = useState("");

  const addNote = useMutation({
    mutationFn: async (description: string) => {
      const res = await apiRequest("POST", `/api/crm/rebate-cases/${caseDetail.id}/activity`, {
        description,
      });
      return res.json();
    },
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases", caseDetail.id] });
      toast({ title: "Note added" });
    },
    onError: (e: any) => toast({ title: "Failed to add note", description: e?.message, variant: "destructive" }),
  });

  const entries = useMemo(
    () =>
      [...caseDetail.activity].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      ),
    [caseDetail.activity],
  );

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Add note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened? (e.g. 'Left voicemail for customer about HOH form.')"
            data-testid="input-activity-note"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => note.trim() && addNote.mutate(note.trim())}
              disabled={!note.trim() || addNote.isPending}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-add-activity-note"
            >
              {addNote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add note
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#711419]" />
            Activity log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((e) => (
                <div key={e.id} className="flex gap-3" data-testid={`activity-entry-${e.id}`}>
                  <div className="w-2 h-2 rounded-full bg-[#711419] mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {e.action} · {e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
