import { useEffect, useRef, useState } from "react";
import { addMonths, format, startOfToday } from "date-fns";
import { ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import type { DateRange } from "react-day-picker";

const fmtDay = (d: string) => format(new Date(`${d}T12:00:00`), "MMM d, yyyy");

/** Horizontal swipe on the calendar pages months (left = forward). Taps on
 *  days stay taps — only a clearly sideways motion counts. */
function useMonthSwipe(setMonth: React.Dispatch<React.SetStateAction<Date>>) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const st = start.current;
      start.current = null;
      if (!st) return;
      const dx = e.clientX - st.x;
      const dy = Math.abs(e.clientY - st.y);
      if (Math.abs(dx) > 48 && Math.abs(dx) > dy * 1.4) {
        setMonth((m) => addMonths(m, dx < 0 ? 1 : -1));
      }
    },
  };
}

// One shared look for every mobile calendar: full-width weeks, generous row
// height, floating month arrows, maroon selection.
const CAL_BASE = {
  months: "w-full",
  month: "w-full space-y-4",
  caption: "relative flex items-center justify-center py-1.5",
  caption_label: "text-base font-semibold text-slate-900",
  nav_button:
    "flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-600 shadow-md transition-transform active:scale-95",
  table: "w-full border-collapse",
  head_row: "flex w-full",
  head_cell: "flex-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
  row: "mt-2 flex w-full",
  day: "h-11 w-full rounded-md p-0 text-[15px] font-normal aria-selected:opacity-100",
  day_selected: "bg-[#711419] text-white",
  day_today: "font-bold text-[#711419] aria-selected:text-white",
};

const RANGE_CLASSNAMES = {
  ...CAL_BASE,
  cell: "relative h-11 flex-1 p-0 text-center text-sm [&:has([aria-selected])]:bg-[#711419]/[0.08] [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
  day_range_middle: "aria-selected:bg-transparent aria-selected:text-slate-900",
};

const SINGLE_CLASSNAMES = {
  ...CAL_BASE,
  cell: "relative h-11 flex-1 p-0 text-center text-sm",
};

/** Custom-range picker for mobile filters: a dropdown row that opens its own
 *  bottom sheet holding a full-width month calendar — page through months,
 *  tap once for a single day or twice for a shaded range. Values travel as
 *  yyyy-MM-dd strings (empty = unset). */
export function DateRangeSheet({
  from,
  to,
  onChange,
  label = "Dates",
  open: openProp,
  onOpenChange,
  testid,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
  /** Controlled open (optional) — lets a parent auto-open the calendar the
   *  moment "Custom range" is picked. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testid?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const selected: DateRange | undefined = from
    ? { from: new Date(`${from}T12:00:00`), to: to ? new Date(`${to}T12:00:00`) : undefined }
    : undefined;
  const summary = !from ? "Pick dates" : from === to || !to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`;
  const [month, setMonth] = useState<Date>(new Date());
  const monthSwipe = useMonthSwipe(setMonth);
  useEffect(() => {
    if (open) setMonth(from ? new Date(`${from}T12:00:00`) : new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 px-1 py-4 text-left"
        data-testid={testid}
      >
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-500">
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </span>
      </button>

      <DraggableSheet tall open={open} onOpenChange={setOpen} title={label} testid={testid ? `${testid}-sheet` : undefined}>
        <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
        <p className="mt-1 text-[13px] text-slate-400">Tap once for a single day, twice for a range.</p>

        <div className="mt-5 px-0.5" style={{ touchAction: "pan-y" }} {...monthSwipe}>
          <Calendar
            mode="range"
            selected={selected}
            onSelect={(r) => {
              const f = r?.from ? format(r.from, "yyyy-MM-dd") : "";
              const t = r?.to ? format(r.to, "yyyy-MM-dd") : f;
              onChange(f, t);
            }}
            month={month}
            onMonthChange={setMonth}
            numberOfMonths={1}
            className="w-full p-0"
            classNames={RANGE_CLASSNAMES}
          />
        </div>

        <div className="mt-6 flex items-center gap-2.5 pb-2">
          <button
            onClick={() => onChange("", "")}
            disabled={!from}
            className="h-12 rounded-[4px] border border-slate-300/70 bg-white px-4 text-sm font-semibold text-slate-700 transition-transform active:scale-95 disabled:opacity-40"
            data-testid={testid ? `${testid}-clear` : undefined}
          >
            Clear
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-12 flex-1 rounded-[4px] bg-[#711419] text-base font-semibold text-white transition-transform active:scale-[0.98]"
            data-testid={testid ? `${testid}-done` : undefined}
          >
            Done
          </button>
        </div>
      </DraggableSheet>
    </>
  );
}

/** Single-date picker in the same house style — a boxed form field (or filter
 *  row) that opens a full-width calendar sheet instead of the OS date wheel.
 *  Value travels as a yyyy-MM-dd string (empty = unset). Picking a day closes
 *  the sheet on its own. */
export function DateSheet({
  value,
  onChange,
  label = "Date",
  placeholder = "Pick a date",
  boxed,
  minToday,
  testid,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** Boxed form-field trigger (for create pages) instead of a filter row. */
  boxed?: boolean;
  /** Disallow days in the past. */
  minToday?: boolean;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const [month, setMonth] = useState<Date>(new Date());
  const monthSwipe = useMonthSwipe(setMonth);
  useEffect(() => {
    if (open) setMonth(value ? new Date(`${value}T12:00:00`) : new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {boxed ? (
        <button
          onClick={() => setOpen(true)}
          className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-white px-3.5 text-left shadow-xs"
          data-testid={testid}
        >
          <span className={`truncate text-base ${value ? "text-slate-900" : "text-muted-foreground"}`}>
            {value ? fmtDay(value) : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 px-1 py-4 text-left"
          data-testid={testid}
        >
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-500">
            <span className="truncate">{value ? fmtDay(value) : placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </span>
        </button>
      )}

      <DraggableSheet tall open={open} onOpenChange={setOpen} title={label} testid={testid ? `${testid}-sheet` : undefined}>
        <h2 className="text-lg font-semibold text-slate-900">{label}</h2>

        <div className="mt-5 px-0.5" style={{ touchAction: "pan-y" }} {...monthSwipe}>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              onChange(d ? format(d, "yyyy-MM-dd") : "");
              if (d) setTimeout(() => setOpen(false), 180);
            }}
            month={month}
            onMonthChange={setMonth}
            numberOfMonths={1}
            disabled={minToday ? { before: startOfToday() } : undefined}
            className="w-full p-0"
            classNames={SINGLE_CLASSNAMES}
          />
        </div>

        <div className="mt-6 flex items-center gap-2.5 pb-2">
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            disabled={!value}
            className="h-12 rounded-[4px] border border-slate-300/70 bg-white px-4 text-sm font-semibold text-slate-700 transition-transform active:scale-95 disabled:opacity-40"
            data-testid={testid ? `${testid}-clear` : undefined}
          >
            Clear
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-12 flex-1 rounded-[4px] bg-[#711419] text-base font-semibold text-white transition-transform active:scale-[0.98]"
            data-testid={testid ? `${testid}-done` : undefined}
          >
            Done
          </button>
        </div>
      </DraggableSheet>
    </>
  );
}
