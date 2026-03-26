import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  BookOpen,
  X,
  List,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MobileNav from "@/components/mobile-nav";
import redlogo from "@assets/redlogo.webp";
import type { SalesbookBookmark } from "@shared/schema";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const PDF_URL = "/assets/Chandler_Sales_Book_1766587153181.pdf";

export default function PriceBook() {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [pdfLoading, setPdfLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const { data: bookmarks = [] } = useQuery<SalesbookBookmark[]>({
    queryKey: ["/api/salesbook/bookmarks"],
  });

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setContainerWidth(w > 0 ? w : 800);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setPdfLoading(false);
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      const p = Math.max(1, Math.min(page, numPages));
      setCurrentPage(p);
      setPageInput(String(p));
    },
    [numPages]
  );

  const handlePageInputSubmit = () => {
    const p = parseInt(pageInput, 10);
    if (!isNaN(p)) goToPage(p);
  };

  const toggleFullscreen = async () => {
    if (!viewerRef.current) return;
    if (!document.fullscreenElement) {
      await viewerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToPage(currentPage - 1);
      } else if (e.key === "+" || e.key === "=") {
        zoomIn();
      } else if (e.key === "-") {
        zoomOut();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, goToPage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          if (dx < 0) goToPage(currentPage + 1);
          else goToPage(currentPage - 1);
        }
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [currentPage, goToPage]);

  const pageWidth = Math.min(containerWidth - 32, 900) * scale;

  return (
    <div
      ref={viewerRef}
      className="h-screen flex flex-col bg-neutral-900 text-white overflow-hidden"
    >
      <header className="flex-shrink-0 bg-neutral-800 border-b border-neutral-700 shadow-sm">
        <div className="flex items-center justify-between p-2 sm:p-3">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <MobileNav />
            <img
              src={redlogo}
              alt="Giesbrecht HVAC"
              className="h-7 sm:h-9 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <span className="text-sm sm:text-base font-semibold truncate hidden sm:inline">
              Sales Pricebook
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowBookmarks(!showBookmarks)}
              className="text-white hover:bg-neutral-700 h-8 w-8"
              title="Table of Contents"
              data-testid="button-bookmarks"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={zoomOut}
              className="text-white hover:bg-neutral-700 h-8 w-8"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-neutral-400 w-10 text-center hidden sm:block">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={zoomIn}
              className="text-white hover:bg-neutral-700 h-8 w-8"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="text-white hover:bg-neutral-700 h-8 w-8"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (window.location.href = "/admin")}
              className="text-white hover:bg-neutral-700 h-8 w-8"
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {showBookmarks && (
          <div className="w-64 bg-neutral-800 border-r border-neutral-700 flex flex-col flex-shrink-0 absolute sm:relative z-20 h-full">
            <div className="flex items-center justify-between p-3 border-b border-neutral-700">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold">Contents</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowBookmarks(false)}
                className="text-neutral-400 hover:text-white hover:bg-neutral-700 h-6 w-6"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {bookmarks.length === 0 ? (
                <p className="text-xs text-neutral-500 p-2">
                  No bookmarks yet. Add them from CRM Settings.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {bookmarks.map((bm) => (
                    <li key={bm.id}>
                      <button
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          currentPage === bm.pageNumber
                            ? "bg-amber-600/20 text-amber-400"
                            : "text-neutral-300 hover:bg-neutral-700 hover:text-white"
                        }`}
                        onClick={() => {
                          goToPage(bm.pageNumber);
                          if (window.innerWidth < 640) setShowBookmarks(false);
                        }}
                      >
                        <span className="block truncate">{bm.label}</span>
                        <span className="text-xs text-neutral-500">
                          Page {bm.pageNumber}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-auto flex justify-center items-start"
          onClick={(e) => {
            if (showBookmarks && window.innerWidth < 640) setShowBookmarks(false);
          }}
        >
          {pdfLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm text-neutral-400">Loading salesbook...</p>
            </div>
          )}
          <Document
            file={PDF_URL}
            onLoadSuccess={onDocumentLoadSuccess}
            loading=""
            className="py-4"
          >
            <Page
              pageNumber={currentPage}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={
                <div className="flex items-center justify-center" style={{ width: pageWidth, height: pageWidth * 1.4 }}>
                  <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                </div>
              }
            />
          </Document>
        </div>
      </div>

      <footer className="flex-shrink-0 bg-neutral-800 border-t border-neutral-700 px-3 py-2">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="text-white hover:bg-neutral-700 h-8 w-8 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-neutral-400">Page</span>
            <Input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageInputSubmit}
              onKeyDown={(e) => e.key === "Enter" && handlePageInputSubmit()}
              className="w-12 h-7 text-center bg-neutral-700 border-neutral-600 text-white text-sm p-0"
            />
            <span className="text-neutral-400">of {numPages || "..."}</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="text-white hover:bg-neutral-700 h-8 w-8 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
