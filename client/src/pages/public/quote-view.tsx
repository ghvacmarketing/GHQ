import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, FileText, AlertCircle, Loader2 } from "lucide-react";
import type { CrmQuote, CrmQuoteLineItem } from "@shared/schema";

const BRAND_COLOR = "#711419";
const BRAND_NAME = "Giesbrecht HVAC";
const LOGO_URL = "https://images.squarespace-cdn.com/content/v1/65b2790c0b83175df7337294/93a31506-d2ae-4e07-958b-c86d0c49f7cd/GHVAC-icons.png?format=200w";

interface PublicQuoteData {
  quote: CrmQuote;
  lineItems: CrmQuoteLineItem[];
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function SignaturePad({ onSignatureChange }: { onSignatureChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      onSignatureChange(canvas.toDataURL("image/png"));
    }
  }, [hasSignature, onSignatureChange]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange("");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">Signature</div>
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-1 bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="w-full h-[150px] cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          data-testid="canvas-signature"
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500">Sign above with your mouse or finger</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearSignature}
          className="text-slate-500 hover:text-slate-700"
          data-testid="button-clear-signature"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

function QuoteAlreadyAccepted({ quote }: { quote: CrmQuote }) {
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt={BRAND_NAME} className="h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>
            {BRAND_NAME}
          </h1>
        </div>

        <Card className="shadow-lg">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Quote Already Accepted</h2>
            <p className="text-slate-600 mb-4">
              Quote #{quote.quoteNumber} was accepted on {formatDate(quote.acceptedAt)}
              {quote.signerName && ` by ${quote.signerName}`}.
            </p>
            <p className="text-sm text-slate-500">
              If you have questions about your quote, please contact us at (830) 626-0408.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuoteSuccess({ quote }: { quote: CrmQuote }) {
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt={BRAND_NAME} className="h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>
            {BRAND_NAME}
          </h1>
        </div>

        <Card className="shadow-lg">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Quote Accepted!</h2>
            <p className="text-slate-600 mb-4">
              Thank you for accepting quote #{quote.quoteNumber}. We'll be in touch shortly to schedule your service.
            </p>
            <p className="text-sm text-slate-500">
              If you have any questions, please contact us at (830) 626-0408.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PublicQuoteView() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [signatureData, setSignatureData] = useState("");
  const [printedName, setPrintedName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);

  const { data, isLoading, error } = useQuery<PublicQuoteData>({
    queryKey: ["/api/public/quotes", token],
    queryFn: async () => {
      const response = await fetch(`/api/public/quotes/${token}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to load quote");
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: async (payload: { signatureImage: string; signerName: string }) => {
      const response = await fetch(`/api/public/quotes/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to sign quote");
      }
      return response.json();
    },
    onSuccess: () => {
      setIsAccepted(true);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message,
      });
    },
  });

  const handleSubmit = () => {
    if (!signatureData) {
      toast({ variant: "destructive", title: "Signature Required", description: "Please provide your signature." });
      return;
    }
    if (!printedName.trim()) {
      toast({ variant: "destructive", title: "Name Required", description: "Please enter your printed name." });
      return;
    }
    if (!agreedToTerms) {
      toast({ variant: "destructive", title: "Terms Required", description: "Please agree to the terms and conditions." });
      return;
    }

    signMutation.mutate({ signatureImage: signatureData, signerName: printedName.trim() });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-20 w-40 mx-auto" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <img src={LOGO_URL} alt={BRAND_NAME} className="h-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>
              {BRAND_NAME}
            </h1>
          </div>

          <Card className="shadow-lg">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-10 w-10 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Quote Not Found</h2>
              <p className="text-slate-600">
                {error?.message || "This quote link is invalid or has expired."}
              </p>
              <p className="text-sm text-slate-500 mt-4">
                Please contact us at (830) 626-0408 for assistance.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { quote, lineItems } = data;

  if (quote.status === "accepted") {
    return <QuoteAlreadyAccepted quote={quote} />;
  }

  if (isAccepted) {
    return <QuoteSuccess quote={quote} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt={BRAND_NAME} className="h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: BRAND_COLOR }}>
            {BRAND_NAME}
          </h1>
          <p className="text-slate-500">Professional HVAC Solutions</p>
        </div>

        <Card className="shadow-lg mb-6">
          <CardHeader className="border-b" style={{ backgroundColor: BRAND_COLOR }}>
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <CardTitle className="text-xl">Quote #{quote.quoteNumber}</CardTitle>
              </div>
              <span className="text-sm opacity-90">{formatDate(quote.createdAt)}</span>
            </div>
          </CardHeader>
          <CardContent className="py-6 space-y-6">
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-700 mb-2">Prepared For</h3>
              <p className="font-medium text-slate-900" data-testid="text-customer-name">{quote.customerName}</p>
              {quote.serviceAddress && (
                <p className="text-slate-600 text-sm" data-testid="text-service-address">{quote.serviceAddress}</p>
              )}
            </div>

            {(quote.title || quote.description) && (
              <div>
                {quote.title && <h3 className="text-lg font-semibold text-slate-900 mb-1">{quote.title}</h3>}
                {quote.description && <p className="text-slate-600">{quote.description}</p>}
              </div>
            )}

            <div>
              <h3 className="font-semibold text-slate-700 mb-3">Quote Details</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Description</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700 w-20">Qty</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700 w-28">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.length > 0 ? (
                      lineItems.map((item, idx) => (
                        <tr key={item.id} className={idx % 2 === 1 ? "bg-slate-50" : ""}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{item.description}</div>
                            {item.partNumber && (
                              <div className="text-xs text-slate-500">Part #: {item.partNumber}</div>
                            )}
                          </td>
                          <td className="text-center px-4 py-3 text-slate-600">{parseFloat(item.quantity || "1")}</td>
                          <td className="text-right px-4 py-3 font-medium text-slate-900">{formatCurrency(item.lineTotal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-slate-500 italic">
                          No items listed
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(quote.subtotal)}</span>
              </div>
              {quote.laborTotal && parseFloat(quote.laborTotal) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Labor</span>
                  <span>{formatCurrency(quote.laborTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold border-t pt-2" style={{ color: BRAND_COLOR }}>
                <span>Total</span>
                <span data-testid="text-quote-total">{formatCurrency(quote.total)}</span>
              </div>
            </div>

            {quote.validUntil && (
              <p className="text-sm text-slate-500 text-center">
                This quote is valid until {formatDate(quote.validUntil)}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>1. All work will be performed by licensed and insured technicians.</p>
            <p>2. Payment is due upon completion of work unless otherwise agreed.</p>
            <p>3. A 50% deposit may be required for equipment orders.</p>
            <p>4. Warranty terms vary by equipment and are provided separately.</p>
            <p>5. Additional charges may apply for unforeseen conditions discovered during work.</p>
            <p>6. Customer is responsible for providing reasonable access to work areas.</p>
            <p>7. This quote is valid for 30 days from the date issued unless otherwise specified.</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader style={{ backgroundColor: BRAND_COLOR }}>
            <CardTitle className="text-lg text-white">Accept & Sign</CardTitle>
          </CardHeader>
          <CardContent className="py-6 space-y-6">
            <SignaturePad onSignatureChange={setSignatureData} />

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Printed Name</label>
              <Input
                value={printedName}
                onChange={(e) => setPrintedName(e.target.value)}
                placeholder="Enter your full name"
                className="max-w-sm"
                data-testid="input-printed-name"
              />
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                data-testid="checkbox-agree-terms"
              />
              <label htmlFor="terms" className="text-sm text-slate-600 cursor-pointer">
                I have read and agree to the terms and conditions above. By signing this document, I authorize {BRAND_NAME} to perform the work described in this quote.
              </label>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={signMutation.isPending || !signatureData || !printedName.trim() || !agreedToTerms}
              className="w-full py-6 text-lg font-semibold"
              style={{ backgroundColor: BRAND_COLOR }}
              data-testid="button-accept-quote"
            >
              {signMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                "Accept Quote"
              )}
            </Button>

            <p className="text-xs text-center text-slate-500">
              By clicking "Accept Quote", you are electronically signing this agreement.
            </p>
          </CardContent>
        </Card>

        <footer className="text-center mt-8 text-sm text-slate-500">
          <p>{BRAND_NAME} • Professional HVAC Service Solutions</p>
          <p>(830) 626-0408 • quotes@ghvac.work</p>
        </footer>
      </div>
    </div>
  );
}
