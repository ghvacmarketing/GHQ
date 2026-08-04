import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { apiRequest } from "@/lib/queryClient";

/** Native-shell bridge (Capacitor iOS app wrapping www.ghvac.app).
 *
 *  Everything here is a no-op in ordinary browsers — the same web bundle
 *  serves the website, the Android TWA, and the iOS shell, so every call is
 *  gated on Capacitor.isNativePlatform().
 */

export const isNativeApp = () => Capacitor.isNativePlatform();

// Tag the document so CSS can adapt to the shell (kill rubber-band bounce,
// safe-area tweaks) and hide iOS's keyboard accessory bar (the up/down/Done
// strip) — a native app types without browser chrome. Module side effect —
// runs wherever native.ts is used.
if (typeof document !== "undefined" && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");
  // The App Store build IS the field app: it pins to /mobile. The desktop
  // CRM, the apps launcher, and the other web apps stay web-only — the shell
  // is a focused native tool, not a portal into the whole suite (App Review
  // guideline 4.2). Login stays reachable; everything else lands on /mobile.
  // "/" is allowed because on phones it renders the two-door WELCOME chooser
  // (customer vs team), never the desktop launcher — pinning it away made
  // "Back to welcome page" bounce straight back to the sign-in screen.
  {
    const path = window.location.pathname;
    const allowed = ["/", "/mobile", "/crm/login", "/portal", "/objects"];
    if (!allowed.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)))) {
      window.location.replace("/mobile");
    }
  }
  import("@capacitor/keyboard")
    .then(({ Keyboard, KeyboardStyle }) => {
      Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
      // The app is light-themed — a dark/black keyboard looks foreign
      Keyboard.setStyle({ style: KeyboardStyle.Light }).catch(() => {});
    })
    .catch(() => {});
}

// ---- Push notifications -------------------------------------------------

let pushInitStarted = false;

/** Ask for permission, register with APNs, and hand the device token to the
 *  server so CRM notifications reach the lock screen. Safe to call from
 *  multiple mounts — only the first logged-in call does anything. */
export async function initNativePush(): Promise<void> {
  if (!isNativeApp() || pushInitStarted) return;
  pushInitStarted = true;
  try {
    await PushNotifications.addListener("registration", async ({ value: token }) => {
      try {
        await apiRequest("POST", "/api/crm/push/register-device", {
          token,
          platform: Capacitor.getPlatform(),
        });
      } catch (e) {
        console.error("[native] push token registration failed", e);
      }
    });
    // Tapping a notification deep-links to the entity it's about
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = (action.notification?.data as any)?.link;
      if (typeof link === "string" && link.startsWith("/")) window.location.assign(link);
    });
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") await PushNotifications.register();
  } catch (e) {
    console.error("[native] push init failed", e);
  }
}

/** One-time permission priming on the first launch after login — the way
 *  established apps ask for everything upfront: notifications first (via
 *  push registration), then camera, microphone, and location. Each prompt
 *  only ever appears once per install; iOS remembers the answers. */
let primeStarted = false;
export async function primeNativePermissions(): Promise<void> {
  if (!isNativeApp() || primeStarted) return;
  primeStarted = true;
  try {
    // Older installed binaries lack the mic/location usage strings — iOS
    // HARD-CRASHES an app that touches those APIs without them. The Keyboard
    // plugin only exists in binaries new enough to carry the strings, so its
    // presence is the safety gate.
    if (!Capacitor.isPluginAvailable("Keyboard")) return;
    if (localStorage.getItem("ghq-perms-primed") === "1") return;
    localStorage.setItem("ghq-perms-primed", "1");
    // Give the push-permission dialog (fired by initNativePush) a moment
    // before stacking the next prompts.
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const { Camera } = await import("@capacitor/camera");
      await Camera.requestPermissions();
    } catch { /* plugin missing or denied — fine */ }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch { /* mic denied — Gibbs voice will re-ask contextually */ }
    try {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), { timeout: 8000 });
        setTimeout(resolve, 9000);
      });
    } catch { /* location denied — nothing depends on it yet */ }
  } catch { /* priming is best-effort */ }
}

/** Hook flavor for layouts: registers push once a CRM user is logged in. */
export function useNativePush(loggedIn: boolean) {
  useEffect(() => {
    if (loggedIn) {
      void initNativePush();
      void primeNativePermissions();
    }
  }, [loggedIn]);
}

// ---- Keyboard -----------------------------------------------------------

/** Height of the on-screen keyboard in px, updated BEFORE the slide on the
 *  native shell (keyboardWillShow) and via visualViewport on the web. Use it
 *  to lift bottom-pinned bars/sheets — the webview itself never resizes
 *  (Keyboard resize: "none"). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    let removeNative: (() => void) | null = null;
    if (isNativeApp()) {
      import("@capacitor/keyboard")
        .then(({ Keyboard }) => {
          const subs: any[] = [];
          Keyboard.addListener("keyboardWillShow", (info: any) => setInset(info?.keyboardHeight || 0)).then((h) => subs.push(h));
          Keyboard.addListener("keyboardWillHide", () => setInset(0)).then((h) => subs.push(h));
          removeNative = () => subs.forEach((h) => h?.remove?.());
        })
        .catch(() => {});
      return () => removeNative?.();
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

// ---- Camera -------------------------------------------------------------

/** Take a photo with the real native camera (iOS shell). Returns a File that
 *  drops straight into the existing upload pipeline, or null if the user
 *  cancelled / we're not in the native app. */
export async function takeNativePhoto(): Promise<File | null> {
  if (!isNativeApp()) return null;
  try {
    const shot = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 85,
      correctOrientation: true,
    });
    if (!shot.webPath) return null;
    const blob = await (await fetch(shot.webPath)).blob();
    const ext = (shot.format || "jpeg").toLowerCase();
    return new File([blob], `photo-${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` });
  } catch {
    return null; // user cancelled the camera sheet
  }
}
