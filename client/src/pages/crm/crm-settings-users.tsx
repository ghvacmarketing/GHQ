import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Users,
  Plus,
  Pencil,
  UserX,
  UserCheck,
  Loader2,
  Shield,
  ShieldCheck,
  Wrench,
  BadgeDollarSign,
  ArrowLeft,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser } from "@shared/schema";

type CrmUserRole = "owner" | "admin" | "supervisor" | "sales" | "tech";

interface CrmUserListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: CrmUserRole;
  isActive: boolean;
  createdAt: string;
}

const roleConfig: Record<CrmUserRole, { label: string; icon: typeof Shield; color: string; description: string }> = {
  owner: { 
    label: "Owner", 
    icon: ShieldCheck, 
    color: "bg-purple-100 text-purple-700",
    description: "Full access to desktop CRM and mobile app"
  },
  admin: { 
    label: "Admin", 
    icon: Shield, 
    color: "bg-blue-100 text-blue-700",
    description: "Desktop CRM access only"
  },
  supervisor: { 
    label: "Supervisor", 
    icon: Users, 
    color: "bg-indigo-100 text-indigo-700",
    description: "Desktop CRM (admin) + mobile with all techs view"
  },
  sales: { 
    label: "Sales", 
    icon: BadgeDollarSign, 
    color: "bg-green-100 text-green-700",
    description: "Desktop CRM + mobile app, can delete customers"
  },
  tech: { 
    label: "Technician", 
    icon: Wrench, 
    color: "bg-amber-100 text-amber-700",
    description: "Mobile app only, appears on dispatch board"
  },
};

export default function CrmSettingsUsers() {
  usePageTitle("User Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<CrmUserListItem | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<CrmUserListItem | null>(null);
  const [editingUser, setEditingUser] = useState<CrmUserListItem | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "tech" as CrmUserRole,
  });

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: users, isLoading: usersLoading } = useQuery<CrmUserListItem[]>({
    queryKey: ["/api/crm/users"],
    enabled: !!currentUser && (currentUser.role === "owner" || currentUser.role === "admin" || currentUser.role === "supervisor" || currentUser.role === "sales"),
    staleTime: 0, // Always refetch to show latest user list
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/crm/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/users"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "User created", description: "New user has been added successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return apiRequest("PATCH", `/api/crm/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/users"] });
      setIsEditDialogOpen(false);
      setEditingUser(null);
      resetForm();
      toast({ title: "User updated", description: "User information has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("PATCH", `/api/crm/users/${userId}/deactivate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/users"] });
      setConfirmDeactivate(null);
      toast({ title: "User deactivated", description: "User has been removed from the system." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const activateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("PATCH", `/api/crm/users/${userId}/activate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/users"] });
      toast({ title: "User activated", description: "User has been restored to the system." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/crm/users/${userId}/permanent`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/users"] });
      setConfirmPermanentDelete(null);
      toast({ 
        title: "User permanently deleted", 
        description: `${data.deletedUser?.name} has been removed from the system. Active techs: ${data.technicianCount}` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      phone: "",
      role: "tech",
    });
  };

  const handleAddUser = () => {
    if (!formData.name || !formData.email) {
      toast({ title: "Error", description: "Name and email are required.", variant: "destructive" });
      return;
    }
    createUserMutation.mutate(formData);
  };

  const handleEditUser = () => {
    if (!editingUser) return;
    const { password, ...dataWithoutPassword } = formData;
    updateUserMutation.mutate({ id: editingUser.id, data: dataWithoutPassword });
  };

  const openEditDialog = (user: CrmUserListItem) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: "",
      phone: user.phone || "",
      role: user.role,
    });
    setIsEditDialogOpen(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
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
  const isOwner = currentUser.role === "owner";
  const canViewSettings = isAdmin || currentUser.role === "sales";

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/crm/settings")}
            data-testid="button-back-to-settings"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Button>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Users &amp; Permissions</h1>
        </div>

        {canViewSettings && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-slate-600" />
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>
                      {isAdmin 
                        ? "Add, edit, or remove users. Technicians and sales appear on the dispatch board."
                        : "View team members. Technicians and sales appear on the dispatch board."}
                    </CardDescription>
                  </div>
                </div>
                {isAdmin && (
                  <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-user">
                    <Plus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map((user) => {
                      const config = roleConfig[user.role];
                      const RoleIcon = config.icon;
                      const isCurrentUser = user.id === currentUser.id;
                      
                      return (
                        <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell className="text-slate-600">{user.email}</TableCell>
                          <TableCell>
                            <Badge className={`${config.color} gap-1`}>
                              <RoleIcon className="h-3 w-3" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.isActive ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(user)}
                                  data-testid={`button-edit-user-${user.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {!isCurrentUser && (
                                  user.isActive ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={() => setConfirmDeactivate(user)}
                                      data-testid={`button-deactivate-user-${user.id}`}
                                    >
                                      <UserX className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-green-600 hover:text-green-700"
                                        onClick={() => activateUserMutation.mutate(user.id)}
                                        disabled={activateUserMutation.isPending}
                                        data-testid={`button-activate-user-${user.id}`}
                                      >
                                        {activateUserMutation.isPending ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <UserCheck className="h-4 w-4" />
                                        )}
                                      </Button>
                                      {isOwner && user.role !== "owner" && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-red-700 hover:text-red-800 hover:bg-red-50"
                                          onClick={() => setConfirmPermanentDelete(user)}
                                          data-testid={`button-permanent-delete-user-${user.id}`}
                                          title="Permanently delete"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </>
                                  )
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {!canViewSettings && (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>User settings are only available to managers.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new CRM user. They will be able to log in with these credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
                data-testid="input-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password (optional)</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Leave blank for Google sign-in only"
                data-testid="input-user-password"
              />
              <p className="text-xs text-slate-500">
                Leave blank to require this user to sign in with Google.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="555-123-4567"
                data-testid="input-user-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: CrmUserRole) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.role && (
                <p className="text-xs text-slate-500 mt-1">
                  {roleConfig[formData.role].description}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUser}
              disabled={createUserMutation.isPending}
              data-testid="button-submit-user"
            >
              {createUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information. Password changes are not supported here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-edit-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-edit-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                data-testid="input-edit-user-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: CrmUserRole) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger data-testid="select-edit-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.role && (
                <p className="text-xs text-slate-500 mt-1">
                  {roleConfig[formData.role].description}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditUser}
              disabled={updateUserMutation.isPending}
              data-testid="button-update-user"
            >
              {updateUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeactivate} onOpenChange={() => setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {confirmDeactivate?.name}? They will no longer be able to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeactivate && deactivateUserMutation.mutate(confirmDeactivate.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deactivateUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmPermanentDelete} onOpenChange={() => setConfirmPermanentDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Permanently Delete User?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong className="text-red-600">This action cannot be undone.</strong> You are about to permanently delete <strong>{confirmPermanentDelete?.name}</strong> from the system.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <strong>What will happen:</strong>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  <li>Work orders assigned to this user will be unassigned</li>
                  <li>Quotes and invoices created by this user will keep their data but show as "unknown author"</li>
                  <li>Follow-up tasks assigned to this user will be deleted</li>
                  <li>Customer notes by this user will remain but show as "unknown author"</li>
                  <li>Per-tech goals will automatically recalculate</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmPermanentDelete && permanentDeleteMutation.mutate(confirmPermanentDelete.id)}
              className="bg-red-700 hover:bg-red-800"
              data-testid="button-confirm-permanent-delete"
            >
              {permanentDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
