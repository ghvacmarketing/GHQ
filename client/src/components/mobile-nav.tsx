import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, FileText, History, BookOpen, Book, UserCog, Wrench, ClipboardList, Phone, Home, Settings, FolderOpen, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const navSections = [
  {
    title: "Sales",
    items: [
      { label: "New Service Quote", href: "/quote", icon: FileText },
      { label: "Proposal Builder", href: "/proposal", icon: ClipboardList },
      { label: "Sales Prospects", href: "/sales-prospects", icon: UserCog },
    ],
  },
  {
    title: "Install & Service",
    items: [
      { label: "Installation Dept.", href: "/installation", icon: Wrench },
      { label: "Service Dept.", href: "/service-pipeline", icon: Wrench },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "Price Book", href: "/price-book", icon: Book },
      { label: "Processes & Systems", href: "/processes", icon: BookOpen },
      { label: "Quote History", href: "/history", icon: History },
      { label: "Proposal History", href: "/proposal-history", icon: FolderOpen },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Phone", href: "/voicemails", icon: Phone },
      { label: "Settings", href: "/admin", icon: Settings },
      { label: "Employee Portal", href: "/employee-portal/login", icon: Users },
      { label: "CRM", href: "/crm/gate", icon: Briefcase },
    ],
  },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="mr-1" data-testid="button-mobile-nav">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-left">GHVAC Tools</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-60px)]">
          <div className="p-2">
            <Link href="/" onClick={() => setOpen(false)}>
              <Button
                variant={location === "/" ? "secondary" : "ghost"}
                className="w-full justify-start gap-3 mb-2"
                data-testid="nav-home"
              >
                <Home className="h-4 w-4" />
                Home
              </Button>
            </Link>
            
            {navSections.map((section, idx) => (
              <div key={section.title} className="mb-2">
                <Separator className="my-2" />
                <p className="text-xs font-semibold text-muted-foreground px-3 py-1 uppercase tracking-wider">
                  {section.title}
                </p>
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                    <Button
                      variant={location === item.href ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3 h-10"
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
