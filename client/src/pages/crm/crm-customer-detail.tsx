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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
  notes: CustomerNoteWithUser[];
  notesLoading: boolean;
  noteBody: string;
  setNoteBody: (value: string) => void;
  handleAddNote: () => void;
  addNotePending: boolean;
}

interface CustomerNoteWithUser extends CrmCustomerNote {
  userName: string | null;
}

function CustomerOverview({ customer, jobs, notes, notesLoading, noteBody, setNoteBody, handleAddNote, addNotePending }: CustomerOverviewProps) {
  const customerType = (customer.customerType || "residential").toLowerCase();
  
  const openProjects = jobs?.filter(j => !["completed", "invoiced", "paid", "cancelled"].includes(j.status)).length || 0;
  const upcomingVisits = jobs?.filter(j => {
    if (!j.scheduledStart) return false;
    const scheduled = new Date(j.scheduledStart);
    return scheduled > new Date() && !["completed", "invoiced", "paid", "cancelled"].includes(j.status);
  }).length || 0;
  const completedProjects = jobs?.filter(j => ["completed", "invoiced", "paid"].includes(j.status)).length || 0;
  
  if (customerType === "property_manager" || customerType === "property manager") {
    return <PropertyManagerOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} notes={notes} notesLoading={notesLoading} noteBody={noteBody} setNoteBody={setNoteBody} handleAddNote={handleAddNote} addNotePending={addNotePending} />;
  }
  
  if (customerType === "commercial") {
    return <CommercialOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} notes={notes} notesLoading={notesLoading} noteBody={noteBody} setNoteBody={setNoteBody} handleAddNote={handleAddNote} addNotePending={addNotePending} />;
  }
  
  return <ResidentialOverview customer={customer} openProjects={openProjects} upcomingVisits={upcomingVisits} completedProjects={completedProjects} notes={notes} notesLoading={notesLoading} noteBody={noteBody} setNoteBody={setNoteBody} handleAddNote={handleAddNote} addNotePending={addNotePending} />;
}

interface OverviewLayoutProps {
  customer: CrmCustomer;
  openProjects: number;
  upcomingVisits: number;
  completedProjects: number;
  notes: CustomerNoteWithUser[];
  notesLoading: boolean;
  noteBody: string;
  setNoteBody: (value: string) => void;
  handleAddNote: () => void;
  addNotePending: boolean;
}

function ResidentialOverview({ customer, openProjects, upcomingVisits, completedProjects, notes, notesLoading, noteBody, setNoteBody, handleAddNote, addNotePending }: OverviewLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-l-4 border-l-green-500" data-testid="card-residential-info">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Home className="h-5 w-5 text-green-600" />
              Residential Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <MapPin className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-green-700 uppercase tracking-wide">Service Address</p>
                    <p className="text-sm text-slate-700 mt-1">{customer.fullAddress || "No address on file"}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <User className="h-5 w-5 text-slate-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Primary Contact</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">{customer.name}</p>
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1">
                        <Phone className="h-3.5 w-3.5" />
                        {customer.phone}
                      </a>
                    )}
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1">
                        <Mail className="h-3.5 w-3.5" />
                        {customer.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200" data-testid="stat-open-projects">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Open Projects</p>
                  <p className="text-3xl font-bold text-amber-900 mt-1">{openProjects}</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-full">
                  <Briefcase className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200" data-testid="stat-upcoming-visits">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Upcoming Visits</p>
                  <p className="text-3xl font-bold text-blue-900 mt-1">{upcomingVisits}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200" data-testid="stat-total-jobs">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Completed Projects</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{completedProjects}</p>
                </div>
                <div className="p-3 bg-slate-100 rounded-full">
                  <ClipboardList className="h-6 w-6 text-slate-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <NotesSection notes={notes} notesLoading={notesLoading} noteBody={noteBody} setNoteBody={setNoteBody} handleAddNote={handleAddNote} addNotePending={addNotePending} />
    </div>
  );
}

function PropertyManagerOverview({ customer, openProjects, upcomingVisits, completedProjects, notes, notesLoading, noteBody, setNoteBody, handleAddNote, addNotePending }: OverviewLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-l-4 border-l-purple-500" data-testid="card-property-manager-info">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-purple-600" />
              Property Manager Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-purple-700 uppercase tracking-wide">Company / Portfolio</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">{customer.companyName || customer.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Completed {completedProjects} projects</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-purple-50/50 rounded-lg">
                  <MapPin className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-purple-700 uppercase tracking-wide">HQ / Mailing Address</p>
                    <p className="text-sm text-slate-700 mt-1">{customer.fullAddress || "No address on file"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Receipt className="h-5 w-5 text-slate-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Billing Rules</p>
                    <p className="text-sm text-slate-600 mt-1">Standard NET-30 terms</p>
                    <p className="text-xs text-slate-400 mt-0.5">Contact for custom arrangements</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <User className="h-5 w-5 text-slate-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Primary Contact</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">{customer.name}</p>
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1">
                        <Phone className="h-3.5 w-3.5" />
                        {customer.phone}
                      </a>
                    )}
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1">
                        <Mail className="h-3.5 w-3.5" />
                        {customer.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border-purple-200" data-testid="stat-portfolio-sites">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-purple-700 uppercase tracking-wide">Completed Projects</p>
                  <p className="text-3xl font-bold text-purple-900 mt-1">{completedProjects}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <Building2 className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200" data-testid="stat-open-projects-pm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Open Projects</p>
                  <p className="text-3xl font-bold text-amber-900 mt-1">{openProjects}</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-full">
                  <Briefcase className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200" data-testid="stat-upcoming-visits-pm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-teal-700 uppercase tracking-wide">Upcoming Visits</p>
                  <p className="text-3xl font-bold text-teal-900 mt-1">{upcomingVisits}</p>
                </div>
                <div className="p-3 bg-teal-100 rounded-full">
                  <Calendar className="h-6 w-6 text-teal-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <NotesSection notes={notes} notesLoading={notesLoading} noteBody={noteBody} setNoteBody={setNoteBody} handleAddNote={handleAddNote} addNotePending={addNotePending} />
    </div>
  );
}

function CommercialOverview({ customer, openProjects, upcomingVisits, completedProjects, notes, notesLoading, noteBody, setNoteBody, handleAddNote, addNotePending }: OverviewLayoutProps) {
  const hasAccessNotes = customer.notes && customer.notes.toLowerCase().includes("access");
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-l-4 border-l-blue-500" data-testid="card-commercial-info">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-blue-600" />
              Commercial Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <Building2 className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Company Info</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">{customer.companyName || customer.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{customer.fullAddress || "No address on file"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <FileText className="h-5 w-5 text-slate-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Contract Terms</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">PO Required</Badge>
                      <Badge variant="outline" className="text-xs">NET-30</Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Contact for service agreements</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <User className="h-5 w-5 text-slate-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Primary Contact</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">{customer.name}</p>
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1">
                        <Phone className="h-3.5 w-3.5" />
                        {customer.phone}
                      </a>
                    )}
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1">
                        <Mail className="h-3.5 w-3.5" />
                        {customer.email}
                      </a>
                    )}
                  </div>
                </div>
                {(hasAccessNotes || customer.notes) && (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                    <Key className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Site Access Notes</p>
                      <p className="text-sm text-slate-600 mt-1">{customer.notes || "No special access requirements"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200" data-testid="stat-open-projects-commercial">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Open Projects</p>
                  <p className="text-3xl font-bold text-blue-900 mt-1">{openProjects}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Briefcase className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200" data-testid="stat-upcoming-visits-commercial">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Work Orders</p>
                  <p className="text-3xl font-bold text-amber-900 mt-1">{upcomingVisits}</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-full">
                  <Wrench className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200" data-testid="stat-invoices-commercial">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-700 uppercase tracking-wide">Completed Projects</p>
                  <p className="text-3xl font-bold text-green-900 mt-1">{completedProjects}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <ClipboardList className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <NotesSection notes={notes} notesLoading={notesLoading} noteBody={noteBody} setNoteBody={setNoteBody} handleAddNote={handleAddNote} addNotePending={addNotePending} />
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

  // Fetch customer properties for dialogs
  const { data: customerProperties } = useQuery<CrmProperty[]>({
    queryKey: ["/api/crm/customers", customerId, "properties"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/properties`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser && !!customerId && (createProjectDialogOpen || scheduleVisitDialogOpen),
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
            <Button 
              onClick={() => setCreateProjectDialogOpen(true)}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-project"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Create Project
            </Button>
            <Button 
              onClick={() => setScheduleVisitDialogOpen(true)}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-schedule-visit"
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Create Work Order
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

        {/* Type-specific Customer Overview Dashboard */}
        <CustomerOverview 
          customer={customer} 
          jobs={jobs || []} 
          notes={notes || []}
          notesLoading={notesLoading}
          noteBody={noteBody}
          setNoteBody={setNoteBody}
          handleAddNote={handleAddNote}
          addNotePending={addNoteMutation.isPending}
        />

        {/* Active Projects Section (New CRM Projects) */}
        <Card data-testid="card-crm-projects">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-500" />
              Active Projects ({crmProjects?.filter(p => p.status !== "archived").length || 0})
            </CardTitle>
            <Button 
              size="sm" 
              onClick={() => setCreateProjectDialogOpen(true)}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-project-inline"
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
            ) : !crmProjects || crmProjects.filter(p => p.status !== "archived").length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No active projects</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {crmProjects.filter(p => p.status !== "archived").map((project) => (
                  <div 
                    key={project.id}
                    className="p-4 border rounded-lg hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => {
                      toast({ title: "Project Details", description: `Project: ${project.title}` });
                    }}
                    data-testid={`card-project-${project.id}`}
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
                    {project.description && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Work Orders Section */}
        <Card data-testid="card-upcoming-work-orders">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-green-500" />
              Upcoming Work Orders ({crmWorkOrders?.filter(wo => ["scheduled", "dispatched", "en_route", "on_site"].includes(wo.status)).length || 0})
            </CardTitle>
            <Button 
              size="sm" 
              onClick={() => setScheduleVisitDialogOpen(true)}
              className="bg-[#711419] hover:bg-[#5a1014] text-white"
              data-testid="button-create-wo-inline"
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
            ) : !crmWorkOrders || crmWorkOrders.filter(wo => ["scheduled", "dispatched", "en_route", "on_site"].includes(wo.status)).length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No upcoming work orders</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {crmWorkOrders.filter(wo => ["scheduled", "dispatched", "en_route", "on_site"].includes(wo.status)).map((wo) => (
                  <div 
                    key={wo.id}
                    className="p-4 border rounded-lg hover:border-green-300 hover:bg-green-50/50 cursor-pointer transition-colors"
                    onClick={() => {
                      toast({ title: "Work Order Details", description: `Work Order: ${wo.title || wo.visitType}` });
                    }}
                    data-testid={`card-wo-${wo.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-sm line-clamp-1">{wo.title || wo.visitType}</h4>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {wo.visitType.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                      <Badge className={`text-xs ${
                        wo.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                        wo.status === "pending" ? "bg-amber-100 text-amber-700" :
                        wo.status === "in_progress" ? "bg-green-100 text-green-700" :
                        wo.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {wo.status}
                      </Badge>
                    </div>
                    {wo.scheduledStart && (
                      <div className="flex items-center gap-1 text-xs text-slate-600 mb-1">
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(wo.scheduledStart), "MMM d, yyyy h:mm a")}
                      </div>
                    )}
                    {wo.assignedTechName && (
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <User className="h-3 w-3" />
                        {wo.assignedTechName}
                      </div>
                    )}
                    {wo.projectTitle && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                        <Briefcase className="h-3 w-3" />
                        {wo.projectTitle}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>


        <Card data-testid="card-job-history">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Project History ({completedJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completedJobs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No completed projects</p>
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
