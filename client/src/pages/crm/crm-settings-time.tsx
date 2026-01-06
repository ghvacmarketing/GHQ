import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Clock, ArrowLeft, Loader2, Search, Download, Edit2, Save, X, User, Calendar
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, CrmTimeEntry } from "@shared/schema";

interface TimeEntryWithTech extends CrmTimeEntry {
  technicianName?: string;
}

export default function CrmSettingsTime() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedTechId, setSelectedTechId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithTech | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: users } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!currentUser,
  });

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedTechId !== "all") params.set("technicianId", selectedTechId);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params.toString();
  };

  const { data: timeEntries, isLoading: loadingEntries } = useQuery<TimeEntryWithTech[]>({
    queryKey: ["/api/crm/time-entries", selectedTechId, startDate, endDate],
    queryFn: async () => {
      const params = buildQueryParams();
      const res = await fetch(`/api/crm/time-entries?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/crm/time-entries/${id}`, data);
    },
    onSuccess: () => {
      setEditingEntry(null);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/time-entries"] });
      toast({ title: "Updated", description: "Time entry has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "--";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const handleEdit = (entry: TimeEntryWithTech) => {
    setEditingEntry(entry);
    setEditNotes(entry.notes || "");
    setEditClockIn(entry.clockInAt ? format(new Date(entry.clockInAt), "yyyy-MM-dd'T'HH:mm") : "");
    setEditClockOut(entry.clockOutAt ? format(new Date(entry.clockOutAt), "yyyy-MM-dd'T'HH:mm") : "");
  };

  const handleSave = () => {
    if (!editingEntry) return;
    const data: any = { notes: editNotes };
    if (editClockIn) data.clockInAt = new Date(editClockIn).toISOString();
    if (editClockOut) data.clockOutAt = new Date(editClockOut).toISOString();
    updateMutation.mutate({ id: editingEntry.id, data });
  };

  const handleExportCSV = () => {
    if (!timeEntries || timeEntries.length === 0) return;
    
    const headers = ["Technician", "Date", "Clock In", "Clock Out", "Duration", "Notes"];
    const rows = timeEntries.map((entry) => [
      entry.technicianName || "Unknown",
      entry.clockInAt ? format(new Date(entry.clockInAt), "yyyy-MM-dd") : "",
      entry.clockInAt ? format(new Date(entry.clockInAt), "h:mm a") : "",
      entry.clockOutAt ? format(new Date(entry.clockOutAt), "h:mm a") : "",
      formatDuration(entry.durationMinutes),
      entry.notes || "",
    ]);
    
    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
      </div>
    );
  }

  if (!currentUser) return null;

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";
  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 text-center">
          <p className="text-slate-500">Only administrators can access time logs.</p>
        </div>
      </CrmLayout>
    );
  }

  const technicians = users?.filter((u) => u.role === "tech" || u.role === "sales") || [];

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-6xl mx-auto" data-testid="crm-time-logs">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/crm/settings")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-6 w-6 text-[#711419]" />
              Time Logs
            </h1>
            <p className="text-sm text-slate-500">View and manage technician clock in/out records</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="w-48">
                <Label className="text-xs text-slate-500 mb-1 block">Technician</Label>
                <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                  <SelectTrigger data-testid="select-technician">
                    <SelectValue placeholder="All technicians" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Technicians</SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40">
                <Label className="text-xs text-slate-500 mb-1 block">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>
              <div className="w-40">
                <Label className="text-xs text-slate-500 mb-1 block">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-end-date"
                />
              </div>
              <div className="flex-1 flex items-end justify-end">
                <Button variant="outline" onClick={handleExportCSV} disabled={!timeEntries || timeEntries.length === 0} data-testid="button-export">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loadingEntries ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : !timeEntries || timeEntries.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Clock className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>No time entries found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Technician</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeEntries.map((entry) => (
                    <TableRow key={entry.id} data-testid={`time-row-${entry.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#711419] text-white flex items-center justify-center text-xs font-semibold">
                            {entry.technicianName?.charAt(0) || "?"}
                          </div>
                          {entry.technicianName || "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell>{entry.clockInAt ? format(new Date(entry.clockInAt), "MMM d, yyyy") : "--"}</TableCell>
                      <TableCell>{entry.clockInAt ? format(new Date(entry.clockInAt), "h:mm a") : "--"}</TableCell>
                      <TableCell>
                        {entry.clockOutAt ? format(new Date(entry.clockOutAt), "h:mm a") : (
                          <span className="text-green-600 font-medium">In Progress</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDuration(entry.durationMinutes)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{entry.notes || "--"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(entry)} data-testid={`button-edit-${entry.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Clock In</Label>
              <Input
                type="datetime-local"
                value={editClockIn}
                onChange={(e) => setEditClockIn(e.target.value)}
                data-testid="input-edit-clock-in"
              />
            </div>
            <div>
              <Label>Clock Out</Label>
              <Input
                type="datetime-local"
                value={editClockOut}
                onChange={(e) => setEditClockOut(e.target.value)}
                data-testid="input-edit-clock-out"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes..."
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-edit">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
