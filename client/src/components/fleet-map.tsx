import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Vehicle {
  id: string;
  vehicleName: string;
  technicianName?: string | null;
  lastLatitude?: string | null;
  lastLongitude?: string | null;
  lastSpeed?: string | null;
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

const truckIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
  <circle cx="12" cy="12" r="11" fill="FILL_COLOR" stroke="white" stroke-width="2"/>
  <path d="M7 16.5C7 17.33 6.33 18 5.5 18S4 17.33 4 16.5 4.67 15 5.5 15s1.5.67 1.5 1.5zM20 16.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5 1.5.67 1.5 1.5zM14 7h3l3 4v4h-2M14 7H4v9h2M7 16h10" 
        fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

function createTruckIcon(isMoving: boolean, isActive: boolean) {
  const color = !isActive ? "#94a3b8" : isMoving ? "#22c55e" : "#711419";
  const svg = truckIconSvg.replace("FILL_COLOR", color);
  
  return L.divIcon({
    html: svg,
    className: "truck-marker",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function FitBounds({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap();
  
  useEffect(() => {
    const validVehicles = vehicles.filter(v => v.lastLatitude && v.lastLongitude);
    if (validVehicles.length === 0) return;
    
    const bounds = L.latLngBounds(
      validVehicles.map(v => [parseFloat(v.lastLatitude!), parseFloat(v.lastLongitude!)] as [number, number])
    );
    
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
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

export function FleetMap({ vehicles, selectedVehicleId, onVehicleClick }: FleetMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  
  const vehiclesWithLocation = vehicles.filter(v => v.lastLatitude && v.lastLongitude);
  
  if (vehiclesWithLocation.length === 0) {
    return (
      <div className="flex-1 bg-slate-100 flex items-center justify-center min-h-[400px]">
        <div className="text-center p-8">
          <svg className="h-16 w-16 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-slate-600 mb-2">No Location Data</h3>
          <p className="text-sm text-slate-500 max-w-md">
            Your vehicles don't have location data yet. Click "Sync Vehicles" in Fleet Settings to update positions.
          </p>
        </div>
      </div>
    );
  }
  
  const defaultCenter: [number, number] = [
    parseFloat(vehiclesWithLocation[0].lastLatitude!),
    parseFloat(vehiclesWithLocation[0].lastLongitude!)
  ];
  
  return (
    <div className="flex-1 min-h-[400px] relative">
      <style>{`
        .truck-marker {
          background: none;
          border: none;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px;
        }
        .leaflet-popup-content {
          margin: 12px;
        }
      `}</style>
      <MapContainer
        center={defaultCenter}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds vehicles={vehiclesWithLocation} />
        
        {vehiclesWithLocation.map(vehicle => {
          const lat = parseFloat(vehicle.lastLatitude!);
          const lng = parseFloat(vehicle.lastLongitude!);
          const speed = vehicle.lastSpeed ? parseFloat(vehicle.lastSpeed) : 0;
          const isMoving = speed > 0;
          
          return (
            <Marker
              key={vehicle.id}
              position={[lat, lng]}
              icon={createTruckIcon(isMoving, vehicle.isActive !== false)}
              eventHandlers={{
                click: () => onVehicleClick?.(vehicle.id),
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="font-semibold text-slate-800 mb-1">{vehicle.vehicleName}</div>
                  {vehicle.technicianName && (
                    <div className="text-sm text-slate-600 mb-2">
                      Assigned to: {vehicle.technicianName}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 space-y-1">
                    {vehicle.vehicleMake && vehicle.vehicleModel && (
                      <div>{vehicle.vehicleYear} {vehicle.vehicleMake} {vehicle.vehicleModel}</div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 ${isMoving ? 'text-green-600' : 'text-slate-500'}`}>
                        {isMoving ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Moving at {Math.round(speed)} mph
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                            Parked
                          </>
                        )}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      Updated: {formatTimeAgo(vehicle.lastLocationUpdatedAt)}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
