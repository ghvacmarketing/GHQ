import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";

// Persisted across route changes (the module stays loaded even though CrmLayout
// re-mounts per page) so the nav doesn't jump back to the top when you click.
let navScrollPos = 0;
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { clearCrmToken } from "@/lib/crmAuth";
import { useCrmPrefetch } from "@/hooks/use-crm-prefetch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Home,
  LayoutDashboard,
  CalendarClock,
  Users,
  FileText,
  Receipt,
  ClipboardList,
  FileCheck,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  FolderKanban,
  Target,
  Megaphone,
  Package,
  BookOpen,
  Headset,
  Bell,
  Camera,
  ListTodo,
  Award,
  PenLine,
  Activity,
  Sparkles,
  MessageSquarePlus,
  Grip as AppGridIcon,
  Monitor as AppMonitorIcon,
  Smartphone as AppPhoneIcon,
  FolderOpen as AppDocsIcon,
  Calculator as AppAcctIcon,
  Megaphone as AppMktIcon,
  PanelLeftClose,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";
import ghqLogo from "@assets/redlogo.webp";
import GhqSearch, { openGlobalAI, openGlobalComment } from "./ghq-search";
import { TopNavSearch } from "./topnav-search";
import NotificationsDrawerContent from "./notifications-drawer";
import TaggedCommentsDisplay from "./tagged-comments-display";

interface CrmLayoutProps {
  children: React.ReactNode;
  currentUser: CrmUser;
  disableScroll?: boolean;
  hideGlobalSearch?: boolean;
  /** Render content edge-to-edge below the top bar (no gutter padding) — for app-shell pages like Messaging. */
  flush?: boolean;
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
  /** Extra path prefixes that light this item up (e.g. the Comms console spans phone/messaging/mail). */
  activePaths?: string[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/crm/dashboard", icon: LayoutDashboard },
      { label: "Dispatch Board", href: "/crm/dispatch", icon: CalendarClock },
      {
        label: "Comms",
        href: "/crm/phone",
        icon: Headset,
        activePaths: ["/crm/phone", "/crm/messaging", "/crm/mail"],
      },
      { label: "Notifications", href: "/crm/notifications", icon: Bell },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Customers", href: "/crm/customers", icon: Users },
      { label: "Agreements", href: "/crm/agreements", icon: FileCheck },
      { label: "Quotes", href: "/crm/quotes", icon: FileText },
      { label: "Invoices", href: "/crm/invoices", icon: Receipt },
      { label: "Photo Gallery", href: "/crm/photos", icon: Camera },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Work Orders", href: "/crm/work-orders", icon: ClipboardList },
      { label: "Environment Monitoring", href: "/crm/analytics", icon: Activity },
      { label: "Projects", href: "/crm/projects", icon: FolderKanban },
      { label: "Tasks", href: "/crm/tasks/board", icon: ListTodo },
      { label: "Rebate Programs", href: "/crm/rebate-programs", icon: Award },
      { label: "Signatures", href: "/crm/esign", icon: PenLine },
      { label: "Items", href: "/crm/items", icon: Package },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Lead Funnel", href: "/crm/prospect-funnel", icon: FolderKanban },
      { label: "Salesbook", href: "/crm/salesbook", icon: BookOpen },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Goals", href: "/crm/reports", icon: BarChart3 },
      { label: "Settings", href: "/crm/settings", icon: Settings },
    ],
  },
];

function NavItemComponent({
  item,
  isActive,
  onClick,
  collapsed = false,
}: {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const hasBadge = !!item.badgeCount && item.badgeCount > 0;

  return (
    <Link href={item.href} onClick={onClick}>
      <div
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex items-center rounded-md cursor-pointer transition-colors",
          collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-1.5",
          isActive
            ? "bg-white/[0.07] text-white"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
        )}
        data-testid={`nav-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-[#e8704f]" />
        )}
        <Icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-[#e8704f]")} />
        {!collapsed && <span className="text-[13px] font-medium">{item.label}</span>}
        {!collapsed && hasBadge ? (
          <span
            className="ml-auto flex min-w-[18px] items-center justify-center rounded-[3px] bg-[#e8704f] px-1 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums"
            data-testid={`badge-unread-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {item.badgeCount! > 99 ? "99+" : item.badgeCount}
          </span>
        ) : null}
        {collapsed && hasBadge ? (
          <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-[1px] bg-[#e8704f]" />
        ) : null}
      </div>
    </Link>
  );
}

function SidebarContent({
  currentUser,
  onItemClick,
  collapsed = false,
  onToggleCollapse,
}: {
  currentUser: CrmUser;
  onItemClick?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [location] = useLocation();
  const navScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = navScrollRef.current;
    if (el) el.scrollTop = navScrollPos;
  }, []);

  // Collapsed nav sections persist across sessions (click a section title to toggle)
  const [collapsedSections, setCollapsedSections] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("crmNavCollapsedSections") || "[]");
    } catch {
      return [];
    }
  });
  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      localStorage.setItem("crmNavCollapsedSections", JSON.stringify(next));
      return next;
    });
  };

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/crm/messaging/unread-count"],
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const { data: notificationCount } = useQuery<{ count: number }>({
    queryKey: ["/api/crm/notifications/unread-count"],
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/crm/auth/logout");
    },
    onSuccess: () => {
      clearCrmToken();
      queryClient.clear();
      sessionStorage.removeItem("crm_gate_passed");
      window.location.href = "/crm/login";
    },
  });

  const isActive = (href: string) => {
    if (href === "/crm/dashboard") {
      return location === "/crm" || location === "/crm/" || location === "/crm/dashboard";
    }
    return location.startsWith(href);
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "admin":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "sales":
        return "bg-green-500/20 text-green-300 border-green-500/30";
      case "tech":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gradient-to-b from-[#0f172a] to-[#020617]">
      <div className={cn("flex items-center gap-2.5 overflow-hidden border-b border-slate-700/50", collapsed ? "p-2 justify-center" : "p-4")}>
        {/* Logo is the constant element in both states (click to expand when collapsed) */}
        <button
          onClick={collapsed ? onToggleCollapse : undefined}
          title={collapsed ? "Expand sidebar" : undefined}
          className={cn("shrink-0 rounded-lg", collapsed && "transition-colors hover:opacity-80")}
          data-testid={collapsed ? "button-expand-sidebar" : undefined}
          {...(collapsed ? {} : { tabIndex: -1, "aria-hidden": true })}
        >
          <img src={ghqLogo} alt="GHQ Logo" className="h-9 w-9 rounded-lg object-contain brightness-0 invert" />
        </button>
        {/* Text + collapse toggle: clipped (overflow-hidden) + nowrap so they don't
            stack/wrap mid-animation while the sidebar width is transitioning. */}
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 overflow-hidden leading-tight">
              <h1 className="truncate whitespace-nowrap text-lg font-bold text-white" data-testid="text-sidebar-title">GHQ</h1>
              <p className="truncate whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-slate-400">Command Center</p>
            </div>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                data-testid="button-collapse-sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      <div
        ref={navScrollRef}
        onScroll={(e) => { navScrollPos = e.currentTarget.scrollTop; }}
        className={cn("flex-1 overflow-y-auto scrollbar-hide py-4", collapsed ? "px-2" : "px-3")}
      >
        <div className={collapsed ? "space-y-2" : "space-y-4"}>
          {navSections.map((section, idx) => {
            const sectionCollapsed = !collapsed && collapsedSections.includes(section.title);
            const sectionHasActive = section.items.some(
              (item) => isActive(item.href) || (item.activePaths ?? []).some((p) => location.startsWith(p)),
            );
            return (
              <div key={section.title}>
                {collapsed ? (
                  idx > 0 ? <div className="mx-2 mb-2 border-t border-slate-700/40" /> : null
                ) : (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="group mb-1 flex w-full items-center gap-1 rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-300"
                    data-testid={`section-toggle-${section.title.toLowerCase()}`}
                  >
                    <span>{section.title}</span>
                    {sectionCollapsed && sectionHasActive && (
                      <span className="h-1.5 w-1.5 rounded-[1px] bg-[#e8704f]" />
                    )}
                    <ChevronRight
                      className={cn(
                        "ml-auto h-3 w-3 text-slate-600 transition-transform duration-200 group-hover:text-slate-400",
                        !sectionCollapsed && "rotate-90",
                      )}
                    />
                  </button>
                )}
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ gridTemplateRows: sectionCollapsed ? "0fr" : "1fr" }}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        let itemWithBadge = item;
                        if (item.label === "Comms" && unreadData?.unreadCount) {
                          itemWithBadge = { ...item, badgeCount: unreadData.unreadCount };
                        } else if (item.label === "Notifications" && notificationCount?.count && notificationCount.count > 0) {
                          itemWithBadge = { ...item, badgeCount: notificationCount.count };
                        }
                        if (item.label === "Comms") {
                          // Reopen Comms on whichever tab was used last (default: Phone)
                          const last = localStorage.getItem("crmCommsLastTab");
                          if (last && (item.activePaths ?? []).some((p) => last.startsWith(p))) {
                            itemWithBadge = { ...itemWithBadge, href: last };
                          }
                        }
                        return (
                          <NavItemComponent
                            key={item.href}
                            item={itemWithBadge}
                            isActive={isActive(item.href) || (item.activePaths ?? []).some((p) => location.startsWith(p))}
                            onClick={onItemClick}
                            collapsed={collapsed}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={cn("border-t border-slate-700/50", collapsed ? "p-2" : "p-3")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="h-9 w-9 rounded-md bg-[#711419] flex items-center justify-center text-white text-xs font-semibold"
              title={currentUser?.name || "User"}
              data-testid="text-sidebar-user-name"
            >
              {currentUser?.name
                ? currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                : "U"}
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title="Log out"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white disabled:opacity-50"
              data-testid="button-sidebar-logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/40 p-1.5">
            <div className="h-7 w-7 shrink-0 rounded-md bg-[#711419] flex items-center justify-center text-white text-[11px] font-semibold">
              {currentUser?.name
                ? currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                : "U"}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-white" data-testid="text-sidebar-user-name">
                {currentUser?.name || "User"}
              </p>
              <p className="truncate text-[11px] capitalize text-slate-400" data-testid="text-sidebar-user-role">
                {currentUser?.role || "User"}
              </p>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title="Log out"
              className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white disabled:opacity-50"
              data-testid="button-sidebar-logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CrmLayout({ children, currentUser, disableScroll = false, hideGlobalSearch = false, flush = false }: CrmLayoutProps) {
  const [, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("crm_sidebar_collapsed") === "1"
  );
  const [topNavCollapsed, setTopNavCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("crm_topnav_collapsed") === "1"
  );

  useEffect(() => {
    localStorage.setItem("crm_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem("crm_topnav_collapsed", topNavCollapsed ? "1" : "0");
  }, [topNavCollapsed]);

  useCrmPrefetch(!!currentUser);

  // Shared queryKey with SidebarContent — TanStack deduplicates the network call,
  // only one request fires every 30s. Used here for the top-right bell badge.
  const { data: notificationCount } = useQuery<{ count: number }>({
    queryKey: ["/api/crm/notifications/unread-count"],
    refetchInterval: 30000,
    staleTime: 25000,
  });

  // One shared motion spec for the whole chrome: sidebar width, top-bar
  // position, content margin/padding all move together on the same curve,
  // and the sidebar's two interiors crossfade while the width eases.
  const CHROME_MOTION = "duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]";

  return (
    <div className="h-screen overflow-hidden bg-background flex">
      <aside
        className={cn(
          // The aside carries the same opaque backdrop as the interiors so the
          // crossfade never lets the page behind bleed through (no flash).
          "hidden lg:block flex-shrink-0 fixed inset-y-0 left-0 z-40 overflow-hidden bg-gradient-to-b from-[#0f172a] to-[#020617] transition-[width]",
          CHROME_MOTION,
          sidebarCollapsed ? "w-[64px]" : "w-56"
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex w-56 transition-opacity duration-300",
            sidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100"
          )}
        >
          <SidebarContent
            currentUser={currentUser}
            collapsed={false}
            onToggleCollapse={() => setSidebarCollapsed(true)}
          />
        </div>
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex w-[64px] transition-opacity duration-300",
            sidebarCollapsed ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <SidebarContent
            currentUser={currentUser}
            collapsed
            onToggleCollapse={() => setSidebarCollapsed(false)}
          />
        </div>
      </aside>

      <div
        className={cn(
          "hidden lg:flex fixed top-0 right-0 z-40 bg-background border-b h-14 items-center gap-4 px-5 transition-[left,transform]",
          CHROME_MOTION,
          sidebarCollapsed ? "left-[64px]" : "left-56",
          topNavCollapsed && "-translate-y-full"
        )}
      >
        <div className="flex flex-1 items-center">
          {/* App switcher — jump between GHQ apps */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 px-2.5" title="Switch app" data-testid="button-app-switcher">
                <AppGridIcon className="h-5 w-5 text-slate-600" />
                <span className="text-sm font-medium text-slate-600">Apps</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Apps</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate("/mobile")} data-testid="app-switch-field">
                <AppPhoneIcon className="mr-2 h-4 w-4 text-slate-500" /> Field
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/documents")} data-testid="app-switch-documents">
                <AppDocsIcon className="mr-2 h-4 w-4 text-slate-500" /> Documents
              </DropdownMenuItem>
              {["owner", "admin", "supervisor"].includes(currentUser?.role || "") && (
                <DropdownMenuItem onClick={() => navigate("/accounting")} data-testid="app-switch-accounting">
                  <AppAcctIcon className="mr-2 h-4 w-4 text-slate-500" /> Accounting
                </DropdownMenuItem>
              )}
              {["owner", "admin", "supervisor", "sales"].includes(currentUser?.role || "") && (
                <DropdownMenuItem onClick={() => navigate("/marketing")} data-testid="app-switch-marketing">
                  <AppMktIcon className="mr-2 h-4 w-4 text-slate-500" /> Marketing
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/")} data-testid="app-switch-home">
                <AppMonitorIcon className="mr-2 h-4 w-4 text-slate-500" /> All apps
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Global customer-related search — inline dropdown of linked records, centered */}
        <TopNavSearch />

        <div className="flex flex-1 items-center justify-end gap-1.5">
          <Button variant="ghost" size="icon" onClick={openGlobalAI} title="Ask AI" data-testid="button-topnav-ai">
            <Sparkles className="h-5 w-5 text-slate-600" />
          </Button>
          <Button variant="ghost" size="icon" onClick={openGlobalComment} title="Leave a comment" data-testid="button-topnav-comment">
            <MessageSquarePlus className="h-5 w-5 text-slate-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setNotificationsOpen(true)}
            data-testid="button-topnav-notifications"
          >
            <Bell className="h-5 w-5 text-slate-600" />
            {(notificationCount?.count ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-[3px] bg-[#711419] px-1 text-[9px] font-semibold leading-none text-white tabular-nums">
                {notificationCount!.count > 99 ? "99+" : notificationCount!.count}
              </span>
            )}
          </Button>
          <div className="ml-1 flex items-center border-l border-border pl-3">
            <span className="text-sm font-medium text-slate-600">{currentUser?.name || "User"}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-8 w-8"
            onClick={() => setTopNavCollapsed(true)}
            title="Hide top bar"
            data-testid="button-collapse-topnav"
          >
            <ChevronUp className="h-4 w-4 text-slate-600" />
          </Button>
        </div>
      </div>
      {/* Centered reveal handle — slides/fades in when the top bar is hidden */}
      <button
        onClick={() => setTopNavCollapsed(false)}
        title="Show top bar"
        className={cn(
          "hidden lg:flex fixed top-0 left-1/2 z-40 h-6 items-center gap-1 rounded-b-md border border-t-0 border-border bg-background px-3 text-xs font-medium text-muted-foreground shadow-sm transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-foreground",
          topNavCollapsed ? "-translate-x-1/2 translate-y-0 opacity-100" : "-translate-x-1/2 -translate-y-full opacity-0 pointer-events-none"
        )}
        data-testid="button-expand-topnav"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 border-0">
                <SidebarContent
                  currentUser={currentUser}
                  onItemClick={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <img src={ghqLogo} alt="GHQ Logo" className="h-7 w-7 rounded object-contain" />
              <span className="font-bold text-slate-800" data-testid="text-mobile-title">
                GHQ
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell className="h-5 w-5" />
              {(notificationCount?.count ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-[3px] bg-[#711419] px-1 text-[9px] font-semibold leading-none text-white tabular-nums">
                  {notificationCount!.count > 99 ? "99+" : notificationCount!.count}
                </span>
              )}
            </Button>
            <span className="text-sm font-medium text-slate-600">
              {currentUser?.name?.split(" ")[0] || "User"}
            </span>
          </div>
        </div>
      </div>

      <main
        className={cn(
          "flex-1 overflow-x-hidden transition-[margin]",
          CHROME_MOTION,
          sidebarCollapsed ? "lg:ml-[64px]" : "lg:ml-56"
        )}
      >
        {disableScroll ? (
          <div
            className={cn(
              "h-screen overflow-hidden flex flex-col bg-background pt-16 transition-[padding]",
              CHROME_MOTION,
              topNavCollapsed ? "lg:pt-0" : "lg:pt-14"
            )}
          >
            <div className={cn("flex-1 min-h-0 flex flex-col", !flush && "px-4 py-4 lg:px-5 lg:py-5")}>{children}</div>
          </div>
        ) : (
          <div
            className={cn(
              "h-screen overflow-y-auto overflow-x-hidden bg-background pt-16 transition-[padding]",
              CHROME_MOTION,
              topNavCollapsed ? "lg:pt-0" : "lg:pt-14"
            )}
          >
            <div className={cn("overflow-x-hidden", !flush && "px-4 py-4 lg:px-5 lg:py-5")}>{children}</div>
          </div>
        )}
      </main>
      <GhqSearch showFab={!hideGlobalSearch} />
      <TaggedCommentsDisplay />
      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-full sm:w-96 p-0">
          <NotificationsDrawerContent onClose={() => setNotificationsOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default CrmLayout;
