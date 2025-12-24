import { useState } from "react";
import { Settings, BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";

const SALESBOOK_OPTIONS = [
  { id: 'brian', label: "Brian's Salesbook", url: 'https://online.fliphtml5.com/iwkrq/Zack-Salesbook/' },
  { id: 'chandler', label: "Chandler's Salesbook", url: 'https://online.fliphtml5.com/iwkrq/dcmc/' },
];

export default function PriceBook() {
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  
  const currentBook = SALESBOOK_OPTIONS.find(b => b.id === selectedBook);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            {selectedBook ? (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedBook(null)}
                className="mr-2"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            ) : (
              <img 
                src={redlogo} 
                alt="Giesbrecht HVAC" 
                className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
                data-testid="img-company-logo"
              />
            )}
            <div className="min-w-0">
              <NavDropdown 
                currentPageTitle={currentBook ? currentBook.label : "Salesbook"}
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

      {/* Selection Screen */}
      {!selectedBook && (
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-bold text-center mb-6">Choose Your Salesbook</h1>
            <div className="grid gap-4">
              {SALESBOOK_OPTIONS.map((book) => (
                <Card 
                  key={book.id}
                  className="cursor-pointer hover:border-orange-500 hover:shadow-lg transition-all"
                  onClick={() => setSelectedBook(book.id)}
                  data-testid={`card-book-${book.id}`}
                >
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="bg-orange-500 text-white p-4 rounded-lg">
                      <BookOpen className="h-8 w-8" />
                    </div>
                    <span className="text-xl font-semibold">{book.label}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* Salesbook View */}
      {selectedBook && currentBook && (
        <main className="flex-1 overflow-hidden">
          <iframe 
            className="w-full h-full border-0"
            src={currentBook.url}
            seamless
            scrolling="no"
            frameBorder={0}
            allowTransparency
            allowFullScreen
            title={currentBook.label}
            data-testid="flipbook-iframe"
          />
        </main>
      )}
    </div>
  );
}
