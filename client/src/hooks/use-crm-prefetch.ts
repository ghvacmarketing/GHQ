import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

const CRM_PREFETCH_ENDPOINTS = [
  { 
    queryKey: ["/api/crm/customers/merged", "page=1&limit=25"], 
    url: "/api/crm/customers/merged?page=1&limit=25" 
  },
  { 
    queryKey: ["/api/crm/customers/stats"], 
    url: "/api/crm/customers/stats" 
  },
  { 
    queryKey: ["/api/crm/prospects", null], 
    url: "/api/crm/prospects" 
  },
  { 
    queryKey: ["/api/crm/prospects/metrics"], 
    url: "/api/crm/prospects/metrics" 
  },
  { 
    queryKey: ["/api/crm/quotes", 1, "all"], 
    url: "/api/crm/quotes?page=1&type=all" 
  },
  { 
    queryKey: ["/api/crm/invoices", "page=1&limit=25"], 
    url: "/api/crm/invoices?page=1&limit=25" 
  },
  { 
    queryKey: ["/api/crm/work-orders/list", ""], 
    url: "/api/crm/work-orders/list" 
  },
  { 
    queryKey: ["/api/crm/projects", "page=1&limit=25"], 
    url: "/api/crm/projects?page=1&limit=25" 
  },
  { 
    queryKey: ["/api/crm/projects/stats"], 
    url: "/api/crm/projects/stats" 
  },
  { 
    queryKey: ["/api/crm/agreements", 1, "", "active"], 
    url: "/api/crm/agreements?page=1&search=&status=active" 
  },
  { 
    queryKey: ["/api/crm/items"], 
    url: "/api/crm/items" 
  },
  { 
    queryKey: ["/api/crm/follow-ups"], 
    url: "/api/crm/follow-ups" 
  },
  { 
    queryKey: ["/api/crm/users"], 
    url: "/api/crm/users" 
  },
];

async function prefetchEndpoint(queryKey: unknown[], url: string): Promise<void> {
  try {
    await queryClient.prefetchQuery({
      queryKey,
      queryFn: async () => {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      },
      staleTime: 5 * 60 * 1000,
    });
  } catch {
    // Silently fail - prefetch errors shouldn't affect the app
  }
}

export function useCrmPrefetch(isAuthenticated: boolean) {
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || hasPrefetched.current) return;
    hasPrefetched.current = true;

    // Run all prefetches immediately in parallel for instant page loads
    CRM_PREFETCH_ENDPOINTS.forEach((endpoint) => {
      prefetchEndpoint(endpoint.queryKey, endpoint.url);
    });
  }, [isAuthenticated]);
}
