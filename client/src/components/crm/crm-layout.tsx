import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { clearCrmToken } from "@/lib/crmAuth";
import { useCrmPrefetch } from "@/hooks/use-crm-prefetch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
  Phone,
  Smartphone,
  MessageSquare,
  Bell,
  ListTodo,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";
import ghqLogo from "@assets/redlogo.webp";
import GhqSearch from "./ghq-search";
import NotificationsDrawerContent from "./notifications-drawer";

interface CrmLayoutProps {
  children: React.ReactNode;
  currentUser: CrmUser;
  disableScroll?: boolean;
  hideGlobalSearch?: boolean;
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
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
      { label: "Phone", href: "/crm/phone", icon: Phone },
      { label: "Messaging", href: "/crm/messaging", icon: MessageSquare },
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
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Work Orders", href: "/crm/work-orders", icon: ClipboardList },
      { label: "Projects", href: "/crm/projects", icon: FolderKanban },
      { label: "Tasks", href: "/crm/tasks/board", icon: ListTodo },
      { label: "Items", href: "/crm/items", icon: Package },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Lead Funnel", href: "/crm/prospect-funnel", icon: FolderKanban },
    ],
  },
  {
    title: "Other",
    items: [
      { label: "Goals", href: "/crm/reports", icon: BarChart3 },
      { label: "Marketing", href: "/crm/marketing", icon: Megaphone },
      { label: "Settings", href: "/crm/settings", icon: Settings },
    ],
  },
];

function NavItemComponent({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link href={item.href} onClick={onClick}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 group ${
          isActive
            ? "bg-[#711419] text-white font-semibold"
            : "text-slate-300 hover:bg-slate-800 hover:text-white"
        }`}
        data-testid={`nav-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm font-medium">{item.label}</span>
        {item.badgeCount && item.badgeCount > 0 ? (
          <Badge 
            className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] text-center"
            data-testid={`badge-unread-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {item.badgeCount > 99 ? "99+" : item.badgeCount}
          </Badge>
        ) : isActive ? (
          <ChevronRight className="h-4 w-4 ml-auto opacity-70" />
        ) : null}
      </div>
    </Link>
  );
}

function SidebarContent({
  currentUser,
  onItemClick,
}: {
  currentUser: CrmUser;
  onItemClick?: () => void;
}) {
  const [location] = useLocation();

  // Fetch unread message count with polling
  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/crm/messaging/unread-count"],
    refetchInterval: 10000, // Poll every 10 seconds
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
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 via-slate-900 to-[#1a1015]">
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <img src={ghqLogo} alt="GHQ Logo" className="h-10 w-10 rounded-lg object-contain brightness-0 invert" />
          <div>
            <h1 className="text-lg font-bold text-white" data-testid="text-sidebar-title">
              GHQ
            </h1>
            <p className="text-xs text-slate-400">Management System</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 overflow-y-auto scrollbar-hide">
        <div className="space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  // Add unread count badge to Messaging nav item
                  const itemWithBadge = item.label === "Messaging" && unreadData?.unreadCount
                    ? { ...item, badgeCount: unreadData.unreadCount }
                    : item;
                  return (
                    <NavItemComponent
                      key={item.href}
                      item={itemWithBadge}
                      isActive={isActive(item.href)}
                      onClick={onItemClick}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-slate-700/50">
        {currentUser?.role !== "tech" && (
          <Link href="/mobile" onClick={onItemClick}>
            <div
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-slate-300 hover:bg-slate-800 hover:text-white mb-2"
              data-testid="nav-item-mobile-view"
            >
              <Smartphone className="h-5 w-5" />
              <span className="text-sm font-medium">Mobile View</span>
            </div>
          </Link>
        )}
        <Link href="/" onClick={onItemClick}>
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-slate-300 hover:bg-slate-800 hover:text-white mb-2"
            data-testid="nav-item-home"
          >
            <Home className="h-5 w-5" />
            <span className="text-sm font-medium">Back to Main App</span>
          </div>
        </Link>

        <div className="p-3 bg-slate-800/50 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#711419] flex items-center justify-center text-white font-semibold text-sm">
              {currentUser?.name
                ? currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                : "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium text-white truncate"
                data-testid="text-sidebar-user-name"
              >
                {currentUser?.name || "User"}
              </p>
              <Badge
                className={`text-xs capitalize mt-0.5 border ${getRoleBadgeClass(
                  currentUser?.role || "user"
                )}`}
                data-testid="badge-sidebar-user-role"
              >
                {currentUser?.role || "User"}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-sidebar-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CrmLayout({ children, currentUser, disableScroll = false, hideGlobalSearch = false }: CrmLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  
  useCrmPrefetch(!!currentUser);

  const { data: notificationCount } = useQuery<{ count: number }>({
    queryKey: ["/api/crm/notifications/unread-count"],
  });

  return (
    <div className="min-h-screen bg-white flex">
      <aside className="hidden lg:flex w-60 flex-shrink-0 fixed inset-y-0 left-0 z-40">
        <SidebarContent currentUser={currentUser} />
      </aside>

      <div className="hidden lg:flex fixed top-0 left-60 right-0 z-40 bg-white border-b h-14 items-center justify-end px-6 gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => setNotificationsOpen(true)}
        >
          <Bell className="h-5 w-5 text-slate-600" />
          {notificationCount?.count && notificationCount.count > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {notificationCount.count > 99 ? "99+" : notificationCount.count}
            </span>
          )}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">{currentUser?.name || "User"}</span>
          <div className="w-8 h-8 rounded-full bg-[#711419] flex items-center justify-center text-white font-semibold text-xs">
            {currentUser?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
          </div>
        </div>
      </div>

      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm">
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
              {notificationCount?.count && notificationCount.count > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {notificationCount.count > 99 ? "99+" : notificationCount.count}
                </span>
              )}
            </Button>
            <span className="text-sm font-medium text-slate-600">
              {currentUser?.name?.split(" ")[0] || "User"}
            </span>
            <div className="w-8 h-8 rounded-full bg-[#711419] flex items-center justify-center text-white font-semibold text-xs">
              {currentUser?.name
                ? currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                : "U"}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 lg:ml-60 overflow-x-hidden">
        {disableScroll ? (
          <div className="h-screen pt-16 lg:pt-14 overflow-hidden">
            <div className="h-full p-4 lg:p-6 overflow-hidden">{children}</div>
          </div>
        ) : (
          <div className="h-screen pt-16 lg:pt-14 overflow-y-auto">
            <div className="p-4 lg:p-6">{children}</div>
          </div>
        )}
      </main>
      {!hideGlobalSearch && <GhqSearch />}
      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-full sm:w-96 p-0">
          <NotificationsDrawerContent onClose={() => setNotificationsOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default CrmLayout;
