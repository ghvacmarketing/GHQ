import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import redlogo from "@assets/redlogo.webp";
import { Button } from "@/components/ui/button";

export default function AuthVerify() {
  const [, params] = useRoute("/auth/verify/:token");
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      if (!params?.token) {
        setStatus("error");
        setMessage("Invalid verification link");
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify/${params.token}`);
        const result = await response.json();

        if (result.success) {
          setStatus("success");
          setMessage(`Welcome, ${result.user.name}!`);
          // Redirect to home after 2 seconds
          setTimeout(() => {
            navigate("/tools");
          }, 2000);
        } else {
          setStatus("error");
          setMessage(result.message || "Verification failed");
        }
      } catch (error) {
        setStatus("error");
        setMessage("Failed to verify login link");
      }
    };

    verifyToken();
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img 
              src={redlogo} 
              alt="GHVAC Tools" 
              className="h-16 w-auto object-contain"
              data-testid="img-logo"
            />
          </div>
          <CardTitle className="text-2xl">Verifying Your Login</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {status === "loading" && (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" data-testid="loader-verifying" />
              <p className="text-muted-foreground">Please wait while we verify your login...</p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500" data-testid="icon-success" />
              <div>
                <p className="text-lg font-semibold text-foreground">{message}</p>
                <p className="text-sm text-muted-foreground mt-2">Redirecting you to the app...</p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center space-y-4">
              <XCircle className="h-12 w-12 text-destructive" data-testid="icon-error" />
              <div>
                <p className="text-lg font-semibold text-destructive">{message}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  The link may have expired or is invalid.
                </p>
              </div>
              <Button
                onClick={() => navigate("/login")}
                className="mt-4"
                data-testid="button-back-to-login"
              >
                Back to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
