import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Settings, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { useQuery } from "@tanstack/react-query";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PriceBook() {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);

  // Check if PDF exists in database
  const { data: pdfExists } = useQuery({
    queryKey: ['/api/price-book/pdf-check'],
    queryFn: async () => {
      const response = await fetch('/api/price-book/pdf', { method: 'HEAD' });
      return response.ok;
    },
  });

  const pdfUrl = pdfExists ? '/api/price-book/pdf' : null;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

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

      <main className="container mx-auto px-4 py-6">
        {!pdfUrl ? (
          <div className="max-w-2xl mx-auto mt-8">
            <Alert className="border-orange-500/50 bg-orange-500/10" data-testid="alert-no-pdf">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-600 dark:text-orange-400">
                No price book uploaded. Please upload a PDF file in the{" "}
                <a href="/admin" className="underline font-medium">Admin Settings</a>.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="w-full">
            {/* Zoom controls */}
            <div className="mb-4 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-16 text-center" data-testid="text-zoom-level">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            
            {/* PDF Viewer - Vertically Scrollable with Zoom */}
            <div 
              className="bg-card border border-border rounded-lg overflow-auto" 
              data-testid="pdf-viewer"
            >
              <div className="p-2 sm:p-4 bg-muted/30">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={
                    <div className="text-center p-8">
                      <p className="text-muted-foreground">Loading PDF...</p>
                    </div>
                  }
                  error={
                    <div className="text-center p-8">
                      <Alert className="border-destructive/50 bg-destructive/10 inline-block">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <AlertDescription className="text-destructive">
                          Failed to load PDF. Please try uploading it again in Admin Settings.
                        </AlertDescription>
                      </Alert>
                    </div>
                  }
                  className="w-full"
                >
                  {numPages && (
                    <div className="space-y-4">
                      {Array.from(new Array(numPages), (_, index) => (
                        <div key={`page_${index + 1}`}>
                          <Page
                            pageNumber={index + 1}
                            width={Math.min(window.innerWidth - 48, 1200) * scale}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Document>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
