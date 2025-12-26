import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User, DollarSign, FileText, Download, Edit, Phone, MapPin, Calendar, Briefcase, Mail, Home, Shield } from "lucide-react";
import type { PortalUser, EmployeeProfile, Compensation, Paystub, EmployeeDocument } from "@shared/schema";

type ProfileData = PortalUser & {
  profile: EmployeeProfile;
  compensation: Compensation | null;
  paySchedule: string | null;
};

export default function EmployeePortal() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const { data: currentUser, isLoading: authLoading, error: authError } = useQuery<PortalUser | null>({
    queryKey: ["/api/employee-portal/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: profileData, isLoading: profileLoading } = useQuery<ProfileData>({
    queryKey: ["/api/employee-portal/profile"],
    enabled: !!currentUser,
  });

  const { data: paystubs, isLoading: paystubsLoading } = useQuery<Paystub[]>({
    queryKey: ["/api/employee-portal/paystubs"],
    enabled: !!currentUser,
  });

  const { data: documents, isLoading: documentsLoading } = useQuery<EmployeeDocument[]>({
    queryKey: ["/api/employee-portal/documents"],
    enabled: !!currentUser,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/employee-portal/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal"] });
      navigate("/employee-portal/login");
    },
    onError: () => {
      toast({ title: "Logout failed", variant: "destructive" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { phone?: string; address?: string }) => {
      const res = await apiRequest("PATCH", "/api/employee-portal/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal/profile"] });
      setEditDialogOpen(false);
      toast({ title: "Profile updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/employee-portal/login");
    }
  }, [authLoading, currentUser, navigate]);

  useEffect(() => {
    if (profileData?.profile) {
      setEditPhone(profileData.profile.phone || "");
      setEditAddress(profileData.profile.address || "");
    }
  }, [profileData?.profile]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const firstName = profileData?.profile?.firstName || currentUser.username;
  const lastName = profileData?.profile?.lastName || "";
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (amount: string | null | undefined) => {
    if (!amount) return "$0.00";
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
  };

  const getPayTypeBadgeVariant = (payType: string | undefined) => {
    switch (payType?.toLowerCase()) {
      case "salary": return "default";
      case "hourly": return "secondary";
      case "commission": return "outline";
      default: return "secondary";
    }
  };

  const handleEditProfile = () => {
    updateProfileMutation.mutate({ phone: editPhone, address: editAddress });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-home">
                <Home className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-lg font-semibold" data-testid="text-portal-title">Employee Portal</h1>
          </div>
          <div className="flex items-center gap-2">
            {currentUser.role === "admin" && (
              <Link href="/employee-portal/admin">
                <Button variant="ghost" size="sm" className="text-primary" data-testid="link-admin">
                  <Shield className="h-4 w-4 mr-2" />
                  Admin
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {logoutMutation.isPending ? "..." : "Logout"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-2xl p-6 border" data-testid="hero-greeting">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-white shadow-lg">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-white text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-muted-foreground">Welcome back,</p>
              <h2 className="text-2xl font-bold" data-testid="text-greeting">
                {firstName} {lastName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {profileData?.profile?.position || "Team Member"}
                </Badge>
                {profileData?.profile?.department && (
                  <Badge variant="outline" className="text-xs">
                    {profileData.profile.department}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="inline-flex h-11 items-center justify-center rounded-full bg-slate-100 p-1 text-slate-500" data-testid="tabs-navigation">
            <TabsTrigger 
              value="overview" 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              data-testid="tab-overview"
            >
              <User className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="pay-history" 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              data-testid="tab-pay-history"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Pay History
            </TabsTrigger>
            <TabsTrigger 
              value="documents" 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              data-testid="tab-documents"
            >
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-6">
            {profileLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            ) : profileData ? (
              <>
                <Card className="border-0 shadow-md rounded-xl overflow-hidden" data-testid="card-profile">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Profile Information</CardTitle>
                      <CardDescription>Your personal and job details</CardDescription>
                    </div>
                    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-full" data-testid="button-edit-profile">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-2xl">
                        <DialogHeader>
                          <DialogTitle>Edit Profile</DialogTitle>
                          <DialogDescription>Update your contact information</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="edit-phone">Phone Number</Label>
                            <Input
                              id="edit-phone"
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              placeholder="Enter phone number"
                              data-testid="input-edit-phone"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-address">Address</Label>
                            <Input
                              id="edit-address"
                              value={editAddress}
                              onChange={(e) => setEditAddress(e.target.value)}
                              placeholder="Enter address"
                              data-testid="input-edit-address"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setEditDialogOpen(false)}
                            data-testid="button-cancel-edit"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleEditProfile}
                            disabled={updateProfileMutation.isPending}
                            data-testid="button-save-profile"
                          >
                            {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Full Name</p>
                          <p className="font-medium" data-testid="text-full-name">
                            {profileData.profile.firstName} {profileData.profile.lastName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <Mail className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="font-medium" data-testid="text-email">
                            {profileData?.email || profileData?.username || "Not set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Briefcase className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Department</p>
                          <p className="font-medium" data-testid="text-department">
                            {profileData.profile.department || "Not assigned"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="h-10 w-10 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Briefcase className="h-5 w-5 text-violet-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Position</p>
                          <p className="font-medium" data-testid="text-position">
                            {profileData.profile.position || "Not assigned"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                          <Phone className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <p className="font-medium" data-testid="text-phone">
                            {profileData.profile.phone || "Not set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="h-10 w-10 rounded-full bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                          <Calendar className="h-5 w-5 text-rose-500" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Hire Date</p>
                          <p className="font-medium" data-testid="text-hire-date">
                            {formatDate(profileData.profile.hireDate)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-md rounded-xl overflow-hidden" data-testid="card-compensation">
                  <CardHeader className="bg-gradient-to-r from-emerald-50 to-white border-b">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-emerald-600" />
                      Compensation
                    </CardTitle>
                    <CardDescription>Your pay information</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    {profileData.compensation ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center p-6 rounded-xl bg-gradient-to-br from-slate-50 to-white border">
                          <p className="text-sm text-muted-foreground mb-2">Pay Type</p>
                          <Badge 
                            variant={getPayTypeBadgeVariant(profileData.compensation.payType)} 
                            className="text-sm px-4 py-1"
                            data-testid="badge-pay-type"
                          >
                            {profileData.compensation.payType}
                          </Badge>
                        </div>
                        <div className="text-center p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100">
                          <p className="text-sm text-muted-foreground mb-2">Current Rate</p>
                          <p className="font-bold text-2xl text-emerald-600" data-testid="text-rate">
                            {formatCurrency(profileData.compensation.rate)}
                            <span className="text-sm font-normal text-muted-foreground">
                              {profileData.compensation.payType?.toLowerCase() === "hourly" && "/hr"}
                              {profileData.compensation.payType?.toLowerCase() === "salary" && "/yr"}
                            </span>
                          </p>
                        </div>
                        <div className="text-center p-6 rounded-xl bg-gradient-to-br from-slate-50 to-white border">
                          <p className="text-sm text-muted-foreground mb-2">Pay Schedule</p>
                          <p className="font-semibold text-lg capitalize" data-testid="text-pay-schedule">
                            {profileData.paySchedule || profileData.compensation.paySchedule}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground" data-testid="text-no-compensation">
                        <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p>No compensation information available.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="pay-history" className="space-y-4 mt-6">
            {paystubsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
            ) : paystubs && paystubs.length > 0 ? (
              paystubs.map((paystub) => (
                <Card key={paystub.id} className="border-0 shadow-md rounded-xl overflow-hidden hover:shadow-lg transition-shadow" data-testid={`card-paystub-${paystub.id}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pay Period</p>
                          <p className="font-medium text-sm" data-testid={`text-period-${paystub.id}`}>
                            {formatDate(paystub.periodStart)} - {formatDate(paystub.periodEnd)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pay Date</p>
                          <p className="font-medium text-sm" data-testid={`text-pay-date-${paystub.id}`}>
                            {formatDate(paystub.payDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Gross Pay</p>
                          <p className="font-medium text-sm" data-testid={`text-gross-${paystub.id}`}>
                            {formatCurrency(paystub.grossPay)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Pay</p>
                          <p className="font-bold text-lg text-emerald-600" data-testid={`text-net-${paystub.id}`}>
                            {formatCurrency(paystub.netPay)}
                          </p>
                        </div>
                      </div>
                      {paystub.fileUrl && (
                        <a
                          href={paystub.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`button-download-paystub-${paystub.id}`}
                        >
                          <Button variant="outline" size="sm" className="rounded-full">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="border-0 shadow-md rounded-xl" data-testid="card-no-paystubs">
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-muted-foreground">No paystubs available yet.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-4 mt-6">
            {documentsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : documents && documents.length > 0 ? (
              documents.map((doc) => (
                <Card key={doc.id} className="border-0 shadow-md rounded-xl overflow-hidden hover:shadow-lg transition-shadow" data-testid={`card-document-${doc.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                          <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</p>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground">{doc.description}</p>
                          )}
                          <Badge variant="secondary" className="mt-2 text-xs" data-testid={`badge-doc-category-${doc.id}`}>
                            {doc.category}
                          </Badge>
                        </div>
                      </div>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-view-document-${doc.id}`}
                      >
                        <Button variant="outline" size="sm" className="rounded-full">
                          <Download className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="border-0 shadow-md rounded-xl" data-testid="card-no-documents">
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-muted-foreground">No documents available.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
