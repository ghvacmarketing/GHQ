import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser, CrmCustomer, CrmJob, CrmCustomerNote, CrmProject, CrmWorkOrder, CrmProperty, CrmQuote } from "@shared/schema";
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
  crmQuotes: CrmQuote[] | undefined;
  quotesLoading: boolean;
  crmInvoices: any[] | undefined;
  invoicesLoading: boolean;
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
  onEditProperty: (property: CrmProperty) => void;
  toast: ReturnType<typeof useToast>['toast'];
  propertyDialogOpen: boolean;
  setPropertyDialogOpen: (open: boolean) => void;
  onViewQuote: (quoteId: string) => void;
  onViewWorkOrder: (id: string) => void;
  onViewProject: (id: string) => void;
  onViewInvoice: (id: string) => void;
}

function CustomerTabbedView({
  customer,
  customerProperties,
  propertiesLoading,
  crmProjects,
  projectsLoading,
  crmWorkOrders,
  workOrdersLoading,
  crmQuotes,
  quotesLoading,
  crmInvoices,
  invoicesLoading,
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
  onEditProperty,
  toast,
  propertyDialogOpen,
  setPropertyDialogOpen,
  onViewQuote,
  onViewWorkOrder,
  onViewProject,
  onViewInvoice,
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
                    className="p-4 border rounded-lg hover:border-[#711419]/50 hover:bg-[#711419]/5 transition-colors group relative"
                    data-testid={`card-property-${property.id}`}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onEditProperty(property)}
                      data-testid={`button-edit-property-${property.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <h4 className="font-medium">{property.address1}</h4>
                    {property.address2 && <p className="text-sm text-slate-500">{property.address2}</p>}
                    <p className="text-sm text-slate-500">{property.city}, {property.state} {property.zip}</p>
                    {property.tenantName && (
                      <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {property.tenantName}
                      </p>
                    )}
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
                    onClick={() => onViewWorkOrder(wo.id)}
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
                    onClick={() => onViewWorkOrder(wo.id)}
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
                    onClick={() => onViewProject(project.id)}
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
                    onClick={() => onViewProject(project.id)}
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

      {/* Quotes Tab */}
      <TabsContent value="quotes" className="space-y-6" data-testid="tab-content-quotes">
        <Card data-testid="card-quotes">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#711419]" />
              Quotes ({crmQuotes?.length || 0})
            </CardTitle>
            <Link href={`/crm/quotes/new?customerId=${customer.id}`}>
              <Button 
                size="sm"
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                data-testid="button-create-quote"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Quote
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {quotesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !crmQuotes || crmQuotes.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 mb-2">No quotes yet</p>
                <p className="text-sm text-slate-400">
                  Quotes for this customer will appear here.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crmQuotes.map((quote) => (
                    <TableRow 
                      key={quote.id} 
                      data-testid={`row-quote-${quote.id}`}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => onViewQuote(quote.id)}
                    >
                      <TableCell className="font-medium">{quote.quoteNumber}</TableCell>
                      <TableCell>{quote.title}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "text-xs",
                          quote.status === "draft" && "bg-slate-100 text-slate-700",
                          quote.status === "sent" && "bg-blue-100 text-blue-700",
                          quote.status === "accepted" && "bg-green-100 text-green-700",
                          quote.status === "declined" && "bg-red-100 text-red-700",
                          quote.status === "expired" && "bg-yellow-100 text-yellow-700"
                        )}>
                          {quote.status === "accepted" ? "Approved" : quote.status?.charAt(0).toUpperCase() + quote.status?.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {quote.total ? `$${Number(quote.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell>
                        {quote.createdAt ? format(new Date(quote.createdAt), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          data-testid={`button-view-quote-${quote.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewQuote(quote.id);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Invoices & Payments Tab */}
      <TabsContent value="invoices" className="space-y-6" data-testid="tab-content-invoices">
        <Card data-testid="card-invoices">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-[#711419]" />
              Invoices ({crmInvoices?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !crmInvoices || crmInvoices.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 mb-2">No invoices yet</p>
                <p className="text-sm text-slate-400">
                  Invoices and payment history for this customer will appear here.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crmInvoices.map((invoice) => (
                    <TableRow 
                      key={invoice.id} 
                      data-testid={`row-invoice-${invoice.id}`}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => onViewInvoice(invoice.id)}
                    >
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "text-xs",
                          invoice.status === "draft" && "bg-slate-100 text-slate-700",
                          invoice.status === "sent" && "bg-blue-100 text-blue-700",
                          invoice.status === "paid" && "bg-green-100 text-green-700",
                          invoice.status === "partial" && "bg-amber-100 text-amber-700",
                          invoice.status === "void" && "bg-red-100 text-red-700"
                        )}>
                          {invoice.status?.charAt(0).toUpperCase() + invoice.status?.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.total ? `$${Number(invoice.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.balanceDue ? `$${Number(invoice.balanceDue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell>
                        {invoice.createdAt ? format(new Date(invoice.createdAt), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          data-testid={`button-view-invoice-${invoice.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewInvoice(invoice.id);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
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
  const [woTimeSlot, setWoTimeSlot] = useState<string>("08:00-10:00");
  const [woTechId, setWoTechId] = useState<string>("unassigned");
  const [woDescription, setWoDescription] = useState<string>("");
  const [woPriority, setWoPriority] = useState<string>("normal");
  
  // Time slot options (2-hour blocks from 8am to 5pm)
  const timeSlots = [
    { value: "08:00-10:00", label: "8:00 AM - 10:00 AM" },
    { value: "10:00-12:00", label: "10:00 AM - 12:00 PM" },
    { value: "13:00-15:00", label: "1:00 PM - 3:00 PM" },
    { value: "15:00-17:00", label: "3:00 PM - 5:00 PM" },
  ];

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
  const [visitTimeSlot, setVisitTimeSlot] = useState<string>("08:00-10:00");
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
    setWoTimeSlot("08:00-10:00");
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
  // Owner contact fields
  const [propOwnerName, setPropOwnerName] = useState("");
  const [propOwnerPhone, setPropOwnerPhone] = useState("");
  const [propOwnerEmail, setPropOwnerEmail] = useState("");
  // Billing override fields
  const [propBillingOverride, setPropBillingOverride] = useState(false);
  const [propBilledTo, setPropBilledTo] = useState<"property_manager" | "tenant" | "owner">("tenant");
  const [propPaymentTerms, setPropPaymentTerms] = useState("");
  const [propPaymentMethod, setPropPaymentMethod] = useState("");
  const [propApprovalRule, setPropApprovalRule] = useState("");

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
    setPropOwnerName("");
    setPropOwnerPhone("");
    setPropOwnerEmail("");
    setPropBillingOverride(false);
    setPropBilledTo("tenant");
    setPropPaymentTerms("");
    setPropPaymentMethod("");
    setPropApprovalRule("");
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

  // Fetch CRM Quotes for this customer
  const { data: crmQuotesData, isLoading: quotesLoading } = useQuery<{ quotes: CrmQuote[]; pagination: any }>({
    queryKey: ["/api/crm/quotes", { customerId }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes?customerId=${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });
  const crmQuotes = crmQuotesData?.quotes || [];

  // Fetch CRM Invoices for this customer
  interface InvoiceWithDetails {
    id: string;
    invoiceNumber: string;
    customerId: string | null;
    customerName?: string | null;
    status: string;
    total: string;
    balanceDue: string;
    createdAt: Date | null;
    dueDate: Date | null;
  }
  
  const { data: crmInvoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: InvoiceWithDetails[]; pagination: any }>({
    queryKey: ["/api/crm/invoices", { customerId }],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices?customerId=${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });
  const crmInvoices = crmInvoicesData?.invoices || [];

  // Fetch selected quote details for the detail sheet
  interface QuoteLineItem {
    id: string;
    quoteId: string;
    lineType: string;
    description: string;
    partNumber?: string | null;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    taxable?: boolean;
    sortOrder?: number;
  }
  
  type QuoteWithDetails = CrmQuote & {
    lineItems?: QuoteLineItem[];
  };
  
  const { data: selectedQuoteData, isLoading: selectedQuoteLoading } = useQuery<QuoteWithDetails>({
    queryKey: ["/api/crm/quotes", selectedQuoteId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quotes/${selectedQuoteId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quote");
      return res.json();
    },
    enabled: !!currentUser && !!selectedQuoteId,
  });

  // Fetch selected work order details for the detail sheet
  const { data: selectedWorkOrderData, isLoading: selectedWorkOrderLoading } = useQuery<WorkOrderWithDetails>({
    queryKey: ["/api/crm/work-orders", selectedWorkOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${selectedWorkOrderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work order");
      return res.json();
    },
    enabled: !!currentUser && !!selectedWorkOrderId,
  });

  // Fetch selected project details for the detail sheet
  const { data: selectedProjectData, isLoading: selectedProjectLoading } = useQuery<ProjectWithDetails>({
    queryKey: ["/api/crm/projects", selectedProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${selectedProjectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!currentUser && !!selectedProjectId,
  });

  // Fetch selected invoice details for the detail sheet
  interface InvoiceLineItem {
    id: string;
    invoiceId: string;
    lineType: string;
    description: string;
    partNumber?: string | null;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    taxable?: boolean;
    sortOrder?: number;
  }
  
  type InvoiceWithFullDetails = InvoiceWithDetails & {
    lineItems?: InvoiceLineItem[];
    paymentMethod?: string | null;
    amountPaid?: string | null;
    notes?: string | null;
    workOrderId?: string | null;
    projectId?: string | null;
  };
  
  const { data: selectedInvoiceData, isLoading: selectedInvoiceLoading } = useQuery<InvoiceWithFullDetails>({
    queryKey: ["/api/crm/invoices", selectedInvoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/invoices/${selectedInvoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!currentUser && !!selectedInvoiceId,
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
        const [startTimeStr, endTimeStr] = visitTimeSlot.split("-");
        const [hours, minutes] = startTimeStr.split(":").map(Number);
        const scheduledStart = new Date(visitDate);
        scheduledStart.setHours(hours, minutes, 0, 0);
        
        const [endHours, endMinutes] = endTimeStr.split(":").map(Number);
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

      const [startTimeStr2, endTimeStr2] = visitTimeSlot.split("-");
      const [hours, minutes] = startTimeStr2.split(":").map(Number);
      const scheduledStart = new Date(visitDate);
      scheduledStart.setHours(hours, minutes, 0, 0);
      
      const [endHours, endMinutes] = endTimeStr2.split(":").map(Number);
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

      const [startTimeStr, endTimeStr] = woTimeSlot.split("-");
      const [hours, minutes] = startTimeStr.split(":").map(Number);
      const scheduledStart = new Date(woDate);
      scheduledStart.setHours(hours, minutes, 0, 0);
      
      const [endHours, endMinutes] = endTimeStr.split(":").map(Number);
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
        ownerName: propOwnerName.trim() || null,
        ownerPhone: propOwnerPhone.trim() || null,
        ownerEmail: propOwnerEmail.trim() || null,
        billingOverride: propBillingOverride,
        billedTo: propBillingOverride ? propBilledTo : "property_manager",
        paymentTerms: propBillingOverride ? (propPaymentTerms || null) : null,
        paymentMethod: propBillingOverride ? (propPaymentMethod || null) : null,
        approvalRule: propBillingOverride ? (propApprovalRule || null) : null,
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

  const updatePropertyMutation = useMutation({
    mutationFn: async () => {
      if (!editingProperty) throw new Error("No property selected");
      const res = await apiRequest("PATCH", `/api/crm/properties/${editingProperty.id}`, {
        address1: propAddress1.trim(),
        address2: propAddress2.trim() || null,
        city: propCity.trim(),
        state: propState.trim(),
        zip: propZip.trim(),
        notes: propNotes.trim() || null,
        tenantName: propTenantName.trim() || null,
        tenantPhone: propTenantPhone.trim() || null,
        tenantEmail: propTenantEmail.trim() || null,
        ownerName: propOwnerName.trim() || null,
        ownerPhone: propOwnerPhone.trim() || null,
        ownerEmail: propOwnerEmail.trim() || null,
        billingOverride: propBillingOverride,
        billedTo: propBillingOverride ? propBilledTo : "property_manager",
        paymentTerms: propBillingOverride ? (propPaymentTerms || null) : null,
        paymentMethod: propBillingOverride ? (propPaymentMethod || null) : null,
        approvalRule: propBillingOverride ? (propApprovalRule || null) : null,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update property");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Site updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "properties"] });
      handleClosePropertyDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update site",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditProperty = (property: CrmProperty) => {
    setEditingProperty(property);
    setPropAddress1(property.address1 || "");
    setPropAddress2(property.address2 || "");
    setPropCity(property.city || "");
    setPropState(property.state || "");
    setPropZip(property.zip || "");
    setPropNotes(property.notes || "");
    setPropTenantName(property.tenantName || "");
    setPropTenantPhone(property.tenantPhone || "");
    setPropTenantEmail(property.tenantEmail || "");
    setPropOwnerName((property as any).ownerName || "");
    setPropOwnerPhone((property as any).ownerPhone || "");
    setPropOwnerEmail((property as any).ownerEmail || "");
    // If property is billed to tenant or owner, assume billing override was on (backwards compatibility)
    const hasBillingOverride = (property as any).billingOverride || property.billedTo === "tenant" || property.billedTo === "owner";
    setPropBillingOverride(hasBillingOverride);
    setPropBilledTo((property.billedTo as "property_manager" | "tenant" | "owner") || "tenant");
    setPropPaymentTerms((property as any).paymentTerms || "");
    setPropPaymentMethod((property as any).paymentMethod || "");
    setPropApprovalRule((property as any).approvalRule || "");
    setPropertyDialogOpen(true);
  };

  const handleSaveProperty = () => {
    if (!propAddress1.trim() || !propCity.trim() || !propState.trim() || !propZip.trim()) {
      toast({
        title: "Validation Error",
        description: "Street address, city, state, and ZIP are required",
        variant: "destructive",
      });
      return;
    }
    
    // For Property Managers with billing override ON and billing to tenant:
    // Require tenant name and email
    if (isPropertyManager && propBillingOverride && propBilledTo === "tenant") {
      if (!propTenantName.trim()) {
        toast({
          title: "Validation Error",
          description: "Tenant name is required when billing to tenant",
          variant: "destructive",
        });
        return;
      }
      if (!propTenantEmail.trim()) {
        toast({
          title: "Validation Error",
          description: "Tenant email is required when billing to tenant",
          variant: "destructive",
        });
        return;
      }
    }
    
    if (editingProperty) {
      updatePropertyMutation.mutate();
    } else {
      createPropertyMutation.mutate();
    }
  };

  const handleCreateProperty = () => {
    if (!propAddress1.trim() || !propCity.trim() || !propState.trim() || !propZip.trim()) {
      toast({
        title: "Validation Error",
        description: "Street address, city, state, and ZIP are required",
        variant: "destructive",
      });
      return;
    }
    // Only require tenant info when billing override is ON and billing to tenant
    if (isPropertyManager && propBillingOverride && propBilledTo === "tenant" && !propTenantEmail.trim()) {
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
                        {prop.address1}{prop.city ? `, ${prop.city}` : ''}
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
                <Select value={woProjectId || "none"} onValueChange={(v) => setWoProjectId(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-wo-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" data-testid="wo-project-none">
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
              <div className="grid grid-cols-2 gap-4">
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
                  <Label>Time Slot</Label>
                  <Select value={woTimeSlot} onValueChange={setWoTimeSlot}>
                    <SelectTrigger data-testid="select-wo-time-slot">
                      <SelectValue placeholder="Select time slot" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((slot) => (
                        <SelectItem key={slot.value} value={slot.value}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Select value={projPropertyId || "none"} onValueChange={(v) => setProjPropertyId(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-proj-property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" data-testid="proj-property-none">
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

        {/* Add/Edit Property Dialog */}
        <Dialog open={propertyDialogOpen} onOpenChange={(open) => !open && handleClosePropertyDialog()}>
          <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 pb-0 shrink-0">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-5">
                <DialogHeader className="p-0">
                  <DialogTitle className="text-xl font-semibold">{editingProperty ? "Edit Site" : "Add Site"}</DialogTitle>
                  <DialogDescription className="text-slate-500">
                    {editingProperty ? "Update site/property details" : "Add a new site/property to this customer"}
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
            
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
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

              {/* Notes - Only for non-PM customers */}
              {!isPropertyManager && (
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
              )}

              {/* Tenant Contact & Site Details - Only for Property Manager customers */}
              {isPropertyManager && (
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl p-4 space-y-4 border border-violet-200/60 dark:border-violet-700/40 shadow-sm">
                  <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                    Tenant Contact <span className="text-violet-400 font-normal">(optional)</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-600">
                        Tenant Name {propBillingOverride && propBilledTo === "tenant" ? <span className="text-red-500">*</span> : ""}
                      </Label>
                      <Input
                        placeholder="John Doe"
                        value={propTenantName}
                        onChange={(e) => setPropTenantName(e.target.value)}
                        className="h-10 bg-white/80 dark:bg-slate-800/50"
                        data-testid="input-prop-tenant-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-600">
                        Tenant Email {propBillingOverride && propBilledTo === "tenant" ? <span className="text-red-500">*</span> : ""}
                      </Label>
                      <Input
                        placeholder="tenant@email.com"
                        type="email"
                        value={propTenantEmail}
                        onChange={(e) => setPropTenantEmail(e.target.value)}
                        className="h-10 bg-white/80 dark:bg-slate-800/50"
                        data-testid="input-prop-tenant-email"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-600">Tenant Phone</Label>
                    <Input
                      placeholder="(706) 555-1234"
                      value={propTenantPhone}
                      onChange={(e) => setPropTenantPhone(e.target.value)}
                      className="h-10 bg-white/80 dark:bg-slate-800/50"
                      data-testid="input-prop-tenant-phone"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-600">Site Notes</Label>
                    <Textarea
                      placeholder="Gate code, access notes, special instructions..."
                      value={propNotes}
                      onChange={(e) => setPropNotes(e.target.value)}
                      className="min-h-[60px] resize-none bg-white/80 dark:bg-slate-800/50"
                      data-testid="input-prop-notes-inline"
                    />
                  </div>
                </div>
              )}

              {/* Billing Override - Only for Property Manager customers */}
              {isPropertyManager && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Billing Override</p>
                      <p className="text-xs text-slate-500 mt-1">Enable to set custom billing for this site</p>
                    </div>
                    <Switch
                      checked={propBillingOverride}
                      onCheckedChange={setPropBillingOverride}
                      data-testid="switch-billing-override"
                    />
                  </div>
                  
                  {propBillingOverride && (
                    <div className="space-y-4 pt-2 border-t border-blue-200 dark:border-blue-700">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Bill To</Label>
                        <Select value={propBilledTo} onValueChange={(v) => setPropBilledTo(v as "property_manager" | "tenant" | "owner")}>
                          <SelectTrigger className="h-11" data-testid="select-prop-billed-to">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tenant">Tenant</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Payment Terms <span className="text-red-500">*</span></Label>
                        <Select value={propPaymentTerms} onValueChange={setPropPaymentTerms}>
                          <SelectTrigger className="h-11" data-testid="select-prop-payment-terms">
                            <SelectValue placeholder="Select payment terms" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                            <SelectItem value="net_15">Net 15</SelectItem>
                            <SelectItem value="net_30">Net 30</SelectItem>
                            <SelectItem value="net_45">Net 45</SelectItem>
                            <SelectItem value="net_60">Net 60</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Payment Method <span className="text-red-500">*</span></Label>
                        <Select value={propPaymentMethod} onValueChange={setPropPaymentMethod}>
                          <SelectTrigger className="h-11" data-testid="select-prop-payment-method">
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="invoice">Invoice</SelectItem>
                            <SelectItem value="credit_card">Credit Card</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                            <SelectItem value="ach">ACH</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Approval Rule <span className="text-red-500">*</span></Label>
                        <Select value={propApprovalRule} onValueChange={setPropApprovalRule}>
                          <SelectTrigger className="h-11" data-testid="select-prop-approval-rule">
                            <SelectValue placeholder="Select approval rule" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pm_approval_required">PM Approval Required</SelectItem>
                            <SelectItem value="tenant_direct">Tenant Can Approve</SelectItem>
                            <SelectItem value="auto_approve">Auto-Approve</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Owner Contact - when billing to owner */}
                      {propBilledTo === "owner" && (
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 space-y-4 border border-emerald-200/60 dark:border-emerald-700/40">
                          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            Owner Contact <span className="text-red-500">*</span>
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-sm font-medium text-slate-600">Owner Name <span className="text-red-500">*</span></Label>
                              <Input
                                placeholder="Property Owner Name"
                                value={propOwnerName}
                                onChange={(e) => setPropOwnerName(e.target.value)}
                                className="h-10 bg-white/80 dark:bg-slate-800/50"
                                data-testid="input-prop-owner-name"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-sm font-medium text-slate-600">Owner Email <span className="text-red-500">*</span></Label>
                              <Input
                                placeholder="owner@email.com"
                                type="email"
                                value={propOwnerEmail}
                                onChange={(e) => setPropOwnerEmail(e.target.value)}
                                className="h-10 bg-white/80 dark:bg-slate-800/50"
                                data-testid="input-prop-owner-email"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-sm font-medium text-slate-600">Owner Phone</Label>
                              <Input
                                placeholder="(706) 555-1234"
                                value={propOwnerPhone}
                                onChange={(e) => setPropOwnerPhone(e.target.value)}
                                className="h-10 bg-white/80 dark:bg-slate-800/50"
                                data-testid="input-prop-owner-phone"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-sm font-medium text-slate-600">Notes</Label>
                              <Input
                                placeholder="Billing notes..."
                                value={propNotes}
                                onChange={(e) => setPropNotes(e.target.value)}
                                className="h-10 bg-white/80 dark:bg-slate-800/50"
                                data-testid="input-prop-owner-notes"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {propBilledTo === "tenant" && (
                        <div className="flex items-center gap-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-md text-amber-700 dark:text-amber-300 text-sm">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <span>Invoices will be sent to the tenant email address above</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900 shrink-0 rounded-b-xl">
              <Button variant="outline" onClick={handleClosePropertyDialog} className="px-6">
                Cancel
              </Button>
              <Button
                onClick={handleSaveProperty}
                disabled={
                  !propAddress1.trim() || 
                  !propCity.trim() || 
                  !propState.trim() || 
                  !propZip.trim() || 
                  (isPropertyManager && propBillingOverride && (!propPaymentTerms || !propPaymentMethod || !propApprovalRule)) ||
                  (isPropertyManager && propBillingOverride && propBilledTo === "tenant" && (!propTenantName.trim() || !propTenantEmail.trim())) || 
                  (isPropertyManager && propBillingOverride && propBilledTo === "owner" && (!propOwnerName.trim() || !propOwnerEmail.trim())) || 
                  createPropertyMutation.isPending || 
                  updatePropertyMutation.isPending
                }
                className="px-6 bg-[#711419] hover:bg-[#5a1014]"
                data-testid="button-save-property"
              >
                {(createPropertyMutation.isPending || updatePropertyMutation.isPending) ? "Saving..." : (editingProperty ? "Save Changes" : "Add Site")}
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
          crmQuotes={crmQuotes}
          quotesLoading={quotesLoading}
          crmInvoices={crmInvoices}
          invoicesLoading={invoicesLoading}
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
          onEditProperty={handleEditProperty}
          toast={toast}
          propertyDialogOpen={propertyDialogOpen}
          setPropertyDialogOpen={setPropertyDialogOpen}
          onViewQuote={(quoteId) => setSelectedQuoteId(quoteId)}
          onViewWorkOrder={(id) => setSelectedWorkOrderId(id)}
          onViewProject={(id) => setSelectedProjectId(id)}
          onViewInvoice={(id) => setSelectedInvoiceId(id)}
        />

        {/* Quote Detail Sheet */}
        <Sheet open={!!selectedQuoteId} onOpenChange={(open) => !open && setSelectedQuoteId(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col" data-testid="sheet-quote-detail">
            <SheetHeader className="shrink-0 pb-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#711419]" />
                {selectedQuoteData?.quoteNumber || "Quote Details"}
              </SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="flex-1 -mx-6 px-6">
              {selectedQuoteLoading ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : selectedQuoteData ? (
                <div className="space-y-6 py-4">
                  {/* Quote Header */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">{selectedQuoteData.title || "Untitled Quote"}</h3>
                    <div className="flex items-center gap-3">
                      <Badge className={cn(
                        "text-xs",
                        selectedQuoteData.status === "draft" && "bg-slate-100 text-slate-700",
                        selectedQuoteData.status === "sent" && "bg-blue-100 text-blue-700",
                        selectedQuoteData.status === "accepted" && "bg-green-100 text-green-700",
                        selectedQuoteData.status === "declined" && "bg-red-100 text-red-700",
                        selectedQuoteData.status === "expired" && "bg-yellow-100 text-yellow-700",
                        (selectedQuoteData.status as string) === "converted" && "bg-emerald-100 text-emerald-700"
                      )}>
                        {selectedQuoteData.status === "accepted" ? "Approved" : 
                         selectedQuoteData.status?.charAt(0).toUpperCase() + selectedQuoteData.status?.slice(1)}
                      </Badge>
                      <span className="text-sm text-slate-500">
                        Created {selectedQuoteData.createdAt ? format(new Date(selectedQuoteData.createdAt), 'MMM d, yyyy') : '—'}
                      </span>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Customer Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Customer</p>
                      <p className="text-sm font-medium">{selectedQuoteData.customerName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Service Address</p>
                      <p className="text-sm">{selectedQuoteData.serviceAddress || "—"}</p>
                    </div>
                    {selectedQuoteData.customerEmail && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Email</p>
                        <p className="text-sm">{selectedQuoteData.customerEmail}</p>
                      </div>
                    )}
                    {selectedQuoteData.customerPhone && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Phone</p>
                        <p className="text-sm">{selectedQuoteData.customerPhone}</p>
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  {/* AI Generated Quote Content */}
                  {selectedQuoteData.aiGeneratedQuote ? (
                    <div className="space-y-4">
                      <h4 className="font-medium text-sm text-slate-700">Proposal</h4>
                      {(() => {
                        const aiQuote = selectedQuoteData.aiGeneratedQuote;
                        const options = aiQuote?.options || [];
                        
                        return options.length > 0 ? (
                          <div className="space-y-4">
                            {options.map((option: any, idx: number) => (
                              <div key={idx} className="border rounded-lg p-4 bg-slate-50">
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="font-semibold">{option.title || `Option ${idx + 1}`}</h5>
                                  {option.tags && option.tags.length > 0 && (
                                    <div className="flex gap-1">
                                      {option.tags.map((tag: string, tagIdx: number) => (
                                        <Badge key={tagIdx} variant="outline" className="text-xs">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 mb-2">{option.description}</p>
                                <p className="text-lg font-bold text-[#711419]">
                                  ${Number(option.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </p>
                                {option.inclusions && option.inclusions.length > 0 && (
                                  <div className="mt-3">
                                    <p className="text-xs font-medium text-slate-500 mb-1">Includes:</p>
                                    <ul className="text-sm text-slate-600 space-y-1">
                                      {option.inclusions.map((item: string, iIdx: number) => (
                                        <li key={iIdx} className="flex items-start gap-2">
                                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="border rounded-lg p-4 bg-slate-50">
                            <p className="text-sm text-slate-600">{aiQuote?.description || "No description available"}</p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : selectedQuoteData.lineItems && selectedQuoteData.lineItems.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-slate-700">Line Items</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left p-2 font-medium text-slate-600">Description</th>
                              <th className="text-right p-2 font-medium text-slate-600">Qty</th>
                              <th className="text-right p-2 font-medium text-slate-600">Price</th>
                              <th className="text-right p-2 font-medium text-slate-600">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedQuoteData.lineItems.map((item) => (
                              <tr key={item.id} className="border-t">
                                <td className="p-2">{item.description}</td>
                                <td className="p-2 text-right">{item.quantity}</td>
                                <td className="p-2 text-right">${Number(item.unitPrice).toFixed(2)}</td>
                                <td className="p-2 text-right">${Number(item.lineTotal).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No line items</p>
                  )}
                  
                  <Separator />
                  
                  {/* Total */}
                  <div className="flex justify-between items-center p-4 bg-slate-100 rounded-lg">
                    <span className="font-medium">Total</span>
                    <span className="text-xl font-bold text-[#711419]">
                      ${Number(selectedQuoteData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  {/* Notes */}
                  {selectedQuoteData.notes && (
                    <div>
                      <h4 className="font-medium text-sm text-slate-700 mb-2">Notes</h4>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedQuoteData.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">Quote not found</p>
              )}
            </ScrollArea>
            
            {/* Footer Actions */}
            <div className="shrink-0 pt-4 border-t flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedQuoteId(null)}
                data-testid="button-close-quote-sheet"
              >
                Close
              </Button>
              <Button
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                onClick={() => {
                  setSelectedQuoteId(null);
                  navigate(`/crm/quotes/${selectedQuoteId}`);
                }}
                data-testid="button-open-full-quote"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Full Details
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Work Order Detail Sheet */}
        <Sheet open={!!selectedWorkOrderId} onOpenChange={(open) => !open && setSelectedWorkOrderId(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col" data-testid="sheet-work-order-detail">
            <SheetHeader className="shrink-0 pb-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-[#711419]" />
                Work Order Details
              </SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="flex-1 -mx-6 px-6">
              {selectedWorkOrderLoading ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : selectedWorkOrderData ? (
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">{selectedWorkOrderData.title || selectedWorkOrderData.visitType?.replace(/_/g, " ") || "Work Order"}</h3>
                    <div className="flex items-center gap-3">
                      <Badge className={cn(
                        "text-xs",
                        selectedWorkOrderData.status === "scheduled" && "bg-blue-100 text-blue-700",
                        selectedWorkOrderData.status === "dispatched" && "bg-purple-100 text-purple-700",
                        selectedWorkOrderData.status === "en_route" && "bg-amber-100 text-amber-700",
                        selectedWorkOrderData.status === "on_site" && "bg-orange-100 text-orange-700",
                        selectedWorkOrderData.status === "completed" && "bg-green-100 text-green-700",
                        selectedWorkOrderData.status === "cancelled" && "bg-red-100 text-red-700",
                        !["scheduled", "dispatched", "en_route", "on_site", "completed", "cancelled"].includes(selectedWorkOrderData.status) && "bg-slate-100 text-slate-700"
                      )}>
                        {selectedWorkOrderData.status?.replace(/_/g, " ").charAt(0).toUpperCase() + selectedWorkOrderData.status?.slice(1).replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {selectedWorkOrderData.visitType?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Scheduled Date</p>
                      <div className="flex items-center gap-1 text-sm">
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                        {selectedWorkOrderData.scheduledStart 
                          ? format(new Date(selectedWorkOrderData.scheduledStart), 'MMM d, yyyy') 
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Time</p>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-4 w-4 text-slate-400" />
                        {selectedWorkOrderData.scheduledStart 
                          ? format(new Date(selectedWorkOrderData.scheduledStart), 'h:mm a') 
                          : '—'}
                        {selectedWorkOrderData.scheduledEnd && 
                          ` - ${format(new Date(selectedWorkOrderData.scheduledEnd), 'h:mm a')}`}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Assigned Tech</p>
                      <div className="flex items-center gap-1 text-sm">
                        <User className="h-4 w-4 text-slate-400" />
                        {selectedWorkOrderData.assignedTechName || "Unassigned"}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Priority</p>
                      <Badge className={cn(
                        "text-xs",
                        selectedWorkOrderData.priority === "low" && "bg-slate-100 text-slate-600",
                        selectedWorkOrderData.priority === "normal" && "bg-blue-100 text-blue-600",
                        selectedWorkOrderData.priority === "high" && "bg-amber-100 text-amber-600",
                        selectedWorkOrderData.priority === "urgent" && "bg-red-100 text-red-600"
                      )}>
                        {selectedWorkOrderData.priority || "Normal"}
                      </Badge>
                    </div>
                  </div>
                  
                  {selectedWorkOrderData.propertyAddress && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Service Address</p>
                        <div className="flex items-start gap-1 text-sm">
                          <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                          {selectedWorkOrderData.propertyAddress}
                        </div>
                      </div>
                    </>
                  )}
                  
                  {selectedWorkOrderData.description && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Description</p>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedWorkOrderData.description}</p>
                      </div>
                    </>
                  )}
                  
                  {selectedWorkOrderData.projectTitle && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Related Project</p>
                        <div className="flex items-center gap-1 text-sm text-blue-600">
                          <Briefcase className="h-4 w-4" />
                          {selectedWorkOrderData.projectTitle}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">Work order not found</p>
              )}
            </ScrollArea>
            
            <div className="shrink-0 pt-4 border-t flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedWorkOrderId(null)}
                data-testid="button-close-wo-sheet"
              >
                Close
              </Button>
              <Button
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                onClick={() => {
                  setSelectedWorkOrderId(null);
                  navigate(`/crm/work-orders/${selectedWorkOrderId}`);
                }}
                data-testid="button-open-full-wo"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Full Details
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Project Detail Sheet */}
        <Sheet open={!!selectedProjectId} onOpenChange={(open) => !open && setSelectedProjectId(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col" data-testid="sheet-project-detail">
            <SheetHeader className="shrink-0 pb-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-[#711419]" />
                Project Details
              </SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="flex-1 -mx-6 px-6">
              {selectedProjectLoading ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : selectedProjectData ? (
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">{selectedProjectData.title || "Untitled Project"}</h3>
                    <div className="flex items-center gap-3">
                      <Badge className={cn(
                        "text-xs",
                        selectedProjectData.status === "lead" && "bg-slate-100 text-slate-700",
                        selectedProjectData.status === "proposal_sent" && "bg-amber-100 text-amber-700",
                        selectedProjectData.status === "approved" && "bg-blue-100 text-blue-700",
                        selectedProjectData.status === "in_progress" && "bg-green-100 text-green-700",
                        selectedProjectData.status === "completed" && "bg-emerald-100 text-emerald-700",
                        selectedProjectData.status === "archived" && "bg-gray-100 text-gray-700"
                      )}>
                        {selectedProjectData.status?.replace(/_/g, " ").charAt(0).toUpperCase() + selectedProjectData.status?.slice(1).replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {selectedProjectData.projectType}
                      </Badge>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Project Type</p>
                      <p className="text-sm font-medium">{selectedProjectData.projectType}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Expected Value</p>
                      <div className="flex items-center gap-1 text-sm font-medium text-[#711419]">
                        <DollarSign className="h-4 w-4" />
                        {selectedProjectData.expectedValue 
                          ? Number(selectedProjectData.expectedValue).toLocaleString('en-US', { minimumFractionDigits: 2 }) 
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Priority</p>
                      <Badge className={cn(
                        "text-xs",
                        selectedProjectData.priority === "low" && "bg-slate-100 text-slate-600",
                        selectedProjectData.priority === "normal" && "bg-blue-100 text-blue-600",
                        selectedProjectData.priority === "high" && "bg-amber-100 text-amber-600",
                        selectedProjectData.priority === "urgent" && "bg-red-100 text-red-600"
                      )}>
                        {selectedProjectData.priority || "Normal"}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Work Orders</p>
                      <div className="flex items-center gap-1 text-sm">
                        <Wrench className="h-4 w-4 text-slate-400" />
                        {selectedProjectData.workOrderCount || 0} work order(s)
                      </div>
                    </div>
                  </div>
                  
                  {selectedProjectData.customerName && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Customer</p>
                        <p className="text-sm font-medium">{selectedProjectData.customerName}</p>
                      </div>
                    </>
                  )}
                  
                  {selectedProjectData.propertyAddress && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Property Address</p>
                        <div className="flex items-start gap-1 text-sm">
                          <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                          {selectedProjectData.propertyAddress}
                        </div>
                      </div>
                    </>
                  )}
                  
                  {selectedProjectData.description && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Description</p>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedProjectData.description}</p>
                      </div>
                    </>
                  )}
                  
                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-slate-500">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide mb-1">Created</p>
                      <p>{selectedProjectData.createdAt ? format(new Date(selectedProjectData.createdAt), 'MMM d, yyyy') : '—'}</p>
                    </div>
                    {selectedProjectData.updatedAt && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide mb-1">Last Updated</p>
                        <p>{format(new Date(selectedProjectData.updatedAt), 'MMM d, yyyy')}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">Project not found</p>
              )}
            </ScrollArea>
            
            <div className="shrink-0 pt-4 border-t flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedProjectId(null)}
                data-testid="button-close-project-sheet"
              >
                Close
              </Button>
              <Button
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                onClick={() => {
                  setSelectedProjectId(null);
                  navigate(`/crm/projects/${selectedProjectId}`);
                }}
                data-testid="button-open-full-project"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Full Details
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Invoice Detail Sheet */}
        <Sheet open={!!selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col" data-testid="sheet-invoice-detail">
            <SheetHeader className="shrink-0 pb-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-[#711419]" />
                {selectedInvoiceData?.invoiceNumber || "Invoice Details"}
              </SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="flex-1 -mx-6 px-6">
              {selectedInvoiceLoading ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : selectedInvoiceData ? (
                <div className="space-y-6 py-4">
                  {/* Invoice Header */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Badge className={cn(
                        "text-xs",
                        selectedInvoiceData.status === "draft" && "bg-slate-100 text-slate-700",
                        selectedInvoiceData.status === "sent" && "bg-blue-100 text-blue-700",
                        selectedInvoiceData.status === "paid" && "bg-green-100 text-green-700",
                        selectedInvoiceData.status === "partial" && "bg-amber-100 text-amber-700",
                        selectedInvoiceData.status === "void" && "bg-red-100 text-red-700"
                      )}>
                        {selectedInvoiceData.status?.charAt(0).toUpperCase() + selectedInvoiceData.status?.slice(1)}
                      </Badge>
                      {selectedInvoiceData.dueDate && (
                        <span className="text-sm text-slate-500">
                          Due: {format(new Date(selectedInvoiceData.dueDate), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Invoice Details */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Created</p>
                      <p className="font-medium">
                        {selectedInvoiceData.createdAt ? format(new Date(selectedInvoiceData.createdAt), 'MMM d, yyyy') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Due Date</p>
                      <p className="font-medium">
                        {selectedInvoiceData.dueDate ? format(new Date(selectedInvoiceData.dueDate), 'MMM d, yyyy') : '—'}
                      </p>
                    </div>
                    {selectedInvoiceData.paymentMethod && (
                      <div>
                        <p className="text-slate-500">Payment Method</p>
                        <p className="font-medium capitalize">{selectedInvoiceData.paymentMethod.replace('_', ' ')}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Financial Summary */}
                  <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total</span>
                      <span className="font-semibold">
                        ${Number(selectedInvoiceData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {selectedInvoiceData.amountPaid && Number(selectedInvoiceData.amountPaid) > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Amount Paid</span>
                        <span>
                          -${Number(selectedInvoiceData.amountPaid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold border-t pt-2">
                      <span>Balance Due</span>
                      <span className={Number(selectedInvoiceData.balanceDue || 0) > 0 ? "text-red-600" : "text-green-600"}>
                        ${Number(selectedInvoiceData.balanceDue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  
                  {/* Line Items */}
                  {selectedInvoiceData.lineItems && selectedInvoiceData.lineItems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold">Line Items</h4>
                      <div className="divide-y border rounded-lg">
                        {selectedInvoiceData.lineItems.map((item) => (
                          <div key={item.id} className="p-3 text-sm">
                            <div className="flex justify-between">
                              <span className="font-medium">{item.description}</span>
                              <span className="font-semibold">
                                ${Number(item.lineTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex gap-4 text-slate-500 text-xs mt-1">
                              <span>Qty: {item.quantity}</span>
                              <span>@ ${Number(item.unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              {item.partNumber && <span>Part: {item.partNumber}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Notes */}
                  {selectedInvoiceData.notes && (
                    <div className="space-y-2">
                      <h4 className="font-semibold">Notes</h4>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedInvoiceData.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">Invoice not found</p>
              )}
            </ScrollArea>
            
            <div className="shrink-0 pt-4 border-t flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedInvoiceId(null)}
                data-testid="button-close-invoice-sheet"
              >
                Close
              </Button>
              <Button
                className="bg-[#711419] hover:bg-[#5a1014] text-white"
                onClick={() => {
                  setSelectedInvoiceId(null);
                  navigate(`/crm/invoices/${selectedInvoiceId}`);
                }}
                data-testid="button-open-full-invoice"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Full Details
              </Button>
            </div>
          </SheetContent>
        </Sheet>

      </div>
    </CrmLayout>
  );
}
