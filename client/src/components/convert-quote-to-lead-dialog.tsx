import { useState, useEffect } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Quote, Technician } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ConvertQuoteToLeadDialogProps {
  quote: Quote | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (leadId: string) => void;
}

export default function ConvertQuoteToLeadDialog({
  quote,
  isOpen,
  onClose,
  onSuccess,
}: ConvertQuoteToLeadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [leadSource, setLeadSource] = useState("Quote Generated");
  const [projectedCloseDate, setProjectedCloseDate] = useState("");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [clientIssue, setClientIssue] = useState("");

  // Fetch technicians for employee assignment
  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  // Reset form when quote changes or dialog opens
  useEffect(() => {
    if (isOpen && quote) {
      setAddress(quote.jobNotes || "");
      setClientIssue("");
      setPhone("");
      setEmail("");
      setCustomerType("");
      setLeadSource("Quote Generated");
      setProjectedCloseDate("");
      setAssignedEmployeeId("");
    } else if (!isOpen) {
      // Clear all fields when dialog closes
      setAddress("");
      setClientIssue("");
      setPhone("");
      setEmail("");
      setCustomerType("");
      setLeadSource("Quote Generated");
      setProjectedCloseDate("");
      setAssignedEmployeeId("");
    }
  }, [quote, isOpen]);

  // Convert quote to lead mutation
  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error("No quote selected");

      const response = await apiRequest("POST", `/api/quotes/${quote.id}/convert-to-lead`, {
        phone,
        email,
        address,
        customerType,
        leadSource,
        projectedCloseDate: projectedCloseDate || undefined,
        assignedEmployeeId: assignedEmployeeId || undefined,
        clientIssue,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to convert quote to lead");
      }

      return response.json();
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/metrics"] });
      
      toast({
        title: "Lead Created",
        description: `Successfully created sales lead for ${quote?.customerName}`,
      });

      onClose();
      if (onSuccess) {
        onSuccess(lead.id);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Conversion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    convertMutation.mutate();
  };

  if (!quote) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert Quote to Sales Lead</DialogTitle>
          <DialogDescription>
            Fill in the missing information to create a sales lead from this quote
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Pre-filled from quote (read-only display) */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">From Quote:</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Customer:</span> {quote.customerName}
              </div>
              <div>
                <span className="text-muted-foreground">Estimated Value:</span> ${quote.total}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Quote ID:</span> {quote.id.slice(0, 8)}
              </div>
            </div>
          </div>

          {/* Additional information needed */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                required
                data-testid="input-lead-phone"
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                data-testid="input-lead-email"
              />
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, City, State ZIP"
                rows={2}
                data-testid="textarea-lead-address"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerType">Customer Type</Label>
                <Select value={customerType} onValueChange={setCustomerType}>
                  <SelectTrigger data-testid="select-customer-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Residential">Residential</SelectItem>
                    <SelectItem value="Commercial">Commercial</SelectItem>
                    <SelectItem value="Industrial">Industrial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="leadSource">Lead Source</Label>
                <Input
                  id="leadSource"
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value)}
                  placeholder="Quote Generated"
                  data-testid="input-lead-source"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="projectedCloseDate">Projected Close Date</Label>
                <Input
                  id="projectedCloseDate"
                  type="date"
                  value={projectedCloseDate}
                  onChange={(e) => setProjectedCloseDate(e.target.value)}
                  data-testid="input-projected-close"
                />
              </div>

              <div>
                <Label htmlFor="assignedEmployee">Assign To</Label>
                <Select value={assignedEmployeeId} onValueChange={setAssignedEmployeeId}>
                  <SelectTrigger data-testid="select-assigned-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="clientIssue">Notes / Client Issue</Label>
              <Textarea
                id="clientIssue"
                value={clientIssue}
                onChange={(e) => setClientIssue(e.target.value)}
                placeholder="Additional notes about this lead..."
                rows={3}
                data-testid="textarea-client-issue"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={convertMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={convertMutation.isPending || !phone}
              data-testid="button-confirm-convert"
            >
              {convertMutation.isPending ? "Creating Lead..." : "Create Sales Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
