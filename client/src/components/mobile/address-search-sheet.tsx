import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { MapEmbed, validateAddress } from "@/components/mobile/address-autocomplete";
import locationBadge from "@/assets/badge-location.png";

/** Address lookup for the mobile create forms: a bottom sheet with a plain
 *  search box (no OS widget), house-style suggestion rows (metal pin badge)
 *  as you type, and a map + confirm step once one is picked. Selection hands
 *  structured fields (address1/city/state/zip) back to the form. */

export interface AddressSuggestion {
  description: string;
  main: string;
  secondary: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface AddressFields {
  address1: string;
  city: string;
  state: string;
  zip: string;
}

/** "123 Main St, Wrens, GA 30833" → fields (the shape our validate proxy
 *  standardizes to). */
function parseStandardized(s: string): AddressFields | null {
  const parts = s.split(",").map((x) => x.trim());
  if (parts.length < 3) return null;
  const st = parts[2].match(/^([A-Za-z]{2})\s+(\d{5})/);
  if (!st) return null;
  return { address1: parts[0], city: parts[1], state: st[1].toUpperCase(), zip: st[2] };
}

/** Last-resort parse of "City, ST 30833"-style secondary text. */
function parseSecondary(main: string, secondary: string): AddressFields {
  const m = secondary.match(/([A-Za-z .'-]+),\s*([A-Za-z]{2})(?:\s+(\d{5}))?/);
  return {
    address1: main,
    city: m?.[1]?.trim() || "",
    state: m?.[2]?.toUpperCase() || "",
    zip: m?.[3] || "",
  };
}

export function AddressSearchSheet({
  open,
  onOpenChange,
  onSelect,
  title = "Find address",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (fields: AddressFields) => void;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<(AddressSuggestion & Partial<AddressFields>) | null>(null);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef(0);

  // Fresh sheet every open — layout effect so the reset lands BEFORE paint;
  // a plain effect let last time's picked place flash on screen for a frame
  // as the sheet slid up. Focus once the slide-up has landed.
  useLayoutEffect(() => {
    if (!open) return;
    setQuery("");
    setSuggestions([]);
    setChosen(null);
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced lookup through our server proxy.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 3) { setSuggestions([]); setSearching(false); return; }
    setSearching(true);
    const seq = ++seqRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/mobile/address-autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ query: q }),
        });
        const rows: AddressSuggestion[] = res.ok ? await res.json() : [];
        if (seq === seqRef.current) setSuggestions(Array.isArray(rows) ? rows : []);
      } catch {
        if (seq === seqRef.current) setSuggestions([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const choose = async (s: AddressSuggestion) => {
    inputRef.current?.blur();
    setChosen(s);
    // Google predictions carry only text — resolve components through the
    // validate proxy (which standardizes to "Addr, City, ST ZIP").
    if (!s.address1 || !s.city || !s.state) {
      setResolving(true);
      const v = await validateAddress(s.description);
      const parsed = v?.standardized ? parseStandardized(v.standardized) : null;
      setChosen((prev) => (prev && prev.description === s.description ? { ...prev, ...(parsed || {}) } : prev));
      setResolving(false);
    }
  };

  const confirm = () => {
    if (!chosen) return;
    const fields: AddressFields =
      chosen.address1 && chosen.city && chosen.state
        ? { address1: chosen.address1, city: chosen.city, state: chosen.state, zip: chosen.zip || "" }
        : parseSecondary(chosen.main, chosen.secondary);
    onSelect(fields);
    onOpenChange(false);
  };

  return (
    <DraggableSheet tall open={open} onOpenChange={onOpenChange} title={title} testid="address-search-sheet">
      {!chosen ? (
        <div className="min-h-[52dvh]">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-[13px] text-slate-400">Start typing a street address — pick a match to fill everything in.</p>

          <div className="mt-4 flex h-12 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="123 Main St, Wrens"
              className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
              data-testid="address-search-input"
            />
            {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />}
          </div>

          {suggestions.length > 0 ? (
            <div
              className={`mt-4 overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm transition-opacity ${searching ? "opacity-60" : ""}`}
            >
              {suggestions.map((s, i) => (
                <button
                  key={`${s.description}-${i}`}
                  onClick={() => choose(s)}
                  className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                  data-testid={`address-suggestion-${i}`}
                >
                  <img src={locationBadge} alt="" className="h-8 w-8 shrink-0 select-none" draggable={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{s.main}</span>
                    {s.secondary && <span className="block truncate text-xs text-slate-500">{s.secondary}</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 3 && !searching ? (
            <p className="mt-8 text-center text-sm text-slate-400">No matches — check the spelling or fill the fields in by hand.</p>
          ) : null}
        </div>
      ) : (
        <>
          <button
            onClick={() => setChosen(null)}
            className="flex items-center gap-1.5 py-1 text-sm font-medium text-slate-500 active:opacity-70"
            data-testid="address-search-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back to results
          </button>

          <div className="mt-3">
            <MapEmbed query={chosen.description} className="h-44" />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-[4px] border border-slate-300/70 bg-white px-3.5 py-3 shadow-sm">
            <img src={locationBadge} alt="" className="h-9 w-9 shrink-0 select-none" draggable={false} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{chosen.address1 || chosen.main}</p>
              <p className="text-xs text-slate-500">
                {resolving
                  ? "Filling in the details…"
                  : [chosen.city, [chosen.state, chosen.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || chosen.secondary}
              </p>
            </div>
            {resolving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />}
          </div>

          <button
            onClick={confirm}
            disabled={resolving}
            className="mt-4 h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
            data-testid="address-search-use"
          >
            Use this address
          </button>
        </>
      )}
    </DraggableSheet>
  );
}
