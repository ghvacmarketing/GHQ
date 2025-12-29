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
  MessageSquare,
  Send,
  Briefcase,
  CalendarPlus,
  MapPin,
  Building2,
  FileText,
  DollarSign,
  ClipboardList,
  Home,
  Users,
  Receipt,
  Key,
  Pencil,
  Circle,
  CheckCircle2,
  History,
  UserCircle,
  LayoutGrid,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmCustomer, CrmJob, CrmCustomerNote, CrmProject, CrmWorkOrder, CrmProperty } from "@shared/schema";
import { workOrderVisitTypeEnum, type WorkOrderVisitType, projectTypeEnum, type ProjectType, projectStatusEnum, type ProjectStatus, workOrderStatusEnum, type WorkOrderStatus } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";
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

interface CustomerOverviewProps {
  customer: CrmCustomer;
  jobs: JobWithTech[];
  onCreateProject: () => void;
  onCreateWorkOrder: () => void;
}

interface CustomerNoteWithUser extends CrmCustomerNote {
  userName: string | null;
}

function CustomerOverview({ customer, jobs, onCreateProject, onCreateWorkOrder }: CustomerOverviewProps) {
  const customerType = (customer.customerType || "residential").toLowerCase();
  
  const openProjects = jobs?.filter(j => !["completed", "invoiced", "paid", "cancelled"].includes(j.status)).length || 0;
  const upcomingVisits = jobs?.filter(j => {
    if (!j.scheduledStart) return false;
    const scheduled = new Date(j.scheduledStart);
    return scheduled > new Date() && !["completed", "invoiced", "paid", "cancelled"].includes(j.status);
  }).length || 0;
  const completedProjects = jobs?.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).length || 0;
  
  if (customerType === "property_manager" || customerType === "property manager") {
    return <PropertyManagerOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} onCreateProject={onCreateProject} onCreateWorkOrder={onCreateWorkOrder} />;
  }
  
  if (customerType === "commercial") {
    return <CommercialOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} onCreateProject={onCreateProject} onCreateWorkOrder={onCreateWorkOrder} />;
  }
  
  return <ResidentialOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} onCreateProject={onCreateProject} onCreateWorkOrder={onCreateWorkOrder} />;
}

interface OverviewLayoutProps {
  customer: CrmCustomer;
  openProjects: number;
  upcomingVisits: number;
  completedProjects: number;
  onCreateProject: () => void;
  onCreateWorkOrder: () => void;
}

function ResidentialOverview({ customer, openProjects, upcomingVisits, completedProjects, onCreateProject, onCreateWorkOrder }: OverviewLayoutProps) {
  return (
    <div className="space-y-6">
      <Card className="border shadow-sm" data-testid="card-residential-info">
        <CardContent className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-green-100 rounded-full">
              <Home className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">Residential Customer</h2>
              <p className="text-sm text-slate-500 mt-0.5">{customer.name}</p>
            </div>
            <Badge className="bg-green-100 text-green-700 border-green-200">Residential</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Name</p>
                <p className="text-sm font-medium text-slate-900">{customer.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Service Address</p>
                <p className="text-sm text-slate-700">{customer.fullAddress || "No address on file"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Status</p>
                <Badge variant="outline" className="text-xs">{customer.status || "Active"}</Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Phone</p>
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {customer.phone}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No phone</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Email</p>
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {customer.email}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No email</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm" data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-slate-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={onCreateProject}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-quick-create-project"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Create Project
            </Button>
            <Button 
              onClick={onCreateWorkOrder}
              variant="outline"
              className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
              data-testid="button-quick-create-work-order"
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Create Work Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PropertyManagerOverview({ customer, openProjects, upcomingVisits, completedProjects, onCreateProject, onCreateWorkOrder }: OverviewLayoutProps) {
  return (
    <div className="space-y-6">
      <Card className="border shadow-sm" data-testid="card-property-manager-info">
        <CardContent className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-purple-100 rounded-full">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">Property Manager</h2>
              <p className="text-sm text-slate-500 mt-0.5">{customer.companyName || customer.name}</p>
            </div>
            <Badge className="bg-purple-100 text-purple-700 border-purple-200">Property Manager</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Name</p>
                <p className="text-sm font-medium text-slate-900">{customer.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Address</p>
                <p className="text-sm text-slate-700">{customer.fullAddress || "No address on file"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Status</p>
                <Badge variant="outline" className="text-xs">{customer.status || "Active"}</Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Phone</p>
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {customer.phone}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No phone</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Email</p>
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {customer.email}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No email</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm" data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-slate-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={onCreateProject}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-quick-create-project"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Create Project
            </Button>
            <Button 
              onClick={onCreateWorkOrder}
              variant="outline"
              className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
              data-testid="button-quick-create-work-order"
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Create Work Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CommercialOverview({ customer, openProjects, upcomingVisits, completedProjects, onCreateProject, onCreateWorkOrder }: OverviewLayoutProps) {
  return (
    <div className="space-y-6">
      <Card className="border shadow-sm" data-testid="card-commercial-info">
        <CardContent className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-blue-100 rounded-full">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">Commercial Customer</h2>
              <p className="text-sm text-slate-500 mt-0.5">{customer.companyName || customer.name}</p>
            </div>
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">Commercial</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Name</p>
                <p className="text-sm font-medium text-slate-900">{customer.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Address</p>
                <p className="text-sm text-slate-700">{customer.fullAddress || "No address on file"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Status</p>
                <Badge variant="outline" className="text-xs">{customer.status || "Active"}</Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Phone</p>
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {customer.phone}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No phone</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Email</p>
                {customer.email ? (
                  <a href={`mailto:${customer.email}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {customer.email}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">No email</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm" data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-slate-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={onCreateProject}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-quick-create-project"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Create Project
            </Button>
            <Button 
              onClick={onCreateWorkOrder}
              variant="outline"
              className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
              data-testid="button-quick-create-work-order"
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Create Work Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface NotesSectionProps {
  notes: CustomerNoteWithUser[];
  notesLoading: boolean;
  noteBody: string;
  setNoteBody: (value: string) => void;
  handleAddNote: () => void;
  addNotePending: boolean;
}

function NotesSection({ notes, notesLoading, noteBody, setNoteBody, handleAddNote, addNotePending }: NotesSectionProps) {
  return (
    <Card data-testid="card-notes-overview">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5 text-blue-500" />
          Notes & Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a note about this customer..."
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={2}
              className="flex-1"
              data-testid="textarea-note-overview"
            />
            <Button
              onClick={handleAddNote}
              disabled={!noteBody.trim() || addNotePending}
              className="self-end"
              data-testid="button-add-note-overview"
            >
              {addNotePending ? (
                "Adding..."
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" />
                  Add
                </>
              )}
            </Button>
          </div>

          {notesLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : notes && notes.length > 0 ? (
            <div className="border-l-2 border-slate-200 pl-4 space-y-4 mt-4">
              {notes.slice(0, 5).map((note) => (
                <div key={note.id} className="relative" data-testid={`note-overview-${note.id}`}>
                  <div className="absolute -left-[21px] top-0 w-2.5 h-2.5 bg-blue-500 rounded-full" />
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-slate-700">
                        {note.userName || "Unknown User"}
                      </span>
                      <span className="text-xs text-slate-400" title={note.createdAt ? format(new Date(note.createdAt), "PPP p") : ""}>
                        {note.createdAt
                          ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })
                          : "—"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{note.body}</p>
                  </div>
                </div>
              ))}
              {notes.length > 5 && (
                <p className="text-sm text-slate-500 text-center py-2">
                  +{notes.length - 5} more notes
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">No notes yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// CustomerTabbedView component for ALL customer types
interface CustomerTabbedViewProps {
  customer: CrmCustomer;
  customerProperties: CrmProperty[] | undefined;
  propertiesLoading: boolean;
  crmProjects: any[] | undefined;
  projectsLoading: boolean;
  crmWorkOrders: any[] | undefined;
  workOrdersLoading: boolean;
  jobs: JobWithTech[] | undefined;
  notes: CustomerNoteWithUser[];
  notesLoading: boolean;
  noteBody: string;
  setNoteBody: (value: string) => void;
  handleAddNote: () => void;
  addNotePending: boolean;
  onCreateProject: () => void;
  onScheduleVisit: () => void;
  onEditCustomer: () => void;
  toast: ReturnType<typeof useToast>['toast'];
  propertyDialogOpen: boolean;
  setPropertyDialogOpen: (open: boolean) => void;
}

function CustomerTabbedView({
  customer,
  customerProperties,
  propertiesLoading,
  crmProjects,
  projectsLoading,
  crmWorkOrders,
  workOrdersLoading,
  jobs,
  notes,
  notesLoading,
  noteBody,
  setNoteBody,
  handleAddNote,
  addNotePending,
  onCreateProject,
  onScheduleVisit,
  onEditCustomer,
  toast,
  propertyDialogOpen,
  setPropertyDialogOpen,
}: CustomerTabbedViewProps) {
  const completedJobs = jobs?.filter(j => ["completed", "invoiced", "paid"].includes(j.status)) || [];
  const customerType = (customer.customerType || "residential").toLowerCase();
  const isPropertyManager = customerType === "property_manager" || customerType === "property manager";
  const isCommercial = customerType === "commercial";
  
  const hasAtLeastOneSite = (customerProperties?.length || 0) > 0;
  const hasOpsContact = false;
  const hasAPContact = false;
  const setupComplete = hasAtLeastOneSite && hasOpsContact && hasAPContact;
  const completedSteps = [hasAtLeastOneSite, hasOpsContact, hasAPContact].filter(Boolean).length;

  const upcomingWorkOrders = crmWorkOrders?.filter(wo => ["scheduled", "dispatched", "en_route", "on_site"].includes(wo.status)) || [];
  const completedWorkOrders = crmWorkOrders?.filter(wo => ["completed", "invoiced", "paid"].includes(wo.status)) || [];

  const getCustomerIcon = () => {
    if (isPropertyManager) return <Building2 className="h-5 w-5 text-purple-600" />;
    if (isCommercial) return <Building2 className="h-5 w-5 text-blue-600" />;
    return <Home className="h-5 w-5 text-green-600" />;
  };

  const getCustomerTypeLabel = () => {
    if (isPropertyManager) return "Property Manager";
    if (isCommercial) return "Commercial";
    return "Residential";
  };

  const getCustomerBorderColor = () => {
    if (isPropertyManager) return "border-l-purple-500";
    if (isCommercial) return "border-l-blue-500";
    return "border-l-green-500";
  };

  const getCustomerBgColor = () => {
    if (isPropertyManager) return "bg-purple-100";
    if (isCommercial) return "bg-blue-100";
    return "bg-green-100";
  };

  const getCustomerBadgeColor = () => {
    if (isPropertyManager) return "bg-purple-100 text-purple-700 border-purple-200";
    if (isCommercial) return "bg-blue-100 text-blue-700 border-blue-200";
    return "bg-green-100 text-green-700 border-green-200";
  };

  return (
    <Tabs defaultValue="overview" className="w-full" data-testid="customer-tabs">
      <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap" data-testid="tabs-list">
        <TabsTrigger 
          value="overview" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-overview"
        >
          <LayoutGrid className="h-4 w-4 mr-2" />
          Overview
        </TabsTrigger>
        <TabsTrigger 
          value="sites" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-sites"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Sites
        </TabsTrigger>
        <TabsTrigger 
          value="work-orders" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-work-orders"
        >
          <Wrench className="h-4 w-4 mr-2" />
          Work Orders
        </TabsTrigger>
        <TabsTrigger 
          value="projects" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-projects"
        >
          <Briefcase className="h-4 w-4 mr-2" />
          Projects
        </TabsTrigger>
        <TabsTrigger 
          value="quotes" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-quotes"
        >
          <FileText className="h-4 w-4 mr-2" />
          Quotes
        </TabsTrigger>
        <TabsTrigger 
          value="invoices" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-invoices"
        >
          <Receipt className="h-4 w-4 mr-2" />
          Invoices & Payments
        </TabsTrigger>
        <TabsTrigger 
          value="files" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-files"
        >
          <FileText className="h-4 w-4 mr-2" />
          Files / Photos
        </TabsTrigger>
        <TabsTrigger 
          value="settings" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-settings"
        >
          <ClipboardList className="h-4 w-4 mr-2" />
          Settings
        </TabsTrigger>
      </TabsList>

      {/* Overview Tab */}
      <TabsContent value="overview" className="space-y-6" data-testid="tab-content-overview">
        {/* Customer Summary Card */}
        <Card className="border shadow-sm" data-testid="card-customer-summary">
          <CardContent className="p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className={`p-3 rounded-full ${getCustomerBgColor()}`}>
                {getCustomerIcon()}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-900">{getCustomerTypeLabel()} Customer</h2>
                <p className="text-sm text-slate-500 mt-0.5">{customer.name}</p>
              </div>
              <Badge className={getCustomerBadgeColor()}>{customer.customerType}</Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Name</p>
                  <p className="text-sm font-medium text-slate-900">{customer.name}</p>
                </div>
                {customer.companyName && customer.companyName !== customer.name && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Company</p>
                    <p className="text-sm font-medium text-slate-900">{customer.companyName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Address</p>
                  <p className="text-sm text-slate-700">{customer.fullAddress || "No address on file"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Status</p>
                  <Badge variant="outline" className="text-xs">{customer.customerStatus || "Active"}</Badge>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Phone</p>
                  {customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {customer.phone}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-400">No phone</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Email</p>
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {customer.email}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-400">No email</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border shadow-sm" data-testid="card-quick-actions">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-slate-800">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={onCreateProject}
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                data-testid="button-quick-create-project"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Create Project
              </Button>
              <Button 
                onClick={onScheduleVisit}
                variant="outline"
                className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
                data-testid="button-quick-create-work-order"
              >
                <CalendarPlus className="h-4 w-4 mr-2" />
                Create Work Order
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Setup Checklist Card - Only for Property Managers */}
        {isPropertyManager && (
          <Card data-testid="card-setup-checklist">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-[#711419]" />
                  Setup Checklist
                </span>
                <Badge 
                  className={setupComplete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}
                >
                  {completedSteps}/3 Complete
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3" data-testid="checklist-step-1">
                  {hasAtLeastOneSite ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300" />
                  )}
                  <span className={hasAtLeastOneSite ? "text-slate-700" : "text-slate-500"}>
                    Step 1: Add at least 1 Site/Property
                  </span>
                  {hasAtLeastOneSite && (
                    <Badge className="bg-green-100 text-green-700 ml-auto">Complete</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3" data-testid="checklist-step-2">
                  {hasOpsContact ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300" />
                  )}
                  <span className={hasOpsContact ? "text-slate-700" : "text-slate-500"}>
                    Step 2: Add Ops Contact (Facilities or Primary)
                  </span>
                  {hasOpsContact && (
                    <Badge className="bg-green-100 text-green-700 ml-auto">Complete</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3" data-testid="checklist-step-3">
                  {hasAPContact ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300" />
                  )}
                  <span className={hasAPContact ? "text-slate-700" : "text-slate-500"}>
                    Step 3: Add AP/Billing Contact
                  </span>
                  {hasAPContact && (
                    <Badge className="bg-green-100 text-green-700 ml-auto">Complete</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
                  onClick={() => setPropertyDialogOpen(true)}
                  data-testid="button-add-site-checklist"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Site
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Project History (Legacy Jobs) - From old Customer History tab */}
        {completedJobs.length > 0 && (
          <Card data-testid="card-job-history-overview">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-500" />
                Recent Service History ({completedJobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                  {completedJobs.slice(0, 5).map((job) => (
                    <TableRow key={job.id} data-testid={`row-history-overview-${job.id}`}>
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
              {completedJobs.length > 5 && (
                <p className="text-sm text-slate-500 text-center py-2 mt-2">
                  +{completedJobs.length - 5} more completed jobs
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* Sites Tab */}
      <TabsContent value="sites" className="space-y-6" data-testid="tab-content-sites">
        <Card data-testid="card-sites">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#711419]" />
              Sites/Properties ({customerProperties?.length || 0})
            </CardTitle>
            <Button 
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              onClick={() => setPropertyDialogOpen(true)}
              data-testid="button-add-site"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Site
            </Button>
          </CardHeader>
          <CardContent>
            {propertiesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : !customerProperties || customerProperties.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 mb-4">No sites/properties added yet</p>
                <Button 
                  className="bg-[#711419] hover:bg-[#5a1014] text-white"
                  onClick={() => setPropertyDialogOpen(true)}
                  data-testid="button-add-first-site"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add First Site
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {customerProperties.map((property) => (
                  <div 
                    key={property.id}
                    className="p-4 border rounded-lg hover:border-[#711419]/50 hover:bg-[#711419]/5 cursor-pointer transition-colors"
                    data-testid={`card-property-${property.id}`}
                  >
                    <h4 className="font-medium">{property.address1}</h4>
                    {property.address2 && <p className="text-sm text-slate-500">{property.address2}</p>}
                    <p className="text-sm text-slate-500">{property.city}, {property.state} {property.zip}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Work Orders Tab */}
      <TabsContent value="work-orders" className="space-y-6" data-testid="tab-content-work-orders">
        <Card data-testid="card-upcoming-wo-tab">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-green-500" />
              Upcoming Work Orders ({upcomingWorkOrders.length})
            </CardTitle>
            <Button 
              size="sm" 
              onClick={onScheduleVisit}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-wo-tab"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Work Order
            </Button>
          </CardHeader>
          <CardContent>
            {workOrdersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : upcomingWorkOrders.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No upcoming work orders</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcomingWorkOrders.map((wo) => (
                  <div 
                    key={wo.id}
                    className="p-4 border rounded-lg hover:border-green-300 hover:bg-green-50/50 cursor-pointer transition-colors"
                    data-testid={`card-wo-tab-${wo.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-sm line-clamp-1">{wo.title || wo.visitType}</h4>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {wo.visitType.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <Badge className={`text-xs ${
                      wo.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                      wo.status === "pending" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-700"
                    }`}>
                      {wo.status}
                    </Badge>
                    {wo.scheduledStart && (
                      <div className="flex items-center gap-1 text-xs text-slate-600 mt-2">
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(wo.scheduledStart), "MMM d, yyyy h:mm a")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-completed-wo-tab">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Completed Work Orders ({completedWorkOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workOrdersLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : completedWorkOrders.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No completed work orders</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {completedWorkOrders.map((wo) => (
                  <div 
                    key={wo.id}
                    className="p-4 border rounded-lg hover:border-green-300 hover:bg-green-50/50 cursor-pointer transition-colors"
                    data-testid={`card-completed-wo-${wo.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-sm line-clamp-1">{wo.title || wo.visitType}</h4>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {wo.visitType.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <Badge className="text-xs bg-green-100 text-green-700">
                      {wo.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Projects Tab */}
      <TabsContent value="projects" className="space-y-6" data-testid="tab-content-projects">
        <Card data-testid="card-open-projects">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-500" />
              Active Projects ({crmProjects?.filter(p => p.status !== "archived" && p.status !== "completed").length || 0})
            </CardTitle>
            <Button 
              size="sm" 
              onClick={onCreateProject}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-project-tab"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Button>
          </CardHeader>
          <CardContent>
            {projectsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : !crmProjects || crmProjects.filter(p => p.status !== "archived" && p.status !== "completed").length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No active projects</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {crmProjects.filter(p => p.status !== "archived" && p.status !== "completed").map((project) => (
                  <div 
                    key={project.id}
                    className="p-4 border rounded-lg hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => {
                      toast({ title: "Project Details", description: `Project: ${project.title}` });
                    }}
                    data-testid={`card-project-tab-${project.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-sm line-clamp-1">{project.title}</h4>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {project.projectType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                      <Badge className={`text-xs ${
                        project.status === "lead" ? "bg-slate-100 text-slate-700" :
                        project.status === "proposal_sent" ? "bg-amber-100 text-amber-700" :
                        project.status === "approved" ? "bg-blue-100 text-blue-700" :
                        project.status === "in_progress" ? "bg-green-100 text-green-700" :
                        project.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {project.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    {project.expectedValue && (
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <DollarSign className="h-3 w-3" />
                        ${Number(project.expectedValue).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-completed-projects-tab">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Completed Projects ({crmProjects?.filter(p => p.status === "completed").length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projectsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !crmProjects || crmProjects.filter(p => p.status === "completed").length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No completed projects</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {crmProjects.filter(p => p.status === "completed").map((project) => (
                  <div 
                    key={project.id}
                    className="p-4 border rounded-lg hover:border-green-300 hover:bg-green-50/50 cursor-pointer transition-colors"
                    data-testid={`card-completed-project-${project.id}`}
                  >
                    <h4 className="font-medium text-sm">{project.title}</h4>
                    <Badge variant="outline" className="text-xs mt-1">
                      {project.projectType}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Quotes Tab - Placeholder */}
      <TabsContent value="quotes" className="space-y-6" data-testid="tab-content-quotes">
        <Card data-testid="card-quotes">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#711419]" />
              Quotes
            </CardTitle>
            <Button 
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-quote"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Quote
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-2">No quotes yet</p>
              <p className="text-sm text-slate-400">
                Quotes for this customer will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Invoices & Payments Tab - Placeholder */}
      <TabsContent value="invoices" className="space-y-6" data-testid="tab-content-invoices">
        <Card data-testid="card-invoices">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-[#711419]" />
              Invoices & Payments
            </CardTitle>
            <Button 
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-invoice"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Invoice
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-2">No invoices yet</p>
              <p className="text-sm text-slate-400">
                Invoices and payment history for this customer will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Files / Photos Tab - Placeholder */}
      <TabsContent value="files" className="space-y-6" data-testid="tab-content-files">
        <Card data-testid="card-files">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#711419]" />
              Files & Photos
            </CardTitle>
            <Button 
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-upload-file"
            >
              <Plus className="h-4 w-4 mr-1" />
              Upload File
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-2">No files or photos yet</p>
              <p className="text-sm text-slate-400">
                Upload documents, photos, and other files related to this customer.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Settings Tab - Placeholder */}
      <TabsContent value="settings" className="space-y-6" data-testid="tab-content-settings">
        <Card data-testid="card-settings">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#711419]" />
              Customer Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-2">Settings coming soon</p>
              <p className="text-sm text-slate-400">
                Customer preferences, billing settings, and notification options will be configured here.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

export default function CrmCustomerDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [scheduleVisitDialogOpen, setScheduleVisitDialogOpen] = useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<CrmProperty | null>(null);
  const { toast } = useToast();

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editCustomerType, setEditCustomerType] = useState("");
  const [editCustomerStatus, setEditCustomerStatus] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editFullAddress, setEditFullAddress] = useState("");
  const [editLeadSource, setEditLeadSource] = useState("");

  // Form state for New Job dialog
  const [jobType, setJobType] = useState<string>("SERVICE");
  const [priority, setPriority] = useState<string>("normal");
  const [assignedTechId, setAssignedTechId] = useState<string>("unassigned");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState<string>("08:00");
  const [duration, setDuration] = useState<number>(120);
  const [description, setDescription] = useState<string>("");
  const [durationError, setDurationError] = useState<string>("");
  const [descriptionError, setDescriptionError] = useState<string>("");

  // Form state for Create Work Order dialog
  const [woTitle, setWoTitle] = useState<string>("");
  const [woVisitType, setWoVisitType] = useState<WorkOrderVisitType>("SERVICE");
  const [woPropertyId, setWoPropertyId] = useState<string>("");
  const [woProjectId, setWoProjectId] = useState<string>("");
  const [woDate, setWoDate] = useState<Date | undefined>(new Date());
  const [woStartTime, setWoStartTime] = useState<string>("08:00");
  const [woEndTime, setWoEndTime] = useState<string>("10:00");
  const [woTechId, setWoTechId] = useState<string>("unassigned");
  const [woDescription, setWoDescription] = useState<string>("");
  const [woPriority, setWoPriority] = useState<string>("normal");

  // Form state for Create Project dialog
  const [projTitle, setProjTitle] = useState<string>("");
  const [projType, setProjType] = useState<ProjectType>("INSTALL");
  const [projExpectedValue, setProjExpectedValue] = useState<string>("");
  const [projDescription, setProjDescription] = useState<string>("");
  const [projPriority, setProjPriority] = useState<string>("normal");
  const [projPropertyId, setProjPropertyId] = useState<string>("");

  // Legacy form state for Create Work Order dialog (backward compatible)
  const [visitJobId, setVisitJobId] = useState<string>("");
  const [visitType, setVisitType] = useState<WorkOrderVisitType>("SERVICE");
  const [visitDate, setVisitDate] = useState<Date | undefined>(new Date());
  const [visitStartTime, setVisitStartTime] = useState<string>("08:00");
  const [visitEndTime, setVisitEndTime] = useState<string>("10:00");
  const [visitTechId, setVisitTechId] = useState<string>("unassigned");
  const [createNewJobForVisit, setCreateNewJobForVisit] = useState(false);
  const [newJobTypeForVisit, setNewJobTypeForVisit] = useState<string>("SERVICE");
  const [newJobDescForVisit, setNewJobDescForVisit] = useState<string>("");

  const resetWoForm = () => {
    setWoTitle("");
    setWoVisitType("SERVICE");
    setWoPropertyId("");
    setWoProjectId("");
    setWoDate(new Date());
    setWoStartTime("08:00");
    setWoEndTime("10:00");
    setWoTechId("unassigned");
    setWoDescription("");
    setWoPriority("normal");
  };

  const resetProjForm = () => {
    setProjTitle("");
    setProjType("INSTALL");
    setProjExpectedValue("");
    setProjDescription("");
    setProjPriority("normal");
    setProjPropertyId("");
  };

  // Property form state
  const [propAddress1, setPropAddress1] = useState("");
  const [propAddress2, setPropAddress2] = useState("");
  const [propCity, setPropCity] = useState("");
  const [propState, setPropState] = useState("");
  const [propZip, setPropZip] = useState("");
  const [propNotes, setPropNotes] = useState("");
  const [propTenantName, setPropTenantName] = useState("");
  const [propTenantPhone, setPropTenantPhone] = useState("");
  const [propTenantEmail, setPropTenantEmail] = useState("");
  const [propBilledTo, setPropBilledTo] = useState<"property_manager" | "tenant">("property_manager");

  const resetPropertyForm = () => {
    setPropAddress1("");
    setPropAddress2("");
    setPropCity("");
    setPropState("");
    setPropZip("");
    setPropNotes("");
    setPropTenantName("");
    setPropTenantPhone("");
    setPropTenantEmail("");
    setPropBilledTo("property_manager");
    setEditingProperty(null);
  };

  const handleClosePropertyDialog = () => {
    setPropertyDialogOpen(false);
    resetPropertyForm();
  };

  const resetVisitForm = () => {
    setVisitJobId("");
    setVisitType("SERVICE");
    setVisitDate(new Date());
    setVisitStartTime("08:00");
    setVisitEndTime("10:00");
    setVisitTechId("unassigned");
    setCreateNewJobForVisit(false);
    setNewJobTypeForVisit("SERVICE");
    setNewJobDescForVisit("");
  };

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
    enabled: !!currentUser && (createDialogOpen || scheduleVisitDialogOpen),
  });

  const { data: notes, isLoading: notesLoading } = useQuery<CustomerNoteWithUser[]>({
    queryKey: ["/api/crm/customers", customerId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/notes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });

  // Fetch CRM Projects for this customer
  interface ProjectWithDetails extends CrmProject {
    customerName?: string;
    propertyAddress?: string;
    workOrderCount?: number;
  }

  const { data: crmProjects, isLoading: projectsLoading } = useQuery<ProjectWithDetails[]>({
    queryKey: ["/api/crm/projects", { customerId }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?customerId=${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects || [];
    },
    enabled: !!currentUser && !!customerId,
  });

  // Fetch CRM Work Orders for this customer
  interface WorkOrderWithDetails extends CrmWorkOrder {
    customerName?: string;
    propertyAddress?: string;
    assignedTechName?: string;
    projectTitle?: string;
  }

  const { data: crmWorkOrders, isLoading: workOrdersLoading } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders/list", { customerId }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/list?customerId=${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });

  // Fetch customer properties for all views (needed for property_manager tabs)
  const { data: customerProperties, isLoading: propertiesLoading } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/customers", customerId, "properties"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/properties`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });

  interface CustomerImpact {
    projects: number;
    workOrders: number;
    quotes: number;
    invoices: number;
    hasLinkedRecords: boolean;
  }

  const { data: impactData, isLoading: impactLoading } = useQuery<CustomerImpact>({
    queryKey: ["/api/crm/customers", customerId, "impact"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/impact`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch impact data");
      return res.json();
    },
    enabled: !!currentUser && !!customerId && deleteDialogOpen,
  });

  const technicians = dispatchData?.technicians?.filter((t) => t.role === "tech") || [];

  const canDeleteCustomer = currentUser && ["admin", "owner", "manager"].includes(currentUser.role);

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
      toast({ title: "Project created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create project",
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

  const handleCloseVisitDialog = () => {
    setScheduleVisitDialogOpen(false);
    resetVisitForm();
  };

  const scheduleVisitMutation = useMutation({
    mutationFn: async () => {
      if (!visitDate) throw new Error("Visit date is required");
      
      let jobIdToUse = visitJobId;
      
      // If creating a new job for this visit
      if (createNewJobForVisit) {
        const [hours, minutes] = visitStartTime.split(":").map(Number);
        const scheduledStart = new Date(visitDate);
        scheduledStart.setHours(hours, minutes, 0, 0);
        
        const [endHours, endMinutes] = visitEndTime.split(":").map(Number);
        const scheduledEnd = new Date(visitDate);
        scheduledEnd.setHours(endHours, endMinutes, 0, 0);

        const jobRes = await apiRequest("POST", "/api/crm/jobs", {
          customerId,
          jobType: newJobTypeForVisit,
          description: newJobDescForVisit || null,
          priority: "normal",
          status: "scheduled",
          scheduledStart: scheduledStart.toISOString(),
          scheduledEnd: scheduledEnd.toISOString(),
        });
        const newJob = await jobRes.json();
        jobIdToUse = newJob.id;
      }
      
      if (!jobIdToUse) throw new Error("Project is required");

      const [hours, minutes] = visitStartTime.split(":").map(Number);
      const scheduledStart = new Date(visitDate);
      scheduledStart.setHours(hours, minutes, 0, 0);
      
      const [endHours, endMinutes] = visitEndTime.split(":").map(Number);
      const scheduledEnd = new Date(visitDate);
      scheduledEnd.setHours(endHours, endMinutes, 0, 0);

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        jobId: jobIdToUse,
        visitType,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        assignedTechId: visitTechId !== "unassigned" ? visitTechId : null,
        status: "scheduled",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Visit scheduled successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      setScheduleVisitDialogOpen(false);
      resetVisitForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to schedule visit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitVisit = () => {
    if (visitDate && (visitJobId || createNewJobForVisit)) {
      scheduleVisitMutation.mutate();
    }
  };

  const isVisitFormValid = visitDate && (visitJobId || (createNewJobForVisit && newJobTypeForVisit));

  // Create CRM Project mutation
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projTitle.trim()) throw new Error("Title is required");
      if (!projType) throw new Error("Project type is required");

      const res = await apiRequest("POST", "/api/crm/projects", {
        customerId,
        propertyId: projPropertyId || null,
        title: projTitle.trim(),
        projectType: projType,
        description: projDescription.trim() || null,
        expectedValue: projExpectedValue ? projExpectedValue : null,
        priority: projPriority,
        status: "lead",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create project");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Project created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", { customerId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setCreateProjectDialogOpen(false);
      resetProjForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitProject = () => {
    if (projTitle.trim() && projType) {
      createProjectMutation.mutate();
    }
  };

  const handleCloseProjectDialog = () => {
    setCreateProjectDialogOpen(false);
    resetProjForm();
  };

  const isProjFormValid = projTitle.trim() && projType;

  // Create standalone Work Order mutation
  const createWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!woDate) throw new Error("Date is required");

      const [hours, minutes] = woStartTime.split(":").map(Number);
      const scheduledStart = new Date(woDate);
      scheduledStart.setHours(hours, minutes, 0, 0);
      
      const [endHours, endMinutes] = woEndTime.split(":").map(Number);
      const scheduledEnd = new Date(woDate);
      scheduledEnd.setHours(endHours, endMinutes, 0, 0);

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId,
        propertyId: woPropertyId || null,
        projectId: woProjectId || null,
        title: woTitle.trim() || null,
        visitType: woVisitType,
        description: woDescription.trim() || null,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        assignedTechId: woTechId !== "unassigned" ? woTechId : null,
        priority: woPriority,
        status: "scheduled",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create work order");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Work order created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders/list", { customerId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
      setScheduleVisitDialogOpen(false);
      resetWoForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create work order",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitWorkOrder = () => {
    if (woDate && woPropertyId) {
      createWorkOrderMutation.mutate();
    } else if (!woPropertyId) {
      toast({
        title: "Property required",
        description: "Please select a property for the work order",
        variant: "destructive",
      });
    }
  };

  const handleCloseWoDialog = () => {
    setScheduleVisitDialogOpen(false);
    resetWoForm();
  };

  const isWoFormValid = woDate && woPropertyId;

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("DELETE", `/api/crm/jobs/${jobId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Project deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dispatch"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/crm/customers/${customerId}/notes`, { body });
      if (!res.ok) throw new Error("Failed to add note");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Note added" });
      setNoteBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "notes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add note",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddNote = () => {
    if (noteBody.trim()) {
      addNoteMutation.mutate(noteBody.trim());
    }
  };

  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/customers/${customerId}`, {
        reason: deleteReason.trim() || null,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete customer");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const action = data.action === "archived" ? "archived" : "deleted";
      toast({ title: `Customer ${action} successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      navigate("/crm/customers");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteCustomer = () => {
    if (deleteConfirmText === "DELETE") {
      deleteCustomerMutation.mutate();
    }
  };

  const resetDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeleteConfirmText("");
    setDeleteReason("");
  };

  const openEditDialog = () => {
    if (customer) {
      setEditName(customer.name || "");
      setEditCustomerType(customer.customerType || "Residential");
      setEditCustomerStatus(customer.customerStatus || "Prospect");
      setEditPhone(customer.phone || "");
      setEditEmail(customer.email || "");
      setEditFullAddress(customer.fullAddress || "");
      setEditLeadSource((customer as any).leadSource || "");
      setEditDialogOpen(true);
    }
  };

  const resetEditForm = () => {
    setEditDialogOpen(false);
    setEditName("");
    setEditCustomerType("");
    setEditCustomerStatus("");
    setEditPhone("");
    setEditEmail("");
    setEditFullAddress("");
    setEditLeadSource("");
  };

  const canChangeCustomerType = currentUser && ["admin", "owner"].includes(currentUser.role);

  const updateCustomerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/crm/customers/${customerId}`, {
        name: editName.trim(),
        customerType: editCustomerType,
        customerStatus: editCustomerStatus,
        phone: editPhone.trim(),
        email: editEmail.trim(),
        fullAddress: editFullAddress.trim(),
        leadSource: editLeadSource.trim(),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update customer");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      resetEditForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpdateCustomer = () => {
    if (!editName.trim()) {
      toast({
        title: "Validation Error",
        description: "Display Name is required",
        variant: "destructive",
      });
      return;
    }
    updateCustomerMutation.mutate();
  };

  const createPropertyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/customers/${customerId}/properties`, {
        address1: propAddress1.trim(),
        address2: propAddress2.trim() || null,
        city: propCity.trim(),
        state: propState.trim(),
        zip: propZip.trim(),
        notes: propNotes.trim() || null,
        tenantName: propTenantName.trim() || null,
        tenantPhone: propTenantPhone.trim() || null,
        tenantEmail: propTenantEmail.trim() || null,
        billedTo: propBilledTo,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create property");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Site added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "properties"] });
      handleClosePropertyDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add site",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isPropertyManager = customer?.customerType?.toLowerCase() === "property manager";

  const handleCreateProperty = () => {
    if (!propAddress1.trim() || !propCity.trim() || !propState.trim() || !propZip.trim()) {
      toast({
        title: "Validation Error",
        description: "Street address, city, state, and ZIP are required",
        variant: "destructive",
      });
      return;
    }
    if (isPropertyManager && !propTenantName.trim()) {
      toast({
        title: "Validation Error",
        description: "Tenant name is required for property manager sites",
        variant: "destructive",
      });
      return;
    }
    if (isPropertyManager && propBilledTo === "tenant" && !propTenantEmail.trim()) {
      toast({
        title: "Validation Error",
        description: "Tenant email is required when billing to tenant",
        variant: "destructive",
      });
      return;
    }
    createPropertyMutation.mutate();
  };

  const getAddressLabel = () => {
    const type = editCustomerType.toLowerCase();
    if (type === "property manager") return "HQ/Mailing Address";
    if (type === "commercial") return "Primary Address";
    return "Service Address";
  };

  const showCompanyNameHint = () => {
    const type = editCustomerType.toLowerCase();
    return type === "property manager" || type === "commercial";
  };

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

          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline"
              onClick={openEditDialog}
              data-testid="button-edit-customer"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit Customer
            </Button>
            {canDeleteCustomer && (
              <Button 
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                data-testid="button-delete-customer"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Customer
              </Button>
            )}
          </div>
        </div>

        {/* New Job Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
                <DialogDescription>
                  Create a new project for {customer.name}.
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
                  {createJobMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Create Work Order Dialog (Standalone) */}
        <Dialog open={scheduleVisitDialogOpen} onOpenChange={(open) => !open && handleCloseWoDialog()}>
          <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Work Order</DialogTitle>
              <DialogDescription>
                Schedule a work order for {customer.name}. Optionally link to a project.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Title */}
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  placeholder="Work order title..."
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                  data-testid="input-wo-title"
                />
              </div>

              {/* Property Selection */}
              <div className="space-y-2">
                <Label>Property *</Label>
                <Select value={woPropertyId} onValueChange={setWoPropertyId}>
                  <SelectTrigger data-testid="select-wo-property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerProperties?.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id} data-testid={`wo-property-${prop.id}`}>
                        {prop.name || prop.address || `Property ${prop.id.slice(-4)}`}
                      </SelectItem>
                    ))}
                    {(!customerProperties || customerProperties.length === 0) && (
                      <div className="px-2 py-1 text-sm text-slate-500">No properties found</div>
                    )}
                  </SelectContent>
                </Select>
                {(!customerProperties || customerProperties.length === 0) && (
                  <p className="text-xs text-amber-600">⚠ Add a property to this customer first</p>
                )}
              </div>

              {/* Link to Project (optional) */}
              <div className="space-y-2">
                <Label>Link to Project (optional)</Label>
                <Select value={woProjectId} onValueChange={setWoProjectId}>
                  <SelectTrigger data-testid="select-wo-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" data-testid="wo-project-none">
                      No project
                    </SelectItem>
                    {crmProjects?.filter(p => p.status !== "archived").map((proj) => (
                      <SelectItem key={proj.id} value={proj.id} data-testid={`wo-project-${proj.id}`}>
                        {proj.title} ({proj.projectType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Visit Type */}
              <div className="space-y-2">
                <Label>Visit Type *</Label>
                <Select value={woVisitType} onValueChange={(v) => setWoVisitType(v as WorkOrderVisitType)}>
                  <SelectTrigger data-testid="select-wo-visit-type">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrderVisitTypeEnum.map((type) => (
                      <SelectItem key={type} value={type} data-testid={`wo-visit-type-${type}`}>
                        {type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={woPriority} onValueChange={setWoPriority}>
                  <SelectTrigger data-testid="select-wo-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize" data-testid={`wo-priority-${p}`}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !woDate && "text-muted-foreground"
                        )}
                        data-testid="button-wo-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {woDate ? format(woDate, "MMM d") : "Pick"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={woDate}
                        onSelect={setWoDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={woStartTime}
                    onChange={(e) => setWoStartTime(e.target.value)}
                    data-testid="input-wo-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={woEndTime}
                    onChange={(e) => setWoEndTime(e.target.value)}
                    data-testid="input-wo-end-time"
                  />
                </div>
              </div>

              {/* Technician */}
              <div className="space-y-2">
                <Label>Assign Tech (optional)</Label>
                <Select value={woTechId} onValueChange={setWoTechId}>
                  <SelectTrigger data-testid="select-wo-tech">
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned" data-testid="wo-tech-unassigned">
                      Unassigned
                    </SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id} data-testid={`wo-tech-${tech.id}`}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Work order description..."
                  value={woDescription}
                  onChange={(e) => setWoDescription(e.target.value)}
                  rows={3}
                  data-testid="textarea-wo-description"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseWoDialog}
                data-testid="button-cancel-wo"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitWorkOrder}
                disabled={createWorkOrderMutation.isPending || !isWoFormValid}
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                data-testid="button-submit-wo"
              >
                {createWorkOrderMutation.isPending ? "Creating..." : "Create Work Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Project Dialog */}
        <Dialog open={createProjectDialogOpen} onOpenChange={(open) => !open && handleCloseProjectDialog()}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Create a new project for {customer.name}.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Title */}
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  placeholder="Project title..."
                  value={projTitle}
                  onChange={(e) => setProjTitle(e.target.value)}
                  data-testid="input-proj-title"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Project Type */}
                <div className="space-y-2">
                  <Label>Project Type *</Label>
                  <Select value={projType} onValueChange={(v) => setProjType(v as ProjectType)}>
                    <SelectTrigger data-testid="select-proj-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectTypeEnum.map((type) => (
                        <SelectItem key={type} value={type} data-testid={`proj-type-${type}`}>
                          {type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={projPriority} onValueChange={setProjPriority}>
                    <SelectTrigger data-testid="select-proj-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize" data-testid={`proj-priority-${p}`}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Property Selection */}
              <div className="space-y-2">
                <Label>Property (optional)</Label>
                <Select value={projPropertyId} onValueChange={setProjPropertyId}>
                  <SelectTrigger data-testid="select-proj-property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="" data-testid="proj-property-none">
                      No property
                    </SelectItem>
                    {customerProperties?.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id} data-testid={`proj-property-${prop.id}`}>
                        {prop.name || prop.address || `Property ${prop.id.slice(-4)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Expected Value */}
              <div className="space-y-2">
                <Label>Expected Value ($)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={projExpectedValue}
                  onChange={(e) => setProjExpectedValue(e.target.value)}
                  data-testid="input-proj-expected-value"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Project description..."
                  value={projDescription}
                  onChange={(e) => setProjDescription(e.target.value)}
                  rows={3}
                  data-testid="textarea-proj-description"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseProjectDialog}
                data-testid="button-cancel-proj"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitProject}
                disabled={createProjectMutation.isPending || !isProjFormValid}
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                data-testid="button-submit-proj"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Customer Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && resetDeleteDialog()}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Delete Customer
              </DialogTitle>
              <DialogDescription>
                This action cannot be easily undone. Please review carefully.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {impactLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : impactData ? (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-100 rounded-lg space-y-2">
                    <p className="font-medium text-slate-900">Impact Summary</p>
                    <p className="text-sm text-slate-600">
                      This customer has:
                    </p>
                    <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                      <li>{impactData.projects} project{impactData.projects !== 1 ? "s" : ""}</li>
                      <li>{impactData.workOrders} work order{impactData.workOrders !== 1 ? "s" : ""}</li>
                      <li>{impactData.quotes} quote{impactData.quotes !== 1 ? "s" : ""}</li>
                      <li>{impactData.invoices} invoice{impactData.invoices !== 1 ? "s" : ""}</li>
                    </ul>
                  </div>

                  {impactData.hasLinkedRecords ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        <strong>Note:</strong> Because this customer has linked records, they will be <strong>archived</strong> instead of permanently deleted. Archived customers can be restored if needed.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800">
                        <strong>Warning:</strong> This customer has no linked records and will be <strong>permanently deleted</strong>. This action cannot be undone.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="delete-reason">Reason (optional)</Label>
                    <Textarea
                      id="delete-reason"
                      placeholder="Why is this customer being removed?"
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      rows={2}
                      data-testid="textarea-delete-reason"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm">
                      Type <span className="font-mono bg-slate-100 px-1">DELETE</span> to confirm
                    </Label>
                    <Input
                      id="delete-confirm"
                      placeholder="Type DELETE to confirm"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                      className={cn(
                        deleteConfirmText && deleteConfirmText !== "DELETE" && "border-red-300"
                      )}
                      data-testid="input-delete-confirm"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">Unable to load impact data.</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={resetDeleteDialog}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteCustomer}
                disabled={deleteCustomerMutation.isPending || deleteConfirmText !== "DELETE"}
                data-testid="button-confirm-delete"
              >
                {deleteCustomerMutation.isPending 
                  ? "Processing..." 
                  : impactData?.hasLinkedRecords 
                    ? "Archive Customer" 
                    : "Delete Customer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Customer Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={(open) => !open && resetEditForm()}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit Customer
              </DialogTitle>
              <DialogDescription>
                Update customer information. Fields marked with * are required.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Display Name *</Label>
                <Input
                  id="edit-name"
                  placeholder="Enter customer name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={!editName.trim() ? "border-red-300" : ""}
                  data-testid="input-edit-name"
                />
                {showCompanyNameHint() && (
                  <p className="text-xs text-slate-500">For commercial customers, enter the company name</p>
                )}
                {!editName.trim() && (
                  <p className="text-sm text-red-500">Display name is required</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-type">Customer Type</Label>
                  <Select 
                    value={editCustomerType} 
                    onValueChange={setEditCustomerType}
                    disabled={!canChangeCustomerType}
                  >
                    <SelectTrigger data-testid="select-edit-customer-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Residential">Residential</SelectItem>
                      <SelectItem value="Commercial">Commercial</SelectItem>
                      <SelectItem value="Property Manager">Property Manager</SelectItem>
                    </SelectContent>
                  </Select>
                  {!canChangeCustomerType && (
                    <p className="text-xs text-slate-500">Only admin/owner can change customer type</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-customer-status">Customer Status</Label>
                  <Select value={editCustomerStatus} onValueChange={setEditCustomerStatus}>
                    <SelectTrigger data-testid="select-edit-customer-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Customer">Customer</SelectItem>
                      <SelectItem value="Prospect">Prospect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    placeholder="Enter phone number"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    data-testid="input-edit-phone"
                  />
                  {!editPhone.trim() && (
                    <p className="text-xs text-amber-600">⚠ No phone number</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    placeholder="Enter email address"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    data-testid="input-edit-email"
                  />
                  {!editEmail.trim() && (
                    <p className="text-xs text-amber-600">⚠ No email address</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-address">{getAddressLabel()}</Label>
                <Textarea
                  id="edit-address"
                  placeholder="Enter address"
                  value={editFullAddress}
                  onChange={(e) => setEditFullAddress(e.target.value)}
                  rows={2}
                  data-testid="textarea-edit-address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-lead-source">Lead Source</Label>
                <Input
                  id="edit-lead-source"
                  placeholder="How did they find you? (e.g., Referral, Google, etc.)"
                  value={editLeadSource}
                  onChange={(e) => setEditLeadSource(e.target.value)}
                  data-testid="input-edit-lead-source"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={resetEditForm}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateCustomer}
                disabled={updateCustomerMutation.isPending || !editName.trim()}
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                data-testid="button-save-edit"
              >
                {updateCustomerMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Property Dialog */}
        <Dialog open={propertyDialogOpen} onOpenChange={(open) => !open && handleClosePropertyDialog()}>
          <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
            <div className="p-4 pb-0">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-5">
                <DialogHeader className="p-0">
                  <DialogTitle className="text-xl font-semibold">Add Site</DialogTitle>
                  <DialogDescription className="text-slate-500">
                    Add a new site/property to this customer
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
            
            <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Address</p>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Street Address <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="123 Main Street"
                    value={propAddress1}
                    onChange={(e) => setPropAddress1(e.target.value)}
                    className="h-11"
                    data-testid="input-prop-address1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600 dark:text-slate-400">Apt, Suite, Unit <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input
                    placeholder="Suite 100"
                    value={propAddress2}
                    onChange={(e) => setPropAddress2(e.target.value)}
                    className="h-11"
                    data-testid="input-prop-address2"
                  />
                </div>
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-sm font-medium">City <span className="text-red-500">*</span></Label>
                    <Input
                      value={propCity}
                      onChange={(e) => setPropCity(e.target.value)}
                      className="h-11"
                      data-testid="input-prop-city"
                    />
                  </div>
                  <div className="col-span-1 space-y-1.5">
                    <Label className="text-sm font-medium">State <span className="text-red-500">*</span></Label>
                    <Input
                      value={propState}
                      onChange={(e) => setPropState(e.target.value)}
                      className="h-11"
                      maxLength={2}
                      data-testid="input-prop-state"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-sm font-medium">ZIP <span className="text-red-500">*</span></Label>
                    <Input
                      value={propZip}
                      onChange={(e) => setPropZip(e.target.value)}
                      className="h-11"
                      data-testid="input-prop-zip"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Textarea
                  placeholder="Any additional notes about this site..."
                  value={propNotes}
                  onChange={(e) => setPropNotes(e.target.value)}
                  className="min-h-[80px] resize-none"
                  data-testid="input-prop-notes"
                />
              </div>

              {/* Tenant Information - Only for Property Manager customers */}
              {isPropertyManager && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 space-y-4 border border-purple-200 dark:border-purple-800">
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Tenant Information</p>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tenant Name <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="John Doe"
                      value={propTenantName}
                      onChange={(e) => setPropTenantName(e.target.value)}
                      className="h-11"
                      data-testid="input-prop-tenant-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-600">Tenant Phone <span className="text-slate-400 font-normal">(optional)</span></Label>
                      <Input
                        placeholder="(706) 555-1234"
                        value={propTenantPhone}
                        onChange={(e) => setPropTenantPhone(e.target.value)}
                        className="h-11"
                        data-testid="input-prop-tenant-phone"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        Tenant Email {propBilledTo === "tenant" ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(optional)</span>}
                      </Label>
                      <Input
                        placeholder="tenant@email.com"
                        type="email"
                        value={propTenantEmail}
                        onChange={(e) => setPropTenantEmail(e.target.value)}
                        className="h-11"
                        data-testid="input-prop-tenant-email"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Billed To</Label>
                    <Select value={propBilledTo} onValueChange={(v) => setPropBilledTo(v as "property_manager" | "tenant")}>
                      <SelectTrigger className="h-11" data-testid="select-prop-billed-to">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="property_manager">Property Manager</SelectItem>
                        <SelectItem value="tenant">Tenant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {propBilledTo === "tenant" && (
                    <div className="flex items-center gap-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-md text-amber-700 dark:text-amber-300 text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>Invoices will be sent to the tenant email address</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900">
              <Button variant="outline" onClick={handleClosePropertyDialog} className="px-6">
                Cancel
              </Button>
              <Button
                onClick={handleCreateProperty}
                disabled={!propAddress1.trim() || !propCity.trim() || !propState.trim() || !propZip.trim() || (isPropertyManager && !propTenantName.trim()) || (isPropertyManager && propBilledTo === "tenant" && !propTenantEmail.trim()) || createPropertyMutation.isPending}
                className="px-6 bg-[#711419] hover:bg-[#5a1014]"
                data-testid="button-save-property"
              >
                {createPropertyMutation.isPending ? "Saving..." : "Add Site"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tabbed view for ALL customer types */}
        <CustomerTabbedView
          customer={customer}
          customerProperties={customerProperties}
          propertiesLoading={propertiesLoading}
          crmProjects={crmProjects}
          projectsLoading={projectsLoading}
          crmWorkOrders={crmWorkOrders}
          workOrdersLoading={workOrdersLoading}
          jobs={jobs}
          notes={notes || []}
          notesLoading={notesLoading}
          noteBody={noteBody}
          setNoteBody={setNoteBody}
          handleAddNote={handleAddNote}
          addNotePending={addNoteMutation.isPending}
          onCreateProject={() => setCreateProjectDialogOpen(true)}
          onScheduleVisit={() => setScheduleVisitDialogOpen(true)}
          onEditCustomer={() => setEditDialogOpen(true)}
          toast={toast}
          propertyDialogOpen={propertyDialogOpen}
          setPropertyDialogOpen={setPropertyDialogOpen}
        />

      </div>
    </CrmLayout>
  );
}
