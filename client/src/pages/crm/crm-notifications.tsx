import { useState, useEffect, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  startOfDay,
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

type NotificationsResponse = NotificationWithActor[];

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

  for (const notification of notifications) {
    const group = getDateGroup(notification.createdAt);
    groups[group].push(notification);
  }

  return groups;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "mention":
      return <AtSign className="h-4 w-4 text-blue-500" />;
    case "task_assigned":
    case "task_due":
      return <ClipboardList className="h-4 w-4 text-green-500" />;
    case "comment":
      return <MessageCircle className="h-4 w-4 text-purple-500" />;
    case "status_change":
      return <RefreshCw className="h-4 w-4 text-amber-500" />;
    case "system":
      return <Settings className="h-4 w-4 text-orange-500" />;
    default:
      return <Bell className="h-4 w-4 text-slate-500" />;
  }
}

function getEntityLink(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  
  const entityRoutes: Record<string, string> = {
    lead: "/crm/prospect-funnel",
    project: `/crm/projects/${entityId}`,
    work_order: `/crm/work-orders/${entityId}`,
    quote: `/crm/quotes/${entityId}`,
    invoice: `/crm/invoices/${entityId}`,
    customer: `/crm/customers/${entityId}`,
    agreement: `/crm/agreements`,
  };
  
  return entityRoutes[entityType] || null;
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

export default function CrmNotifications() {
  usePageTitle("Notifications");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (tab === "unread") params.set("unreadOnly", "true");
    if (typeFilter !== "all") params.set("type", typeFilter);
    return params.toString();
  }, [tab, typeFilter]);

  const { data: notifications = [], isLoading: notificationsLoading, refetch } = useQuery<NotificationsResponse>({
    queryKey: ["/api/crm/notifications", queryParams],
    queryFn: async () => {
      const url = queryParams ? `/api/crm/notifications?${queryParams}` : "/api/crm/notifications";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: !!currentUser,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/crm/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/crm/notifications/mark-all-read");
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
      setSelectedIds(new Set());
      toast({ title: "Success", description: "All notifications marked as read" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark notifications as read", variant: "destructive" });
    },
  });

  const markSelectedReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => apiRequest("PATCH", `/api/crm/notifications/${id}/read`))
      );
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
      setSelectedIds(new Set());
      toast({ title: "Success", description: "Selected notifications marked as read" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark notifications as read", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab, typeFilter]);

  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) return notifications;
    const query = searchQuery.toLowerCase();
    return notifications.filter(
      (n) =>
        n.title.toLowerCase().includes(query) ||
        (n.preview && n.preview.toLowerCase().includes(query))
    );
  }, [notifications, searchQuery]);

  const groupedNotifications = useMemo(
    () => groupNotificationsByDate(filteredNotifications),
    [filteredNotifications]
  );

  const handleNotificationClick = (notification: NotificationWithActor) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    
    const link = getEntityLink(notification.entityType, notification.entityId);
    if (link) {
      navigate(link);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectNotification = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleMarkSelectedRead = () => {
    const ids = Array.from(selectedIds);
    if (ids.length > 0) {
      markSelectedReadMutation.mutate(ids);
    }
  };

  if (authLoading) {
    return (
      <CrmLayout currentUser={currentUser as unknown as CrmUser}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  if (!currentUser) {
    return null;
  }

  const dateGroupOrder: DateGroup[] = ["Today", "Yesterday", "This Week", "Earlier"];
  const hasNotifications = filteredNotifications.length > 0;
  const allSelected = hasNotifications && selectedIds.size === filteredNotifications.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredNotifications.length;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
            Notifications
          </h1>
          <p className="text-sm text-slate-500">
            Stay up to date with mentions, tasks, and system updates
          </p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <Tabs value={tab} onValueChange={(v) => setTab(v as "unread" | "all")}>
                <TabsList>
                  <TabsTrigger value="unread" data-testid="tab-unread">Unread</TabsTrigger>
                  <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap gap-3 items-center">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-type-filter">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="mention">Mentions</SelectItem>
                    <SelectItem value="task_assigned">Tasks</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search notifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-[200px]"
                    data-testid="input-search"
                  />
                </div>

                {selectedIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMarkSelectedRead}
                    disabled={markSelectedReadMutation.isPending}
                    data-testid="button-mark-selected-read"
                  >
                    {markSelectedReadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCheck className="h-4 w-4 mr-1" />
                    )}
                    Mark Selected as Read ({selectedIds.size})
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending || !hasNotifications}
                  data-testid="button-mark-all-read"
                >
                  {markAllReadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCheck className="h-4 w-4 mr-1" />
                  )}
                  Mark All Read
                </Button>
              </div>
            </div>

            {hasNotifications && (
              <div className="flex items-center gap-2 px-4 py-2 border-b">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                  data-testid="checkbox-select-all"
                  className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size > 0 
                    ? `${selectedIds.size} selected` 
                    : "Select all"}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {notificationsLoading ? (
          <Card>
            <CardContent className="p-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : !hasNotifications ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Inbox className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                {tab === "unread"
                  ? "You're all caught up!"
                  : "No notifications yet."}
              </p>
              {tab === "unread" && (
                <p className="text-sm text-muted-foreground mt-1">
                  No unread notifications.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {dateGroupOrder.map((group) => {
              const groupNotifs = groupedNotifications[group];
              if (groupNotifs.length === 0) return null;

              return (
                <div key={group}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">
                    {group}
                  </h3>
                  <Card>
                    <CardContent className="p-0 divide-y">
                      {groupNotifs.map((notification) => (
                        <div
                          key={notification.id}
                          className={`flex items-start gap-4 p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                            !notification.isRead
                              ? "border-l-4 border-l-primary bg-primary/5"
                              : ""
                          }`}
                          data-testid={`notification-item-${notification.id}`}
                        >
                          <Checkbox
                            checked={selectedIds.has(notification.id)}
                            onCheckedChange={(checked) =>
                              handleSelectNotification(notification.id, !!checked)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Select notification"
                            data-testid={`checkbox-notification-${notification.id}`}
                          />

                          <div
                            className="flex-1 min-w-0 flex gap-3"
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              {getNotificationIcon(notification.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm ${
                                  !notification.isRead ? "font-semibold" : ""
                                }`}
                                data-testid={`notification-title-${notification.id}`}
                              >
                                {notification.title}
                              </p>
                              {notification.preview && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                                  {notification.preview}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">
                                  {notification.createdAt
                                    ? formatDistanceToNow(new Date(notification.createdAt), {
                                        addSuffix: true,
                                      })
                                    : ""}
                                </span>
                                {notification.entityType && (
                                  <Badge variant="secondary" className="text-xs">
                                    {getEntityBadgeLabel(notification.entityType)}
                                  </Badge>
                                )}
                                {notification.actorName && (
                                  <div className="flex items-center gap-1.5">
                                    <Avatar className="h-5 w-5">
                                      <AvatarFallback className="text-xs bg-slate-200">
                                        {notification.actorName
                                          .split(" ")
                                          .map((n) => n[0])
                                          .join("")
                                          .toUpperCase()
                                          .slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs text-muted-foreground">
                                      {notification.actorName}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {!notification.isRead && (
                              <div className="flex-shrink-0">
                                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
