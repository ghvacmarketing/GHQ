import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Smartphone, Wrench, ChevronRight, Loader2 } from "lucide-react";
import { crmFetch } from "@/lib/crmAuth";
import { getQueryFn } from "@/lib/queryClient";
import type { CrmUser, PortalUser } from "@shared/schema";
import redlogo from "@assets/redlogo.webp";

function firstNameOf(name?: string | null): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] || "";
}

export default function LandingSelect() {
  const { data: crmUser, isLoading: isLoadingCrm } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await crmFetch("/api/crm/auth/me");
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || data;
    },
    staleTime: 60 * 1000,
  });

  const { data: portalUser, isLoading: isLoadingPortal } = useQuery<PortalUser | null>({
    queryKey: ["/api/employee-portal/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60 * 1000,
  });

  const [, navigate] = useLocation();

  const ready = !isLoadingCrm && !isLoadingPortal;
  const isAuthenticated = !!crmUser?.id;

  // Require sign-in before reaching the app selection screen.
  useEffect(() => {
    if (ready && !isAuthenticated) {
      navigate("/crm/login");
    }
  }, [ready, isAuthenticated, navigate]);

  const firstName = firstNameOf(crmUser?.name) || firstNameOf(portalUser?.username);
  const fullText = `Welcome${firstName ? `, ${firstName}` : ""}`;

  const [typed, setTyped] = useState("");
  const [stage, setStage] = useState(0); // 0: typing, 1: subheading, 2: cards

  useEffect(() => {
    if (!ready) return;
    setTyped("");
    setStage(0);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(interval);
        const t1 = setTimeout(() => setStage(1), 350);
        const t2 = setTimeout(() => setStage(2), 1000);
        timeouts.push(t1, t2);
      }
    }, 75);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    return () => {
      clearInterval(interval);
      timeouts.forEach(clearTimeout);
    };
  }, [ready, fullText]);

  const typingDone = typed.length >= fullText.length && fullText.length > 0;

  // While verifying the session (or redirecting an unauthenticated visitor to
  // login), show a loader instead of the app selection screen.
  if (!ready || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#4a0d10] to-slate-900 flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#e08a8f] mb-4" />
        <p className="text-slate-300">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#4a0d10] to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWOGgydjh6bTAgMjRoLTJ2LTRoMnY0em0wIDZoLTJ2LTRoMnY0em0tOC0xMmgtMnYtNGgydjR6bTAgNmgtMnYtNGgydjR6bTAtMTJoLTJ2LTRoMnY0em0wLTZoLTJWOGgydjh6bTAgMjRoLTJ2LTRoMnY0em0wIDZoLTJ2LTRoMnY0em0tOC02aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHptMC02aC0yVjhoMnY4em0wIDI0aC0ydi00aDJ2NHptMCA2aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>

      <div className="relative z-10 w-full max-w-3xl">
        <div className="text-center mb-10">
          <img src={redlogo} alt="GHVAC" className="h-16 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-2 min-h-[2.5rem]" data-testid="text-welcome">
            <span>{typed}</span>
            <span
              className={`inline-block w-[3px] h-7 align-middle ml-1 bg-[#e08a8f] ${
                typingDone ? "opacity-0" : "animate-pulse"
              }`}
            />
          </h1>
          <p
            className={`text-slate-300 transition-opacity duration-700 ${
              stage >= 1 ? "opacity-100" : "opacity-0"
            }`}
            data-testid="text-subheading"
          >
            Choose where you'd like to go.
          </p>
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-5 transition-opacity duration-700 ${
            stage >= 2 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Link href="/crm">
            <div
              className="group h-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 hover:border-[#711419] rounded-2xl p-8 cursor-pointer transition-all duration-200 flex flex-col items-center text-center"
              data-testid="card-crm"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#711419] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Monitor className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-1">Office / CRM</h2>
              <p className="text-sm text-slate-300">
                Full desktop workspace — customers, quotes, invoices, dispatch and more.
              </p>
              <span className="mt-4 inline-flex items-center text-sm font-medium text-[#e08a8f] group-hover:text-white transition-colors">
                Enter CRM <ChevronRight className="h-4 w-4 ml-1" />
              </span>
            </div>
          </Link>

          <Link href="/mobile">
            <div
              className="group h-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 hover:border-[#711419] rounded-2xl p-8 cursor-pointer transition-all duration-200 flex flex-col items-center text-center"
              data-testid="card-mobile"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#711419] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Smartphone className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-1">Field / Mobile</h2>
              <p className="text-sm text-slate-300">
                On-the-go view for technicians — daily agenda, jobs, time tracking.
              </p>
              <span className="mt-4 inline-flex items-center text-sm font-medium text-[#e08a8f] group-hover:text-white transition-colors">
                Open Mobile <ChevronRight className="h-4 w-4 ml-1" />
              </span>
            </div>
          </Link>
        </div>

        <div
          className={`text-center mt-8 transition-all duration-700 ${
            stage >= 2 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Link href="/tools">
            <span
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
              data-testid="link-ghvac-tools"
            >
              <Wrench className="h-4 w-4" />
              Open GHVAC Tools
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
