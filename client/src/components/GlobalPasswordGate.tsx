import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, Zap, MessageSquare, Gauge, CalendarClock, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import redlogo from "@assets/redlogo.webp";

const STORAGE_KEY = 'ghvac-global-auth';
const EXPIRY_DAYS = 90;

// "What's new" shown on the login screen. Edit this list to post updates.
const WHATS_NEW: { icon: any; title: string; body: string }[] = [
  { icon: Zap, title: "Marketing automations", body: "Build hands-free campaigns — trigger, conditions, actions, timing, and safeguards." },
  { icon: MessageSquare, title: "Faster messaging inbox", body: "Instant read receipts, sender names, and near-real-time inbound texts." },
  { icon: Gauge, title: "Humidity & temp sensors", body: "Live Govee monitoring with clear cards and threshold alerts in Analytics." },
  { icon: CalendarClock, title: "Cleaner dispatch board", body: "A tidier timeline and a smoother work-order detail panel." },
];

// Public routes that bypass password protection - clients need to access these
const PUBLIC_ROUTES = [
  /^\/quote\/[^/]+$/,       // /quote/:token - public quote viewing (legacy long URL)
  /^\/q\/[^/]+$/,           // /q/:token - short public quote viewing
  /^\/i\/[^/]+$/,           // /i/:token - short public invoice viewing
  /^\/sign\/[^/]+$/,        // /sign/:token - public e-signature signing (token-based)
  /^\/portal(\/|$)/,        // /portal/* - customer portal (has its own auth)
  /^\/book-online/,         // /book-online - public booking page
  /^\/auth-verify/,         // /auth-verify - SMS magic link verification
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(pattern => pattern.test(pathname));
}

interface StoredAuth {
  authenticated: boolean;
  expiry: number;
}

export default function GlobalPasswordGate({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Check if current route is a public route that should bypass password protection
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const isOnPublicRoute = isPublicRoute(currentPath);

  useEffect(() => {
    // Skip auth check for public routes - clients should access them without password
    if (isOnPublicRoute) {
      setIsAuthenticated(true);
      setAuthRequired(false);
      return;
    }
    checkAuthStatus();
  }, [isOnPublicRoute]);

  const checkAuthStatus = async () => {
    // Check if auth is required
    try {
      const response = await fetch('/api/global/auth-required');
      const data = await response.json();
      
      if (!data.required) {
        setAuthRequired(false);
        setIsAuthenticated(true);
        return;
      }
      
      setAuthRequired(true);
    } catch {
      // If can't check, assume auth required
      setAuthRequired(true);
    }

    // Source of truth: ask the server whether this browser currently holds a
    // valid credential (global gate session, employee-portal, CRM, or admin).
    // This avoids trusting a stale localStorage flag once server enforcement is
    // on (server session is 8h; the localStorage hint is 90d).
    try {
      const sessionResponse = await fetch('/api/global/session', { credentials: 'include' });
      if (sessionResponse.ok) {
        const data = await sessionResponse.json();
        if (data.authed) {
          setIsAuthenticated(true);
          return;
        }
        // Server says not authed — clear any stale local hint and show the gate.
        localStorage.removeItem(STORAGE_KEY);
        setIsAuthenticated(false);
        return;
      }
    } catch {
      // Endpoint unreachable — fall back to the checks below.
    }

    // Check if user is logged into Employee Portal (shares session)
    try {
      const portalResponse = await fetch('/api/employee-portal/me');
      if (portalResponse.ok) {
        const portalUser = await portalResponse.json();
        if (portalUser && portalUser.id) {
          // User is logged into Employee Portal, grant access
          setIsAuthenticated(true);
          return;
        }
      }
    } catch {
      // Not logged into portal, continue with other checks
    }

    // Check localStorage for existing auth
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const auth: StoredAuth = JSON.parse(stored);
        if (auth.authenticated && auth.expiry > Date.now()) {
          setIsAuthenticated(true);
          return;
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    setIsAuthenticated(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/global/verify", { password });
      const data = await response.json();

      if (data.success) {
        // Store auth with 90-day expiry
        const auth: StoredAuth = {
          authenticated: true,
          expiry: Date.now() + (EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
        setIsAuthenticated(true);
      } else {
        setError("Incorrect password");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Public routes bypass password protection immediately
  if (isOnPublicRoute) {
    return <>{children}</>;
  }

  // Still checking auth status
  if (isAuthenticated === null || authRequired === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Auth not required or already authenticated
  if (!authRequired || isAuthenticated) {
    return <>{children}</>;
  }

  // Full-page split login: form on the left, brand + updates on the right.
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left — login */}
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-10 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <img src={redlogo} alt="Giesbrecht HVAC" className="mb-8 h-12" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Enter your password to access GHQ.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="global-password">Password</Label>
              <div className="relative">
                <Input
                  id="global-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="h-11 pr-10"
                  data-testid="input-global-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button
              type="submit"
              className="h-11 w-full bg-[#711419] text-base hover:bg-[#5a1014]"
              disabled={isLoading || !password}
              data-testid="button-global-login"
            >
              {isLoading ? "Verifying…" : <>Enter <ArrowRight className="ml-1.5 h-4 w-4" /></>}
            </Button>
          </form>

          <p className="mt-10 text-xs text-muted-foreground">
            Giesbrecht Heating &amp; Air · Authorized access only
          </p>
        </div>
      </div>

      {/* Right — brand + what's new (hidden on small screens) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#711419] to-[#2c0709] text-white lg:flex lg:w-[54%]">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="relative z-10 flex w-full flex-col justify-center px-12 py-14 xl:px-20">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            <Sparkles className="h-3.5 w-3.5" /> What's new in GHQ
          </div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight xl:text-4xl">
            Your whole operation, in one place.
          </h2>
          <p className="mt-3 max-w-md text-sm text-white/70">
            The latest improvements to the Giesbrecht HVAC command center.
          </p>

          <div className="mt-9 max-w-md space-y-3">
            {WHATS_NEW.map((u) => (
              <div key={u.title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <u.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{u.title}</p>
                  <p className="text-xs leading-relaxed text-white/65">{u.body}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 text-xs text-white/50">giesbrechthvac.com · Powered by GHQ</p>
        </div>
      </div>
    </div>
  );
}
