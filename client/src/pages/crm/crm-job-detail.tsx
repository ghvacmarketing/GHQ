import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  Wrench,
  ExternalLink,
  CheckCircle,
  Circle,
  XCircle,
  Navigation,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { format } from "date-fns";
import type { CrmUser, CrmJob, CrmCustomer, CrmProperty } from "@shared/schema";

type JobDetail = CrmJob & {
  customerName: string;
  assignedTechId: string | null;
  assignedTechName: string | null;
  assignedTechEmail: string | null;
  property: CrmProperty | null;
};

type DispatchResponse = {
  technicians: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
};

const statusSteps = ["scheduled", "en_route", "on_site", "completed"] as const;

const statusLabels: Record<string, string> = {
  new: "New",
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Complete",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Canceled",
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  en_route: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  on_site: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  invoiced: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  paid: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600" },
  normal: { bg: "bg-blue-100", text: "text-blue-600" },
  high: { bg: "bg-amber-100", text: "text-amber-600" },
  urgent: { bg: "bg-red-100", text: "text-red-600" },
};

function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return format(d, "EEE, MMM d, yyyy 'at' h:mm a");
}

function formatShortDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return format(d, "EEE, MMM d");
}

function formatTimeRange(start: Date | string | null, end: Date | string | null): string {
  if (!start) return "Not scheduled";
  const s = new Date(start);
  const startTime = format(s, "h:mm a");
  if (!end) return startTime;
  const e = new Date(end);
  const endTime = format(e, "h:mm a");
  return `${startTime} - ${endTime}`;
}

function getGoogleMapsUrl(property: CrmProperty): string {
  const address = [
    property.address1,
    property.address2,
    property.city,
    property.state,
    property.zip,
  ]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function StatusProgressBar({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-red-50 rounded-lg border border-red-200">
        <XCircle className="h-5 w-5 text-red-500" />
        <span className="font-medium text-red-700">Job Canceled</span>
      </div>
    );
  }

  const currentIndex = statusSteps.indexOf(status as any);
  const isNewOrDispatched = status === "new" || status === "dispatched";

  return (
    <div className="flex items-center justify-between w-full">
      {statusSteps.map((step, index) => {
        const isCompleted = currentIndex > index || (status === "completed" && index <= currentIndex);
        const isCurrent = step === status || (isNewOrDispatched && index === 0);
        const isPending = !isCompleted && !isCurrent;

        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isCurrent
                    ? "bg-blue-500 text-white ring-4 ring-blue-100"
                    : "bg-slate-200 text-slate-400"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium ${
                  isCompleted || isCurrent ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {statusLabels[step]}
              </span>
            </div>
            {index < statusSteps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-2 rounded ${
                  currentIndex > index ? "bg-green-500" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CrmJobDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const { toast } = useToast();

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [jobTypeDialogOpen, setJobTypeDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedTechId, setSelectedTechId] = useState<string>("");
  const [selectedJobType, setSelectedJobType] = useState<string>("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const { data: job, isLoading: jobLoading, error: jobError } = useQuery<JobDetail>({
    queryKey: ["/api/crm/jobs", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/jobs/${jobId}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Job not found");
        throw new Error("Failed to fetch job");
      }
      return res.json();
    },
    enabled: !!currentUser && !!jobId,
  });

  const { data: customer } = useQuery<CrmCustomer>({
    queryKey: ["/api/crm/customers", job?.customerId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${job?.customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customer");
      return res.json();
    },
    enabled: !!currentUser && !!job?.customerId,
  });

  const { data: dispatchData } = useQuery<DispatchResponse>({
    queryKey: ["/api/crm/dispatch"],
    queryFn: async () => {
      const res = await fetch("/api/crm/dispatch", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch technicians");
      return res.json();
    },
    enabled: !!currentUser && reassignDialogOpen,
  });

  const technicians = dispatchData?.technicians?.filter((t) => t.role === "tech") || [];

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await apiRequest("POST", `/api/crm/jobs/${jobId}/status`, {
        status: newStatus,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      setStatusDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: async (techUserId: string) => {
      const res = await apiRequest("PATCH", `/api/crm/jobs/${jobId}`, {
        assignedTechId: techUserId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Technician reassigned successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      setReassignDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reassign technician",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = () => {
    if (selectedStatus) {
      updateStatusMutation.mutate(selectedStatus);
    }
  };

  const handleReassign = () => {
    if (selectedTechId) {
      reassignMutation.mutate(selectedTechId);
    }
  };

  const updateJobTypeMutation = useMutation({
    mutationFn: async (newJobType: string) => {
      const res = await apiRequest("PATCH", `/api/crm/jobs/${jobId}`, {
        jobType: newJobType,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job type updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      setJobTypeDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update job type",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleJobTypeChange = () => {
    if (selectedJobType) {
      updateJobTypeMutation.mutate(selectedJobType);
    }
  };

  if (authLoading || jobLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (jobError || !job) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="space-y-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/crm/jobs")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Jobs
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <XCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">Job not found</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  const statusStyle = statusColors[job.status] || statusColors.new;
  const priorityStyle = priorityColors[job.priority || "normal"] || priorityColors.normal;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate("/crm/jobs")}
              className="mb-2 -ml-2"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              All Jobs
            </Button>
            <h1
              className="text-2xl font-bold text-slate-900"
              data-testid="text-job-title"
            >
              {job.jobType} for {job.customerName}
            </h1>
            <p className="text-sm text-slate-500 mt-1" data-testid="text-job-id">
              Job #{job.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border`}
              data-testid="badge-status"
            >
              {statusLabels[job.status] || job.status}
            </Badge>
            <Badge
              className={`${priorityStyle.bg} ${priorityStyle.text} capitalize`}
              data-testid="badge-priority"
            >
              {job.priority || "normal"}
            </Badge>
          </div>
        </div>

        <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
              <Button
                onClick={() => {
                  setSelectedStatus(job.status);
                  setStatusDialogOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-change-status"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Update Status
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedTechId(job.assignedTechId || "");
                  setReassignDialogOpen(true);
                }}
                data-testid="button-reassign"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Reassign Tech
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedJobType(job.jobType || "SERVICE");
                  setJobTypeDialogOpen(true);
                }}
                data-testid="button-change-job-type"
              >
                <Wrench className="h-4 w-4 mr-2" />
                Change Type
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <StatusProgressBar status={job.status} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-slate-500" />
                  Date & Time
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500">Date</p>
                    <p
                      className="font-medium text-slate-900"
                      data-testid="text-job-date"
                    >
                      {formatShortDate(job.scheduledStart)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Time</p>
                    <p
                      className="font-medium text-slate-900"
                      data-testid="text-job-time"
                    >
                      {formatTimeRange(job.scheduledStart, job.scheduledEnd)}
                    </p>
                  </div>
                </div>
                {job.completedAt && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-slate-500">Completed</p>
                    <p className="font-medium text-green-600">
                      {formatDateTime(job.completedAt)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {job.property && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-5 w-5 text-slate-500" />
                    Service Address
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div>
                      <p
                        className="font-medium text-slate-900"
                        data-testid="text-address-line1"
                      >
                        {job.property.address1}
                      </p>
                      {job.property.address2 && (
                        <p className="text-slate-600">{job.property.address2}</p>
                      )}
                      <p className="text-slate-600" data-testid="text-address-city">
                        {job.property.city}, {job.property.state} {job.property.zip}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid="button-directions"
                    >
                      <a
                        href={getGoogleMapsUrl(job.property)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        Directions
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wrench className="h-5 w-5 text-slate-500" />
                  Services / Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className="text-slate-700 whitespace-pre-wrap"
                  data-testid="text-description"
                >
                  {job.description || "No description provided."}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5 text-slate-500" />
                  Customer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-base font-semibold text-slate-900 hover:text-blue-600"
                    onClick={() => navigate(`/crm/customers/${job.customerId}`)}
                    data-testid="link-customer"
                  >
                    {job.customerName}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                {customer?.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-4 w-4" />
                    <a
                      href={`tel:${customer.phone}`}
                      className="hover:text-blue-600"
                      data-testid="link-phone"
                    >
                      {customer.phone}
                    </a>
                  </div>
                )}
                {customer?.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="h-4 w-4" />
                    <a
                      href={`mailto:${customer.email}`}
                      className="hover:text-blue-600 truncate"
                      data-testid="link-email"
                    >
                      {customer.email}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserCheck className="h-5 w-5 text-slate-500" />
                  Assigned Technician
                </CardTitle>
              </CardHeader>
              <CardContent>
                {job.assignedTechName ? (
                  <div className="space-y-2">
                    <p
                      className="font-medium text-slate-900"
                      data-testid="text-tech-name"
                    >
                      {job.assignedTechName}
                    </p>
                    {job.assignedTechEmail && (
                      <p className="text-sm text-slate-500">{job.assignedTechEmail}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 italic" data-testid="text-unassigned">
                    Unassigned
                  </p>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Job Status</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger data-testid="select-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
                <SelectItem value="en_route">En Route</SelectItem>
                <SelectItem value="on_site">On Site</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusDialogOpen(false)}
              data-testid="button-cancel-status"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={updateStatusMutation.isPending || !selectedStatus}
              data-testid="button-save-status"
            >
              {updateStatusMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Technician</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedTechId} onValueChange={setSelectedTechId}>
              <SelectTrigger data-testid="select-technician">
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent>
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReassignDialogOpen(false)}
              data-testid="button-cancel-reassign"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReassign}
              disabled={reassignMutation.isPending || !selectedTechId}
              data-testid="button-save-reassign"
            >
              {reassignMutation.isPending ? "Saving..." : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jobTypeDialogOpen} onOpenChange={setJobTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Job Type</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedJobType} onValueChange={setSelectedJobType}>
              <SelectTrigger data-testid="select-job-type">
                <SelectValue placeholder="Select job type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SERVICE">Service</SelectItem>
                <SelectItem value="INSTALL">Install</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="SALES">Sales</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setJobTypeDialogOpen(false)}
              data-testid="button-cancel-job-type"
            >
              Cancel
            </Button>
            <Button
              onClick={handleJobTypeChange}
              disabled={updateJobTypeMutation.isPending || !selectedJobType}
              data-testid="button-save-job-type"
            >
              {updateJobTypeMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
