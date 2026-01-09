import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import ghvacLogo from "@assets/ghvac-logo.png";

interface PortalLayoutProps {
  children: ReactNode;
  showLogout?: boolean;
}

export function PortalLayout({ children, showLogout = true }: PortalLayoutProps) {
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/portal/auth/logout");
    } catch (e) {
    }
    setLocation("/portal/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7]" data-testid="portal-layout">
      <header className="bg-[#711419] text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/portal/dashboard">
            <img 
              src={ghvacLogo} 
              alt="Giesbrecht HVAC" 
              className="h-12 w-auto object-contain cursor-pointer brightness-0 invert"
              data-testid="link-portal-home"
            />
          </Link>
          {showLogout && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-white hover:bg-white/10"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 py-8">
        <div className="max-w-5xl mx-auto px-4">
          {children}
        </div>
      </main>

      <footer className="bg-slate-100 border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} Giesbrecht HVAC. All rights reserved.</p>
          <p className="mt-1">
            Questions? Contact us at{" "}
            <a href="tel:+17068260644" className="text-[#711419] hover:underline" data-testid="link-phone">
              (706) 826-0644
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
