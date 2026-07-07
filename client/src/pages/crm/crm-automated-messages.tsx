import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { ArrowLeft, MessageSquare, Mail, Loader2, AlertTriangle } from "lucide-react";
import type { CrmUser } from "@shared/schema";

type Template = { key: string; description: string; value: string; defaultValue: string; placeholders?: string };

function MasterToggle({
  label, description, enabled, onToggle, pending,
}: { label: string; description: string; enabled: boolean; onToggle: (v: boolean) => void; pending: boolean }) {
  return (
    <Card className={enabled ? "" : "border-amber-200 bg-amber-50/60"}>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? description : (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Paused — nothing is sending right now.
              </span>
            )}
          </p>
        </div>
        <Switch checked={enabled} disabled={pending} onCheckedChange={onToggle} />
      </CardContent>
    </Card>
  );
}

function TemplateSection({
  title, icon: Icon, endpoint, kind,
}: { title: string; icon: any; endpoint: string; kind: "sms" | "email" }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ templates: Template[] }>({ queryKey: [endpoint] });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.templates) {
      setDrafts(Object.fromEntries(data.templates.map((t) => [t.key, t.value])));
    }
  }, [data]);

  const dirty = data?.templates?.some((t) => drafts[t.key] !== undefined && drafts[t.key] !== t.value) ?? false;

  const save = useMutation({
    mutationFn: async () => {
      const templates = Object.entries(drafts).map(([key, value]) => ({ key, value }));
      return (await apiRequest("PUT", endpoint, { templates })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
        </h2>
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-3">
          {data?.templates.map((t) => (
            <Card key={t.key}>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground">{t.description}</p>
                <Textarea
                  value={drafts[t.key] ?? t.value}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
                  rows={kind === "email" ? 3 : 2}
                  className="mt-2 text-sm"
                />
                {t.placeholders && <p className="mt-1.5 text-[11px] text-muted-foreground">Placeholders: {t.placeholders}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CrmAutomatedMessages() {
  usePageTitle("Automated Messages");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const smsToggle = useQuery<{ enabled: boolean }>({ queryKey: ["/api/admin/settings/automated-sms"], enabled: !!currentUser });
  const emailToggle = useQuery<{ enabled: boolean }>({ queryKey: ["/api/admin/settings/automated-email"], enabled: !!currentUser });

  const makeToggle = (endpoint: string) => ({
    mutationFn: async (enabled: boolean) => (await apiRequest("PUT", endpoint, { enabled })).json(),
    onMutate: async (enabled: boolean) => {
      await queryClient.cancelQueries({ queryKey: [endpoint] });
      queryClient.setQueryData([endpoint], { enabled });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
    onError: () => toast({ title: "Couldn't update", variant: "destructive" }),
  });

  const smsMut = useMutation(makeToggle("/api/admin/settings/automated-sms"));
  const emailMut = useMutation(makeToggle("/api/admin/settings/automated-email"));

  return (
    <CrmLayout currentUser={currentUser ?? undefined}>
      <div className="w-full max-w-3xl space-y-6 pb-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/crm/marketing")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Automated Messages</h1>
            <p className="text-sm text-muted-foreground">The built-in texts &amp; emails your CRM sends. Edit the wording and switch them on or off.</p>
          </div>
        </div>

        {/* Master switches */}
        <div className="grid gap-3 sm:grid-cols-2">
          <MasterToggle
            label="Automated text messages"
            description="Reminders, on-my-way texts, review requests, etc."
            enabled={smsToggle.data?.enabled ?? false}
            pending={smsMut.isPending}
            onToggle={(v) => smsMut.mutate(v)}
          />
          <MasterToggle
            label="Automated emails"
            description="Quote, invoice, and booking emails."
            enabled={emailToggle.data?.enabled ?? false}
            pending={emailMut.isPending}
            onToggle={(v) => emailMut.mutate(v)}
          />
        </div>

        <TemplateSection title="Text message templates" icon={MessageSquare} endpoint="/api/admin/settings/sms-templates" kind="sms" />
        <TemplateSection title="Email templates" icon={Mail} endpoint="/api/admin/settings/email-templates" kind="email" />
      </div>
    </CrmLayout>
  );
}
