import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import { AssigneeSheet } from "@/components/mobile/assignee-sheet";
import { DateSheet } from "@/components/mobile/date-range-calendar";
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
          <AssigneeSheet
            users={users}
            meId={currentUser?.id}
            value={effectiveAssignee}
            onChange={(v) => setAssigneeId(v === currentUser?.id ? null : v)}
            testid="task-assignee-trigger"
          />
        </div>

        <div>
          <Label className="mb-1.5 block">Due date (optional)</Label>
          <DateSheet
            boxed
            minToday
            label="Due date"
            placeholder="Pick a day"
            value={dueDate}
            onChange={setDueDate}
            testid="task-due-input"
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
