import { useState, useEffect } from "react";
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
  CheckCircle2,
  AlertCircle,
  Settings,
  AtSign,
  Circle,
  ArrowUpRight,
  Send,
  ArrowDownLeft,
} from "lucide-react";
import type { CrmUser, CrmNotification } from "@shared/schema";

type NotificationWithActor = CrmNotification & { actorName?: string | null };

interface TaggedCommentHistoryItem {
  id: string;
  body: string;
  pageRoute: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  role: "author" | "recipient";
}

const typeFilters = [
  { key: "all", label: "All", queryType: "" },
  { key: "tasks", label: "Tasks", queryType: "task_assigned,task_due" },
  { key: "tagged_comment", label: "Tagged Notes", queryType: "tagged_comment" },
  { key: "mention", label: "Mentions", queryType: "mention" },
  { key: "system", label: "System", queryType: "system" },
] as const;

type TypeFilterKey = typeof typeFilters[number]["key"];

export default function CrmNotifications() {
  usePageTitle("Notifications");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>("all");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: notifications = [], isLoading } = useQuery<NotificationWithActor[]>({
    queryKey: ["/api/crm/notifications", tab, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tab === "unread") params.set("unreadOnly", "true");
      const activeFilter = typeFilters.find(f => f.key === typeFilter);
      if (activeFilter && activeFilter.queryType) params.set("type", activeFilter.queryType);
      const url = `/api/crm/notifications?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!currentUser,
    refetchInterval: 5000,
  });

  const { data: taggedHistory = [] } = useQuery<TaggedCommentHistoryItem[]>({
    queryKey: ["/api/crm/tagged-comments/history"],
    queryFn: async () => {
      const res = await fetch("/api/crm/tagged-comments/history", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser && typeFilter === "tagged_comment",
    refetchInterval: 10000,
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

  const showTaggedNotesView = typeFilter === "tagged_comment" && tab === "all";

  function buildHighlightUrl(pageRoute: string, commentId: string) {
    const separator = pageRoute.includes("?") ? "&" : "?";
    return `${pageRoute}${separator}highlightComment=${commentId}`;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-500 mt-0.5">Task assignments, tagged notes, and updates</p>
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

        <div className="flex items-center gap-6 border-b border-slate-200 mb-6 overflow-x-auto">
          {(["unread", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                tab === t
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "unread" ? "Unread" : "All"}
            </button>
          ))}
          {typeFilters.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTypeFilter(tf.key)}
              className={`pb-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                typeFilter === tf.key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {showTaggedNotesView && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-500" />
              All Tagged Notes
              <span className="text-xs font-normal text-slate-400">({taggedHistory.length})</span>
            </h2>
            {taggedHistory.length === 0 ? (
              <div className="text-center py-10 border border-slate-200 rounded-lg">
                <MessageSquare className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No tagged notes yet</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden mb-6">
                {taggedHistory.map((item) => (
                  <TaggedNoteHistoryRow key={`${item.id}-${item.role}`} item={item} currentUserId={currentUser.id} buildUrl={buildHighlightUrl} />
                ))}
              </div>
            )}
            {notifications.length > 0 && (
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                Tagged Note Notifications
              </h2>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-4 rounded-lg border border-slate-200">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 && !showTaggedNotesView ? (
          <div className="text-center py-20">
            <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-medium text-slate-600">
              {tab === "unread" ? "You're all caught up!" : "No notifications yet"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {tab === "unread"
                ? "No unread notifications."
                : typeFilter !== "all"
                ? `No ${typeFilters.find(f => f.key === typeFilter)?.label.toLowerCase()} notifications.`
                : "Notifications will appear here when tasks are assigned to you."}
            </p>
          </div>
        ) : notifications.length === 0 && showTaggedNotesView ? null : (
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

function TaggedNoteHistoryRow({ item, currentUserId, buildUrl }: { item: TaggedCommentHistoryItem; currentUserId: string; buildUrl: (route: string, id: string) => string }) {
  const isSent = item.role === "author";
  const pageName = item.pageRoute.split("/").filter(Boolean).pop() || item.pageRoute;

  return (
    <a
      href={buildUrl(item.pageRoute, item.id)}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 group"
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
        isSent ? "bg-blue-50" : "bg-amber-50"
      }`}>
        {isSent ? (
          <Send className="h-4 w-4 text-blue-500" />
        ) : (
          <ArrowDownLeft className="h-4 w-4 text-amber-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-700 truncate">
            {isSent ? (
              <span>You left a note</span>
            ) : (
              <span><span className="font-medium">{item.authorName}</span> left you a note</span>
            )}
          </p>
          {item.resolved ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium flex-shrink-0">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Resolved
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium flex-shrink-0">
              <Circle className="h-2.5 w-2.5" />
              Open
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-0.5 truncate">{item.body}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-400">
            {item.createdAt ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) : ""}
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-0.5">
            <ArrowUpRight className="h-3 w-3" />
            {pageName}
          </span>
        </div>
      </div>
    </a>
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

function getIcon(type: string) {
  switch (type) {
    case "task_assigned":
    case "task_due":
      return <ClipboardList className="h-4 w-4 text-green-600" />;
    case "tagged_comment":
      return <MessageSquare className="h-4 w-4 text-amber-600" />;
    case "mention":
      return <AtSign className="h-4 w-4 text-blue-500" />;
    case "status_change":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case "system":
      return <Settings className="h-4 w-4 text-orange-500" />;
    default:
      return <Bell className="h-4 w-4 text-slate-400" />;
  }
}

function getIconBg(type: string) {
  switch (type) {
    case "task_assigned":
    case "task_due":
      return "bg-green-100";
    case "tagged_comment":
      return "bg-amber-100";
    case "mention":
      return "bg-blue-100";
    case "status_change":
      return "bg-yellow-100";
    case "system":
      return "bg-orange-100";
    default:
      return "bg-slate-100";
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
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${getIconBg(n.type)}`}>
        {getIcon(n.type)}
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
