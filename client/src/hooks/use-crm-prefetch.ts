import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

// Debug logging helper - set to false for production
const DEBUG_PREFETCH = false;
const log = (...args: unknown[]) => {
  if (DEBUG_PREFETCH) {
    console.log(`[CRM-PREFETCH ${new Date().toISOString().split('T')[1].slice(0, 12)}]`, ...args);
  }
};

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

async function prefetchEndpoint(queryKey: unknown[], url: string, index: number): Promise<{ success: boolean; duration: number; url: string; error?: string }> {
  const startTime = performance.now();
  const shortUrl = url.split('?')[0].replace('/api/crm/', '');
  
  log(`[${index}] START fetching: ${shortUrl}`);
  
  // Check if data already exists in cache
  const existingData = queryClient.getQueryData(queryKey);
  if (existingData) {
    log(`[${index}] CACHE HIT - data already exists for: ${shortUrl}`, { queryKey });
    return { success: true, duration: 0, url: shortUrl };
  }
  
  try {
    await queryClient.prefetchQuery({
      queryKey,
      queryFn: async () => {
        log(`[${index}] Fetching from network: ${url}`);
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          log(`[${index}] FETCH ERROR: ${res.status} ${res.statusText} for ${shortUrl}`);
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        log(`[${index}] FETCH SUCCESS: ${shortUrl}`, { 
          dataType: Array.isArray(data) ? `array[${data.length}]` : typeof data,
          hasData: !!data 
        });
        return data;
      },
      staleTime: 10 * 60 * 1000, // 10 min - matches page queries for instant cache hits
    });
    
    const duration = performance.now() - startTime;
    log(`[${index}] COMPLETE: ${shortUrl} in ${duration.toFixed(0)}ms`);
    
    // Verify data was stored
    const storedData = queryClient.getQueryData(queryKey);
    log(`[${index}] CACHE VERIFY: ${shortUrl} - data stored: ${!!storedData}`, { queryKey });
    
    return { success: true, duration, url: shortUrl };
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log(`[${index}] FAILED: ${shortUrl} after ${duration.toFixed(0)}ms - ${errorMsg}`);
    return { success: false, duration, url: shortUrl, error: errorMsg };
  }
}

export function useCrmPrefetch(isAuthenticated: boolean) {
  const hasPrefetched = useRef(false);

  useEffect(() => {
    log('Hook called', { isAuthenticated, hasPrefetched: hasPrefetched.current });
    
    if (!isAuthenticated) {
      log('Skipping - not authenticated');
      return;
    }
    
    if (hasPrefetched.current) {
      log('Skipping - already prefetched');
      return;
    }
    
    hasPrefetched.current = true;
    const overallStart = performance.now();
    
    log('========================================');
    log('STARTING PREFETCH OF ALL CRM DATA');
    log(`Total endpoints: ${CRM_PREFETCH_ENDPOINTS.length}`);
    log('Endpoints:', CRM_PREFETCH_ENDPOINTS.map(e => e.url.split('?')[0].replace('/api/crm/', '')));
    log('========================================');

    // Run all prefetches in parallel and track results
    const promises = CRM_PREFETCH_ENDPOINTS.map((endpoint, index) => 
      prefetchEndpoint(endpoint.queryKey, endpoint.url, index)
    );

    Promise.all(promises).then((results) => {
      const overallDuration = performance.now() - overallStart;
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success);
      
      log('========================================');
      log('PREFETCH COMPLETE');
      log(`Total duration: ${overallDuration.toFixed(0)}ms`);
      log(`Success: ${successful}/${results.length}`);
      if (failed.length > 0) {
        log('Failed endpoints:', failed.map(f => `${f.url}: ${f.error}`));
      }
      log('Individual times:', results.map(r => `${r.url}: ${r.duration.toFixed(0)}ms`));
      log('========================================');
      
      // Log current cache state
      log('CACHE STATE AFTER PREFETCH:');
      CRM_PREFETCH_ENDPOINTS.forEach((endpoint, i) => {
        const data = queryClient.getQueryData(endpoint.queryKey);
        const shortUrl = endpoint.url.split('?')[0].replace('/api/crm/', '');
        log(`  [${i}] ${shortUrl}: ${data ? 'HAS DATA' : 'EMPTY'}`, { queryKey: endpoint.queryKey });
      });
    });
  }, [isAuthenticated]);
}
