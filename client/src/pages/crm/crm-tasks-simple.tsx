import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isBefore, startOfDay } from "date-fns";
import { Plus, Check, Trash2, ChevronDown, ChevronRight, CalendarDays, Circle, MapPin, ExternalLink } from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useSmoothLoading } from "@/hooks/use-smooth-loading";
import { CrmLayout } from "@/components/crm/crm-layout";
import { IndustrialTabs } from "@/components/crm/industrial-tabs";
import { DatePickerField } from "@/components/crm/date-picker";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import type { CrmUser, Task } from "@shared/schema";

// Human-readable location for a pin path: "/crm/customers/8f2a…?tab=tasks"
// reads as "CRM → Customers → Tasks". IDs are skipped; unknown segments are
// title-cased so new pages still read sensibly without a mapping update.
const PIN_PATH_LABELS: Record<string, string> = {
  crm: "CRM",
  dashboard: "Dashboard",
  customers: "Customers",
  "work-orders": "Work Orders",
  invoices: "Invoices",
  quotes: "Quotes",
  agreements: "Agreements",
  dispatch: "Dispatch Board",
  messaging: "Messages",
  mail: "Mail",
  phone: "Phone",
  projects: "Projects",
  tasks: "Tasks",
  "photo-gallery": "Media",
  esign: "Signatures",
  "env-monitoring": "Environment",
  notifications: "Notifications",
  settings: "Settings",
  marketing: "Marketing",
  items: "Items",
  "prospect-funnel": "Lead Funnel",
  "rebate-programs": "Rebate Programs",
  reports: "Goals",
  board: "",
  mine: "",
};

function describePinPath(path: string): string {
  const [pathname, query = ""] = String(path || "").split("?");
  const parts: string[] = [];
  for (const seg of pathname.split("/").filter(Boolean)) {
    if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(seg) || /^\d+$/.test(seg)) continue; // record ids
    const label = seg in PIN_PATH_LABELS
      ? PIN_PATH_LABELS[seg]
      : seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (label) parts.push(label);
  }
  const tab = /(?:^|&)tab=([^&]+)/.exec(query)?.[1];
  if (tab) parts.push(tab.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  return parts.join(" → ") || path;
}

/**
 * Tasks, Google-Tasks style: one list, a quick-add bar, round check-off
 * circles, and a collapsible Completed section. No boards, no columns,
 * no types, no subtasks — just tasks.
 */
export default function CrmTasksSimple() {
  usePageTitle("Tasks");
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const [scope, setScope] = useState<"mine" | "everyone" | "comments">("mine");
  const [, navigate] = useLocation();
  const [completedOpen, setCompletedOpen] = useState(false);

  const { data: tasksData, isLoading: tasksLoadingRaw } = useQuery<{ tasks: (Task & { assignedToUser?: CrmUser | null })[] }>({
    queryKey: ["/api/tasks", "simple", scope, currentUser?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "300" });
      if (scope === "mine" && currentUser) params.set("assignedTo", currentUser.id);
      const res = await fetch(`/api/tasks?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      return res.json();
    },
    enabled: !!currentUser,
  });
  const tasksLoading = useSmoothLoading(tasksLoadingRaw);

  type PinRow = {
    id: string; path: string; body: string; createdByName: string | null; created_at: string; mentions: string[];
  };
  const { data: allPins = [] } = useQuery<PinRow[]>({
    queryKey: ["/api/crm/pins", "all-open"],
    queryFn: async () => {
      const res = await fetch("/api/crm/pins", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser && scope === "comments",
  });
  const resolvePin = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/crm/pins/${id}`, { resolved: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crm/pins"] }),
  });

  const tasks = tasksData?.tasks ?? [];
  const open = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "completed" && t.status !== "cancelled")
        .sort((a, b) => {
          const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
          const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
          return ad - bd;
        }),
    [tasks],
  );
  const done = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "completed")
        .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0).getTime() - new Date(a.completedAt || a.updatedAt || 0).getTime()),
    [tasks],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });

  // ── Quick add ──
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const createTask = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/tasks", {
        title: newTitle.trim(),
        dueAt: newDue ? new Date(`${newDue}T09:00:00`).toISOString() : undefined,
        assignedToUserId: newAssignee || currentUser?.id,
        isAllDay: true,
      }),
    onSuccess: () => {
      setNewTitle("");
      setNewDue("");
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't add the task", variant: "destructive" }),
  });

  const toggleTask = useMutation({
    mutationFn: async (t: Task) =>
      apiRequest("PUT", `/api/tasks/${t.id}`, {
        status: t.status === "completed" ? "pending" : "completed",
      }),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: e?.message || "Couldn't update the task", variant: "destructive" }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: invalidate,
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest("PUT", `/api/tasks/${id}`, body),
    onSuccess: invalidate,
  });

  if (!currentUser) return null;
  const userName = (id: string | null | undefined) => users.find((u) => u.id === id)?.name || null;
  const today = startOfDay(new Date());

  const TaskRow = ({ t }: { t: Task }) => {
    const completed = t.status === "completed";
    const overdue = !completed && t.dueAt && isBefore(new Date(t.dueAt), today);
    const assignee = userName(t.assignedToUserId);
    return (
      <div className="group flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50" data-testid={`task-${t.id}`}>
        <button
          onClick={() => toggleTask.mutate(t)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            completed ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent hover:border-[#711419] hover:text-slate-300"
          }`}
          data-testid={`task-toggle-${t.id}`}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${completed ? "text-slate-400 line-through" : "font-medium text-slate-900"}`}>{t.title}</p>
          {t.description && <p className={`mt-0.5 text-xs ${completed ? "text-slate-300" : "text-slate-500"}`}>{t.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {t.dueAt && (
              <span className={`flex items-center gap-1 text-[11px] ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>
                <CalendarDays className="h-3 w-3" />
                {format(new Date(t.dueAt), "EEE, MMM d")}
              </span>
            )}
            {assignee && scope === "everyone" && (
              <span className="text-[11px] text-slate-400">{assignee}</span>
            )}
          </div>
        </div>
        {!completed && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="mt-0.5 rounded p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100" title="Edit" data-testid={`task-edit-${t.id}`}>
                <CalendarDays className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Edit task</p>
              <DatePickerField
                value={t.dueAt ? format(new Date(t.dueAt), "yyyy-MM-dd") : ""}
                onChange={(v) =>
                  updateTask.mutate({ id: t.id, dueAt: v ? new Date(`${v}T09:00:00`).toISOString() : null })
                }
                placeholder="Due date"
              />
              <Select
                value={t.assignedToUserId || ""}
                onValueChange={(v) => updateTask.mutate({ id: t.id, assignedToUserId: v })}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>
        )}
        <button
          onClick={() => deleteTask.mutate(t.id)}
          className="mt-0.5 rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          title="Delete"
          data-testid={`task-delete-${t.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* Title + scope tabs on one row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 shrink-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Tasks</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {open.length} open{done.length ? ` · ${done.length} done` : ""}
            </p>
          </div>
          <div className="mx-auto">
            <IndustrialTabs
              testidPrefix="tasks-scope"
              activeKey={scope}
              onSelect={(k) => setScope(k as typeof scope)}
              tabs={[
                { key: "mine", label: "My Tasks" },
                { key: "everyone", label: "Everyone" },
                { key: "comments", label: "Comments", count: scope === "comments" && allPins.length ? allPins.length : null },
              ]}
            />
          </div>
        </div>

        {/* Comments across the CRM — open pin comments, click through to the spot */}
        {scope === "comments" && (
          allPins.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-14 text-center">
              <MapPin className="mx-auto mb-3 h-8 w-8 text-slate-200" />
              <p className="text-sm font-medium text-slate-600">No open comments</p>
              <p className="mt-0.5 text-xs text-slate-400">Pin comments dropped anywhere in the CRM collect here.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="pin-comment-list">
              {allPins.map((p) => (
                <div key={p.id} className="group flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50" data-testid={`pin-row-${p.id}`}>
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 fill-[#711419] text-white" />
                  <button onClick={() => navigate(`${p.path}?pin=${p.id}`)} className="min-w-0 flex-1 text-left">
                    <p className="line-clamp-2 text-sm text-slate-900">{p.body}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {p.createdByName || "Someone"} · {describePinPath(p.path)} · {format(new Date(p.created_at), "MMM d, h:mm a")}
                    </p>
                  </button>
                  <button
                    onClick={() => navigate(`${p.path}?pin=${p.id}`)}
                    className="mt-0.5 rounded p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                    title="Open at the pinned spot"
                    data-testid={`pin-open-${p.id}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => resolvePin.mutate(p.id)}
                    className="mt-0.5 rounded p-1 text-slate-300 opacity-0 hover:bg-green-50 hover:text-green-700 group-hover:opacity-100"
                    title="Resolve"
                    data-testid={`pin-resolve-${p.id}`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* Quick add */}
        {scope !== "comments" && (
        <div className="flex items-center gap-2 rounded-[4px] border border-slate-300/70 bg-white px-3 py-2" data-testid="task-add-bar">
          <Plus className="h-4 w-4 shrink-0 text-[#711419]" />
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newTitle.trim() && createTask.mutate()}
            placeholder="Add a task — press Enter to save"
            className="h-8 flex-1 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
            data-testid="task-add-input"
          />
          <DatePickerField
            value={newDue}
            onChange={setNewDue}
            placeholder="Due"
            className="h-8 w-36 shrink-0 text-xs"
            testid="task-add-due"
          />
          <Select value={newAssignee || currentUser.id} onValueChange={setNewAssignee}>
            <SelectTrigger className="h-8 w-32 shrink-0 text-xs" data-testid="task-add-assignee"><SelectValue /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        )}

        {/* Open tasks */}
        {scope === "comments" ? null : tasksLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-[4px]" />)}</div>
        ) : open.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-14 text-center">
            <Circle className="mx-auto mb-3 h-8 w-8 text-slate-200" />
            <p className="text-sm font-medium text-slate-600">All clear</p>
            <p className="mt-0.5 text-xs text-slate-400">Add a task above to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="task-list">
            {open.map((t) => <TaskRow key={t.id} t={t} />)}
          </div>
        )}

        {/* Completed */}
        {scope !== "comments" && done.length > 0 && (
          <div>
            <button
              onClick={() => setCompletedOpen((v) => !v)}
              className="flex items-center gap-1.5 px-1 py-1 text-sm font-medium text-slate-500 hover:text-slate-800"
              data-testid="task-completed-toggle"
            >
              {completedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Completed {done.length}
            </button>
            {completedOpen && (
              <div className="mt-2 overflow-hidden rounded-[4px] border border-slate-200 bg-white/60" data-testid="task-completed-list">
                {done.slice(0, 50).map((t) => <TaskRow key={t.id} t={t} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
