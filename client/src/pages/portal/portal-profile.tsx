import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Phone, KeyRound, MapPin, ShieldCheck } from "lucide-react";
import { PortalLayout } from "./portal-layout";

const BRAND = "#711419";

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

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </PortalLayout>
    );
  }

  if (!profile) return null;

  return (
    <PortalLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-800" data-testid="text-profile-title">My Profile</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your contact information and login details.
          </p>
        </div>

        {/* Contact info */}
        <Card data-testid="card-contact-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" style={{ color: BRAND }} /> Contact Information
            </CardTitle>
            {profile.customer.companyName && (
              <CardDescription>{profile.customer.companyName}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                data-testid="input-profile-email"
              />
            </div>
            <Button
              onClick={() => saveProfile.mutate()}
              disabled={saveProfile.isPending}
              className="text-white"
              style={{ backgroundColor: BRAND }}
              data-testid="button-save-profile"
            >
              {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Phone number */}
        <Card data-testid="card-phone">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5" style={{ color: BRAND }} /> Phone Number
            </CardTitle>
            <CardDescription>
              Current: {profile.account.phone || profile.customer.phone || "None on file"}
              {profile.account.phoneVerified && (
                <span className="inline-flex items-center gap-1 ml-2 text-emerald-600">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  data-testid="input-phone-code"
                />
              </div>
            )}
            <div className="flex gap-2">
              {!phoneCodeSent ? (
                <Button
                  onClick={() => startPhoneChange.mutate()}
                  disabled={startPhoneChange.isPending || !newPhone.trim()}
                  className="text-white"
                  style={{ backgroundColor: BRAND }}
                  data-testid="button-start-phone-change"
                >
                  {startPhoneChange.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Text Me a Code"}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => verifyPhoneChange.mutate()}
                    disabled={verifyPhoneChange.isPending || phoneCode.length < 6}
                    className="text-white"
                    style={{ backgroundColor: BRAND }}
                    data-testid="button-verify-phone-change"
                  >
                    {verifyPhoneChange.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Update"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setPhoneCodeSent(false); setPhoneCode(""); }}
                    data-testid="button-cancel-phone-change"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Password */}
        <Card data-testid="card-password">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5" style={{ color: BRAND }} />
              {profile.account.hasPassword ? "Change Password" : "Create Password"}
            </CardTitle>
            {!profile.account.hasPassword && (
              <CardDescription>
                Set a password so you can log in anytime with your phone number or email.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.account.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
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
                data-testid="input-profile-confirm-password"
              />
            </div>
            <Button
              onClick={() => changePassword.mutate()}
              disabled={changePassword.isPending || newPassword.length < 8}
              className="text-white"
              style={{ backgroundColor: BRAND }}
              data-testid="button-change-password"
            >
              {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Password"}
            </Button>
          </CardContent>
        </Card>

        {/* Addresses */}
        <Card data-testid="card-addresses">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5" style={{ color: BRAND }} /> Service Addresses
            </CardTitle>
            <CardDescription>
              Need an address corrected or added? Send us a note and our office will take care of it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {profile.customer.fullAddress && (
                <li className="text-sm text-slate-700 rounded-md bg-slate-50 border border-slate-200 p-3" data-testid="text-primary-address">
                  {profile.customer.fullAddress}
                </li>
              )}
              {profile.properties.map((p) => (
                <li key={p.id} className="text-sm text-slate-700 rounded-md bg-slate-50 border border-slate-200 p-3" data-testid={`text-property-${p.id}`}>
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
                data-testid="input-address-message"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => requestAddressChange.mutate()}
              disabled={requestAddressChange.isPending || !addressMessage.trim()}
              data-testid="button-request-address-change"
            >
              {requestAddressChange.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
