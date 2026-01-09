import { useQuery, useMutation } from "@tanstack/react-query";
import { Clock, Play, Square, Loader2, AlertCircle, CheckCircle, Briefcase } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import MobileShell from "./mobile-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CrmTimeEntry, CrmWorkOrder } from "@shared/schema";

export default function MobileTime() {
  const { toast } = useToast();

  const { data: currentEntry, isLoading: loadingCurrent } = useQuery<{ entry: CrmTimeEntry | null }>({
    queryKey: ["/api/mobile/time/current"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 30000,
  });

  const { data: history, isLoading: loadingHistory } = useQuery<CrmTimeEntry[]>({
    queryKey: ["/api/mobile/time/history"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: workOrders } = useQuery<CrmWorkOrder[]>({
    queryKey: ["/api/mobile/work-orders"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const clockInMutation = useMutation({
    mutationFn: async (workOrderId?: string) => {
      return apiRequest("POST", "/api/mobile/time/clock-in", { workOrderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/time/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/time/history"] });
      toast({ title: "Clocked In", description: "Your time is now being tracked." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to clock in", 
        variant: "destructive" 
      });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/mobile/time/clock-out");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/time/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/time/history"] });
      toast({ title: "Clocked Out", description: "Time entry has been saved." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to clock out", 
        variant: "destructive" 
      });
    },
  });

  const isClockedIn = !!currentEntry?.entry;
  const isLoading = loadingCurrent || clockInMutation.isPending || clockOutMutation.isPending;

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "--";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const getElapsedTime = () => {
    if (!currentEntry?.entry?.clockInAt) return null;
    return formatDistanceToNow(new Date(currentEntry.entry.clockInAt), { includeSeconds: true });
  };

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-time">
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#711419]" />
              Time Clock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCurrent ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className={`text-sm font-medium px-3 py-1 rounded-full inline-flex items-center gap-1.5 ${
                  isClockedIn 
                    ? "bg-green-100 text-green-700" 
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {isClockedIn ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Currently Clocked In
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4" />
                      Not Clocked In
                    </>
                  )}
                </div>

                {isClockedIn && currentEntry?.entry && (
                  <div className="space-y-1">
                    <p className="text-3xl font-bold text-slate-800" data-testid="elapsed-time">
                      {getElapsedTime()}
                    </p>
                    <p className="text-sm text-slate-500">
                      Started: {format(new Date(currentEntry.entry.clockInAt), "h:mm a")}
                    </p>
                  </div>
                )}

                <Button
                  size="lg"
                  className={`w-full h-16 text-lg font-semibold ${
                    isClockedIn 
                      ? "bg-red-600 hover:bg-red-700" 
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                  onClick={() => isClockedIn ? clockOutMutation.mutate() : clockInMutation.mutate(undefined)}
                  disabled={isLoading}
                  data-testid={isClockedIn ? "button-clock-out" : "button-clock-in"}
                >
                  {isLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : isClockedIn ? (
                    <>
                      <Square className="h-6 w-6 mr-2" />
                      Clock Out
                    </>
                  ) : (
                    <>
                      <Play className="h-6 w-6 mr-2" />
                      Clock In
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Recent Time Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : !history || history.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Clock className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p>No time entries yet</p>
              </div>
            ) : (
              <div className="space-y-3" data-testid="time-history-list">
                {history.slice(0, 10).map((entry) => (
                  <div 
                    key={entry.id} 
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    data-testid={`time-entry-${entry.id}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">
                        {format(new Date(entry.clockInAt), "EEE, MMM d")}
                      </p>
                      <p className="text-sm text-slate-500">
                        {format(new Date(entry.clockInAt), "h:mm a")}
                        {entry.clockOutAt && (
                          <> - {format(new Date(entry.clockOutAt), "h:mm a")}</>
                        )}
                      </p>
                      {entry.workOrderId && (
                        <div className="flex items-center gap-1 text-xs text-[#711419] mt-1">
                          <Briefcase className="h-3 w-3" />
                          <span>Work Order</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`font-semibold ${entry.clockOutAt ? "text-slate-800" : "text-green-600"}`}>
                        {entry.clockOutAt ? formatDuration(entry.durationMinutes) : "In Progress"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MobileShell>
  );
}
