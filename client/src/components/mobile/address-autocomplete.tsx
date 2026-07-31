import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

/** Google Places address input + optional map preview.
 *
 *  Uses the same PlaceAutocompleteElement pattern as the lead pages (key:
 *  VITE_GOOGLE_PLACES_API_KEY). Falls back to a plain input when the key is
 *  missing or the script fails, so forms never break. On selection the
 *  formatted address (and coordinates when available) flow to the caller,
 *  and a small live map pins the spot.
 */

const KEY = (import.meta as any).env?.VITE_GOOGLE_PLACES_API_KEY || "";

let mapsLoader: Promise<boolean> | null = null;
function loadMaps(): Promise<boolean> {
  if (!KEY) return Promise.resolve(false);
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<boolean>((resolve) => {
    if ((window as any).google?.maps?.importLibrary) return resolve(true);
    const cb = "ghqMapsReady_" + Date.now();
    (window as any)[cb] = () => resolve(true);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places&callback=${cb}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return mapsLoader;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Search address…",
  showMap = true,
  testid,
}: {
  value: string;
  onChange: (address: string, coords?: { lat: number; lng: number }) => void;
  placeholder?: string;
  showMap?: boolean;
  testid?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadMaps();
      if (cancelled) return;
      if (!ok) return setReady(false);
      try {
        const g = (window as any).google;
        await g.maps.importLibrary("places");
        if (cancelled || !containerRef.current) return;
        const el = new g.maps.places.PlaceAutocompleteElement({
          componentRestrictions: { country: ["us"] },
        });
        el.style.width = "100%";
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(el);
        el.addEventListener("gmp-placeselect", async (event: any) => {
          try {
            const place = event.place;
            await place.fetchFields({ fields: ["formattedAddress", "location"] });
            const address = place.formattedAddress || "";
            const loc = place.location;
            const c = loc ? { lat: typeof loc.lat === "function" ? loc.lat() : loc.lat, lng: typeof loc.lng === "function" ? loc.lng() : loc.lng } : undefined;
            onChange(address, c);
          } catch {
            /* selection failed — the typed text still stands */
          }
        });
        setReady(true);
      } catch {
        setReady(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (ready === false || !KEY) {
    // No key (or script failed): plain input — but the map still shows via
    // the keyless embed, so the location is always visible.
    return (
      <div data-testid={testid}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Street, city, state ZIP"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[16px] text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
        />
        {showMap && value.trim().length > 8 && (
          <div className="mt-2">
            <MapEmbed query={value} className="h-36" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid={testid}>
      <div ref={containerRef} className="ghq-places-input">
        {/* PlaceAutocompleteElement mounts here */}
      </div>
      {value && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#711419]" />
          {value}
        </p>
      )}
      {showMap && value && (
        <div className="mt-2" data-testid={testid ? `${testid}-map` : undefined}>
          <MapEmbed query={value} className="h-36" />
        </div>
      )}
    </div>
  );
}

/** Mobile-friendly embedded map for an address string. Uses the Maps Embed
 *  API when a key exists (crisper, branded pin), else the keyless embed. */
export function MapEmbed({ query, className = "h-40" }: { query: string; className?: string }) {
  if (!query.trim()) return null;
  const src = KEY
    ? `https://www.google.com/maps/embed/v1/place?key=${KEY}&q=${encodeURIComponent(query)}&zoom=15`
    : `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  return (
    <iframe
      title="Location"
      src={src}
      className={`${className} w-full rounded-xl border border-slate-200 shadow-sm`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

/** "How far am I?" — device location → driving distance + time to the given
 *  address via the Distance Matrix service. Renders nothing until both ends
 *  are known; never blocks or errors the page. */
export function DistanceFromMe({ address }: { address: string }) {
  const [result, setResult] = useState<{ distance: string; duration: string } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "unavailable">("idle");

  useEffect(() => {
    if (!address.trim() || !KEY) { setState("unavailable"); return; }
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const ok = await loadMaps();
        if (!ok || cancelled) return setState("unavailable");
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 120000 });
        });
        if (cancelled) return;
        const g = (window as any).google;
        await g.maps.importLibrary("routes").catch(() => g.maps.importLibrary("core"));
        const svc = new g.maps.DistanceMatrixService();
        svc.getDistanceMatrix(
          {
            origins: [{ lat: pos.coords.latitude, lng: pos.coords.longitude }],
            destinations: [address],
            travelMode: "DRIVING",
            unitSystem: g.maps.UnitSystem.IMPERIAL,
          },
          (resp: any, status: string) => {
            if (cancelled) return;
            const el = resp?.rows?.[0]?.elements?.[0];
            if (status === "OK" && el?.status === "OK") {
              setResult({ distance: el.distance?.text || "", duration: el.duration?.text || "" });
              setState("done");
            } else {
              setState("unavailable");
            }
          },
        );
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  if (state === "loading") {
    return <p className="mt-1.5 text-xs text-slate-400">Checking distance from you…</p>;
  }
  if (state !== "done" || !result) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600" data-testid="distance-from-me">
      <MapPin className="h-3.5 w-3.5 text-[#711419]" />
      {result.distance} from you · about {result.duration} driving
    </p>
  );
}

export type AddressValidationResult = {
  verdict: "verified" | "fixable" | "unverified";
  standardized?: string;
};

/** USPS-grade check via the Address Validation API. Best-effort: any
 *  API/network problem returns null so forms never block on it. */
export async function validateAddress(address: string): Promise<AddressValidationResult | null> {
  if (!KEY || !address.trim()) return null;
  try {
    const res = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: { regionCode: "US", addressLines: [address] } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const v = data?.result?.verdict;
    const standardized = data?.result?.address?.formattedAddress as string | undefined;
    if (!v) return null;
    if (v.addressComplete && !v.hasUnconfirmedComponents) {
      return { verdict: "verified", standardized };
    }
    if (standardized && standardized.toLowerCase() !== address.trim().toLowerCase()) {
      return { verdict: "fixable", standardized };
    }
    return { verdict: "unverified", standardized };
  } catch {
    return null;
  }
}
