import { memo, useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, formatDistanceToNow, isBefore, isSameDay, startOfDay } from "date-fns";
import MobileShell from "./mobile-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardInset } from "@/lib/native";
import {
  ArrowUp, CalendarDays, Check, ClipboardList, ListChecks, ListPlus,
  Loader2, MessageSquare, SlidersHorizontal, Trash2, ChevronDown, ChevronRight,
} from "lucide-react";
import { SheetSelect } from "@/components/mobile/sheet-select";
import { Switch } from "@/components/ui/switch";
import { DateRangeSheet } from "@/components/mobile/date-range-calendar";
import { Calendar } from "@/components/ui/calendar";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { AssigneeSheet } from "@/components/mobile/assignee-sheet";
import { AvatarWithRole, firstNameOf } from "@/components/user-avatar-badge";
import { SCHEDULE_CAL_CLASSNAMES } from "@/pages/mobile/mobile-job-new";
import type { CrmUser } from "@shared/schema";

/** My Tasks — Google-Tasks feel, matched to the CRM Activity page.
 *
 *  Create: the shell "+" mounts the create page as an overlay.
 *  Check-off: same choreography as the CRM — the circle pops, the row
 *  tints and collapses, the task re-materializes under Done.
 *  Detail: a full bottom sheet (no top bar) with inline title/complete,
 *  assignee, the app-standard calendar for due dates, notes, subtasks. */

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high";
  dueAt: string | null;
  assignedToUserId: string | null;
  createdByUserId: string;
  completedAt: string | null;
};

type Subtask = {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
};

type WhoFilter = "me" | "all" | string; // string = a specific user id

// ── Row: top-level + memoized so parent state changes never remount it
// (remounts restart the collapse/pop animations — the CRM lesson). ──
const TaskListRow = memo(function TaskListRow({
  task,
  checking,
  leaving,
  entrance,
  showAssignee,
  assigneeName,
  counts,
  isExpanded,
  onToggle,
  onOpen,
  onToggleExpanded,
  onToggleSubtask,
}: {
  task: TaskRow;
  checking: boolean;
  leaving: boolean;
  entrance?: boolean;
  showAssignee: boolean;
  assigneeName: string | null;
  counts: { total: number; done: number } | undefined;
  isExpanded: boolean;
  onToggle: (t: TaskRow) => void;
  onOpen: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onToggleSubtask: (taskId: string, st: Subtask) => void;
}) {
  const done = task.status === "completed";
  const showDone = done || checking;
  const overdue = !showDone && task.dueAt && isBefore(new Date(task.dueAt), startOfDay(new Date()));
  const { data: rowSubtasks = [] } = useQuery<Subtask[]>({
    queryKey: ["/api/tasks", task.id, "subtasks"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isExpanded,
  });
  return (
    <div
      className={`grid border-b border-slate-200/80 transition-[grid-template-rows,opacity] duration-300 ease-in-out last:border-0 ${
        leaving ? "[grid-template-rows:0fr] opacity-0" : "[grid-template-rows:1fr] opacity-100"
      } ${entrance ? "animate-in fade-in slide-in-from-top-1 duration-300" : ""}`}
      data-testid={`task-row-${task.id}`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={`flex items-start gap-3 px-3.5 py-3 transition-colors duration-300 ${checking ? "bg-emerald-50/70" : ""}`}>
          <button
            onClick={() => onToggle(task)}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              showDone ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent active:border-[#711419]"
            } ${checking ? "animate-[task-check-pop_300ms_cubic-bezier(0.34,1.56,0.64,1)]" : ""}`}
            aria-label={showDone ? "Mark as open" : "Mark as done"}
            data-testid={`task-toggle-${task.id}`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
          <button
            onClick={() => onOpen(task.id)}
            className="min-w-0 flex-1 text-left"
            data-testid={`task-open-${task.id}`}
          >
            <p className={`text-sm font-medium ${showDone ? "text-slate-400 line-through" : "text-slate-900"}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{task.description}</p>
            )}
            <span className="mt-1 flex flex-wrap items-center gap-2">
              {task.dueAt && !showDone && (
                <span
                  className={`inline-block rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {overdue ? "Overdue · " : "Due "}
                  {format(new Date(task.dueAt), "EEE, MMM d")}
                </span>
              )}
              {done && task.completedAt && (
                <span className="inline-block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Done {format(new Date(task.completedAt), "MMM d")}
                </span>
              )}
              {showAssignee && assigneeName && (
                <span className="text-[10px] font-medium text-slate-400">{assigneeName}</span>
              )}
            </span>
          </button>
          {counts && counts.total > 0 && (
            <button
              onClick={() => onToggleExpanded(task.id)}
              className={`mt-0.5 flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                counts.done === counts.total ? "text-emerald-600" : "text-slate-500"
              }`}
              aria-label={isExpanded ? "Hide subtasks" : "Show subtasks"}
              data-testid={`task-subtask-chip-${task.id}`}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {counts.done}/{counts.total}
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </div>
        {/* Subtasks, right on the main screen — check them off in place */}
        {isExpanded && rowSubtasks.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/60 py-1 animate-in fade-in duration-200" data-testid={`task-subtasks-${task.id}`}>
            {rowSubtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-2.5 py-1.5 pl-12 pr-4">
                <button
                  onClick={() => onToggleSubtask(task.id, st)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    st.isCompleted ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent"
                  }`}
                  data-testid={`row-subtask-toggle-${st.id}`}
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${st.isCompleted ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {st.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default function MobileTasks() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [view, setView] = useState<"open" | "done">("open");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [who, setWho] = useState<WhoFilter>("me");
  const [whoOpen, setWhoOpen] = useState(false);
  const [dueFilter, setDueFilter] = useState<"any" | "overdue" | "today" | "custom">("any");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [datesOpen, setDatesOpen] = useState(false);
  const [highOnly, setHighOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());

  // Deep links: a push tap carries ?task=<id> (open that detail sheet);
  // the older ?new=1 link still lands on the create page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("task");
    if (t) {
      window.history.replaceState({}, "", "/mobile/tasks");
      setDetailTaskId(t);
    } else if (params.get("new") === "1") {
      window.history.replaceState({}, "", "/mobile/tasks");
      navigate("/mobile/tasks/new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    queryFn: async () => {
      const res = await fetch("/api/crm/users", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.users || [];
    },
  });
  const userName = (id: string | null | undefined) => users.find((u) => u.id === id)?.name || null;

  const { data: tasks = [], isLoading } = useQuery<TaskRow[]>({
    queryKey: ["/api/tasks", "mobile", who, currentUser?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "300" });
      if (who === "me" && currentUser) params.set("assignedTo", currentUser.id);
      else if (who !== "all" && who !== "me") params.set("assignedTo", who);
      const res = await fetch(`/api/tasks?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      const data = await res.json();
      return Array.isArray(data) ? data : data.tasks || [];
    },
    enabled: !!currentUser,
  });

  // Subtask progress chips — one grouped query, same as the CRM
  const { data: subCountRows = [] } = useQuery<Array<{ taskId: string; total: number; done: number }>>({
    queryKey: ["/api/tasks", "subtask-counts"],
    queryFn: async () => {
      const res = await fetch("/api/tasks/subtask-counts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser,
  });
  const subCounts = new Map(subCountRows.map((r) => [r.taskId, r]));

  const mine = who === "me"
    ? tasks.filter((t) => t.assignedToUserId === currentUser?.id || t.createdByUserId === currentUser?.id)
    : tasks;
  const openTasks = mine
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return 0;
    });
  const doneTasks = mine
    .filter((t) => t.status === "completed")
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  const matchesFilters = (t: TaskRow) => {
    if (highOnly && t.priority !== "high") return false;
    if (dueFilter === "overdue") return !!t.dueAt && t.status !== "completed" && isBefore(new Date(t.dueAt), startOfDay(new Date()));
    if (dueFilter === "today") return !!t.dueAt && isSameDay(new Date(t.dueAt), new Date());
    if (dueFilter === "custom") {
      if (!rangeFrom) return true;
      if (!t.dueAt) return false;
      const d = format(new Date(t.dueAt), "yyyy-MM-dd");
      return d >= rangeFrom && d <= (rangeTo || rangeFrom);
    }
    return true;
  };
  const shown = (view === "open" ? openTasks : doneTasks).filter(matchesFilters);

  // ── Optimistic plumbing (ported from the CRM Activity page) ──
  const snapshotTasks = async () => {
    await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
    return queryClient.getQueriesData({ queryKey: ["/api/tasks"] });
  };
  const restoreTasks = (snapshot: Array<[readonly unknown[], unknown]> | undefined) => {
    (snapshot || []).forEach(([key, data]) => queryClient.setQueryData(key as any, data as any));
  };
  const patchTaskLists = (fn: (tasks: any[]) => any[]) =>
    queryClient.setQueriesData({ queryKey: ["/api/tasks"] }, (old: any) => {
      if (Array.isArray(old)) return fn(old);
      if (old && Array.isArray(old.tasks)) return { ...old, tasks: fn(old.tasks) };
      return old;
    });

  const toggleMutation = useMutation({
    mutationFn: async (task: TaskRow) =>
      apiRequest("PUT", `/api/tasks/${task.id}`, {
        status: task.status === "completed" ? "pending" : "completed",
      }),
    onMutate: async (task) => {
      const snapshot = await snapshotTasks();
      const next = task.status === "completed" ? "pending" : "completed";
      patchTaskLists((rows) =>
        rows.map((x: any) =>
          x.id === task.id
            ? { ...x, status: next, completedAt: next === "completed" ? new Date().toISOString() : null }
            : x,
        ),
      );
      return { snapshot };
    },
    onError: (e: any, _t, ctx) => {
      restoreTasks(ctx?.snapshot);
      toast({ title: "Couldn't update the task", description: e?.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  // Check-off choreography: pop, green linger, collapse, THEN flip the cache
  const completeWithAnimation = (t: TaskRow) => {
    if (checkingIds.has(t.id) || leavingIds.has(t.id)) return;
    setCheckingIds((p) => new Set(p).add(t.id));
    window.setTimeout(() => setLeavingIds((p) => new Set(p).add(t.id)), 450);
    window.setTimeout(() => {
      toggleMutation.mutate(t);
      setCheckingIds((p) => { const n = new Set(p); n.delete(t.id); return n; });
      setLeavingIds((p) => { const n = new Set(p); n.delete(t.id); return n; });
    }, 780);
  };
  const toggleFromRow = (t: TaskRow) => {
    if (t.status === "completed") toggleMutation.mutate(t);
    else completeWithAnimation(t);
  };

  // Subtask toggles from the list — optimistic, no lag
  const rowSubtaskMutation = useMutation({
    mutationFn: async ({ taskId, st }: { taskId: string; st: Subtask }) =>
      apiRequest("PUT", `/api/tasks/${taskId}/subtasks/${st.id}`, { isCompleted: !st.isCompleted }),
    onMutate: async ({ taskId, st }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      const prev = queryClient.getQueryData(["/api/tasks", taskId, "subtasks"]);
      queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], (old: any) =>
        Array.isArray(old) ? old.map((x: Subtask) => (x.id === st.id ? { ...x, isCompleted: !st.isCompleted } : x)) : old,
      );
      queryClient.setQueryData(["/api/tasks", "subtask-counts"], (old: any) =>
        Array.isArray(old)
          ? old.map((r: any) => (r.taskId === taskId ? { ...r, done: r.done + (st.isCompleted ? -1 : 1) } : r))
          : old,
      );
      return { prev };
    },
    onError: (_e, { taskId }, ctx) => {
      queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], ctx?.prev as any);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "subtask-counts"] });
    },
    onSettled: (_d, _e, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "subtask-counts"] });
    },
  });

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const DUE_LABELS = { any: "Any time", overdue: "Overdue", today: "Due today", custom: "Custom range" } as const;
  const whoLabel = who === "me" ? "My tasks" : who === "all" ? "Everyone" : firstNameOf(userName(who)) || "Person";
  const pillLabel = [whoLabel, dueFilter !== "any" ? DUE_LABELS[dueFilter] : "", highOnly ? "High" : ""].filter(Boolean).join(" · ");
  const filterActive = who !== "me" || dueFilter !== "any" || highOnly;

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-tasks-page">
        {/* Open | Done switcher + the filter pill (people filter sheet) */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(["open", "done"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex h-9 flex-1 items-center justify-center rounded-md px-2 text-sm font-semibold capitalize transition-all ${
                  view === v ? "bg-white text-[#711419] shadow-sm" : "text-slate-500"
                }`}
                data-testid={`tasks-view-${v}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFilterOpen(true)}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium shadow-sm transition-transform active:scale-95 ${
              filterActive ? "border-[#711419]/30 bg-[#711419]/5 text-[#711419]" : "border-slate-300/70 bg-white text-slate-700"
            }`}
            aria-label="Filter tasks"
            data-testid="button-task-filter"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="max-w-[38vw] truncate">{pillLabel}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`flex items-start gap-3 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full border-2 border-slate-200" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3.5 w-24 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-[4px] border border-slate-300/70 bg-white py-10 text-center">
            {view === "open" ? (
              <>
                <p className="text-sm font-medium text-slate-600">Nothing on the list</p>
                <p className="mt-0.5 text-xs text-slate-400">Tap + below to add a task.</p>
              </>
            ) : (
              <>
                <ClipboardList className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No finished tasks yet</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
            {shown.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                checking={checkingIds.has(task.id)}
                leaving={leavingIds.has(task.id)}
                entrance={view === "done"}
                showAssignee={who !== "me"}
                assigneeName={firstNameOf(userName(task.assignedToUserId))}
                counts={subCounts.get(task.id)}
                isExpanded={expanded.has(task.id)}
                onToggle={toggleFromRow}
                onOpen={setDetailTaskId}
                onToggleExpanded={toggleExpanded}
                onToggleSubtask={(taskId, st) => rowSubtaskMutation.mutate({ taskId, st })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Filter sheet: one row per filter, each opening its OWN sheet
          so nothing is crowded — people as the Assign-to grid, dates as a
          select with the app's shared custom-range calendar. ── */}
      <DraggableSheet tall open={filterOpen} onOpenChange={setFilterOpen} title="Filter tasks" testid="sheet-task-filter">
        <h2 className="text-lg font-semibold text-slate-900">Filter tasks</h2>
        <div className="mt-1 divide-y divide-slate-200/80">
          <button
            onClick={() => setWhoOpen(true)}
            className="flex w-full items-center justify-between gap-3 px-1 py-4 text-left"
            data-testid="task-filter-who"
          >
            <span className="text-sm font-medium text-slate-700">Assigned to</span>
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-500">
              {who !== "me" && who !== "all" && <AvatarWithRole name={userName(who)} size={20} />}
              <span className="truncate">{whoLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </span>
          </button>
          <SheetSelect
            label="Due"
            value={dueFilter}
            onChange={(k) => {
              setDueFilter(k as typeof dueFilter);
              if (k === "custom") setDatesOpen(true);
            }}
            options={[
              { key: "any", label: "Any time" },
              { key: "overdue", label: "Overdue" },
              { key: "today", label: "Due today" },
              { key: "custom", label: "Custom range" },
            ]}
            testid="task-filter-due"
          />
          {dueFilter === "custom" && (
            <DateRangeSheet
              label="Dates"
              from={rangeFrom}
              to={rangeTo}
              onChange={(f, t) => { setRangeFrom(f); setRangeTo(t); }}
              open={datesOpen}
              onOpenChange={setDatesOpen}
              testid="task-filter-calendar"
            />
          )}
          <div className="flex w-full items-center justify-between gap-3 px-1 py-4" data-testid="task-filter-high">
            <span className="text-sm font-medium text-slate-700">High priority only</span>
            <Switch checked={highOnly} onCheckedChange={setHighOnly} data-testid="task-filter-high-toggle" />
          </div>
        </div>
        {/* Filters apply LIVE behind the sheet — the only action left is
            resetting them; drag down or tap the scrim to leave. */}
        <button
          onClick={() => {
            setWho("me");
            setDueFilter("any");
            setRangeFrom("");
            setRangeTo("");
            setHighOnly(false);
          }}
          disabled={!filterActive}
          className="mb-2 mt-4 h-12 w-full rounded-[4px] border border-slate-300/70 bg-white text-base font-semibold text-slate-700 transition-transform active:scale-[0.98] disabled:opacity-40"
          data-testid="task-filter-clear"
        >
          Clear filters
        </button>
      </DraggableSheet>

      {/* Assigned-to picker — the same tile grid as assigning a task */}
      <DraggableSheet nested tall open={whoOpen} onOpenChange={setWhoOpen} title="Assigned to" testid="sheet-task-filter-who">
        <h2 className="text-lg font-semibold text-slate-900">Whose tasks?</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 pb-2">
          {[
            { key: "me" as WhoFilter, label: "My tasks", sub: "You + created" },
            { key: "all" as WhoFilter, label: "Everyone", sub: "Whole team" },
          ].map((opt) => {
            const selected = who === opt.key;
            return (
              <button
                key={String(opt.key)}
                onClick={() => { setWho(opt.key); setWhoOpen(false); }}
                className={`relative flex flex-col items-center rounded-[4px] border px-1.5 pb-2.5 pt-3 transition-transform active:scale-95 ${
                  selected ? "border-[#711419] bg-[#711419]/5" : "border-slate-300/70 bg-white"
                }`}
                data-testid={`task-filter-${String(opt.key)}`}
              >
                {selected && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#711419] text-white shadow-sm">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <ListChecks className="h-6 w-6 text-slate-500" />
                </span>
                <span className="mt-1.5 w-full truncate text-center text-xs font-semibold text-slate-900">{opt.label}</span>
                <span className="w-full truncate text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">{opt.sub}</span>
              </button>
            );
          })}
          {users
            .filter((u) => u.isActive !== false)
            .sort((a, b) => {
              const rank: Record<string, number> = { owner: 0, admin: 1, supervisor: 2, sales: 3, tech: 4 };
              const ra = rank[a.role] ?? 9;
              const rb = rank[b.role] ?? 9;
              if (ra !== rb) return ra - rb;
              return (a.name || "").localeCompare(b.name || "");
            })
            .map((u) => {
              const selected = who === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => { setWho(u.id); setWhoOpen(false); }}
                  className={`relative flex flex-col items-center rounded-[4px] border px-1.5 pb-2.5 pt-3 transition-transform active:scale-95 ${
                    selected ? "border-[#711419] bg-[#711419]/5" : "border-slate-300/70 bg-white"
                  }`}
                  data-testid={`task-filter-${u.id}`}
                >
                  {selected && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#711419] text-white shadow-sm">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <AvatarWithRole name={u.name} role={u.role} size={56} />
                  <span className="mt-1.5 w-full truncate text-center text-xs font-semibold text-slate-900">{firstNameOf(u.name) || "—"}</span>
                  <span className="w-full truncate text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    {u.id === currentUser?.id ? "You" : u.role}
                  </span>
                </button>
              );
            })}
        </div>
      </DraggableSheet>

      {/* ── Task detail — a full bottom sheet, no top bar ── */}
      {detailTaskId && (
        <TaskDetailSheet
          taskId={detailTaskId}
          users={users}
          meId={currentUser?.id}
          onClose={() => setDetailTaskId(null)}
        />
      )}
    </MobileShell>
  );
}

type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string } | null;
  mentions: { userId: string; userName: string }[];
};

// Desktop comments carry @[userId] mention tokens — show them as name chips.
// (No link like the CRM version: tapping out to a desktop page mid-sheet is worse
// than a plain chip.)
function renderMentionText(body: string, mentions: { userId: string; userName: string }[]) {
  const names = new Map(mentions.map((m) => [m.userId, m.userName]));
  const parts: Array<string | JSX.Element> = [];
  const re = /@\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span key={m.index} className="rounded-[3px] bg-[#711419]/10 px-1 py-0.5 text-[13px] font-medium text-[#711419]">
        @{names.get(m[1]) || "someone"}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.length ? parts : body;
}

function TaskDetailSheet({ taskId, users, meId, onClose }: { taskId: string; users: CrmUser[]; meId?: string; onClose: () => void }) {
  const { toast } = useToast();
  const [newSubtask, setNewSubtask] = useState("");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [checkPop, setCheckPop] = useState(false);
  const keyboardInset = useKeyboardInset();

  const { data: task, isLoading } = useQuery<TaskRow>({
    queryKey: ["/api/tasks", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load the task");
      return res.json();
    },
  });

  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ["/api/tasks", taskId, "subtasks"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Same thread the CRM's task panel shows (entityType "task")
  const [newComment, setNewComment] = useState("");
  const { data: comments = [] } = useQuery<TaskComment[]>({
    queryKey: ["/api/crm/comments", "task", taskId],
  });
  const addComment = useMutation({
    mutationFn: async (body: string) => apiRequest("POST", "/api/crm/comments", { entityType: "task", entityId: taskId, body }),
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", "task", taskId] });
    },
    onError: (e: any) => toast({ title: "Couldn't post the comment", description: e?.message, variant: "destructive" }),
  });

  const patchTask = useMutation({
    mutationFn: async (changes: Record<string, unknown>) => apiRequest("PUT", `/api/tasks/${taskId}`, changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", taskId] });
      const prev = queryClient.getQueryData(["/api/tasks", taskId]);
      queryClient.setQueryData(["/api/tasks", taskId], (old: any) => (old ? { ...old, ...changes } : old));
      return { prev };
    },
    onError: (e: any, _c, ctx) => {
      queryClient.setQueryData(["/api/tasks", taskId], ctx?.prev as any);
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
    },
  });

  const addSubtask = useMutation({
    mutationFn: async (title: string) => apiRequest("POST", `/api/tasks/${taskId}/subtasks`, { title }),
    onMutate: async (title) => {
      setNewSubtask("");
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      const prev = queryClient.getQueryData(["/api/tasks", taskId, "subtasks"]);
      queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], (old: any) =>
        Array.isArray(old) ? [...old, { id: `temp-${Date.now()}`, taskId, title, isCompleted: false }] : old,
      );
      return { prev, title };
    },
    onError: (e: any, _t, ctx) => {
      queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], ctx?.prev as any);
      setNewSubtask(ctx?.title || "");
      toast({ title: "Couldn't add the subtask", description: e?.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "subtask-counts"] });
    },
  });

  const toggleSubtask = useMutation({
    mutationFn: async (st: Subtask) =>
      apiRequest("PUT", `/api/tasks/${taskId}/subtasks/${st.id}`, { isCompleted: !st.isCompleted }),
    onMutate: async (st) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      const prev = queryClient.getQueryData(["/api/tasks", taskId, "subtasks"]);
      queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], (old: any) =>
        Array.isArray(old) ? old.map((x: Subtask) => (x.id === st.id ? { ...x, isCompleted: !st.isCompleted } : x)) : old,
      );
      return { prev };
    },
    onError: (_e, _st, ctx) => queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], ctx?.prev as any),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "subtask-counts"] });
    },
  });

  const deleteSubtask = useMutation({
    mutationFn: async (st: Subtask) => apiRequest("DELETE", `/api/tasks/${taskId}/subtasks/${st.id}`),
    onMutate: async (st) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      const prev = queryClient.getQueryData(["/api/tasks", taskId, "subtasks"]);
      queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], (old: any) =>
        Array.isArray(old) ? old.filter((x: Subtask) => x.id !== st.id) : old,
      );
      return { prev };
    },
    onError: (_e, _st, ctx) => queryClient.setQueryData(["/api/tasks", taskId, "subtasks"], ctx?.prev as any),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", "subtask-counts"] });
    },
  });

  const done = task?.status === "completed";
  const toggleDone = () => {
    if (!task) return;
    setCheckPop(true);
    window.setTimeout(() => setCheckPop(false), 350);
    patchTask.mutate({ status: done ? "pending" : "completed" });
  };

  return (
    <DraggableSheet full open onOpenChange={(o) => { if (!o) onClose(); }} title="Task" testid="task-detail">
      {isLoading || !task ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div
          className="space-y-4"
          style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : 24 }}
        >
          {/* Title row: the complete circle lives right beside the title —
              no top bar, the sheet handle is the chrome */}
          <div className="flex items-start gap-3">
            <button
              onClick={toggleDone}
              disabled={patchTask.isPending}
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                done ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent active:border-[#711419]"
              } ${checkPop ? "animate-[task-check-pop_300ms_cubic-bezier(0.34,1.56,0.64,1)]" : ""}`}
              aria-label={done ? "Reopen" : "Complete"}
              data-testid="task-detail-complete"
            >
              <Check className="h-4 w-4" strokeWidth={3} />
            </button>
            <h2 className={`min-w-0 flex-1 text-xl font-semibold leading-snug ${done ? "text-slate-400 line-through" : "text-slate-900"}`} data-testid="task-detail-title">
              {task.title}
            </h2>
          </div>

          {/* Assignee + due date */}
          <div className="flex flex-wrap items-center gap-2">
            <AssigneeSheet
              variant="chip"
              users={users}
              meId={meId}
              value={task.assignedToUserId}
              onChange={(v) => patchTask.mutate({ assignedToUserId: v })}
              testid="task-detail-assignee"
            />
            <button
              onClick={() => setDueOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 active:scale-95"
              data-testid="task-detail-due"
            >
              <CalendarDays className="h-4 w-4 text-slate-400" />
              {task.dueAt ? format(new Date(task.dueAt), "EEE, MMM d") : "Add due date"}
            </button>
          </div>

          {/* Notes */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</p>
            <textarea
              value={notesDraft ?? task.description ?? ""}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== null && notesDraft !== (task.description ?? "")) {
                  patchTask.mutate({ description: notesDraft || null });
                }
              }}
              placeholder="Add details…"
              rows={3}
              className="w-full resize-y rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
              data-testid="task-detail-notes"
            />
          </div>

          {/* Subtasks — optimistic add/toggle/delete, new rows ease in */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Subtasks{subtasks.length > 0 ? ` · ${subtasks.filter((s) => s.isCompleted).length}/${subtasks.length}` : ""}
            </p>
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {subtasks.map((st, i) => (
                <div
                  key={st.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 animate-in fade-in duration-200 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                  data-testid={`subtask-${st.id}`}
                >
                  <button
                    onClick={() => toggleSubtask.mutate(st)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      st.isCompleted ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent"
                    }`}
                    data-testid={`subtask-toggle-${st.id}`}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </button>
                  <span className={`min-w-0 flex-1 text-sm ${st.isCompleted ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {st.title}
                  </span>
                  <button
                    onClick={() => deleteSubtask.mutate(st)}
                    className="text-slate-300 active:text-red-500"
                    aria-label="Delete subtask"
                    data-testid={`subtask-delete-${st.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className={`flex items-center gap-2.5 px-3 py-2.5 ${subtasks.length > 0 ? "border-t border-slate-200/80" : ""}`}>
                <ListPlus className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSubtask.trim()) addSubtask.mutate(newSubtask.trim());
                  }}
                  placeholder="Add a subtask…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  data-testid="subtask-new-input"
                />
                {newSubtask.trim() && (
                  <button
                    onClick={() => addSubtask.mutate(newSubtask.trim())}
                    className="rounded-full bg-[#711419] p-1.5 text-white transition-transform active:scale-90"
                    aria-label="Add subtask"
                    data-testid="subtask-add"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Comments — the same thread the CRM's task panel shows */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Comments{comments.length > 0 ? ` · ${comments.length}` : ""}
            </p>
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {comments.map((c, i) => (
                <div key={c.id} className={`px-3 py-2.5 ${i > 0 ? "border-t border-slate-200/80" : ""}`} data-testid={`task-comment-${c.id}`}>
                  <p className="text-xs text-slate-400">
                    <span className="font-semibold text-slate-600">{c.author?.name || "Someone"}</span>
                    {" · "}
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {renderMentionText(c.body, c.mentions || [])}
                  </p>
                </div>
              ))}
              <div className={`flex items-center gap-2.5 px-3 py-2.5 ${comments.length > 0 ? "border-t border-slate-200/80" : ""}`}>
                <MessageSquare className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newComment.trim()) addComment.mutate(newComment.trim());
                  }}
                  placeholder="Add a comment…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  data-testid="task-comment-input"
                />
                {newComment.trim() && (
                  <button
                    onClick={() => addComment.mutate(newComment.trim())}
                    disabled={addComment.isPending}
                    className="rounded-full bg-[#711419] p-1.5 text-white transition-transform active:scale-90"
                    aria-label="Post comment"
                    data-testid="task-comment-post"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Due date — the app-standard calendar in a nested sheet */}
      <DraggableSheet nested tall open={dueOpen} onOpenChange={setDueOpen} title="Due date" testid="sheet-task-due">
        <h2 className="text-lg font-semibold text-slate-900">When is it due?</h2>
        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300 ease-out px-0.5" style={{ touchAction: "pan-y" }}>
          <Calendar
            mode="single"
            selected={task?.dueAt ? new Date(task.dueAt) : undefined}
            onSelect={(date) => {
              // Patch optimistically so the picked day LIGHTS UP, linger a
              // beat so the choice reads, then the sheet rides down normally.
              patchTask.mutate({ dueAt: date ? `${format(date, "yyyy-MM-dd")}T12:00:00` : null });
              window.setTimeout(() => setDueOpen(false), 250);
            }}
            numberOfMonths={1}
            className="w-full p-0"
            fixedWeeks
            classNames={SCHEDULE_CAL_CLASSNAMES}
          />
        </div>
        {task?.dueAt && (
          <button
            onClick={() => {
              patchTask.mutate({ dueAt: null });
              setDueOpen(false);
            }}
            className="mb-2 mt-4 h-11 w-full rounded-[4px] border border-slate-300/70 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50"
            data-testid="task-due-clear"
          >
            Clear due date
          </button>
        )}
      </DraggableSheet>
    </DraggableSheet>
  );
}
