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
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<any>(null);
  const markerObj = useRef<any>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

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
            if (c) setCoords(c);
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

  // Live mini-map pin once we have coordinates
  useEffect(() => {
    if (!showMap || !coords || !mapRef.current) return;
    (async () => {
      try {
        const g = (window as any).google;
        const { Map } = await g.maps.importLibrary("maps");
        const { AdvancedMarkerElement } = await g.maps.importLibrary("marker").catch(() => ({ AdvancedMarkerElement: null }));
        if (!mapObj.current) {
          mapObj.current = new Map(mapRef.current, {
            center: coords,
            zoom: 16,
            disableDefaultUI: true,
            gestureHandling: "none",
            mapId: "GHQ_CREATE_MAP",
          });
        } else {
          mapObj.current.setCenter(coords);
        }
        if (AdvancedMarkerElement) {
          if (markerObj.current) markerObj.current.map = null;
          markerObj.current = new AdvancedMarkerElement({ map: mapObj.current, position: coords });
        }
      } catch {
        /* map preview is decoration — never block the form */
      }
    })();
  }, [coords, showMap]);

  if (ready === false || !KEY) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Street, city, state ZIP"
        className="w-full rounded-xl border-0 bg-white/90 px-4 py-3 text-[16px] text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
        data-testid={testid}
      />
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
      {showMap && coords && (
        <div ref={mapRef} className="mt-2 h-36 w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm" data-testid={testid ? `${testid}-map` : undefined} />
      )}
    </div>
  );
}
