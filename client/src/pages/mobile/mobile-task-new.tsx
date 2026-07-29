import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import type { CrmUser } from "@shared/schema";

/** New Task — standalone page. Creates a task assigned to the signed-in user
 *  (lands on their CRM task list too), then returns to the task list. */
export default function MobileTaskNew() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

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
      toast({ title: "Task created", description: "It's on your task list." });
      navigate("/mobile/tasks");
    },
    onError: (e: any) => toast({ title: "Couldn't add the task", description: e?.message, variant: "destructive" }),
  });

  const dirty = title.trim().length > 0 || dueDate.length > 0 || notes.trim().length > 0;

  return (
    <MobileCreatePage
      title="New task"
      dirty={dirty}
      exitTo="/mobile/tasks"
      onSave={() => createMutation.mutate()}
      saveDisabled={title.trim().length === 0 || !currentUser}
      saving={createMutation.isPending}
      testid="mobile-task-new-page"
    >
      <div className="space-y-3.5">
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
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any details worth remembering..."
            data-testid="task-notes-input"
          />
        </div>
        <Button
          className="h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold hover:bg-[#8a1a1f]"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || title.trim().length === 0 || !currentUser}
          data-testid="task-create-save"
        >
          {createMutation.isPending ? <Loader2 className="mr-1.5 h-5 w-5 animate-spin" /> : <Plus className="mr-1.5 h-5 w-5" />}
          Create task
        </Button>
      </div>
    </MobileCreatePage>
  );
}
