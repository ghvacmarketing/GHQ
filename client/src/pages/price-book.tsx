import { useState } from "react";
import { Settings, BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";

const SALESBOOK_OPTIONS = [
  { id: 'brian', label: "Brian's Salesbook", url: 'https://online.fliphtml5.com/iwkrq/Zack-Salesbook/' },
  { id: 'chandler', label: "Chandler's Salesbook", url: 'https://online.fliphtml5.com/iwkrq/dcmc/' },
];

export default function PriceBook() {
  const [selectedBook, setSelectedBook] = useState('brian');
  
  const currentBook = SALESBOOK_OPTIONS.find(b => b.id === selectedBook) || SALESBOOK_OPTIONS[0];

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
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation Department", path: "/installation" },
                  { label: "Service Department", path: "/service-pipeline" },
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
        {/* Book Selector */}
        <div className="p-3 sm:p-4 bg-muted/50 border-b">
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
            {SALESBOOK_OPTIONS.map((book) => (
              <Button
                key={book.id}
                variant={selectedBook === book.id ? 'default' : 'outline'}
                size="sm"
                className={`min-h-[40px] ${selectedBook === book.id ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setSelectedBook(book.id)}
                data-testid={`button-book-${book.id}`}
              >
                <BookOpen className="h-4 w-4 mr-2" />
                {book.label}
              </Button>
            ))}
            <a 
              href={currentBook.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2"
            >
              <Button variant="ghost" size="sm" className="min-h-[40px]" data-testid="link-fullscreen">
                <ExternalLink className="h-4 w-4 mr-2" />
                Fullscreen
              </Button>
            </a>
          </div>
        </div>

        <div 
          className="w-full"
          style={{ height: 'calc(100vh - 140px)' }}
          data-testid="flipbook-container"
        >
          <iframe 
            style={{ border: 'none', width: '100%', height: '100%' }}
            src={currentBook.url}
            seamless
            scrolling="no"
            frameBorder={0}
            allowTransparency
            allowFullScreen
            title={currentBook.label}
            data-testid="flipbook-iframe"
          />
        </div>
      </main>
    </div>
  );
}
