import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { useQuery } from "@tanstack/react-query";
import type { Setting } from "@shared/schema";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PriceBook() {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  const { data: settings } = useQuery<Setting[]>({
    queryKey: ['/api/app-settings'],
  });

  const pdfUrl = settings?.find(s => s.key === 'price_book_pdf_url')?.value;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  function changePage(offset: number) {
    setPageNumber(prevPageNumber => Math.min(Math.max(1, prevPageNumber + offset), numPages || 1));
  }

  function changeScale(delta: number) {
    setScale(prevScale => Math.min(Math.max(0.5, prevScale + delta), 3.0));
  }

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
                ]}
              />
              <p className="text-xs text-muted-foreground hidden sm:block">Pricing & Parts Catalog</p>
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
                No price book configured. Please add a PDF URL in the{" "}
                <a href="/admin" className="underline font-medium">Admin Settings</a>.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            {/* PDF Controls */}
            <div className="flex items-center justify-between mb-4 p-3 bg-card border border-border rounded-lg" data-testid="pdf-controls">
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changePage(-1)}
                  disabled={pageNumber <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium" data-testid="text-page-info">
                  Page {pageNumber} of {numPages || '?'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changePage(1)}
                  disabled={pageNumber >= (numPages || 1)}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changeScale(-0.1)}
                  disabled={scale <= 0.5}
                  data-testid="button-zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium" data-testid="text-zoom-level">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changeScale(0.1)}
                  disabled={scale >= 3.0}
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* PDF Viewer */}
            <div className="bg-card border border-border rounded-lg overflow-hidden" data-testid="pdf-viewer">
              <div className="flex justify-center p-4 bg-muted/30">
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
                          Failed to load PDF. Please check the URL in Admin Settings.
                        </AlertDescription>
                      </Alert>
                    </div>
                  }
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                  />
                </Document>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
