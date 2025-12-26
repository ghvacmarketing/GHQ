import { useEffect, useState } from "react";
import { useLocation } from "wouter";
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
import { LogOut, User, DollarSign, FileText, Download, Edit, Phone, MapPin, Calendar, Briefcase, Mail } from "lucide-react";
import type { PortalUser, EmployeeProfile, Compensation, Paystub, EmployeeDocument } from "@shared/schema";

type ProfileData = {
  user: PortalUser;
  profile: EmployeeProfile;
  compensation: Compensation | null;
  paySchedule: string;
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
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const firstName = profileData?.profile?.firstName || currentUser.username;

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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold" data-testid="text-portal-title">Employee Portal</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="text-2xl font-medium" data-testid="text-greeting">
          Welcome, {firstName}
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-navigation">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <User className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="pay-history" data-testid="tab-pay-history">
              <DollarSign className="h-4 w-4 mr-2" />
              Pay History
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {profileLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : profileData ? (
              <>
                <Card data-testid="card-profile">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Profile Information</CardTitle>
                      <CardDescription>Your personal and job details</CardDescription>
                    </div>
                    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="button-edit-profile">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Profile
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
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
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Full Name</p>
                          <p className="font-medium" data-testid="text-full-name">
                            {profileData.profile.firstName} {profileData.profile.lastName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="font-medium" data-testid="text-email">
                            {profileData.user.email || "Not set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Briefcase className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Department</p>
                          <p className="font-medium" data-testid="text-department">
                            {profileData.profile.department || "Not assigned"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Briefcase className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Position</p>
                          <p className="font-medium" data-testid="text-position">
                            {profileData.profile.position || "Not assigned"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <p className="font-medium" data-testid="text-phone">
                            {profileData.profile.phone || "Not set"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
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

                <Card data-testid="card-compensation">
                  <CardHeader>
                    <CardTitle>Compensation</CardTitle>
                    <CardDescription>Your pay information</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {profileData.compensation ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Pay Type</p>
                          <Badge variant={getPayTypeBadgeVariant(profileData.compensation.payType)} data-testid="badge-pay-type">
                            {profileData.compensation.payType}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Current Rate</p>
                          <p className="font-medium text-lg" data-testid="text-rate">
                            {formatCurrency(profileData.compensation.rate)}
                            {profileData.compensation.payType?.toLowerCase() === "hourly" && "/hr"}
                            {profileData.compensation.payType?.toLowerCase() === "salary" && "/yr"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Pay Schedule</p>
                          <p className="font-medium capitalize" data-testid="text-pay-schedule">
                            {profileData.paySchedule || profileData.compensation.paySchedule}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground" data-testid="text-no-compensation">
                        No compensation information available.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="pay-history" className="space-y-4 mt-4">
            {paystubsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : paystubs && paystubs.length > 0 ? (
              paystubs.map((paystub, index) => (
                <Card key={paystub.id} data-testid={`card-paystub-${paystub.id}`}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                        <div>
                          <p className="text-sm text-muted-foreground">Pay Period</p>
                          <p className="font-medium" data-testid={`text-period-${paystub.id}`}>
                            {formatDate(paystub.periodStart)} - {formatDate(paystub.periodEnd)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Pay Date</p>
                          <p className="font-medium" data-testid={`text-pay-date-${paystub.id}`}>
                            {formatDate(paystub.payDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Gross Pay</p>
                          <p className="font-medium" data-testid={`text-gross-${paystub.id}`}>
                            {formatCurrency(paystub.grossPay)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Net Pay</p>
                          <p className="font-medium text-green-600" data-testid={`text-net-${paystub.id}`}>
                            {formatCurrency(paystub.netPay)}
                          </p>
                        </div>
                        {paystub.hoursWorked && (
                          <div>
                            <p className="text-sm text-muted-foreground">Hours Worked</p>
                            <p className="font-medium" data-testid={`text-hours-${paystub.id}`}>
                              {paystub.hoursWorked}
                            </p>
                          </div>
                        )}
                      </div>
                      {paystub.fileUrl && (
                        <a
                          href={paystub.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`button-download-paystub-${paystub.id}`}
                        >
                          <Button variant="outline" size="sm">
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
              <Card data-testid="card-no-paystubs">
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No paystubs available yet.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-4 mt-4">
            {documentsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : documents && documents.length > 0 ? (
              documents.map((doc) => (
                <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</p>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground">{doc.description}</p>
                          )}
                          <Badge variant="secondary" className="mt-1" data-testid={`badge-doc-category-${doc.id}`}>
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
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card data-testid="card-no-documents">
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
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
