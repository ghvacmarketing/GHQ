import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  path: string;
}

interface NavDropdownProps {
  currentPageTitle: string;
  items: NavItem[];
}

export default function NavDropdown({ currentPageTitle, items }: NavDropdownProps) {
  const [location] = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="flex items-center space-x-1 hover:bg-muted/50 h-auto px-2"
          data-testid="button-nav-dropdown"
        >
          <span className="text-sm sm:text-base font-semibold">{currentPageTitle}</span>
          <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {items.map((item) => (
          <Link key={item.path} href={item.path}>
            <DropdownMenuItem 
              className={location === item.path ? "bg-muted" : ""}
              data-testid={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {item.label}
            </DropdownMenuItem>
          </Link>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
