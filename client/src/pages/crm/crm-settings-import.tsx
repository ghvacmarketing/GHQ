import { useState, useEffect } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Upload, Users, FileSpreadsheet, Loader2, Shield } from "lucide-react";
import type { CrmUser } from "@shared/schema";

export default function CrmSettingsImport() {
  usePageTitle("Import Data - Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [importType, setImportType] = useState<"customers" | "agreements">("customers");
  const [importFile, setImportFile] = useState<File | null>(null);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const importCustomersMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/crm/customers/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to import customers");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customers"] });
      setImportFile(null);
      const skippedMsg = data.skipped > 0 ? `, ${data.skipped} duplicate(s) skipped` : '';
      toast({
        title: "Customers imported successfully",
        description: `Imported ${data.imported || data.count || 0} customer(s)${skippedMsg}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to import customers", description: error.message, variant: "destructive" });
    },
  });

  const importAgreementsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/crm/agreements/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to import agreements");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/agreements"] });
      setImportFile(null);
      toast({
        title: "Agreements imported successfully",
        description: `Imported ${data.imported || data.count || 0} agreement(s)`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to import agreements", description: error.message, variant: "destructive" });
    },
  });

  const handleImport = () => {
    if (!importFile) return;
    if (importType === "customers") {
      importCustomersMutation.mutate(importFile);
    } else {
      importAgreementsMutation.mutate(importFile);
    }
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

  if (!isAdmin) {
    return (
      <CrmLayout currentUser={currentUser}>
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/crm/settings">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Settings
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Import Data is only available to administrators.</p>
            </CardContent>
          </Card>
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/crm/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Import Data</h1>
            <p className="text-slate-500 text-sm">Import customers and agreements from CSV or Excel files</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Data Type</CardTitle>
            <CardDescription>Choose what type of data you want to import</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  importType === "customers"
                    ? "border-[#711419] bg-[#711419]/5"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                onClick={() => setImportType("customers")}
                data-testid="import-type-customers"
              >
                <Users className={`h-8 w-8 mb-2 ${importType === "customers" ? "text-[#711419]" : "text-slate-400"}`} />
                <div className="font-medium">Customers</div>
                <p className="text-xs text-slate-500 mt-1">Import customer contact information</p>
              </div>
              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  importType === "agreements"
                    ? "border-[#711419] bg-[#711419]/5"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                onClick={() => setImportType("agreements")}
                data-testid="import-type-agreements"
              >
                <FileSpreadsheet className={`h-8 w-8 mb-2 ${importType === "agreements" ? "text-[#711419]" : "text-slate-400"}`} />
                <div className="font-medium">Maintenance Agreements</div>
                <p className="text-xs text-slate-500 mt-1">Import service agreements</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">Upload CSV File</Label>
              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-slate-400 transition-colors"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".csv,.xlsx,.xls";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) setImportFile(file);
                  };
                  input.click();
                }}
                data-testid="import-file-drop"
              >
                {importFile ? (
                  <div className="space-y-2">
                    <FileSpreadsheet className="h-10 w-10 mx-auto text-[#711419]" />
                    <p className="font-medium">{importFile.name}</p>
                    <p className="text-xs text-slate-500">{(importFile.size / 1024).toFixed(1)} KB</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportFile(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-slate-400" />
                    <p className="font-medium text-slate-600">Click to select a file</p>
                    <p className="text-xs text-slate-500">Supports CSV and Excel files</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Expected CSV columns for {importType}:</p>
              {importType === "customers" ? (
                <p className="text-xs text-slate-600">
                  name, email, phone, address (street, city, state, zip), notes
                </p>
              ) : (
                <p className="text-xs text-slate-600">
                  customer_name, agreement_number, agreement_plan, address, price, start_date, end_date, next_service_date, next_invoice_date, notes
                </p>
              )}
            </div>

            <Button
              className="w-full bg-[#711419] hover:bg-[#5a1014]"
              onClick={handleImport}
              disabled={!importFile || importCustomersMutation.isPending || importAgreementsMutation.isPending}
              data-testid="button-import"
            >
              {(importCustomersMutation.isPending || importAgreementsMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {importType === "customers" ? "Customers" : "Agreements"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
