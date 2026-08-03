import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import { AddressSearchSheet } from "@/components/mobile/address-search-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CrmCustomer } from "@shared/schema";

/** Edit a customer's contact info + service address from the mobile detail
 *  page. Address comes in via the lookup sheet (accept the verified match)
 *  or hand-typed fields; saving PATCHes name/phone/email/fullAddress on the
 *  customer profile. */

/** "123 Main St, Wrens, GA 30833" → parts. Unparseable strings land whole in
 *  address1 so nothing is ever lost. */
function splitFullAddress(full: string | null | undefined) {
  const s = (full || "").trim();
  if (!s) return { address1: "", city: "", state: "", zip: "" };
  const parts = s.split(",").map((x) => x.trim());
  const st = parts.length >= 3 ? parts[parts.length - 1].match(/^([A-Za-z]{2})\b\s*(\d{5})?/) : null;
  if (st) {
    return {
      address1: parts.slice(0, parts.length - 2).join(", "),
      city: parts[parts.length - 2],
      state: st[1].toUpperCase(),
      zip: st[2] || "",
    };
  }
  return { address1: s, city: "", state: "", zip: "" };
}

export function CustomerEditSheet({
  customer,
  open,
  onOpenChange,
}: {
  customer: CrmCustomer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [addrSearchOpen, setAddrSearchOpen] = useState(false);
  // Set when the address came from the lookup's verified pick — shown as a
  // small confirmation until a field is hand-edited.
  const [addrVerified, setAddrVerified] = useState(false);

  // Fresh copy of the record every open.
  useEffect(() => {
    if (!open) return;
    setName(customer.name || "");
    setPhone(customer.phone || "");
    setEmail(customer.email || "");
    const a = splitFullAddress(customer.fullAddress);
    setAddress1(a.address1);
    setCity(a.city);
    setState(a.state);
    setZip(a.zip);
    setAddrVerified(false);
  }, [open, customer]);

  const save = useMutation({
    mutationFn: async () => {
      const fullAddress = [
        address1.trim(),
        city.trim(),
        [state.trim().toUpperCase(), zip.trim()].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ");
      return apiRequest("PATCH", `/api/crm/customers/${customer.id}`, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        fullAddress: fullAddress || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/customers"] });
      toast({ title: "Customer updated" });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save the changes", description: e?.message, variant: "destructive" }),
  });

  const editAddr = (set: (v: string) => void) => (v: string) => {
    set(v);
    setAddrVerified(false);
  };

  return (
    <>
      <DraggableSheet tall open={open} onOpenChange={onOpenChange} title="Edit customer" testid="customer-edit-sheet">
        <h2 className="text-lg font-semibold text-slate-900">Edit customer</h2>
        <div className="mt-4 space-y-4 pb-2">
          <div>
            <Label htmlFor="ce-name" className="mb-1.5 block">Name *</Label>
            <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="ce-name" />
          </div>
          <div>
            <Label htmlFor="ce-phone" className="mb-1.5 block">Phone</Label>
            <Input id="ce-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(706) 555-0100" data-testid="ce-phone" />
          </div>
          <div>
            <Label htmlFor="ce-email" className="mb-1.5 block">Email</Label>
            <Input id="ce-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" data-testid="ce-email" />
          </div>

          <div className="pt-1">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Service address</p>
            <button
              onClick={() => setAddrSearchOpen(true)}
              className="flex h-11 w-full items-center gap-2.5 rounded-md border border-input bg-white px-3.5 text-left shadow-xs"
              data-testid="ce-address-search"
            >
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-base text-muted-foreground">Search for the address…</span>
            </button>
            {addrVerified && (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-green-700" data-testid="ce-address-verified">
                <Check className="h-3.5 w-3.5" /> Verified address — save to keep it on the profile
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="ce-address1" className="mb-1.5 block">Address line 1</Label>
            <Input id="ce-address1" value={address1} onChange={(e) => editAddr(setAddress1)(e.target.value)} placeholder="123 Main St" data-testid="ce-address1" />
          </div>
          <div>
            <Label htmlFor="ce-city" className="mb-1.5 block">City</Label>
            <Input id="ce-city" value={city} onChange={(e) => editAddr(setCity)(e.target.value)} placeholder="Augusta" data-testid="ce-city" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ce-state" className="mb-1.5 block">State</Label>
              <Input id="ce-state" value={state} onChange={(e) => editAddr(setState)(e.target.value)} placeholder="GA" maxLength={2} autoCapitalize="characters" data-testid="ce-state" />
            </div>
            <div>
              <Label htmlFor="ce-zip" className="mb-1.5 block">ZIP</Label>
              <Input id="ce-zip" value={zip} inputMode="numeric" onChange={(e) => editAddr(setZip)(e.target.value)} placeholder="30830" data-testid="ce-zip" />
            </div>
          </div>

          <button
            onClick={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
            className="h-12 w-full rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
            data-testid="ce-save"
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </DraggableSheet>

      <AddressSearchSheet
        nested
        open={addrSearchOpen}
        onOpenChange={setAddrSearchOpen}
        onSelect={(a, meta) => {
          setAddress1(a.address1);
          setCity(a.city);
          setState(a.state);
          setZip(a.zip);
          setAddrVerified(!!meta?.verified);
        }}
      />
    </>
  );
}
