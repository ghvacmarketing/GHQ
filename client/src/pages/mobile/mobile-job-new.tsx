import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, Plus, Search, Loader2, AlertTriangle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WheelTimePicker } from "@/components/mobile/wheel-time-picker";
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

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#711419]" />
      </div>
    );
  }

  return (
    <MobileCreatePage
      title="New job"
      dirty={dirty}
      exitTo="/mobile/job"
      onSave={() => createWorkOrderMutation.mutate()}
      saveDisabled={!selectedCustomer || !selectedProperty || !woTitle.trim() || !woDescription.trim() || !selectedSlot}
      saving={createWorkOrderMutation.isPending}
      testid="mobile-job-new-page"
    >
      <div className="space-y-4">
        {/* Customer Search */}
        <div className="space-y-2">
          <Label>Customer *</Label>
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div>
                <p className="font-medium text-slate-800">{selectedCustomer.name}</p>
                {selectedCustomer.phone && (
                  <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedCustomer(null);
                  setSelectedProperty(null);
                  setCustomerSearch("");
                }}
                data-testid="button-change-customer"
              >
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-customer-search"
                />
              </div>
              {searchedCustomers.length > 0 && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {searchedCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearch("");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 border-b last:border-b-0"
                      data-testid={`customer-option-${customer.id}`}
                    >
                      <p className="font-medium text-sm">{customer.name}</p>
                      {customer.phone && (
                        <p className="text-xs text-slate-500">{customer.phone}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Property Selection */}
        {selectedCustomer && (
          <div className="space-y-2">
            <Label>Property *</Label>
            {customerProperties.length === 0 ? (
              <p className="text-sm text-slate-500">No properties found for this customer</p>
            ) : customerProperties.length === 1 ? (
              <div className="p-3 bg-slate-50 border rounded-lg">
                <p className="font-medium text-sm">{customerProperties[0].address1}</p>
                <p className="text-xs text-slate-500">
                  {[customerProperties[0].city, customerProperties[0].state, customerProperties[0].zip].filter(Boolean).join(", ")}
                </p>
              </div>
            ) : (
              <Select
                value={selectedProperty?.id || ""}
                onValueChange={(val) => {
                  const prop = customerProperties.find(p => p.id === val);
                  setSelectedProperty(prop || null);
                }}
              >
                <SelectTrigger data-testid="select-property">
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {customerProperties.map((prop) => (
                    <SelectItem key={prop.id} value={prop.id}>
                      {prop.address1} - {prop.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedProperty?.address1 && (
              <iframe
                title="Job location"
                src={`https://www.google.com/maps?q=${encodeURIComponent([selectedProperty.address1, selectedProperty.city, selectedProperty.state, selectedProperty.zip].filter(Boolean).join(", "))}&output=embed`}
                className="h-36 w-full rounded-lg border border-slate-200"
                loading="lazy"
                data-testid="job-location-map"
              />
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

        {/* Schedule - Date Picker and Time Slots */}
        <div className="space-y-3">
          <Label>Schedule *</Label>

          {/* Date Picker */}
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
                data-testid="button-date-picker"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Select a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  // Wheels always show a value, so seed a default 1-hour window.
                  setSelectedStartTime((t) => t || "09:00");
                  setSelectedEndTime((t) => t || "10:00");
                  if (date) setDateOpen(false); // picking a date closes the calendar
                }}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Time selection — alarm-style wheels snapping to the shared increment */}
          {selectedDate && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Start Time</Label>
                <WheelTimePicker
                  value={selectedStartTime}
                  stepMinutes={stepMinutes}
                  onChange={(v) => {
                    setSelectedStartTime(v);
                    // Default the end to 1 hour after the start. 60 min is a
                    // clean multiple of both 15- and 30-min boards, so it
                    // always lands on a valid slot.
                    setSelectedEndTime(addMinutesTo(v, 60));
                  }}
                  testId="wheel-start-time"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">End Time</Label>
                <WheelTimePicker
                  value={selectedEndTime}
                  stepMinutes={stepMinutes}
                  onChange={setSelectedEndTime}
                  testId="wheel-end-time"
                />
              </div>
            </div>
          )}

          {/* Selected Time Display */}
          {selectedSlot && (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              <Clock className="h-4 w-4" />
              <span>
                {format(new Date(selectedSlot.start), "h:mm a")} - {format(new Date(selectedSlot.end), "h:mm a")}
              </span>
            </div>
          )}
        </div>

        {/* Conflict Error */}
        {conflictError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{conflictError}</p>
          </div>
        )}
      </div>

      <Button
        className="h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold hover:bg-[#8a1a1f]"
        onClick={() => createWorkOrderMutation.mutate()}
        disabled={createWorkOrderMutation.isPending || !selectedCustomer || !selectedProperty || !woTitle.trim() || !woDescription.trim() || !selectedSlot}
        data-testid="job-create-save"
      >
        {createWorkOrderMutation.isPending ? <Loader2 className="mr-1.5 h-5 w-5 animate-spin" /> : <Plus className="mr-1.5 h-5 w-5" />}
        Create job
      </Button>
    </MobileCreatePage>
  );
}
