/**
 * GHQ report catalog — the taxonomy of prebuilt reports.
 *
 * A prebuilt report is nothing special: just a saved parameterization of the
 * generic engine (source + columns/filters/grouping). Categories whose data
 * sources don't exist in GHQ yet are listed with comingSoon so the taxonomy
 * is complete and future modules simply fill in their specs.
 */
import type { ReportSpec } from "./engine";

export interface CatalogReport {
  key: string;
  title: string;
  description: string;
  spec?: ReportSpec;
  comingSoon?: boolean;
}

export interface CatalogCategory {
  key: string;
  label: string;
  reports: CatalogReport[];
}

const soon = (key: string, title: string, description: string): CatalogReport => ({
  key,
  title,
  description,
  comingSoon: true,
});

export const CATALOG: CatalogCategory[] = [
  {
    key: "executive",
    label: "Executive",
    reports: [
      {
        key: "exec-revenue-by-month",
        title: "Revenue by Month",
        description: "Payments collected, bucketed by month.",
        spec: { source: "payments", groupBy: ["createdAt"], timeBucket: "month", measures: [{ field: "amount", fn: "sum", label: "Collected" }], filters: [{ field: "status", op: "eq", value: "completed" }], sort: { key: "createdAt", dir: "asc" } },
      },
      {
        key: "exec-ar",
        title: "Accounts Receivable",
        description: "Outstanding balances by customer.",
        spec: { source: "invoices", groupBy: ["customer"], measures: [{ field: "balanceDue", fn: "sum", label: "Outstanding" }], filters: [{ field: "balanceDue", op: "gte", value: 0.01 }] },
      },
      {
        key: "exec-average-ticket",
        title: "Average Ticket",
        description: "Average invoice total by job type.",
        spec: { source: "invoices", groupBy: ["visitType"], measures: [{ field: "total", fn: "avg", label: "Avg Ticket" }, { field: "total", fn: "count", label: "Invoices" }] },
      },
      {
        key: "exec-memberships",
        title: "Memberships",
        description: "Agreements by status with total value.",
        spec: { source: "agreements", groupBy: ["status"], measures: [{ field: "price", fn: "sum", label: "Value" }, { field: "price", fn: "count", label: "Agreements" }] },
      },
      {
        key: "exec-backlog",
        title: "Backlog",
        description: "Open work orders by status.",
        spec: { source: "workOrders", groupBy: ["status"], measures: [{ field: "status", fn: "count", label: "Jobs" }] },
      },
      soon("exec-kpi", "KPI Dashboard", "Cross-module KPI wall (needs dashboard widgets)."),
      soon("exec-net-profit", "Net Profit", "Requires full expense + payroll costing."),
    ],
  },
  {
    key: "financial",
    label: "Financial",
    reports: [
      {
        key: "fin-pnl",
        title: "Profit & Loss (Cash)",
        description: "Collected revenue vs expenses by month.",
        spec: { source: "payments", groupBy: ["createdAt"], timeBucket: "month", measures: [{ field: "amount", fn: "sum", label: "Revenue" }], filters: [{ field: "status", op: "eq", value: "completed" }], sort: { key: "createdAt", dir: "asc" } },
      },
      {
        key: "fin-expenses-by-account",
        title: "Expenses by Account",
        description: "Spending grouped by chart-of-accounts category.",
        spec: { source: "expenses", groupBy: ["account"], measures: [{ field: "amount", fn: "sum", label: "Spent" }, { field: "amount", fn: "count", label: "Entries" }] },
      },
      {
        key: "fin-expense-detail",
        title: "Expense Detail",
        description: "Every expense line with vendor and account.",
        spec: { source: "expenses", columns: ["expenseDate", "vendor", "account", "method", "amount", "memo"] },
      },
      soon("fin-balance-sheet", "Balance Sheet", "Requires full double-entry ledger."),
      soon("fin-cash-flow", "Cash Flow", "Requires bank feed integration."),
      soon("fin-general-ledger", "General Ledger", "Requires journal entries."),
    ],
  },
  {
    key: "revenue",
    label: "Revenue & Sales",
    reports: [
      {
        key: "rev-by-technician",
        title: "Revenue by Technician",
        description: "Collected payments attributed to the assigned tech.",
        spec: { source: "payments", groupBy: ["technician"], measures: [{ field: "amount", fn: "sum", label: "Collected" }, { field: "amount", fn: "count", label: "Payments" }], filters: [{ field: "status", op: "eq", value: "completed" }] },
      },
      {
        key: "rev-by-salesperson",
        title: "Sales by Salesperson",
        description: "Accepted quote value by salesperson.",
        spec: { source: "quotes", groupBy: ["salesperson"], measures: [{ field: "total", fn: "sum", label: "Sold" }, { field: "total", fn: "count", label: "Quotes" }], filters: [{ field: "status", op: "eq", value: "accepted" }] },
      },
      {
        key: "rev-by-job-type",
        title: "Revenue by Job Type",
        description: "Invoice totals grouped by visit type.",
        spec: { source: "invoices", groupBy: ["visitType"], measures: [{ field: "total", fn: "sum", label: "Invoiced" }] },
      },
      {
        key: "rev-pipeline",
        title: "Sales Pipeline",
        description: "Open/won/lost quote value by status.",
        spec: { source: "quotes", groupBy: ["status"], measures: [{ field: "total", fn: "sum", label: "Value" }, { field: "total", fn: "count", label: "Quotes" }] },
      },
      soon("rev-commissions", "Commissions", "Requires commission rules per rep."),
    ],
  },
  {
    key: "ar-ap",
    label: "AR / AP",
    reports: [
      {
        key: "ar-outstanding",
        title: "Outstanding Invoices",
        description: "Unpaid invoices with balances and due dates.",
        spec: { source: "invoices", columns: ["invoiceNumber", "customer", "status", "total", "balanceDue", "dueDate"], filters: [{ field: "balanceDue", op: "gte", value: 0.01 }], sort: { key: "dueDate", dir: "asc" } },
      },
      {
        key: "ar-payments",
        title: "Payments Received",
        description: "Every payment with method and customer.",
        spec: { source: "payments", columns: ["createdAt", "customer", "invoiceNumber", "provider", "status", "amount"] },
      },
      soon("ap-vendor-aging", "Vendor Aging", "Requires bills/AP module."),
    ],
  },
  {
    key: "payroll",
    label: "Payroll & HR",
    reports: [
      {
        key: "hr-hours-by-employee",
        title: "Hours by Employee",
        description: "Clocked hours per person from time entries.",
        spec: { source: "timeEntries", groupBy: ["employee"], measures: [{ field: "hours", fn: "sum", label: "Hours" }] },
      },
      soon("hr-payroll-summary", "Payroll Summary", "Requires wage rates."),
      soon("hr-pto", "PTO", "Requires PTO tracking."),
      soon("hr-overtime", "Overtime", "Requires pay-period rules."),
    ],
  },
  {
    key: "job-costing",
    label: "Job Costing",
    reports: [
      soon("jc-profitability", "Job Profitability", "Requires job-level cost capture."),
      soon("jc-budget-actual", "Budget vs Actual", "Requires job budgets."),
      soon("jc-callbacks", "Callbacks", "Requires callback flagging on WOs."),
    ],
  },
  {
    key: "dispatch",
    label: "Dispatch & Operations",
    reports: [
      {
        key: "ops-jobs-completed",
        title: "Jobs Completed by Technician",
        description: "Completed work orders per tech.",
        spec: { source: "workOrders", groupBy: ["technician"], measures: [{ field: "status", fn: "count", label: "Jobs" }], filters: [{ field: "status", op: "eq", value: "completed" }] },
      },
      {
        key: "ops-scheduled-hours",
        title: "Scheduled Hours by Technician",
        description: "Booked time on the dispatch board per tech.",
        spec: { source: "workOrders", groupBy: ["technician"], measures: [{ field: "durationHours", fn: "sum", label: "Hours" }] },
      },
      {
        key: "ops-jobs-by-subtype",
        title: "Jobs by Subtype",
        description: "Work order volume by subtype.",
        spec: { source: "workOrders", groupBy: ["subtype"], measures: [{ field: "status", fn: "count", label: "Jobs" }] },
      },
      soon("ops-on-time", "On-Time Arrival", "Requires arrival timestamps vs windows."),
      soon("ops-travel", "Travel Time", "Requires GPS/Bouncie trip joins."),
    ],
  },
  {
    key: "customer",
    label: "Customer",
    reports: [
      {
        key: "cust-new-by-month",
        title: "New Customers by Month",
        description: "Customer growth over time.",
        spec: { source: "customers", groupBy: ["createdAt"], timeBucket: "month", measures: [{ field: "name", fn: "count", label: "New" }], sort: { key: "createdAt", dir: "asc" } },
      },
      {
        key: "cust-by-type",
        title: "Customers by Type",
        description: "Residential / commercial / property-manager mix.",
        spec: { source: "customers", groupBy: ["type"], measures: [{ field: "name", fn: "count", label: "Customers" }] },
      },
      {
        key: "cust-lifetime-value",
        title: "Customer Lifetime Value",
        description: "Total collected per customer, highest first.",
        spec: { source: "payments", groupBy: ["customer"], measures: [{ field: "amount", fn: "sum", label: "Lifetime" }], filters: [{ field: "status", op: "eq", value: "completed" }] },
      },
      soon("cust-reviews", "Reviews", "Requires review platform integration."),
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    reports: [
      soon("inv-valuation", "Inventory Valuation", "Requires the inventory module."),
      soon("inv-truck", "Truck Inventory", "Requires the inventory module."),
      soon("inv-po", "Purchase Orders", "Requires the purchasing module."),
    ],
  },
  {
    key: "equipment",
    label: "Equipment",
    reports: [
      soon("eq-installed", "Installed Equipment", "Requires equipment records per property."),
      soon("eq-warranty", "Warranty Status", "Requires equipment records."),
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    reports: [
      {
        key: "mkt-lead-sources",
        title: "Lead Sources",
        description: "Where new customers come from.",
        spec: { source: "customers", groupBy: ["leadSource"], measures: [{ field: "name", fn: "count", label: "Customers" }] },
      },
      {
        key: "mkt-calls-by-tag",
        title: "Calls by Tag",
        description: "Phone volume by call tag.",
        spec: { source: "callLogs", groupBy: ["tag"], measures: [{ field: "client", fn: "count", label: "Calls" }] },
      },
      soon("mkt-cpl", "Cost Per Lead", "Requires campaign spend capture."),
      soon("mkt-roi", "Campaign ROI", "Requires campaign spend capture."),
    ],
  },
  {
    key: "fleet",
    label: "Fleet",
    reports: [
      soon("fleet-usage", "Vehicle Usage", "Requires Bouncie trip reporting joins."),
      soon("fleet-maintenance", "Maintenance", "Requires vehicle service records."),
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    reports: [
      soon("comp-refrigerant", "Refrigerant Tracking", "Requires refrigerant logs."),
      soon("comp-certs", "Certifications", "Requires employee cert records."),
    ],
  },
  {
    key: "ai",
    label: "AI",
    reports: [soon("ai-usage", "AI Usage", "Requires AI event logging.")],
  },
];
