import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export type QuickCustomer = { id: string; name: string; phone?: string | null; email?: string | null };
export type QuickProperty = { id: string; address1: string; city: string; state: string; zip: string } | null;

const ACCOUNT_TYPES = [
  { value: "Residential", label: "Residential" },
  { value: "Commercial", label: "Commercial" },
  { value: "Property Manager", label: "Property Manager" },
] as const;

// Single-screen customer create used across the customers list, invoice, and
// work-order flows. Covers the essentials; the full account wizard (billing,
// PO, portfolio, etc.) is still reachable via /crm/accounts/new.
export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
  defaultName = "",
  showFullFormLink = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (customer: QuickCustomer, property: QuickProperty) => void;
  defaultName?: string;
  showFullFormLink?: boolean;
}) {
  const { toast } = useToast();
  const [accountType, setAccountType] = useState<string>("Residential");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  // Reset each time the dialog opens
  useEffect(() => {
    if (open) {
      setAccountType("Residential");
      setName(defaultName);
      setCompanyName("");
      setPhone("");
      setEmail("");
      setAddress1("");
      setAddress2("");
      setCity("");
      setState("");
      setZip("");
    }
  }, [open, defaultName]);

  const isPM = accountType === "Property Manager";
  const isCommercial = accountType === "Commercial";

  const create = useMutation({
    mutationFn: async () => {
      const fullAddress = address1
        ? `${address1}${address2 ? ", " + address2 : ""}, ${city}, ${state} ${zip}`
        : null;
      // PMs: the address is HQ/mailing, not a service site — don't auto-create a property.
      const shouldCreateProperty = !isPM && !!address1.trim();
      const payload = {
        customer: {
          name: name.trim(),
          companyName: companyName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          customerType: accountType,
          customerStatus: "prospect",
          fullAddress,
        },
        property: shouldCreateProperty
          ? { address1: address1.trim(), address2: address2.trim() || null, city: city.trim(), state: state.trim(), zip: zip.trim() }
          : null,
      };
      const res = await apiRequest("POST", "/api/crm/customers/create-with-property", payload);
      return res.json();
    },
    onSuccess: (data: { customer: QuickCustomer; property: QuickProperty }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers/stats"] });
      toast({ title: "Customer created" });
      onCreated(data.customer, data.property ?? null);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: e?.message || "Couldn't create customer", variant: "destructive" }),
  });

  const canSave = name.trim().length > 0 && (isCommercial ? companyName.trim().length > 0 : true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>Add the essentials now — you can fill in the rest later.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Account type</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger data-testid="quick-customer-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isPM || isCommercial ? "Contact name *" : "Customer name *"}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Smith" data-testid="quick-customer-name" />
            </div>
          </div>

          {(isCommercial || isPM) && (
            <div className="space-y-1">
              <Label className="text-xs">Company name {isCommercial ? "*" : ""}</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company / property management co." data-testid="quick-customer-company" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(706) 555-0123" data-testid="quick-customer-phone" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" data-testid="quick-customer-email" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{isPM ? "HQ / mailing address" : "Service address"}</Label>
            <Input value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="Street address" data-testid="quick-customer-address1" />
          </div>
          <div className="grid grid-cols-6 gap-2">
            <Input className="col-span-3" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" data-testid="quick-customer-city" />
            <Input className="col-span-1" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="GA" data-testid="quick-customer-state" />
            <Input className="col-span-2" value={zip} onChange={(e) => setZip(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="ZIP" data-testid="quick-customer-zip" />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {showFullFormLink ? (
            <a href="/crm/accounts/new" className="text-xs text-[#711419] hover:underline" data-testid="link-full-customer-form">
              Add full details instead
            </a>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              className="bg-[#711419] hover:bg-[#5a1014]"
              disabled={!canSave || create.isPending}
              onClick={() => create.mutate()}
              data-testid="button-save-quick-customer"
            >
              {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Create customer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
