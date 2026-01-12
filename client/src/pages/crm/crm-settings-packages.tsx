import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Package,
  Loader2,
  TrendingUp,
  TrendingDown,
  History,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser, PackagePriceAdjustment } from "@shared/schema";
import { format } from "date-fns";

const HVAC_UNIT_TYPES = ["PHP", "GP", "SGA", "SHP", "Mini-Split", "Ducting"] as const;
const HVAC_TIERS = ["Packaged", "Essential", "Premium", "Ultimate", "Standard"] as const;

export default function CrmSettingsPackages() {
  usePageTitle("Package Pricing Management");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [adjustmentType, setAdjustmentType] = useState<"hvac" | "crawlspace">("hvac");
  const [unitTypeFilter, setUnitTypeFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [percentageChange, setPercentageChange] = useState<number>(0);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: adjustments, isLoading: adjustmentsLoading } = useQuery<PackagePriceAdjustment[]>({
    queryKey: ["/api/pricebook/adjustments"],
    enabled: !!currentUser,
  });

  const { data: packages } = useQuery<any[]>({
    queryKey: ["/api/pricebook/packages"],
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    if (packages) {
      let count = 0;
      if (adjustmentType === "hvac") {
        count = packages.filter((pkg) => {
          if (pkg.category !== "hvac") return false;
          if (unitTypeFilter !== "all" && pkg.unitType !== unitTypeFilter) return false;
          if (tierFilter !== "all" && pkg.tier !== tierFilter) return false;
          return true;
        }).length;
      } else {
        count = packages.filter((pkg) => pkg.category === "crawlspace").length;
      }
      setEstimatedCount(count);
    }
  }, [packages, adjustmentType, unitTypeFilter, tierFilter]);

  const adjustPricesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pricebook/packages/adjust-prices", {
        adjustmentType,
        percentageChange,
        unitTypeFilter: adjustmentType === "hvac" && unitTypeFilter !== "all" ? unitTypeFilter : null,
        tierFilter: adjustmentType === "hvac" && tierFilter !== "all" ? tierFilter : null,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to apply adjustment");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricebook/packages"] });
      setShowConfirmDialog(false);
      setPercentageChange(0);
      toast({
        title: "Price Adjustment Applied",
        description: `Successfully updated ${data.packagesAffected} packages by ${percentageChange > 0 ? "+" : ""}${percentageChange}%`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to apply adjustment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleApplyClick = () => {
    if (percentageChange === 0) {
      toast({
        title: "Invalid percentage",
        description: "Percentage change cannot be 0",
        variant: "destructive",
      });
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleConfirmAdjustment = () => {
    adjustPricesMutation.mutate();
  };

  const formatFilters = (adjustment: PackagePriceAdjustment) => {
    if (adjustment.adjustmentType === "crawlspace") {
      return "All Crawlspace Tiers";
    }
    const filters: string[] = [];
    if (adjustment.unitTypeFilter) {
      filters.push(`Unit: ${adjustment.unitTypeFilter}`);
    }
    if (adjustment.tierFilter) {
      filters.push(`Tier: ${adjustment.tierFilter}`);
    }
    return filters.length > 0 ? filters.join(", ") : "All HVAC Packages";
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor";
  const canManage = isAdmin || currentUser.role === "sales";

  if (!canManage) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Package Pricing Management</h1>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Only administrators and sales users can manage package pricing.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Package Pricing Management</h1>
            <p className="text-sm text-slate-500">Adjust HVAC and Crawlspace package prices by percentage</p>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Bulk Price Adjustment
              </CardTitle>
              <CardDescription>
                Apply percentage-based price changes to multiple packages at once
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Package Type</Label>
                  <Tabs value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as "hvac" | "crawlspace")}>
                    <TabsList className="grid w-full grid-cols-2 max-w-md">
                      <TabsTrigger value="hvac" data-testid="tab-hvac">HVAC Packages</TabsTrigger>
                      <TabsTrigger value="crawlspace" data-testid="tab-crawlspace">Crawlspace Tiers</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {adjustmentType === "hvac" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="unit-type-filter">Unit Type (Optional)</Label>
                      <Select value={unitTypeFilter} onValueChange={setUnitTypeFilter}>
                        <SelectTrigger id="unit-type-filter" data-testid="select-unit-type">
                          <SelectValue placeholder="All Unit Types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Unit Types</SelectItem>
                          {HVAC_UNIT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tier-filter">Tier (Optional)</Label>
                      <Select value={tierFilter} onValueChange={setTierFilter}>
                        <SelectTrigger id="tier-filter" data-testid="select-tier">
                          <SelectValue placeholder="All Tiers" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Tiers</SelectItem>
                          {HVAC_TIERS.map((tier) => (
                            <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="percentage-change">Percentage Change</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="percentage-change"
                      type="number"
                      value={percentageChange}
                      onChange={(e) => setPercentageChange(parseInt(e.target.value) || 0)}
                      className="w-32"
                      placeholder="0"
                      data-testid="input-percentage"
                    />
                    <span className="text-slate-500">%</span>
                    {percentageChange !== 0 && (
                      <Badge className={percentageChange > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {percentageChange > 0 ? (
                          <><TrendingUp className="h-3 w-3 mr-1" /> Increase</>
                        ) : (
                          <><TrendingDown className="h-3 w-3 mr-1" /> Decrease</>
                        )}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    Enter a positive number for price increase (e.g., 5 for +5%), negative for decrease (e.g., -10 for -10%)
                  </p>
                </div>

                {estimatedCount !== null && (
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-700">
                      <AlertCircle className="h-4 w-4 inline mr-2 text-slate-500" />
                      This adjustment will affect approximately <strong>{estimatedCount}</strong> packages
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleApplyClick}
                  disabled={percentageChange === 0 || adjustPricesMutation.isPending}
                  className="bg-[#d3b07d] hover:bg-[#c4a06e]"
                  data-testid="button-apply-adjustment"
                >
                  {adjustPricesMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    "Apply Adjustment"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Recent Adjustments History
              </CardTitle>
              <CardDescription>
                View past bulk price adjustments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {adjustmentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : adjustments && adjustments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Filters Applied</TableHead>
                      <TableHead className="text-right">% Change</TableHead>
                      <TableHead className="text-right">Packages</TableHead>
                      <TableHead>Applied By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustments.map((adjustment) => (
                      <TableRow key={adjustment.id}>
                        <TableCell className="text-sm">
                          {adjustment.appliedAt
                            ? format(new Date(adjustment.appliedAt), "MMM d, yyyy h:mm a")
                            : "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {adjustment.adjustmentType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {formatFilters(adjustment)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={adjustment.percentageChange > 0 ? "text-green-600" : "text-red-600"}>
                            {adjustment.percentageChange > 0 ? "+" : ""}{adjustment.percentageChange}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {adjustment.packagesAffected}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {adjustment.appliedBy || "Unknown"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  <History className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p>No price adjustments have been made yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Price Adjustment</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>Are you sure you want to apply this price adjustment?</p>
                <div className="mt-4 p-3 bg-slate-100 rounded-lg text-sm">
                  <p><strong>Type:</strong> {adjustmentType === "hvac" ? "HVAC Packages" : "Crawlspace Tiers"}</p>
                  {adjustmentType === "hvac" && (
                    <>
                      <p><strong>Unit Type:</strong> {unitTypeFilter === "all" ? "All" : unitTypeFilter}</p>
                      <p><strong>Tier:</strong> {tierFilter === "all" ? "All" : tierFilter}</p>
                    </>
                  )}
                  <p>
                    <strong>Change:</strong>{" "}
                    <span className={percentageChange > 0 ? "text-green-600" : "text-red-600"}>
                      {percentageChange > 0 ? "+" : ""}{percentageChange}%
                    </span>
                  </p>
                  <p><strong>Estimated packages affected:</strong> {estimatedCount}</p>
                </div>
                <p className="text-amber-600 mt-3">
                  This action cannot be undone. The change will be logged in the adjustment history.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-adjustment">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmAdjustment}
                className="bg-[#d3b07d] hover:bg-[#c4a06e]"
                data-testid="button-confirm-adjustment"
              >
                {adjustPricesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  "Apply Adjustment"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
