import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  Sun,
  Sunrise,
  Thermometer,
  Wind,
} from "lucide-react";

/** Service-area weather for dispatchers: current conditions, the next 12
 *  hours, a 7-day outlook with work-risk flags (heat/freeze/storms/rain), and
 *  a switcher across the dispatch area — Augusta ±20 miles and Wrens ±30
 *  miles. Styled like the rest of the CRM: white cards, uppercase labels,
 *  quiet slate with maroon accents. */

interface WeatherPeriod {
  name: string;
  temperature: number;
  shortForecast: string;
  isDaytime: boolean;
  startTime?: string;
  rainChance?: number;
}

interface WeatherCurrent extends WeatherPeriod {
  feelslikeF?: number;
  humidity?: number;
  windMph?: number;
  windDir?: string;
  precipIn?: number;
  uv?: number;
}

interface WeatherAlert {
  properties: { headline: string; severity: string; event: string; description: string; expires: string };
}

interface WeatherLocationInfo {
  slug: string;
  name: string;
  region: string;
  group: string;
}

interface WeatherPayload {
  forecast: { properties: { periods: WeatherPeriod[] }; current?: WeatherCurrent | null };
  hourly: { properties: { periods: WeatherPeriod[] } };
  alerts: { features: WeatherAlert[] };
  fetchedAt: string;
  stale: boolean;
  location?: WeatherLocationInfo;
}

function WeatherIcon({ condition, isDaytime, className }: { condition: string; isDaytime: boolean; className: string }) {
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return <CloudLightning className={`${className} text-purple-500`} />;
  if (c.includes("snow") || c.includes("sleet") || c.includes("ice") || c.includes("blizzard")) return <CloudSnow className={`${className} text-sky-400`} />;
  if (c.includes("rain") || c.includes("shower") || c.includes("drizzle")) return <CloudRain className={`${className} text-blue-500`} />;
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return <CloudFog className={`${className} text-slate-400`} />;
  if (c.includes("partly") || c.includes("part sun")) return <CloudSun className={`${className} text-amber-500`} />;
  if (c.includes("cloud") || c.includes("overcast")) return <Cloud className={`${className} text-slate-400`} />;
  return isDaytime ? <Sun className={`${className} text-amber-500`} /> : <Moon className={`${className} text-indigo-400`} />;
}

/** Dispatcher work-risk flag for a day. */
function dayRisk(high: number | null, low: number | null, condition: string, rainChance: number) {
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return { label: "Storms", cls: "bg-purple-100 text-purple-700" };
  if (low !== null && low <= 32) return { label: "Freeze", cls: "bg-sky-100 text-sky-700" };
  if (high !== null && high >= 95) return { label: "Heat", cls: "bg-red-100 text-red-700" };
  if (rainChance >= 60) return { label: "Rain", cls: "bg-blue-100 text-blue-700" };
  return null;
}

function StatChip({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

export function WeatherPanel() {
  const [slug, setSlug] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("dispatchWeatherCity")) || "wrens",
  );
  const [alertsOpen, setAlertsOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem("dispatchWeatherCity", slug);
  }, [slug]);

  const { data: locations = [] } = useQuery<WeatherLocationInfo[]>({
    queryKey: ["/api/weather/locations"],
    staleTime: Infinity,
  });

  const { data: weather, isLoading } = useQuery<WeatherPayload>({
    queryKey: [`/api/weather?location=${slug}`],
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60 * 5,
    retry: false,
  });

  const groups = locations.reduce<Record<string, WeatherLocationInfo[]>>((acc, l) => {
    (acc[l.group] ||= []).push(l);
    return acc;
  }, {});

  const periods = weather?.forecast?.properties?.periods || [];
  const current = weather?.forecast?.current || periods[0];
  const alerts = weather?.alerts?.features || [];

  // Merge day/night forecast periods into daily columns.
  const days: { day: string; high: number | null; low: number | null; condition: string; rainChance: number }[] = [];
  for (const p of periods) {
    const dayName = p.name.replace(/ Night$/, "").replace("Tonight", "Today");
    const existing = days.find((d) => d.day === dayName);
    if (existing) {
      if (p.isDaytime) existing.high = p.temperature;
      else existing.low = p.temperature;
    } else {
      days.push({
        day: dayName,
        high: p.isDaytime ? p.temperature : null,
        low: !p.isDaytime ? p.temperature : null,
        condition: p.shortForecast,
        rainChance: p.rainChance ?? 0,
      });
    }
  }

  // Next 12 hours starting from now.
  const nowMs = Date.now();
  const hours = (weather?.hourly?.properties?.periods || [])
    .filter((h) => h.startTime && new Date(h.startTime).getTime() >= nowMs - 30 * 60 * 1000)
    .slice(0, 12);

  const locationLabel = weather?.location ? `${weather.location.name}, ${weather.location.region}` : "";

  return (
    <Card className="border shadow-sm" data-testid="weather-panel">
      <CardContent className="p-6">
        {/* Header: identity + city switcher */}
        <div className="mb-6 flex flex-wrap items-start gap-4">
          <div className="p-3 bg-sky-100 rounded-full">
            <CloudSun className="h-6 w-6 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Service Area Weather</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {locationLabel}
              {weather?.fetchedAt && (
                <>
                  {" · "}
                  <span className={weather.stale ? "font-semibold text-amber-600" : ""}>
                    {weather.stale ? "Stale — refreshing · " : ""}
                    Updated {new Date(weather.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </>
              )}
            </p>
          </div>
          <Select value={slug} onValueChange={setSlug}>
            <SelectTrigger className="h-9 w-[190px]" data-testid="weather-city-select">
              <MapPin className="mr-1 h-3.5 w-3.5 text-slate-400" />
              <SelectValue placeholder="Pick a city" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(groups).map(([group, items]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {items.map((l) => (
                    <SelectItem key={l.slug} value={l.slug} data-testid={`weather-city-${l.slug}`}>
                      {l.name}, {l.region}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading || !weather ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-400">
            <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
            {isLoading ? "Loading weather..." : "Weather unavailable right now"}
          </div>
        ) : (
          <>
            {/* Severe weather alerts */}
            {alerts.length > 0 && (
              <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen} className="mb-4">
                <CollapsibleTrigger asChild>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-red-700 transition-colors hover:bg-red-100"
                    data-testid="weather-alerts-toggle"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate text-left text-sm font-semibold">
                      {alerts.length} weather alert{alerts.length > 1 ? "s" : ""} for {locationLabel}
                    </span>
                    {alertsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-2 rounded-lg border border-red-200/60 bg-red-50/50 p-3">
                    {alerts.slice(0, 4).map((a, i) => (
                      <div key={i} className="text-sm text-red-700">
                        <p className="font-semibold">{a.properties.event || "Alert"}</p>
                        <p className="text-xs text-red-600/90">{a.properties.headline}</p>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Current conditions hero */}
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-4">
                {current && <WeatherIcon condition={current.shortForecast} isDaytime={current.isDaytime} className="h-12 w-12" />}
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-slate-900" data-testid="weather-current-temp">
                      {current?.temperature ?? "—"}°
                    </span>
                    <span className="text-sm font-medium text-slate-500">{current?.shortForecast}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Right now</p>
                </div>
              </div>
              <div className="flex flex-1 flex-wrap justify-end gap-2">
                {typeof (current as WeatherCurrent)?.feelslikeF === "number" && (
                  <StatChip icon={Thermometer} label="Feels like" value={`${(current as WeatherCurrent).feelslikeF}°`} />
                )}
                {typeof (current as WeatherCurrent)?.humidity === "number" && (
                  <StatChip icon={Droplets} label="Humidity" value={`${(current as WeatherCurrent).humidity}%`} />
                )}
                {typeof (current as WeatherCurrent)?.windMph === "number" && (
                  <StatChip icon={Wind} label="Wind" value={`${(current as WeatherCurrent).windDir || ""} ${(current as WeatherCurrent).windMph} mph`.trim()} />
                )}
                {typeof (current as WeatherCurrent)?.uv === "number" && (
                  <StatChip icon={Sunrise} label="UV index" value={`${(current as WeatherCurrent).uv}`} />
                )}
              </div>
            </div>

            {/* Next 12 hours */}
            {hours.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Next 12 hours</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {hours.map((h, i) => (
                    <div
                      key={i}
                      className="flex min-w-[64px] flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2.5"
                      data-testid={`weather-hour-${i}`}
                    >
                      <span className="text-[10px] font-semibold uppercase text-slate-400">
                        {h.startTime ? new Date(h.startTime).toLocaleTimeString([], { hour: "numeric" }) : ""}
                      </span>
                      <WeatherIcon condition={h.shortForecast} isDaytime={h.isDaytime} className="h-4.5 w-4.5" />
                      <span className="text-sm font-semibold text-slate-900">{h.temperature}°</span>
                      {(h.rainChance ?? 0) >= 20 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600">
                          <Droplets className="h-2.5 w-2.5" />
                          {h.rainChance}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7-day outlook with dispatcher risk flags */}
            {days.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">7-day outlook</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {days.slice(0, 7).map((d, i) => {
                    const risk = dayRisk(d.high, d.low, d.condition, d.rainChance);
                    return (
                      <div
                        key={i}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-center ${
                          i === 0 ? "border-[#711419]/30 bg-[#711419]/[0.04]" : "border-slate-200 bg-white"
                        }`}
                        data-testid={`weather-day-${i}`}
                      >
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${i === 0 ? "text-[#711419]" : "text-slate-400"}`}>
                          {d.day.slice(0, 3)}
                        </span>
                        <WeatherIcon condition={d.condition} isDaytime className="h-5 w-5" />
                        <div className="flex items-baseline gap-1 text-sm leading-tight">
                          {d.high !== null && <span className="font-semibold text-slate-900">{d.high}°</span>}
                          {d.low !== null && <span className="text-xs text-slate-400">{d.low}°</span>}
                        </div>
                        {d.rainChance >= 40 && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600">
                            <Droplets className="h-2.5 w-2.5" />
                            {d.rainChance}%
                          </span>
                        )}
                        {risk && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${risk.cls}`}>{risk.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default WeatherPanel;
