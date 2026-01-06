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
  
  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
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
  
  return res;
}
