import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  FileQuestion,
  CheckCircle,
  Type,
  Hash,
  List,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  serviceCallTypeEnum,
  checklistQuestionTypeEnum,
  type CrmUser,
  type ServiceCallChecklist,
  type ChecklistQuestion,
  type ServiceCallType,
  type ChecklistQuestionType,
} from "@shared/schema";

type ChecklistWithQuestions = ServiceCallChecklist & {
  questions: ChecklistQuestion[];
};

const SERVICE_TYPE_LABELS: Record<ServiceCallType, string> = {
  NO_HEAT: "No Heat",
  NO_AC: "No AC",
  WATER_LEAK: "Water Leak",
  STRANGE_NOISE: "Strange Noise",
  THERMOSTAT_ISSUE: "Thermostat Issue",
  MAINTENANCE: "Maintenance",
  INSTALL: "Install",
  DUCT_WORK: "Duct Work",
  OTHER: "Other",
};

const SERVICE_TYPE_COLORS: Record<ServiceCallType, string> = {
  NO_HEAT: "bg-red-100 text-red-700",
  NO_AC: "bg-blue-100 text-blue-700",
  WATER_LEAK: "bg-cyan-100 text-cyan-700",
  STRANGE_NOISE: "bg-amber-100 text-amber-700",
  THERMOSTAT_ISSUE: "bg-purple-100 text-purple-700",
  MAINTENANCE: "bg-green-100 text-green-700",
  INSTALL: "bg-indigo-100 text-indigo-700",
  DUCT_WORK: "bg-slate-100 text-slate-700",
  OTHER: "bg-gray-100 text-gray-700",
};

const QUESTION_TYPE_LABELS: Record<ChecklistQuestionType, string> = {
  yes_no: "Yes/No",
  text: "Text",
  number: "Number",
  select: "Select",
};

const QUESTION_TYPE_ICONS: Record<ChecklistQuestionType, React.ReactNode> = {
  yes_no: <CheckCircle className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  select: <List className="h-4 w-4" />,
};

interface ChecklistsSectionProps {
  currentUser: CrmUser;
  isAdmin: boolean;
}

export function ChecklistsSection({ currentUser, isAdmin }: ChecklistsSectionProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistWithQuestions | null>(null);
  const [showCreateChecklistDialog, setShowCreateChecklistDialog] = useState(false);
  const [showEditChecklistDialog, setShowEditChecklistDialog] = useState(false);
  const [showDeleteChecklistDialog, setShowDeleteChecklistDialog] = useState(false);
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [showDeleteQuestionDialog, setShowDeleteQuestionDialog] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ChecklistQuestion | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<ChecklistQuestion | null>(null);

  const [checklistForm, setChecklistForm] = useState({
    name: "",
    serviceType: "NO_HEAT" as ServiceCallType,
    description: "",
    isActive: true,
  });

  const [questionForm, setQuestionForm] = useState({
    question: "",
    questionType: "text" as ChecklistQuestionType,
    isRequired: false,
    sortOrder: 0,
    options: "",
    helpText: "",
  });

  const { data: checklists = [], isLoading: checklistsLoading } = useQuery<ChecklistWithQuestions[]>({
    queryKey: ["/api/crm/checklists"],
    enabled: !!currentUser,
  });

  const createChecklistMutation = useMutation({
    mutationFn: async (data: typeof checklistForm) => {
      const res = await apiRequest("POST", "/api/crm/checklists", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/checklists"] });
      toast({ title: "Checklist created successfully" });
      setShowCreateChecklistDialog(false);
      resetChecklistForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create checklist",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateChecklistMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof checklistForm }) => {
      const res = await apiRequest("PUT", `/api/crm/checklists/${id}`, data);
      return res.json();
    },
    onSuccess: (updatedChecklist) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/checklists"] });
      toast({ title: "Checklist updated successfully" });
      setShowEditChecklistDialog(false);
      if (selectedChecklist) {
        setSelectedChecklist({ ...selectedChecklist, ...updatedChecklist });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update checklist",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteChecklistMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/checklists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/checklists"] });
      toast({ title: "Checklist deleted successfully" });
      setShowDeleteChecklistDialog(false);
      setSelectedChecklist(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete checklist",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const createQuestionMutation = useMutation({
    mutationFn: async ({ checklistId, data }: { checklistId: string; data: any }) => {
      const res = await apiRequest("POST", `/api/crm/checklists/${checklistId}/questions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/checklists"] });
      toast({ title: "Question added successfully" });
      setShowQuestionDialog(false);
      resetQuestionForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add question",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ questionId, data }: { questionId: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/crm/checklists/questions/${questionId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/checklists"] });
      toast({ title: "Question updated successfully" });
      setShowQuestionDialog(false);
      setEditingQuestion(null);
      resetQuestionForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update question",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      await apiRequest("DELETE", `/api/crm/checklists/questions/${questionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/checklists"] });
      toast({ title: "Question deleted successfully" });
      setShowDeleteQuestionDialog(false);
      setDeletingQuestion(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete question",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (selectedChecklist && checklists.length > 0) {
      const updated = checklists.find((c) => c.id === selectedChecklist.id);
      if (updated) {
        setSelectedChecklist(updated);
      }
    }
  }, [checklists, selectedChecklist?.id]);

  const resetChecklistForm = () => {
    setChecklistForm({
      name: "",
      serviceType: "NO_HEAT",
      description: "",
      isActive: true,
    });
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      question: "",
      questionType: "text",
      isRequired: false,
      sortOrder: 0,
      options: "",
      helpText: "",
    });
  };

  const groupedChecklists = useMemo(() => {
    const filtered = checklists.filter((c) =>
      c.name.toLowerCase().includes(searchInput.toLowerCase()) ||
      SERVICE_TYPE_LABELS[c.serviceType].toLowerCase().includes(searchInput.toLowerCase())
    );

    const grouped: Record<ServiceCallType, ChecklistWithQuestions[]> = {} as any;
    serviceCallTypeEnum.forEach((type) => {
      grouped[type] = [];
    });

    filtered.forEach((checklist) => {
      if (grouped[checklist.serviceType]) {
        grouped[checklist.serviceType].push(checklist);
      }
    });

    return grouped;
  }, [checklists, searchInput]);

  const openEditChecklistDialog = () => {
    if (selectedChecklist) {
      setChecklistForm({
        name: selectedChecklist.name,
        serviceType: selectedChecklist.serviceType,
        description: selectedChecklist.description || "",
        isActive: selectedChecklist.isActive,
      });
      setShowEditChecklistDialog(true);
    }
  };

  const openAddQuestionDialog = () => {
    setEditingQuestion(null);
    const maxSortOrder = selectedChecklist?.questions.reduce(
      (max, q) => Math.max(max, q.sortOrder),
      0
    ) || 0;
    setQuestionForm({
      question: "",
      questionType: "text",
      isRequired: false,
      sortOrder: maxSortOrder + 1,
      options: "",
      helpText: "",
    });
    setShowQuestionDialog(true);
  };

  const openEditQuestionDialog = (question: ChecklistQuestion) => {
    setEditingQuestion(question);
    setQuestionForm({
      question: question.question,
      questionType: question.questionType,
      isRequired: question.isRequired,
      sortOrder: question.sortOrder,
      options: question.options?.join(", ") || "",
      helpText: question.helpText || "",
    });
    setShowQuestionDialog(true);
  };

  const handleSaveQuestion = () => {
    if (!selectedChecklist) return;

    const data = {
      question: questionForm.question,
      questionType: questionForm.questionType,
      isRequired: questionForm.isRequired,
      sortOrder: questionForm.sortOrder,
      helpText: questionForm.helpText || null,
      options:
        questionForm.questionType === "select" && questionForm.options
          ? questionForm.options.split(",").map((o) => o.trim()).filter(Boolean)
          : null,
    };

    if (editingQuestion) {
      updateQuestionMutation.mutate({ questionId: editingQuestion.id, data });
    } else {
      createQuestionMutation.mutate({ checklistId: selectedChecklist.id, data });
    }
  };

  const handleMoveQuestion = (question: ChecklistQuestion, direction: "up" | "down") => {
    if (!selectedChecklist) return;

    const questions = [...selectedChecklist.questions].sort((a, b) => a.sortOrder - b.sortOrder);
    const currentIndex = questions.findIndex((q) => q.id === question.id);

    if (
      (direction === "up" && currentIndex === 0) ||
      (direction === "down" && currentIndex === questions.length - 1)
    ) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetQuestion = questions[targetIndex];

    updateQuestionMutation.mutate({
      questionId: question.id,
      data: { sortOrder: targetQuestion.sortOrder },
    });
    updateQuestionMutation.mutate({
      questionId: targetQuestion.id,
      data: { sortOrder: question.sortOrder },
    });
  };

  return (
    <>
      <Card className="mb-6">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-slate-600" />
                  <div className="text-left">
                    <CardTitle>Service Call Checklists</CardTitle>
                    <CardDescription>
                      {isAdmin
                        ? "Manage checklist templates for different service call types."
                        : "View checklist templates for service calls."}
                    </CardDescription>
                  </div>
                </div>
                <ChevronRight className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search checklists..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-checklists-section"
                  />
                </div>
                {isAdmin && (
                  <Button
                    onClick={() => {
                      resetChecklistForm();
                      setShowCreateChecklistDialog(true);
                    }}
                    className="bg-[#711419] hover:bg-[#8a1a1f]"
                    data-testid="button-create-checklist-section"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Checklist
                  </Button>
                )}
              </div>

              <div className="flex gap-4">
                <div className="w-72 border rounded-lg bg-slate-50">
                  <ScrollArea className="h-80">
                    {checklistsLoading ? (
                      <div className="p-4 space-y-4">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : (
                      <div className="p-2">
                        {serviceCallTypeEnum.map((serviceType) => {
                          const typeChecklists = groupedChecklists[serviceType];
                          if (typeChecklists.length === 0) return null;

                          return (
                            <div key={serviceType} className="mb-3">
                              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                {SERVICE_TYPE_LABELS[serviceType]}
                              </div>
                              {typeChecklists.map((checklist) => (
                                <div
                                  key={checklist.id}
                                  onClick={() => setSelectedChecklist(checklist)}
                                  className={`p-2 rounded-md cursor-pointer mb-1 transition-colors ${
                                    selectedChecklist?.id === checklist.id
                                      ? "bg-[#711419] text-white"
                                      : "hover:bg-slate-100"
                                  }`}
                                  data-testid={`checklist-section-item-${checklist.id}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm truncate">{checklist.name}</span>
                                    {!checklist.isActive && (
                                      <Badge variant="outline" className="text-xs ml-1">
                                        Inactive
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5 text-xs opacity-75">
                                    <FileQuestion className="h-3 w-3" />
                                    <span>{checklist.questions?.length || 0} questions</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}

                        {Object.values(groupedChecklists).every((g) => g.length === 0) && (
                          <div className="text-center py-6 text-muted-foreground">
                            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No checklists found</p>
                          </div>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <div className="flex-1 border rounded-lg bg-white p-4 min-h-80">
                  {selectedChecklist ? (
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold" data-testid="text-selected-checklist-name">
                              {selectedChecklist.name}
                            </h3>
                            <Badge className={SERVICE_TYPE_COLORS[selectedChecklist.serviceType]}>
                              {SERVICE_TYPE_LABELS[selectedChecklist.serviceType]}
                            </Badge>
                            {!selectedChecklist.isActive && (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </div>
                          {selectedChecklist.description && (
                            <p className="text-sm text-muted-foreground">{selectedChecklist.description}</p>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={openEditChecklistDialog}
                              data-testid="button-edit-checklist-section"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowDeleteChecklistDialog(true)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid="button-delete-checklist-section"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm">Questions</h4>
                        {isAdmin && (
                          <Button
                            size="sm"
                            onClick={openAddQuestionDialog}
                            className="bg-[#711419] hover:bg-[#8a1a1f]"
                            data-testid="button-add-question-section"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Question
                          </Button>
                        )}
                      </div>

                      <ScrollArea className="h-48">
                        {selectedChecklist.questions.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <FileQuestion className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No questions yet</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {[...selectedChecklist.questions]
                              .sort((a, b) => a.sortOrder - b.sortOrder)
                              .map((question, index, arr) => (
                                <div
                                  key={question.id}
                                  className="flex items-center gap-2 p-2 border rounded-md hover:bg-slate-50"
                                  data-testid={`question-section-item-${question.id}`}
                                >
                                  {isAdmin && (
                                    <div className="flex flex-col gap-0.5">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        disabled={index === 0}
                                        onClick={() => handleMoveQuestion(question, "up")}
                                      >
                                        <ChevronUp className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        disabled={index === arr.length - 1}
                                        onClick={() => handleMoveQuestion(question, "down")}
                                      >
                                        <ChevronDown className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}

                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{question.question}</span>
                                      {question.isRequired && (
                                        <Badge variant="secondary" className="text-xs">
                                          Required
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        {QUESTION_TYPE_ICONS[question.questionType]}
                                        {QUESTION_TYPE_LABELS[question.questionType]}
                                      </span>
                                      {question.questionType === "select" && question.options && (
                                        <span>({question.options.length} options)</span>
                                      )}
                                    </div>
                                  </div>

                                  {isAdmin && (
                                    <div className="flex gap-0.5">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => openEditQuestionDialog(question)}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          setDeletingQuestion(question);
                                          setShowDeleteQuestionDialog(true);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Select a checklist to view</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={showCreateChecklistDialog} onOpenChange={setShowCreateChecklistDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Checklist</DialogTitle>
            <DialogDescription>
              Create a new checklist template for service calls.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="checklist-name">Name</Label>
              <Input
                id="checklist-name"
                placeholder="e.g., No Heat Diagnostic Checklist"
                value={checklistForm.name}
                onChange={(e) => setChecklistForm({ ...checklistForm, name: e.target.value })}
                data-testid="input-checklist-name-section"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checklist-serviceType">Service Type</Label>
              <Select
                value={checklistForm.serviceType}
                onValueChange={(value) =>
                  setChecklistForm({ ...checklistForm, serviceType: value as ServiceCallType })
                }
              >
                <SelectTrigger data-testid="select-service-type-section">
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {serviceCallTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {SERVICE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checklist-description">Description (optional)</Label>
              <Textarea
                id="checklist-description"
                placeholder="Brief description of this checklist..."
                value={checklistForm.description}
                onChange={(e) =>
                  setChecklistForm({ ...checklistForm, description: e.target.value })
                }
                data-testid="input-checklist-description-section"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateChecklistDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createChecklistMutation.mutate(checklistForm)}
              disabled={!checklistForm.name || createChecklistMutation.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-save-checklist-section"
            >
              {createChecklistMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditChecklistDialog} onOpenChange={setShowEditChecklistDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Checklist</DialogTitle>
            <DialogDescription>Update the checklist details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-checklist-name">Name</Label>
              <Input
                id="edit-checklist-name"
                value={checklistForm.name}
                onChange={(e) => setChecklistForm({ ...checklistForm, name: e.target.value })}
                data-testid="input-edit-checklist-name-section"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-checklist-serviceType">Service Type</Label>
              <Select
                value={checklistForm.serviceType}
                onValueChange={(value) =>
                  setChecklistForm({ ...checklistForm, serviceType: value as ServiceCallType })
                }
              >
                <SelectTrigger data-testid="select-edit-service-type-section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceCallTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {SERVICE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-checklist-description">Description</Label>
              <Textarea
                id="edit-checklist-description"
                value={checklistForm.description}
                onChange={(e) =>
                  setChecklistForm({ ...checklistForm, description: e.target.value })
                }
                data-testid="input-edit-checklist-description-section"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-checklist-active"
                checked={checklistForm.isActive}
                onCheckedChange={(checked) =>
                  setChecklistForm({ ...checklistForm, isActive: checked as boolean })
                }
                data-testid="checkbox-checklist-active-section"
              />
              <Label htmlFor="edit-checklist-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditChecklistDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedChecklist &&
                updateChecklistMutation.mutate({ id: selectedChecklist.id, data: checklistForm })
              }
              disabled={!checklistForm.name || updateChecklistMutation.isPending}
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-update-checklist-section"
            >
              {updateChecklistMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteChecklistDialog} onOpenChange={setShowDeleteChecklistDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedChecklist?.name}" and all its questions. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedChecklist && deleteChecklistMutation.mutate(selectedChecklist.id)
              }
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-checklist-section"
            >
              {deleteChecklistMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQuestion ? "Edit Question" : "Add Question"}</DialogTitle>
            <DialogDescription>
              {editingQuestion
                ? "Update the question details."
                : "Add a new question to this checklist."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="question-text">Question</Label>
              <Input
                id="question-text"
                placeholder="Enter the question..."
                value={questionForm.question}
                onChange={(e) => setQuestionForm({ ...questionForm, question: e.target.value })}
                data-testid="input-question-text-section"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-type">Question Type</Label>
              <Select
                value={questionForm.questionType}
                onValueChange={(value) =>
                  setQuestionForm({ ...questionForm, questionType: value as ChecklistQuestionType })
                }
              >
                <SelectTrigger data-testid="select-question-type-section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {checklistQuestionTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        {QUESTION_TYPE_ICONS[type]}
                        {QUESTION_TYPE_LABELS[type]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {questionForm.questionType === "select" && (
              <div className="space-y-2">
                <Label htmlFor="question-options">Options (comma-separated)</Label>
                <Input
                  id="question-options"
                  placeholder="Option 1, Option 2, Option 3"
                  value={questionForm.options}
                  onChange={(e) => setQuestionForm({ ...questionForm, options: e.target.value })}
                  data-testid="input-question-options-section"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="question-sort-order">Sort Order</Label>
              <Input
                id="question-sort-order"
                type="number"
                value={questionForm.sortOrder}
                onChange={(e) =>
                  setQuestionForm({ ...questionForm, sortOrder: parseInt(e.target.value) || 0 })
                }
                data-testid="input-question-sort-order-section"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-help-text">Help Text (optional)</Label>
              <Input
                id="question-help-text"
                placeholder="Additional guidance for this question..."
                value={questionForm.helpText}
                onChange={(e) => setQuestionForm({ ...questionForm, helpText: e.target.value })}
                data-testid="input-question-help-text-section"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="question-required"
                checked={questionForm.isRequired}
                onCheckedChange={(checked) =>
                  setQuestionForm({ ...questionForm, isRequired: checked as boolean })
                }
                data-testid="checkbox-question-required-section"
              />
              <Label htmlFor="question-required">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowQuestionDialog(false);
                setEditingQuestion(null);
                resetQuestionForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveQuestion}
              disabled={
                !questionForm.question ||
                createQuestionMutation.isPending ||
                updateQuestionMutation.isPending
              }
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              data-testid="button-save-question-section"
            >
              {(createQuestionMutation.isPending || updateQuestionMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingQuestion ? "Save Changes" : "Add Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteQuestionDialog} onOpenChange={setShowDeleteQuestionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this question. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeletingQuestion(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingQuestion && deleteQuestionMutation.mutate(deletingQuestion.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-question-section"
            >
              {deleteQuestionMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
