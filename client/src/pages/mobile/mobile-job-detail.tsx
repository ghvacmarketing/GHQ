import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Phone, 
  MessageSquare, 
  Navigation, 
  MapPin, 
  Clock,
  Send,
  Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import MobileShell from "./mobile-shell";
import type { CrmWorkOrder, CrmCustomer, CrmProperty, WorkOrderStatus } from "@shared/schema";

interface WorkOrderDetail extends CrmWorkOrder {
  customer: CrmCustomer | null;
  property: CrmProperty | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-700 border-slate-300" },
  dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-700 border-blue-300" },
  en_route: { label: "En Route", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  on_site: { label: "On Site", className: "bg-green-100 text-green-700 border-green-300" },
  completed: { label: "Completed", className: "bg-slate-200 text-slate-600 border-slate-400" },
};

const statusFlow: WorkOrderStatus[] = ["scheduled", "dispatched", "en_route", "on_site", "completed"];

function getPropertyAddress(property: CrmProperty | null): string {
  if (!property) return "No address";
  const parts = [property.address1, property.address2, property.city, property.state, property.zip].filter(Boolean);
  return parts.join(", ") || "No address";
}

function getGoogleMapsUrl(property: CrmProperty | null): string {
  if (!property) return "";
  const address = [property.address1, property.city, property.state, property.zip].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function MobileJobDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [noteInput, setNoteInput] = useState("");

  const { data: workOrder, isLoading } = useQuery<WorkOrderDetail>({
    queryKey: ["/api/crm/work-orders", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch work order");
      return res.json();
    },
    enabled: !!params.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: WorkOrderStatus) => {
      await apiRequest("PATCH", `/api/crm/work-orders/${params.id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const existingNotes = workOrder?.techNotes || "";
      const timestamp = format(new Date(), "MMM d, h:mm a");
      const newNotes = existingNotes 
        ? `${existingNotes}\n\n[${timestamp}] ${note}`
        : `[${timestamp}] ${note}`;
      await apiRequest("PATCH", `/api/crm/work-orders/${params.id}`, { techNotes: newNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
      setNoteInput("");
      toast({ title: "Note added" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  const handleCall = () => {
    const phone = workOrder?.customer?.phone;
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleText = () => {
    const phone = workOrder?.customer?.phone;
    if (phone) {
      window.location.href = `sms:${phone}`;
    }
  };

  const handleNavigate = () => {
    const url = getGoogleMapsUrl(workOrder?.property || null);
    if (url) {
      window.open(url, "_blank");
    }
  };

  const handleAddNote = () => {
    if (noteInput.trim()) {
      addNoteMutation.mutate(noteInput.trim());
    }
  };

  const getNextStatus = (currentStatus: WorkOrderStatus): WorkOrderStatus | null => {
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex < statusFlow.length - 1) {
      return statusFlow[currentIndex + 1];
    }
    return null;
  };

  if (isLoading) {
    return (
      <MobileShell>
        <div className="p-4 space-y-4" data-testid="job-detail-loading">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </MobileShell>
    );
  }

  if (!workOrder) {
    return (
      <MobileShell>
        <div className="p-4 text-center" data-testid="job-not-found">
          <p className="text-slate-500">Work order not found</p>
          <Button 
            variant="link" 
            onClick={() => navigate("/mobile")}
            data-testid="button-back-to-agenda"
          >
            Back to Agenda
          </Button>
        </div>
      </MobileShell>
    );
  }

  const status = statusConfig[workOrder.status] || statusConfig.scheduled;
  const customerName = workOrder.customer?.name || "Unknown Customer";
  const customerPhone = workOrder.customer?.phone;
  const address = getPropertyAddress(workOrder.property);
  const nextStatus = getNextStatus(workOrder.status as WorkOrderStatus);

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-job-detail">
        <button
          onClick={() => navigate("/mobile")}
          className="flex items-center text-slate-600 hover:text-slate-800 min-h-[44px] min-w-[44px]"
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          <span>Back</span>
        </button>

        <div className="text-center mb-4">
          <Badge 
            variant="outline" 
            className={`text-lg px-4 py-1 ${status.className}`}
            data-testid="job-status-badge"
          >
            {status.label}
          </Badge>
        </div>

        <Card data-testid="customer-info-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg" data-testid="customer-name">
              {customerName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customerPhone && (
              <a 
                href={`tel:${customerPhone}`}
                className="flex items-center text-blue-600 hover:underline min-h-[44px]"
                data-testid="customer-phone"
              >
                <Phone className="h-4 w-4 mr-2" />
                {customerPhone}
              </a>
            )}
            <a 
              href={getGoogleMapsUrl(workOrder.property)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start text-slate-600 hover:text-blue-600 min-h-[44px]"
              data-testid="customer-address"
            >
              <MapPin className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
              <span>{address}</span>
            </a>
            {workOrder.scheduledStart && (
              <div className="flex items-center text-slate-500">
                <Clock className="h-4 w-4 mr-2" />
                <span data-testid="scheduled-time">
                  {format(new Date(workOrder.scheduledStart), "h:mm a")}
                  {workOrder.scheduledEnd && ` - ${format(new Date(workOrder.scheduledEnd), "h:mm a")}`}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 min-h-[48px]"
            onClick={handleCall}
            disabled={!customerPhone}
            data-testid="button-call"
          >
            <Phone className="h-5 w-5 mr-2" />
            Call
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-h-[48px]"
            onClick={handleText}
            disabled={!customerPhone}
            data-testid="button-text"
          >
            <MessageSquare className="h-5 w-5 mr-2" />
            Text
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-h-[48px]"
            onClick={handleNavigate}
            data-testid="button-navigate"
          >
            <Navigation className="h-5 w-5 mr-2" />
            Navigate
          </Button>
        </div>

        {nextStatus && (
          <Card data-testid="status-update-card">
            <CardContent className="pt-4">
              <Button
                className="w-full min-h-[48px] bg-[#711419] hover:bg-[#5a1014]"
                onClick={() => updateStatusMutation.mutate(nextStatus)}
                disabled={updateStatusMutation.isPending}
                data-testid="button-update-status"
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : null}
                {nextStatus === "dispatched" && "Mark Dispatched"}
                {nextStatus === "en_route" && "Start Driving"}
                {nextStatus === "on_site" && "Arrive On Site"}
                {nextStatus === "completed" && "Complete Job"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card data-testid="notes-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workOrder.techNotes ? (
              <div 
                className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-md max-h-40 overflow-auto"
                data-testid="existing-notes"
              >
                {workOrder.techNotes}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic" data-testid="no-notes">
                No notes yet
              </p>
            )}
            <Separator />
            <div className="flex gap-2">
              <Input
                placeholder="Add a note..."
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                className="flex-1 min-h-[44px]"
                data-testid="input-note"
              />
              <Button
                size="icon"
                className="min-h-[44px] min-w-[44px] bg-[#711419] hover:bg-[#5a1014]"
                onClick={handleAddNote}
                disabled={!noteInput.trim() || addNoteMutation.isPending}
                data-testid="button-add-note"
              >
                {addNoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {(workOrder.workSubtype || workOrder.description) && (
          <Card data-testid="job-info-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workOrder.workSubtype && (
                <div>
                  <span className="text-sm text-slate-500">Work Type: </span>
                  <Badge variant="secondary">
                    {workOrder.visitType} - {workOrder.workSubtype}
                  </Badge>
                </div>
              )}
              {workOrder.description && (
                <p className="text-sm text-slate-600" data-testid="job-description">
                  {workOrder.description}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MobileShell>
  );
}
