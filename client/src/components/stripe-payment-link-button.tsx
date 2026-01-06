import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Link as LinkIcon, Loader2, Copy, Check, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaymentLinkButtonProps {
  type: "quote" | "invoice";
  id: string;
  quoteCategory?: string | null;
  total: number;
  customerPhone?: string | null;
  disabled?: boolean;
  buttonSize?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "link" | "secondary" | "destructive";
}

export function PaymentLinkButton({
  type,
  id,
  quoteCategory,
  total,
  customerPhone,
  disabled = false,
  buttonSize = "sm",
  variant = "outline",
}: PaymentLinkButtonProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [depositPercentage, setDepositPercentage] = useState(50);
  const [depositAmount, setDepositAmount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isSendingText, setIsSendingText] = useState(false);

  const isQuote = type === "quote";
  // Allow payment links for these quote categories
  const paymentLinkCategories = ["custom install", "proposal builder", "custom service", "install"];
  const hasPaymentLinkCategory = isQuote && paymentLinkCategories.includes(quoteCategory || "");

  if (isQuote && !hasPaymentLinkCategory) {
    return null;
  }

  if (total <= 0) {
    return null;
  }

  const handleGenerateLink = async () => {
    setIsLoading(true);
    try {
      const endpoint = isQuote
        ? `/api/stripe/quote/${id}/payment-link`
        : `/api/stripe/invoice/${id}/payment-link`;

      const res = await apiRequest("POST", endpoint, {});
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate payment link");
      }

      const data = await res.json();
      setPaymentLink(data.paymentLinkUrl);
      setDepositAmount(data.depositAmount || data.amountDue || 0);
      if (data.depositPercentage) {
        setDepositPercentage(data.depositPercentage);
      }
      setShowDialog(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate payment link",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      toast({ title: "Copied!", description: "Payment link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const handleSendViaText = async () => {
    if (!paymentLink || !customerPhone) {
      toast({
        title: "Cannot send text",
        description: "No phone number available for this customer",
        variant: "destructive",
      });
      return;
    }

    setIsSendingText(true);
    try {
      const message = `Here is your payment link: ${paymentLink}`;
      const res = await apiRequest("POST", "/api/stripe/send-payment-link-sms", {
        to: customerPhone,
        message,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send SMS");
      }
      toast({ title: "Sent!", description: "Payment link sent via text" });
      setShowDialog(false);
    } catch (error: any) {
      toast({
        title: "Failed to send text",
        description: error.message || "Could not send SMS",
        variant: "destructive",
      });
    } finally {
      setIsSendingText(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={buttonSize}
        onClick={handleGenerateLink}
        disabled={disabled || isLoading}
        data-testid="button-payment-link"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4 mr-2" />
        )}
        {isQuote ? "Payment Link" : "Payment Link"}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Link Generated</DialogTitle>
            <DialogDescription>
              {isQuote
                ? `${depositPercentage}% deposit payment link ($${depositAmount.toFixed(2)})`
                : `Full payment link ($${depositAmount.toFixed(2)})`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Link</Label>
              <div className="flex gap-2">
                <Input
                  value={paymentLink || ""}
                  readOnly
                  className="font-mono text-sm"
                  data-testid="input-payment-link"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                  data-testid="button-copy-link"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {paymentLink && (
              <div className="flex items-center gap-2">
                <a
                  href={paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  data-testid="link-open-payment"
                >
                  <LinkIcon className="h-3 w-3" />
                  Open in new tab
                </a>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            {customerPhone && (
              <Button
                variant="outline"
                onClick={handleSendViaText}
                disabled={isSendingText}
                className="w-full sm:w-auto"
                data-testid="button-send-text"
              >
                {isSendingText ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Send via Text
              </Button>
            )}
            <Button
              onClick={() => setShowDialog(false)}
              className="w-full sm:w-auto"
              data-testid="button-close-payment-dialog"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
