import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, ChevronRight, ClipboardList, X } from "lucide-react";
import MobileShell from "./mobile-shell";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { visitTypeBadge } from "@/pages/mobile/mobile-work-orders";
import type { ServiceCallChecklist, ChecklistQuestion, ChecklistPhotoStep } from "@shared/schema";

/** Checklist Gallery — a read-only tour of every checklist template: what
 *  each one covers, step by step, and which work-order type + subtype it
 *  attaches to. Editing lives in CRM Settings → Checklists; this page is
 *  strictly for looking. */

type ChecklistWithSteps = ServiceCallChecklist & {
  questions: ChecklistQuestion[];
  photoSteps: ChecklistPhotoStep[];
};

const VISIT_ORDER = ["SERVICE", "MAINTENANCE", "INSTALL", "SALES"] as const;

const VISIT_LABELS: Record<string, string> = {
  SERVICE: "Service",
  MAINTENANCE: "Maintenance",
  INSTALL: "Install",
  SALES: "Sales",
};

/** NO_HEAT → "No Heat" */
const humanize = (s?: string | null) =>
  (s || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const questionTypeLabel = (t?: string | null) => {
  const map: Record<string, string> = {
    text: "Text",
    yes_no: "Yes / No",
    number: "Number",
    select: "Pick one",
    multiselect: "Pick any",
    checkbox: "Check-off",
    photo: "Photo",
  };
  return map[(t || "").toLowerCase()] || humanize(t);
};

export default function MobileChecklists() {
  const [viewing, setViewing] = useState<ChecklistWithSteps | null>(null);

  const { data: checklists = [], isLoading } = useQuery<ChecklistWithSteps[]>({
    queryKey: ["/api/crm/checklists"],
    queryFn: async () => {
      const res = await fetch("/api/crm/checklists", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const groups = VISIT_ORDER
    .map((vt) => ({
      visitType: vt,
      items: checklists.filter((c) => (c.visitType || "SERVICE") === vt),
    }))
    .filter((g) => g.items.length > 0);

  // Steps grouped by their canvas section, in sort order — the same phases
  // techs see when filling the checklist on a job.
  const sectionsOf = (c: ChecklistWithSteps) => {
    const bySection = new Map<string, ChecklistQuestion[]>();
    for (const q of c.questions) {
      const key = q.section || "";
      const arr = bySection.get(key) ?? [];
      arr.push(q);
      bySection.set(key, arr);
    }
    return Array.from(bySection.entries());
  };

  return (
    <MobileShell>
      <div className="space-y-5 p-4 pb-6" data-testid="mobile-checklists-page">
        <div className="pt-1">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Checklist Gallery</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            What each job type's checklist covers. View only — templates are edited in CRM Settings.
          </p>
        </div>

        {isLoading ? (
          <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`space-y-2 px-3.5 py-3 ${i > 1 ? "border-t border-slate-200/80" : ""}`}>
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-56" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-slate-300 bg-white py-10 text-center" data-testid="checklists-empty">
            <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No checklist templates yet</p>
            <p className="mt-0.5 text-xs text-slate-400">They're built in CRM Settings → Checklists.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.visitType}>
              <div className="mb-2 flex items-center gap-2">
                <img src={visitTypeBadge(group.visitType)} alt="" className="h-7 w-7 select-none" draggable={false} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {VISIT_LABELS[group.visitType] || humanize(group.visitType)} visits
                </h3>
              </div>
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                {group.items.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => setViewing(c)}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""} ${c.isActive ? "" : "opacity-55"}`}
                    data-testid={`checklist-row-${c.id}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{c.name}</span>
                        {!c.isActive && (
                          <span className="shrink-0 rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Inactive
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {[
                          humanize(c.serviceType),
                          `${c.questions.length} step${c.questions.length === 1 ? "" : "s"}`,
                          c.photoSteps.length > 0 ? `${c.photoSteps.length} photo${c.photoSteps.length === 1 ? "" : "s"}` : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Template viewer — the full step-by-step, strictly read-only */}
      <DraggableSheet full open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }} title="Checklist template" testid="checklist-view-sheet">
        <button
          onClick={() => setViewing(null)}
          className="absolute right-4 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform active:scale-90"
          aria-label="Close"
          data-testid="checklist-view-close"
        >
          <X className="h-5 w-5" />
        </button>
        {viewing && (
          <div className="space-y-4 pb-6" data-testid="checklist-view">
            <div className="pr-10">
              <div className="flex items-center gap-2.5">
                <img src={visitTypeBadge(viewing.visitType)} alt="" className="h-9 w-9 shrink-0 select-none" draggable={false} />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">{viewing.name}</h2>
                  <p className="text-xs text-slate-500">
                    {VISIT_LABELS[viewing.visitType] || humanize(viewing.visitType)} · {humanize(viewing.serviceType)}
                    {!viewing.isActive && " · Inactive"}
                  </p>
                </div>
              </div>
              {viewing.description && (
                <p className="mt-2 text-sm text-slate-600">{viewing.description}</p>
              )}
              <p className="mt-2 rounded-[4px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Techs get this checklist automatically on {VISIT_LABELS[viewing.visitType]?.toLowerCase() || "matching"} jobs
                with the {humanize(viewing.serviceType)} subtype. View only — edits happen in CRM Settings → Checklists.
              </p>
            </div>

            {/* Steps, phase by phase */}
            {viewing.questions.length === 0 ? (
              <p className="rounded-[4px] border border-dashed border-slate-300 bg-white py-6 text-center text-sm text-slate-400">
                No steps in this template yet.
              </p>
            ) : (
              sectionsOf(viewing).map(([section, questions], gi) => (
                <div key={section || `section-${gi}`} className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                  <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {section || (sectionsOf(viewing).length > 1 ? "General" : "Steps")}
                  </p>
                  {questions.map((q, i) => (
                    <div
                      key={q.id}
                      className={`px-3.5 py-3 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                      data-testid={`checklist-step-${q.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                          {q.question}
                          {q.isRequired && <span className="ml-1 text-[#711419]">*</span>}
                        </p>
                        <span className="shrink-0 rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {questionTypeLabel(q.questionType)}
                        </span>
                      </div>
                      {q.helpText && <p className="mt-1 text-xs text-slate-500">{q.helpText}</p>}
                      {Array.isArray(q.options) && q.options.length > 0 && (
                        <p className="mt-1 text-xs text-slate-400">Options: {q.options.join(" · ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}

            {/* Required photo captures */}
            {viewing.photoSteps.length > 0 && (
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white">
                <p className="border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Photo steps
                </p>
                {viewing.photoSteps.map((ps, i) => (
                  <div
                    key={ps.id}
                    className={`flex items-start gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                    data-testid={`checklist-photo-${ps.id}`}
                  >
                    <span className="shrink-0 rounded-[3px] bg-[#711419]/[0.08] p-2">
                      <Camera className="h-4 w-4 text-[#711419]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {ps.label}
                        {ps.isRequired && <span className="ml-1 text-[#711419]">*</span>}
                      </p>
                      {ps.instructions && <p className="mt-0.5 text-xs text-slate-500">{ps.instructions}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-center text-xs text-slate-400">
              <span className="text-[#711419]">*</span> required step
            </p>
          </div>
        )}
      </DraggableSheet>
    </MobileShell>
  );
}
