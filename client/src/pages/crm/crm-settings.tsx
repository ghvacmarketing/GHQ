import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser } from "@shared/schema";

type CrmUserRole = "owner" | "admin" | "sales" | "tech";

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

export default function CrmSettings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<CrmUserListItem | null>(null);
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
    enabled: !!currentUser && (currentUser.role === "owner" || currentUser.role === "admin"),
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
    if (!formData.name || !formData.email || !formData.password) {
      toast({ title: "Error", description: "Name, email, and password are required.", variant: "destructive" });
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

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

        {isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-slate-600" />
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>
                      Add, edit, or remove users. Technicians and sales appear on the dispatch board.
                    </CardDescription>
                  </div>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-user">
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
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
                      <TableHead className="text-right">Actions</TableHead>
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
                                )
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {!isAdmin && (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Settings are only available to administrators.</p>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password"
                data-testid="input-user-password"
              />
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
                  {(Object.entries(roleConfig) as [CrmUserRole, typeof roleConfig.owner][]).map(([role, config]) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        <span>{config.label}</span>
                        <span className="text-slate-500 text-xs">- {config.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddUser} 
              disabled={createUserMutation.isPending}
              data-testid="button-submit-add-user"
            >
              {createUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information. Password cannot be changed here.
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
                  {(Object.entries(roleConfig) as [CrmUserRole, typeof roleConfig.owner][]).map(([role, config]) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-4 w-4" />
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEditUser} 
              disabled={updateUserMutation.isPending}
              data-testid="button-submit-edit-user"
            >
              {updateUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
              This will remove <strong>{confirmDeactivate?.name}</strong> from the system. 
              They will no longer be able to log in or appear on the dispatch board. 
              You can reactivate them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDeactivate && deactivateUserMutation.mutate(confirmDeactivate.id)}
              data-testid="button-confirm-deactivate"
            >
              {deactivateUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}
