import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Award, Plus, Search, Loader2, ArrowUpRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, RebateCase, RebateProgramType, CrmCustomer } from "@shared/schema";
import {
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS,
  APPLICATION_STATUS_ROW_BG,
  PROGRAM_TYPE_LABELS,
  PROGRAM_TYPE_SHORT,
} from "@/lib/rebate-constants";

function fullName(c: Pick<RebateCase, "clientFirstName" | "clientLastName">): string {
  return [c.clientFirstName, c.clientLastName].filter(Boolean).join(" ") || "(no name)";
}

export default function CrmRebateProgramsPage() {
  usePageTitle("Rebate Programs");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CrmUser>({ queryKey: ["/api/crm/me"] });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: cases, isLoading } = useQuery<RebateCase[]>({
    queryKey: ["/api/crm/rebate-cases"],
  });

  const filtered = useMemo(() => {
    if (!cases) return [];
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter !== "all" && c.applicationStatus !== statusFilter) return false;
      if (programFilter !== "all" && c.programType !== programFilter) return false;
      if (!q) return true;
      return (
        fullName(c).toLowerCase().includes(q) ||
        (c.propertyAddress || "").toLowerCase().includes(q) ||
        (c.clientEmail || "").toLowerCase().includes(q) ||
        (c.clientPhone || "").toLowerCase().includes(q) ||
        (c.caseNumber || "").toLowerCase().includes(q)
      );
    });
  }, [cases, search, statusFilter, programFilter]);

  const stats = useMemo(() => {
    if (!cases) return { total: 0, active: 0, waiting: 0, paid: 0 };
    return {
      total: cases.length,
      active: cases.filter((c) =>
        ["in_progress", "scope_needed", "scope_submitted", "scope_approved", "completion_submitted"].includes(
          c.applicationStatus,
        ),
      ).length,
      waiting: cases.filter((c) => c.applicationStatus.startsWith("waiting")).length,
      paid: cases.filter((c) => c.applicationStatus === "paid" || c.applicationStatus === "approved").length,
    };
  }, [cases]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Award className="h-7 w-7 text-[#711419]" />
              Rebate Programs
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage HEAR &amp; HER electrification rebate applications.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                data-testid="button-create-rebate-case"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Rebate Case
              </Button>
            </DialogTrigger>
            <CreateCaseDialog
              onClose={() => setCreateOpen(false)}
              onCreated={(id) => {
                setCreateOpen(false);
                navigate(`/crm/rebate-programs/${id}`);
              }}
              toast={toast}
            />
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Cases" value={stats.total} />
          <StatCard label="Active" value={stats.active} accent="text-blue-600" />
          <StatCard label="Waiting" value={stats.waiting} accent="text-orange-600" />
          <StatCard label="Approved / Paid" value={stats.paid} accent="text-green-600" />
        </div>

        {/* Filters */}
        <Card className="border-slate-200">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by customer, address, phone, case #..."
                className="pl-9"
                data-testid="input-search-rebate-cases"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {APPLICATION_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {APPLICATION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={programFilter} onValueChange={setProgramFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-program">
                <SelectValue placeholder="All programs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programs</SelectItem>
                <SelectItem value="HEAR">HEAR</SelectItem>
                <SelectItem value="HER">HER</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-slate-200">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Award className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                <p className="font-medium">No rebate cases found</p>
                <p className="text-sm mt-1">
                  {cases && cases.length > 0
                    ? "Try adjusting your filters."
                    : "Create your first rebate case to get started."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Property</TableHead>
                    <TableHead className="w-[90px]">Program</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Case #</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Activity</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer hover:bg-slate-50 ${APPLICATION_STATUS_ROW_BG[c.applicationStatus]}`}
                      onClick={() => navigate(`/crm/rebate-programs/${c.id}`)}
                      data-testid={`row-rebate-case-${c.id}`}
                    >
                      <TableCell className="font-medium">
                        <div>{fullName(c)}</div>
                        {c.clientPhone && (
                          <div className="text-xs text-slate-500 font-normal">{c.clientPhone}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-600">
                        {c.propertyAddress || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {PROGRAM_TYPE_SHORT[c.programType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${APPLICATION_STATUS_COLORS[c.applicationStatus]}`}
                        >
                          {APPLICATION_STATUS_LABELS[c.applicationStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm font-mono text-slate-600">
                        {c.caseNumber || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-slate-500">
                        {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <ArrowUpRight className="h-4 w-4 text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${accent || "text-slate-900"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function CreateCaseDialog({
  onClose,
  onCreated,
  toast,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [programType, setProgramType] = useState<RebateProgramType>("HEAR");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [notes, setNotes] = useState("");

  const { data: customers } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers"],
  });

  const matches = useMemo(() => {
    if (!customers || !customerSearch.trim() || selectedCustomerId) return [];
    const q = customerSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [customers, customerSearch, selectedCustomerId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/rebate-cases", {
        customerId: selectedCustomerId,
        clientFirstName: clientFirstName.trim() || null,
        clientLastName: clientLastName.trim() || null,
        clientEmail: clientEmail.trim() || null,
        clientPhone: clientPhone.trim() || null,
        propertyAddress: propertyAddress.trim() || null,
        programType,
        notes: notes.trim() || null,
      });
      return res.json();
    },
    onSuccess: (created: RebateCase) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/rebate-cases"] });
      toast({ title: "Rebate case created" });
      onCreated(created.id);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create case",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  function pickCustomer(c: CrmCustomer) {
    setSelectedCustomerId(c.id);
    const parts = (c.name || "").trim().split(/\s+/);
    setClientFirstName(parts.shift() || "");
    setClientLastName(parts.join(" "));
    setClientEmail(c.email || "");
    setClientPhone(c.phone || "");
    setCustomerSearch(c.name || "");
  }

  function clearCustomer() {
    setSelectedCustomerId(null);
    setCustomerSearch("");
    setClientFirstName("");
    setClientLastName("");
    setClientEmail("");
    setClientPhone("");
  }

  const canSubmit = (clientFirstName.trim() || clientLastName.trim()) && !createMutation.isPending;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New Rebate Case</DialogTitle>
        <DialogDescription>Create a new HEAR or HER rebate application for a customer.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Program *</Label>
          <Select value={programType} onValueChange={(v) => setProgramType(v as RebateProgramType)}>
            <SelectTrigger data-testid="select-program-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HEAR">{PROGRAM_TYPE_LABELS.HEAR}</SelectItem>
              <SelectItem value="HER">{PROGRAM_TYPE_LABELS.HER}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Find existing customer</Label>
          <div className="relative">
            <Input
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                if (selectedCustomerId) {
                  setSelectedCustomerId(null);
                }
              }}
              placeholder="Search by name, email, phone..."
              data-testid="input-customer-search"
            />
            {selectedCustomerId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearCustomer}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs"
              >
                Clear
              </Button>
            )}
            {matches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-10 max-h-56 overflow-auto">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                    data-testid={`customer-suggestion-${c.id}`}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.phone || c.email || ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">First name *</Label>
            <Input
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
              data-testid="input-client-first-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Last name</Label>
            <Input
              value={clientLastName}
              onChange={(e) => setClientLastName(e.target.value)}
              data-testid="input-client-last-name"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Phone</Label>
            <Input
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              data-testid="input-client-phone"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              data-testid="input-client-email"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Property address</Label>
          <Input
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            placeholder="Street, City, State ZIP"
            data-testid="input-property-address"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional initial notes"
            data-testid="input-case-notes"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
          Cancel
        </Button>
        <Button
          className="bg-[#711419] hover:bg-[#5a1014] text-white"
          disabled={!canSubmit}
          onClick={() => createMutation.mutate()}
          data-testid="button-submit-create-case"
        >
          {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create case
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
