import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { crmFetch } from "@/lib/crmAuth";
import type { CrmUser } from "@shared/schema";

/** Hard auth gate for mobile pages that live OUTSIDE MobileShell (detail
 *  sheets, profile): when the CRM session is missing, redirect to sign-in
 *  instead of rendering a dead page whose queries all 401 into blankness.
 *  Shares the auth/me cache key with everything else.
 *
 *  Two rules keep this from ever redirect-looping the native shell:
 *  - crmFetch, not a bare cookie fetch — the iOS app may hold its session in
 *    the Bearer token while the WKWebView cookie is gone; every auth gate
 *    must judge "signed in" the same way the login page does.
 *  - Only a definitive 401 means logged out. A network blip or 5xx throws
 *    instead, keeping the user on the page rather than bouncing to login. */
export function useRequireCrmAuth(): CrmUser | null | undefined {
  const { data, isLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: async () => {
      const res = await crmFetch("/api/crm/auth/me");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);
      const body = await res.json();
      return body?.user || body;
    },
    staleTime: 30 * 1000,
  });
  useEffect(() => {
    if (!isLoading && data === null) window.location.replace("/crm/login");
  }, [isLoading, data]);
  return data;
}
