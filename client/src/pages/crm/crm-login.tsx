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

  const googleError = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (!code) return null;
    return GOOGLE_ERROR_MESSAGES[code] || "Sign-in failed. Please try again.";
  }, [location]);

  const handleGoogleSignIn = () => {
    window.location.href = "/api/crm/auth/google";
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
      // Technicians go to mobile app, others go to CRM
      if (currentUser.role === "tech") {
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
      if (data.token) {
        setCrmToken(data.token);
        // Small delay to ensure localStorage is flushed before navigation
        setTimeout(() => {
          // Technicians go directly to mobile app, others go to the selection screen
          if (data.user?.role === "tech") {
            window.location.href = "/mobile";
          } else {
            window.location.href = "/";
          }
        }, 100);
      } else {
        // Fallback if no token returned
        if (data.user?.role === "tech") {
          window.location.href = "/mobile";
        } else {
          window.location.href = "/";
        }
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
    <div className="flex min-h-screen bg-background">
      {/* Left — sign in */}
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-10 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <img src={redlogo} alt="Giesbrecht HVAC" className="mb-8 h-12" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in to GHQ</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Giesbrecht HVAC Headquarters</p>

          {googleError && (
            <div className="mt-6 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="banner-google-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{googleError}</span>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            className="mt-7 h-11 w-full font-medium"
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
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or with email</span></div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" placeholder="you@company.com" className="h-11 pl-10" {...form.register("email")} data-testid="input-email" />
              </div>
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" placeholder="Enter your password" className="h-11 pl-10" {...form.register("password")} data-testid="input-password" />
              </div>
              {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
            </div>
            <Button type="submit" className="h-11 w-full bg-[#711419] text-base hover:bg-[#5a1014]" disabled={loginMutation.isPending} data-testid="button-login">
              {loginMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Signing in…</> : "Sign in"}
            </Button>
          </form>
        </div>
      </div>

      {/* Right — brand + what's new carousel */}
      <WhatsNewPanel />
    </div>
  );
}
