import { useQuery, useMutation } from "@tanstack/react-query";
import { User, LogOut, Mail, Shield, Loader2, Monitor, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import MobileShell from "./mobile-shell";
import { SubPage } from "@/components/mobile/sub-page";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { clearCrmToken } from "@/lib/crmAuth";
import type { CrmUser } from "@shared/schema";

export default function MobileProfile() {
  const { data: currentUser, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/crm/auth/logout");
    },
    onSuccess: () => {
      clearCrmToken();
      queryClient.clear();
      window.location.href = "/crm/login";
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: "Owner",
      admin: "Administrator",
      sales: "Sales",
      tech: "Technician",
    };
    return labels[role] || role;
  };

  return (
    <MobileShell>
      <SubPage backTo="/mobile">
      <div className="p-4 pt-16 space-y-4" data-testid="mobile-profile">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#711419]" />
          </div>
        ) : currentUser ? (
          <>
            <Card className="border-slate-200">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-full bg-[#711419] flex items-center justify-center text-white text-2xl font-semibold mb-4">
                    {currentUser.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <h2 className="text-xl font-bold text-slate-800" data-testid="profile-name">
                    {currentUser.name}
                  </h2>
                  <div className="flex items-center gap-1.5 text-slate-500 mt-1">
                    <Shield className="h-4 w-4" />
                    <span data-testid="profile-role">{getRoleLabel(currentUser.role)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 mt-1">
                    <Mail className="h-4 w-4" />
                    <span data-testid="profile-email">{currentUser.email}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {currentUser.role !== "tech" && (
              <button
                onClick={() => { window.location.href = "/crm"; }}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all active:scale-[0.98]"
                data-testid="button-desktop-crm"
              >
                <Monitor className="h-5 w-5 text-[#711419]" />
                <span className="text-sm font-medium text-slate-800">Desktop CRM</span>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
              </button>
            )}

            <Card className="border-slate-200">
              <CardContent className="pt-6">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  data-testid="button-logout"
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <LogOut className="h-4 w-4 mr-2" />
                  )}
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <User className="h-16 w-16 text-slate-300 mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Not Signed In</h2>
            <Button
              onClick={() => window.location.href = "/crm/login"}
              className="mt-4"
              data-testid="button-go-to-login"
            >
              Sign In
            </Button>
          </div>
        )}
      </div>
      </SubPage>
    </MobileShell>
  );
}
