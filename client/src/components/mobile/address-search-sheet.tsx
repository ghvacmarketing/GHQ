import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { MapEmbed, validateAddress } from "@/components/mobile/address-autocomplete";
import { useKeyboardInset } from "@/lib/native";
import { useToast } from "@/hooks/use-toast";
import locationBadge from "@/assets/badge-location.png";

/** Address lookup for the mobile forms: a FULL-HEIGHT sheet built around an
 *  open keyboard — the sheet itself never moves or resizes when the keyboard
 *  shows (the results list pads itself clear instead), the search box grabs
 *  focus whenever the search step is visible, and picking a match leads to a
 *  map + "Use this address" confirm step. Selection hands structured fields
 *  (address1/city/state/zip) back to the form. */

export interface AddressSuggestion {
  description: string;
  main: string;
  secondary: string;
  placeId?: string;
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

/** Google predictions resolve through Place Details (fast, exact); cached so
 *  re-picking the same suggestion is instant. */
const placeCache = new Map<string, AddressFields | null>();
async function resolvePlace(placeId: string): Promise<AddressFields | null> {
  if (placeCache.has(placeId)) return placeCache.get(placeId) ?? null;
  try {
    const res = await fetch("/api/mobile/address-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ placeId }),
    });
    const data = res.ok ? await res.json() : null;
    const fields: AddressFields | null = data?.address1 ? data : null;
    placeCache.set(placeId, fields);
    return fields;
  } catch {
    return null;
  }
}

export function AddressSearchSheet({
  open,
  onOpenChange,
  onSelect,
  title = "Find address",
  nested = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** meta.verified = the fields came back complete from the geocoder, so the
   *  form can skip its own validation round-trip. */
  onSelect: (fields: AddressFields, meta?: { verified: boolean }) => void;
  title?: string;
  /** Opened from inside another sheet (the customer edit sheet) — stacks
   *  above it instead of colliding at the same z-index. */
  nested?: boolean;
}) {
  const keyboardInset = useKeyboardInset();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<(AddressSuggestion & Partial<AddressFields>) | null>(null);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef(0);

  // The input does not EXIST until the sheet has finished sliding in: iOS
  // births the caret against the layer state at focus time, and any residual
  // animation/transform leaves it rendering displaced. Mounting the field
  // fresh into a stationary sheet (which drops its landed animation — see
  // DraggableSheet) keeps the caret glued to the box.
  const [settled, setSettled] = useState(false);

  // Fresh sheet every open — layout effect so the reset lands BEFORE paint;
  // a plain effect let last time's picked place flash on screen for a frame
  // as the sheet slid up.
  useLayoutEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    setQuery("");
    setSuggestions([]);
    setChosen(null);
    const t = setTimeout(() => setSettled(true), 540);
    return () => clearTimeout(t);
  }, [open]);
  // Focus the moment the real input mounts (it only mounts once settled).
  useEffect(() => {
    if (settled) inputRef.current?.focus({ preventScroll: true });
  }, [settled]);

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
        // Belt-and-suspenders dedupe (the proxy dedupes too): the same house
        // can come back as both a street address and a premise.
        const seen = new Set<string>();
        const unique = (Array.isArray(rows) ? rows : []).filter((r) => {
          const k = `${r.main}|${r.secondary}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        if (seq === seqRef.current) setSuggestions(unique);
      } catch {
        if (seq === seqRef.current) setSuggestions([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  const choose = async (s: AddressSuggestion) => {
    inputRef.current?.blur();
    setChosen(s);
    if (s.address1 && s.city && s.state && s.zip) return; // keyless rows arrive complete
    setResolving(true);
    // Fast path: Place Details by id (~200ms). The validation proxy is the
    // fallback — it re-verifies an address Google itself just suggested, and
    // that round trip is what made picking feel slow.
    let fields = s.placeId ? await resolvePlace(s.placeId) : null;
    if (!fields) {
      const v = await validateAddress(s.description);
      fields = v?.standardized ? parseStandardized(v.standardized) : null;
    }
    setChosen((prev) => (prev && prev.description === s.description ? { ...prev, ...(fields || {}) } : prev));
    setResolving(false);
  };

  const confirm = () => {
    if (!chosen) return;
    const complete = !!(chosen.address1 && chosen.city && chosen.state && chosen.zip);
    const fields: AddressFields =
      chosen.address1 && chosen.city && chosen.state
        ? { address1: chosen.address1, city: chosen.city, state: chosen.state, zip: chosen.zip || "" }
        : parseSecondary(chosen.main, chosen.secondary);
    onSelect(fields, { verified: complete });
    // Visible confirmation — the sheet closing alone read as "did that take?"
    toast({
      title: complete ? "Verified address filled in" : "Address filled in",
      description: [fields.address1, fields.city, [fields.state, fields.zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
    });
    onOpenChange(false);
  };

  return (
    <DraggableSheet full nested={nested} open={open} onOpenChange={onOpenChange} title={title} testid="address-search-sheet">
      {!chosen ? (
        <div
          className="flex h-full min-h-0 flex-col"
          onPointerDown={(e) => {
            // Nothing on this step may steal the caret: taps on suggestions
            // or empty space keep focus (and the keyboard) pinned to the
            // search box — scrolling and button clicks still work.
            if (e.target !== inputRef.current) e.preventDefault();
          }}
        >
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

          <div className="mt-3 flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-slate-300/70 bg-white px-4 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            {settled ? (
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="123 Main St, Wrens"
                className="h-full w-full min-w-0 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
                data-testid="address-search-input"
              />
            ) : (
              /* Placeholder shell while the sheet is still moving — the real
                 input mounts (and focuses) only once everything is still. */
              <span className="h-full w-full min-w-0 content-center text-[16px] text-slate-400">123 Main St, Wrens</span>
            )}
            {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />}
          </div>

          {/* The rest of the screen is results. The sheet itself never moves
              for the keyboard — the list just pads its bottom so the last
              row scrolls clear of the keys. */}
          <div
            className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
            style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : 24 }}
          >
            {suggestions.length > 0 ? (
              <div
                className={`overflow-hidden rounded-[4px] border border-slate-300/70 bg-white shadow-sm transition-opacity ${searching ? "opacity-60" : ""}`}
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
            ) : (
              <p className="pt-9 text-center text-sm text-slate-400">
                {query.trim().length >= 3 && !searching
                  ? "No matches — check the spelling or fill the fields in by hand."
                  : "Start typing a street address — pick a match to fill everything in."}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              setChosen(null);
              // Back on the search step: keyboard comes right back up.
              setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
            }}
            className="flex items-center gap-1.5 py-1 text-sm font-medium text-slate-500 active:opacity-70"
            data-testid="address-search-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back to results
          </button>

          <div className="mt-3">
            {/* Tall and fully interactive — the Embed API iframe pans and
                zooms on its own; pointer events inside it never reach the
                sheet's drag logic. */}
            <MapEmbed query={chosen.description} className="h-80" />
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
