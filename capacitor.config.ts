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
    // accounts.google.com stays INSIDE the webview — without it Capacitor
    // bounced "Continue with Google" out to Safari, the session cookie landed
    // in Safari's jar, and the app never saw the login.
    allowNavigation: ["www.ghvac.app", "ghvac.app", "ghvac-tools.onrender.com", "accounts.google.com"],
  },
  plugins: {
    Keyboard: {
      // Never shrink the webview — the shrink exposed the native window as a
      // black band behind the keyboard and double-lifted keyboard-aware bars.
      // The web UI handles keyboard insets itself (useKeyboardInset).
      resize: "none",
      style: "LIGHT",
    },
    PushNotifications: {
      // Without this, iOS silently swallows pushes that arrive while the
      // app is OPEN on screen — banner + sound + badge even in foreground.
      presentationOptions: ["badge", "sound", "alert"],
    },
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
