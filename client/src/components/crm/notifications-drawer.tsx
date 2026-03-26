import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  AtSign,
  ClipboardList,
  Settings,
  AlertCircle,
  Inbox,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: "mention" | "task_assigned" | "task_due" | "comment" | "status_change" | "system" | "tagged_comment";
  title: string;
  preview: string | null;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  actorName?: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsDrawerContentProps {
  onClose: () => void;
}

function getEntityUrl(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  
  switch (entityType) {
    case "customer":
      return `/crm/customers/${entityId}`;
    case "lead":
      return `/crm/prospect-funnel?lead=${entityId}`;
    case "project":
      return `/crm/projects/${entityId}`;
    case "work_order":
      return `/crm/work-orders/${entityId}`;
    case "call_log":
      return `/crm/phone?log=${entityId}`;
    case "call_log_task":
      return `/crm/phone?task=${entityId}`;
    case "tagged_comment":
      return null;
    default:
      return null;
  }
}

export function NotificationsDrawerContent({ onClose }: NotificationsDrawerContentProps) {
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [, setLocation] = useLocation();

  const queryParams = new URLSearchParams();
  if (tab === "unread") queryParams.set("unreadOnly", "true");
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  queryParams.set("limit", "50");

  const { data: notifications, isLoading, refetch } = useQuery<Notification[]>({
    queryKey: ["/api/crm/notifications", tab, typeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/crm/notifications?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
  };

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/crm/notifications/${notificationId}/read`);
    },
    onSuccess: invalidateAll,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/crm/notifications/mark-all-read");
    },
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("DELETE", `/api/crm/notifications/${notificationId}`);
    },
    onSuccess: invalidateAll,
  });

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "mention":
        return <AtSign className="h-4 w-4 text-blue-500" />;
      case "task_assigned":
      case "task_due":
        return <ClipboardList className="h-4 w-4 text-green-500" />;
      case "comment":
        return <Bell className="h-4 w-4 text-purple-500" />;
      case "tagged_comment":
        return <MessageSquare className="h-4 w-4 text-amber-500" />;
      case "status_change":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "system":
        return <Settings className="h-4 w-4 text-orange-500" />;
      default:
        return <Bell className="h-4 w-4 text-slate-500" />;
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    
    if (notification.entityType === "tagged_comment" && notification.entityId) {
      try {
        const res = await fetch(`/api/crm/tagged-comments/lookup/${notification.entityId}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.pageRoute) {
            onClose();
            const separator = data.pageRoute.includes("?") ? "&" : "?";
            window.location.href = `${data.pageRoute}${separator}highlightComment=${notification.entityId}`;
            return;
          }
        }
      } catch {}
    }

    const url = getEntityUrl(notification.entityType, notification.entityId);
    if (url) {
      onClose();
      setLocation(url);
    }
  };

  const filteredNotifications = notifications;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Notifications</h2>
      </div>

      <div className="p-4 border-b space-y-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "unread" | "all")}>
          <TabsList className="w-full">
            <TabsTrigger value="unread" className="flex-1">Unread</TabsTrigger>
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="mention">Mentions</SelectItem>
            <SelectItem value="task_assigned">Tasks Assigned</SelectItem>
            <SelectItem value="tagged_comment">Tagged Notes</SelectItem>
            <SelectItem value="comment">Comments</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !filteredNotifications?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 cursor-pointer transition-colors hover:bg-muted group ${
                  !notification.isRead ? "border-l-4 border-l-primary bg-primary/5" : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notification.isRead ? "font-semibold" : ""}`}>
                      {notification.title}
                    </p>
                    {notification.preview && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.preview}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </span>
                      {notification.entityType && (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {notification.entityType.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(notification.id); }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                    title="Delete notification"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t">
        <Link href="/crm/notifications" onClick={onClose}>
          <Button variant="outline" className="w-full">
            View all notifications
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default NotificationsDrawerContent;
