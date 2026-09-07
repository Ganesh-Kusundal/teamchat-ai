export const API_BASE: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '';

let authToken: string | null = null;

export const setAuthToken = (token: string | null): void => {
  authToken = token;
};

export async function api(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const bearer = init.token ?? authToken;
  const headers = new Headers(init.headers);
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const { token: _omit, ...rest } = init;
  return fetch(`${API_BASE}${path}`, { ...rest, headers });
}
