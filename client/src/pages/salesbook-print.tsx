import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PricebookPackage, CrawlspaceTier } from "@shared/schema";
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

const PAGE_W = 618;
const PAGE_H = 800;

function renderSection(section: SalesbookSection) {
  switch (section.type) {
    case "static":
      return <StaticPageImage src={section.staticSrc!} pageNum={section.pageIndex + 1} />;
    case "category-divider":
      return (
        <CategoryDividerPage
          unitType={section.unitType!}
          tierCount={section.tierCount || 0}
          packageCount={section.packages?.length || 0}
          heroImageUrl={section.heroImageUrl}
        />
      );
    case "tier-header":
      return (
        <TierHeaderPage
          unitType={section.unitType!}
          tier={section.tier!}
          packages={section.packages || []}
        />
      );
    case "product-detail":
      return (
        <ProductDetailPage
          unitType={section.unitType!}
          tier={section.tier!}
          tonnage={section.tonnage!}
          packages={section.packages || []}
        />
      );
    case "ducting-detail":
      return <SingleTierDetailPage unitType={section.unitType!} packages={section.packages || []} />;
    case "elite-divider":
      return <EliteDividerPage />;
    case "elite-bundles":
      return <EliteBundlesPage bundles={section.eliteCoreBundles || []} />;
    case "elite-discount":
      return <EliteDiscountPage />;
    case "elite-airflow":
      return <EliteAirflowPage options={section.eliteAirflowOptions || []} />;
    case "crawlspace-divider":
      return <CrawlspaceDividerPage />;
    case "crawlspace-tiers":
      return <CrawlspaceTiersPage tiers={section.crawlspaceTiers || []} />;
    case "crawlspace-example":
      return <CrawlspaceExamplePage />;
    case "crawlspace-elite":
      return <CrawlspaceElitePage />;
    case "crawlspace-elite-example":
      return <CrawlspaceEliteExamplePage />;
    default:
      return null;
  }
}

export default function SalesbookPrint() {
  const [ready, setReady] = useState(false);

  const { data: salesbookData } = useQuery<SalesbookData>({
    queryKey: ["/api/salesbook/data"],
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

  useEffect(() => {
    if (sections.length === 0) return;
    let cancelled = false;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 300));
      const imgs = Array.from(document.querySelectorAll("img"));
      imgs.forEach((img) => {
        img.loading = "eager";
        if (!img.complete || img.naturalWidth === 0) {
          const src = img.src;
          if (src) {
            img.src = "";
            img.src = src;
          }
        }
      });
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>((res) => {
                const t = setTimeout(() => res(), 8000);
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
      await new Promise((r) => setTimeout(r, 200));
      if (!cancelled) setReady(true);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [sections]);

  return (
    <div id="sb-print-root" data-print-ready={ready ? "1" : "0"}>
      <style>{`
        @page { size: ${PAGE_W}px ${PAGE_H}px; margin: 0; }
        html, body { margin: 0; padding: 0; background: #ffffff; }
        #sb-print-root { background: #ffffff; }
        .sb-print-page {
          width: ${PAGE_W}px;
          height: ${PAGE_H}px;
          overflow: hidden;
          position: relative;
          background: #ffffff;
          break-after: page;
          page-break-after: always;
        }
        .sb-print-page:last-child { break-after: auto; page-break-after: auto; }
      `}</style>
      {sections.map((section) => (
        <div className="sb-print-page" key={section.pageIndex}>
          {renderSection(section)}
        </div>
      ))}
    </div>
  );
}
