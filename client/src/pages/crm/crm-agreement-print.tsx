import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import type { CrmAgreement, CrmCustomer } from "@shared/schema";
import redlogo from "@assets/redlogo.webp";

type AgreementWithCustomer = CrmAgreement & { customer: CrmCustomer | null };

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return format(new Date(`${String(d).slice(0, 10)}T00:00:00`), "MMMM d, yyyy");
  } catch {
    return String(d);
  }
}

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const FREQ_LABEL: Record<string, string> = {
  annual: "Annually",
  semi_annual: "Twice a year",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

// Formal, print-ready service agreement document. `?print=1` auto-opens the
// browser print dialog once loaded.
export default function CrmAgreementPrint() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: agreement, isLoading } = useQuery<AgreementWithCustomer>({
    queryKey: ["/api/crm/agreements", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/agreements/${params.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load agreement");
      return res.json();
    },
    enabled: !!params.id,
  });

  useEffect(() => {
    if (!agreement) return;
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [agreement]);

  if (isLoading || !agreement) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-7 w-7 animate-spin text-[#711419]" />
      </div>
    );
  }

  const billingLabel = FREQ_LABEL[agreement.frequency] || agreement.frequency;
  const collection = agreement.billingPreference === "pay_on_visit" ? "Payment collected at each visit" : "Invoiced automatically";
  const termLabel = agreement.startDate
    ? `${fmtDate(agreement.startDate)} — ${agreement.endDate ? fmtDate(agreement.endDate) : agreement.autoRenew ? "ongoing (renews automatically)" : "open"}`
    : agreement.autoRenew
      ? "12 months, renews automatically"
      : "12 months";
  const detailParagraphs = (agreement.details || "").split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Screen-only toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 print:hidden">
        <button
          onClick={() => navigate("/crm/agreements")}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          data-testid="button-back-agreements"
        >
          <ArrowLeft className="h-4 w-4" /> Agreements
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg bg-[#711419] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#8a1a1f]"
          data-testid="button-print"
        >
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      {/* Document */}
      <div className="mx-auto my-6 max-w-[820px] bg-white px-12 py-10 shadow-lg print:my-0 print:max-w-none print:shadow-none" data-testid="agreement-document">
        {/* Letterhead */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-6">
          <img src={redlogo} alt="Giesbrecht HVAC" className="h-14" />
          <div className="text-right text-[12px] leading-relaxed text-slate-600">
            <p className="text-[13px] font-semibold text-slate-900">Giesbrecht Heating &amp; Air</p>
            <p>(706) 826-0644</p>
            <p>www.ghvac.app</p>
          </div>
        </div>

        {/* Title */}
        <div className="mt-8 flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-slate-900">Service Agreement</h1>
            <p className="mt-1 text-[13px] text-slate-500">{agreement.agreementPlan}</p>
          </div>
          <div className="text-right text-[12px] text-slate-600">
            <p><span className="font-semibold text-slate-900">Agreement</span> {agreement.agreementNumber}</p>
            <p><span className="font-semibold text-slate-900">Date</span> {fmtDate(agreement.contractDate || agreement.createdAt)}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Provider</p>
            <p className="text-[14px] font-semibold text-slate-900">Giesbrecht Heating &amp; Air</p>
            <p className="text-[12px] leading-relaxed text-slate-600">Licensed &amp; insured HVAC contractor<br />(706) 826-0644</p>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Client</p>
            <p className="text-[14px] font-semibold text-slate-900">{agreement.customerName}</p>
            <p className="text-[12px] leading-relaxed text-slate-600">
              {agreement.address || agreement.customer?.fullAddress || ""}
              {agreement.customer?.phone ? <><br />{agreement.customer.phone}</> : null}
              {agreement.customer?.email ? <><br />{agreement.customer.email}</> : null}
            </p>
          </div>
        </div>

        {/* Coverage summary */}
        <div className="mt-8">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Coverage Summary</p>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {[
                ["Plan", agreement.agreementPlan],
                ["Term", termLabel],
                ["Systems covered", String(agreement.numberOfSystems)],
                ["Maintenance visits", `${agreement.visitsPerPeriod} per year`],
                ["Investment", `${money(agreement.price)} · billed ${billingLabel.toLowerCase()}`],
                ["Billing", collection],
                ["First scheduled visit", fmtDate(agreement.appointmentDate || agreement.nextServiceDate)],
              ].map(([k, v]) => (
                <tr key={k as string} className="border-b border-slate-200">
                  <td className="w-52 py-2.5 pr-4 font-semibold text-slate-500">{k}</td>
                  <td className="py-2.5 text-slate-900">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Agreement details (client-facing terms entered on the agreement) */}
        {detailParagraphs.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Agreement Details</p>
            <div className="space-y-3 text-[13px] leading-relaxed text-slate-800">
              {detailParagraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-wrap">{p}</p>
              ))}
            </div>
          </div>
        )}

        {/* Standard terms */}
        <div className="mt-8">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Terms &amp; Conditions</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-[11.5px] leading-relaxed text-slate-600">
            <li>All maintenance visits are performed by licensed and insured technicians during normal business hours.</li>
            <li>Coverage applies to the systems listed above at the service address shown. Additional systems can be added by amendment.</li>
            <li>{agreement.autoRenew ? "This agreement renews automatically at the end of each term unless cancelled in writing before the renewal date." : "This agreement expires at the end of the stated term unless renewed."}</li>
            <li>Repairs, parts, and services beyond scheduled maintenance are quoted separately before work is performed.</li>
            <li>Either party may cancel with 30 days' written notice; prepaid unused visits are credited or refunded on a pro-rata basis.</li>
          </ol>
        </div>

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-10">
          {["Client", "Giesbrecht Heating & Air"].map((party) => (
            <div key={party}>
              <div className="h-10 border-b border-slate-400" />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>{party} signature</span>
                <span>Date</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-slate-200 pt-4 text-center text-[10.5px] text-slate-400">
          Giesbrecht Heating &amp; Air · Agreement {agreement.agreementNumber} · Thank you for trusting us with your comfort.
        </p>
      </div>
    </div>
  );
}
