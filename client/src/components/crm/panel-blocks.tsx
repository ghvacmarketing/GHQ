/** Detail-panel building blocks shared by the dispatch work-order drawer and
 *  the messaging customer rail: grouped white info cards on a grey canvas,
 *  each with an uppercase header and icon rows (label above value). */

export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[4px] border border-slate-300/70 bg-white p-3.5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function PanelRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-400">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-slate-900">{children}</div>
      </div>
    </div>
  );
}
