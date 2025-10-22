import { LogOut, User } from "lucide-react";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

export default function UserMenu() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: authStatus } = useQuery<{
    authenticated: boolean;
    user?: { phoneNumber: string; name: string } | null;
    replitAccess?: boolean;
  }>({
    queryKey: ['/api/auth/status'],
  });

  const handleLogout = async () => {
    try {
      const response = await apiRequest("POST", "/api/auth/logout", {});
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Logged Out",
          description: "You have been successfully logged out",
        });
        navigate('/login');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    }
  };

  if (!authStatus?.authenticated) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9"
          data-testid="button-user-menu"
        >
          <User className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {authStatus.user && (
          <>
            <div className="px-2 py-2" data-testid="text-user-info">
              <p className="text-sm font-medium">{authStatus.user.name}</p>
              <p className="text-xs text-muted-foreground">{authStatus.user.phoneNumber}</p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {authStatus.replitAccess && (
          <>
            <div className="px-2 py-1.5">
              <p className="text-xs text-muted-foreground">Replit Admin Access</p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem 
          onClick={handleLogout}
          className="cursor-pointer"
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
