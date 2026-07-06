// Shared definitions for the marketing automation builder. Both the builder UI
// and the server execution engine import these so the options stay in sync.

export type AutomationTriggerType =
  | "work_order.completed"
  | "work_order.scheduled"
  | "invoice.paid"
  | "invoice.sent"
  | "invoice.overdue"
  | "quote.sent"
  | "quote.accepted"
  | "customer.created"
  | "lead.created"
  | "lead.won"
  | "lead.lost"
  | "agreement.expiring";

export interface AutomationOption {
  value: string;
  label: string;
  description?: string;
  /** lucide-react icon name */
  icon?: string;
}

export const AUTOMATION_TRIGGERS: (AutomationOption & { value: AutomationTriggerType })[] = [
  { value: "work_order.completed", label: "Work order completed", description: "A job is marked complete", icon: "CheckCircle2" },
  { value: "work_order.scheduled", label: "Work order scheduled", description: "A job is put on the schedule", icon: "CalendarClock" },
  { value: "invoice.paid", label: "Invoice paid", description: "A customer pays an invoice", icon: "DollarSign" },
  { value: "invoice.sent", label: "Invoice sent", description: "An invoice is sent to a customer", icon: "Send" },
  { value: "invoice.overdue", label: "Invoice overdue", description: "An invoice passes its due date", icon: "AlertTriangle" },
  { value: "quote.sent", label: "Quote sent", description: "A quote is sent to a customer", icon: "FileText" },
  { value: "quote.accepted", label: "Quote accepted", description: "A customer accepts a quote", icon: "ThumbsUp" },
  { value: "customer.created", label: "New customer added", description: "A customer is created in the CRM", icon: "UserPlus" },
  { value: "lead.created", label: "New lead created", description: "A new lead comes in", icon: "Sparkles" },
  { value: "lead.won", label: "Lead won", description: "A lead is marked won", icon: "Trophy" },
  { value: "lead.lost", label: "Lead lost", description: "A lead is marked lost", icon: "XCircle" },
  { value: "agreement.expiring", label: "Agreement expiring", description: "A maintenance agreement nears expiry", icon: "CalendarX" },
];

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "contains"
  | "is_empty"
  | "is_not_empty";

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "contains", label: "contains" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

// Fields available to filter on. `options` (when present) drives a dropdown.
export const CONDITION_FIELDS: (AutomationOption & { options?: string[] })[] = [
  { value: "customer.type", label: "Customer type", options: ["residential", "commercial", "property_manager"] },
  { value: "customer.status", label: "Customer status", options: ["customer", "prospect"] },
  { value: "work_order.visitType", label: "Visit type", options: ["SERVICE", "INSTALL", "MAINTENANCE"] },
  { value: "work_order.priority", label: "Priority", options: ["low", "normal", "high"] },
  { value: "invoice.total", label: "Invoice amount ($)" },
  { value: "customer.tag", label: "Customer tag" },
];

export type AutomationActionType =
  | "send_sms"
  | "send_email"
  | "review_request"
  | "create_task"
  | "add_tag"
  | "notify_team";

export const AUTOMATION_ACTIONS: (AutomationOption & { value: AutomationActionType })[] = [
  { value: "send_sms", label: "Send SMS", description: "Text the customer", icon: "MessageSquare" },
  { value: "send_email", label: "Send email", description: "Email the customer", icon: "Mail" },
  { value: "review_request", label: "Request a review", description: "Ask for a Google review", icon: "Star" },
  { value: "create_task", label: "Create a task", description: "Add a follow-up task for the team", icon: "ListTodo" },
  { value: "add_tag", label: "Add a tag", description: "Tag the customer", icon: "Tag" },
  { value: "notify_team", label: "Notify the team", description: "Post an internal notification", icon: "Bell" },
];

export const DELAY_UNITS = [
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
  { value: "days", label: "days" },
] as const;

export type DelayUnit = (typeof DELAY_UNITS)[number]["value"];

// ── Persisted config shapes ──────────────────────────────────────────────────
export interface AutomationTrigger {
  type: AutomationTriggerType;
}

export interface AutomationCondition {
  field: string;
  operator: ConditionOperator;
  value?: string;
}

export interface AutomationAction {
  type: AutomationActionType;
  // free-form per-action config (template, subject, tag, taskTitle, message…)
  config?: Record<string, string>;
}

export interface AutomationTiming {
  delay: number;
  delayUnit: DelayUnit;
  businessHoursOnly: boolean;
}

export interface AutomationSafeguards {
  cooldownDays: number; // don't re-enter the same customer within N days (0 = off)
  maxPerCustomerPerMonth: number; // 0 = unlimited
  quietHours: boolean; // never send between 9pm–8am
  requireActiveCustomer: boolean; // skip prospects/archived
}

export const DEFAULT_TIMING: AutomationTiming = { delay: 0, delayUnit: "hours", businessHoursOnly: true };
export const DEFAULT_SAFEGUARDS: AutomationSafeguards = {
  cooldownDays: 30,
  maxPerCustomerPerMonth: 2,
  quietHours: true,
  requireActiveCustomer: true,
};

export function triggerLabel(type: string): string {
  return AUTOMATION_TRIGGERS.find((t) => t.value === type)?.label ?? type;
}
export function actionLabel(type: string): string {
  return AUTOMATION_ACTIONS.find((a) => a.value === type)?.label ?? type;
}
