import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { MapPin, X, Check, Trash2, Loader2, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { CrmUser } from "@shared/schema";

/** Toggle comment mode (the top-bar comment button calls this — clicking it
 *  again while active exits). The layer broadcasts "ghq-pin-mode-state" so
 *  the toolbar icon can reflect the active state. */
export const enterPinMode = () => window.dispatchEvent(new Event("ghq-pin-mode"));

type Pin = {
  id: string;
  path: string;
  anchor_testid: string | null;
  anchor_index: number;
  x_pct: number;
  y_pct: number;
  abs_x: number;
  abs_y: number;
  body: string;
  mentions: string[];
  created_by: string | null;
  createdByName: string | null;
  resolved: boolean;
  created_at: string;
  edited_at: string | null;
};

/** Resolve a pin to viewport coordinates: prefer its data-testid anchor with
 *  fractional offsets (pixel-accurate across screens); fall back to absolute
 *  document coordinates. Returns null when the anchor isn't on screen yet. */
function pinViewportPos(pin: Pin): { x: number; y: number } | null {
  if (pin.anchor_testid) {
    const matches = document.querySelectorAll(`[data-testid="${CSS.escape(pin.anchor_testid)}"]`);
    const el = matches[pin.anchor_index] || matches[0];
    if (el) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        return { x: r.left + pin.x_pct * r.width, y: r.top + pin.y_pct * r.height };
      }
    }
    // Anchored pin whose anchor isn't mounted (e.g. a different subtab is
    // open) — hide it rather than falling back to page coordinates.
    return null;
  }
  if (pin.abs_x || pin.abs_y) {
    return { x: pin.abs_x - window.scrollX, y: pin.abs_y - window.scrollY };
  }
  return null;
}

export function PinCommentsLayer({ currentUser }: { currentUser: CrmUser }) {
  const [location] = useLocation();
  const path = location.split("?")[0];
  const { toast } = useToast();

  const [mode, setMode] = useState(false);
  const [openPinId, setOpenPinId] = useState<string | null>(null);
  const [composer, setComposer] = useState<null | {
    x: number; y: number;
    anchorTestId: string | null; anchorIndex: number;
    xPct: number; yPct: number; absX: number; absY: number;
  }>(null);
  const [body, setBody] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [pulseId, setPulseId] = useState<string | null>(null);

  useEffect(() => {
    const on = () => { setMode((v) => !v); setComposer(null); };
    window.addEventListener("ghq-pin-mode", on);
    return () => window.removeEventListener("ghq-pin-mode", on);
  }, []);

  // Let the toolbar icon reflect the mode
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ghq-pin-mode-state", { detail: { active: mode } }));
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMode(false); setComposer(null); setOpenPinId(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { data: pins = [] } = useQuery<Pin[]>({
    queryKey: ["/api/crm/pins", path],
    queryFn: async () => {
      const res = await fetch(`/api/crm/pins?path=${encodeURIComponent(path)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 45_000,
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    // Needed by the composer's tag list AND the open card's "Tagged" names
    enabled: !!composer || !!openPinId,
  });

  // ── Keep pins glued to their anchors while anything scrolls or resizes ──
  const rafRef = useRef(0);
  const recompute = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const p of pins) {
        const pos = pinViewportPos(p);
        if (pos) next[p.id] = pos;
      }
      setPositions(next);
    });
  }, [pins]);

  useEffect(() => {
    recompute();
    // A couple of delayed passes so late-rendering content (queries) settles
    const t1 = setTimeout(recompute, 400);
    const t2 = setTimeout(recompute, 1200);
    window.addEventListener("resize", recompute);
    document.addEventListener("scroll", recompute, { capture: true, passive: true });
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener("resize", recompute);
      document.removeEventListener("scroll", recompute, { capture: true } as any);
    };
  }, [recompute]);

  // ── Deep link: ?pin=<id> — wait for the anchor to actually mount (page
  // queries render late), jump the scroll instantly, THEN place, open, and
  // bounce the pin at its final position so nothing plays in the wrong spot.
  const deepLinkedId = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pin");
    if (!id || pins.length === 0 || deepLinkedId.current === id) return;
    const pin = pins.find((p) => p.id === id);
    if (!pin) return;
    deepLinkedId.current = id;

    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      tries++;
      const matches = pin.anchor_testid
        ? document.querySelectorAll(`[data-testid="${CSS.escape(pin.anchor_testid)}"]`)
        : null;
      const el = matches ? ((matches[pin.anchor_index] || matches[0]) as HTMLElement | undefined) : undefined;
      if (!el && pin.anchor_testid && tries < 20) {
        timer = setTimeout(attempt, 150);
        return;
      }
      if (el) el.scrollIntoView({ block: "center", behavior: "auto" });
      recompute();
      // Open + pulse only after the post-scroll positions have painted
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setOpenPinId(id);
          setPulseId(id);
          setTimeout(() => setPulseId(null), 2500);
        }),
      );
    };
    attempt();
    return () => clearTimeout(timer);
  }, [pins, recompute]);

  // ── Drop a pin ──
  const handleModeClick = (e: React.MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    // Look through the overlay to what's underneath
    const stack = document.elementsFromPoint(x, y);
    // Clicking the toolbar comment icon (which sits under the overlay) exits
    // the mode instead of dropping a pin next to it.
    if (stack.some((el) => (el as HTMLElement).closest?.('[data-testid="button-topnav-comment"]'))) {
      setMode(false);
      return;
    }
    let anchor: HTMLElement | null = null;
    for (const el of stack) {
      if ((el as HTMLElement).dataset?.pinOverlay) continue;
      anchor = (el as HTMLElement).closest?.("[data-testid]") as HTMLElement | null;
      if (anchor) break;
    }
    let anchorTestId: string | null = null;
    let anchorIndex = 0;
    let xPct = 0;
    let yPct = 0;
    if (anchor) {
      anchorTestId = anchor.getAttribute("data-testid");
      const matches = Array.from(document.querySelectorAll(`[data-testid="${CSS.escape(anchorTestId!)}"]`));
      anchorIndex = Math.max(0, matches.indexOf(anchor));
      const r = anchor.getBoundingClientRect();
      xPct = r.width > 0 ? (x - r.left) / r.width : 0;
      yPct = r.height > 0 ? (y - r.top) / r.height : 0;
    }
    setMode(false);
    setBody("");
    setTagged([]);
    setTagSearch("");
    setComposer({
      x, y, anchorTestId, anchorIndex, xPct, yPct,
      absX: x + window.scrollX, absY: y + window.scrollY,
    });
  };

  const createPin = useMutation({
    mutationFn: async () => {
      if (!composer) return;
      return apiRequest("POST", "/api/crm/pins", {
        path,
        anchorTestId: composer.anchorTestId,
        anchorIndex: composer.anchorIndex,
        xPct: composer.xPct,
        yPct: composer.yPct,
        absX: composer.absX,
        absY: composer.absY,
        body: body.trim(),
        mentions: tagged,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pins", path] });
      setComposer(null);
      toast({ title: "Comment pinned", description: tagged.length ? "Tagged people were notified." : undefined });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't pin the comment", variant: "destructive" }),
  });

  const resolvePin = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/crm/pins/${id}`, { resolved: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pins", path] });
      setOpenPinId(null);
    },
  });
  const deletePin = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/pins/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pins", path] });
      setOpenPinId(null);
    },
  });

  // Edit an existing comment's text (author or owner/admin)
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const editPin = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) =>
      apiRequest("PATCH", `/api/crm/pins/${id}`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pins"] });
      setEditDraft(null);
      toast({ title: "Comment updated" });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't update the comment", variant: "destructive" }),
  });
  useEffect(() => setEditDraft(null), [openPinId]);

  const filteredUsers = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const list = users.filter((u) => u.id !== currentUser.id);
    return q ? list.filter((u) => u.name.toLowerCase().includes(q)) : list;
  }, [users, tagSearch, currentUser.id]);

  const openPin = pins.find((p) => p.id === openPinId) || null;
  const openPos = openPin ? positions[openPin.id] : null;

  const popoverStyle = (x: number, y: number): React.CSSProperties => ({
    left: Math.min(Math.max(x, 12), window.innerWidth - 332),
    top: Math.min(Math.max(y + 14, 12), window.innerHeight - 280),
  });

  return (
    <>
      {/* Comment mode — a real mode: tinted canvas, maroon frame, persistent banner */}
      {mode && (
        <div
          data-pin-overlay="1"
          onClick={handleModeClick}
          className="fixed inset-0 z-[95] cursor-crosshair"
          data-testid="pin-mode-overlay"
        >
          {/* Tint + frame must read over the dark sidebar too — full-opacity
              maroon edge at the true viewport bounds with an inward vignette. */}
          <div className="pointer-events-none absolute inset-0 animate-in fade-in bg-slate-900/10 duration-300" />
          <div className="pointer-events-none absolute inset-0 animate-in fade-in duration-500 shadow-[inset_0_0_0_3px_#711419,inset_0_0_48px_rgba(113,20,25,0.28)]" />
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-[4px] bg-slate-900 py-1.5 pl-3 pr-1.5 text-white shadow-xl" data-testid="pin-mode-banner">
              <MapPin className="h-4 w-4 fill-[#e8704f] text-slate-900" />
              <span className="text-xs font-medium">Comment mode — click anywhere to drop a pin</span>
              <button
                onClick={(e) => { e.stopPropagation(); setMode(false); }}
                className="rounded p-1 hover:bg-white/15"
                title="Exit comment mode"
                data-testid="pin-mode-exit"
                aria-label="Exit comment mode"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pins */}
      {pins.map((p) => {
        const pos = positions[p.id];
        if (!pos) return null;
        if (pos.y < -20 || pos.y > window.innerHeight + 20) return null;
        return (
          <button
            key={p.id}
            onClick={() => setOpenPinId(openPinId === p.id ? null : p.id)}
            className={`fixed z-[85] -translate-x-1/2 -translate-y-full transition-transform hover:scale-110 ${
              pulseId === p.id ? "animate-bounce" : ""
            }`}
            style={{ left: pos.x, top: pos.y }}
            title={`${p.createdByName || "Someone"}: ${p.body.slice(0, 60)}`}
            data-testid={`pin-${p.id}`}
          >
            <MapPin className="h-6 w-6 fill-[#711419] text-white drop-shadow-md" strokeWidth={1.5} />
          </button>
        );
      })}

      {/* Open pin card */}
      {openPin && openPos && (
        <div
          className="fixed z-[96] w-80 rounded-[4px] border border-slate-300/70 bg-white p-3.5 shadow-xl"
          style={popoverStyle(openPos.x, openPos.y)}
          data-testid="pin-card"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{openPin.createdByName || "Someone"}</p>
              <p className="text-[11px] text-slate-400">
                {format(new Date(openPin.created_at), "MMM d, h:mm a")}
                {openPin.edited_at ? " · edited" : ""}
              </p>
            </div>
            <button onClick={() => setOpenPinId(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {editDraft !== null ? (
            <>
              <Textarea
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="mt-2 min-h-[72px] resize-none text-sm"
                data-testid="pin-edit-body"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => setEditDraft(null)}>Cancel</Button>
                <Button
                  size="sm"
                  className="h-8 bg-[#711419] hover:bg-[#8a1a1f]"
                  disabled={!editDraft.trim() || editPin.isPending}
                  onClick={() => editPin.mutate({ id: openPin.id, body: editDraft.trim() })}
                  data-testid="pin-edit-save"
                >
                  {editPin.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                  Save
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{openPin.body}</p>
          )}
          {openPin.mentions?.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400">
              Tagged: {openPin.mentions.map((id) => users.find((u) => u.id === id)?.name || "user").join(", ")}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5">
            {(openPin.created_by === currentUser.id || ["owner", "admin"].includes(currentUser.role)) && (
              <>
                <button
                  onClick={() => setEditDraft(openPin.body)}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Edit"
                  data-testid="pin-edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deletePin.mutate(openPin.id)}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                  data-testid="pin-delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
            <Button size="sm" variant="outline" className="h-8" onClick={() => resolvePin.mutate(openPin.id)} data-testid="pin-resolve">
              <Check className="mr-1 h-3.5 w-3.5" /> Resolve
            </Button>
          </div>
        </div>
      )}

      {/* Composer */}
      {composer && (
        <>
          <MapPin
            className="pointer-events-none fixed z-[96] h-6 w-6 -translate-x-1/2 -translate-y-full fill-[#711419] text-white drop-shadow-md"
            style={{ left: composer.x, top: composer.y }}
            strokeWidth={1.5}
          />
          <div
            className="fixed z-[96] w-80 rounded-[4px] border border-slate-300/70 bg-white p-3.5 shadow-xl"
            style={popoverStyle(composer.x, composer.y)}
            data-testid="pin-composer"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">New comment</p>
            <Textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Leave a comment at this spot…"
              className="mt-2 min-h-[72px] resize-none text-sm"
              data-testid="pin-body"
            />
            <div className="mt-2.5">
              <Input
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Tag people…"
                className="h-8 text-xs"
                data-testid="pin-tag-search"
              />
              <div className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto">
                {filteredUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    <Checkbox
                      checked={tagged.includes(u.id)}
                      onCheckedChange={(on) =>
                        setTagged((prev) => (on ? [...prev, u.id] : prev.filter((id) => id !== u.id)))
                      }
                    />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2.5">
              <Button size="sm" variant="outline" className="h-8" onClick={() => setComposer(null)}>Cancel</Button>
              <Button
                size="sm"
                className="h-8 bg-[#711419] hover:bg-[#8a1a1f]"
                disabled={!body.trim() || createPin.isPending}
                onClick={() => createPin.mutate()}
                data-testid="pin-post"
              >
                {createPin.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MapPin className="mr-1 h-3.5 w-3.5" />}
                Pin comment
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
