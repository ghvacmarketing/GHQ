import { useState } from "react";
import { Check, ChevronDown, UserRound } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { AvatarWithRole, firstNameOf } from "@/components/user-avatar-badge";
import type { CrmUser } from "@shared/schema";

/** Teammate picker as a tile grid instead of a long row list: the whole
 *  roster fits one screen, everyone wears their metal initials avatar with
 *  the role badge on its shoulder (the profile-hero composition), you are
 *  pinned first, then seniority, then alphabetical. Used wherever a task
 *  (or anything else) gets assigned to a person. */

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, supervisor: 2, sales: 3, tech: 4 };
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  supervisor: "Supervisor",
  sales: "Sales",
  tech: "Tech",
};

export function AssigneeSheet({
  users,
  meId,
  value,
  onChange,
  variant = "boxed",
  label = "Assign to",
  placeholder = "Pick a teammate",
  testid,
}: {
  users: CrmUser[];
  meId?: string | null;
  value: string | null;
  onChange: (userId: string) => void;
  /** "boxed" form field (create pages) or a small "chip" pill (detail pages). */
  variant?: "boxed" | "chip";
  label?: string;
  placeholder?: string;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);

  const team = users
    .filter((u) => u.isActive !== false)
    .sort((a, b) => {
      if (a.id === meId) return -1;
      if (b.id === meId) return 1;
      const ra = ROLE_RANK[a.role] ?? 9;
      const rb = ROLE_RANK[b.role] ?? 9;
      if (ra !== rb) return ra - rb;
      return (a.name || "").localeCompare(b.name || "");
    });
  const current = users.find((u) => u.id === value);

  return (
    <>
      {variant === "boxed" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-white px-3.5 text-left shadow-xs"
          data-testid={testid}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {current ? (
              <AvatarWithRole name={current.name} role={current.role} size={26} />
            ) : (
              <UserRound className="h-5 w-5 shrink-0 text-slate-400" />
            )}
            <span className={`truncate text-base ${current ? "text-slate-900" : "text-muted-foreground"}`}>
              {current ? `${firstNameOf(current.name)}${current.id === meId ? " (me)" : ""}` : placeholder}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white py-1 pl-1.5 pr-3 text-sm font-medium text-slate-700 transition-transform active:scale-95"
          data-testid={testid}
        >
          {current ? (
            <AvatarWithRole name={current.name} role={current.role} size={24} />
          ) : (
            <UserRound className="ml-1 h-4 w-4 shrink-0 text-slate-400" />
          )}
          <span className="truncate">{current ? firstNameOf(current.name) : "Unassigned"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      )}

      <DraggableSheet nested open={open} onOpenChange={setOpen} title={label} testid={testid ? `${testid}-options` : undefined}>
        <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 pb-1">
          {team.map((u) => {
            const selected = u.id === value;
            const firstName = (u.name || "").trim().split(/\s+/)[0] || "—";
            return (
              <button
                key={u.id}
                onClick={() => {
                  onChange(u.id);
                  setOpen(false);
                }}
                className={`relative flex flex-col items-center rounded-[4px] border px-1.5 pb-2.5 pt-3 transition-transform active:scale-95 ${
                  selected ? "border-[#711419] bg-[#711419]/5" : "border-slate-300/70 bg-white"
                }`}
                data-testid={testid ? `${testid}-${u.id}` : undefined}
              >
                {selected && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#711419] text-white shadow-sm">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <AvatarWithRole name={u.name} role={u.role} size={56} />
                <span className="mt-1.5 w-full truncate text-center text-xs font-semibold text-slate-900">{firstName}</span>
                <span className="w-full truncate text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {u.id === meId ? "You" : ROLE_LABELS[u.role] || u.role}
                </span>
              </button>
            );
          })}
        </div>
      </DraggableSheet>
    </>
  );
}
