import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, startOfWeek } from "date-fns";
import {
  Briefcase, ChevronRight, Clock, ListTodo, Loader2, LogOut, Mail, Phone, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MobileShell from "./mobile-shell";
import { SubPage } from "@/components/mobile/sub-page";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { clearCrmToken } from "@/lib/crmAuth";
import { userAvatarSrc } from "@/components/user-avatar-badge";
import { roleBadgeSrc } from "@/components/mobile/role-badge";
import type { CrmUser } from "@shared/schema";

/** Profile — the person, their day, and the doors they use most. Metal
 *  avatar hero, live "today" numbers, quick links, and a proper sign-out. */

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  supervisor: "Supervisor",
  sales: "Sales",
  tech: "Technician",
};

const fmtHours = (mins: number) => {
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return h > 0 ? `${h}h ${r.toString().padStart(2, "0")}m` : `${r}m`;
};

export default function MobileProfile() {
  const [, navigate] = useLocation();
  const { data: currentUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Live clock status — "On the clock · Job site since 8:02 AM"
  const { data: clock } = useQuery<{ entry?: { clockInAt: string; category?: string | null } | null }>({
    queryKey: ["/api/mobile/time/current"],
    queryFn: async () => {
      const res = await fetch("/api/mobile/time/current", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentUser,
    refetchInterval: 60 * 1000,
  });

  // Hours this week (their own timesheet)
  const weekFrom = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekTo = format(new Date(), "yyyy-MM-dd");
  const { data: weekEntries = [] } = useQuery<Array<{ durationMinutes?: number | null; clockInAt: string; clockOutAt?: string | null }>>({
    queryKey: ["/api/mobile/time/timesheet", "profile-week", weekFrom, weekTo],
    queryFn: async () => {
      const res = await fetch(`/api/mobile/time/timesheet?from=${weekFrom}&to=${weekTo}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.entries || [];
    },
    enabled: !!currentUser,
  });
  const weekMinutes = weekEntries.reduce((sum, e) => {
    if (e.durationMinutes) return sum + e.durationMinutes;
    if (e.clockOutAt) return sum + Math.max(0, Math.round((new Date(e.clockOutAt).getTime() - new Date(e.clockInAt).getTime()) / 60000));
    return sum + Math.max(0, Math.round((Date.now() - new Date(e.clockInAt).getTime()) / 60000));
  }, 0);

  // Their jobs today
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayJobs } = useQuery<{ workOrders?: Array<{ id: string }> }>({
    queryKey: ["/api/crm/work-orders", "profile-today", currentUser?.id, todayStr],
    queryFn: async () => {
      const res = await fetch(`/api/crm/work-orders?techId=${currentUser!.id}&date=${todayStr}&limit=25`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!currentUser?.id,
  });
  const jobsToday = todayJobs?.workOrders?.length ?? 0;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/crm/auth/logout");
    },
    onSuccess: () => {
      clearCrmToken();
      queryClient.clear();
      window.location.href = "/crm/login";
    },
  });

  const avatar = userAvatarSrc(currentUser?.name);
  const onClock = !!clock?.entry;

  return (
    <MobileShell>
      <SubPage backTo="/mobile">
        <div className="p-4 pt-16 space-y-4" data-testid="mobile-profile">
          {isLoading ? (
            <div className="rounded-[4px] border border-slate-300/70 bg-white pb-6 pt-6">
              <div className="flex flex-col items-center">
                <div className="mb-4 h-24 w-24 animate-pulse rounded-full bg-slate-200" />
                <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3.5 w-24 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ) : currentUser ? (
            <>
              {/* Hero — the metal badge, front and center */}
              <div className="rounded-[4px] border border-slate-300/70 bg-white px-4 pb-5 pt-6" data-testid="profile-hero">
                <div className="flex flex-col items-center text-center">
                  {avatar ? (
                    <img src={avatar} alt="" className="mb-3 h-24 w-24 select-none" draggable={false} />
                  ) : (
                    <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-[#711419] text-3xl font-semibold text-white">
                      {currentUser.name?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <h2 className="text-xl font-bold tracking-tight text-slate-900" data-testid="profile-name">
                    {currentUser.name}
                  </h2>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-300/70 bg-slate-50 py-1 pl-1.5 pr-3 text-xs font-semibold text-slate-700">
                    <img src={roleBadgeSrc(currentUser.role)} alt="" className="h-5 w-5 select-none" draggable={false} />
                    <span data-testid="profile-role">{ROLE_LABELS[currentUser.role] || currentUser.role}</span>
                  </span>
                  {currentUser.createdAt && (
                    <p className="mt-2 text-xs text-slate-400">
                      With Giesbrecht HVAC since {format(new Date(currentUser.createdAt), "MMMM yyyy")}
                    </p>
                  )}
                  <p className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${onClock ? "text-green-700" : "text-slate-400"}`} data-testid="profile-clock-status">
                    <span className={`h-2 w-2 rounded-full ${onClock ? "bg-green-500" : "bg-slate-300"}`} />
                    {onClock
                      ? `On the clock since ${format(new Date(clock!.entry!.clockInAt), "h:mm a")}`
                      : "Off the clock"}
                  </p>
                </div>
              </div>

              {/* Today at a glance */}
              <div className="grid grid-cols-2 gap-2" data-testid="profile-stats">
                <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-slate-900">{jobsToday}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Jobs today</p>
                </div>
                <div className="rounded-[4px] border border-slate-300/70 bg-white px-3 py-2.5">
                  <p className="text-lg font-bold tabular-nums text-slate-900">{fmtHours(weekMinutes)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hours this week</p>
                </div>
              </div>

              {/* Contact */}
              <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid="profile-contact">
                <div className="border-b border-slate-200 px-3.5 py-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</h3>
                </div>
                <div className="divide-y divide-slate-200 px-3.5">
                  <a
                    href={`mailto:${currentUser.email}`}
                    className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-slate-700"
                    data-testid="profile-email"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    <span className="truncate select-text [-webkit-user-select:text]">{currentUser.email}</span>
                  </a>
                  {currentUser.phone && (
                    <a
                      href={`tel:${currentUser.phone}`}
                      className="flex min-h-[44px] items-center gap-3 py-2.5 text-sm font-medium text-slate-700"
                      data-testid="profile-phone"
                    >
                      <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <span className="select-text [-webkit-user-select:text]">{currentUser.phone}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* My places */}
              <div className="overflow-hidden rounded-[4px] border border-slate-300/70 bg-white" data-testid="profile-links">
                {[
                  { label: "My timesheet", sub: "Clock history and hours", icon: Clock, to: "/mobile/time", testid: "profile-link-time" },
                  { label: "My jobs", sub: "Today, upcoming, and history", icon: Briefcase, to: "/mobile/job", testid: "profile-link-jobs" },
                  { label: "My tasks", sub: "Your to-do list", icon: ListTodo, to: "/mobile/tasks", testid: "profile-link-tasks" },
                ].map((row, i) => {
                  const Icon = row.icon;
                  return (
                    <button
                      key={row.label}
                      onClick={() => navigate(row.to)}
                      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-slate-50 ${i > 0 ? "border-t border-slate-200/80" : ""}`}
                      data-testid={row.testid}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{row.label}</span>
                        <span className="block truncate text-xs text-slate-500">{row.sub}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>

              {/* Sign out — unmistakable, but quiet until touched */}
              <button
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] border border-red-200 bg-red-50 text-sm font-semibold text-red-700 transition-transform active:scale-[0.98] disabled:opacity-60"
                data-testid="button-logout"
              >
                {logoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Sign out
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <User className="mb-4 h-16 w-16 text-slate-300" />
              <h2 className="mb-2 text-xl font-semibold text-slate-700">Not Signed In</h2>
              <Button
                onClick={() => (window.location.href = "/crm/login")}
                className="mt-4"
                data-testid="button-go-to-login"
              >
                Sign In
              </Button>
            </div>
          )}
        </div>
      </SubPage>
    </MobileShell>
  );
}
