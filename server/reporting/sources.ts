/**
 * GHQ reporting — data-source registry.
 *
 * Every module plugs into reporting by registering a source here: a FROM/JOIN
 * clause plus a whitelist of fields, each mapping a stable key to a SQL
 * expression. The engine only ever interpolates expressions that appear in
 * this registry (values are always parameterized), which is what makes the
 * generic engine safe. Add a source and every feature — custom builder,
 * saved reports, exports, dashboards — picks it up automatically.
 */

export type FieldType = "string" | "number" | "currency" | "date" | "boolean";

export interface SourceField {
  label: string;
  type: FieldType;
  /** SQL expression (whitelisted — never comes from the client) */
  sql: string;
  groupable?: boolean;
  /** default aggregation when used as a measure */
  agg?: "sum" | "avg" | "count" | "min" | "max";
}

export interface ReportSource {
  key: string;
  label: string;
  description: string;
  /** FROM + JOIN clause (no WHERE) */
  from: string;
  /** field key used for date-range filtering by default */
  defaultDateField: string;
  fields: Record<string, SourceField>;
}

const sources: Record<string, ReportSource> = {};

function register(src: ReportSource) {
  sources[src.key] = src;
}

export function getSource(key: string): ReportSource | undefined {
  return sources[key];
}

export function listSources(): ReportSource[] {
  return Object.values(sources);
}

// ── CRM / Financial sources ─────────────────────────────────────────────────

register({
  key: "invoices",
  label: "Invoices",
  description: "Every CRM invoice with customer and technician context.",
  from: `crm_invoices i
    LEFT JOIN crm_customers c ON c.id = i.customer_id
    LEFT JOIN crm_work_orders w ON w.id = i.work_order_id
    LEFT JOIN crm_users t ON t.id = w.assigned_tech_id`,
  defaultDateField: "createdAt",
  fields: {
    invoiceNumber: { label: "Invoice #", type: "string", sql: "i.invoice_number" },
    status: { label: "Status", type: "string", sql: "i.status", groupable: true },
    customer: { label: "Customer", type: "string", sql: "COALESCE(c.name, 'Unknown')", groupable: true },
    technician: { label: "Technician", type: "string", sql: "COALESCE(t.name, 'Unassigned')", groupable: true },
    visitType: { label: "Job Type", type: "string", sql: "COALESCE(w.visit_type, 'None')", groupable: true },
    subtotal: { label: "Subtotal", type: "currency", sql: "COALESCE(i.subtotal, 0)::numeric", agg: "sum" },
    total: { label: "Total", type: "currency", sql: "COALESCE(i.total, 0)::numeric", agg: "sum" },
    balanceDue: { label: "Balance Due", type: "currency", sql: "COALESCE(i.balance_due, 0)::numeric", agg: "sum" },
    createdAt: { label: "Created", type: "date", sql: "i.created_at", groupable: true },
    dueDate: { label: "Due", type: "date", sql: "i.due_date", groupable: true },
  },
});

register({
  key: "payments",
  label: "Payments",
  description: "Money collected against invoices.",
  from: `crm_payments p
    LEFT JOIN crm_invoices i ON i.id = p.invoice_id
    LEFT JOIN crm_customers c ON c.id = i.customer_id
    LEFT JOIN crm_work_orders w ON w.id = i.work_order_id
    LEFT JOIN crm_users t ON t.id = w.assigned_tech_id`,
  defaultDateField: "createdAt",
  fields: {
    amount: { label: "Amount", type: "currency", sql: "COALESCE(p.amount, 0)::numeric", agg: "sum" },
    provider: { label: "Method", type: "string", sql: "p.provider", groupable: true },
    status: { label: "Status", type: "string", sql: "p.status", groupable: true },
    customer: { label: "Customer", type: "string", sql: "COALESCE(c.name, 'Unknown')", groupable: true },
    technician: { label: "Technician", type: "string", sql: "COALESCE(t.name, 'Unassigned')", groupable: true },
    invoiceNumber: { label: "Invoice #", type: "string", sql: "i.invoice_number" },
    createdAt: { label: "Received", type: "date", sql: "p.created_at", groupable: true },
  },
});

register({
  key: "quotes",
  label: "Quotes",
  description: "The sales pipeline — every quote and its outcome.",
  from: `crm_quotes q
    LEFT JOIN crm_customers c ON c.id = q.customer_id
    LEFT JOIN crm_users s ON s.id = COALESCE(q.assigned_to_id, q.created_by_id)`,
  defaultDateField: "createdAt",
  fields: {
    quoteNumber: { label: "Quote #", type: "string", sql: "q.quote_number" },
    status: { label: "Status", type: "string", sql: "q.status", groupable: true },
    customer: { label: "Customer", type: "string", sql: "COALESCE(c.name, 'Unknown')", groupable: true },
    salesperson: { label: "Salesperson", type: "string", sql: "COALESCE(s.name, 'Unassigned')", groupable: true },
    total: { label: "Total", type: "currency", sql: "COALESCE(q.total, 0)::numeric", agg: "sum" },
    createdAt: { label: "Created", type: "date", sql: "q.created_at", groupable: true },
    acceptedAt: { label: "Accepted", type: "date", sql: "q.accepted_at", groupable: true },
  },
});

register({
  key: "workOrders",
  label: "Work Orders",
  description: "Dispatch and operations — every job on the board.",
  from: `crm_work_orders w
    LEFT JOIN crm_customers c ON c.id = w.customer_id
    LEFT JOIN crm_users t ON t.id = w.assigned_tech_id`,
  defaultDateField: "scheduledStart",
  fields: {
    workOrderNumber: { label: "WO #", type: "string", sql: "w.work_order_number::text" },
    status: { label: "Status", type: "string", sql: "w.status", groupable: true },
    visitType: { label: "Job Type", type: "string", sql: "COALESCE(w.visit_type, 'None')", groupable: true },
    subtype: { label: "Subtype", type: "string", sql: "COALESCE(w.work_subtype, '—')", groupable: true },
    technician: { label: "Technician", type: "string", sql: "COALESCE(t.name, 'Unassigned')", groupable: true },
    customer: { label: "Customer", type: "string", sql: "COALESCE(c.name, 'Unknown')", groupable: true },
    scheduledStart: { label: "Scheduled", type: "date", sql: "w.scheduled_start", groupable: true },
    durationHours: {
      label: "Duration (hrs)",
      type: "number",
      sql: "EXTRACT(EPOCH FROM (w.scheduled_end - w.scheduled_start)) / 3600.0",
      agg: "sum",
    },
  },
});

register({
  key: "customers",
  label: "Customers",
  description: "The customer base — types, sources, and growth.",
  from: `crm_customers c
    LEFT JOIN crm_users s ON s.id = c.assigned_sales_rep_id`,
  defaultDateField: "createdAt",
  fields: {
    name: { label: "Name", type: "string", sql: "c.name" },
    type: { label: "Type", type: "string", sql: "COALESCE(c.customer_type, 'Residential')", groupable: true },
    status: { label: "Status", type: "string", sql: "COALESCE(c.customer_status, 'customer')", groupable: true },
    salesStage: { label: "Sales Stage", type: "string", sql: "COALESCE(c.sales_stage, '—')", groupable: true },
    leadSource: { label: "Lead Source", type: "string", sql: "COALESCE(c.lead_source, 'Unknown')", groupable: true },
    salesRep: { label: "Sales Rep", type: "string", sql: "COALESCE(s.name, 'Unassigned')", groupable: true },
    createdAt: { label: "Created", type: "date", sql: "c.created_at", groupable: true },
  },
});

register({
  key: "agreements",
  label: "Agreements",
  description: "Maintenance memberships and their value.",
  from: `crm_agreements a
    LEFT JOIN crm_customers c ON c.id = a.customer_id`,
  defaultDateField: "createdAt",
  fields: {
    agreementNumber: { label: "Agreement #", type: "string", sql: "a.agreement_number" },
    plan: { label: "Plan", type: "string", sql: "a.agreement_plan", groupable: true },
    status: { label: "Status", type: "string", sql: "a.status", groupable: true },
    price: { label: "Price", type: "currency", sql: "COALESCE(a.price::numeric, 0)", agg: "sum" },
    customer: { label: "Customer", type: "string", sql: "COALESCE(c.name, a.customer_name, 'Unknown')", groupable: true },
    startDate: { label: "Start", type: "date", sql: "a.start_date::timestamp", groupable: true },
    createdAt: { label: "Created", type: "date", sql: "a.created_at", groupable: true },
  },
});

register({
  key: "expenses",
  label: "Expenses",
  description: "Accounting expenses by vendor and account.",
  from: `acct_expenses e
    LEFT JOIN acct_accounts a ON a.id = e.account_id`,
  defaultDateField: "expenseDate",
  fields: {
    vendor: { label: "Vendor", type: "string", sql: "e.vendor", groupable: true },
    account: { label: "Account", type: "string", sql: "COALESCE(a.name, 'Uncategorized')", groupable: true },
    amount: { label: "Amount", type: "currency", sql: "COALESCE(e.amount::numeric, 0)", agg: "sum" },
    method: { label: "Method", type: "string", sql: "COALESCE(e.payment_method, '—')", groupable: true },
    memo: { label: "Memo", type: "string", sql: "COALESCE(e.memo, '')" },
    expenseDate: { label: "Date", type: "date", sql: "e.expense_date::timestamp", groupable: true },
  },
});

register({
  key: "timeEntries",
  label: "Time Entries",
  description: "Clock-ins — the raw material for labor and payroll reporting.",
  from: `crm_time_entries te
    LEFT JOIN crm_users u ON u.id = te.technician_id`,
  defaultDateField: "clockIn",
  fields: {
    employee: { label: "Employee", type: "string", sql: "COALESCE(u.name, 'Unknown')", groupable: true },
    clockIn: { label: "Clock In", type: "date", sql: "te.clock_in_at", groupable: true },
    hours: {
      label: "Hours",
      type: "number",
      sql: "COALESCE(te.duration_minutes, EXTRACT(EPOCH FROM (COALESCE(te.clock_out_at, now()) - te.clock_in_at)) / 60.0) / 60.0",
      agg: "sum",
    },
  },
});

register({
  key: "callLogs",
  label: "Call Logs",
  description: "Phone activity — who called and what it was about.",
  from: `call_logs cl
    LEFT JOIN call_log_days d ON d.id = cl.day_id`,
  defaultDateField: "loggedAt",
  fields: {
    client: { label: "Client", type: "string", sql: "cl.client_name", groupable: true },
    tag: { label: "Tag", type: "string", sql: "COALESCE(cl.tag, '—')", groupable: true },
    billable: { label: "Billable", type: "boolean", sql: "cl.billable", groupable: true },
    loggedBy: { label: "Logged By", type: "string", sql: "COALESCE(cl.created_by_name, 'Unknown')", groupable: true },
    loggedAt: { label: "Date", type: "date", sql: "cl.created_at", groupable: true },
  },
});
