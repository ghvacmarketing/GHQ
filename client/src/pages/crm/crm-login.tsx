import { useEffect } from "react";
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
import { ArrowLeft, Building2, Lock, Mail, Loader2, Home } from "lucide-react";
import { Link } from "wouter";
import type { CrmUser } from "@shared/schema";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function CrmLogin() {
  usePageTitle("CRM Login");
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
          // Technicians go directly to mobile app, others go to CRM
          if (data.user?.role === "tech") {
            window.location.href = "/mobile";
          } else {
            window.location.href = "/crm";
          }
        }, 100);
      } else {
        // Fallback if no token returned
        if (data.user?.role === "tech") {
          window.location.href = "/mobile";
        } else {
          window.location.href = "/crm";
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

  const handleBackToHome = () => {
    navigate("/");
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#4a0d10] to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWOGgydjh6bTAgMjRoLTJ2LTRoMnY0em0wIDZoLTJ2LTRoMnY0em0tOC0xMmgtMnYtNGgydjR6bTAgNmgtMnYtNGgydjR6bTAtMTJoLTJ2LTRoMnY0em0wLTZoLTJWOGgydjh6bTAgMjRoLTJ2LTRoMnY0em0wIDZoLTJ2LTRoMnY0em0tOC02aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHptMC02aC0yVjhoMnY4em0wIDI0aC0ydi00aDJ2NHptMCA2aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>

      <Link href="/">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 z-20 bg-white/10 hover:bg-white/20 text-white shadow-lg transition-all"
          data-testid="button-home"
        >
          <Home className="h-5 w-5" />
        </Button>
      </Link>

      <div className="w-full max-w-md relative z-10">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          onClick={handleBackToHome}
          data-testid="button-back-gate"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2 pt-8">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-[#711419] to-[#8b1a20] flex items-center justify-center shadow-lg">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold">GHQ Login</CardTitle>
            <CardDescription className="text-base">
              Sign in to access GHVAC Headquarters
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-4">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    className="pl-10 h-12 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                    {...form.register("email")}
                    data-testid="input-email"
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="pl-10 h-12 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                    {...form.register("password")}
                    data-testid="input-password"
                  />
                </div>
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-[#711419] to-[#8b1a20] hover:from-[#8b1a20] hover:to-[#711419] shadow-lg hover:shadow-xl transition-all"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-slate-400 text-sm mt-6">
          Giesbrecht HVAC Headquarters
        </p>
      </div>
    </div>
  );
}
