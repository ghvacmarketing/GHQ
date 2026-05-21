import type {
  RebateProgramType,
  RebateApplicationStatus,
  RebateWorkflowStep,
  RebateWorkflowStepStatus,
  RebatePriority,
  RebateDocumentCategory,
} from "@shared/schema";

export const PROGRAM_TYPE_LABELS: Record<RebateProgramType, string> = {
  HEAR: "HEAR (Home Electrification & Appliance Rebate)",
  HER: "HER (Home Efficiency Rebate)",
};

export const PROGRAM_TYPE_SHORT: Record<RebateProgramType, string> = {
  HEAR: "HEAR",
  HER: "HER",
};

export const APPLICATION_STATUS_LABELS: Record<RebateApplicationStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting_on_customer: "Waiting on Customer",
  waiting_on_neighborly: "Waiting on Neighborly",
  waiting_on_utility: "Waiting on Utility",
  scope_needed: "Scope Needed",
  scope_submitted: "Scope Submitted",
  scope_approved: "Scope Approved",
  completion_submitted: "Completion Submitted",
  completion_approved: "Completion Approved",
  approved: "Approved",
  paid: "Paid",
  declined: "Declined",
  not_interested: "Not Interested",
  on_hold: "On Hold",
  closed: "Closed",
};

export const APPLICATION_STATUS_OPTIONS: RebateApplicationStatus[] = [
  "not_started",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_neighborly",
  "waiting_on_utility",
  "scope_needed",
  "scope_submitted",
  "scope_approved",
  "completion_submitted",
  "completion_approved",
  "approved",
  "paid",
  "declined",
  "not_interested",
  "on_hold",
  "closed",
];

export const APPLICATION_STATUS_COLORS: Record<RebateApplicationStatus, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  waiting_on_customer: "bg-orange-100 text-orange-700 border-orange-200",
  waiting_on_neighborly: "bg-orange-100 text-orange-700 border-orange-200",
  waiting_on_utility: "bg-orange-100 text-orange-700 border-orange-200",
  scope_needed: "bg-red-100 text-red-700 border-red-200",
  scope_submitted: "bg-purple-100 text-purple-700 border-purple-200",
  scope_approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completion_submitted: "bg-purple-100 text-purple-700 border-purple-200",
  completion_approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  paid: "bg-green-200 text-green-800 border-green-300",
  declined: "bg-slate-800 text-white border-slate-900",
  not_interested: "bg-slate-800 text-white border-slate-900",
  on_hold: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-slate-700 text-white border-slate-800",
};

export const APPLICATION_STATUS_ROW_BG: Record<RebateApplicationStatus, string> = {
  not_started: "",
  in_progress: "",
  waiting_on_customer: "bg-orange-50/40",
  waiting_on_neighborly: "bg-orange-50/40",
  waiting_on_utility: "bg-orange-50/40",
  scope_needed: "bg-red-50/40",
  scope_submitted: "bg-purple-50/40",
  scope_approved: "bg-emerald-50/40",
  completion_submitted: "bg-purple-50/40",
  completion_approved: "bg-emerald-50/40",
  approved: "bg-green-50/40",
  paid: "bg-green-50/60",
  declined: "bg-slate-100/60 text-slate-500",
  not_interested: "bg-slate-100/60 text-slate-500",
  on_hold: "bg-amber-50/40",
  closed: "bg-slate-100/60 text-slate-500",
};

export const WORKFLOW_STEPS_ORDER: RebateWorkflowStep[] = [
  "program_overview",
  "rebate_request",
  "head_of_household",
  "scope_of_work",
  "contractor_pre_approval",
  "project_completion",
  "completion_attestations",
  "reservation_summary",
];

export const WORKFLOW_STEP_LABELS: Record<RebateWorkflowStep, string> = {
  program_overview: "Program Overview",
  rebate_request: "Rebate Request",
  head_of_household: "Head of Household",
  scope_of_work: "Scope of Work",
  contractor_pre_approval: "Contractor Pre-Approval",
  project_completion: "Project Completion",
  completion_attestations: "Completion Attestations",
  reservation_summary: "Reservation Summary",
};

export const WORKFLOW_STEP_DESCRIPTIONS: Record<RebateWorkflowStep, string> = {
  program_overview: "Review program rules, eligibility, and benefits with the customer.",
  rebate_request: "Complete and submit the initial rebate request form.",
  head_of_household: "Collect head-of-household income documentation and verification.",
  scope_of_work: "Define the proposed scope of electrification work.",
  contractor_pre_approval: "Submit pre-approval package and await Neighborly contractor approval.",
  project_completion: "Install equipment and complete the agreed scope of work.",
  completion_attestations: "Customer and contractor sign completion attestations.",
  reservation_summary: "Final reservation summary, payment release, and case close-out.",
};

export const WORKFLOW_STEP_STATUS_LABELS: Record<RebateWorkflowStepStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
  waiting: "Waiting",
  blocked: "Blocked",
};

export const WORKFLOW_STEP_STATUS_COLORS: Record<RebateWorkflowStepStatus, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  complete: "bg-green-100 text-green-700 border-green-200",
  waiting: "bg-orange-100 text-orange-700 border-orange-200",
  blocked: "bg-red-100 text-red-700 border-red-200",
};

export const PRIORITY_LABELS: Record<RebatePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_COLORS: Record<RebatePriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export const DOCUMENT_CATEGORY_LABELS: Record<RebateDocumentCategory, string> = {
  rebate_request: "Rebate Request",
  head_of_household: "Head of Household",
  scope_of_work: "Scope of Work — Heat Pump Photos",
  electrical_wiring_pre_retrofit: "Electrical Wiring Pre-Retrofit Photos",
  ahri_certificate: "Specification Sheets / ENERGY STAR / AHRI Certificate",
  snugg_pro_pdf: "SnuggPro PDF",
  fuel_switching_calculator: "Heat Pump Fuel-Switching Calculator",
  manual_j_report: "Manual J Report",
  contractor_pre_approval: "Contractor Pre-Approval",
  project_completion: "Project Completion",
  completion_attestations: "Completion Attestations",
  reservation_summary: "Reservation Summary",
  other: "Other",
};
