import { roleBadgeSrc } from "@/components/mobile/role-badge";
import avatarRm from "@/assets/avatar-rm.png";
import avatarDo from "@/assets/avatar-do.png";
import avatarDs from "@/assets/avatar-ds.png";
import avatarEt from "@/assets/avatar-et.png";
import avatarCg from "@/assets/avatar-cg.png";
import avatarBl from "@/assets/avatar-bl.png";
import avatarKp from "@/assets/avatar-kp.png";
import avatarGj from "@/assets/avatar-gj.png";
import avatarCj from "@/assets/avatar-cj.png";

/** Metal initials avatars, keyed by FIRST name (unique across the roster).
 *  Used for the signed-in user's chip in the mobile header and the CRM
 *  sidebar. Users without a badge yet fall back to whatever the surface
 *  rendered before (initials circle / icon). */
const BY_FIRST: Record<string, string> = {
  ryo: avatarRm,
  darren: avatarDo,
  deandre: avatarDs,
  dandre: avatarDs, // "D'andre" — apostrophe stripped by the lookup
  earnest: avatarEt,
  chandler: avatarCg,
  brian: avatarBl,
  kylee: avatarKp,
  geoffrey: avatarGj,
  christopher: avatarCj,
  chris: avatarCj,
};

export function userAvatarSrc(name?: string | null): string | null {
  // Letters only: "D'andre" → "dandre", so punctuation in a stored name
  // never orphans someone's badge.
  const first = ((name || "").trim().toLowerCase().split(/\s+/)[0] || "").replace(/[^a-z]/g, "");
  return BY_FIRST[first] ?? null;
}

/** Display rule: team members go by FIRST NAME across the mobile app and
 *  the CRM (the badge keys off the same first name, so they always match). */
export function firstNameOf(name?: string | null): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}

/** The profile-hero composition everywhere a person appears: the metal
 *  initials avatar is the MAIN image and the role badge rides its
 *  bottom-right shoulder. Users without an initials badge get the maroon
 *  initial circle, role badge still on the shoulder. */
export function AvatarWithRole({
  name,
  role,
  size = 36,
  className = "",
}: {
  name?: string | null;
  role?: string | null;
  size?: number;
  className?: string;
}) {
  const avatar = userAvatarSrc(name);
  const badge = Math.round(size * 0.44);
  return (
    <span className={`relative inline-block shrink-0 select-none ${className}`} style={{ width: size, height: size }}>
      {avatar ? (
        <img src={avatar} alt="" className="h-full w-full select-none" draggable={false} />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-[#711419] font-semibold text-white"
          style={{ fontSize: Math.max(11, Math.round(size * 0.38)) }}
        >
          {(name || "U").trim().charAt(0).toUpperCase()}
        </span>
      )}
      {role && (
        <img
          src={roleBadgeSrc(role)}
          alt=""
          className="absolute select-none drop-shadow-sm"
          draggable={false}
          style={{ width: badge, height: badge, right: Math.round(-badge * 0.14), bottom: Math.round(-badge * 0.14) }}
        />
      )}
    </span>
  );
}
