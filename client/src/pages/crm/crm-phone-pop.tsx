import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Phone, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type CustomerHit = { id: string; name: string; phone?: string | null; fullAddress?: string | null };

// Landing page for the Elevate "CRM Screen Pops" integration. Elevate opens
// /crm/phone-pop?number=$phone_number on inbound/outbound calls; we match the
// number against CRM customers and jump straight to the caller's page.
export default function CrmPhonePop() {
  const [, navigate] = useLocation();

  const digits = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("number") || "";
    const d = raw.replace(/\D/g, "");
    // Strip the US country code so it matches stored 10-digit numbers.
    return d.length === 11 && d.startsWith("1") ? d.slice(1) : d.slice(-10);
  }, []);

  const { data, isLoading } = useQuery<{ customers: CustomerHit[] }>({
    queryKey: ["/api/crm/customers/merged", "phone-pop", digits],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customers/merged?search=${encodeURIComponent(digits)}&limit=10`, { credentials: "include" });
      if (!res.ok) throw new Error("lookup failed");
      return res.json();
    },
    enabled: digits.length >= 7,
  });

  const matches = data?.customers || [];

  // Exactly one match: go straight to the customer.
  if (data && matches.length === 1) {
    navigate(`/crm/customers/${matches[0].id}`, { replace: true });
    return null;
  }

  const prettyNumber = digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits || "Unknown number";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#711419]/10">
            <Phone className="h-5 w-5 text-[#711419]" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">Incoming call</p>
            <p className="text-lg font-semibold text-foreground" data-testid="pop-number">{prettyNumber}</p>
          </div>
        </div>

        {digits.length < 7 ? (
          <p className="text-sm text-muted-foreground">No caller number was provided.</p>
        ) : isLoading || !data ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking up customer…
          </div>
        ) : matches.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No customer matches this number.</p>
            <div className="flex gap-2">
              <Button className="flex-1 bg-[#711419] hover:bg-[#5a1014]" onClick={() => navigate("/crm/accounts/new")} data-testid="pop-create-customer">
                <UserPlus className="mr-2 h-4 w-4" /> New customer
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate(`/crm/customers?search=${digits}`)}>
                <Users className="mr-2 h-4 w-4" /> Search customers
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{matches.length} customers match this number:</p>
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/crm/customers/${c.id}`)}
                className="block w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40"
                data-testid={`pop-match-${c.id}`}
              >
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                {(c.phone || c.fullAddress) && (
                  <p className="truncate text-xs text-muted-foreground">{[c.phone, c.fullAddress].filter(Boolean).join(" · ")}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
