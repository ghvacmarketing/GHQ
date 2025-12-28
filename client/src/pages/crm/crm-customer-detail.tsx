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
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmCustomer, CrmJob } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const createJobSchema = z.object({
  jobType: z.string().min(1, "Job type is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

type CreateJobFormData = z.infer<typeof createJobSchema>;

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

  const form = useForm<CreateJobFormData>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      jobType: "",
      description: "",
      priority: "normal",
    },
  });

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

  const createJobMutation = useMutation({
    mutationFn: async (data: CreateJobFormData) => {
      const res = await apiRequest("POST", "/api/crm/jobs", {
        customerId,
        jobType: data.jobType,
        description: data.description || null,
        priority: data.priority,
        status: "new",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "jobs"] });
      setCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateJobFormData) => {
    createJobMutation.mutate(data);
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

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-job">
                <Plus className="h-4 w-4 mr-2" />
                Create Job
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Job</DialogTitle>
                <DialogDescription>
                  Create a new job for {customer.name}. The job will appear in the dispatch board as unassigned.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="jobType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Type</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value}>
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
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger data-testid="select-priority">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the job or issue..."
                            {...field}
                            data-testid="input-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createJobMutation.isPending} data-testid="button-submit-job">
                      {createJobMutation.isPending ? "Creating..." : "Create Job"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" data-testid={`button-delete-job-${job.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
