import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  Search, Plus, Filter, Award, Loader2, AlertCircle,
  ChevronRight, User, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertRebateCaseSchema } from "@shared/schema";
import type { RebateCase } from "@shared/schema";
import type { RebateWorkflowStep } from "@shared/schema";
import {
  PROGRAM_TYPE_LABELS, PROGRAM_TYPE_SHORT, APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS, APPLICATION_STATUS_COLORS, APPLICATION_STATUS_ROW_BG,
  WORKFLOW_STEPS_ORDER, WORKFLOW_STEP_LABELS, PRIORITY_LABELS, PRIORITY_COLORS,
} from "@/lib/rebate-constants";

type CrmUser = { id: string; name: string; role: string; isActive: boolean };

type RebateCaseListItem = RebateCase & {
  workflowCompleted: number;
  workflowTotal: number;
  currentStep: RebateWorkflowStep | null;
};

// Quick filter chips definition
const QUICK_FILTERS = [
  { label: "All", status: "" },
  { label: "In Progress", status: "in_progress" },
  { label: "Waiting on Customer", status: "waiting_on_customer" },
  { label: "Scope Needed", status: "scope_needed" },
  { label: "Approved", status: "approved" },
  { label: "Closed", status: "closed" },
];

const createSchema = insertRebateCaseSchema.pick({
  programType: true,
  clientFirstName: true,
  clientLastName: true,
  clientPhone: true,
  clientEmail: true,
  propertyAddress: true,
  propertyCity: true,
  propertyState: true,
  propertyZip: true,
  caseNumber: true,
  assignedToUserId: true,
  priority: true,
}).extend({
  clientFirstName: z.string().min(1, "First name is required"),
  clientLastName: z.string().min(1, "Last name is required"),
});

type CreateFormValues = z.infer<typeof createSchema>;

export default function CrmRebatePrograms() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [quickStatus, setQuickStatus] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProgram, setFilterProgram] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterWorkflowStep, setFilterWorkflowStep] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  const { data: cases = [], isLoading, refetch } = useQuery<RebateCaseListItem[]>({
    queryKey: ["/api/crm/rebate-cases"],
    queryFn: () => fetch("/api/crm/rebate-cases", { credentials: "include" }).then(r => r.json()),
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateFormValues) => apiRequest("POST", "/api/crm/rebate-cases", data),
    onSuccess: async (res: any) => {
      const created = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/crm/rebate-cases"] });
      setShowCreate(false);
      toast({ title: "Case created" });
      if (created?.id) navigate(`/crm/rebate-programs/${created.id}`);
    },
    onError: () => toast({ title: "Failed to create case", variant: "destructive" }),
  });

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      programType: "HEAR",
      priority: "normal",
      clientFirstName: "",
      clientLastName: "",
      clientPhone: "",
      clientEmail: "",
      propertyAddress: "",
      propertyCity: "",
      propertyState: "",
      propertyZip: "",
      caseNumber: "",
      assignedToUserId: null,
    },
  });

  // Apply filters
  const usersMap = new Map(users.map(u => [u.id, u.name]));
  const activeStatus = quickStatus || (filterStatus !== "all" ? filterStatus : "");

  const filtered = cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      [c.clientFirstName, c.clientLastName, c.propertyAddress, c.caseNumber]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
    const matchStatus = !activeStatus || c.applicationStatus === activeStatus;
    const matchProgram = filterProgram === "all" || c.programType === filterProgram;
    const matchAssignee = filterAssignee === "all" ||
      (filterAssignee === "unassigned" ? !c.assignedToUserId : c.assignedToUserId === filterAssignee);
    const matchPriority = filterPriority === "all" || c.priority === filterPriority;
    const matchWorkflowStep = filterWorkflowStep === "all" || c.currentStep === filterWorkflowStep;
    return matchSearch && matchStatus && matchProgram && matchAssignee && matchPriority && matchWorkflowStep;
  });

  const onSubmit = (values: CreateFormValues) => {
    const payload = { ...values };
    if (!payload.caseNumber) delete (payload as any).caseNumber;
    if (!payload.assignedToUserId) delete (payload as any).assignedToUserId;
    createMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#711419] flex items-center justify-center">
              <Award className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Rebate Program Cases</h1>
              <p className="text-xs text-slate-500">HEAR / HER Neighborly rebate application tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014]"
              onClick={() => { form.reset(); setShowCreate(true); }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Case
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        {/* Search + filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Search client, address, case #..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Filter className="w-4 h-4 text-slate-400 ml-1" />
          <Select value={filterProgram} onValueChange={setFilterProgram}>
            <SelectTrigger className="h-9 text-sm w-32"><SelectValue placeholder="Program" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              <SelectItem value="HEAR">HEAR</SelectItem>
              <SelectItem value="HER">HER</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setQuickStatus(""); }}>
            <SelectTrigger className="h-9 text-sm w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {APPLICATION_STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.filter(u => u.isActive).map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              {(["low","normal","high","urgent"] as const).map(p => (
                <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterWorkflowStep} onValueChange={setFilterWorkflowStep}>
            <SelectTrigger className="h-9 text-sm w-48"><SelectValue placeholder="Workflow Step" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workflow Steps</SelectItem>
              {WORKFLOW_STEPS_ORDER.map(step => (
                <SelectItem key={step} value={step}>{WORKFLOW_STEP_LABELS[step]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick-filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {QUICK_FILTERS.map(qf => (
            <button
              key={qf.status}
              onClick={() => { setQuickStatus(qf.status); setFilterStatus("all"); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                quickStatus === qf.status
                  ? "bg-[#711419] text-white border-[#711419]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {qf.label}
              {qf.status === "" && cases.length > 0 && (
                <span className="ml-1.5 bg-white/20 px-1 rounded-full">{cases.length}</span>
              )}
              {qf.status !== "" && (
                <span className="ml-1.5 opacity-70">
                  {cases.filter(c => c.applicationStatus === qf.status).length}
                </span>
              )}
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-auto">
            {filtered.length} of {cases.length} cases
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertCircle className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-500">No cases found</p>
              <p className="text-xs text-slate-400 mt-1">
                {cases.length === 0 ? "Create your first rebate case to get started." : "Try adjusting your filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold text-slate-600 w-28">Case #</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Client</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-20">Program</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-40">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-24">Priority</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-32">Assigned To</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-32">Workflow</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-44">Current Step</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-28">Rebate Amt</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-28">App. Date</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Address</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => {
                    const clientName = [c.clientFirstName, c.clientLastName].filter(Boolean).join(" ") || "—";
                    const assignedName = c.assignedToUserId ? (usersMap.get(c.assignedToUserId) ?? "—") : "—";
                    const rowBg = APPLICATION_STATUS_ROW_BG[c.applicationStatus] || "";
                    return (
                      <TableRow
                        key={c.id}
                        className={`cursor-pointer hover:bg-slate-50 transition-colors ${rowBg}`}
                        onClick={() => navigate(`/crm/rebate-programs/${c.id}`)}
                      >
                        <TableCell className="text-xs font-mono text-slate-600">
                          {c.caseNumber ? `#${c.caseNumber}` : <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-slate-800 whitespace-nowrap">{clientName}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-semibold">
                            {PROGRAM_TYPE_SHORT[c.programType]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border whitespace-nowrap ${APPLICATION_STATUS_COLORS[c.applicationStatus]}`}>
                            {APPLICATION_STATUS_LABELS[c.applicationStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[c.priority]}`}>
                            {PRIORITY_LABELS[c.priority]}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-400" />
                            <span className="whitespace-nowrap">{assignedName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[48px]">
                              <div
                                className="bg-[#711419] h-1.5 rounded-full transition-all"
                                style={{ width: c.workflowTotal > 0 ? `${(c.workflowCompleted / c.workflowTotal) * 100}%` : "0%" }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 whitespace-nowrap">
                              {c.workflowCompleted}/{c.workflowTotal}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                          {c.currentStep
                            ? <span className="font-medium">{WORKFLOW_STEP_LABELS[c.currentStep]}</span>
                            : <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 font-medium">
                          {c.rebateAmount ?? <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {c.applicationDate
                            ? format(new Date(c.applicationDate), "MMM d, yyyy")
                            : <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {[c.propertyAddress, c.propertyCity].filter(Boolean).join(", ") || <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Create Case Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Case</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="programType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Program Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="HEAR">{PROGRAM_TYPE_LABELS.HEAR}</SelectItem>
                        <SelectItem value="HER">{PROGRAM_TYPE_LABELS.HER}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="clientFirstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">First Name *</FormLabel>
                    <FormControl><Input className="h-9 text-sm" {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
                <FormField control={form.control} name="clientLastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Last Name *</FormLabel>
                    <FormControl><Input className="h-9 text-sm" {...field} /></FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="clientPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Phone</FormLabel>
                    <FormControl><Input className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="clientEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Email</FormLabel>
                    <FormControl><Input className="h-9 text-sm" type="email" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="propertyAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Property Address</FormLabel>
                  <FormControl><Input className="h-9 text-sm" placeholder="123 Main St" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="propertyCity" render={({ field }) => (
                  <FormItem className="col-span-1">
                    <FormLabel className="text-xs">City</FormLabel>
                    <FormControl><Input className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="propertyState" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">State</FormLabel>
                    <FormControl><Input className="h-9 text-sm" placeholder="AZ" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="propertyZip" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">ZIP</FormLabel>
                    <FormControl><Input className="h-9 text-sm" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="caseNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Neighborly Case # (optional)</FormLabel>
                    <FormControl><Input className="h-9 text-sm font-mono" placeholder="e.g. 123456" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="assignedToUserId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Assign To</FormLabel>
                    <Select value={field.value ?? "unassigned"} onValueChange={v => field.onChange(v === "unassigned" ? null : v)}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.filter(u => u.isActive).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-[#711419] hover:bg-[#5a1014]"
                >
                  {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Create Case
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
