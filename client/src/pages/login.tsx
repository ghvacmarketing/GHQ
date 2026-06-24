import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import redlogo from "@assets/redlogo.webp";

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await apiRequest("POST", "/api/auth/request-link", { phoneNumber });
      const result = await response.json();

      if (result.success) {
        // Check if auto-login is enabled (SMS disabled mode)
        if (result.autoLogin) {
          toast({
            title: "Success!",
            description: result.message || "Logging you in...",
          });
          // Redirect to home immediately
          setTimeout(() => navigate("/tools"), 500);
        } else {
          // Normal SMS flow
          toast({
            title: "Magic Link Sent!",
            description: "Check your phone for a login link. It expires in 15 minutes.",
          });
        }
      } else {
        toast({
          title: "Error",
          description: result.message || "Phone number not authorized",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send magic link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
          <CardTitle className="text-2xl">Welcome to GHVAC Tools</CardTitle>
          <CardDescription>
            Enter your phone number to receive a secure login link via SMS
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-number">Phone Number</Label>
              <Input
                id="phone-number"
                type="tel"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                data-testid="input-phone-number"
              />
              <p className="text-sm text-muted-foreground">
                Format: +1234567890 (include country code)
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-send-link"
            >
              {loading ? "Sending..." : "Send Magic Link"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Only authorized phone numbers can access this system.</p>
            <p className="mt-2">Contact your administrator to request access.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
