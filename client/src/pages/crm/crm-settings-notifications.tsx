import { useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Bell, Loader2, Search, Send, Smartphone } from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { CrmUser } from "@shared/schema";

/** Settings → Notifications — the org-wide notification center.
 *
 *  Everything the system notifies anyone about (work orders assigned,
 *  payments, mentions, …) in one feed, plus which phones are registered for
 *  mobile push, plus a composer to notify techs directly (rows land in
 *  crm_notifications, so the APNs bridge delivers them to lock screens).
 */

type AdminNotification = {
  id: string;
  type: string;
  title: string;
  preview: string | null;
  entityType: string | null;
  isRead: boolean;
  createdAt: string | null;
  recipientId: string;
  recipientName: string | null;
};

type PushDevice = {
  token: string;
  platform: string;
  lastSeenAt: string | null;
  userId: string;
  userName: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  mention: "Mention",
  task_assigned: "Task assigned",
  task_due: "Task due",
  comment: "Comment",
  status_change: "Status change",
  system: "System",
  tagged_comment: "Tagged comment",
};

export default function CrmSettingsNotifications() {
  usePageTitle("Notification Center");
  const { toast } = useToast();
  const [userFilter, setUserFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Composer state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipients, setRecipients] = useState<"all" | string>("all");

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: users = [] } = useQuery<CrmUser[]>({
    queryKey: ["/api/crm/users"],
    queryFn: async () => {
      const res = await fetch("/api/crm/users", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.users || [];
    },
  });

  const { data: notifications = [], isLoading } = useQuery<AdminNotification[]>({
    queryKey: ["/api/crm/notifications/admin", userFilter, typeFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userFilter !== "all") params.set("userId", userFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/crm/notifications/admin?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json();
    },
    refetchInterval: 30 * 1000,
  });

  const { data: devices = [] } = useQuery<PushDevice[]>({
    queryKey: ["/api/crm/push/devices"],
    queryFn: async () => {
      const res = await fetch("/api/crm/push/devices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/notifications/broadcast", {
        title,
        message,
        userIds: recipients === "all" ? "all" : [recipients],
      });
      return res.json();
    },
    onSuccess: (d: any) => {
      toast({ title: `Notification sent to ${d.sent} ${d.sent === 1 ? "person" : "people"}`, description: "Phones with the app get a push within ~20 seconds." });
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/admin"] });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't send the notification", variant: "destructive" }),
  });

  const deviceUsers = new Set(devices.map((d) => d.userId));

  if (!currentUser) return null;

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/crm/settings" className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-white text-slate-600 hover:text-foreground" data-testid="back-to-settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
              <Bell className="h-5 w-5 text-[#711419]" /> Notification Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Everything the system notifies your team about — and a direct line to their phones.
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-input bg-white px-3 py-1.5 text-xs font-medium text-slate-600" data-testid="device-count">
            <Smartphone className="h-3.5 w-3.5" />
            {devices.length} device{devices.length === 1 ? "" : "s"} registered · {deviceUsers.size} {deviceUsers.size === 1 ? "person" : "people"}
          </span>
        </div>

        {/* Composer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Send a notification</CardTitle>
            <CardDescription>
              Lands in the app's notification drawer for everyone selected — and as a push on any phone with the GHQ app installed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex flex-wrap gap-2.5">
              <Select value={recipients} onValueChange={setRecipients}>
                <SelectTrigger className="h-9 w-56 bg-white text-sm" data-testid="broadcast-recipients">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone (active users)</SelectItem>
                  {users.filter((u) => u.isActive !== false).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{deviceUsers.has(u.id) ? " 📱" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title — e.g. Shop meeting at 7:30 tomorrow"
                className="h-9 flex-1 bg-white text-sm"
                data-testid="broadcast-title"
              />
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Details (optional)"
              rows={2}
              className="bg-white text-sm"
              data-testid="broadcast-message"
            />
            <div className="flex justify-end">
              <Button
                className="bg-[#711419] hover:bg-[#8a1a1f]"
                disabled={!title.trim() || send.isPending}
                onClick={() => send.mutate()}
                data-testid="broadcast-send"
              >
                {send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Send
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feed */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">All notifications</CardTitle>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="relative w-48">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="h-8 bg-white pl-8 text-sm"
                    data-testid="notif-search"
                  />
                </div>
                <Select value={userFilter} onValueChange={setUserFilter}>
                  <SelectTrigger className="h-8 w-40 bg-white text-sm" data-testid="notif-user-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All people</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-40 bg-white text-sm" data-testid="notif-type-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
              </div>
            ) : notifications.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No notifications match.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">When</TableHead>
                    <TableHead className="w-36">To</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead>Notification</TableHead>
                    <TableHead className="w-20 text-right">Read</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((n) => (
                    <TableRow key={n.id} data-testid={`notif-row-${n.id}`}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {n.createdAt ? format(new Date(n.createdAt), "MMM d, h:mm a") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{n.recipientName || "Unknown"}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          {TYPE_LABELS[n.type] || n.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-slate-800">{n.title}</p>
                        {n.preview && <p className="truncate text-xs text-slate-500">{n.preview}</p>}
                      </TableCell>
                      <TableCell className="text-right">
                        {n.isRead ? (
                          <span className="text-xs text-emerald-600">✓</span>
                        ) : (
                          <span className="inline-block h-2 w-2 rounded-full bg-[#711419]" title="Unread" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
