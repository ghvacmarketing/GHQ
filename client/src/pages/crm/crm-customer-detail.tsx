import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Phone,
  Mail,
  User,
  Calendar,
  Wrench,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
  ExternalLink,
  MoreVertical,
  CalendarIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmCustomer, CrmJob } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const JOB_TYPES = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

type DispatchResponse = {
  technicians: Array<{
    id: string;
    name: string;
    role: string;
  }>;
};

interface JobWithTech extends CrmJob {
  assignedTechId: string | null;
  assignedTechName: string | null;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  invoiced: { bg: "bg-teal-100", text: "text-teal-700" },
  paid: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600" },
  normal: { bg: "bg-blue-100", text: "text-blue-600" },
  high: { bg: "bg-amber-100", text: "text-amber-600" },
  urgent: { bg: "bg-red-100", text: "text-red-600" },
};

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CrmCustomerDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  // Form state
  const [jobType, setJobType] = useState<string>("SERVICE");
  const [priority, setPriority] = useState<string>("normal");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState<string>("08:00");
  const [duration, setDuration] = useState<number>(120);
  const [description, setDescription] = useState<string>("");
  const [durationError, setDurationError] = useState<string>("");
  const [descriptionError, setDescriptionError] = useState<string>("");

  const resetForm = () => {
    setJobType("SERVICE");
    setPriority("normal");
    setAssignedTechId("unassigned");
    setStartDate(new Date());
    setStartTime("08:00");
    setDuration(120);
    setDescription("");
    setDurationError("");
    setDescriptionError("");
  };

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: customer, isLoading: customerLoading } = useQuery<CrmCustomer>({
    queryKey: ["/api/crm/customers", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customer");
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<JobWithTech[]>({
    queryKey: ["/api/crm/customers", customerId, "jobs"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/jobs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });

  const { data: dispatchData } = useQuery<DispatchResponse>({
    queryKey: ["/api/crm/dispatch"],
    queryFn: async () => {
      const res = await fetch("/api/crm/dispatch", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch technicians");
      return res.json();
    },
    enabled: !!currentUser && createDialogOpen,
  });

  const technicians = dispatchData?.technicians?.filter((t) => t.role === "tech") || [];

  const validateForm = (): boolean => {
    let isValid = true;
    setDurationError("");
    setDescriptionError("");

    if (!duration || duration < 15) {
      setDurationError("Duration must be at least 15 minutes");
      isValid = false;
    }
    if (!description.trim()) {
      setDescriptionError("Description is required");
      isValid = false;
    }
    return isValid;
  };

  const isFormValid = jobType && startDate && startTime && duration >= 15 && description.trim();

  const createJobMutation = useMutation({
    mutationFn: async () => {
      if (!startDate) throw new Error("Start date is required");
      
      const [hours, minutes] = startTime.split(":").map(Number);
      const scheduledStart = new Date(startDate);
      scheduledStart.setHours(hours, minutes, 0, 0);
      
      const scheduledEnd = new Date(scheduledStart);
      scheduledEnd.setMinutes(scheduledEnd.getMinutes() + duration);

      const res = await apiRequest("POST", "/api/crm/jobs", {
        customerId,
        jobType,
        description: description || null,
        priority,
        status: assignedTechId !== "unassigned" ? "scheduled" : "new",
        assignedTechId: assignedTechId !== "unassigned" ? assignedTechId : null,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (validateForm()) {
      createJobMutation.mutate();
    }
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    resetForm();
  };

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/jobs/${jobId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading || customerLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    navigate("/crm/login");
    return null;
  }

  if (!customer) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="space-y-6">
          <Button variant="ghost" onClick={() => navigate("/crm/customers")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customers
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Customer not found</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const activeJobs = jobs?.filter(j => !["completed", "invoiced", "paid", "cancelled"].includes(j.status)) || [];
  const completedJobs = jobs?.filter(j => ["completed", "invoiced", "paid"].includes(j.status)) || [];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/crm/customers")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customers
          </Button>

          <Dialog open={createDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-job">
                <Plus className="h-4 w-4 mr-2" />
                Create Job
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create Job</DialogTitle>
                <DialogDescription>
                  Create a new job for {customer.name}.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="job-type">Job Type *</Label>
                    <Select value={jobType} onValueChange={setJobType}>
                      <SelectTrigger data-testid="select-job-type">
                        <SelectValue placeholder="Select job type" />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_TYPES.map((type) => (
                          <SelectItem key={type} value={type} data-testid={`job-type-${type}`}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger data-testid="select-priority">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize" data-testid={`priority-${p}`}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tech">Primary Tech</Label>
                  <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                    <SelectTrigger data-testid="select-tech">
                      <SelectValue placeholder="Select technician" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" data-testid="tech-unassigned">
                        Unassigned
                      </SelectItem>
                      {technicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id} data-testid={`tech-${tech.id}`}>
                          {tech.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                          data-testid="button-start-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="start-time">Start Time *</Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      data-testid="input-start-time"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={15}
                    step={15}
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                    className={durationError ? "border-red-500" : ""}
                    data-testid="input-duration"
                  />
                  {durationError && (
                    <p className="text-sm text-red-500" data-testid="error-duration">{durationError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Work order description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className={descriptionError ? "border-red-500" : ""}
                    data-testid="textarea-description"
                  />
                  {descriptionError && (
                    <p className="text-sm text-red-500" data-testid="error-description">{descriptionError}</p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCloseDialog}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createJobMutation.isPending || !isFormValid}
                  data-testid="button-submit-job"
                >
                  {createJobMutation.isPending ? "Creating..." : "Create Job"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card data-testid="card-customer-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-slate-500" />
              {customer.name}
              {customer.companyName && (
                <span className="text-sm font-normal text-slate-500">({customer.companyName})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customer.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">
                    {customer.email}
                  </a>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">
                    {customer.phone}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{customer.customerType || "residential"}</Badge>
                <Badge variant="outline">{customer.customerStatus || "client"}</Badge>
              </div>
            </div>
            {customer.notes && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-active-jobs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Active Jobs ({activeJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeJobs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No active jobs</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeJobs.map((job) => (
                    <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                      <TableCell className="font-medium">{job.jobType}</TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[job.status]?.bg} ${statusColors[job.status]?.text}`}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${priorityColors[job.priority || "normal"]?.bg} ${priorityColors[job.priority || "normal"]?.text}`}>
                          {job.priority || "normal"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(job.scheduledStart)}</TableCell>
                      <TableCell>{job.assignedTechName || "Unassigned"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" data-testid={`button-actions-job-${job.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate(`/crm/jobs/${job.id}`)}
                              data-testid={`action-view-job-${job.id}`}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View / Edit Job
                            </DropdownMenuItem>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-red-600 focus:text-red-600"
                                  data-testid={`action-delete-job-${job.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Job
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Job?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this {job.jobType} job. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteJobMutation.mutate(job.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-job-history">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Job History ({completedJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completedJobs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No completed jobs</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Technician</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedJobs.map((job) => (
                    <TableRow key={job.id} data-testid={`row-history-${job.id}`}>
                      <TableCell className="font-medium">{job.jobType}</TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[job.status]?.bg} ${statusColors[job.status]?.text}`}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(job.completedAt)}</TableCell>
                      <TableCell>{job.assignedTechName || "—"}</TableCell>
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
