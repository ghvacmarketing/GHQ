const CRM_TOKEN_KEY = "crm_session_token";

export function setCrmToken(token: string): void {
  localStorage.setItem(CRM_TOKEN_KEY, token);
}

export function getCrmToken(): string | null {
  return localStorage.getItem(CRM_TOKEN_KEY);
}

export function clearCrmToken(): void {
  localStorage.removeItem(CRM_TOKEN_KEY);
}

export async function crmFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getCrmToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  // If we sent a stale Bearer token and got 401, clear it and retry with
  // cookie-only auth. This recovers automatically after Google OAuth (which
  // sets the cookie but can't update localStorage) when a leftover token
  // from a prior session is still in localStorage.
  if (res.status === 401 && token) {
    clearCrmToken();
    const retryHeaders = new Headers(options.headers);
    return fetch(url, {
      ...options,
      headers: retryHeaders,
      credentials: "include",
    });
  }

  return res;
}

export async function crmApiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<Response> {
  const token = getCrmToken();
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // Clear stale Bearer token and retry with cookie-only auth on 401.
  if (res.status === 401 && token) {
    clearCrmToken();
    const retryHeaders: Record<string, string> = {};
    if (data) retryHeaders["Content-Type"] = "application/json";
    return fetch(url, {
      method,
      headers: retryHeaders,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  }

  return res;
}
