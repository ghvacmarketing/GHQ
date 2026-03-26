import { useState, useEffect, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  CheckCheck,
  ClipboardList,
  Inbox,
  Loader2,
  Trash2,
  MessageSquare,
} from "lucide-react";
import type { CrmUser, CrmNotification } from "@shared/schema";

type NotificationWithActor = CrmNotification & { actorName?: string | null };

export default function CrmNotifications() {
  usePageTitle("Notifications");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<"unread" | "all">("unread");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: notifications = [], isLoading, refetch } = useQuery<NotificationWithActor[]>({
    queryKey: ["/api/crm/notifications", tab],
    queryFn: async ({ queryKey }) => {
      const currentTab = queryKey[1] as string;
      const url = currentTab === "unread"
        ? "/api/crm/notifications?unreadOnly=true"
        : "/api/crm/notifications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!currentUser,
    refetchInterval: 5000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
  };

  const markReadMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/crm/notifications/${id}/read`),
    onSuccess: invalidateAll,
  });

  const markAllMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/crm/notifications/mark-all-read"),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "All marked as read" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/crm/notifications/${id}`),
    onSuccess: invalidateAll,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) navigate("/crm/login");
  }, [authLoading, currentUser, navigate]);

  if (authLoading) {
    return (
      <CrmLayout currentUser={currentUser as unknown as CrmUser}>
        <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
      </CrmLayout>
    );
  }
  if (!currentUser) return null;

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-500 mt-0.5">Task assignments and updates</p>
          </div>
          {hasUnread && (
            <Button
              variant="ghost" size="sm"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              className="text-xs text-slate-500"
            >
              {markAllMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <CheckCheck className="h-3.5 w-3.5 mr-1.5" />}
              Mark all read
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-6">
          {(["unread", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "unread" ? "Unread" : "All"}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-4 rounded-lg border border-slate-200">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-medium text-slate-600">
              {tab === "unread" ? "You're all caught up!" : "No notifications yet"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {tab === "unread"
                ? "No unread notifications."
                : "Notifications will appear here when tasks are assigned to you."}
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onMarkRead={() => markReadMut.mutate(n.id)}
                onDelete={() => deleteMut.mutate(n.id)}
                onNavigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </CrmLayout>
  );
}

function getLink(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "task": return `/crm/tasks/mine?highlight=${entityId}`;
    case "customer": return `/crm/customers/${entityId}`;
    case "lead": return "/crm/prospect-funnel";
    case "project": return `/crm/projects/${entityId}`;
    case "work_order": return `/crm/work-orders/${entityId}`;
    case "quote": return `/crm/quotes/${entityId}`;
    case "invoice": return `/crm/invoices/${entityId}`;
    case "agreement": return "/crm/agreements";
    case "tagged_comment": return null;
    default: return null;
  }
}

function NotificationRow({
  notification: n,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  notification: NotificationWithActor;
  onMarkRead: () => void;
  onDelete: () => void;
  onNavigate: (path: string) => void;
}) {
  const handleClick = async () => {
    if (!n.isRead) onMarkRead();
    if (n.entityType === "tagged_comment" && n.entityId) {
      try {
        const res = await fetch(`/api/crm/tagged-comments/lookup/${n.entityId}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.pageRoute) {
            const separator = data.pageRoute.includes("?") ? "&" : "?";
            window.location.href = `${data.pageRoute}${separator}highlightComment=${n.entityId}`;
            return;
          }
        }
      } catch (err) {
        console.error("Failed to lookup tagged comment route:", err);
      }
      return;
    }
    const link = getLink(n.entityType, n.entityId);
    if (link) {
      window.location.href = link;
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 group ${
        !n.isRead ? "bg-blue-50/40" : ""
      }`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
        n.type === "task_assigned" ? "bg-green-100" : n.type === "tagged_comment" ? "bg-amber-100" : "bg-slate-100"
      }`}>
        {n.type === "task_assigned" || n.type === "task_due"
          ? <ClipboardList className="h-4 w-4 text-green-600" />
          : n.type === "tagged_comment"
          ? <MessageSquare className="h-4 w-4 text-amber-600" />
          : <Bell className="h-4 w-4 text-slate-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!n.isRead ? "font-semibold text-slate-900" : "text-slate-700"}`}>
          {n.title}
        </p>
        {n.preview && (
          <p className="text-sm text-slate-500 mt-0.5 truncate">{n.preview}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-400">
            {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ""}
          </span>
          {n.actorName && <span className="text-xs text-slate-400">by {n.actorName}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {!n.isRead && (
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#711419" }} />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
          title="Delete notification"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
