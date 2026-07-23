import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calculator, ArrowLeft, LayoutDashboard, Receipt, ListTree, Plus, Search,
  Pencil, Trash2, Loader2, ExternalLink, TrendingUp, TrendingDown, Wallet, AlertCircle,
} from "lucide-react";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import type { CrmUser, AcctAccount } from "@shared/schema";

const MAROON = "#711419";

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
}

type Tab = "dashboard" | "expenses" | "accounts";

type Summary = {
  revenueByMonth: { month: string; total: string }[];
  expensesByMonth: { month: string; total: string }[];
  ar: { total: string; current: string; d30: string; d60: string; d90: string; open_count: number };
  recentExpenses: { id: string; expenseDate: string; vendor: string; amount: string; accountName: string | null }[];
};

type ExpenseRow = {
  id: string; expenseDate: string; vendor: string; accountId: string | null; accountName: string | null;
  amount: string; paymentMethod: string | null; memo: string | null;
};

const EMPTY_EXPENSE = {
  id: "" as string | "",
  expenseDate: format(new Date(), "yyyy-MM-dd"),
  vendor: "",
  accountId: "",
  amount: "",
  paymentMethod: "card",
  memo: "",
};

export default function AccountingApp() {
  usePageTitle("Accounting");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [expSearch, setExpSearch] = useState("");
  const [expenseForm, setExpenseForm] = useState<typeof EMPTY_EXPENSE | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<ExpenseRow | null>(null);
  const [acctForm, setAcctForm] = useState<{ code: string; name: string; type: string } | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);
  const isAllowed = !!currentUser && ["owner", "admin", "supervisor"].includes(currentUser.role);

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ["/api/accounting/summary"],
    enabled: isAllowed,
  });
  const { data: accounts = [] } = useQuery<AcctAccount[]>({
    queryKey: ["/api/accounting/accounts"],
    enabled: isAllowed,
  });
  const { data: expenses = [], isLoading: expensesLoading } = useQuery<ExpenseRow[]>({
    queryKey: ["/api/accounting/expenses", expSearch],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/expenses?q=${encodeURIComponent(expSearch)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load expenses");
      return res.json();
    },
    enabled: isAllowed && tab === "expenses",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/accounting/accounts"] });
  };
  const onError = (e: any) => toast({ variant: "destructive", title: e?.message || "Something went wrong" });

  const saveExpense = useMutation({
    mutationFn: async () => {
      if (!expenseForm) return;
      const body = {
        expenseDate: expenseForm.expenseDate,
        vendor: expenseForm.vendor,
        accountId: expenseForm.accountId || null,
        amount: Number(expenseForm.amount),
        paymentMethod: expenseForm.paymentMethod,
        memo: expenseForm.memo,
      };
      if (expenseForm.id) return apiRequest("PATCH", `/api/accounting/expenses/${expenseForm.id}`, body);
      return apiRequest("POST", "/api/accounting/expenses", body);
    },
    onSuccess: () => { invalidate(); setExpenseForm(null); toast({ title: "Expense saved" }); },
    onError,
  });
  const removeExpense = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/accounting/expenses/${id}`),
    onSuccess: () => { invalidate(); setDeleteExpense(null); },
    onError,
  });
  const saveAccount = useMutation({
    mutationFn: async () => {
      if (!acctForm) return;
      return apiRequest("POST", "/api/accounting/accounts", acctForm);
    },
    onSuccess: () => { invalidate(); setAcctForm(null); toast({ title: "Account added" }); },
    onError,
  });

  // 6-month chart data: merge revenue + expense months
  const chart = useMemo(() => {
    if (!summary) return [] as { label: string; revenue: number; expenses: number }[];
    const map = new Map<string, { revenue: number; expenses: number }>();
    for (const r of summary.revenueByMonth) map.set(r.month, { revenue: Number(r.total) || 0, expenses: 0 });
    for (const e of summary.expensesByMonth) {
      const cur = map.get(e.month) || { revenue: 0, expenses: 0 };
      cur.expenses = Number(e.total) || 0;
      map.set(e.month, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ label: format(new Date(`${month}-01T00:00:00`), "MMM"), ...v }));
  }, [summary]);
  const chartMax = Math.max(1, ...chart.map((c) => Math.max(c.revenue, c.expenses)));

  const thisMonthKey = format(new Date(), "yyyy-MM");
  const mtdRevenue = Number(summary?.revenueByMonth.find((r) => r.month === thisMonthKey)?.total ?? 0);
  const mtdExpenses = Number(summary?.expensesByMonth.find((r) => r.month === thisMonthKey)?.total ?? 0);

  if (authLoading || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="h-7 w-7 animate-spin text-[#711419]" />
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f7] p-6 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-slate-300" />
        <p className="font-medium text-slate-700">Accounting is limited to admins.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Back to apps</Button>
      </div>
    );
  }

  const NAV: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: "expenses", label: "Expenses", icon: <Receipt className="h-4 w-4" /> },
    { key: "accounts", label: "Chart of Accounts", icon: <ListTree className="h-4 w-4" /> },
  ];

  const grouped = ["income", "expense", "asset", "liability", "equity"]
    .map((t) => ({ type: t, list: accounts.filter((a) => a.type === t) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="flex h-screen flex-col bg-[#f5f5f7]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white/80 px-4 py-2.5 backdrop-blur">
        <button
          onClick={() => navigate("/")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title="Back to apps"
          data-testid="button-back-apps"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-emerald-500 to-green-700">
          <Calculator className="h-4 w-4 text-white" />
        </span>
        <span className="font-display text-[15px] font-semibold text-slate-900">Accounting</span>
        <div className="ml-auto">
          <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => navigate("/crm/invoices")} data-testid="link-invoices">
            Invoices <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 flex-col gap-0.5 border-r border-black/[0.06] bg-white/60 p-3 sm:flex">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === n.key ? "bg-[#711419]/10 text-[#711419]" : "text-slate-600 hover:bg-slate-100"
              }`}
              data-testid={`acct-nav-${n.key}`}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </aside>

        {/* Main */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {/* Mobile tabs */}
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-200/60 p-1 sm:hidden">
            {NAV.map((n) => (
              <button key={n.key} onClick={() => setTab(n.key)} className={`flex-1 rounded-md py-1.5 text-xs font-medium ${tab === n.key ? "bg-white shadow-sm" : "text-slate-500"}`}>
                {n.label}
              </button>
            ))}
          </div>

          {tab === "dashboard" && (
            summaryLoading || !summary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
                <Skeleton className="h-64 rounded-lg" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* KPI cards */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Revenue (MTD)</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900" data-testid="kpi-revenue">{money(mtdRevenue)}</p>
                  </div>
                  <div className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Expenses (MTD)</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900" data-testid="kpi-expenses">{money(mtdExpenses)}</p>
                  </div>
                  <div className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Wallet className="h-3.5 w-3.5 text-slate-400" /> Net (MTD)</p>
                    <p className={`mt-1 text-2xl font-semibold tracking-tight ${mtdRevenue - mtdExpenses >= 0 ? "text-emerald-600" : "text-red-600"}`} data-testid="kpi-net">
                      {money(mtdRevenue - mtdExpenses)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">Outstanding A/R</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900" data-testid="kpi-ar">{money(summary.ar.total)}</p>
                    <p className="text-[11px] text-slate-400">{summary.ar.open_count} open invoice{summary.ar.open_count === 1 ? "" : "s"}</p>
                  </div>
                </div>

                {/* Revenue vs expenses (6 mo) */}
                <div className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-slate-900">Revenue vs expenses — last 6 months</p>
                  {chart.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No activity yet.</p>
                  ) : (
                    <div className="flex items-end gap-3" style={{ height: 180 }}>
                      {chart.map((c) => (
                        <div key={c.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                          <div className="flex w-full flex-1 items-end justify-center gap-1">
                            <div className="w-1/3 max-w-[26px] rounded-t bg-emerald-500/85" style={{ height: `${(c.revenue / chartMax) * 100}%` }} title={`Revenue ${money(c.revenue)}`} />
                            <div className="w-1/3 max-w-[26px] rounded-t bg-red-400/80" style={{ height: `${(c.expenses / chartMax) * 100}%` }} title={`Expenses ${money(c.expenses)}`} />
                          </div>
                          <span className="text-[11px] font-medium text-slate-500">{c.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500/85" /> Revenue (payments received)</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-400/80" /> Expenses</span>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* A/R aging */}
                  <div className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                    <p className="mb-3 text-sm font-semibold text-slate-900">A/R aging</p>
                    {[
                      ["Current", summary.ar.current, "bg-emerald-500"],
                      ["1–30 days overdue", summary.ar.d30, "bg-amber-400"],
                      ["31–60 days overdue", summary.ar.d60, "bg-orange-500"],
                      ["60+ days overdue", summary.ar.d90, "bg-red-500"],
                    ].map(([label, val, color]) => {
                      const total = Number(summary.ar.total) || 1;
                      const pct = Math.min(100, (Number(val) / total) * 100);
                      return (
                        <div key={label as string} className="mb-2.5">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-slate-600">{label}</span>
                            <span className="font-semibold text-slate-900">{money(val)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Recent expenses */}
                  <div className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Recent expenses</p>
                      <button onClick={() => setTab("expenses")} className="text-xs font-medium text-[#711419] hover:underline">View all</button>
                    </div>
                    {summary.recentExpenses.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-400">No expenses recorded yet.</p>
                    ) : (
                      summary.recentExpenses.map((e) => (
                        <div key={e.id} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm last:border-0">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">{e.vendor}</p>
                            <p className="text-[11px] text-slate-400">{e.accountName || "Uncategorized"} · {format(new Date(e.expenseDate), "MMM d")}</p>
                          </div>
                          <span className="shrink-0 font-semibold text-slate-900">{money(e.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {tab === "expenses" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={expSearch} onChange={(e) => setExpSearch(e.target.value)} placeholder="Search vendor or memo…" className="h-9 rounded-lg bg-white pl-9 text-sm" data-testid="input-expense-search" />
                </div>
                <Button size="sm" className="ml-auto h-9 rounded-lg bg-[#711419] hover:bg-[#8a1a1f]" onClick={() => setExpenseForm({ ...EMPTY_EXPENSE })} data-testid="button-add-expense">
                  <Plus className="mr-1.5 h-4 w-4" /> Expense
                </Button>
              </div>

              <div className="overflow-hidden rounded-lg border border-black/[0.06] bg-white shadow-sm">
                {expensesLoading ? (
                  <div className="space-y-2 p-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : expenses.length === 0 ? (
                  <p className="py-14 text-center text-sm text-slate-400">No expenses{expSearch ? " match your search" : " yet — add your first one"}.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Vendor</th>
                        <th className="hidden px-4 py-2.5 font-medium md:table-cell">Category</th>
                        <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Method</th>
                        <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                        <th className="w-20" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {expenses.map((e) => (
                        <tr key={e.id} className="group hover:bg-slate-50/60" data-testid={`expense-${e.id}`}>
                          <td className="px-4 py-2.5 text-slate-600">{format(new Date(e.expenseDate), "MMM d, yyyy")}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800">{e.vendor}</p>
                            {e.memo && <p className="truncate text-xs text-slate-400">{e.memo}</p>}
                          </td>
                          <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell">{e.accountName || "—"}</td>
                          <td className="hidden px-4 py-2.5 capitalize text-slate-600 lg:table-cell">{e.paymentMethod || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{money(e.amount)}</td>
                          <td className="px-2 py-2.5">
                            <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                              <button
                                onClick={() => setExpenseForm({
                                  id: e.id,
                                  expenseDate: format(new Date(e.expenseDate), "yyyy-MM-dd"),
                                  vendor: e.vendor,
                                  accountId: e.accountId || "",
                                  amount: String(e.amount),
                                  paymentMethod: e.paymentMethod || "card",
                                  memo: e.memo || "",
                                })}
                                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                data-testid={`edit-expense-${e.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setDeleteExpense(e)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" data-testid={`delete-expense-${e.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === "accounts" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Categories used for expenses and reporting.</p>
                <Button size="sm" className="h-9 rounded-lg bg-[#711419] hover:bg-[#8a1a1f]" onClick={() => setAcctForm({ code: "", name: "", type: "expense" })} data-testid="button-add-account">
                  <Plus className="mr-1.5 h-4 w-4" /> Account
                </Button>
              </div>
              {grouped.map((g) => (
                <div key={g.type} className="overflow-hidden rounded-lg border border-black/[0.06] bg-white shadow-sm">
                  <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{g.type}</p>
                  {g.list.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0" data-testid={`account-${a.id}`}>
                      <span className="w-12 shrink-0 font-mono text-xs text-slate-400">{a.code || "—"}</span>
                      <span className={`flex-1 font-medium ${a.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>{a.name}</span>
                      <button
                        onClick={() => apiRequest("PATCH", `/api/accounting/accounts/${a.id}`, { isActive: !a.isActive }).then(invalidate).catch(onError)}
                        className="text-xs font-medium text-slate-400 hover:text-slate-700"
                      >
                        {a.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Expense dialog */}
      <Dialog open={!!expenseForm} onOpenChange={(o) => !o && setExpenseForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{expenseForm?.id ? "Edit expense" : "New expense"}</DialogTitle></DialogHeader>
          {expenseForm && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} data-testid="expense-date" />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} data-testid="expense-amount" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Input placeholder="e.g., Ferguson, Shell, Lennox" value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} data-testid="expense-vendor" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={expenseForm.accountId || "none"} onValueChange={(v) => setExpenseForm({ ...expenseForm, accountId: v === "none" ? "" : v })}>
                    <SelectTrigger data-testid="expense-account"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {accounts.filter((a) => a.type === "expense" && a.isActive).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={expenseForm.paymentMethod} onValueChange={(v) => setExpenseForm({ ...expenseForm, paymentMethod: v })}>
                    <SelectTrigger data-testid="expense-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["card", "check", "cash", "ach", "other"].map((m) => (
                        <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Memo (optional)</Label>
                <Textarea rows={2} value={expenseForm.memo} onChange={(e) => setExpenseForm({ ...expenseForm, memo: e.target.value })} data-testid="expense-memo" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseForm(null)}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#8a1a1f]"
              disabled={!expenseForm?.vendor.trim() || !Number(expenseForm?.amount) || saveExpense.isPending}
              onClick={() => saveExpense.mutate()}
              data-testid="save-expense"
            >
              {saveExpense.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account dialog */}
      <Dialog open={!!acctForm} onOpenChange={(o) => !o && setAcctForm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New account</DialogTitle></DialogHeader>
          {acctForm && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input placeholder="6700" value={acctForm.code} onChange={(e) => setAcctForm({ ...acctForm, code: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Type</Label>
                  <Select value={acctForm.type} onValueChange={(v) => setAcctForm({ ...acctForm, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["income", "expense", "asset", "liability", "equity"].map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="e.g., Training & Education" value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcctForm(null)}>Cancel</Button>
            <Button className="bg-[#711419] hover:bg-[#8a1a1f]" disabled={!acctForm?.name.trim() || saveAccount.isPending} onClick={() => saveAccount.mutate()} data-testid="save-account">
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete expense confirm */}
      <AlertDialog open={!!deleteExpense} onOpenChange={(o) => !o && setDeleteExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteExpense?.vendor} — {money(deleteExpense?.amount)}. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteExpense && removeExpense.mutate(deleteExpense.id)} data-testid="confirm-delete-expense">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
