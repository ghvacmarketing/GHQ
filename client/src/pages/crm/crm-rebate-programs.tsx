import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CrmLayout } from "@/components/crm/crm-layout";
import { getQueryFn } from "@/lib/queryClient";
import {
  Search, Plus, Award, Loader2, AlertCircle,
  ChevronRight, User, RefreshCw, X, CheckCircle2,
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
import type { RebateCase, CrmUser } from "@shared/schema";
import type { RebateWorkflowStep } from "@shared/schema";
import {
  PROGRAM_TYPE_LABELS, PROGRAM_TYPE_SHORT, APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS, APPLICATION_STATUS_COLORS, APPLICATION_STATUS_ROW_BG,
  WORKFLOW_STEPS_ORDER, WORKFLOW_STEP_LABELS, PRIORITY_LABELS, PRIORITY_COLORS,
} from "@/lib/rebate-constants";
type CrmCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  fullAddress?: string | null;
};

type RebateCaseListItem = RebateCase & {
  workflowCompleted: number;
  workflowTotal: number;
  currentStep: RebateWorkflowStep | null;
};

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
  caseNumber: true,
  assignedToUserId: true,
  priority: true,
  customerId: true,
}).extend({
  caseNumber: z.string().min(1, "Neighborly case # is required"),
});

type CreateFormValues = z.infer<typeof createSchema>;

export default function CrmRebatePrograms() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [filterProgram, setFilterProgram] = useState("all");
  const [filterWorkflowStep, setFilterWorkflowStep] = useState("all");

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<"case_number" | "details">("case_number");
  const [caseNumberInput, setCaseNumberInput] = useState("");
  const [caseNumberError, setCaseNumberError] = useState("");

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerSearch(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: cases = [], isLoading, refetch } = useQuery<RebateCaseListItem[]>({
    queryKey: ["/api/crm/rebate-cases"],
    queryFn: () => fetch("/api/crm/rebate-cases", { credentials: "include" }).then(r => r.json()),
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
  });

  const { data: customerResults = [], isFetching: customerLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", { search: debouncedCustomerSearch }],
    queryFn: async () => {
      if (debouncedCustomerSearch.length < 2) return [];
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(debouncedCustomerSearch)}&limit=20`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.customers ?? []);
    },
    enabled: debouncedCustomerSearch.length >= 2,
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
      caseNumber: "",
      assignedToUserId: null,
      customerId: null,
    },
  });

  const usersMap = new Map(users.map(u => [u.id, u.name]));

  const filtered = cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      [c.clientFirstName, c.clientLastName, c.propertyAddress, c.caseNumber]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
    const matchStatus = !activeTab || c.applicationStatus === activeTab;
    const matchProgram = filterProgram === "all" || c.programType === filterProgram;
    const matchWorkflowStep = filterWorkflowStep === "all" || c.currentStep === filterWorkflowStep;
    return matchSearch && matchStatus && matchProgram && matchWorkflowStep;
  });

  function handleSelectCustomer(customer: CrmCustomer) {
    setSelectedCustomer(customer);
    setCustomerSearch("");
    setShowCustomerDropdown(false);
    const parts = customer.name.trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";
    form.setValue("clientFirstName", firstName);
    form.setValue("clientLastName", lastName);
    form.setValue("clientPhone", customer.phone ?? "");
    form.setValue("clientEmail", customer.email ?? "");
    form.setValue("propertyAddress", customer.fullAddress ?? "");
    form.setValue("customerId", customer.id);
  }

  function clearSelectedCustomer() {
    setSelectedCustomer(null);
    form.setValue("clientFirstName", "");
    form.setValue("clientLastName", "");
    form.setValue("clientPhone", "");
    form.setValue("clientEmail", "");
    form.setValue("propertyAddress", "");
    form.setValue("customerId", null);
  }

  function openCreateDialog() {
    form.reset({
      programType: "HEAR",
      priority: "normal",
      clientFirstName: "",
      clientLastName: "",
      clientPhone: "",
      clientEmail: "",
      propertyAddress: "",
      caseNumber: "",
      assignedToUserId: null,
      customerId: null,
    });
    setCaseNumberInput("");
    setCaseNumberError("");
    setSelectedCustomer(null);
    setCustomerSearch("");
    setStep("case_number");
    setShowCreate(true);
  }

  function handleContinue() {
    if (!caseNumberInput.trim()) {
      setCaseNumberError("Neighborly case # is required to continue");
      return;
    }
    form.setValue("caseNumber", caseNumberInput.trim());
    setCaseNumberError("");
    setStep("details");
  }

  const onSubmit = (values: CreateFormValues) => {
    const payload = { ...values };
    if (!payload.assignedToUserId) delete (payload as any).assignedToUserId;
    if (!payload.customerId) delete (payload as any).customerId;
    createMutation.mutate(payload);
  };

  if (authLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
    <div className="space-y-4">

      {/* Centered search bar */}
      <div className="flex justify-center">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search client, address, case #..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
          />
        </div>
      </div>

      {/* Title row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rebate Program Cases</h1>
          <p className="text-sm text-slate-500">
            {filtered.length} {filtered.length === 1 ? "case" : "cases"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterProgram} onValueChange={setFilterProgram}>
            <SelectTrigger className="w-[130px] h-8 text-xs border-slate-200 focus:ring-0 focus:ring-offset-0">
              <SelectValue placeholder="All Programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              <SelectItem value="HEAR">HEAR</SelectItem>
              <SelectItem value="HER">HER</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterWorkflowStep} onValueChange={setFilterWorkflowStep}>
            <SelectTrigger className="w-[160px] h-8 text-xs border-slate-200 focus:ring-0 focus:ring-offset-0">
              <SelectValue placeholder="All Workflow Steps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workflow Steps</SelectItem>
              {WORKFLOW_STEPS_ORDER.map(s => (
                <SelectItem key={s} value={s}>{WORKFLOW_STEP_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-[#711419] hover:bg-[#5a1014] text-white"
            onClick={openCreateDialog}
          >
            <Plus className="w-4 h-4 mr-1" />
            New Case
          </Button>
        </div>
      </div>

      {/* Underline status tabs */}
      <div className="flex overflow-x-auto overflow-y-hidden border-b border-slate-200">
        {QUICK_FILTERS.map(qf => {
          const count = qf.status === "" ? cases.length : cases.filter(c => c.applicationStatus === qf.status).length;
          return (
            <button
              key={qf.status}
              onClick={() => setActiveTab(qf.status)}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === qf.status
                  ? "border-[#711419] text-[#711419]"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              {qf.label}
              <span className={`ml-1.5 text-xs ${activeTab === qf.status ? "text-[#711419]" : "text-slate-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
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

      {/* Create Case Dialog */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) setShowCreate(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {step === "case_number" ? "Enter Neighborly Case #" : "New Rebate Case"}
            </DialogTitle>
          </DialogHeader>

          {step === "case_number" ? (
            /* ── Step 1: Case number gate ── */
            <div className="space-y-4 py-1">
              <p className="text-sm text-slate-500">
                Every rebate case requires a Neighborly case number. Enter it below to continue.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Neighborly Case #</label>
                <Input
                  autoFocus
                  className="h-9 text-sm font-mono"
                  placeholder="e.g. 123456"
                  value={caseNumberInput}
                  onChange={e => { setCaseNumberInput(e.target.value); if (caseNumberError) setCaseNumberError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleContinue(); } }}
                />
                {caseNumberError && (
                  <p className="text-xs text-red-500">{caseNumberError}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="bg-[#711419] hover:bg-[#5a1014] text-white"
                  onClick={handleContinue}
                >
                  Continue
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* ── Step 2: Details ── */
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-1">
                {/* Case # confirmation pill */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-[#711419] shrink-0" />
                  <span className="text-xs text-slate-500">Case #</span>
                  <span className="text-sm font-mono font-medium text-slate-800">{caseNumberInput}</span>
                  <button
                    type="button"
                    className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline"
                    onClick={() => setStep("case_number")}
                  >
                    Edit
                  </button>
                </div>

                {/* Customer search */}
                <div className="space-y-1.5" ref={customerSearchRef}>
                  <label className="text-xs font-medium text-slate-700">Customer</label>
                  {selectedCustomer ? (
                    <div className="flex items-center gap-2 border border-slate-200 rounded-md px-3 py-2 bg-white">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{selectedCustomer.name}</p>
                        {(selectedCustomer.phone || selectedCustomer.email) && (
                          <p className="text-xs text-slate-400 truncate">
                            {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {selectedCustomer.fullAddress && (
                          <p className="text-xs text-slate-400 truncate">{selectedCustomer.fullAddress}</p>
                        )}
                      </div>
                      <button type="button" onClick={clearSelectedCustomer} className="shrink-0 text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <Input
                        className="pl-8 h-9 text-sm"
                        placeholder="Search by name, phone, or address..."
                        value={customerSearch}
                        onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                        onFocus={() => { if (customerSearch.length >= 2) setShowCustomerDropdown(true); }}
                        autoComplete="off"
                      />
                      {showCustomerDropdown && customerSearch.length >= 2 && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
                          {customerLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            </div>
                          ) : customerResults.length > 0 ? (
                            customerResults.map(customer => (
                              <button
                                key={customer.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                                onClick={() => handleSelectCustomer(customer)}
                              >
                                <p className="text-sm font-medium text-slate-800">{customer.name}</p>
                                {(customer.phone || customer.email) && (
                                  <p className="text-xs text-slate-400">
                                    {[customer.phone, customer.email].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                                {customer.fullAddress && (
                                  <p className="text-xs text-slate-400 truncate">{customer.fullAddress}</p>
                                )}
                              </button>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 text-center py-4">No customers found</p>
                          )}
                        </div>
                      )}
                      {!showCustomerDropdown && customerSearch.length === 0 && (
                        <p className="text-xs text-slate-400 mt-1">Type to search existing customers</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Program + Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="programType" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Program</FormLabel>
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

                {/* Assign To */}
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

                <DialogFooter className="pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createMutation.isPending}
                    className="bg-[#711419] hover:bg-[#5a1014] text-white"
                  >
                    {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                    Create Case
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </CrmLayout>
  );
}
