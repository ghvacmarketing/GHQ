// Public privacy policy — required by Google Play and the Apple App Store.
// Linked from the store listings as https://www.ghvac.app/privacy
export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10 border-b pb-6">
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">GHVAC Tools · Giesbrecht HVAC · Effective July 15, 2026</p>
        </div>

        <div className="space-y-8 text-[15px] leading-relaxed text-slate-700">
          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Who we are</h2>
            <p>
              GHVAC Tools ("the app") is operated by Giesbrecht HVAC, PO Box 917, Wrens, GA 30833.
              The app serves our customers (to view quotes, invoices, service history, and equipment
              monitoring) and our employees (to manage service work). Questions about this policy or
              your data can be sent to <a className="text-[#711419] underline" href="mailto:chandler@ghvacinc.com">chandler@ghvacinc.com</a> or
              (706) 826-0644.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Information we collect</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li><strong>Contact and account information</strong> — name, email address, phone number, and service address, used to create your customer record and account.</li>
              <li><strong>Service records</strong> — quotes, invoices, appointments, service history, photos of equipment and job sites, and notes related to work we perform for you.</li>
              <li><strong>Equipment monitoring data</strong> — if you have monitoring sensors installed, temperature and humidity readings from those sensors.</li>
              <li><strong>Communications</strong> — messages, emails, and call records exchanged with us so we can follow up on your service.</li>
            </ul>
            <p className="mt-2">
              We do not collect precise device location, contacts, or any data from your device beyond
              what you enter into the app.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Payments</h2>
            <p>
              Card payments are processed by <strong>Stripe</strong>. Your card number is entered on and
              handled by Stripe's secure payment pages — we never see or store your full card details.
              Stripe's privacy policy is available at{" "}
              <a className="text-[#711419] underline" href="https://stripe.com/privacy" target="_blank" rel="noreferrer">stripe.com/privacy</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">How we use information</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>To schedule, perform, and invoice HVAC service work</li>
              <li>To send you quotes, invoices, appointment reminders, and service updates</li>
              <li>To monitor equipment you've asked us to monitor</li>
              <li>To keep accurate business and accounting records</li>
            </ul>
            <p className="mt-2">We do not sell your personal information, and we do not use it for third-party advertising.</p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Who we share it with</h2>
            <p>
              We share data only with service providers that help us run the business, and only what
              they need: Stripe (payments), QuickBooks (accounting), email and SMS providers (sending
              you quotes, invoices, and reminders), and our secure cloud hosting and database providers.
              Each processes your data on our behalf under their own security obligations. We may also
              disclose information if required by law.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Security and retention</h2>
            <p>
              All data is encrypted in transit (HTTPS) and stored in access-controlled databases.
              Accounts are protected by authentication, and staff access is role-based. We retain
              service records for as long as needed to support your equipment and meet legal and
              accounting requirements.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Your choices</h2>
            <p>
              You can request a copy of the personal information we hold about you, ask us to correct
              it, or ask us to delete your account and data (subject to records we're legally required
              to keep, such as invoices). Email{" "}
              <a className="text-[#711419] underline" href="mailto:chandler@ghvacinc.com">chandler@ghvacinc.com</a>{" "}
              and we'll respond within 30 days. You can opt out of non-essential messages at any time.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Children</h2>
            <p>The app is a business tool for our customers and staff. It is not directed at children under 13, and we do not knowingly collect information from them.</p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Changes</h2>
            <p>If we make material changes to this policy, we'll update this page and revise the effective date above.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
