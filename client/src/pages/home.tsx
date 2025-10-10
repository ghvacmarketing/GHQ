import { Link } from "wouter";
import { FileText, History, Settings, BookOpen, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  const shortcuts = [
    {
      title: "New Quote",
      description: "Generate a professional quote for HVAC services",
      icon: FileText,
      href: "/quote",
      color: "from-blue-500 to-blue-600",
      testId: "link-new-quote"
    },
    {
      title: "Quote History",
      description: "View and manage previous quotes",
      icon: History,
      href: "/history",
      color: "from-purple-500 to-purple-600",
      testId: "link-quote-history"
    },
    {
      title: "Processes & Systems",
      description: "Access saved processes and create new ones",
      icon: BookOpen,
      href: "/processes",
      color: "from-green-500 to-green-600",
      testId: "link-processes"
    },
    {
      title: "Settings",
      description: "Configure parts catalog and categories",
      icon: Settings,
      href: "/settings",
      color: "from-orange-500 to-orange-600",
      testId: "link-settings"
    },
    {
      title: "Admin Settings",
      description: "Manage system configuration and integrations",
      icon: Shield,
      href: "/admin",
      color: "from-red-500 to-red-600",
      testId: "link-admin"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent" data-testid="text-home-title">
            HVAC Service Hub
          </h1>
          <p className="text-muted-foreground text-lg" data-testid="text-home-subtitle">
            Professional quoting and process management for field technicians
          </p>
        </div>

        {/* Shortcuts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shortcuts.map((shortcut) => (
            <Link key={shortcut.href} href={shortcut.href}>
              <Card 
                className="h-full transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer border-2 hover:border-primary/50"
                data-testid={shortcut.testId}
              >
                <CardContent className="p-6">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${shortcut.color} flex items-center justify-center mb-4`}>
                    <shortcut.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2" data-testid={`text-${shortcut.testId}-title`}>
                    {shortcut.title}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid={`text-${shortcut.testId}-description`}>
                    {shortcut.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-home-footer">
            Optimized for mobile field work • No authentication required
          </p>
        </div>
      </div>
    </div>
  );
}
