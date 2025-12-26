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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogOut, ArrowLeft, Users, FileText, Plus, Edit, DollarSign, Receipt, UserX, ChevronDown, ChevronUp } from "lucide-react";
import type { PortalUser, EmployeeProfile, Compensation, CompensationAuditLog } from "@shared/schema";

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
      queryClient.invalidateQueries({ queryKey: ["/api/employee-portal"] });
      navigate("/employee-portal/login");
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
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
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
    return emp.user.username;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/employee-portal">
              <Button variant="ghost" size="sm" data-testid="link-back-portal">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Portal
              </Button>
            </Link>
            <h1 className="text-xl font-semibold" data-testid="text-admin-title">Employee Portal Admin</h1>
          </div>
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

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="employees" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md" data-testid="tabs-admin">
            <TabsTrigger value="employees" data-testid="tab-employees">
              <Users className="h-4 w-4 mr-2" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="audit-log" data-testid="tab-audit-log">
              <FileText className="h-4 w-4 mr-2" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Employee Management</h2>
              <Button onClick={() => setAddEmployeeOpen(true)} data-testid="button-add-employee">
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </div>

            {employeesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : employees && employees.length > 0 ? (
              <div className="space-y-3">
                {employees.map((emp) => (
                  <Card key={emp.user.id} data-testid={`card-employee-${emp.user.id}`}>
                    <CardContent className="pt-4">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedEmployeeId(expandedEmployeeId === emp.user.id ? null : emp.user.id)}
                        data-testid={`row-employee-${emp.user.id}`}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Name</p>
                              <p className="font-medium" data-testid={`text-name-${emp.user.id}`}>
                                {getEmployeeName(emp)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Role</p>
                              <Badge variant="outline" data-testid={`badge-role-${emp.user.id}`}>
                                {emp.user.role}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Department</p>
                              <p className="font-medium" data-testid={`text-department-${emp.user.id}`}>
                                {emp.profile?.department || "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Position</p>
                              <p className="font-medium" data-testid={`text-position-${emp.user.id}`}>
                                {emp.profile?.position || "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Status</p>
                              <Badge
                                variant={emp.user.isActive ? "default" : "secondary"}
                                data-testid={`badge-status-${emp.user.id}`}
                              >
                                {emp.user.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          </div>
                          {expandedEmployeeId === emp.user.id ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {expandedEmployeeId === emp.user.id && (
                        <div className="mt-4 pt-4 border-t space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Email</p>
                              <p className="font-medium">{emp.user.email || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Phone</p>
                              <p className="font-medium">{emp.profile?.phone || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Hire Date</p>
                              <p className="font-medium">{formatDate(emp.profile?.hireDate)}</p>
                            </div>
                          </div>

                          {emp.compensation && (
                            <Card className="bg-muted/50">
                              <CardHeader className="py-3">
                                <CardTitle className="text-sm">Current Compensation</CardTitle>
                              </CardHeader>
                              <CardContent className="pb-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Pay Type</p>
                                    <p className="font-medium">{emp.compensation.payType}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Rate</p>
                                    <p className="font-medium">{formatCurrency(emp.compensation.rate)}</p>
                                  </div>
                                  {emp.compensation.commissionRate && (
                                    <div>
                                      <p className="text-sm text-muted-foreground">Commission</p>
                                      <p className="font-medium">{emp.compensation.commissionRate}%</p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-sm text-muted-foreground">Pay Schedule</p>
                                    <p className="font-medium capitalize">{emp.compensation.paySchedule}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleOpenCompensation(emp); }}
                              data-testid={`button-set-compensation-${emp.user.id}`}
                            >
                              <DollarSign className="h-4 w-4 mr-2" />
                              Set Compensation
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
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
                                onClick={(e) => { e.stopPropagation(); handleOpenDeactivate(emp); }}
                                className="text-destructive hover:text-destructive"
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
              <Card data-testid="card-no-employees">
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No employees found. Add your first employee.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="audit-log" className="mt-6">
            <h2 className="text-lg font-medium mb-4">Compensation Audit Log</h2>

            {auditLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : auditLog && auditLog.length > 0 ? (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Previous Value</TableHead>
                      <TableHead>New Value</TableHead>
                      <TableHead>Changed By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLog.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                        <TableCell data-testid={`text-audit-employee-${entry.id}`}>
                          {entry.employeeName || "Unknown"}
                        </TableCell>
                        <TableCell data-testid={`text-audit-action-${entry.id}`}>
                          <Badge variant="outline">{entry.action}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-audit-previous-${entry.id}`}>
                          {entry.previousValue || "-"}
                        </TableCell>
                        <TableCell data-testid={`text-audit-new-${entry.id}`}>
                          {entry.newValue || "-"}
                        </TableCell>
                        <TableCell data-testid={`text-audit-changed-by-${entry.id}`}>
                          {entry.changedByName || "System"}
                        </TableCell>
                        <TableCell data-testid={`text-audit-date-${entry.id}`}>
                          {formatDate(entry.changedAt?.toString())}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <Card data-testid="card-no-audit">
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No audit log entries found.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>Create a new employee account and profile.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                value={newEmployee.username}
                onChange={(e) => setNewEmployee({ ...newEmployee, username: e.target.value })}
                placeholder="Enter username"
                data-testid="input-new-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                placeholder="Enter email"
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={newEmployee.password}
                onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                placeholder="Enter password"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={newEmployee.role}
                onValueChange={(value) => setNewEmployee({ ...newEmployee, role: value })}
              >
                <SelectTrigger data-testid="select-new-role">
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
                placeholder="Enter first name"
                data-testid="input-new-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={newEmployee.lastName}
                onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })}
                placeholder="Enter last name"
                data-testid="input-new-lastname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newEmployee.phone}
                onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                placeholder="Enter phone number"
                data-testid="input-new-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={newEmployee.department}
                onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                placeholder="Enter department"
                data-testid="input-new-department"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                value={newEmployee.position}
                onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
                placeholder="Enter position"
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
                data-testid="input-new-hiredate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEmployeeOpen(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEmployee}
              disabled={createEmployeeMutation.isPending || !newEmployee.username || !newEmployee.password || !newEmployee.firstName || !newEmployee.lastName}
              data-testid="button-submit-add"
            >
              {createEmployeeMutation.isPending ? "Creating..." : "Create Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={compensationDialogOpen} onOpenChange={setCompensationDialogOpen}>
        <DialogContent>
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
                <SelectTrigger data-testid="select-pay-type">
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
                placeholder="Enter rate"
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
                  placeholder="Enter commission rate"
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
                <SelectTrigger data-testid="select-pay-schedule">
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
                data-testid="input-effective-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompensationDialogOpen(false)} data-testid="button-cancel-comp">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitCompensation}
              disabled={setCompensationMutation.isPending || !compensationForm.rate || !compensationForm.effectiveDate}
              data-testid="button-submit-comp"
            >
              {setCompensationMutation.isPending ? "Saving..." : "Save Compensation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paystubDialogOpen} onOpenChange={setPaystubDialogOpen}>
        <DialogContent>
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
                  data-testid="input-net-pay"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hoursWorked">Hours Worked (optional)</Label>
              <Input
                id="hoursWorked"
                type="number"
                step="0.5"
                value={paystubForm.hoursWorked}
                onChange={(e) => setPaystubForm({ ...paystubForm, hoursWorked: e.target.value })}
                placeholder="40"
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
                data-testid="input-file-url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaystubDialogOpen(false)} data-testid="button-cancel-paystub">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitPaystub}
              disabled={addPaystubMutation.isPending || !paystubForm.periodStart || !paystubForm.periodEnd || !paystubForm.payDate || !paystubForm.grossPay || !paystubForm.netPay}
              data-testid="button-submit-paystub"
            >
              {addPaystubMutation.isPending ? "Adding..." : "Add Paystub"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {selectedEmployee ? getEmployeeName(selectedEmployee) : "this employee"}? They will no longer be able to log in to the portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
