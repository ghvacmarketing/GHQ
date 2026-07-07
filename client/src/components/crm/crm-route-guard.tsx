import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crmFetch } from "@/lib/crmAuth";
import redLogo from "@assets/redlogo.webp";
import type { CrmUser } from "@shared/schema";

interface CrmRouteGuardProps {
  children: React.ReactNode;
}

export default function CrmRouteGuard({ children }: CrmRouteGuardProps) {
  const [, navigate] = useLocation();

  const { data: currentUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await crmFetch("/api/crm/auth/me");
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || data;
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000, // Poll so role/permission changes propagate in near real-time
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!isLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [isLoading, currentUser, navigate]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background"
        data-testid="crm-auth-loading"
      >
        {/* Unique, minimalist GHQ entry loader: breathing logo + a sweeping bar. */}
        <div className="relative">
          <span className="absolute inset-0 rounded-2xl bg-[#711419]/10 blur-xl animate-pulse" />
          <img
            src={redLogo}
            alt="GHQ"
            className="relative h-12 w-12 rounded-xl object-contain animate-[pulse_2.2s_ease-in-out_infinite]"
          />
        </div>
        <div className="h-1 w-36 overflow-hidden rounded-full bg-[#711419]/10">
          <div
            className="h-full w-1/4 rounded-full bg-[#711419]"
            style={{ animation: "ghq-loader-sweep 1.1s ease-in-out infinite" }}
          />
        </div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Entering GHQ</p>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (currentUser.role === "tech") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4" data-testid="crm-access-denied">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldX className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6">
            Technicians should use the mobile app for daily work orders and job management.
          </p>
          <Button 
            onClick={() => window.location.href = "/mobile"}
            className="bg-[#711419] hover:bg-[#8a1a1f] text-white"
            data-testid="button-go-to-mobile"
          >
            Go to Mobile App
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
