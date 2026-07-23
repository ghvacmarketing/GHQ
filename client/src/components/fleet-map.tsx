import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import { Navigation, MapPin } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Vehicle {
  id: string;
  vehicleName: string;
  technicianName?: string | null;
  lastLatitude?: string | null;
  lastLongitude?: string | null;
  lastSpeed?: string | null;
  lastHeading?: number | null;
  lastLocationUpdatedAt?: Date | string | null;
  isActive?: boolean;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: string | null;
}

interface FleetMapProps {
  vehicles: Vehicle[];
  selectedVehicleId?: string | null;
  onVehicleClick?: (vehicleId: string) => void;
}

// Brand-aligned status palette (see index.css: primary #711419, coral accent).
const STATUS = {
  moving: "#16a34a", // green — actively driving
  idle: "#711419", // brand maroon — online but parked
  offline: "#94a3b8", // slate — no recent signal
} as const;
const SELECTED_RING = "#e8704f"; // brand coral accent

type VehicleStatus = keyof typeof STATUS;

function statusOf(isActive: boolean, isMoving: boolean): VehicleStatus {
  if (!isActive) return "offline";
  return isMoving ? "moving" : "idle";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createVehicleMarker(
  vehicleName: string,
  technicianName: string | null | undefined,
  heading: number,
  isMoving: boolean,
  isActive: boolean,
  isSelected: boolean,
) {
  const status = statusOf(isActive, isMoving);
  const color = STATUS[status];
  const label = (technicianName || vehicleName || "").trim();
  const shortName = label.length > 16 ? label.substring(0, 15) + "…" : label;

  const ringColor = isSelected ? SELECTED_RING : "rgba(255,255,255,0.95)";
  const ringWidth = isSelected ? 3 : 2.5;
  const scale = isSelected ? 1.14 : 1;
  const shadow = isSelected
    ? "box-shadow: 0 0 0 4px rgba(232,112,79,0.28), 0 6px 14px rgba(0,0,0,0.28);"
    : "box-shadow: 0 3px 8px rgba(0,0,0,0.26);";
  const pulse = isMoving && isActive ? `<span class="fm-pulse" style="background:${color};"></span>` : "";

  const html = `
    <div class="fm-marker" style="transform: scale(${scale});">
      <div class="fm-badge" style="background:${color}; border:${ringWidth}px solid ${ringColor}; ${shadow}">
        ${pulse}
        <svg class="fm-arrow" viewBox="0 0 24 24" fill="#ffffff" style="transform: rotate(${heading || 0}deg);">
          <path d="M12 2.5 19 20l-7-3.9L5 20z"/>
        </svg>
      </div>
      <div class="fm-label">${escapeHtml(shortName)}</div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "fm-divicon",
    iconSize: [92, 58],
    iconAnchor: [46, 18],
  });
}

function FitBounds({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap();

  useEffect(() => {
    const validVehicles = vehicles.filter((v) => v.lastLatitude && v.lastLongitude);
    if (validVehicles.length === 0) return;

    const bounds = L.latLngBounds(
      validVehicles.map(
        (v) => [parseFloat(v.lastLatitude!), parseFloat(v.lastLongitude!)] as [number, number],
      ),
    );

    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 13 });
  }, [vehicles, map]);

  return null;
}

function formatTimeAgo(date: Date | string | null | undefined): string {
  if (!date) return "Unknown";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const MAP_STYLES = `
  .fm-divicon { background: none !important; border: none !important; }
  .fm-marker {
    display: flex; flex-direction: column; align-items: center;
    transition: transform 0.15s ease; will-change: transform;
  }
  .fm-badge {
    position: relative; width: 34px; height: 34px; border-radius: 9999px;
    display: flex; align-items: center; justify-content: center;
  }
  .fm-arrow {
    position: relative; z-index: 2; width: 17px; height: 17px;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3));
    transition: transform 0.3s ease;
  }
  .fm-label {
    margin-top: 4px; max-width: 92px; overflow: hidden; text-overflow: ellipsis;
    background: #ffffff; color: #1a1a1a;
    font-family: 'Poppins', sans-serif; font-size: 10px; font-weight: 600; line-height: 1.2;
    padding: 2px 7px; border-radius: 9999px; white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.18); border: 1px solid rgba(0,0,0,0.05);
  }
  .fm-pulse {
    position: absolute; inset: 0; border-radius: 9999px; opacity: 0.5;
    animation: fm-pulse 1.7s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes fm-pulse {
    0% { transform: scale(1); opacity: 0.5; }
    70% { transform: scale(2.4); opacity: 0; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  .leaflet-container { background: #eef0f2; font-family: 'Poppins', sans-serif; }
  .leaflet-tooltip.fm-tooltip {
    background: #ffffff; border: none; border-radius: 12px;
    padding: 10px 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.16);
    font-family: 'Poppins', sans-serif;
  }
  .leaflet-tooltip.fm-tooltip:before { display: none; }
  .leaflet-control-zoom a {
    border-radius: 8px !important; color: #711419 !important;
    font-weight: 600; border: 1px solid #ececec !important;
  }
  .leaflet-control-zoom { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.12); border-radius: 8px; overflow: hidden; }
  .leaflet-bar a + a { margin-top: 2px; }
`;

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 0 2px ${color}22` }}
    />
  );
}

export function FleetMap({ vehicles, selectedVehicleId, onVehicleClick }: FleetMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  const vehiclesWithLocation = useMemo(
    () => vehicles.filter((v) => v.lastLatitude && v.lastLongitude),
    [vehicles],
  );

  const counts = useMemo(() => {
    let moving = 0;
    let idle = 0;
    let offline = 0;
    for (const v of vehiclesWithLocation) {
      const isActive = v.isActive !== false;
      const isMoving = (v.lastSpeed ? parseFloat(v.lastSpeed) : 0) > 0;
      const s = statusOf(isActive, isMoving);
      if (s === "moving") moving++;
      else if (s === "idle") idle++;
      else offline++;
    }
    return { moving, idle, offline, total: vehiclesWithLocation.length };
  }, [vehiclesWithLocation]);

  if (vehiclesWithLocation.length === 0) {
    return (
      <div className="flex-1 min-h-[400px] flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center p-8 max-w-md">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-[#711419]/10">
            <MapPin className="h-8 w-8 text-[#711419]" strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-1.5">No location data yet</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your vehicles haven't reported a position. Open{" "}
            <span className="font-medium text-slate-700">Fleet Settings</span> and click{" "}
            <span className="font-medium text-slate-700">Sync Vehicles</span> to pull live
            locations from Bouncie.
          </p>
        </div>
      </div>
    );
  }

  const defaultCenter: [number, number] = [
    parseFloat(vehiclesWithLocation[0].lastLatitude!),
    parseFloat(vehiclesWithLocation[0].lastLongitude!),
  ];

  return (
    // `isolate` traps Leaflet's internal z-indexes (controls/panes go up to
    // 1000) inside this stacking context, so they can't paint over the portaled
    // detail Sheet (z-50) and overlap the side panel.
    <div className="flex-1 min-h-[400px] relative isolate">
      <style>{MAP_STYLES}</style>

      {/* Live fleet summary — top left */}
      <div className="absolute top-3 left-3 z-[1000] pointer-events-none">
        <div className="flex items-center gap-2 rounded-lg bg-white/95 backdrop-blur px-3 py-2 shadow-lg ring-1 ring-black/5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-xs font-semibold text-slate-800">{counts.total} vehicles</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs font-medium text-green-600">{counts.moving} moving</span>
        </div>
      </div>

      {/* Legend — bottom left */}
      <div className="absolute bottom-4 left-3 z-[1000] pointer-events-none">
        <div className="rounded-lg bg-white/95 backdrop-blur px-3 py-2.5 shadow-lg ring-1 ring-black/5 space-y-1.5">
          <div className="flex items-center gap-2">
            <StatusDot color={STATUS.moving} />
            <span className="text-[11px] font-medium text-slate-600">Moving</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot color={STATUS.idle} />
            <span className="text-[11px] font-medium text-slate-600">Parked</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot color={STATUS.offline} />
            <span className="text-[11px] font-medium text-slate-600">Offline</span>
          </div>
        </div>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />
        <FitBounds vehicles={vehiclesWithLocation} />

        {vehiclesWithLocation.map((vehicle) => {
          const lat = parseFloat(vehicle.lastLatitude!);
          const lng = parseFloat(vehicle.lastLongitude!);
          const speed = vehicle.lastSpeed ? parseFloat(vehicle.lastSpeed) : 0;
          const heading = vehicle.lastHeading || 0;
          const isMoving = speed > 0;
          const isActive = vehicle.isActive !== false;
          const isSelected = selectedVehicleId === vehicle.id;
          const status = statusOf(isActive, isMoving);

          return (
            <Marker
              key={vehicle.id}
              position={[lat, lng]}
              zIndexOffset={isSelected ? 1000 : 0}
              icon={createVehicleMarker(
                vehicle.vehicleName,
                vehicle.technicianName,
                heading,
                isMoving,
                isActive,
                isSelected,
              )}
              eventHandlers={{
                click: () => onVehicleClick?.(vehicle.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -22]} opacity={1} className="fm-tooltip">
                <div className="min-w-[190px]">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="font-semibold text-slate-900 text-[13px]">
                      {vehicle.technicianName || vehicle.vehicleName}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: `${STATUS[status]}1a`, color: STATUS[status] }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: STATUS[status] }}
                      />
                      {status === "moving" ? "Moving" : status === "idle" ? "Parked" : "Offline"}
                    </span>
                  </div>
                  {vehicle.technicianName && (
                    <div className="text-[11px] text-slate-500 mb-0.5">{vehicle.vehicleName}</div>
                  )}
                  {vehicle.vehicleMake && vehicle.vehicleModel && (
                    <div className="text-[11px] text-slate-400 mb-1">
                      {vehicle.vehicleYear} {vehicle.vehicleMake} {vehicle.vehicleModel}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <Navigation className="h-3 w-3" style={{ color: STATUS[status] }} />
                    {isMoving ? `${Math.round(speed)} mph` : "Stationary"}
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">
                      {formatTimeAgo(vehicle.lastLocationUpdatedAt)}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] font-medium text-[#711419]">
                    Click for details →
                  </div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
