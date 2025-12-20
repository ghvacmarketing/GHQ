import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Eye, EyeOff, ExternalLink, Trash2, FileText, FolderKanban, Plus, Edit, Settings2, Users, FolderOpen, ReceiptText, Bell, Download, Upload, Database, Code } from "lucide-react";
import { apiRequest, adminApiRequest, getAdminQueryFn } from "@/lib/queryClient";
import type { Quote, Category, Process, Setting, Announcement, PhoneWhitelist } from "@shared/schema";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import redlogo from "@assets/redlogo.webp";

// Login component - renders instantly without heavy queries
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await apiRequest("POST", "/api/admin/login", { password });
      const result = await response.json();
      
      if (result.success && result.adminToken) {
        // Store admin token for subsequent requests
        localStorage.setItem('adminToken', result.adminToken);
        
        // Dashboard data is included in login response - use it directly
        if (result.dashboardData) {
          // Populate React Query cache with data from login response
          queryClient.setQueryData(["/api/settings"], result.dashboardData.settings);
          queryClient.setQueryData(["/api/quotes/summary"], result.dashboardData.quoteSummary);
          queryClient.setQueryData(["/api/technicians"], result.dashboardData.technicians);
          queryClient.setQueryData(['/api/categories'], result.dashboardData.categories);
          queryClient.setQueryData(['/api/processes'], result.dashboardData.processes);
          queryClient.setQueryData(['/api/app-settings'], result.dashboardData.appSettings);
          queryClient.setQueryData(['/api/admin/cache-metadata'], result.dashboardData.cacheMetadata);
          queryClient.setQueryData(['/api/announcements'], result.dashboardData.announcements);
          queryClient.setQueryData(['/api/phone-whitelist'], result.dashboardData.phoneWhitelist);
          
          toast({
            title: "Access Granted",
            description: "Welcome to the admin dashboard.",
          });
          
          onLogin();
        } else if (result.dashboardError) {
          toast({
            title: "Dashboard Error",
            description: result.dashboardError,
            variant: "destructive",
          });
          onLogin(); // Still proceed since we have the token
        } else {
          toast({
            title: "Login Error",
            description: "Failed to load dashboard data. Please try again.",
            variant: "destructive",
          });
        }
      } else if (result.success) {
        toast({
          title: "Login Error",
          description: "Authentication failed. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Access Denied",
          description: "Incorrect password.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Authentication Error",
        description: "Failed to verify password. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Admin Access Required</CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Enter admin password to view Google Sheets pricing data
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="password">Admin Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="pr-10"
                  data-testid="input-admin-password"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" data-testid="button-login">
              Access Admin Panel
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Show lightweight login form first for instant render
  if (!isAuthenticated) {
    return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  }
  
  // Main admin component with all the heavy queries and state
  return <AdminDashboard toast={toast} queryClient={queryClient} setLocation={setLocation} />;
}

function AdminDashboard({ toast, queryClient, setLocation }: { toast: any; queryClient: any; setLocation: any }) {
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const [emailAddresses, setEmailAddresses] = useState<string[]>([]);
  const [newEmailAddress, setNewEmailAddress] = useState("");
  const [showQuotesList, setShowQuotesList] = useState(false);
  const [quotesPage, setQuotesPage] = useState(1);
  const [newTechnicianName, setNewTechnicianName] = useState("");
  const [newTechnicianEmail, setNewTechnicianEmail] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementButtonText, setAnnouncementButtonText] = useState("Got it");
  const [announcementIsActive, setAnnouncementIsActive] = useState(true);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editButtonText, setEditButtonText] = useState("");
  const [editIsActive, setEditIsActive] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newPhoneName, setNewPhoneName] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showBackupConfirm, setShowBackupConfirm] = useState(false);
  const [customerCsvFile, setCustomerCsvFile] = useState<File | null>(null);

  // Fetch current settings from Google Sheets
  const { data: currentSettings, refetch, isLoading } = useQuery({
    queryKey: ["/api/settings"],
    staleTime: Infinity, // Keep cached for entire session
  });

  // Fetch cache metadata to display freshness
  const { data: cacheMetadata, refetch: refetchMetadata } = useQuery<{
    cached: boolean;
    timestamp: number | null;
    age: number | null;
  }>({
    queryKey: ["/api/admin/cache-metadata"],
    staleTime: 60000, // Refetch every minute to update age display
    refetchInterval: 60000,
  });

  const settings = currentSettings as any;

  // Initialize email addresses when settings load
  useEffect(() => {
    if ((currentSettings as any)?.emailSettings?.notificationEmails) {
      setEmailAddresses((currentSettings as any).emailSettings.notificationEmails);
    }
  }, [currentSettings]);

  // Fetch quotes summary for admin dashboard (fast loading)
  const { data: quoteSummary } = useQuery<{
    totalQuotes: number;
    statusCounts: Record<string, number>;
    totalValue: number;
    recentQuotes: Quote[];
  }>({
    queryKey: ["/api/quotes/summary"],
  });

  // Fetch full quotes list only when needed (lazy loading)
  const { data: quotesResponse, isLoading: quotesLoading } = useQuery<{
    quotes: Quote[];
    pagination: any;
  }>({
    queryKey: ["/api/quotes", quotesPage],
    queryFn: () => fetch(`/api/quotes?page=${quotesPage}&limit=50`).then(res => res.json()),
    enabled: showQuotesList,
  });

  const quotes = quotesResponse?.quotes || [];
  const quotesTotal = quoteSummary?.totalQuotes || 0;

  // Fetch technicians
  const { data: technicians = [] } = useQuery({
    queryKey: ["/api/technicians"],
  });

  const handleRefresh = async () => {
    try {
      // Call the server endpoint to invalidate cache and fetch fresh data
      const response = await adminApiRequest("POST", "/api/admin/refresh-sheets", {});
      const result = await response.json();
      
      // Invalidate all related queries to force refetch with fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initial-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cache-metadata"] });
      
      // Refetch current page data
      await refetch();
      await refetchMetadata();
      
      toast({
        title: "Data Refreshed",
        description: "Fresh pricing data loaded from Google Sheets.",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh data from Google Sheets.",
        variant: "destructive",
      });
    }
  };

  // Bulk delete quotes mutation
  const deleteQuotesMutation = useMutation({
    mutationFn: async (quoteIds: string[]) => {
      const response = await apiRequest("DELETE", "/api/quotes/bulk", { quoteIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes/summary"] });
      setSelectedQuotes(new Set());
      toast({
        title: "Quotes Deleted",
        description: `Successfully deleted ${data.deletedCount} quote(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete quotes. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Email settings mutation
  const saveEmailSettingsMutation = useMutation({
    mutationFn: async (emailSettings: { fromEmail: string; notificationEmails: string[] }) => {
      const response = await adminApiRequest("POST", "/api/admin/settings", { emailSettings });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Email Settings Saved",
        description: "Email notification settings updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save email settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Technician mutations
  const createTechnicianMutation = useMutation({
    mutationFn: async (techData: { name: string; email: string }) => {
      const response = await adminApiRequest("POST", "/api/technicians", techData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initial-data"] });
      setNewTechnicianName("");
      setNewTechnicianEmail("");
      toast({
        title: "Technician Added",
        description: "New technician added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Add Failed",
        description: "Failed to add technician. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteTechnicianMutation = useMutation({
    mutationFn: async (techId: string) => {
      const response = await adminApiRequest("DELETE", `/api/technicians/${techId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initial-data"] });
      toast({
        title: "Technician Removed",
        description: "Technician removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to remove technician. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  // Fetch processes
  const { data: processes = [] } = useQuery<Process[]>({
    queryKey: ['/api/processes'],
  });

  // Fetch app settings (PDF URLs, etc.)
  const { data: appSettings = [] } = useQuery<Setting[]>({
    queryKey: ['/api/app-settings'],
  });

  // Fetch announcements (requires admin token)
  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ['/api/announcements'],
    queryFn: getAdminQueryFn({ on401: 'throw' }),
  });

  // Get active announcement
  const activeAnnouncement = announcements.find(a => a.isActive);

  // Announcement mutations
  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: { title: string; message: string; buttonText: string; isActive: boolean }) => {
      const version = Date.now().toString();
      const response = await adminApiRequest('POST', '/api/announcement', { 
        ...data, 
        version
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setAnnouncementButtonText('Got it');
      setAnnouncementIsActive(true);
      toast({
        title: 'Announcement Created',
        description: 'Announcement has been created successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Create Failed',
        description: 'Failed to create announcement. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; message: string; buttonText: string; isActive: boolean }) => {
      const { id, ...updateData } = data;
      const response = await adminApiRequest('PATCH', `/api/announcement/${id}`, updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      setEditingAnnouncement(null);
      toast({
        title: 'Announcement Updated',
        description: 'Announcement has been updated successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update announcement. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await adminApiRequest('DELETE', `/api/announcement/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({
        title: 'Announcement Deleted',
        description: 'Announcement has been deleted successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete announcement. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Fetch phone whitelist (requires admin token)
  const { data: phoneWhitelist = [] } = useQuery<PhoneWhitelist[]>({
    queryKey: ['/api/phone-whitelist'],
    queryFn: getAdminQueryFn({ on401: 'throw' }),
  });

  // Phone whitelist mutations
  const addPhoneWhitelistMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; name: string }) => {
      const response = await adminApiRequest('POST', '/api/phone-whitelist', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/phone-whitelist'] });
      setNewPhoneNumber('');
      setNewPhoneName('');
      toast({
        title: 'Phone Added',
        description: 'Phone number has been added to the whitelist.',
      });
    },
    onError: () => {
      toast({
        title: 'Add Failed',
        description: 'Failed to add phone number. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deletePhoneWhitelistMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await adminApiRequest('DELETE', `/api/phone-whitelist/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/phone-whitelist'] });
      toast({
        title: 'Phone Removed',
        description: 'Phone number has been removed from the whitelist.',
      });
    },
    onError: () => {
      toast({
        title: 'Delete Failed',
        description: 'Failed to remove phone number. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Customer Database - fetch stats
  const { data: customerStats, refetch: refetchCustomerStats } = useQuery<{
    totalCustomers: number;
    lastImportDate: string | null;
    lastImportFilename: string | null;
    totalImports: number;
  }>({
    queryKey: ['/api/customers/stats'],
  });

  // Customer Database - import history
  const { data: customerImportHistory = [], refetch: refetchCustomerImportHistory } = useQuery<{
    id: string;
    filename: string;
    fileHash: string;
    status: string;
    totalRows: string | null;
    createdCount: string | null;
    updatedCount: string | null;
    skippedCount: string | null;
    errorCount: string | null;
    importedAt: string;
  }[]>({
    queryKey: ['/api/customers/import/history'],
    queryFn: getAdminQueryFn({ on401: 'throw' }),
  });

  // Customer Database - auto-sync status
  const { data: customerSyncStatus, refetch: refetchSyncStatus } = useQuery<{
    lastSyncTime: string | null;
    lastCheckTime: string | null;
    lastSyncResult: { created: number; updated: number; skipped: number; errors: number } | null;
    lastError: string | null;
    dataHash: string | null;
    syncCount: number;
    lastSyncCountReset: string;
  }>({
    queryKey: ['/api/customers/sync/status'],
  });

  // Customer import mutation
  const customerImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const adminToken = localStorage.getItem('adminToken');
      const response = await fetch('/api/customers/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      refetchCustomerStats();
      refetchCustomerImportHistory();
      setCustomerCsvFile(null);
      
      if (data.skipped) {
        toast({
          title: 'File Already Imported',
          description: data.message,
        });
      } else {
        toast({
          title: 'Import Complete',
          description: data.message,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import customer CSV.',
        variant: 'destructive',
      });
    },
  });

  // Customer sync mutation
  const triggerSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApiRequest("POST", "/api/customers/sync/trigger");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.noChange) {
        toast({
          title: "No Changes",
          description: "Customer data is already up to date.",
        });
      } else {
        toast({
          title: "Sync Complete",
          description: `Created: ${data.result?.created || 0}, Updated: ${data.result?.updated || 0}`,
        });
      }
      refetchSyncStatus();
      refetchCustomerStats();
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync customers",
        variant: "destructive",
      });
      refetchSyncStatus();
    },
  });

  // Reset sync hash mutation
  const resetSyncHashMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApiRequest("POST", "/api/customers/sync/reset");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Hash Reset",
        description: "Next sync will process all data.",
      });
      refetchSyncStatus();
    },
  });

  // Backup and restore mutations
  const handleBackupDownload = async () => {
    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Backup failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ghvac-backup-${new Date().toISOString().split('T')[0]}.ghvac`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setShowBackupConfirm(false);
      toast({
        title: 'Backup Created',
        description: 'Your backup file has been downloaded successfully.',
      });
    } catch (error) {
      setShowBackupConfirm(false);
      toast({
        title: 'Backup Failed',
        description: 'Failed to create backup. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const restoreBackupMutation = useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode: 'replace' | 'merge' }) => {
      const formData = new FormData();
      formData.append('backup', file);
      formData.append('mode', mode);
      
      const response = await fetch('/api/restore', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Restore failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
      setBackupFile(null);
      setShowRestoreConfirm(false);
      
      toast({
        title: 'Backup Restored',
        description: `Successfully restored ${data.stats.quotes + data.stats.processes + data.stats.categories} items.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Restore Failed',
        description: error.message || 'Failed to restore backup. Please check the file and try again.',
        variant: 'destructive',
      });
    },
  });

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const lastOrder = categories.length > 0 
        ? Math.max(...categories.map(c => parseInt(c.order)))
        : 0;
      const response = await adminApiRequest('POST', '/api/categories', { name, order: String(lastOrder + 1) });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setNewCategoryName("");
      toast({ title: "Category added successfully" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await adminApiRequest('PATCH', `/api/categories/${id}`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setEditingCategory(null);
      toast({ title: "Category updated successfully" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await adminApiRequest('DELETE', `/api/categories/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      toast({ title: "Category deleted successfully" });
    },
  });

  // Process mutation
  const deleteProcessMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/processes/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processes'] });
      toast({ title: "Process deleted successfully" });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete process. Please try again.",
        variant: "destructive",
      });
    },
  });

  // PDF upload mutation
  const uploadPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      // Read file as base64
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Data = (reader.result as string).split(',')[1];
            const response = await adminApiRequest('POST', '/api/price-book/upload', {
              name: file.name,
              data: base64Data,
              size: file.size
            });
            await response.json();
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      setSelectedPdfFile(null);
      // Reset the file input
      const fileInput = document.getElementById('pdf-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      toast({
        title: "PDF Uploaded",
        description: "Price book PDF uploaded successfully and is now available in the Price Book page."
      });
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Failed to upload PDF. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid File Type",
          description: "Please select a PDF file.",
          variant: "destructive",
        });
        return;
      }
      setSelectedPdfFile(file);
    }
  };

  const handlePdfUpload = () => {
    if (selectedPdfFile) {
      uploadPdfMutation.mutate(selectedPdfFile);
    }
  };

  const handleAddEmail = () => {
    if (newEmailAddress && !emailAddresses.includes(newEmailAddress)) {
      const updatedEmails = [...emailAddresses, newEmailAddress];
      setEmailAddresses(updatedEmails);
      setNewEmailAddress("");
      saveEmailSettingsMutation.mutate({
        fromEmail: settings?.emailSettings?.fromEmail || "quotes@ghvac.com",
        notificationEmails: updatedEmails
      });
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    const updatedEmails = emailAddresses.filter(email => email !== emailToRemove);
    setEmailAddresses(updatedEmails);
    saveEmailSettingsMutation.mutate({
      fromEmail: settings?.emailSettings?.fromEmail || "quotes@ghvac.com",
      notificationEmails: updatedEmails
    });
  };

  const handleAddTechnician = () => {
    if (newTechnicianName && newTechnicianEmail) {
      createTechnicianMutation.mutate({
        name: newTechnicianName,
        email: newTechnicianEmail
      });
    }
  };

  const handleRemoveTechnician = (techId: string) => {
    deleteTechnicianMutation.mutate(techId);
  };

  const handleSelectQuote = (quoteId: string, checked: boolean) => {
    const newSelected = new Set(selectedQuotes);
    if (checked) {
      newSelected.add(quoteId);
    } else {
      newSelected.delete(quoteId);
    }
    setSelectedQuotes(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuotes(new Set(quotes.map((q: Quote) => q.id!)));
    } else {
      setSelectedQuotes(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (selectedQuotes.size === 0) return;
    deleteQuotesMutation.mutate(Array.from(selectedQuotes));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "draft": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      default: return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              data-testid="button-back"
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <h1 className="font-semibold text-foreground text-sm sm:text-base truncate">Settings Dashboard</h1>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            data-testid="button-refresh-settings"
            className="pl-[8px] pr-[8px] flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isLoading ? "Refreshing..." : "Refresh Data"}</span>
            <span className="sm:hidden">{isLoading ? "..." : "Refresh"}</span>
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-md md:max-w-3xl lg:max-w-6xl">
        <div className="space-y-6">
          {/* Google Sheets Notice */}
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardContent className="p-6 pt-[5px] pb-[5px] pl-[10px] pr-[10px]">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <ExternalLink className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-900 dark:text-blue-100">
                      Settings Managed via Google Sheets
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-200 mt-1">
                      Click "Refresh Data" above if recent changes aren't live.
                    </p>
                    {cacheMetadata && cacheMetadata.cached && cacheMetadata.timestamp && (
                      <p className="text-xs text-blue-600 dark:text-blue-300 mt-2" data-testid="text-cache-info">
                        <span className="font-medium">Cache: </span>
                        Last synced {new Date(cacheMetadata.timestamp).toLocaleString()} 
                        ({Math.round((cacheMetadata.age || 0) / 1000 / 60)} min ago)
                      </p>
                    )}
                    {cacheMetadata && !cacheMetadata.cached && (
                      <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">
                        <span className="font-medium">Cache: </span>
                        No cache - will fetch fresh on next request
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings Accordion */}
          {currentSettings && settings && (
            <Accordion type="single" collapsible className="space-y-4">
              {/* System Configuration */}
              <AccordionItem value="system" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <Settings2 className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">System Configuration</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {/* Labor & Basic Pricing */}
                  <Card>
                <CardHeader>
                  <CardTitle>Labor & Basic Pricing</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Labor Rate ($/hour)</Label>
                    <Input
                      value={`$${settings?.laborRate || 0}`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C5</p>
                  </div>
                  <div>
                    <Label>Warranty Reserve ($)</Label>
                    <Input
                      value={`$${settings?.warrantyReserve || 0}`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell E39</p>
                  </div>
                </CardContent>
              </Card>

              {/* Business Percentages */}
              <Card>
                <CardHeader>
                  <CardTitle>Business Percentages</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Commission (%)</Label>
                    <Input
                      value={`${((settings?.commissionPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C6</p>
                  </div>
                  <div>
                    <Label>Financing/Promotion (%)</Label>
                    <Input
                      value={`${((settings?.financingPromotionPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C7</p>
                  </div>
                  <div>
                    <Label>Profit (%)</Label>
                    <Input
                      value={`${((settings?.profitPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell C8</p>
                  </div>
                  <div>
                    <Label>Overhead (%)</Label>
                    <Input
                      value={`${((settings?.overheadPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B41</p>
                  </div>
                  <div>
                    <Label>Labor Benefits (%)</Label>
                    <Input
                      value={`${((settings?.laborBenefitsPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B34</p>
                  </div>
                  <div>
                    <Label>Sales Tax (%)</Label>
                    <Input
                      value={`${((settings?.salesTaxPercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B38</p>
                  </div>
                  <div>
                    <Label>Material Shrinkage (%)</Label>
                    <Input
                      value={`${((settings?.materialShrinkagePercent || 0) * 100).toFixed(1)}%`}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">From cell B25</p>
                  </div>
                </CardContent>
              </Card>

              {/* Parts Pricing */}
              {settings?.partsPrices && (
                <Card>
                  <CardHeader>
                    <CardTitle>Material Pricing</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Refrigerant Filter Dryer</Label>
                      <Input
                        value={`$${settings?.partsPrices.refrigerantFilterDryer || 0}`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D20</p>
                    </div>
                    <div>
                      <Label>Copper</Label>
                      <Input
                        value={`$${settings?.partsPrices.copper || 0}/ft`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D21</p>
                    </div>
                    <div>
                      <Label>Armaflex Insulation</Label>
                      <Input
                        value={`$${settings?.partsPrices.armaflexInsulation || 0}/ft`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D22</p>
                    </div>
                    <div>
                      <Label>Acid Away</Label>
                      <Input
                        value={`$${settings?.partsPrices.acidAway || 0}`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D23</p>
                    </div>
                    <div>
                      <Label>Refrigerant</Label>
                      <Input
                        value={`$${settings?.partsPrices.refrigerant || 0}/lb`}
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground mt-1">From cell D24</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Warranty Discounts */}
              <Card>
                <CardHeader>
                  <CardTitle>GHVAC Warranty Discounts</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Labor rate discounts based on years since GHVAC installation
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {settings?.warrantyDiscounts && Object.entries(settings?.warrantyDiscounts).map(([year, discount]) => (
                      <div key={year} className="text-center">
                        <Label className="text-xs">Year {year}</Label>
                        <Input
                          value={`${(Number(discount) * 100).toFixed(0)}%`}
                          readOnly
                          className="bg-muted text-center text-xs h-8"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Price Book PDF Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    Price Book PDF
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Upload your pricing PDF (stored securely in the database)
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-upload">Upload PDF File</Label>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Input
                          id="pdf-upload"
                          type="file"
                          accept="application/pdf"
                          onChange={handlePdfFileSelect}
                          data-testid="input-pdf-file"
                        />
                      </div>
                      <Button 
                        onClick={handlePdfUpload}
                        disabled={!selectedPdfFile || uploadPdfMutation.isPending}
                        data-testid="button-upload-pdf"
                      >
                        {uploadPdfMutation.isPending ? "Uploading..." : "Upload"}
                      </Button>
                    </div>
                    {selectedPdfFile && (
                      <p className="text-xs text-muted-foreground">
                        Selected: {selectedPdfFile.name} ({(selectedPdfFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Upload a PDF file to display in the Price Book page. The file will be stored securely in the database.
                    </p>
                  </div>
                </CardContent>
              </Card>
                </AccordionContent>
              </AccordionItem>

              {/* User Management */}
              <AccordionItem value="users" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <Users className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">User Management</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {/* Email Management */}
                  <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.9a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email Notifications
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Manage email addresses that receive quote notifications
                  </p>
                  {settings?.emailSettings?.developmentMode && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        🧪 <strong>Development Mode</strong> - Using Resend test domains (no verification required)<br/>
                        ✉️ You can add your personal Gmail/email addresses below for testing!
                      </p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Email List */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Current Recipients</Label>
                    {emailAddresses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No email addresses configured</p>
                    ) : (
                      <div className="space-y-2">
                        {emailAddresses.map((email, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                            <span className="text-sm">{email}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveEmail(email)}
                              className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                              data-testid={`button-remove-email-${index}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add New Email */}
                  <div className="space-y-2">
                    <Label htmlFor="new-email" className="text-sm font-medium">Add Email Address</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="new-email"
                        type="email"
                        placeholder="manager@ghvac.com"
                        value={newEmailAddress}
                        onChange={(e) => setNewEmailAddress(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                        data-testid="input-new-email"
                      />
                      <Button
                        onClick={handleAddEmail}
                        disabled={!newEmailAddress || emailAddresses.includes(newEmailAddress) || saveEmailSettingsMutation.isPending}
                        data-testid="button-add-email"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Technician Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Technician Management
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Add or remove technicians from the system
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Technician List */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Current Technicians</Label>
                    {(technicians as any[]).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No technicians configured</p>
                    ) : (
                      <div className="space-y-2">
                        {(technicians as any[]).map((tech: any, index: number) => (
                          <div key={tech.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                            <div className="flex-1">
                              <span className="text-sm font-medium">{tech.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">({tech.email})</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveTechnician(tech.id)}
                              className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                              data-testid={`button-remove-technician-${index}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add New Technician */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Add Technician</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="text"
                        placeholder="Name"
                        value={newTechnicianName}
                        onChange={(e) => setNewTechnicianName(e.target.value)}
                        className="flex-1"
                        data-testid="input-technician-name"
                      />
                      <Input
                        type="email"
                        placeholder="Email"
                        value={newTechnicianEmail}
                        onChange={(e) => setNewTechnicianEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddTechnician()}
                        className="flex-1"
                        data-testid="input-technician-email"
                      />
                      <Button
                        onClick={handleAddTechnician}
                        disabled={!newTechnicianName || !newTechnicianEmail || createTechnicianMutation.isPending}
                        data-testid="button-add-technician"
                        className="sm:w-auto w-full"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
                </AccordionContent>
              </AccordionItem>

              {/* Content Management */}
              <AccordionItem value="content" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <FolderOpen className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">Content Management</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {/* Process Categories Management */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <FolderKanban className="h-5 w-5 mr-2" />
                        Process Categories
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Manage process categories for organizing workflows
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Add New Category */}
                      <div className="space-y-2">
                        <Label htmlFor="new-category" className="text-sm font-medium">Add Category</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="new-category"
                            placeholder="Enter category name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && newCategoryName && createCategoryMutation.mutate(newCategoryName)}
                            data-testid="input-new-category"
                          />
                          <Button
                            onClick={() => newCategoryName && createCategoryMutation.mutate(newCategoryName)}
                            disabled={!newCategoryName || createCategoryMutation.isPending}
                            data-testid="button-add-category"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add
                          </Button>
                        </div>
                      </div>

                      {/* Categories List */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Current Categories</Label>
                        {categories.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No categories yet</p>
                        ) : (
                          <div className="space-y-2">
                            {categories.map((category: Category) => (
                              <div key={category.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                {editingCategory?.id === category.id ? (
                                  <div className="flex items-center space-x-2 flex-1">
                                    <Input
                                      value={editingCategory.name}
                                      onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                      onKeyPress={(e) => e.key === 'Enter' && updateCategoryMutation.mutate({ id: editingCategory.id, name: editingCategory.name })}
                                      className="h-8"
                                      data-testid={`input-edit-category-${category.id}`}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => updateCategoryMutation.mutate({ id: editingCategory.id, name: editingCategory.name })}
                                      className="h-8"
                                      data-testid={`button-save-category-${category.id}`}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingCategory(null)}
                                      className="h-8"
                                      data-testid={`button-cancel-category-${category.id}`}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-sm">{category.name}</span>
                                    <div className="flex space-x-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingCategory(category)}
                                        className="h-6 w-6 p-0"
                                        data-testid={`button-edit-category-${category.id}`}
                                      >
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                                            data-testid={`button-delete-category-${category.id}`}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete Category</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Are you sure you want to delete "{category.name}"? This action cannot be undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction 
                                              onClick={() => deleteCategoryMutation.mutate(category.id)}
                                              className="bg-destructive hover:bg-destructive/90"
                                            >
                                              Delete
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Processes Management */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <FileText className="h-5 w-5 mr-2" />
                        Processes
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        View and manage all processes
                      </p>
                    </CardHeader>
                    <CardContent>
                      {processes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No processes created yet</p>
                      ) : (
                        <div className="space-y-3">
                          {processes.map((process: Process) => (
                            <div key={process.id} className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/50">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-1">
                                  <h4 className="font-medium text-sm truncate">{process.name}</h4>
                                  {process.category && (
                                    <Badge variant="secondary" className="text-xs">
                                      {process.category}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {process.description || 'No description'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {process.steps?.length || 0} step{(process.steps?.length || 0) !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground ml-2"
                                    data-testid={`button-delete-process-${process.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Process</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{process.name}"? This will remove all associated steps and cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => deleteProcessMutation.mutate(process.id)}
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              {/* Quote Management */}
              <AccordionItem value="quotes" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <ReceiptText className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">Quote Management</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="flex items-center">
                        <FileText className="h-5 w-5 mr-2 flex-shrink-0" />
                        Quote Management
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        View and delete generated quotes
                      </p>
                    </div>
                    {selectedQuotes.size > 0 && (
                      <div className="flex-shrink-0">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              disabled={deleteQuotesMutation.isPending}
                              data-testid="button-bulk-delete"
                              className="w-full sm:w-auto"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              <span className="hidden sm:inline">Delete {selectedQuotes.size} Quote{selectedQuotes.size !== 1 ? 's' : ''}</span>
                              <span className="sm:hidden">Delete ({selectedQuotes.size})</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {selectedQuotes.size} selected quote{selectedQuotes.size !== 1 ? 's' : ''}? 
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!showQuotesList ? (
                    // Show summary view (fast loading)
                    (<div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">{quoteSummary?.totalQuotes || 0}</div>
                          <div className="text-sm text-muted-foreground">Total Quotes</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">{quoteSummary?.statusCounts?.pending || 0}</div>
                          <div className="text-sm text-muted-foreground">Pending</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">{quoteSummary?.statusCounts?.approved || 0}</div>
                          <div className="text-sm text-muted-foreground">Approved</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">${quoteSummary?.totalValue ? Math.round(quoteSummary.totalValue).toLocaleString() : 0}</div>
                          <div className="text-sm text-muted-foreground">Total Value</div>
                        </div>
                      </div>
                      <div className="flex justify-center pt-2">
                        <Button 
                          onClick={() => setShowQuotesList(true)}
                          variant="outline"
                          className="w-full sm:w-auto"
                          data-testid="button-load-quotes"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Load Full Quotes List ({quoteSummary?.totalQuotes || 0})
                        </Button>
                      </div>
                    </div>)
                  ) : quotesLoading ? (
                    // Loading state
                    (<div className="text-center py-8 text-muted-foreground">
                      <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin" />
                      <p>Loading quotes...</p>
                    </div>)
                  ) : quotes.length === 0 ? (
                    // No quotes found
                    (<div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No quotes found</p>
                      <Button 
                        onClick={() => setShowQuotesList(false)}
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                      >
                        Back to Summary
                      </Button>
                    </div>)
                  ) : (
                    // Full quotes list
                    (<div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Button 
                          onClick={() => setShowQuotesList(false)}
                          variant="ghost"
                          size="sm"
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back to Summary
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Showing {quotes.length} of {quotesTotal} quotes
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 pb-3 border-b border-border">
                        <Checkbox
                          checked={selectedQuotes.size === quotes.length && quotes.length > 0}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                        <Label className="text-sm font-medium">
                          Select All ({quotes.length} quote{quotes.length !== 1 ? 's' : ''})
                        </Label>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {quotes.map((quote: Quote) => (
                          <div key={quote.id} className="flex items-start sm:items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50">
                            <Checkbox
                              checked={selectedQuotes.has(quote.id!)}
                              onCheckedChange={(checked) => handleSelectQuote(quote.id!, checked as boolean)}
                              data-testid={`checkbox-quote-${quote.id}`}
                              className="mt-0.5 sm:mt-0 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-1">
                                <span className="font-medium text-sm truncate">{quote.customerName}</span>
                                <Badge className={getStatusColor(quote.status || 'draft') + " text-xs w-fit mt-1 sm:mt-0"}>
                                  {(quote.status || 'draft').charAt(0).toUpperCase() + (quote.status || 'draft').slice(1)}
                                </Badge>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground space-y-1 sm:space-y-0">
                                <span className="truncate">{quote.technician}</span>
                                <span className="text-xs">{new Date(quote.createdAt!).toLocaleDateString()}</span>
                                <span className="font-medium text-foreground">${parseFloat(quote.total).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>)
                  )}
                </CardContent>
              </Card>
                </AccordionContent>
              </AccordionItem>

              {/* Announcement Management */}
              <AccordionItem value="announcements" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <Bell className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">Announcement Management</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card className="border-0 shadow-none">
                    <CardContent className="pt-6 space-y-6">
                      {/* Create Announcement Form */}
                      <div className="space-y-4 p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg">Create New Announcement</h3>
                        
                        <div className="space-y-2">
                          <Label htmlFor="announcement-title">Title</Label>
                          <Input
                            id="announcement-title"
                            value={announcementTitle}
                            onChange={(e) => setAnnouncementTitle(e.target.value)}
                            placeholder="Enter announcement title"
                            data-testid="input-announcement-title"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="announcement-message">Message</Label>
                          <Textarea
                            id="announcement-message"
                            value={announcementMessage}
                            onChange={(e) => setAnnouncementMessage(e.target.value)}
                            placeholder="Enter announcement message"
                            rows={4}
                            data-testid="textarea-announcement-message"
                          />
                          <p className="text-xs text-muted-foreground">
                            Supports markdown: **bold**, *italic*, ## headers, bullets, links [text](url)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="announcement-button">Button Text</Label>
                          <Input
                            id="announcement-button"
                            value={announcementButtonText}
                            onChange={(e) => setAnnouncementButtonText(e.target.value)}
                            placeholder="e.g., Got it, Okay, Dismiss"
                            data-testid="input-announcement-button-text"
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="announcement-active"
                            checked={announcementIsActive}
                            onCheckedChange={setAnnouncementIsActive}
                            data-testid="switch-announcement-active"
                          />
                          <Label htmlFor="announcement-active" className="cursor-pointer">
                            Set as Active Announcement
                          </Label>
                        </div>

                        <Button
                          onClick={() => {
                            if (!announcementTitle || !announcementMessage) {
                              toast({
                                title: 'Missing Fields',
                                description: 'Please fill in title and message.',
                                variant: 'destructive',
                              });
                              return;
                            }
                            createAnnouncementMutation.mutate({
                              title: announcementTitle,
                              message: announcementMessage,
                              buttonText: announcementButtonText,
                              isActive: announcementIsActive,
                            });
                          }}
                          disabled={createAnnouncementMutation.isPending}
                          className="w-full"
                          data-testid="button-create-announcement"
                        >
                          {createAnnouncementMutation.isPending ? 'Creating...' : 'Create Announcement'}
                        </Button>
                      </div>

                      {/* Current Active Announcement */}
                      {activeAnnouncement && (
                        <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-lg">Current Active Announcement</h3>
                            <Badge className="bg-green-500">Active</Badge>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <Label className="text-sm text-muted-foreground">Title</Label>
                              <p className="font-medium" data-testid="text-active-announcement-title">{activeAnnouncement.title}</p>
                            </div>
                            <div>
                              <Label className="text-sm text-muted-foreground">Message</Label>
                              <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="text-active-announcement-message">
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    a: ({ node, ...props }) => (
                                      <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline" />
                                    ),
                                  }}
                                >
                                  {activeAnnouncement.message}
                                </ReactMarkdown>
                              </div>
                            </div>
                            <div>
                              <Label className="text-sm text-muted-foreground">Button Text</Label>
                              <p data-testid="text-active-announcement-button">{activeAnnouncement.buttonText}</p>
                            </div>
                            <div>
                              <Label className="text-sm text-muted-foreground">Version</Label>
                              <p className="text-xs font-mono" data-testid="text-active-announcement-version">{activeAnnouncement.version}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* All Announcements List */}
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg">All Announcements ({announcements.length})</h3>
                        {announcements.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No announcements created yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {announcements.map((announcement) => (
                              <div 
                                key={announcement.id} 
                                className="flex items-start justify-between p-3 border rounded-lg"
                                data-testid={`announcement-item-${announcement.id}`}
                              >
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-medium">{announcement.title}</span>
                                    {announcement.isActive && (
                                      <Badge className="bg-green-500 text-xs">Active</Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground line-clamp-2 prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown 
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        a: ({ node, ...props }) => (
                                          <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline" />
                                        ),
                                      }}
                                    >
                                      {announcement.message}
                                    </ReactMarkdown>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Version: {announcement.version} • Created: {new Date(announcement.createdAt!).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => {
                                      setEditingAnnouncement(announcement);
                                      setEditTitle(announcement.title);
                                      setEditMessage(announcement.message);
                                      setEditButtonText(announcement.buttonText);
                                      setEditIsActive(announcement.isActive);
                                    }}
                                    data-testid={`button-edit-announcement-${announcement.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        data-testid={`button-delete-announcement-${announcement.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete this announcement? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteAnnouncementMutation.mutate(announcement.id)}
                                          className="bg-destructive hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              {/* Phone Whitelist Management */}
              <AccordionItem value="phone-whitelist" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <Users className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">Phone Whitelist Management</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card className="border-0 shadow-none">
                    <CardContent className="pt-6 space-y-6">
                      {/* Add Phone Form */}
                      <div className="space-y-4 p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg">Add Phone Number</h3>
                        <p className="text-sm text-muted-foreground">
                          Add authorized phone numbers for SMS authentication access.
                        </p>
                        
                        <div className="space-y-2">
                          <Label htmlFor="phone-number">Phone Number</Label>
                          <Input
                            id="phone-number"
                            value={newPhoneNumber}
                            onChange={(e) => setNewPhoneNumber(e.target.value)}
                            placeholder="+1234567890"
                            data-testid="input-phone-number"
                          />
                          <p className="text-xs text-muted-foreground">
                            Format: +1234567890 (include country code)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="phone-name">Name</Label>
                          <Input
                            id="phone-name"
                            value={newPhoneName}
                            onChange={(e) => setNewPhoneName(e.target.value)}
                            placeholder="John Doe"
                            data-testid="input-phone-name"
                          />
                        </div>

                        <Button
                          onClick={() => {
                            if (!newPhoneNumber || !newPhoneName) {
                              toast({
                                title: 'Missing Fields',
                                description: 'Please fill in phone number and name.',
                                variant: 'destructive',
                              });
                              return;
                            }
                            if (!newPhoneNumber.startsWith('+')) {
                              toast({
                                title: 'Invalid Format',
                                description: 'Phone number must start with + (e.g., +1234567890)',
                                variant: 'destructive',
                              });
                              return;
                            }
                            addPhoneWhitelistMutation.mutate({
                              phoneNumber: newPhoneNumber,
                              name: newPhoneName,
                            });
                          }}
                          disabled={addPhoneWhitelistMutation.isPending}
                          className="w-full"
                          data-testid="button-add-phone"
                        >
                          {addPhoneWhitelistMutation.isPending ? 'Adding...' : 'Add Phone Number'}
                        </Button>
                      </div>

                      {/* Whitelisted Phones List */}
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg">Authorized Phone Numbers ({phoneWhitelist.length})</h3>
                        {phoneWhitelist.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No phone numbers whitelisted yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {phoneWhitelist.map((entry) => (
                              <div 
                                key={entry.id} 
                                className="flex items-center justify-between p-3 border rounded-lg"
                                data-testid={`phone-entry-${entry.id}`}
                              >
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-medium">{entry.name}</span>
                                    {entry.isActive && (
                                      <Badge className="bg-green-500 text-xs">Active</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground font-mono">
                                    {entry.phoneNumber}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Added: {new Date(entry.createdAt!).toLocaleDateString()}
                                  </p>
                                </div>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      className="flex-shrink-0 ml-2"
                                      data-testid={`button-delete-phone-${entry.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove Phone Number</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to remove {entry.name} ({entry.phoneNumber}) from the whitelist? They will no longer be able to log in.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deletePhoneWhitelistMutation.mutate(entry.id)}
                                        className="bg-destructive hover:bg-destructive/90"
                                      >
                                        Remove
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              {/* Backup & Restore */}
              <AccordionItem value="backup-restore" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <Database className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">Backup & Restore</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card className="border-0 shadow-none">
                    <CardContent className="pt-6 space-y-6">
                      {/* Backup Section */}
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">Create Backup</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Export all your data to a .ghvac file
                            </p>
                          </div>
                          <Download className="h-8 w-8 text-primary" />
                        </div>

                        <div className="space-y-2 text-sm">
                          <p className="font-medium">What gets backed up:</p>
                          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                            <li>All quotes and pricing data</li>
                            <li>Processes & systems wiki</li>
                            <li>Categories and settings</li>
                            <li>Announcements and phone whitelist</li>
                            <li>Price book PDFs</li>
                          </ul>
                        </div>

                        <Button
                          onClick={() => setShowBackupConfirm(true)}
                          className="w-full"
                          data-testid="button-create-backup"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download Backup (.ghvac)
                        </Button>
                      </div>

                      {/* Restore Section */}
                      <div className="space-y-4 p-4 border rounded-lg border-orange-500/50 bg-orange-500/5">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">Restore Backup</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Import data from a .ghvac backup file
                            </p>
                          </div>
                          <Upload className="h-8 w-8 text-orange-500" />
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="backup-file">Select Backup File</Label>
                            <Input
                              id="backup-file"
                              type="file"
                              accept=".ghvac"
                              onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
                              data-testid="input-backup-file"
                            />
                            {backupFile && (
                              <p className="text-sm text-muted-foreground">
                                Selected: {backupFile.name}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Restore Mode</Label>
                            <div className="flex gap-4">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="mode-replace"
                                  name="restore-mode"
                                  value="replace"
                                  checked={restoreMode === 'replace'}
                                  onChange={(e) => setRestoreMode(e.target.value as 'replace' | 'merge')}
                                  className="cursor-pointer"
                                  data-testid="radio-mode-replace"
                                />
                                <Label htmlFor="mode-replace" className="cursor-pointer font-normal">
                                  Replace all data
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="mode-merge"
                                  name="restore-mode"
                                  value="merge"
                                  checked={restoreMode === 'merge'}
                                  onChange={(e) => setRestoreMode(e.target.value as 'replace' | 'merge')}
                                  className="cursor-pointer"
                                  data-testid="radio-mode-merge"
                                />
                                <Label htmlFor="mode-merge" className="cursor-pointer font-normal">
                                  Merge with existing
                                </Label>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {restoreMode === 'replace' 
                                ? '⚠️ This will delete all current data before importing' 
                                : 'Add backup data to existing data (may create duplicates)'}
                            </p>
                          </div>

                          <Button
                            onClick={() => setShowRestoreConfirm(true)}
                            disabled={!backupFile || restoreBackupMutation.isPending}
                            variant="destructive"
                            className="w-full"
                            data-testid="button-restore-backup"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {restoreBackupMutation.isPending ? 'Restoring...' : 'Restore Backup'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              {/* Customer Database */}
              <AccordionItem value="customer-database" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <Users className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">Customer Database</span>
                    <Badge variant="secondary" className="ml-2">{customerStats?.totalCustomers || 0}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card className="border-0 shadow-none">
                    <CardContent className="pt-6 space-y-6">
                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 border rounded-lg bg-muted/30">
                          <div className="text-2xl font-bold">{customerStats?.totalCustomers || 0}</div>
                          <div className="text-sm text-muted-foreground">Total Customers</div>
                        </div>
                        <div className="p-4 border rounded-lg bg-muted/30">
                          <div className="text-2xl font-bold">{customerStats?.totalImports || 0}</div>
                          <div className="text-sm text-muted-foreground">Imports</div>
                        </div>
                      </div>

                      {customerStats?.lastImportDate && (
                        <div className="text-sm text-muted-foreground">
                          Last import: {new Date(customerStats.lastImportDate).toLocaleDateString()} ({customerStats.lastImportFilename})
                        </div>
                      )}

                      {/* Auto-Sync Status */}
                      <div className="space-y-4 p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                              <RefreshCw className="h-5 w-5 text-green-600" />
                              Auto-Sync (Google Sheets)
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Automatically syncs from FieldEdge sheet every 10 minutes
                            </p>
                          </div>
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                            Active
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="p-3 border rounded bg-background">
                            <div className="font-medium">Last Sync</div>
                            <div className="text-muted-foreground">
                              {customerSyncStatus?.lastSyncTime 
                                ? new Date(customerSyncStatus.lastSyncTime).toLocaleString()
                                : 'Never'}
                            </div>
                          </div>
                          <div className="p-3 border rounded bg-background">
                            <div className="font-medium">Last Check</div>
                            <div className="text-muted-foreground">
                              {customerSyncStatus?.lastCheckTime 
                                ? new Date(customerSyncStatus.lastCheckTime).toLocaleString()
                                : 'Never'}
                            </div>
                          </div>
                          <div className="p-3 border rounded bg-background">
                            <div className="font-medium">Syncs Today</div>
                            <div className="text-muted-foreground">{customerSyncStatus?.syncCount || 0}</div>
                          </div>
                          <div className="p-3 border rounded bg-background">
                            <div className="font-medium">Last Result</div>
                            <div className="text-muted-foreground">
                              {customerSyncStatus?.lastSyncResult 
                                ? `+${customerSyncStatus.lastSyncResult.created} / ↻${customerSyncStatus.lastSyncResult.updated}`
                                : 'N/A'}
                            </div>
                          </div>
                        </div>

                        {customerSyncStatus?.lastError && (
                          <div className="p-3 border border-red-200 bg-red-50 dark:bg-red-950 rounded text-sm text-red-700 dark:text-red-300">
                            <span className="font-medium">Error:</span> {customerSyncStatus.lastError}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={() => triggerSyncMutation.mutate()}
                            disabled={triggerSyncMutation.isPending}
                            variant="outline"
                            className="flex-1"
                            data-testid="button-trigger-sync"
                          >
                            <RefreshCw className={`h-4 w-4 mr-2 ${triggerSyncMutation.isPending ? 'animate-spin' : ''}`} />
                            {triggerSyncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                          </Button>
                          <Button
                            onClick={() => resetSyncHashMutation.mutate()}
                            disabled={resetSyncHashMutation.isPending}
                            variant="ghost"
                            size="sm"
                            title="Force full re-sync next time"
                            data-testid="button-reset-sync-hash"
                          >
                            Reset
                          </Button>
                        </div>
                      </div>

                      {/* Import Section */}
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">Import Customers from CSV</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Upload a FieldEdge export file to sync customer data
                            </p>
                          </div>
                          <Upload className="h-8 w-8 text-primary" />
                        </div>

                        <div className="space-y-2 text-sm">
                          <p className="font-medium">Expected CSV columns:</p>
                          <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                            <li>Display Name (required)</li>
                            <li>Customer Type</li>
                            <li>Full Address</li>
                            <li>Phone</li>
                            <li>Email</li>
                            <li>Lead Source</li>
                          </ul>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="customer-csv">Select CSV File</Label>
                            <Input
                              id="customer-csv"
                              type="file"
                              accept=".csv"
                              onChange={(e) => setCustomerCsvFile(e.target.files?.[0] || null)}
                              data-testid="input-customer-csv"
                            />
                            {customerCsvFile && (
                              <p className="text-sm text-muted-foreground">
                                Selected: {customerCsvFile.name}
                              </p>
                            )}
                          </div>

                          <Button
                            onClick={() => customerCsvFile && customerImportMutation.mutate(customerCsvFile)}
                            disabled={!customerCsvFile || customerImportMutation.isPending}
                            className="w-full"
                            data-testid="button-import-customers"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {customerImportMutation.isPending ? 'Importing...' : 'Import Customers'}
                          </Button>
                        </div>
                      </div>

                      {/* Import History */}
                      {customerImportHistory.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-medium">Import History</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {customerImportHistory.map((batch) => (
                              <div key={batch.id} className="p-3 border rounded-lg text-sm">
                                <div className="flex justify-between items-start">
                                  <div className="font-medium">{batch.filename}</div>
                                  <Badge variant={batch.status === 'completed' ? 'default' : 'secondary'}>
                                    {batch.status}
                                  </Badge>
                                </div>
                                <div className="text-muted-foreground mt-1">
                                  {new Date(batch.importedAt).toLocaleString()}
                                </div>
                                {batch.totalRows && (
                                  <div className="flex gap-3 mt-2 text-xs">
                                    <span className="text-green-600">+{batch.createdCount || 0} new</span>
                                    <span className="text-blue-600">{batch.updatedCount || 0} updated</span>
                                    <span className="text-muted-foreground">{batch.skippedCount || 0} skipped</span>
                                    {Number(batch.errorCount) > 0 && (
                                      <span className="text-red-600">{batch.errorCount} errors</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

              {/* Developer Tools */}
              <AccordionItem value="dev-tools" className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center">
                    <Code className="h-5 w-5 mr-3 text-primary" />
                    <span className="font-semibold">Developer Tools</span>
                    <Badge variant="secondary" className="ml-2">Beta</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-6 mt-4">
                    {/* Quote Calculation Formula Viewer */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Quote Calculation Formula</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                          <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                            ✓ Live Formula - All values below are pulled from your current Google Sheets settings
                          </p>
                        </div>
                        
                        <div className="space-y-3 text-sm font-mono bg-muted/30 p-4 rounded-lg">
                          <div className="font-bold text-base mb-3">Step-by-Step Calculation:</div>
                          
                          {/* Parts Calculation */}
                          <div className="space-y-1">
                            <div className="font-semibold text-primary">1. Parts & Materials:</div>
                            <div className="ml-4 space-y-1">
                              <div>• All Parts Subtotal = Sum of (Price × Quantity) for ALL parts</div>
                              <div>• Material Shrinkage = Specific Materials × 3% (refrigerant filter, copper, insulation, acid away)</div>
                              <div className="font-medium">→ Adjusted Parts Total = All Parts + Material Shrinkage</div>
                              <div className="text-xs text-muted-foreground">Note: Warranty is applied AFTER calculating full selling price (see step 6)</div>
                            </div>
                          </div>

                          {/* Labor Calculation */}
                          <div className="space-y-1 mt-3">
                            <div className="font-semibold text-primary">2. Labor:</div>
                            <div className="ml-4 space-y-1">
                              <div>• Base Labor = Labor Hours × Labor Rate (${settings?.laborRate || '65'}/hr)</div>
                              <div>• Labor Benefits = Base Labor × 34%</div>
                              <div className="font-medium">→ Total Labor = Base Labor + Labor Benefits</div>
                            </div>
                          </div>

                          {/* Tax & Fees */}
                          <div className="space-y-1 mt-3">
                            <div className="font-semibold text-primary">3. Tax & Fees:</div>
                            <div className="ml-4 space-y-1">
                              <div>• Sales Tax = Adjusted Parts Total × {((settings?.salesTaxPercent || 0.08) * 100).toFixed(2)}%</div>
                              <div>• Warranty Reserve = ${settings?.warrantyReserve || '25'} (fixed)</div>
                            </div>
                          </div>

                          {/* Direct Cost */}
                          <div className="space-y-1 mt-3 bg-yellow-50 dark:bg-yellow-950 p-3 rounded">
                            <div className="font-semibold text-primary">4. Direct Cost:</div>
                            <div className="ml-4">
                              <div className="font-medium">Direct Cost = Adjusted Parts + Total Labor + Tax + Warranty Reserve</div>
                            </div>
                          </div>

                          {/* Markup Formula */}
                          <div className="space-y-1 mt-3">
                            <div className="font-semibold text-primary">5. Selling Price Calculation:</div>
                            <div className="ml-4 space-y-1">
                              <div className="mb-2">
                                <div>• Overhead = {((settings?.overheadPercent || 0.30) * 100).toFixed(0)}%</div>
                                <div>• Profit = {((settings?.profitPercent || 0.15) * 100).toFixed(0)}%</div>
                                <div>• Financing = {((settings?.financingPromotionPercent || 0.03) * 100).toFixed(0)}%</div>
                                <div>• Commission = {((settings?.commissionPercent || 0.03) * 100).toFixed(0)}%</div>
                              </div>
                              <div className="mt-2">Total Deduction Rate = {((settings?.overheadPercent || 0.30) * 100).toFixed(0)}% + {((settings?.profitPercent || 0.15) * 100).toFixed(0)}% + {((settings?.financingPromotionPercent || 0.03) * 100).toFixed(0)}% + {((settings?.commissionPercent || 0.03) * 100).toFixed(0)}% = {(((settings?.overheadPercent || 0.30) + (settings?.profitPercent || 0.15) + (settings?.financingPromotionPercent || 0.03) + (settings?.commissionPercent || 0.03)) * 100).toFixed(0)}%</div>
                              <div className="font-medium text-lg mt-2 bg-green-50 dark:bg-green-950 p-2 rounded">
                                <strong>Selling Price = Direct Cost ÷ (1 - Total Deduction Rate)</strong>
                              </div>
                              <div className="text-xs text-muted-foreground mt-2">
                                Example: If Direct Cost = $1,000, Selling Price = $1,000 ÷ (1 - {(((settings?.overheadPercent || 0.30) + (settings?.profitPercent || 0.15) + (settings?.financingPromotionPercent || 0.03) + (settings?.commissionPercent || 0.03)) * 100).toFixed(0)}%) = $1,000 ÷ {(1 - ((settings?.overheadPercent || 0.30) + (settings?.profitPercent || 0.15) + (settings?.financingPromotionPercent || 0.03) + (settings?.commissionPercent || 0.03))).toFixed(2)} = ${(1000 / (1 - ((settings?.overheadPercent || 0.30) + (settings?.profitPercent || 0.15) + (settings?.financingPromotionPercent || 0.03) + (settings?.commissionPercent || 0.03)))).toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* Warranty Logic */}
                          <div className="space-y-1 mt-3 bg-green-50 dark:bg-green-950 p-3 rounded">
                            <div className="font-semibold text-primary">7. GHVAC Warranty Coverage:</div>
                            <div className="ml-4 space-y-2 text-xs">
                              <div className="font-medium">When warranty applies:</div>
                              <div className="ml-2 space-y-1">
                                <div>1. Calculate Full Selling Price (all parts included)</div>
                                <div>2. Identify GHVAC-Covered Parts: Control Board, Evap Coil, Compressor</div>
                                <div>3. Subtract GHVAC-Covered Parts from Full Price</div>
                                <div>4. Customer Pays = Coverage% × (Full Price - GHVAC-Covered Parts)</div>
                              </div>
                              <div className="mt-2 font-medium border-t border-green-200 dark:border-green-800 pt-2">Coverage Percentages (what customer pays):</div>
                              <div className="ml-2 space-y-0.5">
                                <div>• Year 2: 25% | Year 3: 35% | Year 4: 45%</div>
                                <div>• Year 5: 50% | Year 6: 55% | Year 7: 65%</div>
                                <div>• Year 8: 70% | Year 9: 80% | Year 10: 90%</div>
                              </div>
                              <div className="text-muted-foreground mt-2 italic">
                                Example: $1000 total with $200 control board, Year 2 (25%) warranty<br/>
                                Customer pays: 25% × ($1000 - $200) = $200
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Formula Comparison */}
                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                          <h4 className="font-semibold mb-2">Formula Comparison with Spreadsheet:</h4>
                          <p className="text-sm text-muted-foreground">
                            This formula matches your Excel spreadsheet's pricing model. The app calculates all intermediate values (shrinkage, benefits, reserves) that aren't shown in the simple summary view. 
                            Use the "Show Detailed Breakdown" toggle in the quote generator to see all intermediate calculations line-by-line.
                          </p>
                        </div>

                        {/* Current Settings */}
                        <div className="mt-6 p-4 border rounded-lg">
                          <h4 className="font-semibold mb-3">Current Settings (from Google Sheets):</h4>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Labor Rate:</span>
                              <span className="ml-2 font-medium">${settings?.laborRate || '65'}/hr</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Sales Tax:</span>
                              <span className="ml-2 font-medium">{((settings?.salesTaxPercent || 0.08) * 100).toFixed(2)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Overhead:</span>
                              <span className="ml-2 font-medium">{((settings?.overheadPercent || 0.30) * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Profit:</span>
                              <span className="ml-2 font-medium">{((settings?.profitPercent || 0.15) * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Financing:</span>
                              <span className="ml-2 font-medium">{((settings?.financingPromotionPercent || 0.03) * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Commission:</span>
                              <span className="ml-2 font-medium">{((settings?.commissionPercent || 0.03) * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </main>

      {/* Backup Confirmation Dialog */}
      <AlertDialog open={showBackupConfirm} onOpenChange={setShowBackupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Backup</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to download a complete backup of all your data including:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>All quotes and pricing data</li>
                <li>Processes & systems wiki</li>
                <li>Categories and settings</li>
                <li>Announcements and phone whitelist</li>
                <li>Price book PDFs</li>
              </ul>
              <p className="pt-2">
                This will create a <code className="text-xs bg-muted px-1 py-0.5 rounded">.ghvac</code> file that you can use to restore your data later.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-backup">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBackupDownload}
              data-testid="button-confirm-backup"
            >
              Download Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Backup Restore</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to restore data from: <strong>{backupFile?.name}</strong>
              </p>
              <p>
                Mode: <strong>{restoreMode === 'replace' ? 'Replace All Data' : 'Merge with Existing'}</strong>
              </p>
              {restoreMode === 'replace' && (
                <p className="text-destructive font-semibold">
                  ⚠️ Warning: This will permanently delete all current data before importing the backup!
                </p>
              )}
              <p>This action cannot be easily undone. Are you sure?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (backupFile) {
                  restoreBackupMutation.mutate({ file: backupFile, mode: restoreMode });
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-restore"
            >
              Restore Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Announcement Dialog */}
      <Dialog open={!!editingAnnouncement} onOpenChange={(open) => !open && setEditingAnnouncement(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
            <DialogDescription>
              Update the announcement details and active status.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter announcement title"
                data-testid="input-edit-announcement-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-message">Message</Label>
              <Textarea
                id="edit-message"
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                placeholder="Enter announcement message"
                rows={4}
                data-testid="textarea-edit-announcement-message"
              />
              <p className="text-xs text-muted-foreground">
                Supports markdown: **bold**, *italic*, ## headers, bullets, links [text](url)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-button-text">Button Text</Label>
              <Input
                id="edit-button-text"
                value={editButtonText}
                onChange={(e) => setEditButtonText(e.target.value)}
                placeholder="e.g., Got it, Okay, Dismiss"
                data-testid="input-edit-announcement-button-text"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-active"
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
                data-testid="switch-edit-announcement-active"
              />
              <Label htmlFor="edit-active" className="cursor-pointer">
                Set as Active Announcement
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingAnnouncement(null)}
              data-testid="button-cancel-edit-announcement"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editTitle || !editMessage) {
                  toast({
                    title: 'Missing Fields',
                    description: 'Please fill in title and message.',
                    variant: 'destructive',
                  });
                  return;
                }
                if (editingAnnouncement) {
                  updateAnnouncementMutation.mutate({
                    id: editingAnnouncement.id,
                    title: editTitle,
                    message: editMessage,
                    buttonText: editButtonText,
                    isActive: editIsActive,
                  });
                }
              }}
              disabled={updateAnnouncementMutation.isPending}
              data-testid="button-save-edit-announcement"
            >
              {updateAnnouncementMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
