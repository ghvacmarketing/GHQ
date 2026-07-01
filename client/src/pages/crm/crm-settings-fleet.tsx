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
  Truck,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowLeft,
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  ExternalLink,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import type { CrmUser } from "@shared/schema";

interface BouncieStatus {
  configured: boolean;
  connected: boolean;
  hasApiKey: boolean;
  lastSync: string | null;
  connectedAt: string | null;
}

interface Vehicle {
  id: string;
  vehicleName: string;
  technicianId: string | null;
  technicianName?: string;
  deviceId: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  licensePlate: string | null;
  vin: string | null;
  isActive: boolean;
}

interface Technician {
  id: string;
  name: string;
}

interface VehicleFormData {
  vehicleName: string;
  technicianId: string;
  deviceId: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  licensePlate: string;
  vin: string;
}

const emptyFormData: VehicleFormData = {
  vehicleName: "",
  technicianId: "",
  deviceId: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  licensePlate: "",
  vin: "",
};

export default function CrmSettingsFleet() {
  usePageTitle("Fleet Settings");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<VehicleFormData>(emptyFormData);
  const [authCode, setAuthCode] = useState("");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: bouncieStatus, isLoading: statusLoading } = useQuery<BouncieStatus>({
    queryKey: ["/api/bouncie/status"],
    enabled: !!currentUser,
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/bouncie/vehicles"],
    enabled: !!currentUser,
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/crm/technicians"],
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const createVehicleMutation = useMutation({
    mutationFn: async (data: VehicleFormData) => {
      const payload = {
        vehicleName: data.vehicleName,
        technicianId: data.technicianId || null,
        deviceId: data.deviceId || null,
        vehicleMake: data.vehicleMake || null,
        vehicleModel: data.vehicleModel || null,
        vehicleYear: data.vehicleYear || null,
        licensePlate: data.licensePlate || null,
        vin: data.vin || null,
      };
      return apiRequest("POST", "/api/bouncie/vehicles", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bouncie/vehicles"] });
      setIsAddDialogOpen(false);
      setFormData(emptyFormData);
      toast({ title: "Vehicle added", description: "New vehicle has been added to your fleet." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VehicleFormData }) => {
      const payload = {
        vehicleName: data.vehicleName,
        technicianId: data.technicianId || null,
        deviceId: data.deviceId || null,
        vehicleMake: data.vehicleMake || null,
        vehicleModel: data.vehicleModel || null,
        vehicleYear: data.vehicleYear || null,
        licensePlate: data.licensePlate || null,
        vin: data.vin || null,
      };
      return apiRequest("PATCH", `/api/bouncie/vehicles/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bouncie/vehicles"] });
      setIsEditDialogOpen(false);
      setEditingVehicle(null);
      setFormData(emptyFormData);
      toast({ title: "Vehicle updated", description: "Vehicle information has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/bouncie/vehicles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bouncie/vehicles"] });
      setConfirmDelete(null);
      toast({ title: "Vehicle deleted", description: "Vehicle has been removed from your fleet." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/bouncie/sync");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bouncie/vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bouncie/status"] });
      toast({ 
        title: "Sync Complete", 
        description: data.message || `Synced ${data.total} vehicles`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/bouncie/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bouncie/status"] });
      toast({ title: "Disconnected", description: "Bouncie connection has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const connectWithCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      return apiRequest("POST", "/api/bouncie/connect-with-code", { authorizationCode: code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bouncie/status"] });
      setAuthCode("");
      toast({ title: "Connected!", description: "Successfully connected to Bouncie. Click Sync to import vehicles." });
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleConnectWithCode = () => {
    if (!authCode.trim()) {
      toast({ title: "Error", description: "Please enter your authorization code from the Bouncie Developer Portal.", variant: "destructive" });
      return;
    }
    connectWithCodeMutation.mutate(authCode.trim());
  };

  const handleAddVehicle = () => {
    if (!formData.vehicleName.trim()) {
      toast({ title: "Error", description: "Vehicle name is required.", variant: "destructive" });
      return;
    }
    createVehicleMutation.mutate(formData);
  };

  const handleEditVehicle = () => {
    if (!editingVehicle) return;
    if (!formData.vehicleName.trim()) {
      toast({ title: "Error", description: "Vehicle name is required.", variant: "destructive" });
      return;
    }
    updateVehicleMutation.mutate({ id: editingVehicle.id, data: formData });
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      vehicleName: vehicle.vehicleName,
      technicianId: vehicle.technicianId || "",
      deviceId: vehicle.deviceId || "",
      vehicleMake: vehicle.vehicleMake || "",
      vehicleModel: vehicle.vehicleModel || "",
      vehicleYear: vehicle.vehicleYear || "",
      licensePlate: vehicle.licensePlate || "",
      vin: vehicle.vin || "",
    });
    setIsEditDialogOpen(true);
  };

  const openAddDialog = () => {
    setFormData(emptyFormData);
    setIsAddDialogOpen(true);
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

  const VehicleFormContent = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="vehicleName">Vehicle Name *</Label>
        <Input
          id="vehicleName"
          value={formData.vehicleName}
          onChange={(e) => setFormData({ ...formData, vehicleName: e.target.value })}
          placeholder="e.g., Service Van #1"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="technician">Assigned Technician</Label>
        <Select
          value={formData.technicianId || "unassigned"}
          onValueChange={(value) => setFormData({ ...formData, technicianId: value === "unassigned" ? "" : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a technician" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {technicians.map((tech) => (
              <SelectItem key={tech.id} value={tech.id}>
                {tech.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="deviceId">Bouncie Device ID</Label>
        <Input
          id="deviceId"
          value={formData.deviceId}
          onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
          placeholder="Device ID from Bouncie"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="vehicleMake">Make</Label>
          <Input
            id="vehicleMake"
            value={formData.vehicleMake}
            onChange={(e) => setFormData({ ...formData, vehicleMake: e.target.value })}
            placeholder="e.g., Ford"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="vehicleModel">Model</Label>
          <Input
            id="vehicleModel"
            value={formData.vehicleModel}
            onChange={(e) => setFormData({ ...formData, vehicleModel: e.target.value })}
            placeholder="e.g., Transit"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="vehicleYear">Year</Label>
          <Input
            id="vehicleYear"
            value={formData.vehicleYear}
            onChange={(e) => setFormData({ ...formData, vehicleYear: e.target.value })}
            placeholder="e.g., 2023"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="licensePlate">License Plate</Label>
        <Input
          id="licensePlate"
          value={formData.licensePlate}
          onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
          placeholder="e.g., ABC-1234"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="vin">VIN</Label>
        <Input
          id="vin"
          value={formData.vin}
          onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
          placeholder="Vehicle Identification Number"
        />
      </div>
    </div>
  );

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/crm/settings")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Button>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Fleet Settings</h1>
          <p className="text-muted-foreground">Manage your fleet vehicles and Bouncie integration</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <LinkIcon className="h-5 w-5 text-slate-600" />
              <div>
                <CardTitle>Bouncie Connection Status</CardTitle>
                <CardDescription>GPS tracking integration for your fleet vehicles</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : bouncieStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">
                        {bouncieStatus.hasApiKey ? "Bouncie Connected via API Key" : "Bouncie Connected"}
                      </p>
                      <p className="text-sm text-green-600">
                        {bouncieStatus.lastSync 
                          ? `Last synced: ${new Date(bouncieStatus.lastSync).toLocaleString()}`
                          : "Connected - click Sync to pull vehicles"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                    >
                      {syncMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sync Vehicles
                    </Button>
                    {!bouncieStatus.hasApiKey && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => disconnectMutation.mutate()}
                        disabled={disconnectMutation.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Unplug className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : bouncieStatus?.configured ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-3 mb-4">
                    <XCircle className="h-6 w-6 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-800">Bouncie Not Connected</p>
                      <p className="text-sm text-amber-600">
                        Enter your Authorization Code from the Bouncie Developer Portal to connect.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste your Authorization Code here..."
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button 
                      onClick={handleConnectWithCode}
                      disabled={connectWithCodeMutation.isPending || !authCode.trim()}
                    >
                      {connectWithCodeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <LinkIcon className="h-4 w-4 mr-2" />
                      )}
                      Connect
                    </Button>
                  </div>
                  <p className="text-xs text-amber-600 mt-2">
                    Find your Authorization Code in the{" "}
                    <a 
                      href="https://www.bouncie.dev/login" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline hover:text-amber-800"
                    >
                      Bouncie Developer Portal
                    </a>
                    {" "}under Users & Devices.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <XCircle className="h-6 w-6 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-800">Bouncie Not Configured</p>
                    <p className="text-sm text-slate-600">
                      Add BOUNCIE_CLIENT_ID and BOUNCIE_CLIENT_SECRET to your environment secrets to enable fleet tracking.
                    </p>
                  </div>
                </div>
                <a
                  href="https://www.bouncie.dev/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Bouncie Developer Portal
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-slate-600" />
                <div>
                  <CardTitle>Fleet Vehicles</CardTitle>
                  <CardDescription>Manage your company vehicles and assign them to technicians</CardDescription>
                </div>
              </div>
              {isAdmin && (
                <Button onClick={openAddDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Vehicle
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {vehiclesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : vehicles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No vehicles in your fleet yet.</p>
                {isAdmin && (
                  <Button variant="outline" className="mt-4" onClick={openAddDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Vehicle
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle Name</TableHead>
                    <TableHead>Assigned Technician</TableHead>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Make/Model/Year</TableHead>
                    <TableHead>License Plate</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((vehicle) => {
                    const techName = technicians.find((t) => t.id === vehicle.technicianId)?.name || vehicle.technicianName;
                    const makeModelYear = [vehicle.vehicleMake, vehicle.vehicleModel, vehicle.vehicleYear].filter(Boolean).join(" ") || "—";

                    return (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-medium">{vehicle.vehicleName}</TableCell>
                        <TableCell>{techName || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell className="font-mono text-sm">{vehicle.deviceId || "—"}</TableCell>
                        <TableCell>{makeModelYear}</TableCell>
                        <TableCell>{vehicle.licensePlate || "—"}</TableCell>
                        <TableCell>
                          {vehicle.isActive ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(vehicle)}
                                title="Edit vehicle"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmDelete(vehicle)}
                                title="Delete vehicle"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Vehicle</DialogTitle>
              <DialogDescription>Add a new vehicle to your fleet.</DialogDescription>
            </DialogHeader>
            <VehicleFormContent />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddVehicle} disabled={createVehicleMutation.isPending}>
                {createVehicleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Vehicle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Vehicle</DialogTitle>
              <DialogDescription>Update vehicle information.</DialogDescription>
            </DialogHeader>
            <VehicleFormContent />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditVehicle} disabled={updateVehicleMutation.isPending}>
                {updateVehicleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Vehicle</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{confirmDelete?.vehicleName}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmDelete && deleteVehicleMutation.mutate(confirmDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteVehicleMutation.isPending}
              >
                {deleteVehicleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CrmLayout>
  );
}
