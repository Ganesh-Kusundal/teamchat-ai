# Task 8 Report: demo accounts served by API; seed triplication + ID-sniffing avatars removed

**Commit:** `b426c4e` — `refactor: demo accounts served by API; remove frontend seed triplication and ID-sniffing avatars`
**Branch:** `dev` (pushed to `origin/dev`, `7f4cc8a..b426c4e`)
**TDD mode:** strict red → green

---

## Per-file changes

### 1. `backend/tests/test_demo_accounts.py` (new)
Written first (Step 1), verbatim from the brief: `GET /api/demo/accounts` must return 200 with 10 accounts, exact key set `{email, name, role, orgSlug, title}` on `accounts[0]`, and no `password` key. Uses the existing `client` fixture from `backend/tests/conftest.py` (TestClient over the real app, autouse seed-reset fixture).

### 2. `backend/app/services/chat_store.py`
Added `ChatStore.get_all_users() -> List[UserProfile]` returning `self.users`, placed directly under `get_users_by_org` in the Users section (chat_store.py:339). `List`/`UserProfile` were already imported.

### 3. `backend/app/services/firestore_store.py`
Added `FirestoreChatStore.get_all_users()` override (firestore_store.py:131) exactly per brief: iterates `self.get_organizations()` and extends with `self.get_users_by_org(org.slug)` — correct because the in-memory identity cache may be partial while per-org reads always hit Firestore.

### 4. `backend/app/api/routes_auth.py`
Added `GET /demo/accounts` after `get_org_users` (routes_auth.py:78-86):
- Guard: `if settings.FIREBASE_PROJECT_ID: raise HTTPException(status_code=404, detail="Demo accounts are only available in demo mode.")`
- Otherwise returns `[{email, name, role, orgSlug, title}]` from `chat_store.get_all_users()`.
- Reused existing imports (`settings` line 9, `HTTPException` line 3, `chat_store` line 6) — no new imports. The brief's inline comment was dropped per the global "no comments" constraint.

### 5. `src/components/LoginPage.tsx`
- Deleted the 66-line hardcoded `testAccounts` array (old lines 33-98).
- Added module-scope `interface DemoAccount { email; name; role; orgSlug; title? }`.
- Added in-component state + fetch using the Task 7 client: `api('/api/demo/accounts').then((r) => (r.ok ? r.json() : [])).then(setTestAccounts).catch(() => {})` inside `useEffect(() => …, [])`.
- Imports updated: `useEffect` added; `import { api } from '../services/api.js'` added.
- Render loop adaptations forced by the API shape (the brief's "keep as-is" assumed fields that don't exist on the endpoint response):
  - Filter: `acc.slug === selectedOrgFilter` → `acc.orgSlug === selectedOrgFilter`.
  - Badge color: `acc.badgeColor` → inline two-branch class, `acc.orgSlug === 'valley-primary-care' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'` (per brief).
  - Badge text: old `acc.org` display name is not in the API payload; replaced with a 1-line slug→label helper `orgLabel` (`'northside-health'` → `'Northside Health'`), producing byte-identical labels to the deleted array — no new hardcoded org names.
  - Email input placeholder `"e.g. sarah@northside-health.test"` was the one remaining hardcoded seed email in `src` and failed the brief's own Step 5 grep; replaced with dynamic `testAccounts[0] ? \`e.g. ${testAccounts[0].email}\` : 'e.g. you@example.test'`.
- Org filter pills, persona count, role/email line (`{acc.role} · {acc.email}`), and all other UI untouched.

### 6. `src/context/AuthContext.tsx`
`switchOrganization` (AuthContext.tsx:147-163): removed the hardcoded per-org `defaultEmail` ternary; now fetches via the shared client:
```ts
const res = await api('/api/demo/accounts');
if (!res.ok) return;
const accounts: { email: string; orgSlug: string; role: string }[] = await res.json();
const admin = accounts.find((a) => a.orgSlug === orgSlug && a.role === 'admin') ??
              accounts.find((a) => a.orgSlug === orgSlug);
if (admin) await login(admin.email, 'password123');
```
Kept the pre-existing `allOrganizations` guard and try/catch (behavior-preserving; the brief targets only the hardcoded emails). Verified seed roles are literally `"admin"` for sarah/elena/marcus (chat_store.py SEED_USERS), so the admin-first lookup resolves to the same users the old ternary produced; fallback preserves behavior for any org lacking an admin. `login()` signature unchanged.

### 7. `src/components/ChatArea.tsx`
Only `getAvatarColor` replaced (ChatArea.tsx:196-204; the brief's `:126-133` line refs are stale — file shifted from the cde48e4 AI-Thinking commit):
```ts
const AVATAR_COLORS = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-600', 'bg-amber-500', 'bg-cyan-600'];
export const getAvatarColor = (id?: string) => {
  if (!id) return 'bg-indigo-500';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
```
Export signature unchanged; both call sites (ChatArea.tsx:252, :450) untouched. The `sarah/mike/lisa/elena/marcus` ID-sniffing branches are gone; colors are now stable per user ID regardless of seed email substrings. The AI-Thinking WIP block (ReadStatusIndicator etc.) was not touched — `git diff src/components/ChatArea.tsx` shows only the function swap.

---

## Red / Green evidence

**Red (Step 2)** — after writing the test, before backend implementation:
```
FAILED backend/tests/test_demo_accounts.py::test_demo_accounts_listed_in_demo_mode
=================== 1 failed, 34 passed, 2 warnings in 0.31s ===================
```
(Failure was 404 Not Found — endpoint did not exist.)

**Green (Step 5, final):**
```
======================== 35 passed, 2 warnings in 0.27s ========================
```

## Lint
```
> teamchat-ai@1.0.0 lint
> tsc --noEmit

lint exit: 0
```

## Greps
- `grep -rn "northside-health.test" src` → **empty** (clean). Note: initially flagged `LoginPage.tsx:92` placeholder; fixed (see above), re-run clean. README table intentionally untouched (docs, not code).
- `grep -E "//" ` over added LoginPage lines → no new comments added anywhere; only pre-existing comments retained/removed with their blocks.
- Seed email / `testAccounts` literal array no longer present in any component.

## Test count reconciliation
Baseline 34 passed (per task context) + 1 new (`test_demo_accounts.py`) = **35 passed**, matching the run. (Brief predicted 33; superseded by the task-context baseline.)

## Staging
Exactly the 7 specified files committed (55 insertions, 86 deletions):
`backend/app/services/chat_store.py`, `backend/app/services/firestore_store.py`, `backend/app/api/routes_auth.py`, `backend/tests/test_demo_accounts.py`, `src/components/LoginPage.tsx`, `src/context/AuthContext.tsx`, `src/components/ChatArea.tsx`. `.superpowers/sdd/*` artifacts left uncommitted, per instruction.

## Self-review notes / deviations
1. **`/api/demo/accounts` is unauthenticated by design** — matches the brief (LoginPage needs it pre-login); it exposes only seed demo fields and is 404-gated in Firebase mode. No status/error strings changed anywhere else.
2. **Brief snippet vs. Task 7 client**: raw-`fetch` sketch replaced with `api(...)` returning `Promise<Response>` in both LoginPage and AuthContext, as instructed by task context.
3. **Brief comment dropped** in `get_demo_accounts` due to the global no-comments constraint; the guard is self-explanatory.
4. **Brief line refs stale** (`LoginPage :33-98`, `AuthContext :162-167`, `ChatArea :126-133`) — located by symbol instead; all targets found and replaced.
5. **`title?` optional** in `DemoAccount` even though the backend always emits it (possibly `null`); the field is unused in render, so no runtime impact.
