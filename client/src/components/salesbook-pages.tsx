import { forwardRef } from "react";
import type { PricebookPackage, CrawlspaceTier } from "@shared/schema";
import gefaBookingQr from "@assets/gefa-booking-qr.svg";

// Served as static files from attached_assets via the backend `/assets` route
// (not Vite @assets imports) so they capture reliably in the html2canvas PDF
// export, matching every other salesbook equipment image.
const whTanklessImg = "/assets/image_1781528279007.png";
const whNaturalGasImg = "/assets/image_1781528303384.png";
const whPropaneImg = "/assets/image_1781528313578.png";
const whElectricImg = "/assets/image_1781528322992.png";

const BRAND_COLOR = "#711419";
const BRAND_COLOR_LIGHT = "#8a1a20";
const GEFA_COLOR = BRAND_COLOR;

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
  "Water Heater": { name: "Water Heaters", tagline: "Reliable hot water — tankless, gas & electric options" },
};

interface WaterHeaterSpec {
  image: string;
  description: string;
  warranty: string[];
  features: string[];
}

// Static product specs, keyed by the stable packageLevel variant code (not the
// editable display name). Keep keys in sync with the runWaterHeaterSeeds() seed
// in server/index.ts.
const WATER_HEATER_SPECS: Record<string, WaterHeaterSpec> = {
  Tankless: {
    image: whTanklessImg,
    description:
      "Premium high-efficiency option with continuous hot water, longer equipment life, and a space-saving design.",
    warranty: ["1 Year Labor", "5 Year Parts", "15 Year Heat Exchanger"],
    features: [
      "Continuous hot water",
      "Ultra condensing efficiency",
      "Field convertible gas system",
      "Space-saving wall mount",
      "Low NOx emissions",
      "Cascading capable",
    ],
  },
  "Natural Gas": {
    image: whNaturalGasImg,
    description:
      "Reliable standard replacement for homes with natural gas service. Lower upfront investment than tankless.",
    warranty: ["1 Year Labor", "6 Year Tank and Limited Parts"],
    features: [],
  },
  Propane: {
    image: whPropaneImg,
    description:
      "Dependable propane water heater option for homes without natural gas service.",
    warranty: ["1 Year Labor", "6 Year Tank and Limited Parts"],
    features: [],
  },
  Electric: {
    image: whElectricImg,
    description:
      "Simple, cost-effective electric replacement option for homes without gas service.",
    warranty: ["1 Year Labor", "6 Year Tank and Limited Parts"],
    features: [],
  },
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
                <div style={{ fontSize: 9, color: "#888", marginTop: 1, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
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


export const WaterHeaterDetailPage = forwardRef<HTMLDivElement, {
  packages: PricebookPackage[];
}>(({ packages }, ref) => {
  const sorted = [...packages].sort((a, b) => parseFloat(a.tonnage) - parseFloat(b.tonnage));

  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: BRAND_COLOR,
        padding: "14px 20px",
      }}>
        <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Water Heaters</div>
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 10.5, fontWeight: 500, marginTop: 2 }}>
          Reliable hot water — tankless, gas &amp; electric options
        </div>
      </div>

      <div style={{
        flex: 1,
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflow: "hidden",
      }}>
        {[0, 2].map((rowStart) => (
          <div key={`wh-row-${rowStart}`} style={{ display: "flex", flex: 1, gap: 10, minHeight: 0 }}>
            {sorted.slice(rowStart, rowStart + 2).map((pkg) => {
          const name = pkg.outdoorName || pkg.packageLevel;
          const spec = WATER_HEATER_SPECS[pkg.packageLevel] || { image: "", description: "", warranty: [], features: [] };
          return (
            <div key={pkg.id} style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid #e8e8e8",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: "#fff",
            }}>
              <div style={{
                padding: "10px 12px",
                display: "flex",
                gap: 10,
                alignItems: "center",
                borderBottom: "1px solid #f0f0f0",
              }}>
                <div style={{
                  width: 54,
                  height: 64,
                  flexShrink: 0,
                  borderRadius: 6,
                  background: "#f7f7f7",
                  border: "1px solid #eee",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}>
                  {spec.image && (
                    <img
                      src={spec.image}
                      alt={name}
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                      loading="lazy"
                    />
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111", lineHeight: 1.2 }}>{name}</div>
                  <div style={{ fontSize: 8.5, color: "#999", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[pkg.outdoorBrand, pkg.outdoorModel].filter(Boolean).join(" ")}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: BRAND_COLOR, lineHeight: 1 }}>
                      {formatCents(pkg.totalInvestment)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: "#888" }}>
                      or {formatCents(pkg.monthlyPayment)}/mo*
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ padding: "8px 12px", flex: 1, overflow: "hidden" }}>
                {spec.description && (
                  <div style={{ fontSize: 9.5, color: "#555", lineHeight: 1.4, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {spec.description}
                  </div>
                )}

                <div style={{ fontSize: 8, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                  Warranty
                </div>
                {spec.warranty.map((w, i) => (
                  <div key={i} style={{ fontSize: 9.5, color: "#444", lineHeight: 1.4 }}>• {w}</div>
                ))}

                {spec.features.length > 0 && (
                  <>
                    <div style={{ fontSize: 8, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", margin: "6px 0 4px" }}>
                      Features
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {spec.features.map((f, i) => (
                        <span key={i} style={{
                          fontSize: 8,
                          color: "#1a5a8a",
                          background: "#eef5fb",
                          padding: "1px 5px",
                          borderRadius: 3,
                          lineHeight: 1.35,
                        }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div style={{
                padding: "5px 12px",
                borderTop: "1px solid #f0f0f0",
                fontSize: 8,
                color: "#aaa",
              }}>
                *12.99% APR, 120 mos — with approved credit
              </div>
            </div>
          );
            })}
          </div>
        ))}
      </div>

      <div style={{ height: 3, background: BRAND_COLOR }} />
    </PageWrapper>
  );
});
WaterHeaterDetailPage.displayName = "WaterHeaterDetailPage";


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

export const GefaDividerPage = forwardRef<HTMLDivElement, object>((_, ref) => (
  <PageWrapper ref={ref}>
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      background: "linear-gradient(160deg, #2a0809 0%, #4d0e12 50%, #711419 100%)",
      padding: "10%",
      textAlign: "center",
    }}>
      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.3)", marginBottom: 32 }} />
      <div style={{ color: "rgba(255,215,0,0.9)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>
        Georgia State Energy Rebates
      </div>
      <h1 style={{ color: "#fff", fontSize: "clamp(24px, 4vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
        GEFA Home Energy Rebates
      </h1>
      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "clamp(11px, 1.6vw, 14px)", maxWidth: "85%", lineHeight: 1.6 }}>
        State rebate programs that can help Georgia homeowners lower the cost of efficient, all-electric comfort — through the HER and HEAR programs.
      </p>
      <div style={{ width: 80, height: 3, background: "rgba(255,255,255,0.3)", marginTop: 32 }} />
    </div>
    <div style={{ height: 4, background: "#d4a500" }} />
  </PageWrapper>
));
GefaDividerPage.displayName = "GefaDividerPage";

export const GefaOverviewPage = forwardRef<HTMLDivElement, object>((_, ref) => {
  const programs = [
    {
      tag: "HER",
      name: "Home Efficiency Rebates",
      amount: "Up to $16,000",
      blurb: "For whole-home energy efficiency projects, based on the energy savings the upgrades are projected to achieve.",
      covers: [
        "Whole-home efficiency retrofits",
        "HVAC + building envelope improvements",
        "Insulation & air sealing",
        "Projects modeled to hit energy-savings targets",
      ],
    },
    {
      tag: "HEAR",
      name: "Home Electrification & Appliance Rebates",
      amount: "Up to $14,000 total",
      blurb: "For income-qualified households making electrification upgrades to all-electric equipment.",
      covers: [
        "Heat pump HVAC — up to $8,000",
        "Heat pump water heater",
        "Electrical panel & wiring upgrades",
        "Insulation, air sealing & ventilation",
        "Qualified electric appliances",
      ],
    },
  ];
  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: GEFA_COLOR,
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>What Is GEFA?</div>
        <div style={{ color: "rgba(255,215,0,0.85)", fontSize: 11, fontWeight: 600 }}>Two Rebate Paths</div>
      </div>

      <div style={{ flex: 1, padding: "16px 20px", overflow: "hidden" }}>
        <div style={{
          background: "linear-gradient(135deg, #fbf1f1 0%, #f6e2e3 100%)",
          border: "1px solid #e6c9cb",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 11.5, color: "#5a1015", lineHeight: 1.6 }}>
            The Georgia Environmental Finance Authority (GEFA) runs Georgia's Home Energy Rebates. These programs help homeowners lower the cost of energy-efficient and electrification upgrades. There are two main paths — choose the one that fits the project and the household.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {programs.map((p) => (
            <div key={p.tag} style={{
              flex: 1,
              border: "1px solid #e4e9ec",
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{ padding: "10px 12px", background: GEFA_COLOR, color: "#fff" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{p.tag}</div>
                <div style={{ fontSize: 9.5, opacity: 0.85, lineHeight: 1.3 }}>{p.name}</div>
              </div>
              <div style={{ padding: "10px 12px", flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: BRAND_COLOR }}>{p.amount}</div>
                <div style={{ fontSize: 9.5, color: "#666", lineHeight: 1.45, marginTop: 4 }}>{p.blurb}</div>
                <div style={{ height: 1, background: "#eee", margin: "8px 0" }} />
                {p.covers.map((c, i) => (
                  <div key={i} style={{ fontSize: 9.5, color: "#1a6b3c", display: "flex", gap: 4, marginBottom: 3, lineHeight: 1.3 }}>
                    <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 3, background: GEFA_COLOR }} />
    </PageWrapper>
  );
});
GefaOverviewPage.displayName = "GefaOverviewPage";

export const GefaComparisonPage = forwardRef<HTMLDivElement, object>((_, ref) => {
  const rows = [
    { label: "Main focus", her: "Whole-home energy efficiency", hear: "Switching to all-electric equipment" },
    { label: "Based on", her: "Projected energy savings", hear: "Household income qualification" },
    { label: "Maximum rebate", her: "Up to $16,000", hear: "Up to $14,000 total" },
    { label: "Heat pump HVAC", her: "Part of the whole-home project", hear: "Up to $8,000 toward the system" },
    { label: "Also covers", her: "Insulation, air sealing, envelope & HVAC", hear: "Water heater, panel, wiring, appliances" },
    { label: "Best for", her: "Larger efficiency retrofits", hear: "Income-qualified homes going electric" },
  ];
  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: GEFA_COLOR,
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>HER vs. HEAR</div>
        <div style={{ color: "rgba(255,215,0,0.85)", fontSize: 11, fontWeight: 600 }}>Which Path Fits?</div>
      </div>

      <div style={{ flex: 1, padding: "16px 20px", overflow: "hidden" }}>
        <div style={{ border: "1px solid #ead9da", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", background: GEFA_COLOR, color: "#fff" }}>
            <div style={{ flex: "0 0 30%", padding: "9px 12px", fontSize: 11, fontWeight: 700 }}></div>
            <div style={{ flex: 1, padding: "9px 12px", fontSize: 12, fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.2)" }}>HER</div>
            <div style={{ flex: 1, padding: "9px 12px", fontSize: 12, fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.2)" }}>HEAR</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.label} style={{ display: "flex", background: i % 2 === 0 ? "#fff" : "#faf4f4", borderTop: "1px solid #f0e6e6" }}>
              <div style={{ flex: "0 0 30%", padding: "9px 12px", fontSize: 10, fontWeight: 700, color: "#4a3334" }}>{r.label}</div>
              <div style={{ flex: 1, padding: "9px 12px", fontSize: 10, color: "#444", borderLeft: "1px solid #f0e6e6", lineHeight: 1.35 }}>{r.her}</div>
              <div style={{ flex: 1, padding: "9px 12px", fontSize: 10, color: "#444", borderLeft: "1px solid #f0e6e6", lineHeight: 1.35 }}>{r.hear}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 14,
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 8,
          padding: "10px 14px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 3 }}>The simple version</div>
          <div style={{ fontSize: 10.5, color: "#15803d", lineHeight: 1.5 }}>
            HER rewards how much energy a whole-home project saves. HEAR helps income-qualified homes pay for specific electrification upgrades like a heat pump. A project usually fits one path, not both.
          </div>
        </div>
      </div>

      <div style={{ height: 3, background: GEFA_COLOR }} />
    </PageWrapper>
  );
});
GefaComparisonPage.displayName = "GefaComparisonPage";

export const GefaQualifyPage = forwardRef<HTMLDivElement, object>((_, ref) => {
  const qualify = [
    "Georgia homeowners upgrading a primary residence",
    "HEAR eligibility is based on household income",
    "HER is open to whole-home efficiency projects that meet energy-savings targets",
    "Equipment must meet program efficiency requirements",
  ];
  const dependsOn = ["Household income", "Project type", "Equipment eligibility", "Documentation", "GEFA approval"];
  return (
    <PageWrapper ref={ref}>
      <div style={{
        background: GEFA_COLOR,
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Who Qualifies & What to Know</div>
        <div style={{ color: "rgba(255,215,0,0.85)", fontSize: 11, fontWeight: 600 }}>Eligibility</div>
      </div>

      <div style={{ flex: 1, padding: "16px 20px", overflow: "hidden" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 8 }}>Who May Qualify</div>
        <div style={{ marginBottom: 16 }}>
          {qualify.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5, fontSize: 10.5, color: "#444", lineHeight: 1.4 }}>
              <span style={{ color: GEFA_COLOR, fontWeight: 700 }}>•</span>
              <span>{q}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 8 }}>Every Rebate Depends On</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {dependsOn.map((d, i) => (
            <span key={i} style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#5a1015",
              background: "#fbeeef",
              border: "1px solid #ecd2d4",
              borderRadius: 999,
              padding: "4px 12px",
            }}>
              {d}
            </span>
          ))}
        </div>

        <div style={{
          background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
          border: "2px solid #fdba74",
          borderRadius: 10,
          padding: "12px 16px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", marginBottom: 4 }}>
            Important — Never Promise a Rebate
          </div>
          <div style={{ fontSize: 10.5, color: "#7c2d12", lineHeight: 1.55 }}>
            The amounts above are program <strong>maximums</strong>, not guaranteed amounts. Final rebates depend on income, project scope, equipment eligibility, complete documentation, and official GEFA approval. Never tell a customer they will receive a rebate until their application has been reviewed and approved by GEFA.
          </div>
        </div>

        <div style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "linear-gradient(135deg, #4d0e12 0%, #711419 100%)",
          borderRadius: 12,
          padding: "16px 18px",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "rgba(255,215,0,0.9)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              Interested? Let's Talk
            </div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, lineHeight: 1.25, marginBottom: 6 }}>
              Book a Free Sales Consultation
            </div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 10.5, lineHeight: 1.5 }}>
              Scan the code to schedule a visit and find out which rebate path may fit your home.
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, marginTop: 6, wordBreak: "break-all" }}>
              widget.zenbooker.com/book/giesbrechthvac
            </div>
          </div>
          <div style={{
            flex: "0 0 auto",
            background: "#fff",
            borderRadius: 10,
            padding: 8,
          }}>
            <img src={gefaBookingQr} alt="Scan to book a consultation" style={{ display: "block", width: 96, height: 96 }} />
          </div>
        </div>
      </div>

      <div style={{ height: 3, background: GEFA_COLOR }} />
    </PageWrapper>
  );
});
GefaQualifyPage.displayName = "GefaQualifyPage";

export interface SalesbookSection {
  type: "static" | "gefa-divider" | "gefa-overview" | "gefa-comparison" | "gefa-qualify" | "category-divider" | "tier-header" | "product-detail" | "ducting-detail" | "water-heater-detail" | "elite-divider" | "elite-bundles" | "elite-discount" | "elite-airflow" | "crawlspace-divider" | "crawlspace-tiers" | "crawlspace-example" | "crawlspace-elite" | "crawlspace-elite-example";
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

const UNIT_TYPE_ORDER = ["SGA", "SHP", "STA", "GP", "PHP", "Mini-Split", "Ducting", "Water Heater"];
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

  sections.push({ type: "gefa-divider", pageIndex: pageIndex++, label: "GEFA Home Energy Rebates" });
  sections.push({ type: "gefa-overview", pageIndex: pageIndex++, label: "GEFA — What Is GEFA?" });
  sections.push({ type: "gefa-comparison", pageIndex: pageIndex++, label: "GEFA — HER vs. HEAR" });
  sections.push({ type: "gefa-qualify", pageIndex: pageIndex++, label: "GEFA — Who Qualifies" });

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

    if (unitType === "Water Heater") {
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
        type: "water-heater-detail",
        unitType,
        packages: typePackages,
        pageIndex: pageIndex++,
        label: `${unitDisplay} Options`,
      });
      continue;
    }

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
    if (s.type === "gefa-divider" || s.type === "category-divider" || s.type === "elite-divider" || s.type === "crawlspace-divider") {
      toc.push({ label: s.label || "Section", page: s.pageIndex + 1 });
    }
  }
  return toc;
}
