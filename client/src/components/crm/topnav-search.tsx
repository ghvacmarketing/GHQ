import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  Users,
  ClipboardList,
  Receipt,
  FileText,
  FileCheck,
  FolderKanban,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type Item = { id: string; [k: string]: any };
type Category = { items: Item[]; total: number; hasMore: boolean };
type SearchResponse = { results: Record<string, Category>; totalCount: number };

/** Categories shown in the dropdown, in priority order. Mirrors the global search API. */
const CATS: {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  link: (i: Item) => string;
  primary: (i: Item) => string;
  secondary: (i: Item) => string;
}[] = [
  { key: "customers", label: "Customers", icon: Users, link: (i) => `/crm/customers/${i.id}`, primary: (i) => i.name || "Unknown", secondary: (i) => i.snippet || i.phone || i.email || "" },
  { key: "workOrders", label: "Work Orders", icon: ClipboardList, link: (i) => `/crm/work-orders/${i.id}`, primary: (i) => i.workOrderNumber || i.title || `WO-${i.id}`, secondary: (i) => [i.customerName, i.status].filter(Boolean).join(" · ") },
  { key: "invoices", label: "Invoices", icon: Receipt, link: (i) => `/crm/invoices/${i.id}`, primary: (i) => i.invoiceNumber || `Invoice #${i.id}`, secondary: (i) => [i.customerName, i.status].filter(Boolean).join(" · ") },
  { key: "quotes", label: "Quotes", icon: FileText, link: (i) => `/crm/quotes/${i.id}`, primary: (i) => i.quoteNumber || i.title || `Quote #${i.id}`, secondary: (i) => [i.customerName, i.status].filter(Boolean).join(" · ") },
  { key: "projects", label: "Projects", icon: FolderKanban, link: (i) => `/crm/projects/${i.id}`, primary: (i) => i.projectNumber || i.name || `Project #${i.id}`, secondary: (i) => [i.customerName, i.status].filter(Boolean).join(" · ") },
  { key: "agreements", label: "Agreements", icon: FileCheck, link: () => `/crm/agreements`, primary: (i) => i.name || i.title || `Agreement #${i.id}`, secondary: (i) => i.status || "" },
];

/** Inline global search for the top nav: type to see a dropdown of linked CRM
 *  records (customers, work orders, invoices, quotes, projects, agreements). */
export function TopNavSearch() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const term = debounced.trim();
  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ["ghq-search", term],
    queryFn: async () => {
      const res = await fetch(`/api/crm/ghq/search?q=${encodeURIComponent(term)}&ai=false`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: term.length >= 2,
    staleTime: 15000,
  });

  const groups = CATS
    .map((c) => ({ ...c, items: (data?.results?.[c.key]?.items || []).slice(0, 5) }))
    .filter((g) => g.items.length > 0);
  const showDropdown = open && term.length >= 2;

  const go = (href: string) => {
    navigate(href);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        placeholder="Search customers, work orders, invoices…"
        className="h-9 pl-9 pr-8 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
        data-testid="input-topnav-search"
      />
      {isFetching && showDropdown && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-[100] mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {isFetching ? "Searching…" : `No results for "${term}"`}
            </p>
          ) : (
            groups.map((g) => {
              const Icon = g.icon;
              return (
                <div key={g.key} className="py-1">
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  {g.items.map((item) => (
                    <button
                      key={`${g.key}-${item.id}`}
                      onClick={() => go(g.link(item))}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
                      data-testid={`topnav-search-result-${g.key}-${item.id}`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{g.primary(item)}</span>
                        {g.secondary(item) && (
                          <span className="block truncate text-xs text-muted-foreground">{g.secondary(item)}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
