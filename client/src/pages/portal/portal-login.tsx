import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";
import { PortalLayout } from "./portal-layout";

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const token = params.get("token");

    if (!token) {
      setIsValidating(false);
      setError("This link has expired or is invalid. Please contact us for a new link.");
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch("/api/portal/auth/validate-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "include",
        });

        if (res.ok) {
          setLocation("/portal/dashboard");
        } else {
          setIsValidating(false);
          setError("This link has expired or is invalid. Please contact us for a new link.");
        }
      } catch (e) {
        setIsValidating(false);
        setError("This link has expired or is invalid. Please contact us for a new link.");
      }
    };

    validateToken();
  }, [searchString, setLocation]);

  return (
    <PortalLayout showLogout={false}>
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md shadow-lg" data-testid="card-login">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-[#711419]" data-testid="text-login-title">
              Customer Portal
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {isValidating ? (
              <div className="flex flex-col items-center gap-4 py-8" data-testid="status-validating">
                <Loader2 className="h-8 w-8 animate-spin text-[#711419]" />
                <p className="text-slate-600">Validating your access link...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-4 py-8" data-testid="status-error">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
                <p className="text-slate-700">{error}</p>
                <p className="text-sm text-slate-500 mt-2">
                  Need help? Call us at{" "}
                  <a href="tel:+15555551234" className="text-[#711419] hover:underline" data-testid="link-support-phone">
                    (555) 555-1234
                  </a>
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
