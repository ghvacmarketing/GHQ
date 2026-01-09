import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { CrmQuoteLineItem } from "@shared/schema";

export const BRAND_COLOR = "#711419";

export const COMPANY_INFO = {
  name: "Giesbrecht HVAC",
  address: "PO Box 917, Wrens, GA 30833",
  phone: "(706) 826-0644",
  email: "chandler@ghvacinc.com",
  website: "www.ghvacinc.com",
};

export interface OptionGroup {
  tag: string;
  items: CrmQuoteLineItem[];
  total: number;
}

export const PACKAGE_LEVEL_ORDER = ["Best", "Better", "Good", "Budget"];

export function getOptionSortOrder(tag: string): number {
  const lowerTag = tag.toLowerCase();
  for (let i = 0; i < PACKAGE_LEVEL_ORDER.length; i++) {
    const level = PACKAGE_LEVEL_ORDER[i].toLowerCase();
    if (lowerTag === level || lowerTag.startsWith(level)) {
      return i;
    }
  }
  return PACKAGE_LEVEL_ORDER.length;
}

export function groupLineItemsByOption(lineItems: CrmQuoteLineItem[]): OptionGroup[] {
  const groups = new Map<string, CrmQuoteLineItem[]>();
  
  lineItems.forEach(item => {
    const tag = item.optionTag;
    if (!tag) return;
    if (!groups.has(tag)) {
      groups.set(tag, []);
    }
    groups.get(tag)!.push(item);
  });
  
  return Array.from(groups.entries())
    .map(([tag, items]) => ({
      tag,
      items,
      total: items.reduce((sum, item) => sum + parseFloat(item.lineTotal || "0"), 0),
    }))
    .sort((a, b) => getOptionSortOrder(a.tag) - getOptionSortOrder(b.tag));
}

export function formatPresentationCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

export function formatPresentationDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export interface EquipmentImages {
  outdoor?: string;
  coil?: string;
  furnace?: string;
  thermostat?: string;
}

export function parseEquipmentImages(imageUrl: string | null | undefined): EquipmentImages | null {
  if (!imageUrl) return null;
  try {
    const parsed = JSON.parse(imageUrl);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as EquipmentImages;
    }
    return null;
  } catch {
    return null;
  }
}

export function PresentationEquipmentImageGrid({ images }: { images: EquipmentImages }) {
  const imageItems = [
    { key: 'outdoor', url: images.outdoor, label: 'Outdoor' },
    { key: 'coil', url: images.coil, label: 'Coil' },
    { key: 'furnace', url: images.furnace, label: 'Indoor' },
    { key: 'thermostat', url: images.thermostat, label: 'T-stat' },
  ].filter(item => item.url);

  if (imageItems.length === 0) return null;

  return (
    <div className={`grid ${imageItems.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'} gap-1`}>
      {imageItems.map(item => (
        <div key={item.key} className="flex flex-col items-center">
          <img
            src={item.url}
            alt={item.label}
            className="w-12 h-12 object-contain border border-slate-200 rounded bg-white"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span className="text-[10px] text-slate-500 mt-0.5">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export interface WhatsIncludedItem {
  category: string;
  items: string[];
}

export interface WhatsIncludedResult {
  categoryTitle: string;
  items: string[];
}

export function getWhatsIncludedForOption(
  optionTag: string, 
  whatsIncluded: WhatsIncludedItem[] | undefined
): WhatsIncludedResult {
  if (!whatsIncluded || !Array.isArray(whatsIncluded)) return { categoryTitle: "", items: [] };
  
  const normalizedTag = optionTag.toLowerCase().trim();
  
  const match = whatsIncluded.find(item => {
    const normalizedCategory = item.category.toLowerCase();
    return normalizedCategory.includes(normalizedTag) || 
           normalizedCategory.startsWith(normalizedTag);
  });
  
  return {
    categoryTitle: match?.category || "",
    items: match?.items || []
  };
}

export function PresentationSignaturePad({ onSignatureChange }: { onSignatureChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(300);
  const canvasHeight = 150;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCanvasWidth = () => {
      const width = container.clientWidth - 8;
      if (width > 0) {
        setCanvasWidth(width);
      }
    };

    updateCanvasWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasWidth();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Explicitly set canvas bitmap dimensions to match the new width
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and fill with white background
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Reset signature state
    setHasSignature(false);
    onSignatureChange("");
  }, [canvasWidth, canvasHeight, onSignatureChange]);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.beginPath();
    ctx.moveTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.lineTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      onSignatureChange(canvas.toDataURL("image/png"));
    }
  }, [hasSignature, onSignatureChange]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange("");
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">Signature</div>
      <p className="text-xs text-slate-500">Draw your signature below using your finger or mouse</p>
      <div ref={containerRef} className="border-2 border-dashed border-slate-300 rounded-lg p-1 bg-white">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="w-full h-[120px] sm:h-[150px] cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          data-testid="canvas-presentation-signature"
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500">Sign above with your mouse or finger</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearSignature}
          className="text-slate-500 hover:text-slate-700"
          data-testid="button-clear-presentation-signature"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
