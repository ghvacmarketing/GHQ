import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import { RoleBadge } from "@/components/mobile/role-badge";
import type { CrmUser } from "@shared/schema";

/** New Task — the same full-page bottom sheet as creating a customer or job:
 *  grab handle, floating X, bottom Create button. Assign to anyone on the
 *  team (defaults to yourself). */
export default function MobileTaskNew() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

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

  const effectiveAssignee = assigneeId || currentUser?.id || null;
  const team = users.filter((u) => u.isActive !== false);

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/tasks", {
        title: title.trim(),
        description: notes.trim() || null,
        dueAt: dueDate ? `${dueDate}T12:00:00` : null,
        assignedToUserId: effectiveAssignee,
        createdByUserId: currentUser!.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created" });
      navigate("/mobile/tasks");
    },
    onError: (e: any) => toast({ title: "Couldn't add the task", description: e?.message, variant: "destructive" }),
  });

  const dirty = title.trim().length > 0 || dueDate.length > 0 || notes.trim().length > 0 || !!assigneeId;

  return (
    <MobileCreatePage
      title="New task"
      dirty={dirty}
      exitTo="/mobile/tasks"
      onSave={() => createMutation.mutate()}
      saveLabel="Create task"
      saveDisabled={title.trim().length === 0 || !currentUser}
      saving={createMutation.isPending}
      testid="mobile-task-new-page"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="task-title" className="mb-1.5 block">What needs doing?</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Order the capacitor for Bluewater"
            data-testid="task-title-input"
          />
        </div>

        <div>
          <Label className="mb-1.5 block">Assign to</Label>
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="task-assignee-list">
            {team.map((u, i) => {
              const selected = u.id === effectiveAssignee;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setAssigneeId(u.id === currentUser?.id ? null : u.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${i > 0 ? "border-t border-slate-200/80" : ""} ${
                    selected ? "bg-[#711419]/[0.04]" : "active:bg-slate-50"
                  }`}
                  data-testid={`task-assignee-${u.id}`}
                >
                  <RoleBadge role={(u as any).role} className="h-8 w-8" />
                  <span className={`min-w-0 flex-1 truncate text-sm ${selected ? "font-semibold text-[#711419]" : "text-slate-800"}`}>
                    {u.name}{u.id === currentUser?.id ? " (me)" : ""}
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                </button>
              );
            })}
          </div>
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
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any details worth remembering..."
            data-testid="task-notes-input"
          />
        </div>
      </div>
    </MobileCreatePage>
  );
}
