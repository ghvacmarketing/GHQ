import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";
import type { DateRange } from "react-day-picker";

const fmtDay = (d: string) => format(new Date(`${d}T12:00:00`), "MMM d, yyyy");

/** Custom-range picker for mobile filters: a dropdown row that opens its own
 *  bottom sheet holding a full-width month calendar — page through months,
 *  tap once for a single day or twice for a shaded range. Values travel as
 *  yyyy-MM-dd strings (empty = unset). */
export function DateRangeSheet({
  from,
  to,
  onChange,
  label = "Dates",
  testid,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined = from
    ? { from: new Date(`${from}T12:00:00`), to: to ? new Date(`${to}T12:00:00`) : undefined }
    : undefined;
  const summary = !from ? "Pick dates" : from === to || !to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`;

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
        <p className="mt-0.5 text-sm text-slate-500">Tap once for a single day, twice for a range.</p>

        <div className="mt-3">
          <Calendar
            mode="range"
            selected={selected}
            onSelect={(r) => {
              const f = r?.from ? format(r.from, "yyyy-MM-dd") : "";
              const t = r?.to ? format(r.to, "yyyy-MM-dd") : f;
              onChange(f, t);
            }}
            defaultMonth={selected?.from ?? new Date()}
            numberOfMonths={1}
            className="w-full p-0"
            classNames={{
              months: "w-full",
              month: "w-full space-y-3",
              caption: "relative flex items-center justify-center pt-1",
              caption_label: "text-base font-semibold text-slate-900",
              nav_button: "flex h-9 w-9 items-center justify-center rounded-[4px] border border-slate-300/70 bg-white text-slate-600 transition-transform active:scale-95",
              table: "w-full border-collapse",
              head_row: "flex w-full",
              head_cell: "flex-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
              row: "mt-1.5 flex w-full",
              cell: "relative h-11 flex-1 p-0 text-center text-sm [&:has([aria-selected])]:bg-[#711419]/[0.08] [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
              day: "h-11 w-full rounded-md p-0 text-[15px] font-normal aria-selected:opacity-100",
              day_selected: "bg-[#711419] text-white",
              day_range_middle: "aria-selected:bg-transparent aria-selected:text-slate-900",
              day_today: "font-bold text-[#711419] aria-selected:text-white",
            }}
          />
        </div>

        <div className="mt-4 flex items-center gap-2 pb-2">
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
