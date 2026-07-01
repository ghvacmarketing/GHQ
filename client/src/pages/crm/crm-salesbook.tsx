import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize,
  Loader2, Download, List, X,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDF_URL = "/assets/GHVAC-Sales-Pricebook-2026.pdf";
const PDF_FILENAME = "GHVAC-Sales-Pricebook-2026.pdf";

// Section map for the 2026 pricebook (the PDF has no embedded outline and its
// pages are flattened images, so section starts are pinned to the divider pages).
type Section = { key: string; label: string; short: string; page: number };
const SECTIONS: Section[] = [
  { key: "intro",  label: "Introduction",       short: "Intro",     page: 1 },
  { key: "gefa",   label: "GEFA Rebates",        short: "GEFA",      page: 13 },
  { key: "sga",    label: "Split Gas Air",       short: "SGA",       page: 17 },
  { key: "shp",    label: "Split Heat Pump",     short: "SHP",       page: 42 },
  { key: "gp",     label: "Gas Package",         short: "GP",        page: 67 },
  { key: "php",    label: "Packaged Heat Pump",  short: "PHP",       page: 75 },
  { key: "mini",   label: "Mini-Split",          short: "Mini",      page: 83 },
  { key: "duct",   label: "Duct System",         short: "Duct",      page: 85 },
  { key: "water",  label: "Water Heaters",       short: "Water",     page: 87 },
  { key: "elite",  label: "Elite Package",       short: "Elite",     page: 89 },
  { key: "crawl",  label: "Crawlspace",          short: "Crawl",     page: 93 },
];

export default function CrmSalesbook() {
  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/crm/auth/me"] });

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1); // 1-based
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [size, setSize] = useState({ w: 900, h: 640 });

  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) => {
        const w = Math.round(r.width), h = Math.round(r.height);
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Collapse the TOC by default on small screens.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 900) setTocOpen(false);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const goTo = useCallback((p: number) => {
    setPage((prev) => {
      const next = Math.max(1, Math.min(p, numPages || 1));
      setPageInput(String(next));
      if (next !== prev) stageRef.current?.scrollTo({ top: 0 });
      return next;
    });
  }, [numPages]);

  const next = useCallback(() => goTo(page + 1), [goTo, page]);
  const prev = useCallback(() => goTo(page - 1), [goTo, page]);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.2, 3)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.2, 0.5)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, zoomIn, zoomOut]);

  const toggleFullscreen = async () => {
    if (!viewerRef.current) return;
    if (!document.fullscreenElement) await viewerRef.current.requestFullscreen();
    else await document.exitFullscreen();
  };

  const isNarrow = size.w < 720;
  const pageDims = useMemo(() => {
    const pad = 32;
    if (isNarrow) return { width: Math.max(240, (size.w - pad) * zoom) };
    return { height: Math.max(320, (size.h - pad) * zoom) };
  }, [isNarrow, size.w, size.h, zoom]);

  // The active section is the last one whose start page we've reached.
  const activeKey = useMemo(() => {
    let key = SECTIONS[0].key;
    for (const s of SECTIONS) if (page >= s.page) key = s.key;
    return key;
  }, [page]);

  const handleInputSubmit = () => {
    const p = parseInt(pageInput, 10);
    if (!isNaN(p)) goTo(p);
  };

  const jumpToSection = (s: Section) => {
    goTo(s.page);
    if (typeof window !== "undefined" && window.innerWidth < 900) setTocOpen(false);
  };

  return (
    <CrmLayout currentUser={currentUser}>
      <div
        ref={viewerRef}
        className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
        style={{ height: isFullscreen ? "100vh" : "calc(100vh - 96px)" }}
      >
        {/* Toolbar */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost" size="icon"
              onClick={() => setTocOpen((v) => !v)}
              className={cn("h-8 w-8", tocOpen && "bg-muted text-primary")}
              title="Table of contents"
              data-testid="button-toc-toggle"
            >
              <List className="h-4 w-4" />
            </Button>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-foreground">Sales Pricebook</p>
              <p className="text-[11px] text-muted-foreground">2026 edition</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={zoomOut} disabled={zoom <= 0.5} className="h-8 w-8" title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={zoomIn} disabled={zoom >= 3} className="h-8 w-8" title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <a href={PDF_URL} download={PDF_FILENAME} title="Download PDF">
              <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
            </a>
            <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="h-8 w-8" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5 scrollbar-hide">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => jumpToSection(s)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeKey === s.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              data-testid={`tab-${s.key}`}
            >
              {s.short}
            </button>
          ))}
        </div>

        {/* Body: TOC + stage */}
        <div className="flex min-h-0 flex-1">
          {tocOpen && (
            <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-muted/30">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contents</span>
                <button onClick={() => setTocOpen(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground lg:hidden">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-2 pb-3">
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => jumpToSection(s)}
                    className={cn(
                      "group flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      activeKey === s.key
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-muted"
                    )}
                    data-testid={`toc-${s.key}`}
                  >
                    <span className="truncate">{s.label}</span>
                    <span className={cn("text-[11px] tabular-nums", activeKey === s.key ? "text-primary" : "text-muted-foreground")}>
                      {s.page}
                    </span>
                  </button>
                ))}
              </nav>
            </aside>
          )}

          {/* Stage */}
          <div ref={stageRef} className="relative flex flex-1 items-center justify-center overflow-auto bg-neutral-200 dark:bg-neutral-900">
            {loadError ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm text-muted-foreground">Could not load the salesbook PDF.</p>
                <a href={PDF_URL} download={PDF_FILENAME}>
                  <Button variant="outline" size="sm" className="mt-1"><Download className="mr-1.5 h-3.5 w-3.5" /> Download instead</Button>
                </a>
              </div>
            ) : (
              <Document
                file={PDF_URL}
                onLoadSuccess={({ numPages }) => { setNumPages(numPages); setLoadError(false); }}
                onLoadError={() => setLoadError(true)}
                loading={<div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading salesbook…</p></div>}
                error={<p className="text-sm text-muted-foreground">Could not load the salesbook PDF.</p>}
              >
                <Page
                  pageNumber={page}
                  width={pageDims.width}
                  height={pageDims.height}
                  devicePixelRatio={Math.max(2, typeof window !== "undefined" ? window.devicePixelRatio : 1)}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="my-4 shadow-xl [&>canvas]:rounded-sm"
                  loading={null}
                />
              </Document>
            )}
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex flex-shrink-0 items-center justify-center gap-3 border-t border-border px-3 py-2">
          <Button variant="ghost" size="icon" onClick={prev} disabled={page <= 1} className="h-8 w-8 disabled:opacity-30" title="Previous page">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Page</span>
            <Input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handleInputSubmit}
              onKeyDown={(e) => e.key === "Enter" && handleInputSubmit()}
              className="h-7 w-12 p-0 text-center text-sm"
            />
            <span className="text-muted-foreground">of {numPages || "…"}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={next} disabled={numPages > 0 && page >= numPages} className="h-8 w-8 disabled:opacity-30" title="Next page">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </CrmLayout>
  );
}
