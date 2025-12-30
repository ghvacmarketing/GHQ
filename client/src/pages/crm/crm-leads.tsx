import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ArrowRight,
} from "lucide-react";
import type { CrmUser } from "@shared/schema";

export default function CrmLeads() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  if (authLoading) {
    return (
      <CrmLayout currentUser={currentUser as CrmUser}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
              Sales Leads
            </h1>
            <p className="text-sm text-slate-500">
              Track and manage your sales pipeline
            </p>
          </div>
          <Button
            onClick={() => navigate("/sales-prospects/create")}
            className="bg-[#711419] hover:bg-[#5a1014]"
            data-testid="button-create-lead"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        </div>

        <div className="flex justify-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-b border-t-0 border-l-0 border-r-0 rounded-none focus-visible:ring-0 focus-visible:border-[#711419]"
              data-testid="input-search-leads"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">0</p>
              <p className="text-sm text-blue-600">New Leads</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-700">0</p>
              <p className="text-sm text-amber-600">Contacted</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-purple-700">0</p>
              <p className="text-sm text-purple-600">Qualified</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-700">0</p>
              <p className="text-sm text-green-600">Won</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-[#711419]" />
              Recent Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-center py-12">
              <Target className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-700 mb-2">No leads yet</h3>
              <p className="text-sm text-slate-500 mb-4">
                Start adding leads to track your sales pipeline
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/sales-prospects")}
                data-testid="button-view-prospects"
              >
                View Sales Prospects
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
