import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

/** Custom-range picker for mobile filters: a full month calendar you page
 *  through, tap once for a single day or twice for a shaded range. Values
 *  travel as yyyy-MM-dd strings (empty = unset). */
export function DateRangeCalendar({
  from,
  to,
  onChange,
  testid,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  testid?: string;
}) {
  const selected: DateRange | undefined = from
    ? { from: new Date(`${from}T12:00:00`), to: to ? new Date(`${to}T12:00:00`) : undefined }
    : undefined;

  return (
    <div className="rounded-[4px] border border-slate-300/70 bg-white py-1" data-testid={testid}>
      <Calendar
        mode="range"
        selected={selected}
        onSelect={(r) => {
          const f = r?.from ? format(r.from, "yyyy-MM-dd") : "";
          // A single tap is a single-day range until a second tap extends it
          const t = r?.to ? format(r.to, "yyyy-MM-dd") : f;
          onChange(f, t);
        }}
        defaultMonth={selected?.from ?? new Date()}
        numberOfMonths={1}
        className="mx-auto"
      />
      {from && (
        <p className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-500">
          {from === to || !to
            ? format(new Date(`${from}T12:00:00`), "EEE, MMM d, yyyy")
            : `${format(new Date(`${from}T12:00:00`), "MMM d, yyyy")} → ${format(new Date(`${to}T12:00:00`), "MMM d, yyyy")}`}
          <button onClick={() => onChange("", "")} className="ml-2 font-semibold text-[#711419]">
            Clear dates
          </button>
        </p>
      )}
    </div>
  );
}
