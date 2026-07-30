import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, Search } from "lucide-react";

export type CatalogItem = { id: string; name: string; description: string | null; rate: string | null; category: string | null };

/** "From catalog" popover shared by the quote builders (Custom Pricing,
 *  Quick Quote): loads the whole items catalog once, then filters instantly
 *  client-side by category chip + search text. */
export function CatalogPicker({ onPick, testidPrefix = "catalog" }: { onPick: (item: CatalogItem) => void; testidPrefix?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data: items = [], isFetching } = useQuery<CatalogItem[]>({
    queryKey: ["/api/crm/items", "catalog-picker"],
    queryFn: async () => {
      const res = await fetch("/api/crm/items", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[])).sort(),
    [items],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(
        (i) =>
          (category === "all" || i.category === category) &&
          (!q || i.name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [items, search, category]);

  const pick = (item: CatalogItem) => {
    onPick(item);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" data-testid={`${testidPrefix}-open`}>
          <BookOpen className="mr-1.5 h-3.5 w-3.5" /> From catalog
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the items catalog…"
            className="h-8 pl-8 text-sm"
            data-testid={`${testidPrefix}-search`}
          />
        </div>
        {categories.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  category === c
                    ? "border-[#711419] bg-[#711419]/[0.08] text-[#711419]"
                    : "border-slate-300/70 text-slate-500 hover:border-[#711419]/50 hover:text-[#711419]"
                }`}
                data-testid={`${testidPrefix}-cat-${c}`}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        )}
        {isFetching && items.length === 0 ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">No catalog items match.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => pick(item)}
                className="flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-2 text-left hover:bg-slate-50"
                data-testid={`${testidPrefix}-item-${item.id}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{item.name}</span>
                  {item.description && <span className="block truncate text-xs text-slate-500">{item.description}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                  ${parseFloat(item.rate || "0").toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
