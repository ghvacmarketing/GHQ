import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, Phone, Trash2, Calendar, Edit2, Check, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { MiscCall } from "@shared/schema";

export default function MiscCalls() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCallerName, setNewCallerName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCallerName, setEditCallerName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data: calls = [], isLoading } = useQuery<MiscCall[]>({
    queryKey: ["/api/misc-calls"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { callerName: string; description: string }) => {
      return apiRequest("POST", "/api/misc-calls", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/misc-calls"] });
      setNewCallerName("");
      setNewDescription("");
      setIsAddOpen(false);
      toast({ title: "Call added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add call", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; callerName?: string; description?: string; status?: string }) => {
      return apiRequest("PATCH", `/api/misc-calls/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/misc-calls"] });
      setEditingId(null);
      toast({ title: "Call updated" });
    },
    onError: () => {
      toast({ title: "Failed to update call", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/misc-calls/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/misc-calls"] });
      toast({ title: "Call deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete call", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!newCallerName.trim()) {
      toast({ title: "Please enter caller name", variant: "destructive" });
      return;
    }
    createMutation.mutate({ callerName: newCallerName.trim(), description: newDescription.trim() });
  };

  const startEdit = (call: MiscCall) => {
    setEditingId(call.id);
    setEditCallerName(call.callerName);
    setEditDescription(call.description || "");
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, callerName: editCallerName, description: editDescription });
  };

  const toggleStatus = (call: MiscCall) => {
    const nextStatus = call.status === "NEW" ? "IN_PROGRESS" : call.status === "IN_PROGRESS" ? "RESOLVED" : "NEW";
    updateMutation.mutate({ id: call.id, status: nextStatus });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "NEW": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "IN_PROGRESS": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "RESOLVED": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const activeCalls = calls.filter(c => c.status !== "RESOLVED");
  const resolvedCalls = calls.filter(c => c.status === "RESOLVED");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Phone className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Sales Misc. Calls</h1>
            </div>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-call">
                <Plus className="h-4 w-4 mr-1" />
                Add Call
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Call</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Caller Name</label>
                  <Input
                    placeholder="Enter caller name..."
                    value={newCallerName}
                    onChange={(e) => setNewCallerName(e.target.value)}
                    data-testid="input-caller-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Issue Description</label>
                  <Textarea
                    placeholder="Describe the issue..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={4}
                    data-testid="input-description"
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={createMutation.isPending}
                  className="w-full"
                  data-testid="button-submit-call"
                >
                  {createMutation.isPending ? "Adding..." : "Add Call"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : calls.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No calls yet. Click "Add Call" to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {activeCalls.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  Active Calls
                  <Badge variant="secondary">{activeCalls.length}</Badge>
                </h2>
                <div className="space-y-3">
                  {activeCalls.map((call) => (
                    <Card key={call.id} className="overflow-hidden" data-testid={`card-call-${call.id}`}>
                      <CardContent className="p-4">
                        {editingId === call.id ? (
                          <div className="space-y-3">
                            <Input
                              value={editCallerName}
                              onChange={(e) => setEditCallerName(e.target.value)}
                              placeholder="Caller name"
                              data-testid={`input-edit-caller-${call.id}`}
                            />
                            <Textarea
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Description"
                              rows={3}
                              data-testid={`input-edit-description-${call.id}`}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => saveEdit(call.id)}
                                disabled={updateMutation.isPending}
                                data-testid={`button-save-edit-${call.id}`}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingId(null)}
                                data-testid={`button-cancel-edit-${call.id}`}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base" data-testid={`text-caller-name-${call.id}`}>
                                  {call.callerName}
                                </h3>
                                {call.description && (
                                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap" data-testid={`text-description-${call.id}`}>
                                    {call.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {call.createdAt && format(new Date(call.createdAt), "MMM d, yyyy h:mm a")}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <Badge
                                  className={`cursor-pointer ${getStatusColor(call.status)}`}
                                  onClick={() => toggleStatus(call)}
                                  data-testid={`badge-status-${call.id}`}
                                >
                                  {call.status.replace("_", " ")}
                                </Badge>
                                <div className="flex gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => startEdit(call)}
                                    data-testid={`button-edit-${call.id}`}
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => deleteMutation.mutate(call.id)}
                                    data-testid={`button-delete-${call.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {resolvedCalls.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
                  Resolved
                  <Badge variant="outline">{resolvedCalls.length}</Badge>
                </h2>
                <div className="space-y-3 opacity-70">
                  {resolvedCalls.map((call) => (
                    <Card key={call.id} className="overflow-hidden" data-testid={`card-call-${call.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base line-through" data-testid={`text-caller-name-${call.id}`}>
                              {call.callerName}
                            </h3>
                            {call.description && (
                              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                                {call.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`cursor-pointer ${getStatusColor(call.status)}`}
                              onClick={() => toggleStatus(call)}
                              data-testid={`badge-status-${call.id}`}
                            >
                              RESOLVED
                            </Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteMutation.mutate(call.id)}
                              data-testid={`button-delete-${call.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
