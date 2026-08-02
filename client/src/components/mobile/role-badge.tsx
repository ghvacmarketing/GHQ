import ownerBadge from "@/assets/role-owner.png";
import supervisorBadge from "@/assets/role-supervisor.png";
import salesBadge from "@/assets/role-sales.png";
import techBadge from "@/assets/role-tech.png";

/** Metallic role badge for team members: crown = owner/admin, hardhat +
 *  clipboard = supervisor, uptrend = sales, wrench = technician. */
const ROLE_BADGES: Record<string, string> = {
  owner: ownerBadge,
  admin: ownerBadge,
  supervisor: supervisorBadge,
  sales: salesBadge,
  tech: techBadge,
};

export function RoleBadge({ role, className = "h-9 w-9" }: { role?: string | null; className?: string }) {
  const src = ROLE_BADGES[(role || "tech").toLowerCase()] || techBadge;
  return <img src={src} alt={role || "team member"} className={`${className} shrink-0 select-none`} draggable={false} />;
}

/** The badge asset alone — for pickers that take an image URL (SheetSelect). */
export function roleBadgeSrc(role?: string | null): string {
  return ROLE_BADGES[(role || "tech").toLowerCase()] || techBadge;
}
