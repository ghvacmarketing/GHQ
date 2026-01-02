import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CrmUser } from "@shared/schema";

interface CrmRouteGuardProps {
  children: React.ReactNode;
}

export default function CrmRouteGuard({ children }: CrmRouteGuardProps) {
  const [, navigate] = useLocation();

  const { data: currentUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!isLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [isLoading, currentUser, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background" data-testid="crm-auth-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Verifying access...</p>
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
