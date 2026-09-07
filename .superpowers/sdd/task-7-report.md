# Task 7 Report — frontend `services/api.ts` (one fetch path, env base URL)

Branch: `dev` · Commit: see below · Brief: `.superpowers/sdd/task-7-brief.md`

## What was done

- **Created `src/services/api.ts`** — brief-exact: `API_BASE` (via the `(import.meta as unknown as { env?: Record<string, string> }).env` cast, since there is no `src/vite-env.d.ts`), module-scoped `authToken` + `setAuthToken()`, and `api(path, init?)` which sets `Authorization: Bearer <init.token ?? authToken>` and `Content-Type: application/json` when a body exists, then delegates to a single `fetch`.
- **Migrated all 27 inline fetch sites** (grep-verified baseline: 16 ChatContext + 6 AuthContext + 3 TenantInspectorModal + 2 RoomMembersModal). No other file in `src/` contained `fetch(`.
- **SSE origin**: replaced the `isFirebaseHosting` hostname check + hardcoded `https://teamchat-ai-872402492611.us-central1.run.app` block in `ChatContext.tsx` with `const sseUrl = \`${API_BASE}/api/events?token=${encodeURIComponent(token)}\`;`.
- **Mention regex**: already aligned by the WIP commit `cde48e4` (`/@(?:gemini|ai)\b|\/(?:gemini|ai|ask)\b/i` is functionally identical to the brief's `/@(gemini|ai)\b|\/(gemini|ai|ask)\b/i`; backend predicate at `routes_messages.py:62-67` confirmed). Added the brief's marker above it: `// ponytail: mirrors backend AI_MENTION regex; codegen would share it — deferred`.
- **`.env.example`**: added `Frontend` section with short comment + `VITE_API_BASE_URL=""`. No `.env` created/touched.

## Per-site migration list

### `src/context/ChatContext.tsx` (16)
| # | Path | Method | Notes |
|---|------|--------|-------|
| 1 | `/api/rooms` | GET | `api('/api/rooms')` |
| 2 | `/api/rooms/${roomId}/messages` | GET | |
| 3 | `/api/rooms/${roomId}/read` | POST | no body → `{ method: 'POST' }` |
| 4 | `/api/presence` (selectRoom) | POST | body `{ isOnline: true, currentRoomId: roomId }` |
| 5 | `/api/presence` | GET | |
| 6 | `/api/presence` (20s heartbeat) | POST | body with `currentRoomIdRef.current` |
| 7 | `/api/rooms/${newMsg.roomId}/read` (SSE handler) | POST | |
| 8 | `/api/rooms/${currentRoom.id}/messages` (send) | POST | keeps body (content, clientMessageId, replyTo*) |
| 9 | `/api/rooms/${targetRoomId}/messages` (fallback poll) | GET | poll gated by `mentionsAi` (untouched WIP wiring) |
| 10 | `/api/rooms/${currentRoom.id}/typing` | POST | `{ isTyping }` |
| 11 | `/api/rooms/${currentRoom.id}/typing` (timeout clear) | POST | `{ isTyping: false }` |
| 12 | `/api/rooms` (createRoom) | POST | `{ name, description, isPrivate }` |
| 13 | `/api/rooms/${currentRoom.id}/typing` (simulate) | POST | **`token: coUserId`** |
| 14 | `/api/rooms/${currentRoom.id}/typing` (simulate) | POST | **`token: coUserId`** |
| 15 | `/api/rooms/${currentRoom.id}/messages` (simulate) | POST | **`token: coUserId`** — sends AS the co-participant, behavior preserved |
| 16 | `/api/admin/reset-demo` | POST | |

### `src/context/AuthContext.tsx` (6) + token registration
- Registration: after `const [token, setToken] = useState(...)` — **`useLayoutEffect(() => { setAuthToken(token); }, [token]);`** (see Deviation 1).
- Sites: `/api/orgs` GET, `/api/auth/me` GET, `/api/org/users` GET (fetchMe), `/api/auth/login` POST, `/api/org/users` GET (login), `/api/presence` POST (logout).

### `src/components/TenantInspectorModal.tsx` (3)
- `/api/patients/${pId}` GET, `/api/memories?q=...` GET, `/api/tools/calculate-raf` POST.
- Removed now-unused `token` from the `useAuth()` destructure (was only used in fetch headers).

### `src/components/RoomMembersModal.tsx` (2)
- `/api/rooms/${currentRoom.id}/members/${targetUserId}` DELETE, `/api/rooms/${currentRoom.id}/members` POST (`{ userId: targetUserId }`).

## Deviations from the brief (with rationale)

1. **`useLayoutEffect` instead of `useEffect` for `setAuthToken` registration** (AuthContext). The brief's `useEffect` has a real race: `ChatProvider` is a child of `AuthProvider` (`App.tsx:79→37`) and React fires passive effects **child-first** — on login (`setToken`+`setUser` in one batch), ChatContext's rooms/presence fetch effects would run *before* AuthProvider's registration effect, sending no/stale Authorization → 401 → rooms never load. `useLayoutEffect` runs in the layout phase, before any passive effects, so `authToken` is always current before any fetch effect or callback. Same call sites remain brief-exact (no `token` threading).
2. **Explicit `token` override at 5 AuthContext sites** (`/api/orgs`, `/api/auth/me`, `/api/org/users` ×2 with their in-scope session/data token). These closures receive a token parameter; passing it explicitly is byte-identical to the old `Authorization` header and removes any timing assumption. The brief listed them plain; the `token` param exists in the `api()` signature for exactly this.
3. **`/api/org/users` inside `login()` passes `{ token: data.token }`** — required for correctness, not style: it is called synchronously in the same tick as `setToken(data.token)`, before any effect can register the new token; plain `api()` would send the previous user's token (wrong org users on user switch, nothing on first login).
4. **Mention regex**: no code change needed (WIP commit `cde48e4` already aligned it); only the brief's ponytail marker was added. Verified against backend `routes_messages.py:62-67`.
5. Pre-existing comments in `simulateCoParticipantMessage` (`// 1. Broadcast typing active` etc.) were left as-is to keep the diff scoped; the inline `// Using coUserId as bearer token` inside the deleted headers object went away with the migration.

## Preserved (untouched)

- WIP "ai thinking progress UI" wiring: `isAiThinking` state, `aiThinkingTimeoutRef`, both `mentionsAi` blocks, `ChatArea.tsx`, `index.css`.
- SSE reconnect/backoff logic, read receipts, presence sync, room member SSE handling — only the request plumbing changed.

## Verification

- `grep -rn "fetch(" src --include="*.ts" --include="*.tsx" | grep -v "src/services/api.ts"` → **no matches** (only `api.ts` fetches).
- `grep` for `teamchat-ai-872402492611`, `isFirebaseHosting`, `sseOrigin`, `includes('@Gemini')` → **no matches**.
- `npm test` (pytest): **34 passed**, 2 warnings in 0.28s (unchanged).
- `npm run lint` (`tsc --noEmit`): **exit 0**.
- Manual smoke (login → send → `@Gemini` RAF stream → presence/typing → room create → SSE reconnect) requires dev servers; not runnable in this environment — covered by the code-path equivalence review above (headers/methods/bodies byte-matched per site).

## Self-review

- `api()` passes `{ ...rest, headers }` so the rebuilt `Headers` instance wins over `init.headers`; `Content-Type` is only auto-set when absent and a body exists (GETs unchanged).
- `logout()` relies on registered `authToken`, which equals the state `token` at call time (layout effect syncs on every token change) — same header as before.
- `/api/auth/login` gets a stale `Authorization` header only when re-logging-in with a prior session; verified `routes_auth.py:24-25` has no auth dependency, so the extra header is ignored.
- Staged exactly the 6 files from the instructions; report/progress files left unstaged.
