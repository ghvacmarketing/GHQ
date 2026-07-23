import { useLocation } from "wouter";
import {
  Grip, Monitor, Smartphone, FolderOpen, Calculator, Megaphone, LayoutDashboard, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CrmUser } from "@shared/schema";

/** CRM-style top utility bar for the app shells: Apps switcher on the left,
 *  an optional centered slot (e.g. Documents' file search), and the
 *  signed-in user's name on the right. */
export function AppTopBar({ currentUser, center }: { currentUser?: CrmUser | null; center?: React.ReactNode }) {
  const [, navigate] = useLocation();
  const role = currentUser?.role || "";

  return (
    <div className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2.5" title="Switch app" data-testid="button-app-switcher">
            <Grip className="h-5 w-5 text-slate-600" />
            <span className="text-sm font-medium text-slate-600">Apps</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Apps</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => navigate("/crm/dashboard")} data-testid="app-switch-crm">
            <LayoutDashboard className="mr-2 h-4 w-4 text-slate-500" /> CRM
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/mobile")} data-testid="app-switch-field">
            <Smartphone className="mr-2 h-4 w-4 text-slate-500" /> Field
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/documents")} data-testid="app-switch-documents">
            <FolderOpen className="mr-2 h-4 w-4 text-slate-500" /> Documents
          </DropdownMenuItem>
          {["owner", "admin", "supervisor"].includes(role) && (
            <DropdownMenuItem onClick={() => navigate("/accounting")} data-testid="app-switch-accounting">
              <Calculator className="mr-2 h-4 w-4 text-slate-500" /> Accounting
            </DropdownMenuItem>
          )}
          {["owner", "admin", "supervisor"].includes(role) && (
            <DropdownMenuItem onClick={() => navigate("/reports")} data-testid="app-switch-reports">
              <BarChart3 className="mr-2 h-4 w-4 text-slate-500" /> Reports
            </DropdownMenuItem>
          )}
          {["owner", "admin", "supervisor", "sales"].includes(role) && (
            <DropdownMenuItem onClick={() => navigate("/marketing")} data-testid="app-switch-marketing">
              <Megaphone className="mr-2 h-4 w-4 text-slate-500" /> Marketing
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/")} data-testid="app-switch-home">
            <Monitor className="mr-2 h-4 w-4 text-slate-500" /> All apps
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {center && <div className="min-w-0 flex-1">{center}</div>}

      <div className={`${center ? "" : "ml-auto "}flex items-center border-l border-border pl-3`}>
        <span className="text-sm font-medium text-slate-600">{currentUser?.name || "User"}</span>
      </div>
    </div>
  );
}
