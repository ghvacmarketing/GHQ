import avatarRm from "@/assets/avatar-rm.png";
import avatarDo from "@/assets/avatar-do.png";
import avatarDs from "@/assets/avatar-ds.png";
import avatarEt from "@/assets/avatar-et.png";
import avatarCg from "@/assets/avatar-cg.png";
import avatarBl from "@/assets/avatar-bl.png";
import avatarKp from "@/assets/avatar-kp.png";
import avatarGj from "@/assets/avatar-gj.png";

/** Metal initials avatars, keyed by FIRST name (unique across the roster).
 *  Used for the signed-in user's chip in the mobile header and the CRM
 *  sidebar. Users without a badge yet fall back to whatever the surface
 *  rendered before (initials circle / icon). */
const BY_FIRST: Record<string, string> = {
  ryo: avatarRm,
  darren: avatarDo,
  deandre: avatarDs,
  earnest: avatarEt,
  chandler: avatarCg,
  brian: avatarBl,
  kylee: avatarKp,
  geoffrey: avatarGj,
};

export function userAvatarSrc(name?: string | null): string | null {
  const first = (name || "").trim().toLowerCase().split(/\s+/)[0] || "";
  return BY_FIRST[first] ?? null;
}
