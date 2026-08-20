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
        // Remember the token so LOGOUT can release it — a signed-out phone
        // must stop receiving the previous user's notifications.
        try { localStorage.setItem("ghq-push-token", token); } catch { /* private mode */ }
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
      const data = action.notification?.data as any;
      // Tapped = seen: mark the GHQ notification read (fire-and-forget) so
      // the bell and badge agree with what the user just acted on.
      const nid = data?.notificationId;
      if (typeof nid === "string" && nid) {
        fetch(`/api/crm/notifications/${nid}/read`, { method: "PATCH", credentials: "include" }).catch(() => {});
      }
      const link = data?.link;
      if (typeof link === "string" && link.startsWith("/")) window.location.assign(link);
    });
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") await PushNotifications.register();
  } catch (e) {
    console.error("[native] push init failed", e);
  }
}

/** Release this phone's push token — call BEFORE the session dies on
 *  logout, so a signed-out phone stops receiving the user's notifications.
 *  Best-effort: a network failure must never block the logout. */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const token = localStorage.getItem("ghq-push-token");
    if (!token) return;
    await apiRequest("POST", "/api/crm/push/unregister-device", { token });
    localStorage.removeItem("ghq-push-token");
    pushInitStarted = false; // next login re-registers cleanly
    shellPermSequence = null; // …and the login sequence may run again
  } catch {
    /* best-effort */
  }
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One-time permission priming on the first launch after login: camera, then
 *  microphone — strictly ONE dialog at a time, each awaited until the user
 *  actually answers. iOS auto-dismisses a permission prompt when another one
 *  is presented over it, so any overlap makes dialogs "flash" past unanswered
 *  (the v1 bug: prompts fired on a blind timer while the push dialog was
 *  still up). Location is deliberately NOT primed — agenda/prospects/lead
 *  capture ask contextually the first time a "near me" feature is used. */
let primeStarted = false;
export async function primeNativePermissions(): Promise<void> {
  if (!isNativeApp() || primeStarted) return;
  primeStarted = true;
  try {
    // Older installed binaries lack the mic usage strings — iOS HARD-CRASHES
    // an app that touches those APIs without them. The Keyboard plugin only
    // exists in binaries new enough to carry the strings, so its presence is
    // the safety gate.
    if (!Capacitor.isPluginAvailable("Keyboard")) return;
    // v2 key: phones that ran the broken v1 pass get ONE more properly
    // sequenced pass — permissions the user already answered resolve
    // silently (iOS never re-shows a determined dialog), only the ones that
    // flashed past unanswered actually prompt again.
    if (localStorage.getItem("ghq-perms-primed-v2") === "1") return;
    localStorage.setItem("ghq-perms-primed-v2", "1");
    await settle(500); // let the push dialog's dismiss animation finish
    try {
      // Camera only — photo picking uses PHPicker, which needs no permission,
      // so the no-arg call's second "photo library" dialog was pure noise.
      const cam = await Camera.checkPermissions();
      if (cam.camera === "prompt") {
        await Camera.requestPermissions({ permissions: ["camera"] });
        await settle(500);
      }
    } catch { /* plugin missing or denied — fine */ }
    try {
      // Microphone (voice dictation). getUserMedia resolves/rejects only
      // after the user answers, keeping the one-dialog-at-a-time chain.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch { /* mic denied — voice features re-ask contextually */ }
  } catch { /* priming is best-effort */ }
}

/** Hook flavor for layouts: push registration + permission priming once a
 *  CRM user is logged in. Single-flight across every mount (CrmLayout and
 *  MobileShell both call this): ONE sequence, notifications awaited to an
 *  answer BEFORE the camera/mic prompts — never two dialogs stacked. */
let shellPermSequence: Promise<void> | null = null;
export function useNativePush(loggedIn: boolean) {
  useEffect(() => {
    if (!loggedIn || !isNativeApp()) return;
    if (!shellPermSequence) {
      shellPermSequence = (async () => {
        await initNativePush();
        await primeNativePermissions();
      })().catch(() => { shellPermSequence = null; });
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

// ---- App version --------------------------------------------------------

/** The native shell's BUILD number (the auto-incrementing one), or null when
 *  not in the shell / the App plugin isn't compiled into this binary yet.
 *  Drives the TestFlight update gate — the server's MIN_IOS_BUILD decides. */
export async function getNativeBuildNumber(): Promise<number | null> {
  if (!isNativeApp()) return null;
  try {
    if (!Capacitor.isPluginAvailable("App")) return null;
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const n = parseInt(info.build, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // old shell — the gate simply stays quiet
  }
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

/** Pick photos straight from the native photo LIBRARY (multi-select) —
 *  no iOS "Photo Library / Take Photo / Choose File" menu in between.
 *  Returns Files for the upload pipeline, or null if cancelled / not native. */
export async function pickNativeLibraryPhotos(): Promise<File[] | null> {
  if (!isNativeApp()) return null;
  try {
    const picked = await Camera.pickImages({ quality: 85, limit: 20 });
    const files: File[] = [];
    for (const p of picked.photos) {
      if (!p.webPath) continue;
      const blob = await (await fetch(p.webPath)).blob();
      const ext = (p.format || "jpeg").toLowerCase();
      files.push(new File([blob], `photo-${Date.now()}-${files.length}.${ext}`, { type: blob.type || `image/${ext}` }));
    }
    return files;
  } catch {
    return null; // user cancelled the library picker
  }
}
