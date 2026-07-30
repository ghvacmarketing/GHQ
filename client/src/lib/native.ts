import { useEffect } from "react";
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
// safe-area tweaks). Module side effect — runs wherever native.ts is used.
if (typeof document !== "undefined" && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");
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

/** Hook flavor for layouts: registers push once a CRM user is logged in. */
export function useNativePush(loggedIn: boolean) {
  useEffect(() => {
    if (loggedIn) void initNativePush();
  }, [loggedIn]);
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
