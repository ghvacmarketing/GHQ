import { useEffect, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { setCrmToken, crmFetch } from "@/lib/crmAuth";
import { isNativeApp, useKeyboardInset } from "@/lib/native";
import { AlertCircle, Lock, Mail, Loader2 } from "lucide-react";
import redlogo from "@assets/redlogo.webp";
import { WhatsNewPanel } from "@/components/crm/whats-new-panel";
import type { CrmUser } from "@shared/schema";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_authorized: "This Google account isn't authorized for the CRM. Ask an admin to add your email under Settings → Users & Roles.",
  google_inactive: "This Google account has been deactivated. Contact an admin to restore access.",
  google_unverified: "Google didn't confirm your email address. Try a different account.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "Google sign-in expired or was tampered with. Please try again.",
  google_not_configured: "Google sign-in isn't configured yet.",
  google_failed: "Google sign-in failed. Please try again.",
};

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function CrmLogin() {
  usePageTitle("CRM Login");
  const [location] = useLocation();
  const { toast } = useToast();
  // Phones: the sign-in pane must scroll and clear the keyboard so the
  // focused field is always visible while typing.
  const kbInset = useKeyboardInset();

  const googleError = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (!code) return null;
    return GOOGLE_ERROR_MESSAGES[code] || "Sign-in failed. Please try again.";
  }, [location]);

  // This device's session was displaced by a login somewhere else — surface
  // it loudly so an account takeover doesn't read as a random logout.
  const sessionReplaced = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("reason") === "session-replaced";
  }, [location]);

  const handleGoogleSignIn = () => {
    // Phones and the native shell must come back to the Field app — the
    // server-side OAuth callback can't see the viewport, so tell it now.
    const wantsMobile = isNativeApp() || window.innerWidth < 768;
    window.location.href = wantsMobile ? "/api/crm/auth/google?dest=mobile" : "/api/crm/auth/google";
  };

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await crmFetch("/api/crm/auth/me");
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || data;
    },
  });

  useEffect(() => {
    if (!authLoading && currentUser) {
      // Technicians go to the mobile app, others to the CRM — except on
      // phones and inside the App Store shell, where EVERYONE lands on
      // /mobile (the desktop CRM is a desktop thing).
      if (currentUser.role === "tech" || isNativeApp() || window.innerWidth < 768) {
        window.location.href = "/mobile";
      } else {
        window.location.href = "/crm";
      }
    }
  }, [authLoading, currentUser]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await fetch("/api/crm/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Invalid credentials");
      return res.json();
    },
    onSuccess: (data) => {
      // Phones and the native shell land straight in the Field app — sending
      // them to "/" bounced them back to the mobile welcome page in a loop.
      // Desktop techs go to /mobile too; everyone else gets the launcher.
      const dest =
        data.user?.role === "tech" || isNativeApp() || window.innerWidth < 768 ? "/mobile" : "/";
      if (data.token) {
        setCrmToken(data.token);
        // Small delay to ensure localStorage is flushed before navigation
        setTimeout(() => {
          window.location.href = dest;
        }, 100);
      } else {
        window.location.href = dest;
      }
    },
    onError: () => {
      toast({
        title: "Login failed",
        description: "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#4a0d10] to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (currentUser) {
    return null;
  }

  return (
    <div className="flex h-screen bg-[#f4f5f6] lg:bg-background">
      {/* Left — sign in. Scrollable with keyboard clearance so the focused
          field always stays visible on phones. */}
      <div
        className="relative h-full w-full overflow-y-auto lg:w-[46%]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        onFocusCapture={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === "INPUT") {
            setTimeout(() => {
              window.scrollTo(0, 0);
              t.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 300);
          }
        }}
      >
        <div
          className="flex min-h-[calc(100%+1px)] flex-col justify-start pb-10 pt-[12vh] px-5 sm:px-10 lg:justify-center lg:px-16 lg:py-10"
          style={{
            paddingBottom: `calc(2.5rem + ${kbInset}px)`,
            transition: "padding-bottom 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
        <div className="mx-auto w-full max-w-sm animate-in fade-in duration-300">
          <img src={redlogo} alt="Giesbrecht HVAC" className="mx-auto mb-6 h-11 lg:mx-0 lg:mb-8 lg:h-12" />
          <h1 className="text-center text-[26px] font-semibold tracking-tight text-slate-900 lg:text-left lg:text-2xl lg:text-foreground">Sign in to GHQ</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground lg:block">Giesbrecht HVAC Headquarters</p>

          {googleError && (
            <div className="mt-6 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="banner-google-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{googleError}</span>
            </div>
          )}

          {sessionReplaced && (
            <div className="mt-6 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="banner-session-replaced">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">You were signed out — someone just signed in to your account on another device.</span>{" "}
                If that was you, sign back in. If it wasn't, sign in and change your password right away.
              </span>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            className="mt-7 h-12 w-full rounded-[4px] border-slate-300/70 bg-white font-medium"
            data-testid="button-google-signin"
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.12A6.74 6.74 0 015.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A10.99 10.99 0 001 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </Button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#f4f5f6] px-2 text-muted-foreground lg:bg-background">or with email</span></div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" placeholder="you@company.com" className="h-12 rounded-[4px] pl-10 text-[16px]" {...form.register("email")} data-testid="input-email" />
              </div>
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" placeholder="Enter your password" className="h-12 rounded-[4px] pl-10 text-[16px]" {...form.register("password")} data-testid="input-password" />
              </div>
              {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
            </div>
            <Button type="submit" className="h-12 w-full rounded-[4px] bg-[#711419] text-base hover:bg-[#5a1014]" disabled={loginMutation.isPending} data-testid="button-login">
              {loginMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Signing in…</> : "Sign in"}
            </Button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-5 text-center">
            <p className="text-sm text-muted-foreground">
              Giesbrecht HVAC customer?{" "}
              {/* Phones go back to the welcome chooser (both doors), not
                  straight into the other login. Desktop has no chooser. */}
              <a
                href={isNativeApp() || window.innerWidth < 768 ? "/" : "/portal/login"}
                className="font-medium text-[#711419] hover:underline"
                data-testid="link-customer-portal"
              >
                {isNativeApp() || window.innerWidth < 768 ? "Choose a different sign-in" : "Sign in to the Customer Portal"}
              </a>
            </p>
          </div>
        </div>
        </div>
      </div>

      {/* Right — brand + what's new carousel */}
      <WhatsNewPanel />
    </div>
  );
}
