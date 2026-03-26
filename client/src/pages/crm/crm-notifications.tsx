import { useState, useEffect, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  formatDistanceToNow,
  isToday,
  isYesterday,
  isThisWeek,
} from "date-fns";
import {
  Bell,
  Search,
  CheckCheck,
  AtSign,
  ClipboardList,
  Settings,
  Inbox,
  Loader2,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import type { CrmUser, CrmNotification } from "@shared/schema";

type NotificationWithActor = CrmNotification & {
  actorName?: string | null;
};

type DateGroup = "Today" | "Yesterday" | "This Week" | "Earlier";

function getDateGroup(dateStr: string | Date | null): DateGroup {
  if (!dateStr) return "Earlier";
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date, { weekStartsOn: 0 })) return "This Week";
  return "Earlier";
}

function groupNotificationsByDate(
  notifications: NotificationWithActor[]
): Record<DateGroup, NotificationWithActor[]> {
  const groups: Record<DateGroup, NotificationWithActor[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Earlier: [],
  };
  for (const n of notifications) {
    groups[getDateGroup(n.createdAt)].push(n);
  }
  return groups;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "mention":
      return <AtSign className="h-4 w-4 text-blue-500" />;
    case "task_assigned":
    case "task_due":
      return <ClipboardList className="h-4 w-4 text-green-600" />;
    case "comment":
      return <MessageCircle className="h-4 w-4 text-purple-500" />;
    case "status_change":
      return <RefreshCw className="h-4 w-4 text-amber-500" />;
    case "system":
      return <Settings className="h-4 w-4 text-slate-500" />;
    default:
      return <Bell className="h-4 w-4 text-slate-400" />;
  }
}

function getEntityLink(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  const routes: Record<string, string> = {
    lead: "/crm/prospect-funnel",
    project: `/crm/projects/${entityId}`,
    work_order: `/crm/work-orders/${entityId}`,
    quote: `/crm/quotes/${entityId}`,
    invoice: `/crm/invoices/${entityId}`,
    customer: `/crm/customers/${entityId}`,
    agreement: `/crm/agreements`,
  };
  return routes[entityType] || null;
}

function getEntityBadgeLabel(entityType: string | null): string {
  if (!entityType) return "";
  const labels: Record<string, string> = {
    lead: "Lead",
    project: "Project",
    work_order: "Work Order",
    quote: "Quote",
    invoice: "Invoice",
    customer: "Customer",
    agreement: "Agreement",
    task: "Task",
  };
  return labels[entityType] || entityType;
}

const DATE_GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "This Week", "Earlier"];

export default function CrmNotifications() {
  usePageTitle("Notifications");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (tab === "unread") p.set("unreadOnly", "true");
    if (typeFilter !== "all") p.set("type", typeFilter);
    return p.toString();
  }, [tab, typeFilter]);

  const {
    data: notifications = [],
    isLoading: notificationsLoading,
    refetch,
  } = useQuery<NotificationWithActor[]>({
    queryKey: ["/api/crm/notifications", queryParams],
    queryFn: async () => {
      const url = queryParams
        ? `/api/crm/notifications?${queryParams}`
        : "/api/crm/notifications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const invalidate = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
  };

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/crm/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/crm/notifications/mark-all-read"),
    onSuccess: () => {
      invalidate();
      setSelectedIds(new Set());
      toast({ title: "All notifications marked as read" });
    },
    onError: () => toast({ title: "Failed to mark all as read", variant: "destructive" }),
  });

  const markSelectedReadMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => apiRequest("PATCH", `/api/crm/notifications/${id}/read`))),
    onSuccess: () => {
      invalidate();
      setSelectedIds(new Set());
      toast({ title: "Marked as read" });
    },
    onError: () => toast({ title: "Failed to mark as read", variant: "destructive" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab, typeFilter]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return notifications;
    const q = searchQuery.toLowerCase();
    return notifications.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.preview && n.preview.toLowerCase().includes(q))
    );
  }, [notifications, searchQuery]);

  const grouped = useMemo(() => groupNotificationsByDate(filtered), [filtered]);

  if (authLoading) {
    return (
      <CrmLayout currentUser={currentUser as unknown as CrmUser}>
        <div className="max-w-3xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  if (!currentUser) return null;

  const hasNotifications = filtered.length > 0;
  const allSelected = hasNotifications && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <CrmLayout currentUser={currentUser}>
      {/*
        Use a full-viewport-height container that shrinks only when content
        overflows (normal page scroll). The bg-white from CrmLayout already
        covers the whole screen so we just need flex-col + min-h to ensure
        the empty state can be properly centred in the remaining space.
      */}
      <div className="flex flex-col" style={{ minHeight: "calc(100vh - 7rem)" }}>

        {/* ── Header ── */}
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Mentions, task assignments, and system updates
          </p>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Unread / All toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {(["unread", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  tab === t
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t === "unread" ? "Unread" : "All"}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-white border-slate-200">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="mention">Mentions</SelectItem>
              <SelectItem value="task_assigned">Tasks</SelectItem>
              <SelectItem value="comment">Comments</SelectItem>
              <SelectItem value="status_change">Status changes</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm bg-white border-slate-200 focus-visible:ring-[#711419]/30"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {selectedIds.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markSelectedReadMutation.mutate(Array.from(selectedIds))}
                disabled={markSelectedReadMutation.isPending}
                className="h-8 text-xs border-slate-200"
              >
                {markSelectedReadMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                )}
                Mark {selectedIds.size} read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending || !hasNotifications}
              className="h-8 text-xs text-slate-500 hover:text-slate-700"
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              )}
              Mark all read
            </Button>
          </div>
        </div>

        {/* Select-all row */}
        {hasNotifications && (
          <div className="flex items-center gap-2 px-1 mb-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => {
                setSelectedIds(v ? new Set(filtered.map((n) => n.id)) : new Set());
              }}
              aria-label="Select all"
              className={someSelected ? "data-[state=checked]:bg-slate-400" : ""}
            />
            <span className="text-xs text-slate-400">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
            </span>
          </div>
        )}

        {/* ── Content ── */}
        {notificationsLoading ? (
          <div className="max-w-3xl space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : !hasNotifications ? (
          /* Empty state — centred in remaining vertical space */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
            <Inbox className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-base font-medium text-slate-600">
              {tab === "unread" ? "You're all caught up!" : "No notifications yet"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {tab === "unread"
                ? "No unread notifications."
                : "Notifications appear here when tasks are assigned or you're mentioned."}
            </p>
          </div>
        ) : (
          <div className="max-w-3xl space-y-6 pb-8">
            {DATE_GROUP_ORDER.map((group) => {
              const items = grouped[group];
              if (!items.length) return null;
              return (
                <div key={group}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                    {group}
                  </p>
                  <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {items.map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 px-3 py-3 transition-colors hover:bg-slate-50 ${
                          !n.isRead ? "bg-slate-50/70" : ""
                        }`}
                      >
                        <Checkbox
                          checked={selectedIds.has(n.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selectedIds);
                            v ? next.add(n.id) : next.delete(n.id);
                            setSelectedIds(next);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select"
                          className="mt-0.5 flex-shrink-0"
                        />

                        <div
                          className="flex-1 min-w-0 flex gap-3 cursor-pointer"
                          onClick={() => {
                            if (!n.isRead) markAsReadMutation.mutate(n.id);
                            const link = getEntityLink(n.entityType, n.entityId);
                            if (link) navigate(link);
                          }}
                        >
                          {/* Icon */}
                          <div className="flex-shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100">
                            {getNotificationIcon(n.type)}
                          </div>

                          {/* Body */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm leading-snug ${
                                !n.isRead ? "font-semibold text-slate-900" : "text-slate-700"
                              }`}
                            >
                              {n.title}
                            </p>
                            {n.preview && (
                              <p className="text-sm text-slate-500 line-clamp-2 mt-0.5">
                                {n.preview}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs text-slate-400">
                                {n.createdAt
                                  ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })
                                  : ""}
                              </span>
                              {n.entityType && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 text-slate-500 border-0"
                                >
                                  {getEntityBadgeLabel(n.entityType)}
                                </Badge>
                              )}
                              {n.actorName && (
                                <div className="flex items-center gap-1">
                                  <Avatar className="h-4 w-4">
                                    <AvatarFallback className="text-[9px] bg-slate-200 text-slate-600">
                                      {n.actorName
                                        .split(" ")
                                        .map((s) => s[0])
                                        .join("")
                                        .toUpperCase()
                                        .slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs text-slate-400">{n.actorName}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Unread dot */}
                          {!n.isRead && (
                            <div className="flex-shrink-0 mt-2">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: "#711419" }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
