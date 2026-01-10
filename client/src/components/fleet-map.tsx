import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
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

function createLabeledTruckIcon(vehicleName: string, technicianName: string | null | undefined, isMoving: boolean, isActive: boolean, isSelected: boolean) {
  const bgColor = !isActive ? "#94a3b8" : isMoving ? "#22c55e" : "#711419";
  const statusDot = isMoving 
    ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:4px;animation:pulse 1.5s infinite;"></span>'
    : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#94a3b8;margin-right:4px;"></span>';
  
  const shortName = vehicleName.length > 20 ? vehicleName.substring(0, 18) + '...' : vehicleName;
  const techDisplay = technicianName ? technicianName.split(' ')[0] : 'Unassigned';
  
  const borderStyle = isSelected ? '3px solid #2563eb' : '2px solid white';
  const shadowStyle = isSelected ? '0 4px 12px rgba(37, 99, 235, 0.4)' : '0 2px 8px rgba(0,0,0,0.3)';
  
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
      <div style="
        background:${bgColor};
        color:white;
        padding:6px 10px;
        border-radius:8px;
        font-size:11px;
        font-weight:600;
        white-space:nowrap;
        box-shadow:${shadowStyle};
        border:${borderStyle};
        min-width:80px;
        text-align:center;
      ">
        <div style="display:flex;align-items:center;justify-content:center;gap:2px;">
          ${statusDot}
          <span>${shortName}</span>
        </div>
        <div style="font-size:10px;font-weight:400;opacity:0.9;margin-top:2px;">
          ${techDisplay}
        </div>
      </div>
      <div style="
        width:0;
        height:0;
        border-left:8px solid transparent;
        border-right:8px solid transparent;
        border-top:8px solid ${bgColor};
        margin-top:-1px;
      "></div>
    </div>
  `;
  
  return L.divIcon({
    html,
    className: "truck-label-marker",
    iconSize: [120, 60],
    iconAnchor: [60, 60],
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
    
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12 });
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
        .truck-label-marker {
          background: none !important;
          border: none !important;
        }
        .leaflet-tooltip {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          font-size: 12px;
        }
        .leaflet-tooltip-top:before {
          border-top-color: #e2e8f0;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <MapContainer
        center={defaultCenter}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />
        <FitBounds vehicles={vehiclesWithLocation} />
        
        {vehiclesWithLocation.map(vehicle => {
          const lat = parseFloat(vehicle.lastLatitude!);
          const lng = parseFloat(vehicle.lastLongitude!);
          const speed = vehicle.lastSpeed ? parseFloat(vehicle.lastSpeed) : 0;
          const isMoving = speed > 0;
          const isSelected = selectedVehicleId === vehicle.id;
          
          return (
            <Marker
              key={vehicle.id}
              position={[lat, lng]}
              icon={createLabeledTruckIcon(
                vehicle.vehicleName,
                vehicle.technicianName,
                isMoving,
                vehicle.isActive !== false,
                isSelected
              )}
              eventHandlers={{
                click: () => onVehicleClick?.(vehicle.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -65]} opacity={1}>
                <div className="min-w-[180px]">
                  <div className="font-semibold text-slate-800 mb-1">{vehicle.vehicleName}</div>
                  {vehicle.vehicleMake && vehicle.vehicleModel && (
                    <div className="text-xs text-slate-500 mb-1">
                      {vehicle.vehicleYear} {vehicle.vehicleMake} {vehicle.vehicleModel}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    {isMoving ? (
                      <span className="text-green-600 font-medium">Moving at {Math.round(speed)} mph</span>
                    ) : (
                      <span className="text-slate-500">Parked</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Updated: {formatTimeAgo(vehicle.lastLocationUpdatedAt)}
                  </div>
                  <div className="text-xs text-blue-600 mt-2 font-medium">
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
