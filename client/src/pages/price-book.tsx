import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import HTMLFlipBook from "react-pageflip";

interface FlipBookRef {
  pageFlip(): {
    flip(page: number): void;
    flipNext(): void;
    flipPrev(): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
  } | null;
}

import {
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
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import redlogo from "@assets/redlogo.webp";
import type { PricebookPackage, CrawlspaceTier, SalesbookBookmark } from "@shared/schema";
import {
  StaticPageImage,
  CategoryDividerPage,
  TierHeaderPage,
  ProductDetailPage,
  SingleTierDetailPage,
  EliteDividerPage,
  EliteBundlesPage,
  EliteDiscountPage,
  EliteAirflowPage,
  CrawlspaceDividerPage,
  CrawlspaceTiersPage,
  CrawlspaceExamplePage,
  CrawlspaceElitePage,
  CrawlspaceEliteExamplePage,
  buildSalesbookSections,
  getSalesbookTOC,
  type SalesbookSection,
  type EliteBundle,
  type EliteAirflowOption,
} from "@/components/salesbook-pages";

interface SalesbookData {
  staticPages: string[];
  pageWidth: number;
  pageHeight: number;
  packages: PricebookPackage[];
  crawlspaceTiers: CrawlspaceTier[];
  eliteCoreBundles: EliteBundle[];
  eliteAirflowOptions: EliteAirflowOption[];
}

export default function PriceBook() {
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const flipBookRef = useRef<FlipBookRef>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const { data: salesbookData, isLoading } = useQuery<SalesbookData>({
    queryKey: ["/api/salesbook/data"],
  });

  const { data: bookmarks = [] } = useQuery<SalesbookBookmark[]>({
    queryKey: ["/api/salesbook/bookmarks"],
  });

  const sections = useMemo(() => {
    if (!salesbookData) return [];
    return buildSalesbookSections(
      salesbookData.staticPages,
      salesbookData.packages,
      salesbookData.crawlspaceTiers,
      salesbookData.eliteCoreBundles,
      salesbookData.eliteAirflowOptions,
    );
  }, [salesbookData]);

  const toc = useMemo(() => {
    if (bookmarks.length > 0) {
      return bookmarks
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((b) => ({ label: b.label, page: b.pageNumber }));
    }
    return getSalesbookTOC(sections);
  }, [bookmarks, sections]);
  const totalPages = sections.length;

  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          setContainerSize({ w: rect.width, h: rect.height });
          setLayoutReady(true);
        }
      }
    };
    const retryInterval = setInterval(updateSize, 100);
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      clearInterval(retryInterval);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const onFlip = useCallback((e: { data: number }) => {
    const page = e.data;
    setCurrentPage(page);
    setPageInput(String(page + 1));
  }, []);

  const goToPage = useCallback(
    (pageNum: number) => {
      if (totalPages === 0) return;
      const p = Math.max(0, Math.min(pageNum, totalPages - 1));
      if (flipBookRef.current) {
        flipBookRef.current.pageFlip()?.flip(p);
      }
      setCurrentPage(p);
      setPageInput(String(p + 1));
    },
    [totalPages]
  );

  const handlePageInputSubmit = () => {
    const p = parseInt(pageInput, 10);
    if (!isNaN(p)) goToPage(p - 1);
  };

  const toggleFullscreen = async () => {
    if (!viewerRef.current) return;
    if (!document.fullscreenElement) {
      await viewerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.2, 2.5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.2, 0.5));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        flipBookRef.current?.pageFlip()?.flipNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        flipBookRef.current?.pageFlip()?.flipPrev();
      } else if (e.key === "+" || e.key === "=") {
        zoomIn();
      } else if (e.key === "-") {
        zoomOut();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let initialDistance = 0;
    let initialScale = 1;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.hypot(dx, dy);
        initialScale = scale;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistance > 0) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.hypot(dx, dy);
        const newScale = Math.max(0.5, Math.min(2.5, initialScale * (currentDistance / initialDistance)));
        setScale(newScale);
      }
    };
    const onTouchEnd = () => {
      initialDistance = 0;
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [scale]);

  const isMobile = containerSize.w < 640;
  const bookPanelWidth = showBookmarks && !isMobile ? 256 : 0;
  const availWidth = Math.max(containerSize.w - bookPanelWidth - 32, 200);
  const availHeight = containerSize.h - 16;

  const aspectRatio = salesbookData ? salesbookData.pageHeight / salesbookData.pageWidth : 1.294;
  let pageW: number;
  let pageH: number;

  if (isMobile) {
    pageW = Math.min(availWidth - 8, 500);
    pageH = pageW * aspectRatio;
    if (pageH > availHeight - 8) {
      pageH = availHeight - 8;
      pageW = pageH / aspectRatio;
    }
  } else {
    pageH = Math.min(availHeight - 8, 800);
    pageW = pageH / aspectRatio;
    if (pageW * 2 > availWidth) {
      pageW = (availWidth) / 2;
      pageH = pageW * aspectRatio;
    }
  }

  pageW = Math.max(Math.floor(pageW), 200);
  pageH = Math.max(Math.floor(pageH), 260);

  const exportH = 800;
  const exportW = Math.round(exportH / aspectRatio);

  const handleDownloadPdf = useCallback(async () => {
    if (sections.length === 0 || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      // Give React a moment to mount the off-screen export container.
      await new Promise((r) => setTimeout(r, 200));
      const container = exportRef.current;
      if (!container) throw new Error("Export container not ready");

      // Force any lazy-loaded images (which sit off-screen) to load before capture.
      const imgs = Array.from(container.querySelectorAll("img"));
      imgs.forEach((img) => {
        img.loading = "eager";
        if (!img.complete || img.naturalWidth === 0) {
          const src = img.src;
          img.src = "";
          img.src = src;
        }
      });
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>((res) => {
                const t = setTimeout(() => res(), 5000);
                img.onload = () => {
                  clearTimeout(t);
                  res();
                };
                img.onerror = () => {
                  clearTimeout(t);
                  res();
                };
              }),
        ),
      );

      const pageEls = Array.from(
        container.querySelectorAll<HTMLElement>(".export-page"),
      );
      const ratio = salesbookData
        ? salesbookData.pageHeight / salesbookData.pageWidth
        : 1.294;
      const pdfW = 612;
      const pdfH = Math.round(pdfW * ratio);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: [pdfW, pdfH],
      });

      for (let i = 0; i < pageEls.length; i++) {
        const canvas = await html2canvas(pageEls[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        if (i > 0) pdf.addPage([pdfW, pdfH], "portrait");
        pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
        setExportProgress(Math.round(((i + 1) / pageEls.length) * 100));
      }

      pdf.save("GHVAC-Sales-Pricebook-2026.pdf");
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Sorry, the PDF could not be generated. Please try again.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [sections, isExporting, salesbookData]);

  const renderSection = (section: SalesbookSection) => {
    switch (section.type) {
      case "static":
        return <StaticPageImage key={section.pageIndex} src={section.staticSrc!} pageNum={section.pageIndex + 1} />;
      case "category-divider":
        return (
          <CategoryDividerPage
            key={section.pageIndex}
            unitType={section.unitType!}
            tierCount={section.tierCount || 0}
            packageCount={section.packages?.length || 0}
            heroImageUrl={section.heroImageUrl}
          />
        );
      case "tier-header":
        return (
          <TierHeaderPage
            key={section.pageIndex}
            unitType={section.unitType!}
            tier={section.tier!}
            packages={section.packages || []}
          />
        );
      case "product-detail":
        return (
          <ProductDetailPage
            key={section.pageIndex}
            unitType={section.unitType!}
            tier={section.tier!}
            tonnage={section.tonnage!}
            packages={section.packages || []}
          />
        );
      case "ducting-detail":
        return (
          <SingleTierDetailPage
            key={section.pageIndex}
            unitType={section.unitType!}
            packages={section.packages || []}
          />
        );
      case "elite-divider":
        return <EliteDividerPage key={section.pageIndex} />;
      case "elite-bundles":
        return <EliteBundlesPage key={section.pageIndex} bundles={section.eliteCoreBundles || []} />;
      case "elite-discount":
        return <EliteDiscountPage key={section.pageIndex} />;
      case "elite-airflow":
        return <EliteAirflowPage key={section.pageIndex} options={section.eliteAirflowOptions || []} />;
      case "crawlspace-divider":
        return <CrawlspaceDividerPage key={section.pageIndex} />;
      case "crawlspace-tiers":
        return <CrawlspaceTiersPage key={section.pageIndex} tiers={section.crawlspaceTiers || []} />;
      case "crawlspace-example":
        return <CrawlspaceExamplePage key={section.pageIndex} />;
      case "crawlspace-elite":
        return <CrawlspaceElitePage key={section.pageIndex} />;
      case "crawlspace-elite-example":
        return <CrawlspaceEliteExamplePage key={section.pageIndex} />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={viewerRef}
      className="h-screen flex flex-col bg-neutral-900 text-white overflow-hidden"
    >
      <header className="flex-shrink-0 bg-neutral-800 border-b border-neutral-700 shadow-sm">
        <div className="flex items-center justify-between p-2 sm:p-3">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <img
              src={redlogo}
              alt="Giesbrecht HVAC"
              className="h-7 sm:h-9 w-auto object-contain flex-shrink-0"
            />
            <span className="text-sm sm:text-base font-semibold truncate hidden sm:inline">
              2026 Sales Pricebook
            </span>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadPdf}
              disabled={isExporting || sections.length === 0}
              className="text-white hover:bg-neutral-700 h-8 w-8 disabled:opacity-50"
              title="Download PDF"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowBookmarks(!showBookmarks)}
              className="text-white hover:bg-neutral-700 h-8 w-8"
              title="Table of Contents"
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
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {isExporting && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-neutral-900/85">
            <Loader2 className="h-9 w-9 animate-spin text-amber-400" />
            <p className="text-sm text-neutral-100">
              Generating PDF… {exportProgress}%
            </p>
            <p className="text-xs text-neutral-400">This may take a moment.</p>
          </div>
        )}
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
              {toc.length === 0 ? (
                <p className="text-xs text-neutral-500 p-2">Loading contents...</p>
              ) : (
                <ul className="space-y-0.5">
                  <li>
                    <button
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        currentPage < (toc.length > 0 ? toc[0].page - 1 : 12)
                          ? "bg-amber-600/20 text-amber-400"
                          : "text-neutral-300 hover:bg-neutral-700 hover:text-white"
                      }`}
                      onClick={() => {
                        goToPage(0);
                        if (isMobile) setShowBookmarks(false);
                      }}
                    >
                      <span className="block truncate">Introduction</span>
                      <span className="text-xs text-neutral-500">Page 1</span>
                    </button>
                  </li>
                  {toc.map((entry, idx) => (
                    <li key={idx}>
                      <button
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          currentPage + 1 >= entry.page &&
                          (idx === toc.length - 1 || currentPage + 1 < toc[idx + 1].page)
                            ? "bg-amber-600/20 text-amber-400"
                            : "text-neutral-300 hover:bg-neutral-700 hover:text-white"
                        }`}
                        onClick={() => {
                          goToPage(entry.page - 1);
                          if (isMobile) setShowBookmarks(false);
                        }}
                      >
                        <span className="block truncate">{entry.label}</span>
                        <span className="text-xs text-neutral-500">Page {entry.page}</span>
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
          className="flex-1 overflow-auto flex justify-center items-center"
        >
          {isLoading || !layoutReady ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm text-neutral-400">Loading salesbook...</p>
            </div>
          ) : sections.length > 0 ? (
            <div style={{
              transform: `scale(${scale})${!isMobile && (currentPage === 0 || currentPage >= totalPages - 1) ? ` translateX(${currentPage === 0 ? `-${Math.floor(pageW / 2)}px` : `${Math.floor(pageW / 2)}px`})` : ''}`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out',
            }}>
              <HTMLFlipBook
                key={`${pageW}-${pageH}`}
                ref={flipBookRef}
                style={{}}
                width={pageW}
                height={pageH}
                size="fixed"
                minWidth={200}
                maxWidth={1200}
                minHeight={260}
                maxHeight={1600}
                showCover={true}
                mobileScrollSupport={false}
                onFlip={onFlip}
                className="flipbook-container"
                startPage={0}
                drawShadow={true}
                flippingTime={400}
                usePortrait={isMobile}
                startZIndex={0}
                autoSize={false}
                maxShadowOpacity={0.3}
                showPageCorners={true}
                disableFlipByClick={true}
                swipeDistance={50}
                clickEventForward={false}
                useMouseEvents={true}
                renderOnlyPageLengthChange={false}
              >
                {sections.map(renderSection)}
              </HTMLFlipBook>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <BookOpen className="h-8 w-8 text-neutral-500" />
              <p className="text-sm text-neutral-400">No salesbook pages available</p>
            </div>
          )}
        </div>
      </div>

      {isExporting && (
        <div
          ref={exportRef}
          aria-hidden="true"
          style={{
            position: "fixed",
            left: -99999,
            top: 0,
            zIndex: -1,
            pointerEvents: "none",
          }}
        >
          {sections.map((section) => (
            <div
              key={`export-${section.pageIndex}`}
              className="export-page"
              style={{
                width: exportW,
                height: exportH,
                overflow: "hidden",
                background: "#ffffff",
              }}
            >
              {renderSection(section)}
            </div>
          ))}
        </div>
      )}

      <footer className="flex-shrink-0 bg-neutral-800 border-t border-neutral-700 px-3 py-2">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => flipBookRef.current?.pageFlip()?.flipPrev()}
            disabled={currentPage <= 0}
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
            <span className="text-neutral-400">of {totalPages || "..."}</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => flipBookRef.current?.pageFlip()?.flipNext()}
            disabled={totalPages > 0 ? currentPage >= totalPages - 1 : true}
            className="text-white hover:bg-neutral-700 h-8 w-8 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
