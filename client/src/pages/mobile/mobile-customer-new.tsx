import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";

/** New Customer — standalone page. Creates the customer (plus a property row
 *  from the address so they're immediately quotable/schedulable), then opens
 *  the new customer's detail page. */
export default function MobileCustomerNew() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cAddress, setCAddress] = useState("");
  const [cType, setCType] = useState<"residential" | "commercial">("residential");

  const createCustomer = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crm/customers", {
        name: cName.trim(),
        phone: cPhone.trim() || null,
        email: cEmail.trim() || null,
        fullAddress: cAddress.trim() || null,
        customerType: cType,
      });
      const customer = await res.json();
      // A property row makes the customer immediately quotable/schedulable
      if (cAddress.trim() && customer?.id) {
        await apiRequest("POST", `/api/crm/customers/${customer.id}/properties`, {
          address1: cAddress.trim(),
        }).catch(() => {});
      }
      return customer;
    },
    onSuccess: (customer: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/customers"] });
      toast({ title: "Customer created", description: `${cName.trim()} is in the CRM.` });
      if (customer?.id) navigate(`/mobile/customers/${customer.id}`);
      else navigate("/mobile/customers");
    },
    onError: (e: any) => toast({ title: "Couldn't create the customer", description: e?.message, variant: "destructive" }),
  });

  const dirty =
    cName.trim().length > 0 ||
    cPhone.trim().length > 0 ||
    cEmail.trim().length > 0 ||
    cAddress.trim().length > 0 ||
    cType !== "residential";

  return (
    <MobileCreatePage
      title="New customer"
      subtitle="They'll be in the CRM the moment you save."
      dirty={dirty}
      exitTo="/mobile/customers"
      testid="mobile-customer-new-page"
    >
      <div className="space-y-3.5">
        <div>
          <Label htmlFor="nc-name" className="mb-1.5 block">Name</Label>
          <Input id="nc-name" autoFocus value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Full name or business" data-testid="nc-name" />
        </div>
        <div>
          <Label className="mb-1.5 block">Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["residential", "commercial"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setCType(t)}
                className={`rounded-[3px] border py-2.5 text-sm font-semibold capitalize transition-colors ${
                  cType === t ? "border-[#711419] bg-[#711419]/[0.06] text-[#711419]" : "border-slate-300/70 text-slate-500"
                }`}
                data-testid={`nc-type-${t}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="nc-phone" className="mb-1.5 block">Phone (optional)</Label>
          <Input id="nc-phone" type="tel" inputMode="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="(706) 555-0123" data-testid="nc-phone" />
        </div>
        <div>
          <Label htmlFor="nc-email" className="mb-1.5 block">Email (optional)</Label>
          <Input id="nc-email" type="email" inputMode="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="name@example.com" data-testid="nc-email" />
        </div>
        <div>
          <Label htmlFor="nc-address" className="mb-1.5 block">Address (optional)</Label>
          <Input id="nc-address" value={cAddress} onChange={(e) => setCAddress(e.target.value)} placeholder="123 Main St, Augusta, GA" data-testid="nc-address" />
        </div>
        <Button
          onClick={() => createCustomer.mutate()}
          disabled={createCustomer.isPending || cName.trim().length === 0}
          className="h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold hover:bg-[#8a1a1f]"
          data-testid="nc-save"
        >
          {createCustomer.isPending ? <Loader2 className="mr-1.5 h-5 w-5 animate-spin" /> : <Plus className="mr-1.5 h-5 w-5" />}
          Create customer
        </Button>
      </div>
    </MobileCreatePage>
  );
}
