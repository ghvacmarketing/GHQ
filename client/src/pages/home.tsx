import { Link } from "wouter";
import { FileText, History, Settings, BookOpen, Shield } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import giesbrechtLogo from "@/assets/giesbrecht-logo.webp";

export default function Home() {
  const apps = [
    {
      title: "New Quote",
      icon: FileText,
      href: "/quote",
      color: "bg-primary",
      testId: "link-new-quote"
    },
    {
      title: "Quote History",
      icon: History,
      href: "/history",
      color: "bg-primary/90",
      testId: "link-quote-history"
    },
    {
      title: "Processes & Systems",
      icon: BookOpen,
      href: "/processes",
      color: "bg-primary/80",
      testId: "link-processes"
    },
    {
      title: "Settings",
      icon: Settings,
      href: "/settings",
      color: "bg-primary/70",
      testId: "link-settings"
    },
    {
      title: "Admin",
      icon: Shield,
      href: "/admin",
      color: "bg-primary/60",
      testId: "link-admin"
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <NavDropdown 
                currentPageTitle="Home"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Processes and Systems", path: "/processes" },
                ]}
              />
              <p className="text-xs text-muted-foreground hidden sm:block">Field Technician Tool</p>
            </div>
          </div>
        </div>
      </header>

      {/* App Drawer with Background Logo */}
      <main className="container mx-auto px-4 py-8 max-w-md md:max-w-2xl lg:max-w-4xl relative">
        {/* Background Logo Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <img 
            src={giesbrechtLogo} 
            alt="" 
            className="w-[300px] md:w-[400px] lg:w-[500px] opacity-[0.08] dark:opacity-[0.05] select-none"
            data-testid="img-background-logo"
          />
        </div>

        {/* App Icons Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8 relative z-10">
          {apps.map((app) => (
            <Link key={app.href} href={app.href}>
              <div 
                className="flex flex-col items-center justify-center space-y-3 p-4 rounded-lg transition-all hover:bg-muted/50 cursor-pointer group"
                data-testid={app.testId}
              >
                <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl ${app.color} flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg`}>
                  <app.icon className="h-8 w-8 md:h-10 md:w-10 text-white" />
                </div>
                <span className="text-sm md:text-base font-medium text-center text-foreground" data-testid={`text-${app.testId}-title`}>
                  {app.title}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
