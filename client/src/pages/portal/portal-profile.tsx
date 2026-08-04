import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, User, Phone, KeyRound, MapPin, ShieldCheck, LogOut } from "lucide-react";
import { PortalLayout, PortalHeader } from "./portal-layout";

interface ProfileData {
  customer: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    fullAddress: string | null;
  };
  account: {
    email: string | null;
    phone: string | null;
    hasPassword: boolean;
    phoneVerified: boolean;
    lastLoginAt: string | null;
  };
  properties: Array<{
    id: string;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip: string;
  }>;
}

async function postJson(method: string, url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // ignore non-JSON bodies
  }
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

const inputClass = "h-12 rounded-[4px] text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400";

/** Section shell in the app's card voice: uppercase label strip + body. */
function Section({ icon: Icon, label, children, testid }: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <div className="rounded-[4px] border border-slate-300/70 bg-white" data-testid={testid}>
      <p className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5 text-[#711419]" />
        {label}
      </p>
      <div className="space-y-4 p-3.5">{children}</div>
    </div>
  );
}

function PrimaryButton({ onClick, disabled, pending, children, testid }: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || pending}
      className="flex h-12 w-full items-center justify-center rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:bg-slate-300"
      data-testid={testid}
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

export default function PortalProfile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["/api/portal/profile"],
    retry: false,
  });

  useEffect(() => {
    if (error) setLocation("/portal/login");
  }, [error, setLocation]);

  // Contact info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Phone change
  const [newPhone, setNewPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Address request
  const [addressMessage, setAddressMessage] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.customer.name || "");
      setEmail(profile.account.email || profile.customer.email || "");
    }
  }, [profile]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/portal/auth/me"] });
  };

  const saveProfile = useMutation({
    mutationFn: () => postJson("PATCH", "/api/portal/profile", { name, email }),
    onSuccess: (data) => {
      toast({
        title: "Profile updated",
        description: data.synced
          ? "Your information has been updated."
          : "Your changes were saved and our office has been notified.",
      });
      refresh();
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const startPhoneChange = useMutation({
    mutationFn: () => postJson("POST", "/api/portal/profile/phone/start", { phone: newPhone }),
    onSuccess: () => {
      setPhoneCodeSent(true);
      toast({ title: "Code sent", description: "We texted a verification code to the new number." });
    },
    onError: (e: Error) => toast({ title: "Couldn't send code", description: e.message, variant: "destructive" }),
  });

  const verifyPhoneChange = useMutation({
    mutationFn: () => postJson("POST", "/api/portal/profile/phone/verify", { phone: newPhone, code: phoneCode }),
    onSuccess: () => {
      toast({ title: "Phone updated", description: "Your phone number has been changed." });
      setNewPhone("");
      setPhoneCode("");
      setPhoneCodeSent(false);
      refresh();
    },
    onError: (e: Error) => toast({ title: "Verification failed", description: e.message, variant: "destructive" }),
  });

  const changePassword = useMutation({
    mutationFn: () => {
      if (newPassword !== confirmPassword) throw new Error("Passwords don't match");
      if (profile?.account.hasPassword) {
        return postJson("POST", "/api/portal/auth/change-password", { currentPassword, newPassword });
      }
      return postJson("POST", "/api/portal/auth/set-password", { password: newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password saved", description: "Your password has been updated." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      refresh();
    },
    onError: (e: Error) => toast({ title: "Password change failed", description: e.message, variant: "destructive" }),
  });

  const requestAddressChange = useMutation({
    mutationFn: () => postJson("POST", "/api/portal/profile/address-request", { message: addressMessage }),
    onSuccess: () => {
      toast({ title: "Request sent", description: "Our office will review your address change shortly." });
      setAddressMessage("");
    },
    onError: (e: Error) => toast({ title: "Request failed", description: e.message, variant: "destructive" }),
  });

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/portal/auth/logout");
    } catch (e) {
    }
    setLocation("/portal/login");
  };

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="space-y-4">
          <div className="skeleton-shimmer h-9 w-48 rounded-[4px] bg-slate-200" />
          <div className="skeleton-shimmer h-56 rounded-[4px] bg-slate-200" />
          <div className="skeleton-shimmer h-56 rounded-[4px] bg-slate-200" style={{ "--shimmer-delay": "0.08s" } as React.CSSProperties} />
        </div>
      </PortalLayout>
    );
  }

  if (!profile) return null;

  return (
    <PortalLayout>
      <PortalHeader
        title="My Profile"
        subtitle={profile.customer.companyName || "Manage your contact info and login details"}
      />

      <div className="space-y-4">
        {/* Contact info */}
        <Section icon={User} label="Contact information" testid="card-contact-info">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              data-testid="input-profile-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              data-testid="input-profile-email"
            />
          </div>
          <PrimaryButton
            onClick={() => saveProfile.mutate()}
            pending={saveProfile.isPending}
            testid="button-save-profile"
          >
            Save Changes
          </PrimaryButton>
        </Section>

        {/* Phone number */}
        <Section icon={Phone} label="Phone number" testid="card-phone">
          <p className="text-sm text-slate-600">
            Current: <span className="font-semibold">{profile.account.phone || profile.customer.phone || "None on file"}</span>
            {profile.account.phoneVerified && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500">
            Because your phone number is used to log in, changing it requires verifying the new number by text.
          </p>
          <div className="space-y-2">
            <Label htmlFor="new-phone">New phone number</Label>
            <Input
              id="new-phone"
              type="tel"
              placeholder="(555) 555-1234"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              disabled={phoneCodeSent}
              className={inputClass}
              data-testid="input-new-phone"
            />
          </div>
          {phoneCodeSent && (
            <div className="space-y-2">
              <Label htmlFor="phone-code">Verification code</Label>
              <Input
                id="phone-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                className={inputClass}
                data-testid="input-phone-code"
              />
            </div>
          )}
          {!phoneCodeSent ? (
            <PrimaryButton
              onClick={() => startPhoneChange.mutate()}
              disabled={!newPhone.trim()}
              pending={startPhoneChange.isPending}
              testid="button-start-phone-change"
            >
              Text Me a Code
            </PrimaryButton>
          ) : (
            <div className="space-y-2">
              <PrimaryButton
                onClick={() => verifyPhoneChange.mutate()}
                disabled={phoneCode.length < 6}
                pending={verifyPhoneChange.isPending}
                testid="button-verify-phone-change"
              >
                Verify &amp; Update
              </PrimaryButton>
              <button
                onClick={() => { setPhoneCodeSent(false); setPhoneCode(""); }}
                className="flex h-12 w-full items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-base font-semibold text-slate-700 transition-transform active:scale-[0.98]"
                data-testid="button-cancel-phone-change"
              >
                Cancel
              </button>
            </div>
          )}
        </Section>

        {/* Password */}
        <Section icon={KeyRound} label={profile.account.hasPassword ? "Change password" : "Create password"} testid="card-password">
          {!profile.account.hasPassword && (
            <p className="text-sm text-slate-500">
              Set a password so you can log in anytime with your phone number or email.
            </p>
          )}
          {profile.account.hasPassword && (
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
                data-testid="input-current-password"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="profile-new-password">New password</Label>
            <Input
              id="profile-new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              data-testid="input-profile-new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-confirm-password">Confirm new password</Label>
            <Input
              id="profile-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              data-testid="input-profile-confirm-password"
            />
          </div>
          <PrimaryButton
            onClick={() => changePassword.mutate()}
            disabled={newPassword.length < 8}
            pending={changePassword.isPending}
            testid="button-change-password"
          >
            Save Password
          </PrimaryButton>
        </Section>

        {/* Addresses */}
        <Section icon={MapPin} label="Service addresses" testid="card-addresses">
          <ul className="space-y-2">
            {profile.customer.fullAddress && (
              <li className="rounded-[4px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" data-testid="text-primary-address">
                {profile.customer.fullAddress}
              </li>
            )}
            {profile.properties.map((p) => (
              <li key={p.id} className="rounded-[4px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" data-testid={`text-property-${p.id}`}>
                {[p.address1, p.address2, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(", ")}
              </li>
            ))}
            {!profile.customer.fullAddress && profile.properties.length === 0 && (
              <li className="text-sm text-slate-400">No addresses on file.</li>
            )}
          </ul>
          <div className="space-y-2">
            <Label htmlFor="address-message">Request a change</Label>
            <Textarea
              id="address-message"
              placeholder="e.g. We've moved — our new address is..."
              value={addressMessage}
              onChange={(e) => setAddressMessage(e.target.value)}
              rows={3}
              className="rounded-[4px] text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400"
              data-testid="input-address-message"
            />
          </div>
          <button
            onClick={() => requestAddressChange.mutate()}
            disabled={requestAddressChange.isPending || !addressMessage.trim()}
            className="flex h-12 w-full items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-base font-semibold text-slate-700 transition-transform active:scale-[0.98] disabled:opacity-50"
            data-testid="button-request-address-change"
          >
            {requestAddressChange.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send Request"}
          </button>
        </Section>

        {/* Log out — the shell has no banner anymore, so it lives here */}
        <button
          onClick={handleLogout}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] border border-red-200 bg-white text-base font-semibold text-red-600 transition-transform active:scale-[0.98]"
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </button>
      </div>
    </PortalLayout>
  );
}
