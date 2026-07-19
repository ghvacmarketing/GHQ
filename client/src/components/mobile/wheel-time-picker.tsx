import { useEffect, useRef } from "react";

// Alarm-style scroll wheels for picking a time on touch screens. Each column is
// a scroll-snap list; the row resting in the center band is the selected value.

const ITEM_H = 36;
const WHEEL_H = 148;
const PAD = (WHEEL_H - ITEM_H) / 2;

type Option = { value: string; label: string };

function Wheel({
  options, value, onChange, className = "", testId,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const programmatic = useRef(false);

  // Keep the selected row centered when the value changes from outside.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 1) {
      programmatic.current = true;
      el.scrollTo({ top: target });
      window.setTimeout(() => { programmatic.current = false; }, 120);
    }
  }, [value, options]);

  const onScroll = () => {
    if (programmatic.current) return;
    const el = ref.current;
    if (!el) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const idx = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
      const opt = options[idx];
      if (opt && opt.value !== value) onChange(opt.value);
    }, 100);
  };

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height: WHEEL_H }}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingTop: PAD, paddingBottom: PAD }}
        data-testid={testId}
      >
        {options.map((o) => (
          <div
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex snap-center items-center justify-center text-base tabular-nums transition-colors ${
              o.value === value ? "font-semibold text-slate-900" : "text-slate-400"
            }`}
            style={{ height: ITEM_H }}
          >
            {o.label}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}

export function WheelTimePicker({
  value, onChange, stepMinutes, testId,
}: {
  value: string; // "HH:mm" (24h); "" shows the default position
  onChange: (v: string) => void;
  stepMinutes: number;
  testId?: string;
}) {
  const [h24, min] = (value || "09:00").split(":").map(Number);
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  // Snap a value that predates an increment change onto the current grid.
  const snappedMin = Math.min(59, Math.round(min / stepMinutes) * stepMinutes) % 60;

  const hourOptions: Option[] = Array.from({ length: 12 }, (_, i) => {
    const h = i + 1;
    return { value: String(h), label: String(h) };
  });
  const minuteOptions: Option[] = [];
  for (let m = 0; m < 60; m += stepMinutes) {
    minuteOptions.push({ value: String(m), label: String(m).padStart(2, "0") });
  }
  const periodOptions: Option[] = [
    { value: "AM", label: "AM" },
    { value: "PM", label: "PM" },
  ];

  const commit = (nextH12: number, nextMin: number, nextPeriod: "AM" | "PM") => {
    let h = nextH12 % 12;
    if (nextPeriod === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${String(nextMin).padStart(2, "0")}`);
  };

  return (
    <div className="relative flex items-stretch rounded-xl border border-slate-200 bg-white px-2" data-testid={testId}>
      {/* One continuous selection band across all columns */}
      <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-lg bg-slate-100" style={{ height: ITEM_H }} />
      <Wheel
        options={hourOptions}
        value={String(h12)}
        onChange={(v) => commit(Number(v), snappedMin, period)}
        className="flex-1"
      />
      <div className="flex items-center text-lg font-semibold text-slate-300">:</div>
      <Wheel
        options={minuteOptions}
        value={String(snappedMin)}
        onChange={(v) => commit(h12, Number(v), period)}
        className="flex-1"
      />
      <Wheel
        options={periodOptions}
        value={period}
        onChange={(v) => commit(h12, snappedMin, v as "AM" | "PM")}
        className="w-14"
      />
    </div>
  );
}
