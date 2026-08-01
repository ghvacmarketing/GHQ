import { useEffect, useRef, useState } from "react";
import { MobileSpinner } from "@/components/mobile/mobile-spinner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, isBefore, startOfDay } from "date-fns";
import MobileShell from "./mobile-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, ArrowUp, Calendar, Check, CheckCircle2, ClipboardList, ListPlus,
  Loader2, Plus, Trash2, UserRound,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";

/** My Tasks.
 *
 *  Create: the full-page bottom sheet at /mobile/tasks/new — same shell as
 *  creating a customer or job.
 *  Detail: tap any task for the fullscreen view — status, assignee, due
 *  date, notes, and subtasks, all editable in place. */

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

export default function MobileTasks() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [view, setView] = useState<"open" | "done">("open");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

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

  // Deep link: "+" → the full-page create sheet
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      window.history.replaceState({}, "", "/mobile/tasks");
      navigate("/mobile/tasks/new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: tasks = [], isLoading } = useQuery<TaskRow[]>({
    queryKey: ["/api/tasks", "mine", currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?assignedTo=${currentUser!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      const data = await res.json();
      return Array.isArray(data) ? data : data.tasks || [];
    },
    enabled: !!currentUser,
  });

  const mine = tasks.filter((t) => t.assignedToUserId === currentUser?.id || t.createdByUserId === currentUser?.id);
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
  const shown = view === "open" ? openTasks : doneTasks;

  const toggleMutation = useMutation({
    mutationFn: async (task: TaskRow) =>
      apiRequest("PUT", `/api/tasks/${task.id}`, {
        status: task.status === "completed" ? "pending" : "completed",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
    onError: (e: any) => toast({ title: "Couldn't update the task", description: e?.message, variant: "destructive" }),
  });

  const today = startOfDay(new Date());

  return (
    <MobileShell>
      <div className="p-4 space-y-4" data-testid="mobile-tasks-page">
        {/* Open | Done switcher, New pinned right */}
        <div className="relative flex items-center justify-center">
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(["open", "done"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all ${
                  view === v ? "bg-white text-[#711419] shadow-sm" : "text-slate-500"
                }`}
                data-testid={`tasks-view-${v}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate("/mobile/tasks/new")}
            className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-[4px] bg-[#711419] text-white transition-transform active:scale-95"
            aria-label="New task"
            data-testid="button-new-task"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <MobileSpinner fullHeight={false} />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-[4px] border border-slate-300/70 bg-white py-10 text-center">
            {view === "open" ? (
              <>
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500" />
                <p className="text-sm font-medium text-slate-600">Nothing on your list</p>
                <p className="mt-0.5 text-xs text-slate-400">Tap + to add a task.</p>
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
            {shown.map((task, i) => {
              const done = task.status === "completed";
              const overdue = !done && task.dueAt && isBefore(new Date(task.dueAt), today);
              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                  data-testid={`task-row-${task.id}`}
                >
                  <button
                    onClick={() => toggleMutation.mutate(task)}
                    disabled={toggleMutation.isPending}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      done ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent active:border-[#711419]"
                    }`}
                    aria-label={done ? "Mark as open" : "Mark as done"}
                    data-testid={`task-toggle-${task.id}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDetailTaskId(task.id)}
                    className="min-w-0 flex-1 text-left"
                    data-testid={`task-open-${task.id}`}
                  >
                    <p className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{task.description}</p>
                    )}
                    {task.dueAt && !done && (
                      <span
                        className={`mt-1 inline-block rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {overdue ? "Overdue · " : "Due "}
                        {format(new Date(task.dueAt), "EEE, MMM d")}
                      </span>
                    )}
                    {done && task.completedAt && (
                      <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        Done {format(new Date(task.completedAt), "MMM d")}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Fullscreen task detail — everything the CRM has ── */}
      {detailTaskId && (
        <TaskDetail
          taskId={detailTaskId}
          users={users}
          onClose={() => setDetailTaskId(null)}
        />
      )}
    </MobileShell>
  );
}

function TaskDetail({ taskId, users, onClose }: { taskId: string; users: CrmUser[]; onClose: () => void }) {
  const { toast } = useToast();
  const [newSubtask, setNewSubtask] = useState("");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const dueRef = useRef<HTMLInputElement | null>(null);

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

  const patchTask = useMutation({
    mutationFn: async (changes: Record<string, unknown>) => apiRequest("PUT", `/api/tasks/${taskId}`, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const addSubtask = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/tasks/${taskId}/subtasks`, { title: newSubtask.trim() }),
    onSuccess: () => {
      setNewSubtask("");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] });
    },
    onError: (e: any) => toast({ title: "Couldn't add the subtask", description: e?.message, variant: "destructive" }),
  });

  const toggleSubtask = useMutation({
    mutationFn: async (st: Subtask) =>
      apiRequest("PUT", `/api/tasks/${taskId}/subtasks/${st.id}`, { isCompleted: !st.isCompleted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] }),
  });

  const deleteSubtask = useMutation({
    mutationFn: async (st: Subtask) => apiRequest("DELETE", `/api/tasks/${taskId}/subtasks/${st.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "subtasks"] }),
  });

  const done = task?.status === "completed";
  const assignee = users.find((u) => u.id === task?.assignedToUserId);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50 animate-in slide-in-from-right duration-200" data-testid="task-detail">
      <div
        className="flex items-center gap-2 border-b bg-white px-2 py-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100" data-testid="task-detail-back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">Task</p>
        {task && (
          <button
            onClick={() => patchTask.mutate({ status: done ? "pending" : "completed" })}
            disabled={patchTask.isPending}
            className={`mr-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              done ? "bg-slate-100 text-slate-600" : "bg-[#711419] text-white"
            }`}
            data-testid="task-detail-complete"
          >
            {done ? "Reopen" : "Complete"}
          </button>
        )}
      </div>

      {isLoading || !task ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-10 space-y-4">
          <h2 className={`text-xl font-semibold leading-snug ${done ? "text-slate-400 line-through" : "text-slate-900"}`} data-testid="task-detail-title">
            {task.title}
          </h2>

          {/* Assignee + due — same chips as creation */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">
              <UserRound className="h-4 w-4 text-slate-400" />
              {assignee?.name || "Unassigned"}
            </div>
            <button
              onClick={() => dueRef.current?.showPicker?.() || dueRef.current?.click()}
              className="relative flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              data-testid="task-detail-due"
            >
              <Calendar className="h-4 w-4 text-slate-400" />
              {task.dueAt ? format(new Date(task.dueAt), "EEE, MMM d") : "Add due date"}
              <input
                ref={dueRef}
                type="date"
                value={task.dueAt ? format(new Date(task.dueAt), "yyyy-MM-dd") : ""}
                onChange={(e) => patchTask.mutate({ dueAt: e.target.value ? `${e.target.value}T12:00:00` : null })}
                className="absolute inset-0 opacity-0"
                tabIndex={-1}
              />
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
              className="w-full resize-y rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#711419]"
              data-testid="task-detail-notes"
            />
          </div>

          {/* Subtasks */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Subtasks{subtasks.length > 0 ? ` · ${subtasks.filter((s) => s.isCompleted).length}/${subtasks.length}` : ""}
            </p>
            <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
              {subtasks.map((st, i) => (
                <div key={st.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${i > 0 ? "border-t border-slate-200/80" : ""}`} data-testid={`subtask-${st.id}`}>
                  <button
                    onClick={() => toggleSubtask.mutate(st)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      st.isCompleted ? "border-[#711419] bg-[#711419] text-white" : "border-slate-300 text-transparent"
                    }`}
                    data-testid={`subtask-toggle-${st.id}`}
                  >
                    <Check className="h-3 w-3" />
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
                    if (e.key === "Enter" && newSubtask.trim()) addSubtask.mutate();
                  }}
                  placeholder="Add a subtask…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  data-testid="subtask-new-input"
                />
                {newSubtask.trim() && (
                  <button
                    onClick={() => addSubtask.mutate()}
                    disabled={addSubtask.isPending}
                    className="rounded-full bg-[#711419] p-1.5 text-white"
                    aria-label="Add subtask"
                    data-testid="subtask-add"
                  >
                    {addSubtask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
