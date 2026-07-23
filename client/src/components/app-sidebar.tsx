import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppSidebarItem = { key: string; label: string; icon: LucideIcon };
export type AppSidebarGroup = { label?: string; items: AppSidebarItem[] };

const MOTION = "duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]";

/** The CRM's dark collapsible side panel, reused by the app shells
 *  (Documents / Accounting / Marketing). Same backdrop, item styling,
 *  motion spec, and interior crossfade as the CRM sidebar. */
export function AppSidebar({
  appKey,
  groups,
  activeKey,
  onSelect,
}: {
  /** localStorage namespace for the collapsed state, e.g. "docs" */
  appKey: string;
  groups: AppSidebarGroup[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(`${appKey}_sidebar_collapsed`) === "1",
  );
  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem(`${appKey}_sidebar_collapsed`, v ? "0" : "1");
      return !v;
    });
  };

  const interior = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col">
      <nav className="scrollbar-hide flex-1 overflow-y-auto py-3" style={{ width: isCollapsed ? 64 : 224 }}>
        <div className={cn(isCollapsed ? "space-y-2 px-2" : "space-y-4 px-3")}>
          {groups.map((g, gi) => (
            <div key={g.label ?? gi}>
              {isCollapsed ? (
                gi > 0 ? <div className="mx-2 mb-2 border-t border-slate-700/40" /> : null
              ) : g.label ? (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
              ) : null}
              <div className="space-y-1">
                {g.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeKey === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => onSelect(item.key)}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "relative flex w-full items-center rounded-md transition-colors",
                        isCollapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5",
                        active
                          ? "bg-white/[0.07] text-white"
                          : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
                      )}
                      data-testid={`${appKey}-nav-${item.key}`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-[#e8704f]" />
                      )}
                      <Icon className={cn("h-4 w-4 flex-shrink-0", active && "text-[#e8704f]")} strokeWidth={1.75} />
                      {!isCollapsed && <span className="truncate text-[13px] font-medium">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className={cn("border-t border-slate-700/50", isCollapsed ? "p-2" : "p-2.5")}>
        <button
          onClick={toggle}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center rounded-md py-2 text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white",
            isCollapsed ? "justify-center" : "gap-2.5 px-2.5",
          )}
          data-testid={`${appKey}-sidebar-toggle`}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!isCollapsed && <span className="text-[13px] font-medium">Collapse</span>}
        </button>
      </div>
    </div>
  );

  return (
    <aside
      className={cn(
        // Opaque backdrop matches the interiors so the crossfade never flashes
        "relative hidden shrink-0 overflow-hidden bg-gradient-to-b from-[#0f172a] to-[#020617] transition-[width] sm:block",
        MOTION,
        collapsed ? "w-[64px]" : "w-56",
      )}
      data-testid={`${appKey}-sidebar`}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-56 transition-opacity duration-300",
          collapsed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {interior(false)}
      </div>
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[64px] transition-opacity duration-300",
          collapsed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {interior(true)}
      </div>
    </aside>
  );
}
