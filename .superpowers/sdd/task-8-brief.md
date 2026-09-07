### Task 8: demo accounts from one endpoint — kill the seed triplication

**Files:**
- Modify: `backend/app/services/chat_store.py` (add `get_all_users`), `backend/app/services/firestore_store.py` (override it), `backend/app/api/routes_auth.py` (add endpoint), `src/components/LoginPage.tsx` (delete `testAccounts`, fetch instead), `src/context/AuthContext.tsx` (`switchOrganization`), `src/components/ChatArea.tsx:126-133` (hash-based avatar colors)
- Test: `backend/tests/test_demo_accounts.py`

**Interfaces:**
- Produces: `GET /api/demo/accounts` → `200 [{email, name, role, orgSlug, title}]` in demo mode; `404 {"detail": "Demo accounts are only available in demo mode."}` when `FIREBASE_PROJECT_ID` is set. `chat_store.get_all_users() -> List[UserProfile]`.

- [ ] **Step 1: Write failing test**

`backend/tests/test_demo_accounts.py`:

```python
from fastapi.testclient import TestClient


def test_demo_accounts_listed_in_demo_mode(client: TestClient):
    res = client.get("/api/demo/accounts")
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) == 10
    assert {"email", "name", "role", "orgSlug", "title"} == set(accounts[0].keys())
    assert "password" not in accounts[0]
```

- [ ] **Step 2: Verify fail**

Run: `npm test 2>&1 | grep test_demo_accounts`
Expected: FAIL — 404 Not Found

- [ ] **Step 3: Implement backend**

`chat_store.py` (ChatStore, near the other user queries):
```python
def get_all_users(self) -> List[UserProfile]:
    return self.users
```

`firestore_store.py` (override — identity cache may be partial):
```python
def get_all_users(self) -> List[UserProfile]:
    users: List[UserProfile] = []
    for org in self.get_organizations():
        users.extend(self.get_users_by_org(org.slug))
    return users
```

`routes_auth.py` (after `get_org_users`):
```python
@router.get("/demo/accounts")
async def get_demo_accounts():
    # Demo-mode only: evaluation login list. Firebase mode has no seed accounts to expose.
    if settings.FIREBASE_PROJECT_ID:
        raise HTTPException(status_code=404, detail="Demo accounts are only available in demo mode.")
    return [
        {"email": u.email, "name": u.name, "role": u.role, "orgSlug": u.orgSlug, "title": u.title}
        for u in chat_store.get_all_users()
    ]
```

- [ ] **Step 4: Rewire the frontend**

`LoginPage.tsx` — replace the `testAccounts` array (`:33-98`) and add:
```tsx
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

interface DemoAccount { email: string; name: string; role: string; orgSlug: string; title?: string; }
// ...inside the component:
const [testAccounts, setTestAccounts] = useState<DemoAccount[]>([]);
useEffect(() => {
  api('/api/demo/accounts').then((r) => (r.ok ? r.json() : [])).then(setTestAccounts).catch(() => {});
}, []);
```
Keep the render loop as-is (it only uses `email/name/role/org`; the `badgeColor` field dies with the array — inline a two-branch class: `orgSlug === 'valley-primary-care' ? emerald classes : indigo classes`).

`AuthContext.tsx` `switchOrganization` — replace `:162-167` (hardcoded emails) with:
```ts
const res = await api('/api/demo/accounts');
if (!res.ok) return;
const accounts: { email: string; orgSlug: string; role: string }[] = await res.json();
const admin = accounts.find((a) => a.orgSlug === orgSlug && a.role === 'admin') ??
              accounts.find((a) => a.orgSlug === orgSlug);
if (admin) await login(admin.email, 'password123');
```

`ChatArea.tsx:126-133` — replace ID-sniffing `getAvatarColor` with a stable hash (same export signature):
```tsx
const AVATAR_COLORS = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-600', 'bg-amber-500', 'bg-cyan-600'];

export const getAvatarColor = (id?: string) => {
  if (!id) return 'bg-indigo-500';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint`
Expected: 33 passed; tsc exit 0

Run: `grep -rn "northside-health.test" src`
Expected: empty (README keeps its table — docs, not code)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: demo accounts served by API; remove frontend seed triplication and ID-sniffing avatars" && git push origin dev
```

---

