import { QueryClient, QueryFunction } from "@tanstack/react-query";

// A newer login displaced this device's CRM session (single-active-session
// policy). Send the user to the login page with an explanation — every authed
// endpoint returns this code once it happens, so whichever request lands
// first triggers the notice.
let sessionReplacedHandled = false;
function handleSessionReplaced(payload: unknown) {
  if (sessionReplacedHandled) return;
  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).code !== "SESSION_REPLACED") return;
  if (window.location.pathname.startsWith("/crm/login")) return;
  sessionReplacedHandled = true;
  window.location.replace("/crm/login?reason=session-replaced");
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Try to parse as JSON to preserve structured error data
    let jsonError: Record<string, unknown> | null = null;
    try {
      jsonError = JSON.parse(text);
    } catch {
      // Not JSON, will throw plain error below
    }
    
    if (jsonError && typeof jsonError === 'object') {
      if (res.status === 401) handleSessionReplaced(jsonError);
      // Create an error object that carries the full JSON payload
      const error = new Error(jsonError.message as string || `${res.status}: ${text}`);
      Object.assign(error, jsonError);
      throw error;
    }
    
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Admin API request helper - includes Authorization header with token from localStorage
export async function adminApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const adminToken = localStorage.getItem('adminToken');
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Admin query function for React Query - includes Authorization header
export const getAdminQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const adminToken = localStorage.getItem('adminToken');
    const headers: Record<string, string> = {};
    
    if (adminToken) {
      headers["Authorization"] = `Bearer ${adminToken}`;
    }
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      // Even a swallowed 401 must surface a displaced-session notice.
      try {
        handleSessionReplaced(await res.clone().json());
      } catch {
        // non-JSON 401 — nothing to surface
      }
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // "always" so returning to the app (phone unlock, tab switch) re-syncs every
      // visible query even if it's within staleTime — edits made on another device
      // show up on focus instead of after the staleTime window expires.
      refetchOnWindowFocus: "always",
      refetchOnMount: true, // Refetch stale data when navigating to a page
      staleTime: 45 * 1000, // 45s — cached data still renders instantly, then refreshes in background
      gcTime: 30 * 60 * 1000, // 30 minutes - keep unused data in cache longer
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
