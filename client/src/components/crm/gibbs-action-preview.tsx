import { useMemo } from "react";
import { Calendar, MessageSquare, User, Wrench } from "lucide-react";

/** Live previews for Gibbs' proposed actions — instead of a box of fields,
 *  the approval card shows a miniature of the REAL thing being created:
 *  quotes render as a mini quote document in the invoice template's visual
 *  language (options quotes as side-by-side option cards), work orders as a
 *  dispatch card, texts as a phone bubble. Purely presentational — the
 *  action params remain the source of truth.
 */

type ProposedAction = {
  type: string;
  summary?: string;
  params?: Record<string, any>;
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function QuotePreview({ params }: { params: Record<string, any> }) {
  const lines: Array<{ description: string; quantity: number; unitPrice: number; optionTag?: string }> =
    Array.isArray(params.lineItems) ? params.lineItems : [];
  const isOptions = params.quoteMode === "options";
  const groups = useMemo(() => {
    if (!isOptions) return null;
    const shared: typeof lines = [];
    const byTag = new Map<string, typeof lines>();
    for (const l of lines) {
      if (!l.optionTag) shared.push(l);
      else byTag.set(l.optionTag, [...(byTag.get(l.optionTag) || []), l]);
    }
    return { shared, options: Array.from(byTag.entries()) };
  }, [lines, isOptions]);
  const total = (ls: typeof lines) => ls.reduce((s, l) => s + (l.quantity || 1) * (l.unitPrice || 0), 0);
  const sharedTotal = groups ? total(groups.shared) : 0;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="gibbs-preview-quote">
      {/* Mini letterhead — the invoice template's language */}
      <div className="px-3.5 pt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold text-[#711419]">Giesbrecht HVAC</p>
          <p className="text-[10px] font-bold tracking-[0.12em] text-slate-500">DRAFT QUOTE</p>
        </div>
        <div className="mt-1.5 h-[3px] bg-[#711419]" />
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <p className="text-[9px] font-bold tracking-[0.1em] text-slate-400">PREPARED FOR</p>
            <p className="text-sm font-semibold text-slate-900">{params.customerName || "Customer"}</p>
          </div>
          {params.title && <p className="max-w-[45%] truncate text-right text-xs text-slate-500">{params.title}</p>}
        </div>
      </div>

      {isOptions && groups ? (
        <div className="p-3.5 pt-2.5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {groups.options.map(([tag, ls]) => (
              <div key={tag} className="min-w-[130px] flex-1 rounded-md border border-slate-200 bg-slate-50/70 p-2.5" data-testid={`gibbs-preview-option-${tag}`}>
                <p className="truncate text-[11px] font-bold text-[#711419]">{tag}</p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{money(total(ls) + sharedTotal)}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {ls.slice(0, 3).map((l, i) => (
                    <li key={i} className="truncate text-[10px] leading-tight text-slate-500">{l.description}</li>
                  ))}
                  {ls.length > 3 && <li className="text-[10px] text-slate-400">+{ls.length - 3} more</li>}
                </ul>
              </div>
            ))}
          </div>
          {groups.shared.length > 0 && (
            <p className="mt-1.5 text-[10px] text-slate-500">
              Every option includes: {groups.shared.map((l) => l.description).join(", ")}
            </p>
          )}
          <p className="mt-1.5 text-[10px] font-medium text-slate-400">Customer picks one option when they sign.</p>
        </div>
      ) : (
        <div className="px-3.5 pb-3 pt-2">
          <table className="w-full">
            <tbody>
              {lines.slice(0, 5).map((l, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-2 text-xs leading-snug text-slate-700">{l.description}</td>
                  <td className="whitespace-nowrap py-1 text-right text-[11px] tabular-nums text-slate-400">
                    {l.quantity > 1 ? `${l.quantity} × ` : ""}{money(l.unitPrice || 0)}
                  </td>
                </tr>
              ))}
              {lines.length > 5 && (
                <tr><td colSpan={2} className="py-1 text-[10px] text-slate-400">+{lines.length - 5} more lines</td></tr>
              )}
            </tbody>
          </table>
          <div className="mt-1.5 border-t-2 border-[#711419] pt-1.5 text-right">
            <span className="text-[10px] font-bold tracking-wide text-slate-400">TOTAL </span>
            <span className="text-base font-bold tabular-nums text-[#711419]">{money(total(lines))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkOrderPreview({ params }: { params: Record<string, any> }) {
  const when = params.scheduledStart
    ? new Date(params.scheduledStart).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="gibbs-preview-workorder">
      <div className="h-1 bg-[#711419]" />
      <div className="flex items-start gap-2.5 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#711419]/10 text-[#711419]">
          <Wrench className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{params.customerName || "Customer"}</p>
          <p className="truncate text-xs text-slate-600">{params.title || "Service visit"}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {when && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{when}</span>}
            {(params.assignTo || params.assignedTechId) && (
              <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{params.assignTo || "Assigned"}</span>
            )}
            {params.visitType && <span className="rounded bg-slate-100 px-1.5 py-px font-semibold uppercase tracking-wide text-slate-500">{params.visitType}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SmsPreview({ params }: { params: Record<string, any> }) {
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="gibbs-preview-sms">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-slate-400">
        <MessageSquare className="h-3 w-3" /> TEXT TO {(params.customerName || "CUSTOMER").toUpperCase()}
        {params.customerPhone ? ` · ${params.customerPhone}` : ""}
      </p>
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-[4px] bg-[#711419] px-3 py-2 text-[13px] leading-snug text-white shadow-sm">
          {params.message || ""}
        </p>
      </div>
    </div>
  );
}

/** Drop-in preview for an action card; renders nothing for types without a
 *  visual (they keep their existing field summaries). */
export function GibbsActionPreview({ action }: { action: ProposedAction }) {
  const p = action.params || {};
  if (action.type === "create_quote" && Array.isArray(p.lineItems) && p.lineItems.length > 0) {
    return <QuotePreview params={p} />;
  }
  if (action.type === "create_work_order") return <WorkOrderPreview params={p} />;
  if (action.type === "send_sms" && p.message) return <SmsPreview params={p} />;
  return null;
}
