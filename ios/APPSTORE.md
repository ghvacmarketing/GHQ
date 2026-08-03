# GHQ — App Store 1.0 submission playbook

The shell (`appId app.ghvac.tools`) pins to the mobile field app: on native,
`/` and every non-`/mobile` route redirect to `/mobile`, login lands everyone
on `/mobile`, and the "Desktop CRM" row is hidden. The desktop CRM and the
other web apps stay web-only. This keeps the review story simple: a focused
field-service tool with native camera, push, and time clock — not a website
portal.

## 1. Build & upload (Codemagic — no Mac needed)

1. codemagic.io → the GHQ app → Start new build → the iOS workflow.
2. The build signs with the App Store certs (already in `ios/certs` /
   Codemagic env) and publishes to App Store Connect automatically.
3. Wait for App Store Connect → TestFlight to show the build as "Ready to
   Submit" (processing takes ~5–15 min after upload).
4. Sanity-check the build in TestFlight on a real phone first: login →
   agenda, camera capture + markup, push permission prompt, time clock.

## 2. App Store Connect — the listing (one-time)

App Store Connect → My Apps → GHQ → "1.0 Prepare for Submission".

- **Name**: GHQ — Giesbrecht HVAC  (or just "GHQ" if free)
- **Subtitle**: Field app for our HVAC team
- **Category**: Business (secondary: Productivity)
- **Description** (paste):

  > GHQ is the field companion app for Giesbrecht HVAC. Techs and staff run
  > their day from their phone: today's schedule and job details, one-tap
  > navigation and customer calls, the time clock (job site, drive, shop,
  > training, meetings, breaks), job-site photos and videos with markup
  > (draw, arrows, text), tasks, quotes and invoices, and two-way customer
  > messaging. Includes Gibbs, the built-in AI assistant, for hands-free
  > lookups and drafting. A Giesbrecht HVAC account is required.

- **Keywords**: hvac,field service,technician,dispatch,time clock,job photos
- **Support URL**: https://www.ghvac.app  ·  **Marketing URL**: optional
- **Privacy Policy URL**: needs a live page — https://www.ghvac.app/privacy
  (make sure it exists before submitting; a one-page policy is fine)
- **Screenshots**: 6.9" (iPhone 16 Pro Max) and 6.5" sets — take them in
  TestFlight from a real phone: Agenda, Job detail, Media + markup editor,
  Time clock, Messages. Portrait, no frames needed.
- **Age rating**: everything "None" → 4+.

## 3. App Privacy questionnaire (Data Collection)

Answer "Yes, we collect data". Declare, all **linked to identity**, none
used for tracking:

| Data | Type | Purpose |
| --- | --- | --- |
| Name, Email, Phone | Contact Info | App Functionality |
| Photos/Videos | User Content | App Functionality |
| Precise Location (only if location features are on for the reviewer build; otherwise omit) | Location | App Functionality |
| Customer records the user works with | Other User Content | App Functionality |

No third-party advertising, no tracking, no data sold.

## 4. App Review Information (the part that prevents rejection)

- **Sign-in required**: YES — provide a demo account:
  - Create a dedicated user first: CRM → Settings → Users & Roles → add
    "Apple Review" (role: supervisor is best — sees schedule, media, time,
    messages) with a strong password. Never reuse a real person's login.
  - Enter that email/password in the review form.
- **Notes** (paste):

  > GHQ is the field-service app for Giesbrecht HVAC (Wrens, Georgia) used
  > daily by our technicians, and it also backs our customer-facing portal
  > accounts. It is a native Capacitor app with push notifications, native
  > camera capture with in-app photo markup, offline-tolerant time clock,
  > and location-aware job routing. The demo account above is a staff
  > account showing a seeded schedule. Company data is real business data;
  > please don't message customers from the demo account.

- **Contact**: your phone + email.

## 5. Submit & what to expect

- Choose "Manually release this version" (so approval doesn't surprise-ship
  before you're ready), then Submit for Review.
- Typical first review: 1–3 days. If rejected:
  - **4.2 minimum functionality** → reply pointing at push notifications,
    native camera + markup, time clock, and offline behavior; offer a video.
  - **"Internal business app"** → request **Unlisted App Distribution**
    (Apple form, takes a few days) — same App Store install flow, page only
    reachable by direct link. For a field tool this is arguably better.
- After approval: release manually. TestFlight keeps working exactly as now;
  testers always run the newest build regardless of what the store has.

## 6. Day-to-day after 1.0

- Web deploys (Render) update the app content instantly — no store release.
- A new store release is only needed when the native shell changes
  (plugins/icons/splash): bump the version in `ios/App`, Codemagic build,
  pick the build in App Store Connect, submit. Updates review faster than
  first releases.
