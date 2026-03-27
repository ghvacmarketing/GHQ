import { forwardRef } from "react";
import type { PricebookPackage, CrawlspaceTier } from "@shared/schema";

const BRAND_COLOR = "#711419";
const BRAND_COLOR_LIGHT = "#8a1a20";

interface PageProps {
  children?: React.ReactNode;
}

const PageWrapper = forwardRef<HTMLDivElement, PageProps>(({ children }, ref) => (
  <div ref={ref} className="page-content" style={{ width: "100%", height: "100%", overflow: "hidden" }}>
    <div style={{
      width: "100%",
      height: "100%",
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      position: "relative",
    }}>
      {children}
    </div>
  </div>
));
PageWrapper.displayName = "PageWrapper";

export const StaticPageImage = forwardRef<HTMLDivElement, { src: string; pageNum: number }>(
  ({ src, pageNum }, ref) => (
    <div ref={ref} className="page-content" style={{ background: "#ffffff" }}>
      <img
        src={src}
        alt={`Page ${pageNum}`}
        style={{ width: "100%", height: "100%", objectFit: "contain", background: "#ffffff" }}
        loading="eager"
      />
    </div>
  )
);
StaticPageImage.displayName = "StaticPageImage";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

function formatCentsMonthly(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

const UNIT_TYPE_DISPLAY: Record<string, { name: string; tagline: string }> = {
  SGA: { name: "Split Gas Air", tagline: "Reliable heating & cooling for year-round comfort" },
  SHP: { name: "Split Heat Pump", tagline: "All-electric efficiency with smart climate control" },
  STA: { name: "Dual Fuel System", tagline: "Heat pump + gas furnace for maximum efficiency" },
  GP: { name: "Gas Package Unit", tagline: "All-in-one gas/electric packaged solution" },
  PHP: { name: "Package Heat Pump", tagline: "All-in-one packaged heat pump unit" },
  "Mini-Split": { name: "Mini-Split", tagline: "Ductless single-zone heating & cooling" },
  Ducting: { name: "Duct System", tagline: "Complete duct system replacement" },
};

const TIER_DISPLAY: Record<string, string> = {
  Essential: "Standard efficiency, reliable performance",
  Premium: "High efficiency, enhanced comfort features",
  Ultimate: "Top-tier efficiency, maximum comfort",
  Packaged: "All-in-one packaged unit solution",
  Standard: "Single-zone ductless system",
};

const LEVEL_COLORS: Record<string, string> = {
  Best: "#1a6b3c",
  Better: "#1a5a8a",
  Good: "#6b5a1a",
  Budget: "#5a5a5a",
};

export const CategoryDividerPage = forwardRef<HTMLDivElement, {
  unitType: string;
  tierCount: number;
  packageCount: number;
  heroImageUrl?: string;
}>(({ unitType, tierCount, packageCount, heroImageUrl }, ref) => {
  const info = UNIT_TYPE_DISPLAY[unitType] || { name: unitType, tagline: "" };
  return (
    <PageWrapper ref={ref}>
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: `linear-gradient(160deg, ${BRAND_COLOR} 0%, #1a1a1a 60%, #0d0d0d 100%)`,
        padding: "8% 10%",
        textAlign: "center",
      }}>
        {heroImageUrl && (
          <div style={{
            width: 120,
            height: 120,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 24,
            background: "rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <img
              src={heroImageUrl.startsWith("/") ? heroImageUrl : `/assets/${heroImageUrl}`}
              alt={info.name}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              loading="lazy"
            />
          </div>
        )}
        <div style={{
          width: 80,
          height: 3,
          background: "rgba(255,255,255,0.3)",
          marginBottom: 24,
        }} />
        <h1 style={{
          color: "#ffffff",
          fontSize: "clamp(24px, 4vw, 42px)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          marginBottom: 16,
        }}>
          {info.name}
        </h1>
        <p style={{
          color: "rgba(255,255,255,0.65)",
          fontSize: "clamp(12px, 1.8vw, 16px)",
          fontWeight: 400,
          lineHeight: 1.5,
          maxWidth: "80%",
          marginBottom: 32,
        }}>
          {info.tagline}
        </p>
        <div style={{
          display: "flex",
          gap: 32,
          color: "rgba(255,255,255,0.5)",
          fontSize: "clamp(10px, 1.4vw, 13px)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          <span>{tierCount} {tierCount === 1 ? "Tier" : "Tiers"}</span>
          <span>•</span>
          <span>{packageCount} {packageCount === 1 ? "Package" : "Packages"}</span>
        </div>
        <div style={{
          width: 80,
          height: 3,
          background: "rgba(255,255,255,0.3)",
          marginTop: 24,
        }} />
      </div>
      <div style={{
        height: 4,
        background: BRAND_COLOR,
      }} />
    </PageWrapper>
  );
});
CategoryDividerPage.displayName = "CategoryDividerPage";

export const TierHeaderPage = forwardRef<HTMLDivElement, {
  unitType: string;
  tier: string;
  packages: PricebookPackage[];
}>(({ unitType, tier, packages }, ref) => {
  const unitInfo = UNIT_TYPE_DISPLAY[unitType] || { name: unitType };
  const tierDesc = TIER_DISPLAY[tier] || "";
  const tonnages = Array.from(new Set(packages.map(p => p.tonnage))).sort((a, b) => parseFloat(a) - parseFloat(b));
  const levels = Array.from(new Set(packages.map(p => p.packageLevel)));
  const sortedLevels = ["Best", "Better", "Good", "Budget"].filter(l => levels.includes(l));

  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: BRAND_COLOR,
        padding: "20px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {unitInfo.name}
          </div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700 }}>{tier}</div>
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, textAlign: "right" }}>
          {tierDesc}
        </div>
      </div>

      <div style={{ flex: 1, padding: "16px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Available Configurations
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {sortedLevels.map(level => (
              <span key={level} style={{
                padding: "4px 12px",
                borderRadius: 4,
                background: `${LEVEL_COLORS[level] || "#555"}18`,
                color: LEVEL_COLORS[level] || "#555",
                fontSize: 12,
                fontWeight: 600,
              }}>
                {level}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tonnages.map(t => (
              <span key={t} style={{
                padding: "3px 10px",
                borderRadius: 4,
                background: "#f3f4f6",
                color: "#555",
                fontSize: 11,
              }}>
                {t} Ton
              </span>
            ))}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", color: "#888", fontWeight: 600 }}>Tonnage</th>
              {sortedLevels.map(l => (
                <th key={l} style={{ textAlign: "center", padding: "6px 4px", color: LEVEL_COLORS[l] || "#555", fontWeight: 600 }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tonnages.map(t => {
              const row = sortedLevels.map(l => packages.find(p => p.tonnage === t && p.packageLevel === l));
              return (
                <tr key={t} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600, color: "#333" }}>{t} Ton</td>
                  {row.map((pkg, i) => (
                    <td key={i} style={{ textAlign: "center", padding: "5px 4px" }}>
                      {pkg ? (
                        <div>
                          <div style={{ fontWeight: 700, color: "#111", fontSize: 12 }}>
                            {formatCents(pkg.totalInvestment)}
                          </div>
                          <div style={{ color: "#888", fontSize: 10 }}>
                            {formatCentsMonthly(pkg.monthlyPayment)}/mo
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "#ccc" }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ height: 3, background: BRAND_COLOR }} />
    </PageWrapper>
  );
});
TierHeaderPage.displayName = "TierHeaderPage";

export const ProductDetailPage = forwardRef<HTMLDivElement, {
  unitType: string;
  tier: string;
  tonnage: string;
  packages: PricebookPackage[];
}>(({ unitType, tier, tonnage, packages }, ref) => {
  const unitInfo = UNIT_TYPE_DISPLAY[unitType] || { name: unitType };
  const sortedPackages = ["Best", "Better", "Good", "Budget"]
    .map(level => packages.find(p => p.packageLevel === level))
    .filter((p): p is PricebookPackage => !!p);

  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: BRAND_COLOR,
        padding: "10px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>
          {unitInfo.name} — {tier}
        </div>
        <div style={{
          background: "rgba(255,255,255,0.2)",
          borderRadius: 4,
          padding: "3px 12px",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
        }}>
          {tonnage} Ton
        </div>
      </div>

      <div style={{ flex: 1, padding: "10px 16px", overflow: "hidden" }}>
        {sortedPackages.map((pkg, idx) => {
          const hasImages = pkg.outdoorImageUrl || pkg.furnaceImageUrl || pkg.coilImageUrl || pkg.thermostatImageUrl;
          return (
            <div key={pkg.id} style={{
              border: "1px solid #e8e8e8",
              borderRadius: 6,
              marginBottom: idx < sortedPackages.length - 1 ? 8 : 0,
              overflow: "hidden",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                background: `${LEVEL_COLORS[pkg.packageLevel] || "#555"}0d`,
                borderBottom: "1px solid #f0f0f0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: LEVEL_COLORS[pkg.packageLevel] || "#555",
                  }}>
                    {pkg.packageLevel}
                  </span>
                  {pkg.outdoorBrand && (
                    <span style={{ fontSize: 10, color: "#999" }}>{pkg.outdoorBrand}</span>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: BRAND_COLOR }}>
                    {formatCents(pkg.totalInvestment)}
                  </span>
                  <span style={{ fontSize: 10, color: "#888", marginLeft: 6 }}>
                    {formatCentsMonthly(pkg.monthlyPayment)}/mo
                  </span>
                </div>
              </div>

              <div style={{ padding: "6px 12px", display: "flex", gap: 8 }}>
                {hasImages && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {[pkg.outdoorImageUrl, pkg.coilImageUrl, pkg.furnaceImageUrl, pkg.thermostatImageUrl]
                      .filter(Boolean)
                      .map((url, i) => (
                        <img
                          key={i}
                          src={url!.startsWith("/") ? url! : `/assets/${url}`}
                          alt=""
                          style={{
                            width: 44,
                            height: 44,
                            objectFit: "contain",
                            borderRadius: 4,
                            background: "#f9f9f9",
                            border: "1px solid #eee",
                          }}
                          loading="lazy"
                        />
                      ))}
                  </div>
                )}
                <div style={{ flex: 1, fontSize: 9.5, color: "#555", lineHeight: 1.5 }}>
                  {pkg.outdoorName && <div><b style={{ color: "#333" }}>Outdoor:</b> {pkg.outdoorModel || ""} {pkg.outdoorName}</div>}
                  {pkg.coilName && <div><b style={{ color: "#333" }}>Coil:</b> {pkg.coilModel || ""}</div>}
                  {pkg.indoorHeatName && <div><b style={{ color: "#333" }}>Indoor:</b> {pkg.indoorHeatModel || ""} {pkg.indoorHeatName}</div>}
                  {pkg.thermostatName && <div><b style={{ color: "#333" }}>Thermostat:</b> {pkg.thermostatModel || ""}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 3, background: BRAND_COLOR }} />
    </PageWrapper>
  );
});
ProductDetailPage.displayName = "ProductDetailPage";


const SINGLE_TIER_CONFIG: Record<string, { title: string; subtitle: string; description: string }> = {
  Ducting: {
    title: "Select Duct System Size",
    subtitle: "Choose your system size based on your home's tonnage",
    description: "Complete duct system replacement includes removal of existing ducts, new ductwork installation, and system balancing with a 10-year workmanship guarantee.",
  },
  "Mini-Split": {
    title: "Select Mini-Split Size",
    subtitle: "Choose the right BTU capacity for your space",
    description: "Single-zone ductless mini-split system includes outdoor condenser, indoor wall-mount unit, line set, and professional installation with a 10-year workmanship guarantee.",
  },
};

export const SingleTierDetailPage = forwardRef<HTMLDivElement, {
  unitType: string;
  packages: PricebookPackage[];
}>(({ unitType, packages }, ref) => {
  const config = SINGLE_TIER_CONFIG[unitType] || {
    title: `Select ${UNIT_TYPE_DISPLAY[unitType]?.name || unitType} Size`,
    subtitle: "Choose the right size for your needs",
    description: "",
  };

  const sorted = [...packages].sort((a, b) => {
    const aNum = parseFloat(a.packageLevel.replace(/[^\d.]/g, "")) || 0;
    const bNum = parseFloat(b.packageLevel.replace(/[^\d.]/g, "")) || 0;
    return aNum - bNum;
  });

  return (
    <PageWrapper ref={ref}>
      <div style={{ padding: "20px 24px 8px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
          {config.title}
        </div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
          {config.subtitle}
        </div>
      </div>

      {config.description && (
        <div style={{
          margin: "8px 20px",
          padding: "8px 14px",
          background: "#faf5f0",
          border: "1px solid #e8ddd4",
          borderRadius: 6,
          fontSize: 9.5,
          color: "#666",
          lineHeight: 1.5,
        }}>
          {config.description}
        </div>
      )}

      <div style={{ flex: 1, padding: "0 20px", overflow: "hidden" }}>
        {sorted.map((pkg, idx) => {
          const images = [pkg.outdoorImageUrl, pkg.furnaceImageUrl].filter(Boolean);
          return (
            <div key={pkg.id} style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: idx < sorted.length - 1 ? "1px solid #f0f0f0" : "none",
              gap: 12,
            }}>
              {images.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {images.map((url, i) => (
                    <img
                      key={i}
                      src={url!.startsWith("/") ? url! : `/assets/${url}`}
                      alt=""
                      style={{
                        width: 44,
                        height: 44,
                        objectFit: "contain",
                        borderRadius: 6,
                        background: "#f9f9f9",
                        border: "1px solid #eee",
                      }}
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    background: BRAND_COLOR,
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                    flexShrink: 0,
                  }}>
                    {pkg.packageLevel}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#222", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pkg.outdoorName || `${pkg.packageLevel} System`}
                </div>
                <div style={{ fontSize: 9, color: "#888", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pkg.indoorHeatName || pkg.outdoorModel || ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
                  {formatCents(pkg.totalInvestment)}
                </div>
                <div style={{ fontSize: 10, color: "#888" }}>
                  {formatCentsMonthly(pkg.monthlyPayment)}/mo
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 3, background: BRAND_COLOR }} />
    </PageWrapper>
  );
});
SingleTierDetailPage.displayName = "SingleTierDetailPage";


export const EliteDividerPage = forwardRef<HTMLDivElement, object>((_, ref) => (
  <PageWrapper ref={ref}>
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 40%, #711419 100%)",
      padding: "10%",
      textAlign: "center",
    }}>
      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.3)", marginBottom: 32 }} />
      <div style={{ color: "rgba(255,215,0,0.9)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>
        Premium Upgrade
      </div>
      <h1 style={{ color: "#fff", fontSize: "clamp(26px, 4vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
        HVAC Elite Package
      </h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "clamp(11px, 1.6vw, 14px)", maxWidth: "85%", lineHeight: 1.6 }}>
        Bundled upgrades with a 20% discount on the total package. Includes extended warranty, maintenance plan, install upgrades, and airflow options.
      </p>
      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.3)", marginTop: 32 }} />
    </div>
    <div style={{ height: 4, background: "#d4a500" }} />
  </PageWrapper>
));
EliteDividerPage.displayName = "EliteDividerPage";

export const EliteBundlesPage = forwardRef<HTMLDivElement, { bundles: EliteBundle[] }>(({ bundles }, ref) => {
  const tonnages = ["1.5", "2", "2.5", "3", "3.5", "4", "5"];
  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: BRAND_COLOR,
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Elite Core Bundles</div>
        <div style={{ color: "rgba(255,215,0,0.8)", fontSize: 11, fontWeight: 600 }}>20% Bundle Discount</div>
      </div>

      <div style={{ flex: 1, padding: "12px 20px", overflow: "hidden" }}>
        {bundles.map((bundle, idx) => (
          <div key={bundle.id} style={{
            border: "1px solid #e8e8e8",
            borderRadius: 6,
            marginBottom: idx < bundles.length - 1 ? 10 : 0,
            overflow: "hidden",
          }}>
            <div style={{
              padding: "8px 14px",
              background: "#fafafa",
              borderBottom: "1px solid #eee",
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{bundle.name}</div>
              <div style={{ fontSize: 10, color: "#888" }}>{bundle.description}</div>
            </div>
            <div style={{ padding: "8px 14px" }}>
              {bundle.fixedPrice ? (
                <div style={{ fontWeight: 700, fontSize: 18, color: BRAND_COLOR }}>
                  ${bundle.fixedPrice.toLocaleString()}
                </div>
              ) : bundle.priceByTonnage ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {tonnages.filter(t => bundle.priceByTonnage?.[t]).map(t => (
                    <div key={t} style={{
                      background: "#f9f9f9",
                      borderRadius: 4,
                      padding: "3px 8px",
                      textAlign: "center",
                      border: "1px solid #eee",
                    }}>
                      <div style={{ fontSize: 9, color: "#999" }}>{t}T</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#333" }}>
                        ${bundle.priceByTonnage?.[t]?.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                {bundle.benefits.map((b, i) => (
                  <span key={i} style={{
                    fontSize: 9,
                    color: "#1a6b3c",
                    background: "#f0fdf4",
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}>
                    ✓ {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 3, background: BRAND_COLOR }} />
    </PageWrapper>
  );
});
EliteBundlesPage.displayName = "EliteBundlesPage";

export const EliteDiscountPage = forwardRef<HTMLDivElement, object>((_, ref) => (
  <PageWrapper ref={ref}>
    <div style={{
      background: BRAND_COLOR,
      padding: "12px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Elite Bundle Savings</div>
      <div style={{ color: "rgba(255,215,0,0.8)", fontSize: 11, fontWeight: 600 }}>How the 20% Discount Works</div>
    </div>

    <div style={{ flex: 1, padding: "20px 24px", overflow: "hidden" }}>
      <div style={{
        background: "linear-gradient(135deg, #fef9e7 0%, #fdf2d1 100%)",
        border: "2px solid #e8c84a",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#7a5c00", marginBottom: 4 }}>
          20% Off Your Entire System
        </div>
        <div style={{ fontSize: 11, color: "#6b5000", lineHeight: 1.6 }}>
          When you add any Elite bundle to your HVAC system purchase, you receive a <b>20% discount</b> on the total package price. This applies to every system type — Split Gas Air, Heat Pump, Dual Fuel, Package Units, Mini-Splits, and more.
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>
          Example Scenario
        </div>
        <div style={{
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <div style={{ padding: "10px 16px", background: "#f8f8f8", borderBottom: "1px solid #e0e0e0" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Customer selects:</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#222" }}>Split Gas Air — Premium — 3 Ton "Better" Package</div>
          </div>
          <div style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#555" }}>System price</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>$15,200</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#555" }}>+ Elite Indoor Air Quality Bundle</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>$4,500</span>
            </div>
            <div style={{ borderTop: "1px dashed #ddd", paddingTop: 8, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Subtotal before discount</span>
              <span style={{ fontSize: 12, color: "#888", textDecoration: "line-through" }}>$19,700</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#1a6b3c" }}>20% Elite Bundle Discount</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1a6b3c" }}>-$3,040</span>
            </div>
            <div style={{
              borderTop: "2px solid #111",
              paddingTop: 8,
              display: "flex",
              justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Final Investment</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: BRAND_COLOR }}>$16,660</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 8,
        padding: "12px 16px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
          Why Go Elite?
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            "Premium indoor air quality",
            "Extended equipment life",
            "Lower energy bills",
            "20% system discount",
            "Whole-home comfort",
            "Priority service status",
          ].map((item, i) => (
            <div key={i} style={{ fontSize: 10, color: "#15803d", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span> {item}
            </div>
          ))}
        </div>
      </div>
    </div>

    <div style={{ height: 3, background: BRAND_COLOR }} />
  </PageWrapper>
));
EliteDiscountPage.displayName = "EliteDiscountPage";

export const EliteAirflowPage = forwardRef<HTMLDivElement, { options: EliteAirflowOption[] }>(({ options }, ref) => {
  const tonnages = ["1.5", "2", "2.5", "3", "3.5", "4", "5"];
  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: BRAND_COLOR,
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Elite Airflow Options</div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>Choose one option</div>
      </div>

      <div style={{ flex: 1, padding: "16px 20px", overflow: "hidden" }}>
        {options.map((opt, idx) => (
          <div key={opt.id} style={{
            border: "1px solid #e8e8e8",
            borderRadius: 6,
            marginBottom: idx < options.length - 1 ? 16 : 0,
            overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px",
              background: "#fafafa",
              borderBottom: "1px solid #eee",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{opt.name}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{opt.description}</div>
            </div>
            <div style={{ padding: "10px 14px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #eee" }}>
                    {tonnages.map(t => (
                      <th key={t} style={{ padding: "4px 4px", color: "#999", fontWeight: 500, textAlign: "center", fontSize: 10 }}>
                        {t}T
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {tonnages.map(t => (
                      <td key={t} style={{ padding: "6px 4px", textAlign: "center", fontWeight: 600, color: BRAND_COLOR }}>
                        ${opt.priceByTonnage[t]?.toLocaleString() || "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 3, background: BRAND_COLOR }} />
    </PageWrapper>
  );
});
EliteAirflowPage.displayName = "EliteAirflowPage";

export const CrawlspaceDividerPage = forwardRef<HTMLDivElement, object>((_, ref) => (
  <PageWrapper ref={ref}>
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      background: "linear-gradient(160deg, #1a3a1a 0%, #1a1a1a 60%, #0d0d0d 100%)",
      padding: "10%",
      textAlign: "center",
    }}>
      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.3)", marginBottom: 32 }} />
      <h1 style={{ color: "#fff", fontSize: "clamp(24px, 4vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
        Crawlspace Services
      </h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "clamp(11px, 1.6vw, 14px)", maxWidth: "85%", lineHeight: 1.6 }}>
        Encapsulation, vapor barriers, dehumidifiers, joist cleaning, mold treatment, and excavation
      </p>
      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.3)", marginTop: 32 }} />
    </div>
    <div style={{ height: 4, background: "#1a6b3c" }} />
  </PageWrapper>
));
CrawlspaceDividerPage.displayName = "CrawlspaceDividerPage";

export const CrawlspaceTiersPage = forwardRef<HTMLDivElement, { tiers: CrawlspaceTier[] }>((
  { tiers }, ref
) => {
  const dehumidifiers = [
    { model: "Aprilaire E070", baseCost: 1649.99, tiers: ["Premium", "Ultimate"] },
    { model: "Aprilaire E100", baseCost: 2149.99, tiers: ["Essential"] },
  ];

  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: "#1a6b3c",
        padding: "12px 20px",
      }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Crawlspace Encapsulation Tiers</div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>Vapor barrier + encapsulation pricing</div>
      </div>

      <div style={{ flex: 1, padding: "16px 20px", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {tiers.map(tier => (
            <div key={tier.id} style={{
              flex: 1,
              border: "1px solid #e8e8e8",
              borderRadius: 8,
              overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 12px",
                background: tier.name === "Ultimate" ? BRAND_COLOR : tier.name === "Premium" ? "#1a5a8a" : "#555",
                color: "#fff",
                textAlign: "center",
              }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{tier.name}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>{tier.milThickness} mil</div>
              </div>
              <div style={{ padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#111" }}>
                  {formatCents(tier.rollPrice)}
                </div>
                <div style={{ fontSize: 10, color: "#888" }}>per roll</div>
                {tier.description && (
                  <div style={{ fontSize: 9, color: "#888", marginTop: 6, lineHeight: 1.4 }}>
                    {tier.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #eee", paddingTop: 14, marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 10 }}>
            Dehumidifier Options
          </div>
          {dehumidifiers.map((d, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 12px",
              background: "#f9f9f9",
              borderRadius: 6,
              marginBottom: 6,
              border: "1px solid #eee",
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#111" }}>{d.model}</div>
                <div style={{ fontSize: 10, color: "#888" }}>For: {d.tiers.join(", ")} tier</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: BRAND_COLOR }}>
                ${d.baseCost.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
          <div style={{ fontSize: 10, color: "#888", lineHeight: 1.5 }}>
            <strong>Pricing formula:</strong> Labor ($1.50/sqft) + Liner (50% gross margin) + Dehumidifier (50% markup) + Receptacle ($150)
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 4, lineHeight: 1.5 }}>
            Includes 10% waste factor. Wall height: 3ft. Pillar wrapping: 16" sides × 3ft height.
          </div>
        </div>
      </div>

      <div style={{ height: 3, background: "#1a6b3c" }} />
    </PageWrapper>
  );
});
CrawlspaceTiersPage.displayName = "CrawlspaceTiersPage";

export const CrawlspaceExamplePage = forwardRef<HTMLDivElement, object>((_, ref) => (
  <PageWrapper ref={ref}>
    <div style={{
      background: "#1a6b3c",
      padding: "12px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Crawlspace Pricing Example</div>
      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 600 }}>How Pricing Works</div>
    </div>

    <div style={{ flex: 1, padding: "20px 24px", overflow: "hidden" }}>
      <div style={{
        background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
        border: "2px solid #86efac",
        borderRadius: 10,
        padding: "14px 18px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#14532d", marginBottom: 4 }}>
          Complete Crawlspace Protection
        </div>
        <div style={{ fontSize: 11, color: "#166534", lineHeight: 1.6 }}>
          Pricing is calculated based on your crawlspace square footage, chosen liner tier, and dehumidifier selection. Below is a typical 1,200 sqft crawlspace example.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8 }}>
          Example: 1,200 sqft — Premium Tier
        </div>
        <div style={{
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <div style={{ padding: "10px 16px", background: "#f8f8f8", borderBottom: "1px solid #e0e0e0" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Customer selects:</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#222" }}>Premium 20-mil Vapor Barrier + Aprilaire E070 Dehumidifier</div>
          </div>
          <div style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Labor (1,200 sqft × $1.50)</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>$1,800</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Premium Liner (with 10% waste + 50% margin)</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>$2,640</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Aprilaire E070 Dehumidifier (50% markup)</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>$2,475</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Electrical receptacle</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>$150</span>
            </div>
            <div style={{
              borderTop: "2px solid #111",
              paddingTop: 8,
              marginTop: 4,
              display: "flex",
              justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Total Investment</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#1a6b3c" }}>$7,065</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 8,
        padding: "12px 16px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
          What's Included
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          {[
            "Full vapor barrier install",
            "Joist-to-joist coverage",
            "Pillar wrapping included",
            "Dehumidifier + drainage",
            "Mold prevention",
            "10-year liner warranty",
            "Moisture control",
            "Improved air quality",
          ].map((item, i) => (
            <div key={i} style={{ fontSize: 10, color: "#15803d", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span> {item}
            </div>
          ))}
        </div>
      </div>
    </div>

    <div style={{ height: 3, background: "#1a6b3c" }} />
  </PageWrapper>
));
CrawlspaceExamplePage.displayName = "CrawlspaceExamplePage";

interface CrawlspaceEliteBundle {
  name: string;
  price: number;
  description: string;
  benefits: string[];
  notCovered?: string[];
}

const CRAWLSPACE_ELITE_BUNDLES: CrawlspaceEliteBundle[] = [
  {
    name: "10-Year Maintenance & Inspection",
    price: 2290,
    description: "1 visit per year for 10 years",
    benefits: [
      "Full crawlspace visual inspection (liner, seams, walls, pillars)",
      "Check dehumidifier operation + clean/replace filter",
      "Measure humidity/temperature and log readings",
      "Inspect sump/drainage + discharge line (if present)",
      "Check for standing water, leaks, or new moisture intrusion",
      "Minor reseal/tape touch-ups (as needed)",
    ],
  },
  {
    name: "10-Year Dehumidifier Warranty",
    price: 800,
    description: "Parts + labor coverage for dehumidifier",
    benefits: [
      "Parts coverage follows manufacturer terms",
      "Labor coverage included for 10 years",
      "Drain line clogs/maintenance issues covered on yearly plan",
    ],
    notCovered: [
      "Flooding, plumbing leaks left unresolved",
      "Pest damage, homeowner/third-party damage",
      "Structural movement beyond normal settling",
    ],
  },
];

const CRAWLSPACE_ELITE_TOTAL = CRAWLSPACE_ELITE_BUNDLES.reduce((s, b) => s + b.price, 0);

export const CrawlspaceElitePage = forwardRef<HTMLDivElement, object>((_, ref) => (
  <PageWrapper ref={ref}>
    <div style={{
      background: BRAND_COLOR,
      padding: "12px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Crawlspace Elite Package</div>
      <div style={{ color: "rgba(255,215,0,0.8)", fontSize: 11, fontWeight: 600 }}>20% Bundle Discount</div>
    </div>

    <div style={{ flex: 1, padding: "14px 20px", overflow: "hidden" }}>
      <div style={{
        background: "linear-gradient(135deg, #fef9e7 0%, #fdf2d1 100%)",
        border: "2px solid #e8c84a",
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7a5c00", marginBottom: 2 }}>
          Protect Your Crawlspace Investment
        </div>
        <div style={{ fontSize: 10, color: "#6b5000", lineHeight: 1.5 }}>
          Add the Elite Package to any crawlspace encapsulation and receive a <b>20% discount</b> on the total project. Includes long-term maintenance coverage and dehumidifier warranty for complete peace of mind.
        </div>
      </div>

      {CRAWLSPACE_ELITE_BUNDLES.map((bundle, idx) => (
        <div key={idx} style={{
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          marginBottom: 12,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "8px 14px",
            background: "#fafafa",
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#111" }}>{bundle.name}</div>
              <div style={{ fontSize: 9, color: "#888" }}>{bundle.description}</div>
            </div>
            <div style={{
              background: BRAND_COLOR,
              color: "#fff",
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
            }}>
              ${bundle.price.toLocaleString()}
            </div>
          </div>
          <div style={{ padding: "8px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
              {bundle.benefits.map((b, i) => (
                <div key={i} style={{ fontSize: 9, color: "#15803d", display: "flex", alignItems: "flex-start", gap: 3 }}>
                  <span style={{ color: "#22c55e", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
            {bundle.notCovered && bundle.notCovered.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#dc2626", marginBottom: 3 }}>Not Covered:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                  {bundle.notCovered.map((item, i) => (
                    <div key={i} style={{ fontSize: 9, color: "#888", display: "flex", alignItems: "flex-start", gap: 3 }}>
                      <span style={{ color: "#dc2626", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✕</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      <div style={{
        background: "#f8f8f8",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>Total Elite Add-On</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: BRAND_COLOR }}>${CRAWLSPACE_ELITE_TOTAL.toLocaleString()}</span>
      </div>
    </div>

    <div style={{ height: 3, background: BRAND_COLOR }} />
  </PageWrapper>
));
CrawlspaceElitePage.displayName = "CrawlspaceElitePage";

export const CrawlspaceEliteExamplePage = forwardRef<HTMLDivElement, object>((_, ref) => {
  const basePrice = 5379;
  const eliteTotal = CRAWLSPACE_ELITE_TOTAL;
  const subtotal = basePrice + eliteTotal;
  const discount = Math.round(subtotal * 0.2);
  const finalTotal = subtotal - discount;

  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: BRAND_COLOR,
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Elite Crawlspace Example</div>
        <div style={{ color: "rgba(255,215,0,0.8)", fontSize: 11, fontWeight: 600 }}>See the Savings</div>
      </div>

      <div style={{ flex: 1, padding: "20px 24px", overflow: "hidden" }}>
        <div style={{
          background: "linear-gradient(135deg, #fef9e7 0%, #fdf2d1 100%)",
          border: "2px solid #e8c84a",
          borderRadius: 10,
          padding: "14px 18px",
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#7a5c00", marginBottom: 4 }}>
            20% Off Your Crawlspace Project
          </div>
          <div style={{ fontSize: 11, color: "#6b5000", lineHeight: 1.6 }}>
            When you bundle the Elite Package with your crawlspace encapsulation, the <b>20% discount</b> applies to the entire project — base install plus all Elite add-ons.
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>
            Example Scenario
          </div>
          <div style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            <div style={{ padding: "10px 16px", background: "#f8f8f8", borderBottom: "1px solid #e0e0e0" }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Customer selects:</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#222" }}>Essential 10-mil — 1,000 sqft + Elite Package</div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#555" }}>Base Package (1,000 sqft)</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>${basePrice.toLocaleString()}</span>
              </div>
              {CRAWLSPACE_ELITE_BUNDLES.map((bundle, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "#555" }}>+ {bundle.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>${bundle.price.toLocaleString()}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px dashed #ddd", paddingTop: 8, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#555" }}>Subtotal before discount</span>
                <span style={{ fontSize: 12, color: "#888", textDecoration: "line-through" }}>${subtotal.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#1a6b3c" }}>20% Elite Discount</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1a6b3c" }}>-${discount.toLocaleString()}</span>
              </div>
              <div style={{
                borderTop: "2px solid #111",
                paddingTop: 8,
                marginTop: 4,
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Total Investment</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: BRAND_COLOR }}>${finalTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 8,
          padding: "12px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>You Save ${discount.toLocaleString()} (20%)</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            {[
              "Full vapor barrier install",
              "10-year maintenance plan",
              "Dehumidifier warranty",
              "Annual inspections",
              "Priority service status",
              "Complete peace of mind",
            ].map((item, i) => (
              <div key={i} style={{ fontSize: 10, color: "#15803d", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 3, background: BRAND_COLOR }} />
    </PageWrapper>
  );
});
CrawlspaceEliteExamplePage.displayName = "CrawlspaceEliteExamplePage";

export interface EliteBundle {
  id: string;
  name: string;
  description: string;
  priceByTonnage?: Record<string, number>;
  fixedPrice?: number;
  benefits: string[];
  notCovered?: string[];
}

export interface EliteAirflowOption {
  id: string;
  name: string;
  description: string;
  priceByTonnage: Record<string, number>;
}

export interface SalesbookSection {
  type: "static" | "category-divider" | "tier-header" | "product-detail" | "ducting-detail" | "elite-divider" | "elite-bundles" | "elite-discount" | "elite-airflow" | "crawlspace-divider" | "crawlspace-tiers" | "crawlspace-example" | "crawlspace-elite" | "crawlspace-elite-example";
  label?: string;
  unitType?: string;
  tier?: string;
  tonnage?: string;
  tierCount?: number;
  staticSrc?: string;
  packages?: PricebookPackage[];
  crawlspaceTiers?: CrawlspaceTier[];
  heroImageUrl?: string;
  eliteCoreBundles?: EliteBundle[];
  eliteAirflowOptions?: EliteAirflowOption[];
  pageIndex: number;
}

const UNIT_TYPE_ORDER = ["SGA", "SHP", "STA", "GP", "PHP", "Mini-Split", "Ducting"];
const TIER_ORDER = ["Essential", "Premium", "Ultimate", "Packaged", "Standard"];

export function buildSalesbookSections(
  staticPages: string[],
  packages: PricebookPackage[],
  crawlspaceTiers: CrawlspaceTier[],
  eliteCoreBundles: EliteBundle[] = [],
  eliteAirflowOptions: EliteAirflowOption[] = [],
): SalesbookSection[] {
  const sections: SalesbookSection[] = [];
  let pageIndex = 0;

  for (const src of staticPages) {
    sections.push({ type: "static", staticSrc: src, pageIndex: pageIndex++, label: `Intro Page ${pageIndex}` });
  }

  const byType = new Map<string, PricebookPackage[]>();
  for (const pkg of packages) {
    const arr = byType.get(pkg.unitType) || [];
    arr.push(pkg);
    byType.set(pkg.unitType, arr);
  }

  const allUnitTypes = UNIT_TYPE_ORDER.filter(ut => byType.has(ut));
  const extraUnitTypes = Array.from(byType.keys()).filter(ut => !UNIT_TYPE_ORDER.includes(ut)).sort();
  const orderedUnitTypes = [...allUnitTypes, ...extraUnitTypes];

  for (const unitType of orderedUnitTypes) {
    const typePackages = byType.get(unitType);
    if (!typePackages || typePackages.length === 0) continue;

    const unitDisplay = UNIT_TYPE_DISPLAY[unitType]?.name || unitType;
    const heroImg = typePackages.find(p => p.outdoorImageUrl)?.outdoorImageUrl || undefined;

    const isSingleTier = unitType === "Ducting" || unitType === "Mini-Split";
    if (isSingleTier) {
      sections.push({
        type: "category-divider",
        unitType,
        tierCount: 1,
        packages: typePackages,
        heroImageUrl: heroImg,
        pageIndex: pageIndex++,
        label: unitDisplay,
      });
      sections.push({
        type: "ducting-detail",
        unitType,
        packages: typePackages,
        pageIndex: pageIndex++,
        label: `${unitDisplay} Sizing`,
      });
      continue;
    }

    const byTier = new Map<string, PricebookPackage[]>();
    for (const pkg of typePackages) {
      const arr = byTier.get(pkg.tier) || [];
      arr.push(pkg);
      byTier.set(pkg.tier, arr);
    }

    const knownTiers = TIER_ORDER.filter(t => byTier.has(t));
    const extraTiers = Array.from(byTier.keys()).filter(t => !TIER_ORDER.includes(t)).sort();
    const tierKeys = [...knownTiers, ...extraTiers];

    sections.push({
      type: "category-divider",
      unitType,
      tierCount: tierKeys.length,
      packages: typePackages,
      heroImageUrl: heroImg,
      pageIndex: pageIndex++,
      label: unitDisplay,
    });

    for (const tier of tierKeys) {
      const tierPackages = byTier.get(tier)!;

      sections.push({
        type: "tier-header",
        unitType,
        tier,
        packages: tierPackages,
        pageIndex: pageIndex++,
        label: `${unitDisplay} — ${tier} Overview`,
      });

      const byTonnage = new Map<string, PricebookPackage[]>();
      for (const pkg of tierPackages) {
        const arr = byTonnage.get(pkg.tonnage) || [];
        arr.push(pkg);
        byTonnage.set(pkg.tonnage, arr);
      }

      const sortedTonnages = Array.from(byTonnage.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));
      for (const tonnage of sortedTonnages) {
        sections.push({
          type: "product-detail",
          unitType,
          tier,
          tonnage,
          packages: byTonnage.get(tonnage)!,
          pageIndex: pageIndex++,
          label: `${unitDisplay} ${tier} ${tonnage}T`,
        });
      }
    }
  }

  sections.push({ type: "elite-divider", pageIndex: pageIndex++, label: "HVAC Elite Package" });
  sections.push({ type: "elite-bundles", eliteCoreBundles, pageIndex: pageIndex++, label: "Elite Core Bundles" });
  sections.push({ type: "elite-airflow", eliteAirflowOptions, pageIndex: pageIndex++, label: "Elite Airflow Options" });
  sections.push({ type: "elite-discount", pageIndex: pageIndex++, label: "Elite Bundle Savings" });

  if (crawlspaceTiers.length > 0) {
    sections.push({ type: "crawlspace-divider", pageIndex: pageIndex++, label: "Crawlspace Services" });
    sections.push({ type: "crawlspace-tiers", crawlspaceTiers, pageIndex: pageIndex++, label: "Crawlspace Tiers & Pricing" });
    sections.push({ type: "crawlspace-example", pageIndex: pageIndex++, label: "Crawlspace Pricing Example" });
    sections.push({ type: "crawlspace-elite", pageIndex: pageIndex++, label: "Crawlspace Elite Package" });
    sections.push({ type: "crawlspace-elite-example", pageIndex: pageIndex++, label: "Crawlspace Elite Example" });
  }

  return sections;
}

export function getSalesbookTOC(sections: SalesbookSection[]): { label: string; page: number }[] {
  const toc: { label: string; page: number }[] = [];
  for (const s of sections) {
    if (s.type === "category-divider" || s.type === "elite-divider" || s.type === "crawlspace-divider") {
      toc.push({ label: s.label || "Section", page: s.pageIndex + 1 });
    }
  }
  return toc;
}
