import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, isBefore, startOfDay } from "date-fns";
import MobileShell from "./mobile-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { Check, CheckCircle2, ClipboardList, Loader2, Plus } from "lucide-react";
import type { CrmUser } from "@shared/schema";

/** My Tasks — a clean mobile surface over the CRM tasks system, scoped to the
 *  signed-in user. Create for yourself, check things off, see what's due. */

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

export default function MobileTasks() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [view, setView] = useState<"open" | "done">("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // Legacy deep-link: creation now lives on its own page.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      navigate("/mobile/tasks/new", { replace: true });
    }
  }, [navigate]);

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

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/tasks", {
        title: title.trim(),
        description: notes.trim() || null,
        dueAt: dueDate ? `${dueDate}T12:00:00` : null,
        assignedToUserId: currentUser!.id,
        createdByUserId: currentUser!.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task added" });
      setCreateOpen(false);
      setTitle("");
      setDueDate("");
      setNotes("");
    },
    onError: (e: any) => toast({ title: "Couldn't add the task", description: e?.message, variant: "destructive" }),
  });

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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#711419]" />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-[4px] border border-slate-300/70 bg-white py-10 text-center">
            {view === "open" ? (
              <>
                <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-500" />
                <p className="text-sm font-medium text-slate-600">Nothing on your list</p>
                <p className="mt-0.5 text-xs text-slate-400">Tap + to add a task for yourself.</p>
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
                  <div className="min-w-0 flex-1">
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clean create sheet — title, optional due date, optional notes */}
      <DraggableSheet tall open={createOpen} onOpenChange={(o) => !createMutation.isPending && setCreateOpen(o)} title="New task" testid="sheet-new-task">
        <h2 className="text-lg font-semibold text-slate-900">New task</h2>
        <p className="mt-0.5 text-sm text-slate-500">For you — it lands on your CRM task list too.</p>
        <div className="mt-4 space-y-3.5">
            <div>
              <Label htmlFor="task-title" className="mb-1.5 block">What needs doing?</Label>
              <Input
                id="task-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Order the capacitor for Bluewater"
                data-testid="task-title-input"
              />
            </div>
            <div>
              <Label htmlFor="task-due" className="mb-1.5 block">Due date (optional)</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="task-due-input"
              />
            </div>
            <div>
              <Label htmlFor="task-notes" className="mb-1.5 block">Notes (optional)</Label>
              <Textarea
                id="task-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details worth remembering..."
                data-testid="task-notes-input"
              />
            </div>
            <Button
              className="h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold hover:bg-[#8a1a1f]"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || title.trim().length === 0}
              data-testid="task-create-save"
            >
              {createMutation.isPending ? <Loader2 className="mr-1.5 h-5 w-5 animate-spin" /> : <Plus className="mr-1.5 h-5 w-5" />}
              Add task
            </Button>
          </div>
      </DraggableSheet>
    </MobileShell>
  );
}
