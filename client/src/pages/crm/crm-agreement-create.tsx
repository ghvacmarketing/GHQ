import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  Save,
  X,
  Plus,
  Trash2,
  Wrench,
  Calendar,
  User,
  FileCheck,
  Clock,
  DollarSign,
  CheckCircle2,
  ArrowUpCircle,
  Loader2,
  Package,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format, addMonths, addYears } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, MaintenanceRegion, CrmCustomer } from "@shared/schema";

type CustomersResponse = {
  customers: CrmCustomer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TaskForm = {
  id: string;
  taskName: string;
  duration: number;
  amount: string;
  requiresConfirmation: boolean;
  allowUpgrade: boolean;
  notes: string;
  equipment: EquipmentItem[];
  parts: PartItem[];
  schedule: ScheduleConfig;
};

type EquipmentItem = {
  id: string;
  equipmentName: string;
  make: string;
  model: string;
  serialNumber: string;
  location: string;
};

type PartItem = {
  id: string;
  partName: string;
  partNumber: string;
  quantity: number;
  unitCost: string;
  unitPrice: string;
  isBillable: boolean;
};

type ScheduleConfig = {
  frequency: "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  intervalValue: number;
  dayOfMonth?: number;
  activeMonths?: number[];
};

const frequencyLabels: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

function generateId() {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function CrmAgreementCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<CrmCustomer | null>(null);

  const [agreementPlan, setAgreementPlan] = useState("Annual Maintenance Agreement");
  const [contractDate, setContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [appointmentDate, setAppointmentDate] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addYears(new Date(), 1), "yyyy-MM-dd"));
  const [regionId, setRegionId] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("229.00");

  const [tasks, setTasks] = useState<TaskForm[]>([]);
  const [editingEquipmentTaskId, setEditingEquipmentTaskId] = useState<string | null>(null);
  const [editingScheduleTaskId, setEditingScheduleTaskId] = useState<string | null>(null);
  const [editingPartsTaskId, setEditingPartsTaskId] = useState<string | null>(null);
  const [editingPartsBillable, setEditingPartsBillable] = useState<boolean>(false);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const { data: customersData, isLoading: customersLoading } = useQuery<CustomersResponse>({
    queryKey: ["/api/crm/customers", customerSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "50",
      });
      if (customerSearch) {
        params.set("search", customerSearch);
      }
      const res = await fetch(`/api/crm/customers?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const { data: regions = [] } = useQuery<MaintenanceRegion[]>({
    queryKey: ["/api/crm/maintenance-regions"],
    queryFn: async () => {
      const res = await fetch("/api/crm/maintenance-regions", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch regions");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const handleContractDateChange = (newContractDate: string) => {
    setContractDate(newContractDate);
    setInvoiceDate(newContractDate);
    setStartDate(newContractDate);
    if (newContractDate) {
      const contractDateObj = new Date(newContractDate);
      setAppointmentDate(format(addMonths(contractDateObj, 1), "yyyy-MM-dd"));
      setEndDate(format(addYears(contractDateObj, 1), "yyyy-MM-dd"));
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = customersData?.customers.find(c => c.id === customerId);
    setSelectedCustomer(customer || null);
  };

  const addTask = () => {
    const newTask: TaskForm = {
      id: generateId(),
      taskName: "",
      duration: 60,
      amount: "0.00",
      requiresConfirmation: true,
      allowUpgrade: false,
      notes: "",
      equipment: [],
      parts: [],
      schedule: {
        frequency: "yearly",
        intervalValue: 1,
        activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    };
    setTasks([...tasks, newTask]);
  };

  const updateTask = (taskId: string, updates: Partial<TaskForm>) => {
    setTasks(tasks.map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    ));
  };

  const removeTask = (taskId: string) => {
    setTasks(tasks.filter(task => task.id !== taskId));
  };

  const addEquipment = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newEquipment: EquipmentItem = {
      id: generateId(),
      equipmentName: "",
      make: "",
      model: "",
      serialNumber: "",
      location: "",
    };
    
    updateTask(taskId, {
      equipment: [...task.equipment, newEquipment],
    });
  };

  const updateEquipment = (taskId: string, equipmentId: string, updates: Partial<EquipmentItem>) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    updateTask(taskId, {
      equipment: task.equipment.map(eq =>
        eq.id === equipmentId ? { ...eq, ...updates } : eq
      ),
    });
  };

  const removeEquipment = (taskId: string, equipmentId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    updateTask(taskId, {
      equipment: task.equipment.filter(eq => eq.id !== equipmentId),
    });
  };

  const addPart = (taskId: string, isBillable: boolean) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newPart: PartItem = {
      id: generateId(),
      partName: "",
      partNumber: "",
      quantity: 1,
      unitCost: "0.00",
      unitPrice: "0.00",
      isBillable,
    };
    
    updateTask(taskId, {
      parts: [...task.parts, newPart],
    });
  };

  const updatePart = (taskId: string, partId: string, updates: Partial<PartItem>) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    updateTask(taskId, {
      parts: task.parts.map(p =>
        p.id === partId ? { ...p, ...updates } : p
      ),
    });
  };

  const removePart = (taskId: string, partId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    updateTask(taskId, {
      parts: task.parts.filter(p => p.id !== partId),
    });
  };

  const openPartsSheet = (taskId: string, isBillable: boolean) => {
    setEditingPartsTaskId(taskId);
    setEditingPartsBillable(isBillable);
  };

  const monthNames = [
    { value: 1, label: "Jan" },
    { value: 2, label: "Feb" },
    { value: 3, label: "Mar" },
    { value: 4, label: "Apr" },
    { value: 5, label: "May" },
    { value: 6, label: "Jun" },
    { value: 7, label: "Jul" },
    { value: 8, label: "Aug" },
    { value: 9, label: "Sep" },
    { value: 10, label: "Oct" },
    { value: 11, label: "Nov" },
    { value: 12, label: "Dec" },
  ];

  const toggleMonth = (taskId: string, month: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const activeMonths = task.schedule.activeMonths || [];
    const newMonths = activeMonths.includes(month)
      ? activeMonths.filter(m => m !== month)
      : [...activeMonths, month].sort((a, b) => a - b);
    
    updateTask(taskId, {
      schedule: { ...task.schedule, activeMonths: newMonths },
    });
  };

  const selectAllMonths = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    updateTask(taskId, {
      schedule: { ...task.schedule, activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    });
  };

  const totalAmount = useMemo(() => {
    return tasks.reduce((sum, task) => sum + parseFloat(task.amount || "0"), 0);
  }, [tasks]);

  const createAgreementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) {
        throw new Error("Please select a customer");
      }
      if (!agreementPlan.trim()) {
        throw new Error("Agreement plan name is required");
      }

      const agreementNumber = `AGR-${Date.now().toString(36).toUpperCase()}`;

      const agreementData = {
        agreementNumber,
        customerId: selectedCustomerId,
        customerName: selectedCustomer.name,
        agreementPlan,
        address: selectedCustomer.fullAddress || "",
        contractDate,
        appointmentDate,
        startDate,
        endDate,
        nextServiceDate: appointmentDate,
        nextInvoiceDate: invoiceDate,
        price: (totalAmount > 0 ? totalAmount : parseFloat(price)).toFixed(2),
        regionId: regionId || null,
        autoRenew,
        notes,
        status: "active" as const,
      };

      const res = await apiRequest("POST", "/api/crm/agreements", agreementData);
      const agreement = await res.json();

      if (tasks.length > 0) {
        const tasksPayload = tasks.map((task, index) => ({
          taskName: task.taskName,
          duration: task.duration,
          amount: task.amount,
          requiresConfirmation: task.requiresConfirmation,
          allowUpgrade: task.allowUpgrade,
          notes: task.notes,
          sortOrder: index,
          equipment: task.equipment.map(eq => ({
            equipmentName: eq.equipmentName,
            make: eq.make,
            model: eq.model,
            serialNumber: eq.serialNumber,
            location: eq.location,
          })),
          schedule: task.schedule,
        }));

        await apiRequest("POST", `/api/crm/agreements/${agreement.id}/tasks/batch`, {
          tasks: tasksPayload,
        });
      }

      return agreement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      toast({ title: "Agreement created successfully" });
      navigate("/crm/agreements");
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to create agreement", variant: "destructive" });
    },
  });

  const handleSave = () => {
    createAgreementMutation.mutate();
  };

  const getVisitSummary = () => {
    if (!appointmentDate) return null;
    try {
      const firstVisit = new Date(appointmentDate);
      const secondVisit = addMonths(firstVisit, 6);
      return {
        firstVisit: format(firstVisit, "MMM d, yyyy"),
        secondVisit: format(secondVisit, "MMM d, yyyy"),
      };
    } catch {
      return null;
    }
  };

  const visitSummary = getVisitSummary();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const editingEquipmentTask = tasks.find(t => t.id === editingEquipmentTaskId);
  const editingPartsTask = tasks.find(t => t.id === editingPartsTaskId);
  const filteredParts = editingPartsTask?.parts.filter(p => p.isBillable === editingPartsBillable) || [];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/crm/agreements")}
                className="text-slate-600 hover:text-slate-900"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <h1 className="text-lg font-semibold text-slate-900" data-testid="text-page-title">
                New Maintenance Agreement
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/crm/agreements")}
                data-testid="button-cancel"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#711419] hover:bg-[#5a1014]"
                onClick={handleSave}
                disabled={createAgreementMutation.isPending}
                data-testid="button-save"
              >
                {createAgreementMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Agreement
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex gap-6">
            <div className="flex-1 space-y-6">
              <Card data-testid="card-customer-info">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-[#711419]" />
                    Customer & Agreement Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="customer" className="text-sm font-medium">Customer</Label>
                      <Select
                        value={selectedCustomerId}
                        onValueChange={handleCustomerSelect}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-customer">
                          <SelectValue placeholder="Select a customer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {customersData?.customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name} {customer.fullAddress ? `- ${customer.fullAddress}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="agreementPlan" className="text-sm font-medium">Agreement Plan Name</Label>
                      <Input
                        id="agreementPlan"
                        value={agreementPlan}
                        onChange={(e) => setAgreementPlan(e.target.value)}
                        className="mt-1"
                        placeholder="e.g., Annual Maintenance Agreement"
                        data-testid="input-agreement-plan"
                      />
                    </div>

                    <div>
                      <Label htmlFor="contractDate" className="text-sm font-medium">Contract Date</Label>
                      <Input
                        id="contractDate"
                        type="date"
                        value={contractDate}
                        onChange={(e) => handleContractDateChange(e.target.value)}
                        className="mt-1"
                        data-testid="input-contract-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="invoiceDate" className="text-sm font-medium">Invoice Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-invoice-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="appointmentDate" className="text-sm font-medium">First Appointment Date</Label>
                      <Input
                        id="appointmentDate"
                        type="date"
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-appointment-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="region" className="text-sm font-medium">Region</Label>
                      <Select value={regionId} onValueChange={setRegionId}>
                        <SelectTrigger className="mt-1" data-testid="select-region">
                          <SelectValue placeholder="Select region..." />
                        </SelectTrigger>
                        <SelectContent>
                          {regions.map((region) => (
                            <SelectItem key={region.id} value={region.id}>
                              {region.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="startDate" className="text-sm font-medium">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-start-date"
                      />
                    </div>

                    <div>
                      <Label htmlFor="endDate" className="text-sm font-medium">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1"
                        data-testid="input-end-date"
                      />
                    </div>

                    <div className="col-span-2 flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">Auto-Renew</Label>
                        <p className="text-xs text-slate-500">Automatically renew this agreement when it expires</p>
                      </div>
                      <Switch
                        checked={autoRenew}
                        onCheckedChange={setAutoRenew}
                        data-testid="switch-auto-renew"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-1"
                        placeholder="Additional notes about this agreement..."
                        rows={3}
                        data-testid="textarea-notes"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-tasks">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-[#711419]" />
                      Maintenance Schedule
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addTask}
                      data-testid="button-add-task"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Task
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No tasks added yet</p>
                      <p className="text-xs mt-1">Click "Add Task" to define maintenance tasks</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="font-semibold">Task</TableHead>
                            <TableHead className="font-semibold text-center w-24">
                              <div className="flex items-center justify-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Confirm
                              </div>
                            </TableHead>
                            <TableHead className="font-semibold text-center w-24">
                              <div className="flex items-center justify-center gap-1">
                                <ArrowUpCircle className="h-3 w-3" />
                                Upgrade
                              </div>
                            </TableHead>
                            <TableHead className="font-semibold text-center w-24">
                              <div className="flex items-center justify-center gap-1">
                                <Clock className="h-3 w-3" />
                                Duration
                              </div>
                            </TableHead>
                            <TableHead className="font-semibold text-center w-28">Equipment</TableHead>
                            <TableHead className="font-semibold text-center w-28">Non Billable</TableHead>
                            <TableHead className="font-semibold text-center w-28">Billable</TableHead>
                            <TableHead className="font-semibold text-center w-28">Timetable</TableHead>
                            <TableHead className="font-semibold text-right w-28">
                              <div className="flex items-center justify-end gap-1">
                                <DollarSign className="h-3 w-3" />
                                Amount
                              </div>
                            </TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tasks.map((task) => (
                            <TableRow key={task.id} data-testid={`task-row-${task.id}`}>
                              <TableCell>
                                <Input
                                  value={task.taskName}
                                  onChange={(e) => updateTask(task.id, { taskName: e.target.value })}
                                  placeholder="Task name..."
                                  className="h-8 text-sm"
                                  data-testid={`input-task-name-${task.id}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch
                                  checked={task.requiresConfirmation}
                                  onCheckedChange={(checked) => updateTask(task.id, { requiresConfirmation: checked })}
                                  data-testid={`switch-confirm-${task.id}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch
                                  checked={task.allowUpgrade}
                                  onCheckedChange={(checked) => updateTask(task.id, { allowUpgrade: checked })}
                                  data-testid={`switch-upgrade-${task.id}`}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Input
                                  type="number"
                                  value={task.duration}
                                  onChange={(e) => updateTask(task.id, { duration: parseInt(e.target.value) || 60 })}
                                  className="h-8 w-16 text-sm text-center mx-auto"
                                  data-testid={`input-duration-${task.id}`}
                                />
                                <span className="text-xs text-slate-500">min</span>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingEquipmentTaskId(task.id)}
                                  className="h-7 text-xs"
                                  data-testid={`button-equipment-${task.id}`}
                                >
                                  <Wrench className="h-3 w-3 mr-1" />
                                  {task.equipment.length || "0"}
                                </Button>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPartsSheet(task.id, false)}
                                  className="h-7 text-xs"
                                  data-testid={`button-parts-nonbillable-${task.id}`}
                                >
                                  <Package className="h-3 w-3 mr-1" />
                                  {task.parts.filter(p => !p.isBillable).length || "0"}
                                </Button>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPartsSheet(task.id, true)}
                                  className="h-7 text-xs"
                                  data-testid={`button-parts-billable-${task.id}`}
                                >
                                  <Package className="h-3 w-3 mr-1 text-green-600" />
                                  {task.parts.filter(p => p.isBillable).length || "0"}
                                </Button>
                              </TableCell>
                              <TableCell className="text-center">
                                <Popover
                                  open={editingScheduleTaskId === task.id}
                                  onOpenChange={(open) => setEditingScheduleTaskId(open ? task.id : null)}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      data-testid={`button-schedule-${task.id}`}
                                    >
                                      <Calendar className="h-3 w-3 mr-1" />
                                      {frequencyLabels[task.schedule.frequency]}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80 p-4">
                                    <div className="space-y-4">
                                      <div>
                                        <Label className="text-sm font-medium">Schedule Frequency</Label>
                                        <Select
                                          value={task.schedule.frequency}
                                          onValueChange={(value: "weekly" | "monthly" | "quarterly" | "yearly" | "custom") =>
                                            updateTask(task.id, {
                                              schedule: { ...task.schedule, frequency: value },
                                            })
                                          }
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                            <SelectItem value="quarterly">Quarterly</SelectItem>
                                            <SelectItem value="yearly">Yearly</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      <div>
                                        <Label className="text-sm font-medium">Repeat:</Label>
                                        <Select
                                          value={`every-${task.schedule.intervalValue || 1}`}
                                          onValueChange={(value) => {
                                            const interval = parseInt(value.replace("every-", "")) || 1;
                                            updateTask(task.id, {
                                              schedule: { ...task.schedule, intervalValue: interval },
                                            });
                                          }}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="every-1">Every {task.schedule.frequency === "weekly" ? "Week" : task.schedule.frequency === "monthly" ? "Month" : task.schedule.frequency === "quarterly" ? "Quarter" : "Year"}</SelectItem>
                                            <SelectItem value="every-2">Every 2 {task.schedule.frequency === "weekly" ? "Weeks" : task.schedule.frequency === "monthly" ? "Months" : task.schedule.frequency === "quarterly" ? "Quarters" : "Years"}</SelectItem>
                                            <SelectItem value="every-3">Every 3 {task.schedule.frequency === "weekly" ? "Weeks" : task.schedule.frequency === "monthly" ? "Months" : task.schedule.frequency === "quarterly" ? "Quarters" : "Years"}</SelectItem>
                                            <SelectItem value="every-6">Every 6 {task.schedule.frequency === "weekly" ? "Weeks" : task.schedule.frequency === "monthly" ? "Months" : task.schedule.frequency === "quarterly" ? "Quarters" : "Years"}</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      {(task.schedule.frequency === "monthly" || task.schedule.frequency === "custom") && (
                                        <div>
                                          <Label className="text-sm font-medium">Day of Month</Label>
                                          <Input
                                            type="number"
                                            min={1}
                                            max={31}
                                            value={task.schedule.dayOfMonth || 1}
                                            onChange={(e) =>
                                              updateTask(task.id, {
                                                schedule: { ...task.schedule, dayOfMonth: parseInt(e.target.value) || 1 },
                                              })
                                            }
                                            className="h-8 mt-1"
                                          />
                                        </div>
                                      )}

                                      <div>
                                        <div className="flex items-center justify-between mb-2">
                                          <Label className="text-sm font-medium">Active Months</Label>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => selectAllMonths(task.id)}
                                            className="h-6 text-xs text-[#711419]"
                                          >
                                            Select All
                                          </Button>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                          {monthNames.map((month) => (
                                            <label
                                              key={month.value}
                                              className="flex items-center gap-1.5 cursor-pointer"
                                            >
                                              <Checkbox
                                                checked={(task.schedule.activeMonths || []).includes(month.value)}
                                                onCheckedChange={() => toggleMonth(task.id, month.value)}
                                                className="h-4 w-4"
                                              />
                                              <span className="text-xs">{month.label}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-sm text-slate-500">$</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={task.amount}
                                    onChange={(e) => updateTask(task.id, { amount: e.target.value })}
                                    className="h-8 w-20 text-sm text-right"
                                    data-testid={`input-amount-${task.id}`}
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeTask(task.id)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                  data-testid={`button-remove-task-${task.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="w-80 flex-shrink-0">
              <div className="sticky top-20">
                <Card className="border-[#711419]/20" data-testid="card-summary">
                  <CardHeader className="pb-3 bg-[#711419]/5 border-b">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-[#711419]" />
                      Agreement Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Customer</p>
                      <p className="font-medium text-slate-900" data-testid="text-summary-customer">
                        {selectedCustomer?.name || "Not selected"}
                      </p>
                      {selectedCustomer?.fullAddress && (
                        <p className="text-xs text-slate-500 mt-0.5">{selectedCustomer.fullAddress}</p>
                      )}
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Plan</p>
                      <p className="font-medium text-slate-900" data-testid="text-summary-plan">
                        {agreementPlan || "Not specified"}
                      </p>
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Tasks</p>
                        <p className="font-medium text-slate-900" data-testid="text-summary-tasks">
                          {tasks.length}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Total Amount</p>
                        <p className="text-xl font-bold text-[#711419]" data-testid="text-summary-total">
                          ${totalAmount.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="h-px bg-slate-100" />

                    {visitSummary && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Scheduled Visits</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-sm">
                            <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-green-700">1</span>
                            </div>
                            <span>{visitSummary.firstVisit}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-blue-700">2</span>
                            </div>
                            <span>{visitSummary.secondVisit}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="h-px bg-slate-100" />

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Start</p>
                        <p className="font-medium">{startDate ? format(new Date(startDate), "MMM d, yyyy") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">End</p>
                        <p className="font-medium">{endDate ? format(new Date(endDate), "MMM d, yyyy") : "—"}</p>
                      </div>
                    </div>

                    {autoRenew && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg text-sm text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Auto-renew enabled
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        <Sheet open={!!editingEquipmentTaskId} onOpenChange={(open) => !open && setEditingEquipmentTaskId(null)}>
          <SheetContent className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle>Equipment for Task</SheetTitle>
              <SheetDescription>
                {editingEquipmentTask?.taskName || "Add equipment items for this maintenance task"}
              </SheetDescription>
            </SheetHeader>
            <div className="py-4 space-y-4">
              {editingEquipmentTask?.equipment.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No equipment added</p>
                </div>
              ) : (
                editingEquipmentTask?.equipment.map((eq) => (
                  <Card key={eq.id} className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Input
                          value={eq.equipmentName}
                          onChange={(e) => updateEquipment(editingEquipmentTaskId!, eq.id, { equipmentName: e.target.value })}
                          placeholder="Equipment name"
                          className="h-8 text-sm font-medium"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEquipment(editingEquipmentTaskId!, eq.id)}
                          className="h-7 w-7 p-0 ml-2 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={eq.make}
                          onChange={(e) => updateEquipment(editingEquipmentTaskId!, eq.id, { make: e.target.value })}
                          placeholder="Make"
                          className="h-7 text-xs"
                        />
                        <Input
                          value={eq.model}
                          onChange={(e) => updateEquipment(editingEquipmentTaskId!, eq.id, { model: e.target.value })}
                          placeholder="Model"
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={eq.serialNumber}
                          onChange={(e) => updateEquipment(editingEquipmentTaskId!, eq.id, { serialNumber: e.target.value })}
                          placeholder="Serial #"
                          className="h-7 text-xs"
                        />
                        <Input
                          value={eq.location}
                          onChange={(e) => updateEquipment(editingEquipmentTaskId!, eq.id, { location: e.target.value })}
                          placeholder="Location"
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </Card>
                ))
              )}
              <Button
                variant="outline"
                onClick={() => editingEquipmentTaskId && addEquipment(editingEquipmentTaskId)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Equipment
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={!!editingPartsTaskId} onOpenChange={(open) => !open && setEditingPartsTaskId(null)}>
          <SheetContent className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle>
                {editingPartsBillable ? "Billable Parts" : "Non-Billable Parts"} for Task
              </SheetTitle>
              <SheetDescription>
                {editingPartsTask?.taskName || "Add parts for this maintenance task"}
              </SheetDescription>
            </SheetHeader>
            <div className="py-4 space-y-4">
              {filteredParts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No {editingPartsBillable ? "billable" : "non-billable"} parts added</p>
                </div>
              ) : (
                filteredParts.map((part) => (
                  <Card key={part.id} className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Input
                          value={part.partName}
                          onChange={(e) => updatePart(editingPartsTaskId!, part.id, { partName: e.target.value })}
                          placeholder="Part name"
                          className="h-8 text-sm font-medium"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePart(editingPartsTaskId!, part.id)}
                          className="h-7 w-7 p-0 ml-2 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={part.partNumber}
                          onChange={(e) => updatePart(editingPartsTaskId!, part.id, { partNumber: e.target.value })}
                          placeholder="Part number"
                          className="h-7 text-xs"
                        />
                        <Input
                          type="number"
                          value={part.quantity}
                          onChange={(e) => updatePart(editingPartsTaskId!, part.id, { quantity: parseInt(e.target.value) || 1 })}
                          placeholder="Qty"
                          className="h-7 text-xs"
                          min={1}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-slate-500">Unit Cost</Label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={part.unitCost}
                              onChange={(e) => updatePart(editingPartsTaskId!, part.id, { unitCost: e.target.value })}
                              placeholder="0.00"
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Unit Price</Label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={part.unitPrice}
                              onChange={(e) => updatePart(editingPartsTaskId!, part.id, { unitPrice: e.target.value })}
                              placeholder="0.00"
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          checked={part.isBillable}
                          onCheckedChange={(checked) => updatePart(editingPartsTaskId!, part.id, { isBillable: checked })}
                        />
                        <Label className="text-xs">
                          {part.isBillable ? "Billable" : "Non-Billable"}
                        </Label>
                      </div>
                    </div>
                  </Card>
                ))
              )}
              <Button
                variant="outline"
                onClick={() => editingPartsTaskId && addPart(editingPartsTaskId, editingPartsBillable)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add {editingPartsBillable ? "Billable" : "Non-Billable"} Part
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </CrmLayout>
  );
}
