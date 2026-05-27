import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Search,
  FileQuestion,
  CheckCircle,
  XCircle,
  Type,
  Hash,
  List,
  GripVertical,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import {
  serviceCallTypeEnum,
  checklistQuestionTypeEnum,
  checklistVisitTypeEnum,
  type CrmUser,
  type ServiceCallChecklist,
  type ChecklistQuestion,
  type ServiceCallType,
  type ChecklistQuestionType,
  type ChecklistVisitType,
  type WorkOrderSubtype,
} from "@shared/schema";

type ChecklistWithQuestions = ServiceCallChecklist & {
  questions: ChecklistQuestion[];
};

const VISIT_TYPE_LABELS: Record<ChecklistVisitType, string> = {
  SERVICE: "Service",
  INSTALL: "Install",
  SALES: "Sales",
  MAINTENANCE: "Maintenance",
};

const SUBTYPE_LABELS: Record<string, string> = {
  NO_HEAT: "No Heat",
  NO_AC: "No AC",
  WATER_LEAK: "Water Leak",
  STRANGE_NOISE: "Strange Noise",
  THERMOSTAT_ISSUE: "Thermostat Issue",
  NEW_SYSTEM: "New System",
  REPLACEMENT: "Replacement",
  DUCT_WORK: "Duct Work",
  ESTIMATE: "Estimate",
  CONSULTATION: "Consultation",
  FOLLOW_UP: "Follow Up",
  PREVENTATIVE: "Preventative",
  INSPECTION: "Inspection",
  TUNE_UP: "Tune Up",
  OTHER: "Other",
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

export default function CrmChecklists() {
  usePageTitle("Checklists");
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
    visitType: "SERVICE" as ChecklistVisitType,
    serviceType: "NO_HEAT" as string,
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

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: checklists = [], isLoading: checklistsLoading } = useQuery<ChecklistWithQuestions[]>({
    queryKey: ["/api/crm/checklists"],
    enabled: !!currentUser,
  });

  const { data: workOrderSubtypes = [] } = useQuery<WorkOrderSubtype[]>({
    queryKey: ["/api/crm/work-order-subtypes", { activeOnly: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/crm/work-order-subtypes?activeOnly=true");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const getSubtypesForVisitType = (visitType: ChecklistVisitType) => {
    return workOrderSubtypes
      .filter(s => s.visitType === visitType)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  };

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
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

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
      visitType: "SERVICE" as ChecklistVisitType,
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
    const filtered = checklists.filter((c) => {
      const cAny = c as any;
      const visitTypeLabel = cAny.visitType ? VISIT_TYPE_LABELS[cAny.visitType as ChecklistVisitType] : "";
      return c.name.toLowerCase().includes(searchInput.toLowerCase()) ||
        SERVICE_TYPE_LABELS[c.serviceType]?.toLowerCase().includes(searchInput.toLowerCase()) ||
        visitTypeLabel?.toLowerCase().includes(searchInput.toLowerCase());
    });

    const grouped: Record<ChecklistVisitType, ChecklistWithQuestions[]> = {
      SERVICE: [],
      INSTALL: [],
      SALES: [],
      MAINTENANCE: [],
    };

    filtered.forEach((checklist) => {
      const visitType = ((checklist as any).visitType || "SERVICE") as ChecklistVisitType;
      grouped[visitType].push(checklist);
    });

    return grouped;
  }, [checklists, searchInput]);

  const openEditChecklistDialog = () => {
    if (selectedChecklist) {
      setChecklistForm({
        name: selectedChecklist.name,
        visitType: (selectedChecklist as any).visitType || "SERVICE" as ChecklistVisitType,
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

  if (authLoading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-auth">
        <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
      </div>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="flex h-[calc(100vh-4rem)] lg:h-screen bg-slate-50/50">
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
          <div className="px-5 pt-5 pb-4">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 -ml-2 h-8 text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/crm/settings")}
              data-testid="button-back-to-settings"
            >
              <ChevronDown className="h-4 w-4 mr-1 rotate-90" />
              Back to Settings
            </Button>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                  Checklists
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {checklists.length} total
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  resetChecklistForm();
                  setShowCreateChecklistDialog(true);
                }}
                className="bg-[#711419] hover:bg-[#8a1a1f] h-8"
                data-testid="button-create-checklist"
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search checklists..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9 bg-slate-50 border-slate-200 focus-visible:bg-white"
                data-testid="input-search-checklists"
              />
            </div>
          </div>

          <ScrollArea className="flex-1 border-t border-slate-100">
            {checklistsLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="px-3 py-3">
                {checklistVisitTypeEnum.map((visitType) => {
                  const typeChecklists = groupedChecklists[visitType];
                  if (typeChecklists.length === 0) return null;

                  return (
                    <div key={visitType} className="mb-5 last:mb-0">
                      <div className="px-2 mb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                        {VISIT_TYPE_LABELS[visitType]}
                      </div>
                      <div className="space-y-0.5">
                        {typeChecklists.map((checklist) => {
                          const isSelected = selectedChecklist?.id === checklist.id;
                          return (
                            <button
                              key={checklist.id}
                              onClick={() => setSelectedChecklist(checklist)}
                              className={`w-full text-left px-3 py-2.5 rounded-md transition-all relative group ${
                                isSelected
                                  ? "bg-[#711419]/5 text-slate-900"
                                  : "hover:bg-slate-50 text-slate-700"
                              }`}
                              data-testid={`checklist-item-${checklist.id}`}
                            >
                              {isSelected && (
                                <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#711419] rounded-r-full" />
                              )}
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm truncate ${isSelected ? "font-semibold" : "font-medium"}`}>
                                  {checklist.name}
                                </span>
                                {!checklist.isActive && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0 border-slate-300 text-slate-500">
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                                <span className="truncate">
                                  {SUBTYPE_LABELS[checklist.serviceType] || checklist.serviceType}
                                </span>
                                <span className="text-slate-300">·</span>
                                <span>{checklist.questions?.length || 0} {checklist.questions?.length === 1 ? "question" : "questions"}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {Object.values(groupedChecklists).every((g) => g.length === 0) && (
                  <div className="text-center py-12 px-4 text-muted-foreground">
                    <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <ClipboardList className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">No checklists found</p>
                    <p className="text-xs mt-1">Create a new checklist to get started</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex-1 overflow-auto">
          {selectedChecklist ? (
            <div className="max-w-4xl mx-auto px-8 py-8">
              <div className="flex items-start justify-between mb-8 gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <span>
                      {VISIT_TYPE_LABELS[((selectedChecklist as any).visitType || "SERVICE") as ChecklistVisitType]}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                      {SUBTYPE_LABELS[selectedChecklist.serviceType] || selectedChecklist.serviceType}
                    </span>
                    {!selectedChecklist.isActive && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-600">Inactive</span>
                      </>
                    )}
                  </div>
                  <h1
                    className="text-2xl font-semibold tracking-tight text-slate-900"
                    data-testid="text-checklist-name"
                  >
                    {selectedChecklist.name}
                  </h1>
                  {selectedChecklist.description && (
                    <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{selectedChecklist.description}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openEditChecklistDialog}
                    className="h-8 border-slate-200"
                    data-testid="button-edit-checklist"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteChecklistDialog(true)}
                    className="h-8 border-slate-200 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                    data-testid="button-delete-checklist"
                    aria-label="Delete checklist"
                    title="Delete checklist"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Questions</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedChecklist.questions.length} {selectedChecklist.questions.length === 1 ? "question" : "questions"} in this checklist
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={openAddQuestionDialog}
                    className="bg-[#711419] hover:bg-[#8a1a1f] h-8"
                    data-testid="button-add-question"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Question
                  </Button>
                </div>
                {selectedChecklist.questions.length === 0 ? (
                  <div className="text-center py-16 px-4 text-muted-foreground">
                    <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <FileQuestion className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">No questions yet</p>
                    <p className="text-xs mt-1">Add a question to start building this checklist</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {[...selectedChecklist.questions]
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((question, index, arr) => (
                        <div
                          key={question.id}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 group focus-within:bg-slate-50/60 transition-colors"
                          data-testid={`question-item-${question.id}`}
                        >
                          <div className="flex flex-col -my-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-slate-400 hover:text-slate-700"
                              disabled={index === 0}
                              onClick={() => handleMoveQuestion(question, "up")}
                              data-testid={`button-move-up-${question.id}`}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-slate-400 hover:text-slate-700"
                              disabled={index === arr.length - 1}
                              onClick={() => handleMoveQuestion(question, "down")}
                              data-testid={`button-move-down-${question.id}`}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500 shrink-0">
                            {QUESTION_TYPE_ICONS[question.questionType]}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900 truncate">{question.question}</span>
                              {question.isRequired && (
                                <span className="text-[10px] font-semibold text-[#711419] uppercase tracking-wide shrink-0">
                                  Required
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                              <span>{QUESTION_TYPE_LABELS[question.questionType]}</span>
                              {question.questionType === "select" && question.options && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span>{question.options.length} options</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-slate-900"
                              onClick={() => openEditQuestionDialog(question)}
                              data-testid={`button-edit-question-${question.id}`}
                              aria-label="Edit question"
                              title="Edit question"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => {
                                setDeletingQuestion(question);
                                setShowDeleteQuestionDialog(true);
                              }}
                              data-testid={`button-delete-question-${question.id}`}
                              aria-label="Delete question"
                              title="Delete question"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <ClipboardList className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">Select a checklist</p>
                <p className="text-xs mt-1">Choose one from the left to view and edit</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreateChecklistDialog} onOpenChange={setShowCreateChecklistDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Checklist</DialogTitle>
            <DialogDescription>
              Create a new checklist template for work orders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., No Heat Diagnostic Checklist"
                value={checklistForm.name}
                onChange={(e) => setChecklistForm({ ...checklistForm, name: e.target.value })}
                data-testid="input-checklist-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="visitType">Work Order Type</Label>
              <Select
                value={checklistForm.visitType}
                onValueChange={(value) => {
                  const newVisitType = value as ChecklistVisitType;
                  const subtypes = getSubtypesForVisitType(newVisitType);
                  setChecklistForm({ 
                    ...checklistForm, 
                    visitType: newVisitType,
                    serviceType: subtypes[0]?.subtype || "Other"
                  });
                }}
              >
                <SelectTrigger data-testid="select-visit-type">
                  <SelectValue placeholder="Select work order type" />
                </SelectTrigger>
                <SelectContent>
                  {checklistVisitTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {VISIT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceType">Subtype</Label>
              <Select
                value={checklistForm.serviceType}
                onValueChange={(value) =>
                  setChecklistForm({ ...checklistForm, serviceType: value })
                }
              >
                <SelectTrigger data-testid="select-service-type">
                  <SelectValue placeholder="Select subtype" />
                </SelectTrigger>
                <SelectContent>
                  {getSubtypesForVisitType(checklistForm.visitType).length > 0 ? (
                    getSubtypesForVisitType(checklistForm.visitType).map((s) => (
                      <SelectItem key={s.id} value={s.subtype}>
                        {s.subtype}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Other">Other</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this checklist..."
                value={checklistForm.description}
                onChange={(e) =>
                  setChecklistForm({ ...checklistForm, description: e.target.value })
                }
                data-testid="input-checklist-description"
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
              data-testid="button-save-checklist"
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
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={checklistForm.name}
                onChange={(e) => setChecklistForm({ ...checklistForm, name: e.target.value })}
                data-testid="input-edit-checklist-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-visitType">Work Order Type</Label>
              <Select
                value={checklistForm.visitType}
                onValueChange={(value) => {
                  const newVisitType = value as ChecklistVisitType;
                  const subtypes = getSubtypesForVisitType(newVisitType);
                  setChecklistForm({ 
                    ...checklistForm, 
                    visitType: newVisitType,
                    serviceType: subtypes[0]?.subtype || "Other"
                  });
                }}
              >
                <SelectTrigger data-testid="select-edit-visit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {checklistVisitTypeEnum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {VISIT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-serviceType">Subtype</Label>
              <Select
                value={checklistForm.serviceType}
                onValueChange={(value) =>
                  setChecklistForm({ ...checklistForm, serviceType: value })
                }
              >
                <SelectTrigger data-testid="select-edit-service-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getSubtypesForVisitType(checklistForm.visitType).length > 0 ? (
                    getSubtypesForVisitType(checklistForm.visitType).map((s) => (
                      <SelectItem key={s.id} value={s.subtype}>
                        {s.subtype}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Other">Other</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={checklistForm.description}
                onChange={(e) =>
                  setChecklistForm({ ...checklistForm, description: e.target.value })
                }
                data-testid="input-edit-checklist-description"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={checklistForm.isActive}
                onCheckedChange={(checked) =>
                  setChecklistForm({ ...checklistForm, isActive: checked as boolean })
                }
                data-testid="checkbox-checklist-active"
              />
              <Label htmlFor="edit-active">Active</Label>
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
              data-testid="button-update-checklist"
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
              data-testid="button-confirm-delete-checklist"
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
              <Label htmlFor="question">Question</Label>
              <Input
                id="question"
                placeholder="Enter the question..."
                value={questionForm.question}
                onChange={(e) => setQuestionForm({ ...questionForm, question: e.target.value })}
                data-testid="input-question-text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="questionType">Question Type</Label>
              <Select
                value={questionForm.questionType}
                onValueChange={(value) =>
                  setQuestionForm({ ...questionForm, questionType: value as ChecklistQuestionType })
                }
              >
                <SelectTrigger data-testid="select-question-type">
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
                <Label htmlFor="options">Options (comma-separated)</Label>
                <Input
                  id="options"
                  placeholder="Option 1, Option 2, Option 3"
                  value={questionForm.options}
                  onChange={(e) => setQuestionForm({ ...questionForm, options: e.target.value })}
                  data-testid="input-question-options"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={questionForm.sortOrder}
                onChange={(e) =>
                  setQuestionForm({ ...questionForm, sortOrder: parseInt(e.target.value) || 0 })
                }
                data-testid="input-question-sort-order"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="helpText">Help Text (optional)</Label>
              <Input
                id="helpText"
                placeholder="Additional guidance for this question..."
                value={questionForm.helpText}
                onChange={(e) => setQuestionForm({ ...questionForm, helpText: e.target.value })}
                data-testid="input-question-help-text"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isRequired"
                checked={questionForm.isRequired}
                onCheckedChange={(checked) =>
                  setQuestionForm({ ...questionForm, isRequired: checked as boolean })
                }
                data-testid="checkbox-question-required"
              />
              <Label htmlFor="isRequired">Required</Label>
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
              data-testid="button-save-question"
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
              data-testid="button-confirm-delete-question"
            >
              {deleteQuestionMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
