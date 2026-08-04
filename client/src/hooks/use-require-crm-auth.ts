import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CrmUser } from "@shared/schema";

/** Hard auth gate for mobile pages that live OUTSIDE MobileShell (detail
 *  sheets, profile): when the CRM session is missing, redirect to sign-in
 *  instead of rendering a dead page whose queries all 401 into blankness.
 *  Shares the auth/me cache key with everything else. */
export function useRequireCrmAuth(): CrmUser | null | undefined {
  const { data, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/crm/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30 * 1000,
  });
  useEffect(() => {
    if (!isLoading && data === null) window.location.replace("/crm/login");
  }, [isLoading, data]);
  return data;
}
