import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Minimal industrial date picker — a quiet bordered field that opens the
 *  calendar in a popover. Value is "yyyy-MM-dd" or "" (cleared). */
export function DatePickerField({
  value,
  onChange,
  max,
  placeholder = "Pick a date",
  clearable = true,
  className,
  testid,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-white px-3 text-left text-sm text-slate-700 transition-colors hover:border-slate-400",
            !value && "text-slate-400",
            className,
          )}
          data-testid={testid}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate">
            {date ? format(date, "EEE, MMM d, yyyy") : placeholder}
          </span>
          {clearable && value && (
            <X
              className="h-3.5 w-3.5 shrink-0 text-slate-300 hover:text-slate-600"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          disabled={max ? { after: new Date(`${max}T23:59:59`) } : undefined}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
