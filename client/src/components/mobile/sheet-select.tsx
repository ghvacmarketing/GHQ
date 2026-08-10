import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DraggableSheet } from "@/components/mobile/draggable-sheet";

/** A dropdown row for filter sheets: label left, current value right.
 *  Tapping it pops ANOTHER bottom sheet listing the options — no inline
 *  chip clusters. */
export function SheetSelect({
  label,
  value,
  options,
  onChange,
  boxed,
  placeholder = "Choose…",
  testid,
}: {
  label: string;
  value: string;
  options: Array<{ key: string; label: string; img?: string }>;
  onChange: (key: string) => void;
  /** Boxed form-field trigger (for create pages) instead of a filter row. */
  boxed?: boolean;
  placeholder?: string;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);
  return (
    <>
      {boxed ? (
        <button
          onClick={() => setOpen(true)}
          className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-white px-3.5 text-left shadow-xs"
          data-testid={testid}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {current?.img && <img src={current.img} alt="" className="h-6 w-6 shrink-0 select-none" draggable={false} />}
            <span className={`truncate text-base ${current ? "text-slate-900" : "text-muted-foreground"}`}>
              {current?.label ?? placeholder}
            </span>
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
            {current?.img && <img src={current.img} alt="" className="h-5 w-5 select-none" draggable={false} />}
            <span className="truncate">{current?.label ?? value}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </span>
        </button>
      )}

      <DraggableSheet nested open={open} onOpenChange={setOpen} title={label} testid={testid ? `${testid}-options` : undefined}>
        <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
        <div className="mt-2 divide-y divide-slate-200/80">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-1 py-3.5 text-left active:bg-slate-50"

              data-testid={testid ? `${testid}-${o.key}` : undefined}
            >
              {o.img && <img src={o.img} alt="" className="h-6 w-6 shrink-0 select-none" draggable={false} />}
              <span className={`min-w-0 flex-1 text-sm ${o.key === value ? "font-semibold text-[#711419]" : "text-slate-800"}`}>
                {o.label}
              </span>
              {o.key === value && <Check className="h-4 w-4 shrink-0 text-[#711419]" />}
            </button>
          ))}
        </div>
      </DraggableSheet>
    </>
  );
}
