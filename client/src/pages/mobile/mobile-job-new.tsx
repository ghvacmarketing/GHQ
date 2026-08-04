import { useQuery, useMutation } from "@tanstack/react-query";
import { MapView } from "@/components/mobile/address-autocomplete";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronRight, Clock, Plus, Search, Loader2, AlertTriangle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WheelTimePicker } from "@/components/mobile/wheel-time-picker";
import { CustomerSearchSheet } from "@/components/mobile/customer-search-sheet";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { customerTypeBadge } from "@/pages/mobile/mobile-quote-new";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import type { CrmCustomer, CrmUser, CrmProperty } from "@shared/schema";

function formatSubtype(subtype: string | null | undefined): string {
  if (!subtype) return "";
  return subtype.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * New Job — standalone page. Extracts the create-work-order form that used to
 * live in a bottom-sheet on the jobs list into a full MobileCreatePage. Creates
 * the work order (assigned to self or a teammate), then navigates to the new
 * job's detail page. Supervisor/admin/owner only.
 */
// "09:00" -> "9:00 AM"
function fmt12(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  if (!m) return t || "";
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
function durationLabel(start: string, end: string): string {
  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
  };
  let mins = toMin(end) - toMin(start);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return h > 0 ? (r > 0 ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

// The house full-width calendar look (mirrors the mobile date sheets)
const SCHEDULE_CAL_CLASSNAMES = {
  months: "w-full",
  month: "w-full space-y-4",
  caption: "relative flex items-center justify-center py-1.5",
  caption_label: "text-base font-semibold text-slate-900",
  nav_button:
    "flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-600 shadow-md transition-transform active:scale-95",
  table: "w-full border-collapse",
  head_row: "flex w-full",
  head_cell: "flex-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
  row: "mt-2 flex w-full",
  cell: "relative h-11 flex-1 p-0 text-center text-sm",
  day: "h-11 w-full rounded-md p-0 text-[15px] font-normal aria-selected:opacity-100",
  day_selected: "bg-[#711419] text-white",
  day_today: "font-bold text-[#711419] aria-selected:text-white",
};

export default function MobileJobNew() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Create Work Order form state
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<CrmProperty | null>(null);
  const [woTitle, setWoTitle] = useState("");
  const [woDescription, setWoDescription] = useState("");
  const [visitType, setVisitType] = useState<string>("SERVICE");
  const [workSubtype, setWorkSubtype] = useState<string>("");
  const [priority, setPriority] = useState<string>("normal");
  const [assignTechId, setAssignTechId] = useState<string>(""); // "" = assign to myself
  const [dateOpen, setDateOpen] = useState(false);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [propertySheetOpen, setPropertySheetOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string>("");
  const [selectedEndTime, setSelectedEndTime] = useState<string>("");
  const [conflictError, setConflictError] = useState<string | null>(null);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const isSupervisorPlus = currentUser?.role === 'supervisor' || currentUser?.role === 'admin' || currentUser?.role === 'owner';

  // Role guard: only supervisor/admin/owner can create jobs here.
  useEffect(() => {
    if (currentUser && !isSupervisorPlus) {
      navigate("/mobile/job");
    }
  }, [currentUser, isSupervisorPlus, navigate]);

  // Search customers for work order creation
  const { data: searchedCustomers = [] } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", { search: customerSearch }],
    queryFn: async () => {
      if (!customerSearch.trim()) return [];
      const res = await fetch(`/api/crm/customers?search=${encodeURIComponent(customerSearch)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.customers || [];
    },
    enabled: customerSearch.length >= 2,
    staleTime: 30 * 1000,
  });

  // Fetch properties for selected customer
  const { data: customerProperties = [] } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/properties", { customerId: selectedCustomer?.id }],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const res = await fetch(`/api/crm/properties?customerId=${selectedCustomer.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCustomer?.id,
  });

  // Scheduling increment comes from the shared dispatch-board setting so the
  // mobile picker snaps to the same grid as the board (15 or 30 minutes).
  const { data: dispatchSettings } = useQuery<{ stepMinutes: number }>({
    queryKey: ["/api/crm/dispatch-settings"],
    enabled: !!currentUser,
  });
  const stepMinutes = dispatchSettings?.stepMinutes === 15 ? 15 : 30;

  // Assignable techs (supervisor and owner)
  const { data: boardTechs = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ["/api/crm/technicians"],
    enabled: !!currentUser && (currentUser.role === 'supervisor' || currentUser.role === 'admin' || currentUser.role === 'owner'),
  });

  // Add minutes to an "HH:mm" string, capped at end of day.
  const addMinutesTo = (hhmm: string, minutes: number) => {
    const [h, m] = hhmm.split(":").map(Number);
    const t = Math.min(h * 60 + m + minutes, 23 * 60 + 30);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };

  // Update selectedSlot when date and times are selected, and clear any conflict error
  useEffect(() => {
    // Clear conflict error when user changes time selection
    setConflictError(null);

    if (selectedDate && selectedStartTime && selectedEndTime) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const startISO = new Date(`${dateStr}T${selectedStartTime}:00`).toISOString();
      const endISO = new Date(`${dateStr}T${selectedEndTime}:00`).toISOString();
      setSelectedSlot({ start: startISO, end: endISO });
    } else {
      setSelectedSlot(null);
    }
  }, [selectedDate, selectedStartTime, selectedEndTime]);

  // Work subtypes based on visit type
  const workSubtypes: Record<string, string[]> = {
    SERVICE: ["NO_AC", "NO_HEAT", "WATER_LEAK", "ELECTRICAL", "THERMOSTAT", "NOISE", "ODOR", "MAINTENANCE", "OTHER"],
    INSTALL: ["NEW_SYSTEM", "REPLACEMENT", "UPGRADE", "DUCTWORK", "OTHER"],
    MAINTENANCE: ["PM_VISIT", "FILTER_CHANGE", "INSPECTION", "CLEANING", "OTHER"],
    SALES: ["ESTIMATE", "CONSULTATION", "FOLLOW_UP", "OTHER"],
  };

  // Auto-select property if customer only has one
  useEffect(() => {
    if (customerProperties.length === 1 && !selectedProperty) {
      setSelectedProperty(customerProperties[0]);
    } else if (customerProperties.length > 1 && !selectedProperty) {
      // Several service locations — the picker sheet prompts immediately so
      // a job can never silently land on the wrong property.
      setPropertySheetOpen(true);
    }
  }, [customerProperties, selectedProperty]);

  // Create work order mutation
  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer || !selectedProperty || !currentUser) {
        throw new Error("Missing required fields");
      }
      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId: selectedCustomer.id,
        propertyId: selectedProperty.id,
        title: woTitle.trim(),
        description: woDescription.trim(),
        visitType,
        workSubtype: workSubtype || "OTHER", // subtype is required by the schema; default when left blank
        priority,
        assignedTechId: assignTechId || currentUser.id, // default: self-assign
        scheduledStart: selectedSlot?.start || null,
        scheduledEnd: selectedSlot?.end || null,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: (data: { id?: string }) => {
      const assigneeName = assignTechId && assignTechId !== currentUser?.id
        ? boardTechs.find((t) => t.id === assignTechId)?.name
        : null;
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({
        title: "Work order created",
        description: assigneeName ? `The job has been scheduled to ${assigneeName}` : "The job has been scheduled to you",
      });
      if (data?.id) {
        navigate(`/mobile/job/${data.id}`);
      }
    },
    onError: (error: any) => {
      // Check for scheduling conflict from backend 409 response
      const isConflict =
        error?.data?.error === "SCHEDULING_CONFLICT" ||
        error?.message?.includes("SCHEDULING_CONFLICT") ||
        error?.message?.includes("Scheduling conflict") ||
        error?.status === 409;

      // Check for no maintenance agreement error
      const noAgreement =
        error?.data?.error === "NO_MAINTENANCE_AGREEMENT" ||
        error?.message?.includes("NO_MAINTENANCE_AGREEMENT");

      if (isConflict) {
        setConflictError(assignTechId && assignTechId !== currentUser?.id
          ? "That teammate already has a job scheduled at this time. Please choose a different time slot."
          : "You already have a job scheduled at this time. Please choose a different time slot.");
      } else if (noAgreement) {
        toast({
          title: "No Maintenance Agreement",
          description: error?.data?.details || "This property does not have an active maintenance agreement. Please select a different visit type.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Failed to create work order",
          description: error?.data?.message || error?.message || "Please try again",
          variant: "destructive"
        });
      }
    },
  });

  const dirty =
    !!selectedCustomer ||
    woTitle.trim().length > 0 ||
    woDescription.trim().length > 0 ||
    !!assignTechId ||
    !!selectedDate ||
    visitType !== "SERVICE" ||
    !!workSubtype ||
    priority !== "normal";

  // ── Gibbs create-copilot: he sees this draft and fills fields in place.
  const [gibbsUndo, setGibbsUndo] = useState<Record<string, unknown> | null>(null);
  const copilot = {
    kind: "work order (job)",
    label: "New job",
    getDraft: () => ({
      customerId: selectedCustomer?.id || "",
      customerName: selectedCustomer?.name || "",
      title: woTitle,
      description: woDescription,
      visitType,
      workSubtype,
      priority,
      assignedTechId: assignTechId,
      scheduledDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
      startTime: selectedStartTime,
      endTime: selectedEndTime,
    }),
    applyPatch: (patch: Record<string, unknown>) => {
      const prev: Record<string, unknown> = {};
      const applied: string[] = [];
      const str = (v: unknown) => (typeof v === "string" ? v : null);
      if (str(patch.customerId) && str(patch.customerName)) {
        prev.customer = selectedCustomer;
        setSelectedCustomer({ id: patch.customerId, name: patch.customerName } as CrmCustomer);
        applied.push("customer");
      }
      if (str(patch.title) !== null) { prev.title = woTitle; setWoTitle(patch.title as string); applied.push("title"); }
      if (str(patch.description) !== null) { prev.description = woDescription; setWoDescription(patch.description as string); applied.push("description"); }
      if (str(patch.visitType) && ["SERVICE", "MAINTENANCE", "INSTALL", "SALES"].includes(patch.visitType as string)) {
        prev.visitType = visitType; setVisitType(patch.visitType as string); applied.push("visit type");
      }
      if (str(patch.workSubtype) !== null) { prev.workSubtype = workSubtype; setWorkSubtype(patch.workSubtype as string); applied.push("work type"); }
      if (str(patch.priority) && ["normal", "high", "urgent", "low"].includes(patch.priority as string)) {
        prev.priority = priority; setPriority(patch.priority as string); applied.push("priority");
      }
      if (str(patch.assignedTechId) !== null) { prev.assignedTechId = assignTechId; setAssignTechId(patch.assignedTechId as string); applied.push("assignee"); }
      if (str(patch.scheduledDate) && /^\d{4}-\d{2}-\d{2}$/.test(patch.scheduledDate as string)) {
        prev.scheduledDate = selectedDate;
        setSelectedDate(new Date(`${patch.scheduledDate}T12:00:00`));
        applied.push("date");
      }
      if (str(patch.startTime) !== null) { prev.startTime = selectedStartTime; setSelectedStartTime(patch.startTime as string); applied.push("start time"); }
      if (str(patch.endTime) !== null) { prev.endTime = selectedEndTime; setSelectedEndTime(patch.endTime as string); applied.push("end time"); }
      if (applied.length > 0) setGibbsUndo(prev);
      return applied;
    },
  };
  const undoGibbsFill = () => {
    if (!gibbsUndo) return;
    const u = gibbsUndo;
    if ("customer" in u) setSelectedCustomer((u.customer as CrmCustomer) ?? null);
    if ("title" in u) setWoTitle(u.title as string);
    if ("description" in u) setWoDescription(u.description as string);
    if ("visitType" in u) setVisitType(u.visitType as string);
    if ("workSubtype" in u) setWorkSubtype(u.workSubtype as string);
    if ("priority" in u) setPriority(u.priority as string);
    if ("assignedTechId" in u) setAssignTechId(u.assignedTechId as string);
    if ("scheduledDate" in u) setSelectedDate((u.scheduledDate as Date | undefined) ?? undefined);
    if ("startTime" in u) setSelectedStartTime(u.startTime as string);
    if ("endTime" in u) setSelectedEndTime(u.endTime as string);
    setGibbsUndo(null);
  };

  if (!currentUser) {
    // Blank sheet canvas — the form fades in as soon as the user loads
    return <div className="fixed inset-0 z-[70] bg-slate-50" />;
  }

  return (
    <MobileCreatePage
      title="New job"
      dirty={dirty}
      exitTo="/mobile/job"
      onSave={() => createWorkOrderMutation.mutate()}
      saveLabel="Create job"
      saveDisabled={!selectedCustomer || !selectedProperty || !woTitle.trim() || !woDescription.trim() || !selectedSlot}
      saving={createWorkOrderMutation.isPending}
      assistant={copilot}
      testid="mobile-job-new-page"
    >
      <div className="space-y-4">
        {gibbsUndo && (
          <button
            onClick={undoGibbsFill}
            className="flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.06] px-3 py-2 text-xs font-semibold text-[#711419] active:opacity-80"
            data-testid="gibbs-fill-undo"
          >
            Gibbs filled the form — tap to undo
          </button>
        )}
        {/* Customer — full-sheet lookup, house-style selected card */}
        <div className="space-y-2">
          <Label>Customer *</Label>
          {selectedCustomer ? (
            <div
              className="flex items-center gap-3 rounded-[4px] border border-[#711419]/25 bg-[#711419]/[0.05] px-3.5 py-3"
              data-testid="picked-customer"
            >
              <img src={customerTypeBadge(selectedCustomer.customerType)} alt="" className="h-9 w-9 shrink-0 select-none" draggable={false} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{selectedCustomer.name}</p>
                {selectedCustomer.phone && <p className="truncate text-xs text-slate-500">{selectedCustomer.phone}</p>}
              </div>
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setSelectedProperty(null);
                  setCustomerSheetOpen(true);
                }}
                className="shrink-0 rounded-[4px] border border-slate-300/70 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-95"
                data-testid="button-change-customer"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCustomerSheetOpen(true)}
              className="flex h-11 w-full items-center gap-2.5 rounded-md border border-input bg-white px-3.5 text-left shadow-xs"
              data-testid="input-customer-search"
            >
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-base text-muted-foreground">Search for a customer…</span>
            </button>
          )}
        </div>

        {/* Property — auto-picked when there's one; prompted when several */}
        {selectedCustomer && (
          <div className="space-y-2">
            <Label>Property *</Label>
            {customerProperties.length === 0 ? (
              <p className="text-sm text-slate-500">No properties found for this customer</p>
            ) : selectedProperty ? (
              <div className="flex items-center gap-3 rounded-[4px] border border-slate-300/70 bg-white px-3.5 py-3" data-testid="picked-property">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{selectedProperty.address1}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[selectedProperty.city, selectedProperty.state, selectedProperty.zip].filter(Boolean).join(", ")}
                  </p>
                </div>
                {customerProperties.length > 1 && (
                  <button
                    onClick={() => setPropertySheetOpen(true)}
                    className="shrink-0 rounded-[4px] border border-slate-300/70 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-95"
                    data-testid="button-change-property"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setPropertySheetOpen(true)}
                className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-white px-3.5 text-left shadow-xs"
                data-testid="select-property"
              >
                <span className="text-base text-muted-foreground">Choose which property…</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            )}
            {selectedProperty?.address1 && (
              <div data-testid="job-location-map">
                <MapView
                  query={[selectedProperty.address1, selectedProperty.city, selectedProperty.state, selectedProperty.zip].filter(Boolean).join(", ")}
                  className="h-56"
                />
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div className="space-y-2">
          <Label>Title *</Label>
          <Input
            placeholder="Brief job title..."
            value={woTitle}
            onChange={(e) => setWoTitle(e.target.value)}
            data-testid="input-wo-title"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label>Description *</Label>
          <Textarea
            placeholder="What needs to be done..."
            value={woDescription}
            onChange={(e) => setWoDescription(e.target.value)}
            rows={3}
            data-testid="input-wo-description"
          />
        </div>

        {/* Visit Type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={visitType} onValueChange={(val) => { setVisitType(val); setWorkSubtype(""); }}>
              <SelectTrigger data-testid="select-visit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SERVICE">Service</SelectItem>
                <SelectItem value="INSTALL">Install</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="SALES">Sales</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Subtype</Label>
            <Select value={workSubtype} onValueChange={setWorkSubtype}>
              <SelectTrigger data-testid="select-work-subtype">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {workSubtypes[visitType]?.map((st) => (
                  <SelectItem key={st} value={st}>
                    {formatSubtype(st)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger data-testid="select-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Assign to */}
        <div className="space-y-2">
          <Label>Assign to</Label>
          <Select value={assignTechId || "me"} onValueChange={(val) => setAssignTechId(val === "me" ? "" : val)}>
            <SelectTrigger data-testid="select-assign-tech">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Myself{currentUser?.name ? ` (${currentUser.name})` : ""}</SelectItem>
              {boardTechs
                .filter((t) => t.id !== currentUser?.id)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Schedule — its own sheet (calendar + revolving times); the trigger
            doubles as the summary, replacing the old green strip */}
        <div className="space-y-2">
          <Label>Schedule *</Label>
          <button
            onClick={() => setScheduleOpen(true)}
            className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-white px-3.5 text-left shadow-xs"
            data-testid="button-date-picker"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
              {selectedDate ? (
                <span className="truncate text-base text-slate-900">
                  {format(selectedDate, "EEE, MMM d")} · {fmt12(selectedStartTime)} – {fmt12(selectedEndTime)}
                </span>
              ) : (
                <span className="text-base text-muted-foreground">Pick a date & time…</span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
          {selectedDate && selectedStartTime && selectedEndTime && (
            <p className="flex items-center gap-1.5 pl-1 text-xs text-slate-500" data-testid="schedule-duration">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              {durationLabel(selectedStartTime, selectedEndTime)} visit
            </p>
          )}
        </div>

        <DraggableSheet tall open={scheduleOpen} onOpenChange={setScheduleOpen} title="Schedule" testid="sheet-schedule">
          <h2 className="text-lg font-semibold text-slate-900">When's the visit?</h2>

          <div className="mt-4 px-0.5" style={{ touchAction: "pan-y" }}>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date ?? undefined);
                // Wheels always show a value, so seed a default 1-hour window.
                setSelectedStartTime((t) => t || "09:00");
                setSelectedEndTime((t) => t || "10:00");
              }}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              numberOfMonths={1}
              className="w-full p-0"
              fixedWeeks
              classNames={SCHEDULE_CAL_CLASSNAMES}
            />
          </div>

          {selectedDate && (
            <div className="mt-5 space-y-3">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Start time</p>
                <WheelTimePicker
                  value={selectedStartTime}
                  stepMinutes={stepMinutes}
                  onChange={(v) => {
                    setSelectedStartTime(v);
                    // Default the end to 1 hour after the start.
                    setSelectedEndTime(addMinutesTo(v, 60));
                  }}
                  testId="wheel-start-time"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">End time</p>
                <WheelTimePicker
                  value={selectedEndTime}
                  stepMinutes={stepMinutes}
                  onChange={setSelectedEndTime}
                  testId="wheel-end-time"
                />
              </div>
            </div>
          )}

          <button
            onClick={() => setScheduleOpen(false)}
            disabled={!selectedDate}
            className="mb-2 mt-6 h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            data-testid="schedule-done"
          >
            Done
          </button>
        </DraggableSheet>

        {/* Conflict Error */}
        {conflictError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{conflictError}</p>
          </div>
        )}
      </div>

      {/* Customer lookup — full sheet, address-search style */}
      <CustomerSearchSheet
        open={customerSheetOpen}
        onOpenChange={setCustomerSheetOpen}
        onSelect={(c) => {
          setSelectedCustomer(c);
          setSelectedProperty(null);
        }}
      />

      {/* Property picker — prompts automatically when a customer has several */}
      <DraggableSheet tall open={propertySheetOpen} onOpenChange={setPropertySheetOpen} title="Which property?" testid="sheet-property-picker">
        <h2 className="text-lg font-semibold text-slate-900">Which property?</h2>
        <p className="mt-0.5 truncate text-sm text-slate-500">{selectedCustomer?.name}</p>
        <div className="mt-4 pb-2">
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
            {customerProperties.map((prop, i) => (
              <button
                key={prop.id}
                onClick={() => {
                  setSelectedProperty(prop);
                  setPropertySheetOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                data-testid={`property-option-${prop.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{prop.address1}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {[prop.city, prop.state, prop.zip].filter(Boolean).join(", ")}
                  </span>
                </span>
                {selectedProperty?.id === prop.id && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
              </button>
            ))}
          </div>
        </div>
      </DraggableSheet>
    </MobileCreatePage>
  );
}
