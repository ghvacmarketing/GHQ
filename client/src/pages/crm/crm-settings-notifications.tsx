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
import { ArrowLeft, Bell, Loader2, Search, Send, Smartphone, Trash2 } from "lucide-react";
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

const TYPE_DESCRIPTIONS: Record<string, string> = {
  task_assigned: "A task gets assigned to someone",
  task_due: "A task reaches its due date",
  mention: "Someone is @-mentioned in a comment",
  tagged_comment: "Someone is tagged in a pin comment",
  comment: "A new comment lands on their work",
  status_change: "A record they're on changes status (quote accepted, job done…)",
  system: "Announcements sent from this page",
};

// The concrete events behind each category — sourced from every
// crm_notifications insert in the codebase, so this list is truthful.
const TYPE_SUBTYPES: Record<string, string[]> = {
  task_assigned: [
    "New job (work order) assigned to you",
    "A teammate assigned you a task",
  ],
  task_due: ["A task reaches its due date"],
  mention: ["@-mention in a comment"],
  tagged_comment: [
    "Someone left you a pin note",
    "Your pin note was resolved",
  ],
  comment: ["Comment activity on your work"],
  status_change: ["Your job was rescheduled"],
  system: [
    "Announcements sent from this page",
    "Sensor alerts (humidity / temperature monitors)",
    "Automation follow-ups & messages",
    "Marketing campaign notices",
    "Customer portal activity",
  ],
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

  type NotificationTemplate = { id: string; name: string; title: string; message: string | null };
  const { data: templates = [] } = useQuery<NotificationTemplate[]>({
    queryKey: ["/api/crm/notification-templates"],
    queryFn: async () => {
      const res = await fetch("/api/crm/notification-templates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: typeSummary = [] } = useQuery<Array<{ type: string; count: number }>>({
    queryKey: ["/api/crm/notifications/type-summary"],
    queryFn: async () => {
      const res = await fetch("/api/crm/notifications/type-summary", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const typeCount = (t: string) => typeSummary.find((r) => r.type === t)?.count ?? 0;

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const name = window.prompt("Template name (e.g. Shop meeting reminder):", title.slice(0, 40));
      if (!name?.trim()) throw new Error("cancelled");
      const res = await apiRequest("POST", "/api/crm/notification-templates", { name: name.trim(), title, message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notification-templates"] });
      toast({ title: "Template saved" });
    },
    onError: (e: any) => { if (e?.message !== "cancelled") toast({ title: e?.message || "Couldn't save the template", variant: "destructive" }); },
  });
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/notification-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/crm/notification-templates"] }),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/crm/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/admin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/type-summary"] });
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't delete the notification", variant: "destructive" }),
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

        {/* ── Section 1: sending ── */}
        <p className="pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Send</p>

        {/* Composer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Send a notification</CardTitle>
            <CardDescription>
              Lands in the app's notification drawer for everyone selected — and as a push on any phone with the GHQ app installed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {templates.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" data-testid="template-chips">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Templates:</span>
                {templates.map((t) => (
                  <span key={t.id} className="group inline-flex items-center overflow-hidden rounded-[4px] border border-slate-200 bg-white text-xs">
                    <button
                      onClick={() => { setTitle(t.title); setMessage(t.message || ""); }}
                      className="px-2.5 py-1 font-medium text-slate-700 hover:bg-[#711419]/5 hover:text-[#711419]"
                      data-testid={`template-${t.id}`}
                    >
                      {t.name}
                    </button>
                    <button
                      onClick={() => deleteTemplate.mutate(t.id)}
                      className="hidden border-l border-slate-200 px-1.5 py-1 text-slate-400 hover:text-red-600 group-hover:block"
                      title="Delete template"
                      data-testid={`template-delete-${t.id}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
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
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={!title.trim() || saveTemplate.isPending}
                onClick={() => saveTemplate.mutate()}
                data-testid="broadcast-save-template"
              >
                Save as template
              </Button>
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

        {/* ── Section 2: activity ── */}
        <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Activity</p>

        {/* What the system notifies about, automatically */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notification types</CardTitle>
            <CardDescription>What the CRM sends automatically — every one also pushes to registered phones.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="type-catalog">
              {Object.entries(TYPE_DESCRIPTIONS).map(([t, desc]) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? "all" : t)}
                  className={`rounded-md border p-2.5 text-left transition-colors ${typeFilter === t ? "border-[#711419] bg-[#711419]/[0.04]" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  data-testid={`type-card-${t}`}
                >
                  <p className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    {TYPE_LABELS[t]}
                    <span className="rounded-[3px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{typeCount(t)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                  {(TYPE_SUBTYPES[t] || []).length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5">
                      {TYPE_SUBTYPES[t].map((sub) => (
                        <li key={sub} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
                          <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[#711419]/50" />
                          {sub}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              ))}
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
                    <TableHead className="w-14 text-right">Clear</TableHead>
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
                      <TableCell className="w-14 text-right">
                        <button
                          onClick={() => deleteNotification.mutate(n.id)}
                          disabled={deleteNotification.isPending}
                          className="rounded-[3px] border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          title="Delete notification"
                          data-testid={`notif-delete-${n.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
