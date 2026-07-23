import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ArrowLeft, Users, FileText, Plus, Edit, DollarSign, Receipt, UserX, ChevronDown, ChevronUp, Home, Shield, Clock, User } from "lucide-react";
import type { PortalUser, EmployeeProfile, Compensation, CompensationAuditLog } from "@shared/schema";
import { validateEmail } from "@/lib/form-utils";

type EmployeeWithProfile = {
  user: PortalUser;
  profile: EmployeeProfile | null;
  compensation: Compensation | null;
};

type AuditLogEntry = CompensationAuditLog & {
  employeeName?: string;
  changedByName?: string;
};

export default function EmployeePortalAdmin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [compensationDialogOpen, setCompensationDialogOpen] = useState(false);
  const [paystubDialogOpen, setPaystubDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithProfile | null>(null);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const [newEmployee, setNewEmployee] = useState({
    username: "",
    email: "",
    password: "",
    role: "employee",
    firstName: "",
    lastName: "",
    phone: "",
    department: "",
    position: "",
    hireDate: "",
  });

  const [compensationForm, setCompensationForm] = useState({
    payType: "hourly",
    rate: "",
    commissionRate: "",
    paySchedule: "biweekly",
    effectiveDate: "",
  });

  const [paystubForm, setPaystubForm] = useState({
    periodStart: "",
    periodEnd: "",
    payDate: "",
    grossPay: "",
    netPay: "",
    hoursWorked: "",
    fileUrl: "",
  });
  const [newEmployeeEmailError, setNewEmployeeEmailError] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<PortalUser | null>({
    queryKey: ["/api/employee-portal/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: employees, isLoading: employeesLoading } = useQuery<EmployeeWithProfile[]>({
    queryKey: ["/api/employee-portal/users"],
    enabled: !!currentUser && currentUser.role === "admin",
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/employee-portal/audit-log"],
    enabled: !!currentUser && currentUser.role === "admin",
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/employee-portal/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/employee-portal/login";
    },
    onError: () => {
      toast({ title: "Logout failed", variant: "destructive" });
    },
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: typeof newEmployee) => {
      const res = await apiRequest("POST", "/api/employee-portal/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal/users"] });
      setAddEmployeeOpen(false);
      resetNewEmployeeForm();
      toast({ title: "Employee created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create employee", description: error.message, variant: "destructive" });
    },
  });

  const setCompensationMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: typeof compensationForm }) => {
      const res = await apiRequest("POST", `/api/employee-portal/users/${userId}/compensation`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal/audit-log"] });
      setCompensationDialogOpen(false);
      setSelectedEmployee(null);
      resetCompensationForm();
      toast({ title: "Compensation updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to set compensation", description: error.message, variant: "destructive" });
    },
  });

  const addPaystubMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: typeof paystubForm }) => {
      const res = await apiRequest("POST", `/api/employee-portal/users/${userId}/paystubs`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal/users"] });
      setPaystubDialogOpen(false);
      setSelectedEmployee(null);
      resetPaystubForm();
      toast({ title: "Paystub added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add paystub", description: error.message, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/employee-portal/users/${userId}/deactivate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal/users"] });
      setDeactivateDialogOpen(false);
      setSelectedEmployee(null);
      toast({ title: "Employee deactivated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to deactivate employee", description: error.message, variant: "destructive" });
    },
  });

  const resetNewEmployeeForm = () => {
    setNewEmployee({
      username: "",
      email: "",
      password: "",
      role: "employee",
      firstName: "",
      lastName: "",
      phone: "",
      department: "",
      position: "",
      hireDate: "",
    });
    setNewEmployeeEmailError("");
  };

  const resetCompensationForm = () => {
    setCompensationForm({
      payType: "hourly",
      rate: "",
      commissionRate: "",
      paySchedule: "biweekly",
      effectiveDate: "",
    });
  };

  const resetPaystubForm = () => {
    setPaystubForm({
      periodStart: "",
      periodEnd: "",
      payDate: "",
      grossPay: "",
      netPay: "",
      hoursWorked: "",
      fileUrl: "",
    });
  };

  useEffect(() => {
    if (!authLoading) {
      if (!currentUser) {
        navigate("/employee-portal/login");
      } else if (currentUser.role !== "admin") {
        navigate("/employee-portal");
      }
    }
  }, [authLoading, currentUser, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto p-4 space-y-6">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (amount: string | null | undefined) => {
    if (!amount) return "$0.00";
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
  };

  const handleOpenCompensation = (emp: EmployeeWithProfile) => {
    setSelectedEmployee(emp);
    if (emp.compensation) {
      setCompensationForm({
        payType: emp.compensation.payType || "hourly",
        rate: emp.compensation.rate || "",
        commissionRate: emp.compensation.commissionRate || "",
        paySchedule: emp.compensation.paySchedule || "biweekly",
        effectiveDate: "",
      });
    }
    setCompensationDialogOpen(true);
  };

  const handleOpenPaystub = (emp: EmployeeWithProfile) => {
    setSelectedEmployee(emp);
    setPaystubDialogOpen(true);
  };

  const handleOpenDeactivate = (emp: EmployeeWithProfile) => {
    setSelectedEmployee(emp);
    setDeactivateDialogOpen(true);
  };

  const handleSubmitEmployee = () => {
    if (newEmployee.email && !validateEmail(newEmployee.email)) {
      setNewEmployeeEmailError("Please enter a valid email");
      return;
    }
    createEmployeeMutation.mutate(newEmployee);
  };

  const handleSubmitCompensation = () => {
    if (selectedEmployee) {
      setCompensationMutation.mutate({ userId: selectedEmployee.user.id, data: compensationForm });
    }
  };

  const handleSubmitPaystub = () => {
    if (selectedEmployee) {
      addPaystubMutation.mutate({ userId: selectedEmployee.user.id, data: paystubForm });
    }
  };

  const handleDeactivate = () => {
    if (selectedEmployee) {
      deactivateMutation.mutate(selectedEmployee.user.id);
    }
  };

  const getEmployeeName = (emp: EmployeeWithProfile) => {
    if (emp.profile) {
      return `${emp.profile.firstName} ${emp.profile.lastName}`;
    }
    return emp.user.email || emp.user.username;
  };

  const getInitials = (emp: EmployeeWithProfile) => {
    if (emp.profile) {
      return `${emp.profile.firstName?.[0] || ""}${emp.profile.lastName?.[0] || ""}`.toUpperCase();
    }
    return (emp.user.email?.[0] || "U").toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tools">
              <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-home">
                <Home className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/employee-portal">
              <Button variant="ghost" size="sm" data-testid="link-back-portal">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Portal
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-lg font-semibold hidden sm:block" data-testid="text-admin-title">Admin Dashboard</h1>
            </div>
          </div>
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
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="employees" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 flex-wrap" data-testid="tabs-admin">
            <TabsTrigger 
              value="employees" 
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none"
              data-testid="tab-employees"
            >
              <Users className="h-4 w-4 mr-2" />
              Employees
            </TabsTrigger>
            <TabsTrigger 
              value="audit-log" 
              className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] rounded-none bg-transparent shadow-none"
              data-testid="tab-audit-log"
            >
              <Clock className="h-4 w-4 mr-2" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="mt-0">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold">Employee Management</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage team members and their compensation</p>
              </div>
              <Button 
                onClick={() => setAddEmployeeOpen(true)} 
                className="rounded-full shadow-lg hover:shadow-xl transition-all"
                data-testid="button-add-employee"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </div>

            {employeesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : employees && employees.length > 0 ? (
              <div className="space-y-4">
                {employees.filter((emp) => emp?.user?.id).map((emp) => (
                  <Card 
                    key={emp.user.id} 
                    className="border-0 shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-all"
                    data-testid={`card-employee-${emp.user.id}`}
                  >
                    <CardContent className="p-0">
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                        onClick={() => setExpandedEmployeeId(expandedEmployeeId === emp.user.id ? null : emp.user.id)}
                        data-testid={`row-employee-${emp.user.id}`}
                      >
                        <Avatar className="h-12 w-12 border-2 border-white shadow">
                          <AvatarFallback className={`text-white font-semibold ${emp.user.isActive ? 'bg-gradient-to-br from-primary to-primary/80' : 'bg-slate-400'}`}>
                            {getInitials(emp)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold" data-testid={`text-name-${emp.user.id}`}>
                              {getEmployeeName(emp)}
                            </p>
                            <Badge 
                              variant={emp.user.role === "admin" ? "default" : "secondary"} 
                              className="text-xs"
                              data-testid={`badge-role-${emp.user.id}`}
                            >
                              {emp.user.role}
                            </Badge>
                            <Badge
                              variant={emp.user.isActive ? "outline" : "secondary"}
                              className={`text-xs ${emp.user.isActive ? 'border-emerald-500 text-emerald-600' : ''}`}
                              data-testid={`badge-status-${emp.user.id}`}
                            >
                              {emp.user.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>{emp.profile?.position || "No position"}</span>
                            {emp.profile?.department && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span>{emp.profile.department}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="hidden md:flex items-center gap-6 text-sm">
                          {emp.compensation && (
                            <div className="text-right">
                              <p className="text-muted-foreground text-xs">Rate</p>
                              <p className="font-semibold text-emerald-600">{formatCurrency(emp.compensation.rate)}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center">
                          {expandedEmployeeId === emp.user.id ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {expandedEmployeeId === emp.user.id && (
                        <div className="px-4 pb-4 pt-0 border-t bg-slate-50/30">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                            <div className="p-3 rounded-lg bg-white border">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                              <p className="font-medium text-sm truncate">{emp.user.email || "N/A"}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white border">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Phone</p>
                              <p className="font-medium text-sm">{emp.profile?.phone || "N/A"}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white border">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Hire Date</p>
                              <p className="font-medium text-sm">{formatDate(emp.profile?.hireDate)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white border">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Pay Schedule</p>
                              <p className="font-medium text-sm capitalize">{emp.compensation?.paySchedule || "N/A"}</p>
                            </div>
                          </div>

                          {emp.compensation && (
                            <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 mb-4">
                              <h4 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                                <DollarSign className="h-4 w-4" />
                                Current Compensation
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Pay Type</p>
                                  <Badge variant="secondary" className="mt-1">{emp.compensation.payType}</Badge>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Rate</p>
                                  <p className="font-bold text-lg text-emerald-600">{formatCurrency(emp.compensation.rate)}</p>
                                </div>
                                {emp.compensation.commissionRate && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Commission</p>
                                    <p className="font-semibold">{emp.compensation.commissionRate}%</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs text-muted-foreground">Schedule</p>
                                  <p className="font-medium capitalize">{emp.compensation.paySchedule}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={(e) => { e.stopPropagation(); handleOpenCompensation(emp); }}
                              data-testid={`button-set-compensation-${emp.user.id}`}
                            >
                              <DollarSign className="h-4 w-4 mr-2" />
                              Set Compensation
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={(e) => { e.stopPropagation(); handleOpenPaystub(emp); }}
                              data-testid={`button-add-paystub-${emp.user.id}`}
                            >
                              <Receipt className="h-4 w-4 mr-2" />
                              Add Paystub
                            </Button>
                            {emp.user.isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={(e) => { e.stopPropagation(); handleOpenDeactivate(emp); }}
                                data-testid={`button-deactivate-${emp.user.id}`}
                              >
                                <UserX className="h-4 w-4 mr-2" />
                                Deactivate
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-0 shadow-md rounded-lg" data-testid="card-no-employees">
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-muted-foreground mb-4">No employees found</p>
                  <Button onClick={() => setAddEmployeeOpen(true)} className="rounded-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Employee
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="audit-log" className="mt-0">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Compensation Audit Log</h2>
              <p className="text-sm text-muted-foreground mt-1">Track all compensation changes</p>
            </div>

            {auditLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : auditLog && auditLog.length > 0 ? (
              <div className="space-y-3">
                {auditLog.map((entry) => (
                  <Card key={entry.id} className="border-0 shadow-md rounded-lg overflow-hidden" data-testid={`row-audit-${entry.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <DollarSign className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold" data-testid={`text-audit-employee-${entry.id}`}>
                              {entry.employeeName || "Unknown"}
                            </p>
                            <Badge variant="outline" className="text-xs" data-testid={`text-audit-action-${entry.id}`}>
                              {entry.action}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            {entry.previousValue && (
                              <div>
                                <span className="text-muted-foreground">From: </span>
                                <span className="font-medium line-through text-slate-400" data-testid={`text-audit-previous-${entry.id}`}>
                                  {entry.previousValue}
                                </span>
                              </div>
                            )}
                            {entry.newValue && (
                              <div>
                                <span className="text-muted-foreground">To: </span>
                                <span className="font-semibold text-emerald-600" data-testid={`text-audit-new-${entry.id}`}>
                                  {entry.newValue}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span data-testid={`text-audit-changed-by-${entry.id}`}>
                              By: {entry.changedByName || "System"}
                            </span>
                            <span data-testid={`text-audit-date-${entry.id}`}>
                              {formatDate(entry.changedAt?.toString())}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-0 shadow-md rounded-lg" data-testid="card-no-audit">
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-muted-foreground">No audit log entries found.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Add New Employee</DialogTitle>
            <DialogDescription>Create a new employee account and profile.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="email">Email (Login) *</Label>
              <Input
                id="email"
                type="email"
                value={newEmployee.username}
                onChange={(e) => setNewEmployee({ ...newEmployee, username: e.target.value, email: e.target.value })}
                onBlur={() => {
                  if (newEmployee.username && !validateEmail(newEmployee.username)) {
                    setNewEmployeeEmailError("Please enter a valid email (e.g., name@example.com)");
                  } else {
                    setNewEmployeeEmailError("");
                  }
                }}
                placeholder="employee@company.com"
                className={`h-11 ${newEmployeeEmailError ? "border-red-500" : ""}`}
                data-testid="input-new-email"
              />
              {newEmployeeEmailError && <p className="text-sm text-red-500 mt-1">{newEmployeeEmailError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={newEmployee.password}
                onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                placeholder="Enter password"
                className="h-11"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={newEmployee.role}
                onValueChange={(value) => setNewEmployee({ ...newEmployee, role: value })}
              >
                <SelectTrigger className="h-11" data-testid="select-new-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={newEmployee.firstName}
                onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })}
                placeholder="John"
                className="h-11"
                data-testid="input-new-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={newEmployee.lastName}
                onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })}
                placeholder="Doe"
                className="h-11"
                data-testid="input-new-lastname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newEmployee.phone}
                onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="h-11"
                data-testid="input-new-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={newEmployee.department}
                onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                placeholder="e.g. Service, Sales"
                className="h-11"
                data-testid="input-new-department"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                value={newEmployee.position}
                onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
                placeholder="e.g. Technician, Manager"
                className="h-11"
                data-testid="input-new-position"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hireDate">Hire Date</Label>
              <Input
                id="hireDate"
                type="date"
                value={newEmployee.hireDate}
                onChange={(e) => setNewEmployee({ ...newEmployee, hireDate: e.target.value })}
                className="h-11"
                data-testid="input-new-hiredate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEmployeeOpen(false)} className="rounded-full" data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEmployee}
              disabled={createEmployeeMutation.isPending || !newEmployee.username || !newEmployee.password || !newEmployee.firstName || !newEmployee.lastName || !!newEmployeeEmailError}
              className="rounded-full"
              data-testid="button-submit-add"
            >
              {createEmployeeMutation.isPending ? "Creating..." : "Create Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={compensationDialogOpen} onOpenChange={setCompensationDialogOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Set Compensation</DialogTitle>
            <DialogDescription>
              Update compensation for {selectedEmployee ? getEmployeeName(selectedEmployee) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payType">Pay Type *</Label>
              <Select
                value={compensationForm.payType}
                onValueChange={(value) => setCompensationForm({ ...compensationForm, payType: value })}
              >
                <SelectTrigger className="h-11" data-testid="select-pay-type">
                  <SelectValue placeholder="Select pay type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">Rate *</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                value={compensationForm.rate}
                onChange={(e) => setCompensationForm({ ...compensationForm, rate: e.target.value })}
                placeholder="e.g. 25.00"
                className="h-11"
                data-testid="input-comp-rate"
              />
            </div>
            {compensationForm.payType === "commission" && (
              <div className="space-y-2">
                <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                <Input
                  id="commissionRate"
                  type="number"
                  step="0.1"
                  value={compensationForm.commissionRate}
                  onChange={(e) => setCompensationForm({ ...compensationForm, commissionRate: e.target.value })}
                  placeholder="e.g. 5"
                  className="h-11"
                  data-testid="input-commission-rate"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="paySchedule">Pay Schedule *</Label>
              <Select
                value={compensationForm.paySchedule}
                onValueChange={(value) => setCompensationForm({ ...compensationForm, paySchedule: value })}
              >
                <SelectTrigger className="h-11" data-testid="select-pay-schedule">
                  <SelectValue placeholder="Select pay schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveDate">Effective Date *</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={compensationForm.effectiveDate}
                onChange={(e) => setCompensationForm({ ...compensationForm, effectiveDate: e.target.value })}
                className="h-11"
                data-testid="input-effective-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompensationDialogOpen(false)} className="rounded-full" data-testid="button-cancel-comp">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitCompensation}
              disabled={setCompensationMutation.isPending || !compensationForm.rate || !compensationForm.effectiveDate}
              className="rounded-full"
              data-testid="button-submit-comp"
            >
              {setCompensationMutation.isPending ? "Saving..." : "Save Compensation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paystubDialogOpen} onOpenChange={setPaystubDialogOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Paystub</DialogTitle>
            <DialogDescription>
              Add a new paystub for {selectedEmployee ? getEmployeeName(selectedEmployee) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Period Start *</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={paystubForm.periodStart}
                  onChange={(e) => setPaystubForm({ ...paystubForm, periodStart: e.target.value })}
                  className="h-11"
                  data-testid="input-period-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Period End *</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={paystubForm.periodEnd}
                  onChange={(e) => setPaystubForm({ ...paystubForm, periodEnd: e.target.value })}
                  className="h-11"
                  data-testid="input-period-end"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payDate">Pay Date *</Label>
              <Input
                id="payDate"
                type="date"
                value={paystubForm.payDate}
                onChange={(e) => setPaystubForm({ ...paystubForm, payDate: e.target.value })}
                className="h-11"
                data-testid="input-pay-date"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grossPay">Gross Pay *</Label>
                <Input
                  id="grossPay"
                  type="number"
                  step="0.01"
                  value={paystubForm.grossPay}
                  onChange={(e) => setPaystubForm({ ...paystubForm, grossPay: e.target.value })}
                  placeholder="0.00"
                  className="h-11"
                  data-testid="input-gross-pay"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="netPay">Net Pay *</Label>
                <Input
                  id="netPay"
                  type="number"
                  step="0.01"
                  value={paystubForm.netPay}
                  onChange={(e) => setPaystubForm({ ...paystubForm, netPay: e.target.value })}
                  placeholder="0.00"
                  className="h-11"
                  data-testid="input-net-pay"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hoursWorked">Hours Worked</Label>
              <Input
                id="hoursWorked"
                type="number"
                step="0.5"
                value={paystubForm.hoursWorked}
                onChange={(e) => setPaystubForm({ ...paystubForm, hoursWorked: e.target.value })}
                placeholder="e.g. 80"
                className="h-11"
                data-testid="input-hours-worked"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fileUrl">File URL (optional)</Label>
              <Input
                id="fileUrl"
                value={paystubForm.fileUrl}
                onChange={(e) => setPaystubForm({ ...paystubForm, fileUrl: e.target.value })}
                placeholder="https://..."
                className="h-11"
                data-testid="input-file-url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaystubDialogOpen(false)} className="rounded-full" data-testid="button-cancel-paystub">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitPaystub}
              disabled={addPaystubMutation.isPending || !paystubForm.periodStart || !paystubForm.periodEnd || !paystubForm.payDate || !paystubForm.grossPay || !paystubForm.netPay}
              className="rounded-full"
              data-testid="button-submit-paystub"
            >
              {addPaystubMutation.isPending ? "Adding..." : "Add Paystub"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {selectedEmployee ? getEmployeeName(selectedEmployee) : ""}? 
              They will no longer be able to log in to the Employee Portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-deactivate"
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
