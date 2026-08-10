import { memo, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isBefore, startOfDay } from "date-fns";
import { Plus, Check, Trash2, ChevronDown, ChevronRight, CalendarDays, Circle, MapPin, ExternalLink, ListChecks, X, Flag } from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useSmoothLoading } from "@/hooks/use-smooth-loading";
import { CrmLayout } from "@/components/crm/crm-layout";
import { NotificationsPanel } from "@/pages/crm/crm-notifications";
import { IndustrialTabs } from "@/components/crm/industrial-tabs";
import { DatePickerField } from "@/components/crm/date-picker";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

// Row hoisted OUT of the page component and memoized. Defined inline it was
// recreated every render, so React remounted EVERY row on each keystroke or
// state change — the source of the list's lag, and fatal to row animations
// (a remount restarts them). Stable identity keeps the DOM nodes alive so
// the check-pop and collapse transitions actually play.
type TaskRowProps = {
  t: Task & { assignedToUser?: CrmUser | null };
  scope: string;
  assigneeName: string | null;
  counts: { total: number; done: number } | undefined;
  isExpanded: boolean;
  checking: boolean;
  leaving: boolean;
  entrance?: boolean;
  onToggle: (t: Task) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onToggleSubtask: (taskId: string, id: string, isCompleted: boolean) => void;
};

const TaskRow = memo(function TaskRow({
  t, scope, assigneeName, counts, isExpanded, checking, leaving, entrance,
  onToggle, onOpen, onDelete, onToggleExpanded, onToggleSubtask,
}: TaskRowProps) {
  const completed = t.status === "completed";
  // The row wears its "done" face the instant the circle is tapped — the
  // cache only flips after the collapse has played (see completeWithAnimation).
  const showDone = completed || checking;
  const overdue = !showDone && t.dueAt && isBefore(new Date(t.dueAt), startOfDay(new Date()));
  const priority = (t.priority || "normal") as string;
  // Same cache key as the detail panel, so expanding is instant after
  // either has loaded once.
  const { data: rowSubtasks = [] } = useQuery<Array<{ id: string; title: string; isCompleted: boolean }>>({
    queryKey: ["/api/tasks", t.id, "subtasks"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${t.id}/subtasks`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isExpanded,
  });
  return (
    <div
      className={`grid border-b border-slate-100 transition-[grid-template-rows,opacity] duration-300 ease-in-out last:border-0 ${
        leaving ? "[grid-template-rows:0fr] opacity-0" : "[grid-template-rows:1fr] opacity-100"
      } ${entrance ? "animate-in fade-in slide-in-from-top-1 duration-300" : ""}`}
      data-testid={`task-${t.id}`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={`group flex items-start gap-3 px-4 py-3 transition-colors duration-300 ${checking ? "bg-emerald-50/70" : "hover:bg-slate-50"}`}>
          <button
            onClick={() => onToggle(t)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              showDone ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent hover:border-[#711419] hover:text-slate-300"
            } ${checking ? "animate-[task-check-pop_300ms_cubic-bezier(0.34,1.56,0.64,1)]" : ""}`}
            data-testid={`task-toggle-${t.id}`}
            aria-label={showDone ? "Mark incomplete" : "Mark complete"}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </button>
          {/* Whole row body opens the detail panel — that's where all editing lives */}
          <button
            onClick={() => onOpen(t.id)}
            className="min-w-0 flex-1 text-left"
            data-testid={`task-open-${t.id}`}
          >
            <p className={`text-sm ${showDone ? "text-slate-400 line-through" : "font-medium text-slate-900"}`}>{t.title}</p>
            {t.description && <p className={`mt-0.5 line-clamp-2 text-xs ${showDone ? "text-slate-300" : "text-slate-500"}`}>{t.description}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {t.dueAt && (
                <span className={`flex items-center gap-1 text-[11px] ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>
                  <CalendarDays className="h-3 w-3" />
                  {format(new Date(t.dueAt), "EEE, MMM d")}
                </span>
              )}
              {priority !== "normal" && !showDone && (
                <span className={`flex items-center gap-1 text-[11px] font-semibold ${priority === "high" ? "text-red-600" : "text-slate-400"}`}>
                  <Flag className="h-3 w-3" />
                  {priority === "high" ? "High" : "Low"}
                </span>
              )}
              {assigneeName && scope === "everyone" && (
                <span className="text-[11px] text-slate-400">{assigneeName}</span>
              )}
            </div>
          </button>
          {counts && counts.total > 0 && (
            <button
              onClick={() => onToggleExpanded(t.id)}
              className={`mt-0.5 flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                counts.done === counts.total ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-500 hover:bg-slate-100"
              }`}
              title={isExpanded ? "Hide subtasks" : "Show subtasks"}
              data-testid={`task-subtask-chip-${t.id}`}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {counts.done}/{counts.total}
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
          <button
            onClick={() => onDelete(t.id)}
            className="mt-0.5 rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
            title="Delete"
            data-testid={`task-delete-${t.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {/* Subtasks, indented under their parent — check off right from the list */}
        {isExpanded && rowSubtasks.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/60 py-1" data-testid={`task-subtasks-${t.id}`}>
            {rowSubtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 py-1.5 pl-12 pr-4">
                <button
                  onClick={() => onToggleSubtask(t.id, s.id, !s.isCompleted)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    s.isCompleted ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent hover:border-[#711419]"
                  }`}
                  aria-label={s.isCompleted ? "Mark incomplete" : "Mark complete"}
                  data-testid={`row-subtask-toggle-${s.id}`}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${s.isCompleted ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Tasks, Google-Tasks style: one list, a quick-add bar, round check-off
 * circles, and a collapsible Completed section. Clicking a task opens an
 * Asana-style detail panel — every field editable, plus a subtask checklist
 * (task_subtasks table; the routes predate this page).
 */
export default function CrmTasksSimple() {
  usePageTitle("Activity");
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser,
  });

  const [scope, setScope] = useState<"mine" | "everyone" | "notifications" | "comments">("mine");
  const searchString = useSearch();
  useEffect(() => {
    const t = new URLSearchParams(searchString).get("tab");
    if (t === "notifications" || t === "comments" || t === "everyone") setScope(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: notifCount } = useQuery<{ count: number }>({
    queryKey: ["/api/crm/notifications/unread-count"],
    refetchInterval: 30000,
  });
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
  // Always loaded (not just on the Comments tab) so the tab's count chip is
  // stable — a chip that pops in only when active made the tab bar jump.
  const { data: allPins = [] } = useQuery<PinRow[]>({
    queryKey: ["/api/crm/pins", "all-open"],
    queryFn: async () => {
      const res = await fetch("/api/crm/pins", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser,
  });
  const resolvePin = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/crm/pins/${id}`, { resolved: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crm/pins"] }),
  });

  // Everyone tab: narrow the list to one person's tasks.
  const [personFilter, setPersonFilter] = useState<string>("all");
  const tasks = useMemo(() => {
    const all = tasksData?.tasks ?? [];
    if (scope !== "everyone" || personFilter === "all") return all;
    return all.filter((t) => t.assignedToUserId === personFilter);
  }, [tasksData, scope, personFilter]);
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

  // ── Optimistic plumbing: actions land on screen instantly; the server
  // round-trip reconciles afterwards. Snapshot + surgically edit every cached
  // /api/tasks list (all scopes share the prefix; non-list entries pass through).
  const snapshotTasks = async () => {
    await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
    return queryClient.getQueriesData({ queryKey: ["/api/tasks"] });
  };
  const restoreTasks = (snapshot: Array<[readonly unknown[], unknown]> | undefined) => {
    (snapshot || []).forEach(([key, data]) => queryClient.setQueryData(key as any, data as any));
  };
  const patchTaskLists = (fn: (tasks: any[]) => any[]) =>
    queryClient.setQueriesData({ queryKey: ["/api/tasks"] }, (old: any) =>
      old && Array.isArray(old.tasks) ? { ...old, tasks: fn(old.tasks) } : old,
    );

  // Rows mid-animation: "checking" = circle just tapped (pop + green linger),
  // "leaving" = collapsing out of the list (completed or deleted).
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());

  // ── Quick add ──
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const createTask = useMutation({
    mutationFn: async (payload: { title: string; dueAt?: string; assignedToUserId?: string }) =>
      apiRequest("POST", "/api/tasks", { ...payload, isAllDay: true }),
    onMutate: async (payload) => {
      const snapshot = await snapshotTasks();
      patchTaskLists((tasks) => [
        ...tasks,
        {
          id: `temp-${Date.now()}`,
          title: payload.title,
          status: "pending",
          dueAt: payload.dueAt || null,
          assignedToUserId: payload.assignedToUserId || null,
          priority: "normal",
          description: null,
        },
      ]);
      return { snapshot };
    },
    onSuccess: () => toast({ title: "Task added" }),
    onError: (e: any, payload, ctx) => {
      restoreTasks(ctx?.snapshot);
      setNewTitle(payload.title); // hand their typing back
      toast({ title: e?.message || "Couldn't add the task", variant: "destructive" });
    },
    onSettled: () => invalidate(),
  });
  const submitNewTask = () => {
    if (!newTitle.trim()) return;
    const payload = {
      title: newTitle.trim(),
      dueAt: newDue ? new Date(`${newDue}T09:00:00`).toISOString() : undefined,
      assignedToUserId: newAssignee || currentUser?.id,
    };
    setNewTitle("");
    setNewDue("");
    createTask.mutate(payload);
  };

  const toggleTask = useMutation({
    mutationFn: async (t: Task) =>
      apiRequest("PUT", `/api/tasks/${t.id}`, {
        status: t.status === "completed" ? "pending" : "completed",
      }),
    onMutate: async (t) => {
      const snapshot = await snapshotTasks();
      const next = t.status === "completed" ? "pending" : "completed";
      patchTaskLists((tasks) =>
        tasks.map((x) =>
          x.id === t.id
            ? { ...x, status: next, completedAt: next === "completed" ? new Date().toISOString() : null }
            : x,
        ),
      );
      return { snapshot };
    },
    onSuccess: (_data, t) => toast({ title: t.status === "completed" ? "Task reopened" : "Task completed" }),
    onError: (e: any, _t, ctx) => {
      restoreTasks(ctx?.snapshot);
      toast({ title: e?.message || "Couldn't update the task", variant: "destructive" });
    },
    onSettled: () => invalidate(),
  });

  // Check-off choreography: the circle fills and pops immediately, the row
  // tints green for a beat, collapses shut, and only THEN does the cache
  // flip — so the task re-materializes under Completed with no jump cut.
  const completeWithAnimation = (t: Task) => {
    if (checkingIds.has(t.id) || leavingIds.has(t.id)) return;
    setCheckingIds((p) => new Set(p).add(t.id));
    window.setTimeout(() => setLeavingIds((p) => new Set(p).add(t.id)), 450);
    window.setTimeout(() => {
      toggleTask.mutate(t);
      setCheckingIds((p) => { const n = new Set(p); n.delete(t.id); return n; });
      setLeavingIds((p) => { const n = new Set(p); n.delete(t.id); return n; });
    }, 780);
  };
  const toggleFromRow = (t: Task) => {
    if (t.status === "completed") toggleTask.mutate(t); // reopen: instant
    else completeWithAnimation(t);
  };

  const deleteTask = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onMutate: async (id) => {
      const snapshot = await snapshotTasks();
      patchTaskLists((tasks) => tasks.filter((x) => x.id !== id));
      return { snapshot };
    },
    onSuccess: () => toast({ title: "Task deleted" }),
    onError: (e: any, _id, ctx) => {
      restoreTasks(ctx?.snapshot);
      toast({ title: e?.message || "Couldn't delete the task", variant: "destructive" });
    },
    onSettled: () => invalidate(),
  });

  // Row delete: slide the task closed first, then commit.
  const deleteWithAnimation = (id: string) => {
    if (leavingIds.has(id)) return;
    setLeavingIds((p) => new Set(p).add(id));
    window.setTimeout(() => {
      deleteTask.mutate(id);
      setLeavingIds((p) => { const n = new Set(p); n.delete(id); return n; });
    }, 280);
  };

  const updateTask = useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiRequest("PUT", `/api/tasks/${id}`, body),
    onSuccess: (_data, vars) => {
      invalidate();
      const field = Object.keys(vars).find((k) => k !== "id");
      const label =
        field === "title" ? "Title saved"
        : field === "description" ? "Notes saved"
        : field === "dueAt" ? "Due date updated"
        : field === "assignedToUserId" ? "Assignee updated"
        : field === "priority" ? "Priority updated"
        : "Task updated";
      toast({ title: label });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't update the task", variant: "destructive" }),
  });

  // ── Detail panel (Asana-style): every field editable + subtasks ──
  const [detailId, setDetailId] = useState<string | null>(null);
  // Two-phase visibility so the slide-over eases in AND out (a bare unmount
  // would snap shut with no exit animation).
  const [panelVisible, setPanelVisible] = useState(false);
  useEffect(() => {
    if (detailId) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPanelVisible(true)));
      return () => cancelAnimationFrame(raf);
    }
    setPanelVisible(false);
  }, [detailId]);
  const closePanel = () => {
    setPanelVisible(false);
    window.setTimeout(() => setDetailId(null), 300);
  };
  const detailTask = tasks.find((t) => t.id === detailId) || null;
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  // Tasks expanded in the LIST to show their subtasks indented underneath.
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedTasks((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  useEffect(() => {
    const t = detailId ? tasks.find((x) => x.id === detailId) : null;
    setDraftTitle(t?.title ?? "");
    setDraftDesc(t?.description ?? "");
    // Re-seed only when a different task opens — not on every refetch, or
    // typing would be clobbered mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);
  useEffect(() => {
    if (!detailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  // Subtask progress for the list rows ("2/3" chips) — one grouped query.
  const { data: subCountRows = [] } = useQuery<Array<{ taskId: string; total: number; done: number }>>({
    queryKey: ["/api/tasks", "subtask-counts"],
    queryFn: async () => {
      const res = await fetch("/api/tasks/subtask-counts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser,
  });
  const subCounts = useMemo(() => new Map(subCountRows.map((r) => [r.taskId, r])), [subCountRows]);

  type Subtask = { id: string; taskId: string; title: string; isCompleted: boolean; dueAt: string | null; sortOrder: number };
  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ["/api/tasks", detailId, "subtasks"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${detailId}/subtasks`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!detailId,
  });
  const [newSubtask, setNewSubtask] = useState("");
  const addSubtask = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/tasks/${detailId}/subtasks`, { title: newSubtask.trim(), sortOrder: subtasks.length }),
    onSuccess: () => {
      setNewSubtask("");
      invalidate();
      toast({ title: "Subtask added" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't add the subtask", variant: "destructive" }),
  });
  // taskId rides along so BOTH the panel and the expanded list rows can
  // check off / rename subtasks.
  const patchSubtask = useMutation({
    mutationFn: async ({ taskId, id, ...body }: { taskId: string; id: string } & Record<string, unknown>) =>
      apiRequest("PUT", `/api/tasks/${taskId}/subtasks/${id}`, body),
    onSuccess: (_data, vars) => {
      invalidate();
      toast({
        title:
          typeof vars.isCompleted === "boolean"
            ? vars.isCompleted ? "Subtask completed" : "Subtask reopened"
            : "Subtask renamed",
      });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't update the subtask", variant: "destructive" }),
  });
  const removeSubtask = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/tasks/${detailId}/subtasks/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Subtask deleted" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't delete the subtask", variant: "destructive" }),
  });

  if (!currentUser) return null;
  const userName = (id: string | null | undefined) => users.find((u) => u.id === id)?.name || null;
  const today = startOfDay(new Date());


  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-4xl space-y-4">
        {/* Title + scope tabs. 1fr | auto | 1fr grid keeps the tabs pinned to
            the true center — with mx-auto they re-centered against the
            subtitle, whose width changes per tab, so switching tabs made the
            whole bar jump sideways. Counts render on every tab for the same
            reason (a chip that mounts only when active changes the tab's width). */}
        <div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Activity</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {scope === "notifications"
                ? `${notifCount?.count ?? 0} unread`
                : scope === "comments"
                  ? `${allPins.length} open`
                  : `${open.length} open${done.length ? ` · ${done.length} done` : ""}`}
            </p>
          </div>
          <div className="justify-self-center">
            <IndustrialTabs
              testidPrefix="tasks-scope"
              activeKey={scope}
              onSelect={(k) => setScope(k as typeof scope)}
              tabs={[
                { key: "mine", label: "My Tasks" },
                { key: "everyone", label: "Everyone" },
                { key: "notifications", label: "Notifications", count: notifCount?.count ? notifCount.count : null },
                { key: "comments", label: "Comments", count: allPins.length ? allPins.length : null },
              ]}
            />
          </div>
          {/* Everyone tab: person filter — jump to one teammate's list */}
          <div className="flex lg:justify-end">
            {scope === "everyone" ? (
              <Select value={personFilter} onValueChange={setPersonFilter}>
                <SelectTrigger className="h-8 w-44 text-xs" data-testid="tasks-person-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone's tasks</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="hidden lg:block" />
            )}
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
                    {(p.mentions?.length ?? 0) > 0 && (
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {p.mentions.map((id) => {
                          const name = users.find((u) => u.id === id)?.name;
                          return name ? (
                            <span key={id} className="rounded-[3px] bg-[#711419]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#711419]">
                              @{name}
                            </span>
                          ) : null;
                        })}
                      </span>
                    )}
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

        {/* Notifications — the old Notifications page lives here now */}
        {scope === "notifications" && <NotificationsPanel currentUser={currentUser} />}

        {/* Quick add */}
        {(scope === "mine" || scope === "everyone") && (
        <div className="flex items-center gap-2.5 rounded-[4px] border border-slate-300/70 bg-white py-2 pl-4 pr-3" data-testid="task-add-bar">
          <Plus className="h-4 w-4 shrink-0 text-[#711419]" />
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitNewTask(); }}
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
        {scope === "comments" || scope === "notifications" ? null : tasksLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-[4px]" />)}</div>
        ) : open.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-14 text-center">
            <Circle className="mx-auto mb-3 h-8 w-8 text-slate-200" />
            <p className="text-sm font-medium text-slate-600">All clear</p>
            <p className="mt-0.5 text-xs text-slate-400">Add a task above to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="task-list">
            {open.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                scope={scope}
                assigneeName={userName(t.assignedToUserId)}
                counts={subCounts.get(t.id)}
                isExpanded={expandedTasks.has(t.id)}
                checking={checkingIds.has(t.id)}
                leaving={leavingIds.has(t.id)}
                onToggle={toggleFromRow}
                onOpen={setDetailId}
                onDelete={deleteWithAnimation}
                onToggleExpanded={toggleExpanded}
                onToggleSubtask={(taskId, id, isCompleted) => patchSubtask.mutate({ taskId, id, isCompleted })}
              />
            ))}
          </div>
        )}

        {/* Completed */}
        {(scope === "mine" || scope === "everyone") && done.length > 0 && (
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
                {done.slice(0, 50).map((t) => (
                  <TaskRow
                    key={t.id}
                    t={t}
                    scope={scope}
                    assigneeName={userName(t.assignedToUserId)}
                    counts={subCounts.get(t.id)}
                    isExpanded={expandedTasks.has(t.id)}
                    checking={false}
                    leaving={leavingIds.has(t.id)}
                    entrance
                    onToggle={toggleFromRow}
                    onOpen={setDetailId}
                    onDelete={deleteWithAnimation}
                    onToggleExpanded={toggleExpanded}
                    onToggleSubtask={(taskId, id, isCompleted) => patchSubtask.mutate({ taskId, id, isCompleted })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Task detail panel: Asana-style slide-over. Everything edits in
          place — title, notes, due, assignee, priority — plus subtasks. ── */}
      {detailTask && (
        <>
          <div
            className={`fixed inset-0 z-[60] bg-black/20 transition-opacity duration-300 ${panelVisible ? "opacity-100" : "opacity-0"}`}
            onClick={closePanel}
            data-testid="task-detail-backdrop"
          />
          <aside
            className={`fixed inset-y-0 right-0 z-[61] flex w-full max-w-md transform flex-col border-l border-slate-300/70 bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              panelVisible ? "translate-x-0" : "translate-x-full"
            }`}
            data-testid="task-detail-panel"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
              <button
                onClick={() => toggleTask.mutate(detailTask)}
                className={`flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-xs font-semibold transition-colors ${
                  detailTask.status === "completed"
                    ? "border-[#711419] bg-[#711419] text-white"
                    : "border-slate-300 text-slate-600 hover:border-[#711419] hover:text-[#711419]"
                }`}
                data-testid="task-detail-toggle"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                {detailTask.status === "completed" ? "Completed" : "Mark complete"}
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    deleteTask.mutate(detailTask.id);
                    closePanel();
                  }}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Delete task"
                  data-testid="task-detail-delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={closePanel}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                  data-testid="task-detail-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {/* Title — borderless input, saves on blur/Enter */}
              <textarea
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={() => {
                  const v = draftTitle.trim();
                  if (v && v !== detailTask.title) updateTask.mutate({ id: detailTask.id, title: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                rows={2}
                className={`w-full resize-none border-0 p-0 text-lg font-semibold leading-snug focus:outline-none focus:ring-0 ${
                  detailTask.status === "completed" ? "text-slate-400 line-through" : "text-slate-900"
                }`}
                data-testid="task-detail-title"
              />

              {/* Fields */}
              <div className="space-y-2.5">
                <label className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Assignee</span>
                  <Select
                    value={detailTask.assignedToUserId || ""}
                    onValueChange={(v) => updateTask.mutate({ id: detailTask.id, assignedToUserId: v })}
                  >
                    <SelectTrigger className="h-9 flex-1" data-testid="task-detail-assignee"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                    <SelectContent>
                      {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Due</span>
                  <DatePickerField
                    value={detailTask.dueAt ? format(new Date(detailTask.dueAt), "yyyy-MM-dd") : ""}
                    onChange={(v) => updateTask.mutate({ id: detailTask.id, dueAt: v ? new Date(`${v}T09:00:00`).toISOString() : null })}
                    placeholder="No due date"
                    className="flex-1"
                    testid="task-detail-due"
                  />
                </label>
                <label className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Priority</span>
                  <Select
                    value={(detailTask.priority as string) || "normal"}
                    onValueChange={(v) => updateTask.mutate({ id: detailTask.id, priority: v })}
                  >
                    <SelectTrigger className="h-9 flex-1" data-testid="task-detail-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {/* Description */}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
                <textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  onBlur={() => {
                    if (draftDesc !== (detailTask.description || "")) {
                      updateTask.mutate({ id: detailTask.id, description: draftDesc || null });
                    }
                  }}
                  rows={4}
                  placeholder="Add details…"
                  className="w-full resize-none rounded-[4px] border border-slate-300/70 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#711419] focus:outline-none"
                  data-testid="task-detail-notes"
                />
              </div>

              {/* Subtasks */}
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <ListChecks className="h-3.5 w-3.5" />
                  Subtasks
                  {subtasks.length > 0 && (
                    <span className="text-slate-500">{subtasks.filter((s) => s.isCompleted).length}/{subtasks.length}</span>
                  )}
                </p>
                {subtasks.length > 0 && (
                  <div className="overflow-hidden rounded-[4px] border border-slate-200" data-testid="task-subtask-list">
                    {subtasks.map((s) => (
                      <div key={s.id} className="group flex items-center gap-2.5 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50" data-testid={`subtask-${s.id}`}>
                        <button
                          onClick={() => patchSubtask.mutate({ taskId: detailTask.id, id: s.id, isCompleted: !s.isCompleted })}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            s.isCompleted ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent hover:border-[#711419]"
                          }`}
                          data-testid={`subtask-toggle-${s.id}`}
                          aria-label={s.isCompleted ? "Mark incomplete" : "Mark complete"}
                        >
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </button>
                        {/* Inline rename — plain input styled as text, saves on blur */}
                        <input
                          key={`${s.id}-${s.title}`}
                          defaultValue={s.title}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== s.title) patchSubtask.mutate({ taskId: detailTask.id, id: s.id, title: v });
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none ${
                            s.isCompleted ? "text-slate-400 line-through" : "text-slate-800"
                          }`}
                          data-testid={`subtask-title-${s.id}`}
                        />
                        <button
                          onClick={() => removeSubtask.mutate(s.id)}
                          className="rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                          title="Delete subtask"
                          data-testid={`subtask-delete-${s.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-2 rounded-[4px] border border-dashed border-slate-300 px-3 py-1.5">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-[#711419]" />
                  <input
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && newSubtask.trim() && addSubtask.mutate()}
                    placeholder="Add a subtask — press Enter"
                    className="h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    data-testid="subtask-add-input"
                  />
                </div>
              </div>

              {/* Meta */}
              <p className="text-[11px] text-slate-400">
                Created {detailTask.createdAt ? format(new Date(detailTask.createdAt), "MMM d, yyyy") : ""}
                {userName(detailTask.createdByUserId) ? ` by ${userName(detailTask.createdByUserId)}` : ""}
              </p>
            </div>
          </aside>
        </>
      )}
    </CrmLayout>
  );
}
