import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";

export default function PriceBook() {

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
                currentPageTitle="Price Book"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation", path: "/installation" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => window.location.href = '/admin'}
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <div 
          className="flex-1 w-full" 
          style={{ position: 'relative', paddingTop: 'max(60%,324px)', width: '100%', height: 0 }}
          data-testid="flipbook-container"
        >
          <iframe 
            style={{ position: 'absolute', border: 'none', width: '100%', height: '100%', left: 0, top: 0 }}
            src="https://online.fliphtml5.com/iwkrq/dcmc/"
            seamless
            scrolling="no"
            frameBorder={0}
            allowTransparency
            allowFullScreen
            title="Price Book"
            data-testid="flipbook-iframe"
          />
        </div>
      </main>
    </div>
  );
}
