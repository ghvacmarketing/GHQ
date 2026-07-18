import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, ImageIcon, Loader2, MapPin } from "lucide-react";
import { getLocalStartOfDay, getLocalEndOfDay, toLocalTime } from "@/lib/timezone";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import MobileShell from "./mobile-shell";
import type { CrmUser, CrmWorkOrder, CrmCustomer, CustomerFile } from "@shared/schema";

type WorkOrderWithDetails = CrmWorkOrder & { customer?: CrmCustomer | null };

export default function MobilePhotos() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const todayStart = getLocalStartOfDay(new Date()).toISOString();
  const todayEnd = getLocalEndOfDay(new Date()).toISOString();
  const { data: workOrders, isLoading: jobsLoading } = useQuery<WorkOrderWithDetails[]>({
    queryKey: ["/api/crm/work-orders", "photos", todayStart],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: todayStart, dateTo: todayEnd });
      if (currentUser && ["tech", "sales"].includes(currentUser.role)) {
        params.set("techId", currentUser.id);
      }
      const res = await fetch(`/api/crm/work-orders?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load jobs");
      const data = await res.json();
      return data.workOrders || [];
    },
    enabled: !!currentUser,
  });

  const jobs = useMemo(
    () => (workOrders || []).filter((wo) => wo.customerId).sort((a, b) => {
      const at = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
      const bt = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
      return at - bt;
    }),
    [workOrders],
  );
  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0] || null;
  const customerId = selectedJob?.customerId || null;

  const { data: files, isLoading: filesLoading } = useQuery<CustomerFile[]>({
    queryKey: ["/api/crm/customers", customerId, "files"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/${customerId}/files`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load photos");
      return res.json();
    },
    enabled: !!customerId,
  });
  const photos = (files || []).filter((f) => f.contentType?.startsWith("image/"));

  const handleUpload = async (list: FileList | null) => {
    if (!list || list.length === 0 || !customerId || !selectedJob) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const presignRes = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type,
        });
        const { uploadURL, objectPath } = await presignRes.json();
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        await apiRequest("POST", `/api/crm/customers/${customerId}/files`, {
          name: `WO-${selectedJob.workOrderNumber ?? ""} ${file.name}`.trim(),
          url: `/objects/${objectPath}`,
          objectPath,
          contentType: file.type,
          size: file.size,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customerId, "files"] });
      toast({ title: `${list.length} photo${list.length > 1 ? "s" : ""} uploaded` });
    } catch (e) {
      console.error("Photo upload error:", e);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <MobileShell>
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Photos</h2>
          <p className="text-sm text-slate-500">Job site photos — saved to the customer's file record.</p>
        </div>

        {/* Job picker */}
        {jobsLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            No jobs today — photos attach to a scheduled job's customer.
          </div>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {jobs.map((job) => {
              const active = selectedJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`shrink-0 rounded-2xl border px-3.5 py-2 text-left transition-all active:scale-95 ${
                    active ? "border-[#711419] bg-[#711419] text-white shadow-md" : "border-slate-200 bg-white text-slate-700"
                  }`}
                  data-testid={`photo-job-${job.id}`}
                >
                  <p className="text-xs font-semibold">
                    {job.scheduledStart ? format(toLocalTime(job.scheduledStart), "h:mm a") : "Unscheduled"}
                  </p>
                  <p className={`flex items-center gap-1 text-[11px] ${active ? "text-white/80" : "text-slate-500"}`}>
                    <MapPin className="h-3 w-3" />
                    {job.customer?.name || job.title || "Job"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Upload button */}
        {selectedJob && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
              data-testid="input-photo-file"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#711419] py-3.5 font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
              data-testid="button-take-photo"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              {uploading ? "Uploading…" : "Take / Add Photos"}
            </button>
          </>
        )}

        {/* Photo grid */}
        {customerId && (
          filesLoading ? (
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl" />
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-300">
              <ImageIcon className="h-10 w-10" />
              <p className="text-sm text-slate-400">No photos yet for {selectedJob?.customer?.name || "this customer"}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2" data-testid="photo-grid">
              {photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl">
                  <img src={p.url} alt={p.name} loading="lazy" className="aspect-square w-full object-cover transition-transform active:scale-95" />
                </a>
              ))}
            </div>
          )
        )}
      </div>
    </MobileShell>
  );
}
