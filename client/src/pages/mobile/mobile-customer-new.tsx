import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, Check, Home, Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LEAD_SOURCES } from "@/lib/lead-sources";
import { MobileCreatePage } from "@/components/mobile/mobile-create-page";
import { AddressAutocomplete } from "@/components/mobile/address-autocomplete";
import type { AccountType, LeadSource } from "@shared/schema";

/** New Customer — the mobile twin of the CRM's account-create wizard. It
 *  collects exactly the fields that wizard persists, posts the same
 *  create-with-property payload, and then opens the new customer's detail
 *  page, so a record made in the field is indistinguishable from a desktop one. */

const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string; icon: typeof Home }[] = [
  { value: "RESIDENTIAL", label: "Residential", hint: "Homeowners and renters", icon: Home },
  { value: "COMMERCIAL", label: "Commercial", hint: "Business properties", icon: Building2 },
  { value: "PROPERTY_MANAGER", label: "Property Manager", hint: "Companies with multiple sites", icon: Users },
];

// The CRM stores these display-cased strings — match them exactly.
const CUSTOMER_TYPE_BY_ACCOUNT: Record<AccountType, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  PROPERTY_MANAGER: "Property Manager",
};

export default function MobileCustomerNew() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [accountType, setAccountType] = useState<AccountType>("RESIDENTIAL");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [displayNameEdited, setDisplayNameEdited] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [accessInstructions, setAccessInstructions] = useState("");
  const [gateCode, setGateCode] = useState("");
  const [leadSource, setLeadSource] = useState<LeadSource | "">("");
  const [note, setNote] = useState("");

  const isPM = accountType === "PROPERTY_MANAGER";

  // Same derivation as the CRM: company name wins, else first + last.
  const autoDisplayName = useMemo(() => {
    if (isPM) return companyName.trim();
    if (companyName.trim()) return companyName.trim();
    return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  }, [isPM, companyName, firstName, lastName]);
  const displayName = displayNameEdited ? displayNameInput : autoDisplayName;

  const createCustomer = useMutation({
    mutationFn: async () => {
      const fullAddress = `${address1.trim()}${address2.trim() ? `, ${address2.trim()}` : ""}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;
      const access = accessInstructions.trim();
      const gate = gateCode.trim();
      const res = await apiRequest("POST", "/api/crm/customers/create-with-property", {
        customer: {
          name: displayName.trim(),
          companyName: companyName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          customerType: CUSTOMER_TYPE_BY_ACCOUNT[accountType],
          customerStatus: "prospect",
          fullAddress,
          leadSource: leadSource || null,
          notes: note.trim() || null,
        },
        // Property managers: the address is their HQ/mailing address, not a
        // service site, so no property row (matches the CRM wizard).
        property: isPM
          ? null
          : {
              address1: address1.trim(),
              address2: address2.trim() || null,
              city: city.trim(),
              state: state.trim(),
              zip: zip.trim(),
              notes: access || gate ? `Access: ${access} Gate: ${gate}`.trim() : null,
            },
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"], exact: false });
      toast({ title: "Customer created", description: `${displayName.trim()} is in the CRM.` });
      if (data?.customer?.id) navigate(`/mobile/customers/${data.customer.id}`);
      else navigate("/mobile/customers");
    },
    onError: (e: any) =>
      toast({ title: "Couldn't create the customer", description: e?.message, variant: "destructive" }),
  });

  // Required fields mirror the CRM wizard: identity by type, plus a full address.
  const missing = useMemo(() => {
    const m: string[] = [];
    if (isPM) {
      if (!companyName.trim()) m.push("Company name");
      if (!phone.trim()) m.push("Main office phone");
    } else {
      if (!firstName.trim()) m.push("First name");
      if (accountType === "COMMERCIAL" && !companyName.trim()) m.push("Company name");
    }
    if (!displayName.trim()) m.push("Display name");
    if (!address1.trim()) m.push("Address");
    if (!city.trim()) m.push("City");
    if (!state.trim()) m.push("State");
    if (!zip.trim()) m.push("ZIP");
    return m;
  }, [isPM, accountType, companyName, phone, firstName, displayName, address1, city, state, zip]);

  const dirty =
    [firstName, lastName, companyName, phone, email, address1, address2, city, state, zip, accessInstructions, gateCode, note]
      .some((v) => v.trim().length > 0) ||
    accountType !== "RESIDENTIAL" ||
    leadSource !== "";

  const submit = () => {
    if (missing.length > 0) {
      toast({ title: "Still needed", description: missing.join(", "), variant: "destructive" });
      return;
    }
    createCustomer.mutate();
  };

  const sectionLabel = "mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400";

  return (
    <MobileCreatePage
      title="New customer"
      dirty={dirty}
      exitTo="/mobile/customers"
      onSave={submit}
      saveDisabled={missing.length > 0}
      saving={createCustomer.isPending}
      testid="mobile-customer-new-page"
    >
      <div className="space-y-6">
        {/* Type — drives which identity fields matter, same as the CRM */}
        <div>
          <p className={sectionLabel}>Account type</p>
          <div className="space-y-2">
            {ACCOUNT_TYPES.map((t) => {
              const Icon = t.icon;
              const selected = accountType === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setAccountType(t.value)}
                  className={`flex w-full items-center gap-3 rounded-[4px] border px-3 py-2.5 text-left transition-colors ${
                    selected ? "border-[#711419] bg-[#711419]/[0.06]" : "border-slate-300/70 bg-white"
                  }`}
                  data-testid={`nc-type-${t.value}`}
                >
                  <Icon className={`h-5 w-5 shrink-0 ${selected ? "text-[#711419]" : "text-slate-400"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${selected ? "text-[#711419]" : "text-slate-900"}`}>
                      {t.label}
                    </span>
                    <span className="block text-xs text-slate-500">{t.hint}</span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Identity */}
        <div className="space-y-3.5">
          <p className={sectionLabel}>{isPM ? "Company" : "Contact"}</p>
          {!isPM && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="nc-first" className="mb-1.5 block">First name *</Label>
                <Input id="nc-first" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="nc-first" />
              </div>
              <div>
                <Label htmlFor="nc-last" className="mb-1.5 block">Last name</Label>
                <Input id="nc-last" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="nc-last" />
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="nc-company" className="mb-1.5 block">
              Company name {accountType === "RESIDENTIAL" ? "(optional)" : "*"}
            </Label>
            <Input
              id="nc-company"
              autoFocus={isPM}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={isPM ? "Management company" : "Business name"}
              data-testid="nc-company"
            />
          </div>
          <div>
            <Label htmlFor="nc-display" className="mb-1.5 block">Display name *</Label>
            <Input
              id="nc-display"
              value={displayName}
              onChange={(e) => {
                setDisplayNameInput(e.target.value);
                setDisplayNameEdited(e.target.value.trim().length > 0 && e.target.value !== autoDisplayName);
              }}
              placeholder="How they appear in the CRM"
              data-testid="nc-display"
            />
          </div>
          <div>
            <Label htmlFor="nc-phone" className="mb-1.5 block">
              {isPM ? "Main office phone *" : "Phone"}
            </Label>
            <Input id="nc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(706) 555-0123" data-testid="nc-phone" />
          </div>
          <div>
            <Label htmlFor="nc-email" className="mb-1.5 block">
              {isPM ? "Main office email" : "Email"}
            </Label>
            <Input id="nc-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" data-testid="nc-email" />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-3.5">
          <p className={sectionLabel}>{isPM ? "Mailing / HQ address" : "Service address"}</p>
          {isPM && (
            <p className="-mt-1 text-xs text-slate-500">
              Property managers don't get a service site from this address — add their properties from the customer's page.
            </p>
          )}
          <div>
            <Label className="mb-1.5 block">Find the address</Label>
            <AddressAutocomplete
              value={address1 && city ? `${address1}, ${city}, ${state} ${zip}` : ""}
              onChange={(addr) => {
                // "123 Main St, Wrens, GA 30833, USA" → split into the fields
                const parts = addr.split(",").map((x) => x.trim());
                if (parts.length >= 3) {
                  setAddress1(parts[0]);
                  setCity(parts[1]);
                  const st = parts[2].match(/^([A-Za-z]{2})\s+(\d{5})/);
                  if (st) { setState(st[1].toUpperCase()); setZip(st[2]); }
                } else {
                  setAddress1(addr);
                }
              }}
              testid="nc-address-search"
            />
          </div>
          <div>
            <Label htmlFor="nc-address1" className="mb-1.5 block">Address line 1 *</Label>
            <Input id="nc-address1" value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="123 Main St" data-testid="nc-address1" />
          </div>
          <div>
            <Label htmlFor="nc-address2" className="mb-1.5 block">Address line 2</Label>
            <Input id="nc-address2" value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Apt, suite, unit" data-testid="nc-address2" />
          </div>
          <div>
            <Label htmlFor="nc-city" className="mb-1.5 block">City *</Label>
            <Input id="nc-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Augusta" data-testid="nc-city" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="nc-state" className="mb-1.5 block">State *</Label>
              <Input id="nc-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="GA" maxLength={2} autoCapitalize="characters" data-testid="nc-state" />
            </div>
            <div>
              <Label htmlFor="nc-zip" className="mb-1.5 block">ZIP *</Label>
              <Input id="nc-zip" value={zip} inputMode="numeric" onChange={(e) => setZip(e.target.value)} placeholder="30830" data-testid="nc-zip" />
            </div>
          </div>
          {!isPM && (
            <>
              <div>
                <Label htmlFor="nc-access" className="mb-1.5 block">Access instructions</Label>
                <Input id="nc-access" value={accessInstructions} onChange={(e) => setAccessInstructions(e.target.value)} placeholder="Dog in the yard, unit behind the shed…" data-testid="nc-access" />
              </div>
              <div>
                <Label htmlFor="nc-gate" className="mb-1.5 block">Gate code</Label>
                <Input id="nc-gate" value={gateCode} onChange={(e) => setGateCode(e.target.value)} data-testid="nc-gate" />
              </div>
            </>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3.5">
          <p className={sectionLabel}>Details</p>
          <div>
            <Label className="mb-1.5 block">Lead source</Label>
            <Select value={leadSource} onValueChange={(v) => setLeadSource(v as LeadSource)}>
              <SelectTrigger data-testid="nc-lead-source">
                <SelectValue placeholder="How did they find us?" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="nc-note" className="mb-1.5 block">Note</Label>
            <Textarea
              id="nc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the office should know"
              className="min-h-[80px]"
              data-testid="nc-note"
            />
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={createCustomer.isPending || missing.length > 0}
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
