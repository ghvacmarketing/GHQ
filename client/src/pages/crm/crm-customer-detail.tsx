import { useState, useEffect, useRef } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, useParams, useSearch, Link } from "wouter";
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
import { jsPDF } from "jspdf";
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
  Download,
  Eye,
  X,
  Loader2,
  XCircle,
  Navigation,
  AlertTriangle,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  Link2,
  GitBranch,
  Search,
  ChevronRight,
  Info,
  Upload,
  ImageIcon,
  ShieldCheck,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { CrmLayout } from "@/components/crm/crm-layout";
import { CommentComposer } from "@/components/crm/comment-composer";
import { EntityTasksTab } from "@/components/crm/entity-tasks-tab";
import type { CrmUser, CrmCustomer, CrmJob, CrmCustomerNote, CrmProject, CrmWorkOrder, CrmProperty, CrmQuote, ChecklistQuestion } from "@shared/schema";
import { workOrderVisitTypeEnum, type WorkOrderVisitType, projectTypeEnum, type ProjectType, projectStatusEnum, type ProjectStatus, workOrderStatusEnum, type WorkOrderStatus, type WorkSubtype, type WorkOrderSubtype } from "@shared/schema";
import { createLocalDateTime } from "@/lib/timezone";
import { format, formatDistanceToNow, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";

const JOB_TYPES = ["SERVICE", "INSTALL", "MAINTENANCE", "SALES"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;

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
};

const workOrderStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  dispatched: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  en_route: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  on_site: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  completed: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  cancelled: { bg: "bg-red-100", text: "text-red-500", border: "border-red-200" },
};

const workOrderStatusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "Traveling",
  on_site: "Working",
  completed: "Completed",
  cancelled: "Cancelled",
};

const visitTypeLabels: Record<string, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  MAINTENANCE: "Maintenance",
  SALES: "Sales",
};

const WORK_SUBTYPE_TO_SERVICE_TYPE: Record<string, string> = {
  "No Heat": "NO_HEAT",
  "No Cool": "NO_AC",
  "Water Leak": "WATER_LEAK",
  "Strange Noise": "STRANGE_NOISE",
  "Thermostat Issue": "THERMOSTAT_ISSUE",
  "Electrical": "OTHER",
  "Thermostat": "THERMOSTAT_ISSUE",
  "Airflow": "OTHER",
  "Noise": "STRANGE_NOISE",
  "IAQ": "OTHER",
  "Other": "OTHER",
  "A/C Repair": "NO_AC",
  "AC Repair": "NO_AC",
  "Heating Repair": "NO_HEAT",
  "Furnace Repair": "NO_HEAT",
  "Heat Pump Repair": "NO_HEAT",
  "Ductless Repair": "NO_AC",
  "Mini Split Repair": "NO_AC",
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

function protectionPlanLabel(level: string | null | undefined): string {
  if (!level) return "";
  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}

interface CustomerOverviewProps {
  customer: CrmCustomer;
  jobs: JobWithTech[];
  onCreateProject: () => void;
  onCreateWorkOrder: () => void;
  onCreateLead: () => void;
}

interface CustomerNoteWithUser extends CrmCustomerNote {
  userName: string | null;
}

function CustomerOverview({ customer, jobs, onCreateProject, onCreateWorkOrder, onCreateLead }: CustomerOverviewProps) {
  const customerType = (customer.customerType || "residential").toLowerCase();
  
  const openProjects = jobs?.filter(j => !["completed", "invoiced", "paid", "cancelled"].includes(j.status)).length || 0;
  const upcomingVisits = jobs?.filter(j => {
    if (!j.scheduledStart) return false;
    const scheduled = new Date(j.scheduledStart);
    return scheduled > new Date() && !["completed", "invoiced", "paid", "cancelled"].includes(j.status);
  }).length || 0;
  const completedProjects = jobs?.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).length || 0;
  
  if (customerType === "property_manager" || customerType === "property manager") {
    return <PropertyManagerOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} onCreateProject={onCreateProject} onCreateWorkOrder={onCreateWorkOrder} onCreateLead={onCreateLead} />;
  }
  
  if (customerType === "commercial") {
    return <CommercialOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} onCreateProject={onCreateProject} onCreateWorkOrder={onCreateWorkOrder} onCreateLead={onCreateLead} />;
  }
  
  return <ResidentialOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} onCreateProject={onCreateProject} onCreateWorkOrder={onCreateWorkOrder} onCreateLead={onCreateLead} />;
}

interface OverviewLayoutProps {
  customer: CrmCustomer;
  openProjects: number;
  upcomingVisits: number;
  completedProjects: number;
  onCreateProject: () => void;
  onCreateWorkOrder: () => void;
  onCreateLead: () => void;
}

function ResidentialOverview({ customer, openProjects, upcomingVisits, completedProjects, onCreateProject, onCreateWorkOrder, onCreateLead }: OverviewLayoutProps) {
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

      <Card className="border shadow-sm" data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-slate-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Button 
              size="sm"
              onClick={onCreateProject}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-quick-create-project"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Button>
            <Button 
              size="sm"
              onClick={onCreateWorkOrder}
              variant="outline"
              className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
              data-testid="button-quick-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Work Order
            </Button>
            <Button 
              size="sm"
              onClick={onCreateLead}
              variant="outline"
              className="border-amber-600 text-amber-600 hover:bg-amber-50"
              data-testid="button-quick-create-lead"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Lead
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PropertyManagerOverview({ customer, openProjects, upcomingVisits, completedProjects, onCreateProject, onCreateWorkOrder, onCreateLead }: OverviewLayoutProps) {
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

      <Card className="border shadow-sm" data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-slate-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Button 
              size="sm"
              onClick={onCreateProject}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-quick-create-project"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Button>
            <Button 
              size="sm"
              onClick={onCreateWorkOrder}
              variant="outline"
              className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
              data-testid="button-quick-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Work Order
            </Button>
            <Button 
              size="sm"
              onClick={onCreateLead}
              variant="outline"
              className="border-amber-600 text-amber-600 hover:bg-amber-50"
              data-testid="button-quick-create-lead"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Lead
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CommercialOverview({ customer, openProjects, upcomingVisits, completedProjects, onCreateProject, onCreateWorkOrder, onCreateLead }: OverviewLayoutProps) {
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

      <Card className="border shadow-sm" data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-slate-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3">
            <Button 
              size="sm"
              onClick={onCreateProject}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-quick-create-project"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Button>
            <Button 
              size="sm"
              onClick={onCreateWorkOrder}
              variant="outline"
              className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
              data-testid="button-quick-create-work-order"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Work Order
            </Button>
            <Button 
              size="sm"
              onClick={onCreateLead}
              variant="outline"
              className="border-amber-600 text-amber-600 hover:bg-amber-50"
              data-testid="button-quick-create-lead"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Lead
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
  customerId: string;
  onCommentPosted: () => void;
}

function NotesSection({ notes, notesLoading, customerId, onCommentPosted }: NotesSectionProps) {
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
          <CommentComposer
            entityType="customer"
            entityId={customerId}
            onCommentPosted={onCommentPosted}
            placeholder="Add a note about this customer..."
          />

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

// Types for agreements with visits
interface MaintenanceVisitWithWorkOrder {
  id: string;
  agreementId: string;
  visitNumber: number;
  cycleYear: number;
  targetDate: string;
  reminderSentAt: string | null;
  workOrderId: string | null;
  completedAt: string | null;
  status: "pending" | "scheduled" | "completed" | "cancelled";
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  workOrder: {
    id: string;
    workOrderNumber: string;
    title: string | null;
    status: string;
  } | null;
}

interface AgreementWithVisits {
  id: string;
  agreementNumber: string;
  customerId: string | null;
  customerName: string;
  agreementPlan: string;
  nextServiceDate: string | null;
  nextInvoiceDate: string | null;
  address: string | null;
  status: "active" | "expiring" | "expired" | "cancelled";
  isActive: boolean;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  contractDate: string | null;
  appointmentDate: string | null;
  price: string | null;
  visitsPerPeriod: number;
  frequency?: string;
  autoRenew: boolean;
  regionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  maintenanceVisits: MaintenanceVisitWithWorkOrder[];
}

const agreementStatusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-green-100", text: "text-green-700" },
  grace_period: { bg: "bg-amber-100", text: "text-amber-700" },
  expiring: { bg: "bg-amber-100", text: "text-amber-700" },
  expired: { bg: "bg-red-100", text: "text-red-700" },
  cancelled: { bg: "bg-slate-100", text: "text-slate-700" },
};

const agreementStatusLabels: Record<string, string> = {
  active: "Active",
  grace_period: "Grace Period",
  expired: "Expired",
  expiring: "Expiring",
  cancelled: "Cancelled",
};

function getAgreementStatus(endDate: string | null, storedStatus?: string): "active" | "grace_period" | "expired" | "cancelled" {
  // Honor any explicit non-active status before applying date-based logic
  if (storedStatus && storedStatus !== "active") {
    return storedStatus as "cancelled" | "expired" | "grace_period";
  }
  
  if (!endDate) return "active";
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  const daysSinceEnd = differenceInCalendarDays(today, end);
  
  // daysSinceEnd < 0: Active (end date is in the future)
  // daysSinceEnd >= 0 && daysSinceEnd <= 30: Grace Period (0-30 days since expiration)
  // daysSinceEnd > 30: Expired (more than 30 days since expiration)
  if (daysSinceEnd < 0) {
    return "active";
  } else if (daysSinceEnd <= 30) {
    return "grace_period";
  } else {
    return "expired";
  }
}

const visitStatusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-slate-100", text: "text-slate-700" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

interface CustomerFileData {
  id: string;
  customerId: string;
  name: string;
  url: string;
  objectPath?: string | null;
  contentType?: string | null;
  size?: number | null;
  uploadedBy?: string | null;
  createdAt?: string | null;
}

function CustomerFilesTab({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);

  const { data: files = [], isLoading } = useQuery<CustomerFileData[]>({
    queryKey: ['/api/crm/customers', customerId, 'files'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/crm/customers/${customerId}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', customerId, 'files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', customerId, 'timeline'] });
      setDeleteFileId(null);
      toast({ title: "File deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete file", variant: "destructive" });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type,
        });
        const { uploadURL, objectPath } = await presignRes.json();

        await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        const fileUrl = `/objects/${objectPath}`;
        await apiRequest("POST", `/api/crm/customers/${customerId}/files`, {
          name: file.name,
          url: fileUrl,
          objectPath,
          contentType: file.type,
          size: file.size,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', customerId, 'files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', customerId, 'timeline'] });
      toast({ title: `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} uploaded` });
    } catch (err) {
      console.error("Upload error:", err);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const images = files.filter(f => f.contentType?.startsWith('image/'));
  const docs = files.filter(f => !f.contentType?.startsWith('image/'));

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleUpload}
        accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.doc,.docx,.xlsx"
      />

      <Card data-testid="card-files">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#711419]" />
            Files & Photos
            {files.length > 0 && (
              <Badge variant="secondary" className="ml-1">{files.length}</Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            className="bg-[#711419] hover:bg-[#5a1014] text-white"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-file"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            {uploading ? "Uploading..." : "Upload File"}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-2">No files or photos yet</p>
              <p className="text-sm text-slate-400">
                Upload documents, photos, and other files related to this customer.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {images.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4" />
                    Photos ({images.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {images.map(file => (
                      <div key={file.id} className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                        <img
                          src={file.url}
                          alt={file.name}
                          className="w-full h-32 object-cover cursor-pointer"
                          onClick={() => setViewImage(file.url)}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <button
                            className="p-1.5 bg-white rounded-full shadow"
                            onClick={() => setViewImage(file.url)}
                          >
                            <Eye className="h-4 w-4 text-slate-700" />
                          </button>
                          <a
                            href={file.url}
                            download={file.name}
                            className="p-1.5 bg-white rounded-full shadow"
                          >
                            <Download className="h-4 w-4 text-slate-700" />
                          </a>
                          <button
                            className="p-1.5 bg-white rounded-full shadow"
                            onClick={() => setDeleteFileId(file.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </div>
                        <div className="p-2">
                          <p className="text-xs text-slate-600 truncate">{file.name}</p>
                          {file.size && (
                            <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {docs.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Documents ({docs.length})
                  </h3>
                  <div className="space-y-2">
                    {docs.map(file => (
                      <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 group">
                        <div className="p-2 bg-slate-100 rounded">
                          <FileText className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                          <p className="text-xs text-slate-400">
                            {formatSize(file.size)}
                            {file.createdAt && ` · ${new Date(file.createdAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={file.url}
                            download={file.name}
                            className="p-1.5 hover:bg-slate-100 rounded"
                          >
                            <Download className="h-4 w-4 text-slate-500" />
                          </a>
                          <button
                            className="p-1.5 hover:bg-red-50 rounded"
                            onClick={() => setDeleteFileId(file.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {viewImage && (
        <Dialog open={!!viewImage} onOpenChange={() => setViewImage(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Photo Preview</DialogTitle>
            </DialogHeader>
            <img src={viewImage} alt="Preview" className="w-full h-auto rounded-lg" />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!deleteFileId} onOpenChange={() => setDeleteFileId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFileId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteFileId && deleteMutation.mutate(deleteFileId)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface TimelineEntry {
  id: string;
  type: 'work_order' | 'project' | 'agreement' | 'quote' | 'invoice' | 'note' | 'payment' | 'file';
  title: string;
  description: string;
  timestamp: string;
  status?: string;
  amount?: string;
  linkUrl?: string;
  signatureImage?: string;
  signerName?: string;
  fileUrl?: string;
  contentType?: string;
}

const timelineTypeConfig: Record<TimelineEntry['type'], { icon: any; bgColor: string; textColor: string; borderColor: string; label: string }> = {
  work_order: { icon: Wrench, bgColor: "bg-blue-100", textColor: "text-blue-700", borderColor: "border-blue-200", label: "Work Order" },
  project: { icon: Briefcase, bgColor: "bg-purple-100", textColor: "text-purple-700", borderColor: "border-purple-200", label: "Project" },
  agreement: { icon: FileText, bgColor: "bg-green-100", textColor: "text-green-700", borderColor: "border-green-200", label: "Agreement" },
  quote: { icon: FileText, bgColor: "bg-amber-100", textColor: "text-amber-700", borderColor: "border-amber-200", label: "Quote" },
  invoice: { icon: Receipt, bgColor: "bg-slate-100", textColor: "text-slate-700", borderColor: "border-slate-200", label: "Invoice" },
  note: { icon: MessageSquare, bgColor: "bg-gray-100", textColor: "text-gray-700", borderColor: "border-gray-200", label: "Note" },
  payment: { icon: DollarSign, bgColor: "bg-emerald-100", textColor: "text-emerald-700", borderColor: "border-emerald-200", label: "Payment" },
  file: { icon: Upload, bgColor: "bg-teal-100", textColor: "text-teal-700", borderColor: "border-teal-200", label: "File" },
};

function TimelineTabContent({ customerId }: { customerId: string }) {
  const [, navigate] = useLocation();
  const allTypes: TimelineEntry['type'][] = ['work_order', 'project', 'agreement', 'quote', 'invoice', 'note', 'payment', 'file'];
  const [activeFilters, setActiveFilters] = useState<Set<TimelineEntry['type']>>(() => new Set(allTypes));
  
  const { data: timeline, isLoading, isError, error } = useQuery<TimelineEntry[]>({
    queryKey: ['/api/crm/customers', customerId, 'timeline'],
    queryFn: async () => {
      const response = await fetch(`/api/crm/customers/${customerId}/timeline`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch timeline');
      return response.json();
    },
  });

  const toggleFilter = (type: TimelineEntry['type']) => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(type)) {
        newFilters.delete(type);
      } else {
        newFilters.add(type);
      }
      return newFilters;
    });
  };

  const { toast } = useToast();
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await apiRequest("DELETE", `/api/crm/comments/${commentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/customers', customerId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['/api/crm/comments', 'customer', customerId] });
      toast({ title: "Comment deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete comment", variant: "destructive" });
    },
  });

  const filteredTimeline = timeline?.filter(entry => activeFilters.has(entry.type)) || [];

  if (isLoading) {
    return (
      <Card data-testid="card-timeline-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#711419]" />
            Customer Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.keys(timelineTypeConfig).map((type) => (
                <Skeleton key={type} className="h-8 w-24 rounded-full" />
              ))}
            </div>
            <div className="space-y-6 mt-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-24 flex-1" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card data-testid="card-timeline-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#711419]" />
            Customer Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-500 mb-2">Failed to load timeline</p>
            <p className="text-sm text-slate-400">
              {(error as Error)?.message || 'An error occurred while loading the timeline.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <Card data-testid="card-timeline-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#711419]" />
            Customer Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <History className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-2">No timeline yet</p>
            <p className="text-sm text-slate-400">
              Activity timeline will appear here as you work with this customer.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-timeline">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-[#711419]" />
          Customer Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-6" data-testid="timeline-filter-bar">
          {(Object.keys(timelineTypeConfig) as TimelineEntry['type'][]).map((type) => {
            const config = timelineTypeConfig[type];
            const isActive = activeFilters.has(type);
            return (
              <Badge
                key={type}
                variant="outline"
                className={cn(
                  "cursor-pointer transition-all px-3 py-1.5",
                  isActive
                    ? `${config.bgColor} ${config.textColor} ${config.borderColor}`
                    : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                )}
                onClick={() => toggleFilter(type)}
                data-testid={`filter-${type}`}
              >
                <config.icon className="h-3 w-3 mr-1.5" />
                {config.label}
              </Badge>
            );
          })}
        </div>

        {filteredTimeline.length === 0 ? (
          <div className="text-center py-8" data-testid="timeline-filtered-empty">
            <History className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-2">No matching entries</p>
            <p className="text-sm text-slate-400">
              Adjust your filters to see more timeline.
            </p>
          </div>
        ) : (
          <div className="relative" data-testid="timeline-timeline">
            <div className="absolute left-[90px] top-0 bottom-0 w-px bg-slate-200" />
            <div className="space-y-4">
              {filteredTimeline.map((entry) => {
                const config = timelineTypeConfig[entry.type];
                const IconComponent = config.icon;
                const formattedDate = format(new Date(entry.timestamp), "MMM d, yyyy");
                const formattedTime = format(new Date(entry.timestamp), "h:mm a");
                
                const content = (
                  <div 
                    className={cn(
                      "flex items-start gap-4 group",
                      entry.linkUrl && "cursor-pointer"
                    )}
                    data-testid={`timeline-entry-${entry.id}`}
                  >
                    <div className="w-[80px] text-right flex-shrink-0 pt-2">
                      <p className="text-xs font-medium text-slate-600">{formattedDate}</p>
                      <p className="text-xs text-slate-400">{formattedTime}</p>
                    </div>
                    
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white shadow-sm",
                      config.bgColor
                    )}>
                      <IconComponent className={cn("h-4 w-4", config.textColor)} />
                    </div>
                    
                    <div className={cn(
                      "flex-1 p-4 rounded-lg border transition-all",
                      config.borderColor,
                      "bg-white",
                      entry.linkUrl && "group-hover:shadow-md group-hover:border-slate-300"
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={cn("text-xs", config.bgColor, config.textColor)}>
                              {config.label}
                            </Badge>
                            {entry.status && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {entry.status.replace(/_/g, ' ')}
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium text-slate-900">{entry.title}</h4>
                          {entry.type !== 'quote' && (
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{entry.description}</p>
                          )}
                          {entry.type === 'quote' && entry.signatureImage && (
                            <div className="mt-2 space-y-1">
                              {entry.signerName && (
                                <p className="text-xs text-slate-500">Signed by: <span className="font-medium">{entry.signerName}</span></p>
                              )}
                              <div className="border border-slate-200 rounded-md bg-slate-50 p-1 inline-block">
                                <img
                                  src={entry.signatureImage}
                                  alt="Client signature"
                                  className="h-12 w-auto max-w-[200px] object-contain"
                                />
                              </div>
                            </div>
                          )}
                          {entry.type === 'file' && entry.fileUrl && (
                            <div className="mt-2">
                              {entry.contentType?.startsWith('image/') ? (
                                <a href={entry.fileUrl} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={entry.fileUrl}
                                    alt={entry.description}
                                    className="h-20 w-auto max-w-[200px] object-cover rounded-md border border-slate-200"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={entry.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-[#711419] hover:underline"
                                >
                                  <Download className="h-3 w-3" />
                                  Download
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {entry.amount && (
                            <p className="font-semibold text-slate-900">{entry.amount}</p>
                          )}
                          {entry.type === 'note' && entry.id.startsWith('comment-') && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This comment will be permanently removed from the timeline.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={() => deleteCommentMutation.mutate(entry.id.replace('comment-', ''))}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                      {entry.linkUrl && (
                        <div className="mt-2 flex items-center text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View details
                        </div>
                      )}
                    </div>
                  </div>
                );

                return (
                  <div 
                    key={entry.id} 
                    onClick={() => entry.linkUrl && navigate(entry.linkUrl)}
                    onKeyDown={(e) => e.key === 'Enter' && entry.linkUrl && navigate(entry.linkUrl)}
                    tabIndex={entry.linkUrl ? 0 : undefined}
                    role={entry.linkUrl ? "link" : undefined}
                    className={entry.linkUrl ? "cursor-pointer" : ""}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgreementsTabContent({ customerId }: { customerId: string }) {
  const { data: agreements, isLoading, isError, error } = useQuery<AgreementWithVisits[]>({
    queryKey: [`/api/crm/customers/${customerId}/agreements`],
  });

  if (isLoading) {
    return (
      <Card data-testid="card-agreements-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#711419]" />
            Maintenance Agreements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card data-testid="card-agreements-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#711419]" />
            Maintenance Agreements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-500 mb-2">Failed to load agreements</p>
            <p className="text-sm text-slate-400">
              {(error as Error)?.message || 'An error occurred while loading maintenance agreements.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!agreements || agreements.length === 0) {
    return (
      <Card data-testid="card-agreements-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#711419]" />
            Maintenance Agreements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-2">No maintenance agreements</p>
            <p className="text-sm text-slate-400">
              This customer doesn't have any maintenance agreements.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Agreement Summary Cards */}
      {agreements.map((agreement) => {
        const summaryStatus = getAgreementStatus(agreement.endDate, agreement.status);
        return (
        <Card key={`summary-${agreement.id}`} className="bg-green-50/50 border-green-100" data-testid={`agreement-summary-${agreement.id}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Agreement Summary
              <Badge
                className={`text-xs ml-auto ${
                  agreementStatusColors[summaryStatus]?.bg || "bg-slate-100"
                } ${
                  agreementStatusColors[summaryStatus]?.text || "text-slate-700"
                }`}
              >
                {agreementStatusLabels[summaryStatus] || summaryStatus}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Name */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Customer</p>
              <p className="font-semibold">{agreement.customerName || 'Not selected'}</p>
            </div>

            {/* Location/Property Address - helps differentiate multi-location agreements */}
            {agreement.address && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Location / Property</p>
                <p className="font-medium text-slate-700">{agreement.address}</p>
              </div>
            )}

            {/* Plan Name with Frequency Badge */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Plan</p>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{agreement.agreementPlan || 'Maintenance Agreement'}</p>
                <Badge 
                  variant="outline" 
                  className={
                    agreement.frequency === "weekly" ? "bg-purple-100 text-purple-700 border-purple-200" :
                    agreement.frequency === "monthly" ? "bg-blue-100 text-blue-700 border-blue-200" :
                    "bg-amber-100 text-amber-700 border-amber-200"
                  }
                >
                  {agreement.frequency === "weekly" ? "Weekly" : 
                   agreement.frequency === "monthly" ? "Monthly" : "Annual"}
                </Badge>
              </div>
            </div>

            {/* Visit Progress and Total Amount - side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Visit Progress</p>
                {(() => {
                  const completed = agreement.maintenanceVisits?.filter(v => v.status === "completed").length || 0;
                  const total = agreement.visitsPerPeriod || 0;
                  return (
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold">{completed} of {total}</p>
                      <span className="text-sm text-muted-foreground">complete</span>
                    </div>
                  );
                })()}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Amount</p>
                <p className="text-xl font-bold text-green-600">${parseFloat(agreement.price || '0').toFixed(2)}</p>
              </div>
            </div>

            {/* Scheduled Visits */}
            {agreement.maintenanceVisits && agreement.maintenanceVisits.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Scheduled Visits</p>
                <div className="space-y-2">
                  {agreement.maintenanceVisits.map((visit, index) => {
                    const statusColor = visitStatusColors[visit.status] || visitStatusColors.pending;
                    return (
                      <div key={visit.id} className="flex items-center gap-2">
                        <span className={`rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium ${
                          visit.status === "completed" ? "bg-green-200 text-green-700" :
                          visit.status === "scheduled" ? "bg-blue-200 text-blue-700" :
                          "bg-slate-200 text-slate-700"
                        }`}>
                          {visit.status === "completed" ? <CheckCircle className="h-3 w-3" /> : index + 1}
                        </span>
                        <span className="text-sm">{format(new Date(visit.targetDate), 'MMM d, yyyy')}</span>
                        <Badge 
                          variant="outline" 
                          className={`${statusColor.bg} ${statusColor.text} text-xs`}
                        >
                          {visit.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Start and End dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Start</p>
                <p className="font-medium">{agreement.startDate ? format(new Date(agreement.startDate), 'MMM d, yyyy') : 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">End</p>
                <p className="font-medium">{agreement.endDate ? format(new Date(agreement.endDate), 'MMM d, yyyy') : 'Not set'}</p>
              </div>
            </div>

            {/* Auto-renew badge */}
            <div className="flex items-center gap-2 pt-2">
              {agreement.autoRenew ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Auto-renew enabled
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Auto-renew disabled
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        );
      })}

      {/* Detailed Agreements Card */}
      <Card data-testid="card-agreements">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#711419]" />
            Maintenance Agreements ({agreements.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agreements.map((agreement) => {
          const currentYear = new Date().getFullYear();
          const currentYearVisits = agreement.maintenanceVisits.filter(
            (v) => v.cycleYear === currentYear
          );
          const completedCount = currentYearVisits.filter(
            (v) => v.status === "completed"
          ).length;
          const scheduledCount = currentYearVisits.filter(
            (v) => v.status === "scheduled"
          ).length;
          const totalProgress = completedCount + scheduledCount;
          const progressPercent = Math.min(
            (completedCount / agreement.visitsPerPeriod) * 100,
            100
          );
          const calculatedStatus = getAgreementStatus(agreement.endDate, agreement.status);

          return (
            <div
              key={agreement.id}
              className="border rounded-lg p-4 space-y-4"
              data-testid={`card-agreement-${agreement.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-slate-900">
                      {agreement.agreementNumber}
                    </h4>
                    <Badge
                      className={`text-xs ${
                        agreementStatusColors[calculatedStatus]?.bg || "bg-slate-100"
                      } ${
                        agreementStatusColors[calculatedStatus]?.text || "text-slate-700"
                      }`}
                    >
                      {agreementStatusLabels[calculatedStatus] || calculatedStatus}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">{agreement.agreementPlan}</p>
                  {agreement.address && (
                    <p className="text-sm text-slate-500 mt-0.5">{agreement.address}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">
                    Start Date
                  </p>
                  <p className="font-medium text-slate-700">
                    {agreement.startDate
                      ? format(new Date(agreement.startDate), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">
                    End Date
                  </p>
                  <p className="font-medium text-slate-700">
                    {agreement.endDate
                      ? format(new Date(agreement.endDate), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">
                    Next Service
                  </p>
                  <p className="font-medium text-slate-700">
                    {agreement.nextServiceDate
                      ? format(new Date(agreement.nextServiceDate), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">
                    Visits/Period
                  </p>
                  <p className="font-medium text-slate-700">
                    {agreement.visitsPerPeriod}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    Visit Progress ({currentYear})
                  </span>
                  <span className="font-medium text-slate-700">
                    {completedCount} of {agreement.visitsPerPeriod} completed
                    {scheduledCount > 0 && `, ${scheduledCount} scheduled`}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {agreement.maintenanceVisits.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                    Scheduled Visits
                  </p>
                  <div className="space-y-2">
                    {agreement.maintenanceVisits.map((visit) => (
                      <div
                        key={visit.id}
                        className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm"
                        data-testid={`row-visit-${visit.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-700">
                            Visit {visit.visitNumber}
                          </span>
                          <Badge
                            className={`text-xs ${
                              visitStatusColors[visit.status]?.bg || "bg-slate-100"
                            } ${
                              visitStatusColors[visit.status]?.text ||
                              "text-slate-700"
                            }`}
                          >
                            {visit.status.charAt(0).toUpperCase() +
                              visit.status.slice(1)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-slate-600">
                            Target: {format(new Date(visit.targetDate), "MMM d, yyyy")}
                          </span>
                          {visit.completedAt && (
                            <span className="text-green-600">
                              Completed: {format(new Date(visit.completedAt), "MMM d, yyyy")}
                            </span>
                          )}
                          {visit.workOrder && (
                            <Link
                              href={`/crm/work-orders/${visit.workOrder.id}`}
                              className="text-[#711419] hover:underline font-medium"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`link-work-order-${visit.workOrder.id}`}
                            >
                              WO-{visit.workOrder.workOrderNumber}
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
    </div>
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
  onCommentPosted: () => void;
  onCreateProject: () => void;
  onScheduleVisit: () => void;
  onCreateLead: () => void;
  onEditCustomer: () => void;
  onEditProperty: (property: CrmProperty) => void;
  toast: ReturnType<typeof useToast>['toast'];
  propertyDialogOpen: boolean;
  setPropertyDialogOpen: (open: boolean) => void;
  onOpenAddPropertyDialog: () => void;
  onViewQuote: (quoteId: string) => void;
  onViewWorkOrder: (id: string) => void;
  onViewProject: (id: string) => void;
  onViewInvoice: (id: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
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
  onCommentPosted,
  onCreateProject,
  onScheduleVisit,
  onCreateLead,
  onEditCustomer,
  onEditProperty,
  toast,
  propertyDialogOpen,
  setPropertyDialogOpen,
  onOpenAddPropertyDialog,
  onViewQuote,
  onViewWorkOrder,
  onViewProject,
  onViewInvoice,
  activeTab,
  setActiveTab,
}: CustomerTabbedViewProps) {
  const [, navigate] = useLocation();
  const completedJobs = jobs?.filter(j => ["completed", "invoiced", "paid"].includes(j.status)) || [];
  const customerType = (customer.customerType || "residential").toLowerCase();

  // Sub-accounts of this customer
  interface SubAccountSummary {
    id: string;
    name: string;
    companyName: string | null;
    customerType: string | null;
    customerStatus: string | null;
    email: string | null;
    phone: string | null;
    fullAddress: string | null;
    parentCustomerId: string | null;
    billToParent: boolean | null;
  }
  const { data: subAccounts = [] } = useQuery<SubAccountSummary[]>({
    queryKey: ["/api/crm/customers", customer.id, "sub-accounts"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customer.id}/sub-accounts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sub-accounts");
      return res.json();
    },
  });

  // Parent customer data (when this customer IS a sub-account)
  const { data: parentCustomer, isLoading: parentCustomerLoading } = useQuery<CrmCustomer>({
    queryKey: ["/api/crm/customers", customer.parentCustomerId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customer.parentCustomerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch parent customer");
      return res.json();
    },
    enabled: !!customer.parentCustomerId,
    retry: 1,
  });

  // Mutation to directly update billToParent without opening the full edit dialog
  const updateBillingMutation = useMutation({
    mutationFn: async (billToParent: boolean) => {
      return apiRequest("PATCH", `/api/crm/customers/${customer.id}`, { billToParent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customer.id] });
    },
  });

  const { data: overviewTimeline, isLoading: timelineLoading } = useQuery<TimelineEntry[]>({
    queryKey: ['/api/crm/customers', customer.id, 'timeline'],
    queryFn: async () => {
      const response = await fetch(`/api/crm/customers/${customer.id}/timeline`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch timeline');
      return response.json();
    },
  });

  const combinedTimelineEntries = (() => {
    const entries: Array<{ id: string; type: string; title: string; description: string; timestamp: Date; userName?: string }> = [];
    
    overviewTimeline?.forEach(entry => {
      entries.push({
        id: entry.id,
        type: entry.type,
        title: entry.title,
        description: entry.description,
        timestamp: new Date(entry.timestamp),
      });
    });
    
    notes?.forEach(note => {
      entries.push({
        id: note.id,
        type: 'note',
        title: note.userName || 'Note',
        description: note.body,
        timestamp: new Date(note.createdAt || Date.now()),
      });
    });
    
    return entries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  })();
  const isPropertyManager = customerType === "property_manager" || customerType === "property manager";
  const isCommercial = customerType === "commercial";
  
  const hasAtLeastOneSite = (customerProperties?.length || 0) > 0;
  const hasOpsContact = false;
  const hasAPContact = false;
  const setupComplete = hasAtLeastOneSite && hasOpsContact && hasAPContact;
  const completedSteps = [hasAtLeastOneSite, hasOpsContact, hasAPContact].filter(Boolean).length;

  const upcomingWorkOrders = crmWorkOrders?.filter(wo => ["scheduled", "dispatched", "en_route", "on_site"].includes(wo.status) && !wo.isHistorical) || [];
  const completedWorkOrders = crmWorkOrders?.filter(wo => ["completed", "invoiced", "paid"].includes(wo.status) && !wo.isHistorical) || [];
  const historicalWorkOrders = crmWorkOrders?.filter(wo => wo.isHistorical === true) || [];

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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" data-testid="customer-tabs">
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
          value="locations" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-locations"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Locations
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
          value="tasks" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-tasks"
        >
          <ClipboardList className="h-4 w-4 mr-2" />
          Tasks
        </TabsTrigger>
        <TabsTrigger 
          value="agreements" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-agreements"
        >
          <FileText className="h-4 w-4 mr-2" />
          Agreements
        </TabsTrigger>
        <TabsTrigger 
          value="timeline" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-timeline"
        >
          <History className="h-4 w-4 mr-2" />
          Timeline
        </TabsTrigger>
        <TabsTrigger 
          value="settings" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
          data-testid="tab-settings"
        >
          <ClipboardList className="h-4 w-4 mr-2" />
          Settings
        </TabsTrigger>
        {/* Sub-Account tab — only shown when this customer IS a sub-account */}
        {customer?.parentCustomerId && (
          <TabsTrigger
            value="sub-account"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
            data-testid="tab-sub-account"
          >
            <GitBranch className="h-4 w-4 mr-2" />
            Sub-Account
          </TabsTrigger>
        )}
        {/* Sub-Accounts tab — only shown when this customer HAS sub-accounts */}
        {subAccounts.length > 0 && (
          <TabsTrigger
            value="sub-accounts"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
            data-testid="tab-sub-accounts"
          >
            <Users className="h-4 w-4 mr-2" />
            Sub-Accounts ({subAccounts.length})
          </TabsTrigger>
        )}
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
              <div className="flex flex-col items-end gap-1.5">
                <Badge className={getCustomerBadgeColor()}>{customer.customerType}</Badge>
                {customer.protectionPlanLevel && (
                  <Badge
                    className="bg-emerald-100 text-emerald-700 border-emerald-200 flex items-center gap-1"
                    data-testid="badge-protection-plan"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {protectionPlanLabel(customer.protectionPlanLevel)} Protection Member
                  </Badge>
                )}
              </div>
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
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Protection Plan</p>
                  {customer.protectionPlanLevel ? (
                    <div className="flex items-center gap-1.5" data-testid="text-protection-plan">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium text-slate-900">
                        {protectionPlanLabel(customer.protectionPlanLevel)} Plan Member
                      </span>
                      {customer.protectionPlanSince && (
                        <span className="text-xs text-slate-400">
                          since {formatDate(customer.protectionPlanSince)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">Not a member</p>
                  )}
                </div>
                {customer.parentCustomerId && parentCustomer && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Parent Account</p>
                    <Link href={`/crm/customers/${customer.parentCustomerId}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {parentCustomer.name}
                    </Link>
                    {customer.billToParent && (
                      <Badge variant="outline" className="text-xs mt-1 border-amber-300 text-amber-700 bg-amber-50">Bills to Parent</Badge>
                    )}
                  </div>
                )}
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
                {subAccounts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Sub-Accounts</p>
                    <div className="space-y-1">
                      {subAccounts.slice(0, 3).map(sub => (
                        <button key={sub.id} onClick={() => navigate(`/crm/customers/${sub.id}`)} className="text-sm text-blue-600 hover:underline flex items-center gap-1 w-full text-left">
                          <ChevronRight className="h-3 w-3" />
                          {sub.name}
                        </button>
                      ))}
                      {subAccounts.length > 3 && (
                        <p className="text-xs text-slate-400">+{subAccounts.length - 3} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
                    Step 1: Add at least 1 Location/Property
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
                  onClick={onOpenAddPropertyDialog}
                  data-testid="button-add-location-checklist"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Location
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

        {/* Customer Timeline Section */}
        <Card data-testid="card-customer-timeline-overview">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#711419]" />
              Customer Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <CommentComposer
                entityType="customer"
                entityId={customer.id}
                onCommentPosted={onCommentPosted}
                placeholder="Add a comment about this customer..."
              />

              {timelineLoading || notesLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : combinedTimelineEntries.length === 0 ? (
                <div className="text-center py-6">
                  <History className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No activity yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Comments and activity will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {combinedTimelineEntries.map((entry) => {
                    const config = entry.type === 'note' 
                      ? { icon: MessageSquare, bgColor: "bg-gray-100", textColor: "text-gray-700" }
                      : timelineTypeConfig[entry.type as TimelineEntry['type']] || { icon: Circle, bgColor: "bg-slate-100", textColor: "text-slate-700" };
                    const IconComponent = config.icon;
                    
                    return (
                      <div 
                        key={entry.id} 
                        className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                        data-testid={`timeline-entry-overview-${entry.id}`}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                          config.bgColor
                        )}>
                          <IconComponent className={cn("h-4 w-4", config.textColor)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-medium text-sm text-slate-700 truncate">
                              {entry.title}
                            </span>
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              {format(entry.timestamp, "MMM d, yyyy 'at' h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 line-clamp-2">
                            {entry.description?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-[#711419] hover:text-[#711419] hover:bg-[#711419]/10"
                  onClick={() => setActiveTab("timeline")}
                  data-testid="button-view-all-timeline"
                >
                  View All Timeline
                  <History className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Locations Tab */}
      <TabsContent value="locations" className="space-y-6" data-testid="tab-content-locations">
        <Card data-testid="card-locations">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#711419]" />
              Locations/Properties ({customerProperties?.length || 0})
            </CardTitle>
            <Button 
              size="sm"
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              onClick={onOpenAddPropertyDialog}
              data-testid="button-add-location"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Location
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
                <p className="text-slate-500 mb-4">No locations/properties added yet</p>
                <Button 
                  className="bg-[#711419] hover:bg-[#5a1014] text-white"
                  onClick={onOpenAddPropertyDialog}
                  data-testid="button-add-first-location"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add First Location
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

        {historicalWorkOrders.length > 0 && (
          <Card data-testid="card-historical-wo-tab">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-500" />
                Service History - FieldEdge ({historicalWorkOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {historicalWorkOrders.slice(0, 12).map((wo) => (
                  <div 
                    key={wo.id}
                    className="p-4 border rounded-lg border-slate-200 bg-slate-50/50"
                    data-testid={`card-historical-wo-${wo.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-sm line-clamp-1">{wo.title || wo.visitType}</h4>
                      <Badge variant="outline" className="text-xs shrink-0 bg-slate-100">
                        Historical
                      </Badge>
                    </div>
                    <Badge className="text-xs bg-slate-100 text-slate-600">
                      {wo.visitType?.replace(/_/g, " ") || "Service"}
                    </Badge>
                    {wo.scheduledStart && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-2">
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(wo.scheduledStart), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {historicalWorkOrders.length > 12 && (
                <p className="text-sm text-slate-500 text-center mt-4">
                  Showing 12 of {historicalWorkOrders.length} historical records
                </p>
              )}
            </CardContent>
          </Card>
        )}
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
            <Link href={`/crm/invoices/new?customerId=${customer.id}`}>
              <Button size="sm" className="bg-[#711419] hover:bg-[#5a1014] text-white">
                <Plus className="h-4 w-4 mr-1" />
                Create Invoice
              </Button>
            </Link>
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
                    <TableHead>Work Order</TableHead>
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
                        {invoice.workOrder ? (
                          <Link 
                            href={`/crm/work-orders/${invoice.workOrder.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#711419] hover:underline text-sm"
                          >
                            WO-{invoice.workOrder.workOrderNumber}
                          </Link>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </TableCell>
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

      {/* Files / Photos Tab */}
      <TabsContent value="files" className="space-y-6" data-testid="tab-content-files">
        <CustomerFilesTab customerId={customer.id} />
      </TabsContent>

      {/* Tasks Tab */}
      <TabsContent value="tasks" className="space-y-6" data-testid="tab-content-tasks">
        <EntityTasksTab
          entityType="customer"
          entityId={customer.id}
          customerId={customer.id}
          customerName={customer.name}
        />
      </TabsContent>

      {/* Agreements Tab */}
      <TabsContent value="agreements" className="space-y-6" data-testid="tab-content-agreements">
        <AgreementsTabContent customerId={customer.id} />
      </TabsContent>

      {/* Timeline Tab */}
      <TabsContent value="timeline" className="space-y-6" data-testid="tab-content-timeline">
        <TimelineTabContent customerId={customer.id} />
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

      {/* Sub-Account Tab — visible only when this customer is a sub-account */}
      {customer.parentCustomerId && (
        <TabsContent value="sub-account" className="space-y-4" data-testid="tab-content-sub-account">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-[#711419]" />
                Sub-Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Parent account row */}
              <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Parent Account</p>
                  {parentCustomerLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </div>
                  ) : parentCustomer ? (
                    <>
                      <Link
                        href={`/crm/customers/${customer.parentCustomerId}`}
                        className="text-base font-medium text-blue-600 hover:underline flex items-center gap-1.5"
                      >
                        <Building2 className="h-4 w-4" />
                        {parentCustomer.name}
                      </Link>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {parentCustomer.phone && (
                          <a href={`tel:${parentCustomer.phone}`} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-700">
                            <Phone className="h-3.5 w-3.5" />{parentCustomer.phone}
                          </a>
                        )}
                        {parentCustomer.email && (
                          <a href={`mailto:${parentCustomer.email}`} className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-700">
                            <Mail className="h-3.5 w-3.5" />{parentCustomer.email}
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <Link
                      href={`/crm/customers/${customer.parentCustomerId}`}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      View parent account
                    </Link>
                  )}
                </div>
              </div>

              {/* Billing preference — inline toggle */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Billing Preference</p>
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                      !customer.billToParent
                        ? "bg-[#711419] text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => !customer.billToParent ? null : updateBillingMutation.mutate(false)}
                    disabled={updateBillingMutation.isPending}
                  >
                    Bill to this account
                  </button>
                  <button
                    className={`flex-1 px-4 py-2.5 text-sm font-medium border-l transition-colors ${
                      customer.billToParent
                        ? "bg-[#711419] text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => customer.billToParent ? null : updateBillingMutation.mutate(true)}
                    disabled={updateBillingMutation.isPending}
                  >
                    Bill to parent
                    {parentCustomer && <span className="ml-1 opacity-75 text-xs">({parentCustomer.name})</span>}
                  </button>
                </div>
                {updateBillingMutation.isPending && (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {/* Sub-Accounts Tab — visible only when this customer has sub-accounts */}
      {subAccounts.length > 0 && (
        <TabsContent value="sub-accounts" className="space-y-6" data-testid="tab-content-sub-accounts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#711419]" />
                Sub-Accounts ({subAccounts.length})
              </CardTitle>
              <button
                onClick={() => navigate(`/crm/accounts/new?parentId=${customer.id}`)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#711419] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Sub-Account
              </button>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {subAccounts.map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
                    onClick={() => navigate(`/crm/customers/${sub.id}`)}
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-blue-600 flex items-center gap-1">
                        {sub.name}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {sub.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{sub.phone}</span>}
                        {sub.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{sub.email}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sub.billToParent ? (
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">Bills to Parent</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">Bills Here</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}

export default function CrmCustomerDetail() {
  usePageTitle("Customer Detail");
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  const backHref = (() => {
    const p = new URLSearchParams(searchString);
    const from = p.get("from");
    const q = p.get("q");
    if (from === "customers" && q) return `/crm/customers?search=${encodeURIComponent(q)}`;
    return null;
  })();
  const goBack = () => backHref ? navigate(backHref) : window.history.back();
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    const validTabs = ["overview", "locations", "work-orders", "projects", "quotes", "invoices", "files", "tasks", "agreements", "timeline", "settings", "sub-accounts"];
    return tabParam && validTabs.includes(tabParam) ? tabParam : "overview";
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [scheduleVisitDialogOpen, setScheduleVisitDialogOpen] = useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<CrmProperty | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [showQuotePreview, setShowQuotePreview] = useState(false);
  const [showQuoteDeleteConfirm, setShowQuoteDeleteConfirm] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showInvoicePaymentDialog, setShowInvoicePaymentDialog] = useState(false);
  const [showInvoiceVoidConfirm, setShowInvoiceVoidConfirm] = useState(false);
  const [invoicePaymentAmount, setInvoicePaymentAmount] = useState("");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<"cash" | "check" | "credit_card" | "bank_transfer" | "other">("check");
  const { toast } = useToast();

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editCustomerType, setEditCustomerType] = useState("");
  const [editCustomerStatus, setEditCustomerStatus] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editFullAddress, setEditFullAddress] = useState("");
  const [editLeadSource, setEditLeadSource] = useState("");
  const [editParentCustomerId, setEditParentCustomerId] = useState<string | null>(null);
  const [editBillToParent, setEditBillToParent] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [showParentDropdown, setShowParentDropdown] = useState(false);

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
  const [woWorkSubtype, setWoWorkSubtype] = useState<WorkSubtype>("Other");
  const [woPropertyId, setWoPropertyId] = useState<string>("");
  const [woProjectId, setWoProjectId] = useState<string>("");
  const [woDate, setWoDate] = useState<Date | undefined>(new Date());
  const [woStartTime, setWoStartTime] = useState<string>("08:00");
  const [woEndTime, setWoEndTime] = useState<string>("10:00");
  const [woTechId, setWoTechId] = useState<string>("unassigned");
  const [woDescription, setWoDescription] = useState<string>("");
  const [woPriority, setWoPriority] = useState<string>("normal");
  const [woAgreementId, setWoAgreementId] = useState<string>("");
  
  // Service call checklist state
  const [checklistQuestions, setChecklistQuestions] = useState<ChecklistQuestion[]>([]);
  const [checklistAnswers, setChecklistAnswers] = useState<Record<string, string | boolean | number>>({});
  const [showChecklist, setShowChecklist] = useState(true);
  const [checklistLoading, setChecklistLoading] = useState(false);
  
  // Dynamic maintenance subtypes (includes custom agreement types)
  const [maintenanceSubtypes, setMaintenanceSubtypes] = useState<string[]>(["Preventative Maintenance"]);
  
  // Generate 30-minute interval time options from 8 AM to 8 PM
  const timeOptions = (() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let min = 0; min < 60; min += 30) {
        if (hour === 20 && min > 0) break;
        const h = hour.toString().padStart(2, "0");
        const m = min.toString().padStart(2, "0");
        const value = `${h}:${m}`;
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const ampm = hour >= 12 ? "PM" : "AM";
        const label = `${displayHour}:${m.padStart(2, "0")} ${ampm}`;
        options.push({ value, label });
      }
    }
    return options;
  })();

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
    setWoWorkSubtype("Other");
    setWoPropertyId("");
    setWoProjectId("");
    setWoDate(new Date());
    setWoStartTime("08:00");
    setWoEndTime("10:00");
    setWoTechId("unassigned");
    setWoDescription("");
    setWoPriority("normal");
    setWoAgreementId("");
    setChecklistQuestions([]);
    setChecklistAnswers({});
    setShowChecklist(true);
  };

  const generateLocalChecklistSummary = (): string => {
    if (checklistQuestions.length === 0) return "";
    
    const summaryParts: string[] = [];
    checklistQuestions.forEach(q => {
      const answer = checklistAnswers[q.id];
      if (answer !== undefined && answer !== "") {
        let answerText = String(answer);
        if (q.questionType === "yes_no") {
          answerText = answer === "yes" || answer === true ? "Yes" : "No";
        }
        summaryParts.push(`${q.question}: ${answerText}`);
      }
    });
    
    if (summaryParts.length === 0) return "";
    return "--- Service Call Checklist ---\n" + summaryParts.join("\n") + "\n---\n\n";
  };

  const areRequiredQuestionsAnswered = (): boolean => {
    if (woVisitType !== "SERVICE" || checklistQuestions.length === 0) return true;
    
    const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
    for (const q of requiredQuestions) {
      const answer = checklistAnswers[q.id];
      if (answer === undefined || answer === "" || answer === null) {
        return false;
      }
    }
    return true;
  };

  const generateChecklistSummary = async (): Promise<string> => {
    if (checklistQuestions.length === 0 || Object.keys(checklistAnswers).length === 0) return "";
    
    try {
      const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[woWorkSubtype] || "OTHER";
      const res = await apiRequest("POST", "/api/ai/summarize-checklist", {
        questions: checklistQuestions,
        answers: checklistAnswers,
        serviceType,
      });
      const data = await res.json();
      if (data.summary) {
        return "--- Service Call Summary ---\n" + data.summary + "\n---\n\n";
      }
    } catch (err) {
      console.error("AI summarization failed, using local fallback:", err);
    }
    
    return generateLocalChecklistSummary();
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
  const [propPropertyType, setPropPropertyType] = useState<"residential" | "commercial" | "">("");

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
    setPropPropertyType("");
    setEditingProperty(null);
  };

  const handleClosePropertyDialog = () => {
    setPropertyDialogOpen(false);
    resetPropertyForm();
  };

  const handleOpenAddPropertyDialog = () => {
    resetPropertyForm();
    const customerType = customer?.customerType?.toLowerCase() || "";
    if (customerType === "residential") {
      setPropPropertyType("residential");
    } else if (customerType === "commercial") {
      setPropPropertyType("commercial");
    }
    setPropertyDialogOpen(true);
  };

  const resetVisitForm = () => {
    setVisitJobId("");
    setVisitType("SERVICE");
    setVisitDate(new Date());
    setStartTime("08:00");
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
    workOrderId?: string | null;
    workOrder?: { id: string; workOrderNumber: number | null; title: string | null } | null;
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

  // Fetch sub-accounts (also used in CustomerTabbedView — TanStack Query deduplicates the request)
  const { data: subAccountsForPicker = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/crm/customers", customerId, "sub-accounts"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/sub-accounts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sub-accounts");
      return res.json();
    },
    enabled: !!currentUser && !!customerId,
  });

  // Fetch all customers for the parent account picker (only when edit dialog is open)
  const { data: allCustomersForPicker = [] } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/crm/customers", "picker"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers?limit=500`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customers");
      const data = await res.json();
      return data.customers || [];
    },
    enabled: editDialogOpen,
  });

  // Filtered parent candidates: exclude self and own sub-accounts to prevent circular hierarchy
  const subAccountIdsForPicker = subAccountsForPicker.map(s => s.id);
  const parentPickerOptions = allCustomersForPicker.filter(c =>
    c.id !== customerId &&
    !subAccountIdsForPicker.includes(c.id) &&
    (parentSearch.trim() === "" ||
      c.name.toLowerCase().includes(parentSearch.toLowerCase()) ||
      (c.companyName || "").toLowerCase().includes(parentSearch.toLowerCase()))
  );

  // Fetch maintenance subtypes (includes custom agreement types) when MAINTENANCE is selected or dialog opens
  useEffect(() => {
    if (!scheduleVisitDialogOpen) return;
    if (woVisitType !== "MAINTENANCE") return;
    
    fetch("/api/crm/work-subtypes/MAINTENANCE", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMaintenanceSubtypes(data);
        }
      })
      .catch(() => {
        setMaintenanceSubtypes(["Preventative Maintenance"]);
      });
  }, [woVisitType, scheduleVisitDialogOpen]);

  // Fetch checklist questions when SERVICE is selected and workSubtype changes
  useEffect(() => {
    if (!scheduleVisitDialogOpen) return;
    if (woVisitType !== "SERVICE") {
      setChecklistQuestions([]);
      setChecklistAnswers({});
      return;
    }

    const serviceType = WORK_SUBTYPE_TO_SERVICE_TYPE[woWorkSubtype] || "OTHER";

    setChecklistLoading(true);
    fetch(`/api/crm/checklists/${serviceType}`, { credentials: "include" })
      .then(res => {
        if (!res.ok) {
          setChecklistQuestions([]);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data && data.questions) {
          setChecklistQuestions(data.questions);
          setChecklistAnswers({});
        } else {
          setChecklistQuestions([]);
        }
      })
      .catch(() => {
        setChecklistQuestions([]);
      })
      .finally(() => {
        setChecklistLoading(false);
      });
  }, [woVisitType, woWorkSubtype, scheduleVisitDialogOpen]);

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
    customer?: { id: string; name: string; email?: string; phone?: string } | null;
    aiGeneratedQuote?: {
      quote_title?: string;
      package_description?: string;
      whats_included?: Array<{ category: string; items: string[] }>;
      best_for?: string;
      line_items?: Array<{ name: string; qty: number; price: number; description: string }>;
      financing_text?: string;
      warranties_and_terms?: string[];
      next_steps?: string[];
      options?: Array<{ title: string; description: string; price: number; tags?: string[]; inclusions?: string[] }>;
    } | null;
    quoteMode?: "single" | "options" | null;
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

  const quoteSendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${selectedQuoteId}/send`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to send quote");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", selectedQuoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote sent", description: "Quote status updated to sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send quote", description: error.message, variant: "destructive" });
    },
  });

  const quoteAcceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${selectedQuoteId}/accept`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to accept quote");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", selectedQuoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote approved", description: "Quote status updated to approved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to approve quote", description: error.message, variant: "destructive" });
    },
  });

  const quoteDeclineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/crm/quotes/${selectedQuoteId}/decline`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to decline quote");
      }
      return res.json();
    },
    onMutate: async () => {
      const idToUpdate = selectedQuoteId;
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["/api/crm/quotes"] });
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.map((q: any) => q.id === idToUpdate ? { ...q, status: "declined" } : q) };
      });
      return { snapshots };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", selectedQuoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote declined", description: "Quote status updated to declined." });
    },
    onError: (error: Error, _vars, context: any) => {
      context?.snapshots?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      toast({ title: "Failed to decline quote", description: error.message, variant: "destructive" });
    },
  });

  const quoteDeleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/crm/quotes/${selectedQuoteId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete quote");
      }
      return res.json();
    },
    onMutate: async () => {
      const idToDelete = selectedQuoteId;
      await queryClient.cancelQueries({ queryKey: ["/api/crm/quotes"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["/api/crm/quotes"] });
      queryClient.setQueriesData({ queryKey: ["/api/crm/quotes"] }, (old: any) => {
        if (!old?.quotes) return old;
        return { ...old, quotes: old.quotes.filter((q: any) => q.id !== idToDelete) };
      });
      setSelectedQuoteId(null);
      setShowQuoteDeleteConfirm(false);
      return { snapshots };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ title: "Quote deleted", description: "The quote has been permanently deleted." });
    },
    onError: (error: Error, _vars, context: any) => {
      context?.snapshots?.forEach(([key, data]: [any, any]) => {
        queryClient.setQueryData(key, data);
      });
      toast({ title: "Failed to delete quote", description: error.message, variant: "destructive" });
    },
  });

  const quoteCreateInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/invoices/from-quote", { quoteId: selectedQuoteId });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create invoice");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes", selectedQuoteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      toast({ 
        title: "Invoice created!", 
        description: `Invoice ${data.invoice?.invoiceNumber || ''} has been created from this quote.`
      });
      setSelectedQuoteId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create invoice", description: error.message, variant: "destructive" });
    },
  });

  const handleQuoteDownloadPDF = () => {
    if (!selectedQuoteData) return;
    const quote = selectedQuoteData;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let y = margin;

      const brandColor: [number, number, number] = [113, 20, 25];
      const textColor: [number, number, number] = [30, 41, 59];
      const mutedColor: [number, number, number] = [100, 116, 139];
      const lightBg: [number, number, number] = [248, 250, 252];
      const tableRowAlt: [number, number, number] = [248, 250, 252];
      const isOptionsMode = quote.quoteMode === "options";

      const addPageHeader = () => {
        doc.setFillColor(...brandColor);
        doc.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F');
        
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("Giesbrecht HVAC", margin + 8, y + 12);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(220, 220, 220);
        doc.text("PO Box 917, Wrens, GA 30833", margin + 8, y + 20);

        doc.setFontSize(9);
        doc.text("(706) 826-0644", pageWidth - margin - 8, y + 10, { align: 'right' });
        doc.text("chandler@ghvacinc.com", pageWidth - margin - 8, y + 15, { align: 'right' });
        doc.text("www.ghvacinc.com", pageWidth - margin - 8, y + 20, { align: 'right' });
      };

      const checkPageBreak = (neededSpace: number) => {
        if (y + neededSpace > pageHeight - 45) {
          doc.addPage();
          y = margin;
          addPageHeader();
          y += 35;
        }
      };

      addPageHeader();
      y += 35;

      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("QUOTE", margin, y);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...mutedColor);
      doc.text(`#${quote.quoteNumber || ""}`, margin + doc.getTextWidth("QUOTE") + 5, y);
      y += 12;

      const boxHeight = 32;
      doc.setFillColor(...lightBg);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'F');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Customer", margin + 5, y + 8);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const customerName = quote.customer?.name || quote.customerName || "Customer";
      doc.text(customerName, margin + 5, y + 14);
      let custY = y + 14;
      doc.setTextColor(...mutedColor);
      if (quote.customer?.email || quote.customerEmail) {
        custY += 4;
        doc.text(String(quote.customer?.email || quote.customerEmail), margin + 5, custY);
      }
      if (quote.customer?.phone || quote.customerPhone) {
        custY += 4;
        doc.text(String(quote.customer?.phone || quote.customerPhone), margin + 5, custY);
      }
      y += boxHeight + 8;

      doc.setFillColor(...brandColor);
      doc.rect(margin, y, contentWidth, 10, 'F');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Line Items", margin + 5, y + 7);
      y += 10;

      const col1Width = contentWidth * 0.55;
      const col2Width = contentWidth * 0.15;
      const col3Width = contentWidth * 0.15;
      const col4Width = contentWidth * 0.15;
      doc.setFillColor(...lightBg);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Description", margin + 3, y + 5.5);
      doc.text("Qty", margin + col1Width + col2Width/2, y + 5.5, { align: 'center' });
      doc.text("Unit Price", margin + col1Width + col2Width + col3Width/2, y + 5.5, { align: 'center' });
      doc.text("Total", margin + contentWidth - 3, y + 5.5, { align: 'right' });
      y += 8;

      const lineItems = quote.lineItems || [];
      let rowIndex = 0;
      lineItems.forEach((item) => {
        const descLines = doc.splitTextToSize(item.description || "", col1Width - 6);
        const rowHeight = Math.max(10, descLines.length * 4 + 4);
        
        checkPageBreak(rowHeight + 2);
        if (rowIndex % 2 === 0) {
          doc.setFillColor(...tableRowAlt);
          doc.rect(margin, y, contentWidth, rowHeight, 'F');
        }
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...textColor);
        let textY = y + 5;
        descLines.forEach((line: string) => {
          doc.text(line, margin + 3, textY);
          textY += 4;
        });
        
        doc.text(String(item.quantity || 1), margin + col1Width + col2Width/2, y + 5, { align: 'center' });
        doc.text(`$${Number(item.unitPrice || 0).toLocaleString()}`, margin + col1Width + col2Width + col3Width/2, y + 5, { align: 'center' });
        doc.text(`$${Number(item.lineTotal || 0).toLocaleString()}`, margin + contentWidth - 3, y + 5, { align: 'right' });
        
        y += rowHeight;
        rowIndex++;
      });

      doc.setDrawColor(...brandColor);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + contentWidth, y);
      y += 6;

      if (!isOptionsMode) {
        const subtotal = Number(quote.subtotal || quote.total || 0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Subtotal:", margin + col1Width + col2Width, y);
        doc.text(`$${subtotal.toLocaleString()}`, margin + contentWidth - 3, y, { align: 'right' });
        y += 6;

        checkPageBreak(12);
        doc.setFillColor(...brandColor);
        doc.rect(margin, y, contentWidth, 10, 'F');
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("TOTAL:", margin + col1Width + col2Width, y + 7);
        doc.text(`$${subtotal.toLocaleString()}`, margin + contentWidth - 3, y + 7, { align: 'right' });
        y += 16;
        doc.setTextColor(...textColor);
      }

      const footerY = pageHeight - 18;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...textColor);
      doc.text("Thank you for choosing Giesbrecht HVAC!", pageWidth / 2, footerY, { align: 'center' });
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...mutedColor);
      doc.text("Terms: Payment due upon completion. Prices valid for 30 days.", pageWidth / 2, footerY + 4, { align: 'center' });
      doc.text("(706) 826-0644  |  chandler@ghvacinc.com  |  www.ghvacinc.com", pageWidth / 2, footerY + 9, { align: 'center' });

      const custName = (quote.customer?.name || quote.customerName || "Quote").replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      doc.save(`GHVAC_Quote_${quote.quoteNumber || custName}_${dateStr}.pdf`);

      toast({
        title: "PDF Downloaded",
        description: "Quote saved as PDF successfully.",
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({
        title: "Download Failed",
        description: "Could not generate the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const quoteStatusLabels: Record<string, string> = {
    draft: "Draft",
    sent: "Sent",
    viewed: "Viewed",
    accepted: "Approved",
    converted: "Converted",
    declined: "Declined",
    expired: "Expired",
  };

  const quoteStatusColors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700 border-slate-200",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    accepted: "bg-green-100 text-green-700 border-green-200",
    converted: "bg-emerald-100 text-emerald-700 border-emerald-200",
    declined: "bg-red-100 text-red-700 border-red-200",
    expired: "bg-orange-100 text-orange-700 border-orange-200",
  };

  const formatQuoteCurrency = (value: string | number | null) => {
    if (value === null || value === undefined) return "$0.00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

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

  const invoiceSendMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/send`, {});
      if (!res.ok) throw new Error("Failed to mark invoice as sent");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice marked as sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", selectedInvoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invoice", description: error.message, variant: "destructive" });
    },
  });

  const invoicePayMutation = useMutation({
    mutationFn: async ({ invoiceId, amountPaid, paymentMethod }: { invoiceId: string; amountPaid: string; paymentMethod: string }) => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/pay`, { amountPaid, paymentMethod });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payment recorded successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", selectedInvoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowInvoicePaymentDialog(false);
      setInvoicePaymentAmount("");
      setInvoicePaymentMethod("check");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record payment", description: error.message, variant: "destructive" });
    },
  });

  const invoiceVoidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiRequest("POST", `/api/crm/invoices/${invoiceId}/void`, {});
      if (!res.ok) throw new Error("Failed to void invoice");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice voided" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/invoices", selectedInvoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/dashboard/analytics"] });
      setShowInvoiceVoidConfirm(false);
      setSelectedInvoiceId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to void invoice", description: error.message, variant: "destructive" });
    },
  });

  const handleInvoiceDownloadPDF = () => {
    if (!selectedInvoiceData) return;
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let y = margin;

      const brandColor: [number, number, number] = [113, 20, 25];
      const textColor: [number, number, number] = [30, 41, 59];
      const mutedColor: [number, number, number] = [100, 116, 139];

      doc.setFillColor(...brandColor);
      doc.roundedRect(margin, y, contentWidth, 20, 3, 3, 'F');
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("INVOICE", margin + 8, y + 13);
      doc.setFontSize(10);
      doc.text(selectedInvoiceData.invoiceNumber || "", pageWidth - margin - 8, y + 13, { align: 'right' });
      y += 30;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...textColor);
      doc.text(`Created: ${selectedInvoiceData.createdAt ? format(new Date(selectedInvoiceData.createdAt), 'MMM d, yyyy') : '—'}`, margin, y);
      doc.text(`Due: ${selectedInvoiceData.dueDate ? format(new Date(selectedInvoiceData.dueDate), 'MMM d, yyyy') : 'Upon Receipt'}`, pageWidth - margin, y, { align: 'right' });
      y += 15;

      doc.setFont("helvetica", "bold");
      doc.text("Total:", margin, y);
      doc.text(`$${Number(selectedInvoiceData.total || 0).toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += 8;
      if (selectedInvoiceData.amountPaid && Number(selectedInvoiceData.amountPaid) > 0) {
        doc.setTextColor(22, 163, 74);
        doc.text("Paid:", margin, y);
        doc.text(`-$${Number(selectedInvoiceData.amountPaid).toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
        y += 8;
      }
      doc.setTextColor(...textColor);
      doc.setFont("helvetica", "bold");
      const balanceDue = Number(selectedInvoiceData.balanceDue || 0);
      if (balanceDue > 0) {
        doc.setTextColor(220, 38, 38);
      } else {
        doc.setTextColor(22, 163, 74);
      }
      doc.text("Balance Due:", margin, y);
      doc.text(`$${balanceDue.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += 15;

      if (selectedInvoiceData.lineItems && selectedInvoiceData.lineItems.length > 0) {
        doc.setFontSize(11);
        doc.setTextColor(...textColor);
        doc.text("Line Items", margin, y);
        y += 8;
        doc.setFontSize(9);
        selectedInvoiceData.lineItems.forEach((item) => {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...textColor);
          doc.text(item.description || "", margin, y);
          doc.text(`$${Number(item.lineTotal || 0).toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
          y += 5;
          doc.setTextColor(...mutedColor);
          doc.text(`Qty: ${item.quantity} @ $${Number(item.unitPrice || 0).toFixed(2)}`, margin + 5, y);
          y += 7;
        });
      }

      doc.save(`Invoice-${selectedInvoiceData.invoiceNumber || 'download'}.pdf`);
      toast({ title: "PDF downloaded" });
    } catch (error) {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

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

  // Fetch active agreements for MAINTENANCE work order selection
  interface ActiveAgreement {
    id: string;
    agreementType: string | null;
    displayName: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    visitsPerPeriod: number | null;
    nextServiceDate: string | null;
  }
  
  const { data: activeAgreements } = useQuery<ActiveAgreement[]>({
    queryKey: ["/api/crm/customers", customerId, "active-agreements"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/active-agreements`, { credentials: "include" });
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

  const technicians = dispatchData?.technicians || [];

  // Query to fetch work order subtypes dynamically
  const { data: workOrderSubtypes = [] } = useQuery<WorkOrderSubtype[]>({
    queryKey: ["/api/crm/work-order-subtypes", { activeOnly: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/crm/work-order-subtypes?activeOnly=true", {
        credentials: "include",
      });
      return res.json();
    },
    enabled: !!currentUser,
  });

  // Helper to get subtypes for a visit type
  const getSubtypesForVisitType = (vt: WorkOrderVisitType) => {
    return workOrderSubtypes
      .filter(s => s.visitType === vt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  };

  const canDeleteCustomer = currentUser && ["owner", "admin", "sales"].includes(currentUser.role);

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
      if (woVisitType === "MAINTENANCE" && !woAgreementId) {
        throw new Error("Agreement is required for maintenance work orders");
      }
      
      if (!areRequiredQuestionsAnswered()) {
        const requiredQuestions = checklistQuestions.filter(q => q.isRequired);
        const missingQuestions = requiredQuestions.filter(q => {
          const answer = checklistAnswers[q.id];
          return answer === undefined || answer === "" || answer === null;
        });
        throw new Error(`Please answer required checklist questions: ${missingQuestions.map(q => q.question).join(", ")}`);
      }

      const [startHours, startMinutes] = woStartTime.split(":").map(Number);
      const [endHours, endMinutes] = woEndTime.split(":").map(Number);
      
      const scheduledStartUTC = createLocalDateTime(woDate, startHours, startMinutes);
      const scheduledEndUTC = createLocalDateTime(woDate, endHours, endMinutes);

      const checklistSummary = await generateChecklistSummary();
      const finalDescription = checklistSummary + (woDescription?.trim() || "");

      const title = woTitle.trim() || `${visitTypeLabels[woVisitType]} - ${woWorkSubtype}`;

      const res = await apiRequest("POST", "/api/crm/work-orders", {
        customerId,
        propertyId: woPropertyId || null,
        projectId: woProjectId || null,
        agreementId: woVisitType === "MAINTENANCE" ? woAgreementId : null,
        title,
        visitType: woVisitType,
        workSubtype: woWorkSubtype,
        description: finalDescription || `${visitTypeLabels[woVisitType]} work order`,
        scheduledStart: scheduledStartUTC.toISOString(),
        scheduledEnd: scheduledEndUTC.toISOString(),
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
      if (woVisitType === "MAINTENANCE" && !woAgreementId) {
        toast({
          title: "Agreement required",
          description: "Please select an agreement for maintenance work orders",
          variant: "destructive",
        });
        return;
      }
      if (!areRequiredQuestionsAnswered()) {
        toast({
          title: "Checklist incomplete",
          description: "Please answer all required checklist questions",
          variant: "destructive",
        });
        return;
      }
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

  const isWoFormValid = woDate && woPropertyId && 
    (woVisitType !== "MAINTENANCE" || woAgreementId) && 
    areRequiredQuestionsAnswered();

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
      queryClient.removeQueries({ queryKey: ["/api/crm/customers"] });
      queryClient.removeQueries({ queryKey: ["/api/crm/customers/merged"] });
      queryClient.removeQueries({ queryKey: ["/api/crm/customers/stats"] });
      navigate(backHref ?? "/crm/customers");
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

  const generatePortalLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/portal/generate-link/${customerId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to generate portal link");
      }
      return res.json();
    },
    onSuccess: async (data: { loginUrl: string }) => {
      const fullUrl = window.location.origin + data.loginUrl;
      await navigator.clipboard.writeText(fullUrl);
      toast({ title: "Portal link copied to clipboard", description: "Share this link with the customer to give them portal access." });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate portal link",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePortalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/crm/customers/${customerId}/portal-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update portal access");
      }
      return res.json();
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId] });
      toast({
        title: enabled ? "Portal Enabled" : "Portal Disabled",
        description: enabled 
          ? "Customer can now access the customer portal." 
          : "Customer portal access has been disabled.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openEditDialog = () => {
    if (customer) {
      setEditName(customer.name || "");
      setEditCustomerType(customer.customerType || "Residential");
      setEditCustomerStatus(customer.customerStatus || "Lead");
      setEditPhone(customer.phone || "");
      setEditEmail(customer.email || "");
      setEditFullAddress(customer.fullAddress || "");
      setEditLeadSource((customer as any).leadSource || "");
      setEditParentCustomerId(customer.parentCustomerId || null);
      setEditBillToParent(customer.billToParent || false);
      setParentSearch("");
      setShowParentDropdown(false);
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
    setEditParentCustomerId(null);
    setEditBillToParent(false);
    setParentSearch("");
    setShowParentDropdown(false);
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
        parentCustomerId: editParentCustomerId || null,
        billToParent: editBillToParent,
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "sub-accounts"] });
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
        propertyType: propPropertyType || null,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create property");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Location added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "properties"] });
      handleClosePropertyDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add location",
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
        propertyType: propPropertyType || null,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update property");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Location updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "properties"] });
      handleClosePropertyDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update location",
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
    setPropPropertyType((property as any).propertyType || "");
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
    
    // For Property Managers, require property type selection
    if (isPropertyManager && !propPropertyType) {
      toast({
        title: "Validation Error",
        description: "Property type is required for property manager customers",
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
          <Button variant="ghost" onClick={goBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
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
          <Button variant="ghost" onClick={goBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-1">
            {(customer as any).source !== 'fieldedge' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openEditDialog}
                className="text-slate-600 hover:text-slate-900"
                data-testid="button-edit-customer"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
            {currentUser && ["admin", "owner", "sales"].includes(currentUser.role) && (customer as any).source !== 'fieldedge' && (
              <div className="flex items-center gap-2 px-2">
                <span className="text-xs text-slate-400">Portal</span>
                <Switch
                  checked={customer.portalEnabled}
                  onCheckedChange={(checked) => togglePortalMutation.mutate(checked)}
                  disabled={togglePortalMutation.isPending}
                  data-testid="switch-portal-access"
                />
                {customer.portalEnabled && (
                  <button
                    onClick={() => generatePortalLinkMutation.mutate()}
                    disabled={generatePortalLinkMutation.isPending}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    data-testid="button-generate-portal-link"
                    title="Copy portal link"
                  >
                    {generatePortalLinkMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            )}
            {canDeleteCustomer && (customer as any).source !== 'fieldedge' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-red-400 hover:text-red-600 hover:bg-red-50"
                data-testid="button-delete-customer"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* FieldEdge Source Banner */}
        {(customer as any).source === 'fieldedge' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                <span className="text-orange-600 text-sm font-bold">FE</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-orange-800">FieldEdge Customer</p>
              <p className="text-xs text-orange-600">
                This customer is synced from your FieldEdge Google Sheet. Some features may be limited until you add them to the CRM.
              </p>
            </div>
          </div>
        )}

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
              {/* Title (optional - will auto-generate) */}
              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input
                  placeholder={`Auto: ${visitTypeLabels[woVisitType]} - ${woWorkSubtype}`}
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                  data-testid="input-wo-title"
                />
                <p className="text-xs text-slate-500">Leave blank to auto-generate from visit type and subtype</p>
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
                <Select value={woVisitType} onValueChange={(v) => {
                  const newType = v as WorkOrderVisitType;
                  setWoVisitType(newType);
                  if (newType !== "MAINTENANCE") {
                    setWoAgreementId("");
                  }
                  // Set default subtype - use maintenanceSubtypes for MAINTENANCE, otherwise dynamic list
                  if (newType === "MAINTENANCE") {
                    setWoWorkSubtype(maintenanceSubtypes[0] || "Preventative Maintenance");
                  } else {
                    const subtypes = getSubtypesForVisitType(newType);
                    setWoWorkSubtype(subtypes.length > 0 ? subtypes[0].subtype : "Other");
                  }
                }}>
                  <SelectTrigger data-testid="select-wo-visit-type">
                    <SelectValue placeholder="Select visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrderVisitTypeEnum.map((type) => (
                      <SelectItem key={type} value={type} data-testid={`wo-visit-type-${type}`}>
                        {visitTypeLabels[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Work Subtype */}
              <div className="space-y-2">
                <Label>Work Subtype *</Label>
                <Select value={woWorkSubtype} onValueChange={(v) => setWoWorkSubtype(v as WorkSubtype)}>
                  <SelectTrigger data-testid="select-wo-work-subtype">
                    <SelectValue placeholder="Select work subtype" />
                  </SelectTrigger>
                  <SelectContent>
                    {woVisitType === "MAINTENANCE" ? (
                      maintenanceSubtypes.map((subtype) => (
                        <SelectItem key={subtype} value={subtype} data-testid={`wo-subtype-${subtype}`}>
                          {subtype}
                        </SelectItem>
                      ))
                    ) : getSubtypesForVisitType(woVisitType).length > 0 ? (
                      getSubtypesForVisitType(woVisitType).map((s) => (
                        <SelectItem key={s.id} value={s.subtype} data-testid={`wo-subtype-${s.subtype}`}>
                          {s.subtype}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="Other" data-testid="wo-subtype-Other">Other</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Agreement Selection - Only for MAINTENANCE work orders */}
              {woVisitType === "MAINTENANCE" && (
                <div className="space-y-2">
                  <Label>Agreement *</Label>
                  <Select value={woAgreementId} onValueChange={setWoAgreementId}>
                    <SelectTrigger data-testid="select-wo-agreement">
                      <SelectValue placeholder="Select agreement" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAgreements && activeAgreements.length > 0 ? (
                        activeAgreements.map((agreement) => (
                          <SelectItem key={agreement.id} value={agreement.id} data-testid={`wo-agreement-${agreement.id}`}>
                            {agreement.displayName}
                            {agreement.nextServiceDate && ` (Next: ${format(new Date(agreement.nextServiceDate), "MMM d, yyyy")})`}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-1 text-sm text-slate-500">No active agreements found</div>
                      )}
                    </SelectContent>
                  </Select>
                  {(!activeAgreements || activeAgreements.length === 0) && (
                    <p className="text-xs text-amber-600">⚠ This customer has no active agreements. Create an agreement first.</p>
                  )}
                </div>
              )}

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

              {/* Date */}
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
                      {woDate ? format(woDate, "MMM d, yyyy") : "Pick a date"}
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

              {/* Start/End Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time *</Label>
                  <Select value={woStartTime} onValueChange={(v) => {
                    setWoStartTime(v);
                    const [hours] = v.split(":").map(Number);
                    const endHour = Math.min(hours + 2, 20);
                    setWoEndTime(`${endHour.toString().padStart(2, "0")}:00`);
                  }}>
                    <SelectTrigger data-testid="select-wo-start-time">
                      <SelectValue placeholder="Start time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>End Time *</Label>
                  <Select value={woEndTime} onValueChange={setWoEndTime}>
                    <SelectTrigger data-testid="select-wo-end-time">
                      <SelectValue placeholder="End time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
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

              {/* Service Call Checklist - Only for SERVICE visit type */}
              {woVisitType === "SERVICE" && (
                <div className="space-y-2">
                  <Collapsible open={showChecklist} onOpenChange={setShowChecklist}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-between p-0 h-auto hover:bg-transparent"
                        data-testid="toggle-checklist"
                      >
                        <div className="flex items-center gap-2">
                          {checklistQuestions.length > 0 && areRequiredQuestionsAnswered() ? (
                            <ClipboardCheck className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clipboard className="h-4 w-4 text-slate-500" />
                          )}
                          <span className="font-medium">Service Call Checklist</span>
                          {checklistLoading && (
                            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                          )}
                          {checklistQuestions.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {Object.keys(checklistAnswers).length}/{checklistQuestions.length}
                            </Badge>
                          )}
                        </div>
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform",
                          showChecklist && "rotate-180"
                        )} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 space-y-4">
                      {checklistLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                          <span className="ml-2 text-sm text-slate-500">Loading checklist...</span>
                        </div>
                      ) : checklistQuestions.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">
                          No checklist questions available for this service type.
                        </p>
                      ) : (
                        <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                          {checklistQuestions.map((q) => (
                            <div key={q.id} className="space-y-2">
                              <Label className="flex items-start gap-1">
                                <span>{q.question}</span>
                                {q.isRequired && <span className="text-red-500">*</span>}
                              </Label>
                              {q.questionType === "yes_no" ? (
                                <RadioGroup
                                  value={checklistAnswers[q.id]?.toString() || ""}
                                  onValueChange={(val) => {
                                    setChecklistAnswers(prev => ({
                                      ...prev,
                                      [q.id]: val
                                    }));
                                  }}
                                  className="flex gap-4"
                                  data-testid={`checklist-radio-${q.id}`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="yes" id={`${q.id}-yes`} />
                                    <Label htmlFor={`${q.id}-yes`} className="font-normal">Yes</Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="no" id={`${q.id}-no`} />
                                    <Label htmlFor={`${q.id}-no`} className="font-normal">No</Label>
                                  </div>
                                </RadioGroup>
                              ) : q.questionType === "text" ? (
                                <Textarea
                                  placeholder="Enter your answer..."
                                  value={checklistAnswers[q.id]?.toString() || ""}
                                  onChange={(e) => {
                                    setChecklistAnswers(prev => ({
                                      ...prev,
                                      [q.id]: e.target.value
                                    }));
                                  }}
                                  rows={2}
                                  className="bg-white"
                                  data-testid={`checklist-text-${q.id}`}
                                />
                              ) : q.questionType === "number" ? (
                                <Input
                                  type="number"
                                  placeholder="Enter a number..."
                                  value={checklistAnswers[q.id]?.toString() || ""}
                                  onChange={(e) => {
                                    setChecklistAnswers(prev => ({
                                      ...prev,
                                      [q.id]: Number(e.target.value)
                                    }));
                                  }}
                                  className="bg-white"
                                  data-testid={`checklist-number-${q.id}`}
                                />
                              ) : (
                                <Input
                                  placeholder="Enter your answer..."
                                  value={checklistAnswers[q.id]?.toString() || ""}
                                  onChange={(e) => {
                                    setChecklistAnswers(prev => ({
                                      ...prev,
                                      [q.id]: e.target.value
                                    }));
                                  }}
                                  className="bg-white"
                                  data-testid={`checklist-input-${q.id}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Description (optional) */}
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  placeholder="Additional notes or work order description..."
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
                        {prop.address1 || `Property ${prop.id.slice(-4)}`}
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
                      <SelectItem value="Lead">Lead</SelectItem>
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

              {/* Parent Account Selector */}
              <div className="space-y-2">
                <Label>Parent Account</Label>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder={editParentCustomerId
                          ? (allCustomersForPicker.find(c => c.id === editParentCustomerId)?.name ?? "Parent selected")
                          : "Search for parent account..."}
                        value={parentSearch}
                        onChange={(e) => {
                          setParentSearch(e.target.value);
                          setShowParentDropdown(true);
                        }}
                        onFocus={() => setShowParentDropdown(true)}
                        className="pl-8"
                        data-testid="input-parent-search"
                      />
                    </div>
                    {editParentCustomerId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-red-500 px-2"
                        onClick={() => {
                          setEditParentCustomerId(null);
                          setEditBillToParent(false);
                          setParentSearch("");
                          setShowParentDropdown(false);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {showParentDropdown && parentSearch.trim().length >= 1 && parentPickerOptions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {parentPickerOptions.slice(0, 10).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                          onClick={() => {
                            setEditParentCustomerId(c.id);
                            setParentSearch("");
                            setShowParentDropdown(false);
                          }}
                        >
                          <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <span>{c.name}</span>
                          {c.companyName && c.companyName !== c.name && (
                            <span className="text-slate-400">— {c.companyName}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {editParentCustomerId && (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-sm text-slate-700">
                        {allCustomersForPicker.find(c => c.id === editParentCustomerId)?.name ?? "Parent account"}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Parent</Badge>
                  </div>
                )}
              </div>

              {/* Bill to Parent toggle (only shown when a parent is selected) */}
              {editParentCustomerId && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <div>
                    <Label htmlFor="edit-bill-to-parent" className="text-sm font-medium cursor-pointer">
                      Bill to Parent Account
                    </Label>
                    <p className="text-xs text-slate-500 mt-0.5">Send invoices to the parent instead of this account</p>
                  </div>
                  <Switch
                    id="edit-bill-to-parent"
                    checked={editBillToParent}
                    onCheckedChange={setEditBillToParent}
                    data-testid="switch-edit-bill-to-parent"
                  />
                </div>
              )}
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
                  <DialogTitle className="text-xl font-semibold">{editingProperty ? "Edit Location" : "Add Location"}</DialogTitle>
                  <DialogDescription className="text-slate-500">
                    {editingProperty ? "Update location/property details" : "Add a new location/property to this customer"}
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

              {/* Property Type */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Property Type {isPropertyManager ? <span className="text-red-500">*</span> : ""}
                </Label>
                <Select value={propPropertyType} onValueChange={(v) => setPropPropertyType(v as "residential" | "commercial")}>
                  <SelectTrigger className="h-11" data-testid="select-prop-property-type">
                    <SelectValue placeholder="Select property type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
                {isPropertyManager && (
                  <p className="text-xs text-slate-500">Required for property manager customers</p>
                )}
              </div>

              {/* Notes - Only for non-PM customers */}
              {!isPropertyManager && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Textarea
                    placeholder="Any additional notes about this location..."
                    value={propNotes}
                    onChange={(e) => setPropNotes(e.target.value)}
                    className="min-h-[80px] resize-none"
                    data-testid="input-prop-notes"
                  />
                </div>
              )}

              {/* Tenant Contact & Location Details - Only for Property Manager customers */}
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
                    <Label className="text-sm font-medium text-slate-600">Location Notes</Label>
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
                      <p className="text-xs text-slate-500 mt-1">Enable to set custom billing for this location</p>
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
                  (isPropertyManager && !propPropertyType) ||
                  (isPropertyManager && propBillingOverride && (!propPaymentTerms || !propPaymentMethod || !propApprovalRule)) ||
                  (isPropertyManager && propBillingOverride && propBilledTo === "tenant" && (!propTenantName.trim() || !propTenantEmail.trim())) || 
                  (isPropertyManager && propBillingOverride && propBilledTo === "owner" && (!propOwnerName.trim() || !propOwnerEmail.trim())) || 
                  createPropertyMutation.isPending || 
                  updatePropertyMutation.isPending
                }
                className="px-6 bg-[#711419] hover:bg-[#5a1014]"
                data-testid="button-save-property"
              >
                {(createPropertyMutation.isPending || updatePropertyMutation.isPending) ? "Saving..." : (editingProperty ? "Save Changes" : "Add Location")}
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
          onCommentPosted={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "notes"] });
          }}
          onCreateProject={() => setCreateProjectDialogOpen(true)}
          onScheduleVisit={() => setScheduleVisitDialogOpen(true)}
          onCreateLead={() => {
            navigate(`/crm/add-prospect?customerId=${customer.id}`);
          }}
          onEditCustomer={() => setEditDialogOpen(true)}
          onEditProperty={handleEditProperty}
          toast={toast}
          propertyDialogOpen={propertyDialogOpen}
          setPropertyDialogOpen={setPropertyDialogOpen}
          onOpenAddPropertyDialog={handleOpenAddPropertyDialog}
          onViewQuote={(quoteId) => navigate(`/crm/quotes/${quoteId}?from=customer&customerId=${customerId}&tab=quotes`)}
          onViewWorkOrder={(id) => navigate(`/crm/work-orders/${id}`)}
          onViewProject={(id) => navigate(`/crm/projects/${id}`)}
          onViewInvoice={(id) => navigate(`/crm/invoices/${id}`)}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Quote Detail Dialog */}
        <Dialog open={!!selectedQuoteId} onOpenChange={(open) => !open && setSelectedQuoteId(null)}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 overflow-hidden flex flex-col" data-testid="dialog-quote-detail">
            <div className="shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-[#711419]" />
                <div>
                  <h2 className="font-semibold text-lg">{selectedQuoteData?.quoteNumber || "Quote Details"}</h2>
                  <p className="text-sm text-slate-500">{selectedQuoteData?.title || ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowQuotePreview(true)}
                  variant="outline"
                  size="sm"
                  className="border-[#711419] text-[#711419] hover:bg-[#711419]/10"
                  data-testid="button-preview-quote"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
                {selectedQuoteData && (
                  <Badge variant="outline" className={quoteStatusColors[selectedQuoteData.status || "draft"]}>
                    {quoteStatusLabels[selectedQuoteData.status || "draft"] || selectedQuoteData.status}
                  </Badge>
                )}
              </div>
            </div>
            
            <ScrollArea className="flex-1 overflow-auto">
              {selectedQuoteLoading ? (
                <div className="space-y-4 p-6">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : selectedQuoteData ? (
                <div className="space-y-6 p-6">
                  {/* Quote Actions Card */}
                  <Card className="bg-gradient-to-br from-[#d3b07d]/10 to-amber-50 border-[#d3b07d]/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-amber-900">Quote Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={() => quoteSendMutation.mutate()}
                          className="bg-[#d3b07d] hover:bg-[#c4a06e] text-white"
                          disabled={quoteSendMutation.isPending}
                          data-testid="button-send-quote"
                        >
                          {quoteSendMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send
                        </Button>
                        <Button
                          onClick={handleQuoteDownloadPDF}
                          variant="outline"
                          className="border-blue-500 text-blue-600 hover:bg-blue-50"
                          data-testid="button-download-pdf"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </Button>
                        
                        <Separator orientation="vertical" className="h-10 mx-2" />
                        
                        {(selectedQuoteData.status === "draft" || selectedQuoteData.status === "sent") && (
                          <>
                            <Button
                              onClick={() => quoteAcceptMutation.mutate()}
                              variant="outline"
                              className="border-green-500 text-green-600 hover:bg-green-50"
                              disabled={quoteAcceptMutation.isPending}
                              data-testid="button-approve-quote"
                            >
                              {quoteAcceptMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mr-2" />
                              )}
                              Approve
                            </Button>
                            <Button
                              onClick={() => quoteDeclineMutation.mutate()}
                              variant="outline"
                              className="border-red-500 text-red-600 hover:bg-red-50"
                              disabled={quoteDeclineMutation.isPending}
                              data-testid="button-decline-quote"
                            >
                              {quoteDeclineMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <XCircle className="h-4 w-4 mr-2" />
                              )}
                              Decline
                            </Button>
                          </>
                        )}
                        
                        {selectedQuoteData.status === "accepted" && (
                          <Button
                            onClick={() => quoteCreateInvoiceMutation.mutate()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={quoteCreateInvoiceMutation.isPending}
                            data-testid="button-create-invoice"
                          >
                            {quoteCreateInvoiceMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Receipt className="h-4 w-4 mr-2" />
                            )}
                            Create Invoice
                          </Button>
                        )}
                        
                        <Separator orientation="vertical" className="h-10 mx-2" />
                        
                        <Button
                          onClick={() => setShowQuoteDeleteConfirm(true)}
                          variant="outline"
                          className="border-red-600 text-red-600 hover:bg-red-50"
                          data-testid="button-delete-quote"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Customer and Details Cards */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Customer
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="font-medium">{selectedQuoteData.customer?.name || selectedQuoteData.customerName || "—"}</p>
                        {(selectedQuoteData.customer?.email || selectedQuoteData.customerEmail) && (
                          <p className="text-sm text-slate-500">{selectedQuoteData.customer?.email || selectedQuoteData.customerEmail}</p>
                        )}
                        {(selectedQuoteData.customer?.phone || selectedQuoteData.customerPhone) && (
                          <p className="text-sm text-slate-500">{selectedQuoteData.customer?.phone || selectedQuoteData.customerPhone}</p>
                        )}
                        {selectedQuoteData.serviceAddress && (
                          <p className="text-sm text-slate-500">{selectedQuoteData.serviceAddress}</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-slate-500">Created</span>
                          <span className="text-sm">{selectedQuoteData.createdAt ? format(new Date(selectedQuoteData.createdAt), 'MMM d, yyyy') : '—'}</span>
                        </div>
                        {selectedQuoteData.validUntil && (
                          <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Valid Until</span>
                            <span className="text-sm">{format(new Date(selectedQuoteData.validUntil), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                        {selectedQuoteData.sentAt && (
                          <div className="flex justify-between">
                            <span className="text-sm text-slate-500">Sent</span>
                            <span className="text-sm">{format(new Date(selectedQuoteData.sentAt), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Line Items */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Line Items
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedQuoteData.lineItems && selectedQuoteData.lineItems.length > 0 ? (
                            selectedQuoteData.lineItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.description}</TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">{formatQuoteCurrency(item.unitPrice)}</TableCell>
                                <TableCell className="text-right">{formatQuoteCurrency(item.lineTotal)}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                                No line items
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>

                      {selectedQuoteData.quoteMode !== "options" && (
                        <div className="mt-6 border-t pt-4 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Subtotal</span>
                            <span>{formatQuoteCurrency(selectedQuoteData.subtotal)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total</span>
                            <span className="text-[#d3b07d]">{formatQuoteCurrency(selectedQuoteData.subtotal || selectedQuoteData.total)}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Notes */}
                  {selectedQuoteData.notes && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedQuoteData.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-8">Quote not found</p>
              )}
            </ScrollArea>
            
            {/* Footer Actions */}
            <div className="shrink-0 px-6 py-4 border-t bg-slate-50 flex items-center justify-between gap-3 rounded-b-lg">
              <Button
                variant="outline"
                onClick={() => setSelectedQuoteId(null)}
                data-testid="button-close-quote-dialog"
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
          </DialogContent>
        </Dialog>

        {/* Quote Preview Dialog */}
        <Dialog open={showQuotePreview} onOpenChange={setShowQuotePreview}>
          <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden">
            <div className="h-full overflow-y-auto bg-white">
              <div className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Quote Preview</h2>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleQuoteDownloadPDF}
                    variant="outline"
                    size="sm"
                    className="border-blue-500 text-blue-600"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    PDF
                  </Button>
                  <Button
                    onClick={() => setShowQuotePreview(false)}
                    variant="ghost"
                    size="sm"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {selectedQuoteData && (
                <div className="p-8">
                  <div className="bg-[#711419] text-white p-6 rounded-lg mb-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h1 className="text-3xl font-bold">Giesbrecht HVAC</h1>
                        <p className="text-white/80 mt-1">PO Box 917, Wrens, GA 30833</p>
                      </div>
                      <div className="text-right text-sm text-white/90">
                        <p>(706) 826-0644</p>
                        <p>chandler@ghvacinc.com</p>
                        <p>www.ghvacinc.com</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">QUOTE</h2>
                      <p className="text-slate-500">{selectedQuoteData.quoteNumber}</p>
                    </div>
                    <Badge variant="outline" className={quoteStatusColors[selectedQuoteData.status || "draft"]}>
                      {quoteStatusLabels[selectedQuoteData.status || "draft"] || selectedQuoteData.status}
                    </Badge>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Bill To
                      </h3>
                      <p className="font-medium">{selectedQuoteData.customer?.name || selectedQuoteData.customerName || "—"}</p>
                      {(selectedQuoteData.customer?.email || selectedQuoteData.customerEmail) && (
                        <p className="text-sm text-slate-600">{selectedQuoteData.customer?.email || selectedQuoteData.customerEmail}</p>
                      )}
                      {(selectedQuoteData.customer?.phone || selectedQuoteData.customerPhone) && (
                        <p className="text-sm text-slate-600">{selectedQuoteData.customer?.phone || selectedQuoteData.customerPhone}</p>
                      )}
                      {selectedQuoteData.serviceAddress && (
                        <p className="text-sm text-slate-600 mt-1">{selectedQuoteData.serviceAddress}</p>
                      )}
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Quote Details
                      </h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Date:</span>
                          <span>{selectedQuoteData.createdAt ? format(new Date(selectedQuoteData.createdAt), 'MMM d, yyyy') : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Valid Until:</span>
                          <span>{selectedQuoteData.validUntil ? format(new Date(selectedQuoteData.validUntil), 'MMM d, yyyy') : "30 days"}</span>
                        </div>
                        {selectedQuoteData.title && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Title:</span>
                            <span>{selectedQuoteData.title}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="border rounded-lg overflow-hidden mb-6">
                    <div className="bg-[#d3b07d] text-white px-4 py-3">
                      <h3 className="font-semibold">Line Items</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="font-semibold">Description</TableHead>
                          <TableHead className="text-center font-semibold">Qty</TableHead>
                          <TableHead className="text-right font-semibold">Unit Price</TableHead>
                          <TableHead className="text-right font-semibold">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedQuoteData.lineItems && selectedQuoteData.lineItems.length > 0 ? (
                          selectedQuoteData.lineItems.map((item, idx) => (
                            <TableRow key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                              <TableCell className="font-medium">{item.description}</TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatQuoteCurrency(item.unitPrice)}</TableCell>
                              <TableCell className="text-right font-medium">{formatQuoteCurrency(item.lineTotal)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                              No line items
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {selectedQuoteData.quoteMode !== "options" && (
                    <div className="flex justify-end mb-8">
                      <div className="w-72 bg-slate-50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Subtotal</span>
                          <span>{formatQuoteCurrency(selectedQuoteData.subtotal)}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between text-lg font-bold">
                          <span>Total</span>
                          <span className="text-[#711419]">{formatQuoteCurrency(selectedQuoteData.subtotal || selectedQuoteData.total)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedQuoteData.notes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                      <h3 className="font-semibold text-amber-900 mb-2">Notes</h3>
                      <p className="text-sm text-amber-800 whitespace-pre-wrap">{selectedQuoteData.notes}</p>
                    </div>
                  )}

                  <div className="border-t pt-6 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-700">Thank you for choosing Giesbrecht HVAC!</p>
                    <p className="mt-1">Terms: Payment due upon completion. Prices valid for 30 days.</p>
                    <p className="mt-2">(706) 826-0644 | chandler@ghvacinc.com | www.ghvacinc.com</p>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Quote Delete Confirmation */}
        <AlertDialog open={showQuoteDeleteConfirm} onOpenChange={setShowQuoteDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Quote</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this quote ({selectedQuoteData?.quoteNumber})? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-quote">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  quoteDeleteMutation.mutate();
                  setShowQuoteDeleteConfirm(false);
                }}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete-quote"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


      </div>
    </CrmLayout>
  );
}
