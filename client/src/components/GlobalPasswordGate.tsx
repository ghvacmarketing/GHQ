import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import redlogo from "@assets/redlogo.webp";

const STORAGE_KEY = 'ghvac-global-auth';
const EXPIRY_DAYS = 90;

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

  // Show password gate
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={redlogo} alt="GHVAC Tools" className="h-16 mx-auto mb-4" />
          <CardTitle className="flex items-center justify-center gap-2">
            <Lock className="h-5 w-5" />
            Access Required
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Enter the password to access GHVAC Tools
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="global-password">Password</Label>
              <div className="relative">
                <Input
                  id="global-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pr-10"
                  data-testid="input-global-password"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !password}
              data-testid="button-global-login"
            >
              {isLoading ? "Verifying..." : "Enter"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
