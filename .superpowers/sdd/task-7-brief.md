### Task 7: frontend `services/api.ts` — one fetch path, env-configured base URL

**Files:**
- Create: `src/services/api.ts`
- Modify: `src/context/ChatContext.tsx` (16 fetch sites + SSE origin `:218-229` + mention regex `:492`), `src/context/AuthContext.tsx` (6 sites + token registration), `src/components/TenantInspectorModal.tsx` (3), `src/components/RoomMembersModal.tsx` (2), `.env.example` (add `VITE_API_BASE_URL`)
- Test: `npm run lint` + manual smoke checklist

**Interfaces:**
- Produces (`src/services/api.ts`):
  - `setAuthToken(token: string | null): void`
  - `api(path: string, init?: RequestInit & { token?: string }): Promise<Response>` — sets `Authorization: Bearer <token ?? authToken>`, sets `Content-Type: application/json` when a body exists
  - `API_BASE: string` — `import.meta.env.VITE_API_BASE_URL ?? ''`

- [ ] **Step 1: Write the client**

`src/services/api.ts`:

```ts
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
```

- [ ] **Step 2: Register token in AuthContext**

- Top of `AuthProvider`: after `const [token, setToken] = useState...` add `useEffect(() => { setAuthToken(token); }, [token]);`
- In `fetchMe` success: `setToken(sessionToken)` already fires the effect. In `logout()`: `setToken(null)` — effect clears it. No other change.
- Replace all 6 fetch sites with `api('/api/orgs')`, `api('/api/auth/me')`, `api('/api/org/users')` (×2), `api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })`, `api('/api/presence', { method: 'POST', body: JSON.stringify({ isOnline: false }) })` — deleting the inline `headers: { Authorization: ... }` / `'Content-Type': ...` objects.

- [ ] **Step 3: Migrate ChatContext (16 sites) + SSE origin + mention regex**

Pattern per site — before:
```ts
const res = await fetch(`/api/rooms/${roomId}/messages`, {
  headers: { Authorization: `Bearer ${token}` },
});
```
after:
```ts
const res = await api(`/api/rooms/${roomId}/messages`);
```
(for POSTs keep `method`/`body`, drop both header entries; for `simulateCoParticipantMessage` pass `{ token: coUserId }`)

SSE block (`:218-229`) — replace the `isFirebaseHosting`/`sseOrigin` logic with:
```ts
const sseUrl = `${API_BASE}/api/events?token=${encodeURIComponent(token)}`;
```
(import `API_BASE` from `../services/api`; delete `:221-227`)

Mention-poll trigger (`:492`) — align with the backend predicate (`routes_messages.py:74-80`):
```ts
if (/@(gemini|ai)\b|\/(gemini|ai|ask)\b/i.test(content)) {
```
(`# ponytail: mirrors backend AI_MENTION regex; codegen would share it — deferred`)

- [ ] **Step 4: Migrate the two modals**

TenantInspectorModal (3 sites) and RoomMembersModal (2 sites): same swap — `api('/api/patients/...')`, `api('/api/memories?q=...')`, `api('/api/tools/calculate-raf', { method: 'POST', body: ... })`, `api(\`/api/rooms/${currentRoom.id}/members/${targetUserId}\`, { method: 'DELETE' })`, `api(\`/api/rooms/${currentRoom.id}/members\`, { method: 'POST', body: ... })`.

- [ ] **Step 5: Verify**

Run: `npm run lint`
Expected: exit 0

Run: `grep -rn "fetch(" src --include="*.ts" --include="*.tsx" | grep -v "src/services/api.ts"`
Expected: only the `fetch` inside `src/services/api.ts`

Manual smoke (dev servers: `npm run dev:backend` + `npm run dev`): login as Sarah → send message → `@Gemini` RAF question streams → second-tab presence/typing → create room → SSE reconnect toast on backend restart. (This exercises the tenant + realtime paths the tests don't cover.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: single frontend API client; env-configured API base; AI-trigger regex aligned with backend" && git push origin dev
```

---

