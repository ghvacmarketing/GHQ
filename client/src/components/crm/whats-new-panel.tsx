import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sparkles, ChevronLeft, ChevronRight, Zap, MessageSquare, Gauge, CalendarClock, Megaphone, LayoutDashboard,
} from "lucide-react";

type Feature = { icon: any; title: string; body: string; image?: string };

// Edit this list to post product updates. Drop a screenshot in
// client/public/whats-new/ and set `image` to "/whats-new/<file>.png".
const FEATURES: Feature[] = [
  { icon: Zap, title: "Marketing automations", body: "Build hands-free campaigns: trigger → conditions → actions → timing → safeguards.", image: "/whats-new/automations.png" },
  { icon: MessageSquare, title: "Faster messaging inbox", body: "Instant read receipts, sender names, image messages, and near-real-time inbound texts.", image: "/whats-new/messaging.png" },
  { icon: Gauge, title: "Humidity & temp sensors", body: "Big, clear Govee sensor readouts with live gauges and threshold alerts in Analytics.", image: "/whats-new/sensors.png" },
  { icon: CalendarClock, title: "Cleaner dispatch board", body: "A tidier timeline and a smoother work-order detail panel.", image: "/whats-new/dispatch.png" },
  { icon: Megaphone, title: "Automated messages hub", body: "Edit every built-in text & email and toggle them on or off in one place.", image: "/whats-new/messages.png" },
  { icon: LayoutDashboard, title: "Business analytics", body: "Live revenue, quotes, work orders, and technician performance — wired to real CRM data.", image: "/whats-new/analytics.png" },
];

export function WhatsNewPanel() {
  const [active, setActive] = useState(0);
  const [imgOk, setImgOk] = useState(true);
  const len = FEATURES.length;

  // Auto-advance every 15s. Keyed on `active` so manual navigation resets it.
  useEffect(() => {
    const id = setTimeout(() => setActive((a) => (a + 1) % len), 15000);
    return () => clearTimeout(id);
  }, [active, len]);

  useEffect(() => setImgOk(true), [active]);

  const go = (i: number) => setActive(((i % len) + len) % len);
  const f = FEATURES[active];

  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#711419] to-[#2c0709] text-white lg:flex lg:w-[54%]">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

      <div className="relative z-10 flex w-full flex-col justify-center px-10 py-14 xl:px-16">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
          <Sparkles className="h-3.5 w-3.5" /> What's new in GHQ
        </div>

        {/* Screenshot / preview */}
        <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-2xl">
          <div className="aspect-[16/10] w-full">
            {f.image && imgOk ? (
              <img
                src={f.image}
                alt={f.title}
                onError={() => setImgOk(false)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/10 to-transparent">
                <f.icon className="h-16 w-16 text-white/35" />
              </div>
            )}
          </div>

          {/* Arrows */}
          <button
            onClick={() => go(active - 1)}
            aria-label="Previous"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/90 backdrop-blur transition hover:bg-black/50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => go(active + 1)}
            aria-label="Next"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/90 backdrop-blur transition hover:bg-black/50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Text */}
        <div className="mt-6 max-w-xl">
          <div className="flex items-center gap-2">
            <f.icon className="h-5 w-5" />
            <h3 className="text-xl font-semibold xl:text-2xl">{f.title}</h3>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">{f.body}</p>
        </div>

        {/* Dots */}
        <div className="mt-6 flex gap-2">
          {FEATURES.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Go to update ${i + 1}`}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "w-7 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50")}
            />
          ))}
        </div>

        <p className="mt-9 text-xs text-white/50">giesbrechthvac.com · Powered by GHQ</p>
      </div>
    </div>
  );
}
