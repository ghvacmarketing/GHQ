import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Settings } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchDistance = useRef<number>(0);

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

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(prev => Math.min(Math.max(0.5, prev + delta), 3.0));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Touch pinch-to-zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getTouchDistance = (touches: TouchList) => {
      const touch1 = touches[0];
      const touch2 = touches[1];
      return Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastTouchDistance.current = getTouchDistance(e.touches);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const distance = getTouchDistance(e.touches);
        const delta = (distance - lastTouchDistance.current) / 100;
        setScale(prev => Math.min(Math.max(0.5, prev + delta), 3.0));
        lastTouchDistance.current = distance;
      }
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

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
                No price book uploaded. Please upload a PDF file in the{" "}
                <a href="/admin" className="underline font-medium">Admin Settings</a>.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="w-full">
            {/* Zoom indicator */}
            <div className="mb-2 text-center">
              <span className="text-sm text-muted-foreground">
                {Math.round(scale * 100)}% • Ctrl+Scroll or Pinch to Zoom
              </span>
            </div>
            
            {/* PDF Viewer - Vertically Scrollable with Zoom */}
            <div 
              ref={containerRef}
              className="bg-card border border-border rounded-lg overflow-auto" 
              data-testid="pdf-viewer"
              style={{ touchAction: 'pan-x pan-y' }}
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
