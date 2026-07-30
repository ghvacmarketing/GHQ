import type { CapacitorConfig } from "@capacitor/cli";

// iOS App Store shell around the production web app.
// v1 loads www.ghvac.app directly (same approach as the Android TWA);
// native plugins (push, camera) get layered in before App Store submission
// to satisfy Apple's guideline 4.2 (more than a repackaged website).
const config: CapacitorConfig = {
  appId: "app.ghvac.tools",
  appName: "GHQ",
  webDir: "dist/public",
  server: {
    url: "https://www.ghvac.app",
    allowNavigation: ["www.ghvac.app", "ghvac.app", "ghvac-tools.onrender.com"],
  },
  ios: {
    // The web app handles safe areas itself (env(safe-area-inset-*)) —
    // "automatic" double-applied insets: maroon band above, offset container
    // cutting content, nav pushed below the screen.
    contentInset: "never",
    backgroundColor: "#ffffff",
  },
};

export default config;
