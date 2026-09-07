### Task 5: auth boundary fixes — no private imports, no engine reach-through

**Files:**
- Modify: `backend/app/auth/dependencies.py:28,66-73`, `backend/app/api/routes_realtime.py:9-28`, `backend/app/api/routes_tools.py:22-26`, `backend/app/services/clinical_engine.py` (add one method), `backend/tests/test_production_boundaries.py` (3× rename)
- Test: `backend/tests/test_token_extraction.py`

**Interfaces:**
- Produces: `auth.dependencies.resolve_user_from_token(token: str) -> Optional[UserProfile]` (public), `auth.dependencies.token_from_request(request: Request, query_token: Optional[str] = None) -> Optional[str]` (order: Bearer header > `x-user-id` > query), `clinical_engine.get_patients_for_org(org_slug: str) -> List[Patient]`

- [ ] **Step 1: Write failing test**

`backend/tests/test_token_extraction.py`:

```python
from starlette.testclient import TestClient
from fastapi import Request
from backend.app.auth.dependencies import token_from_request
from backend.app.main import app


def _req(headers=None, query=""):
    scope = {"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
             "query_string": query.encode(), "method": "GET", "path": "/"}
    return Request(scope)


def test_bearer_wins_over_everything():
    r = _req({"authorization": "Bearer abc", "x-user-id": "usr-1"}, "token=q")
    assert token_from_request(r, "q") == "abc"


def test_x_user_id_then_query():
    assert token_from_request(_req({"x-user-id": "usr-1"})) == "usr-1"
    assert token_from_request(_req({}, "token=q"), "q") == "q"
    assert token_from_request(_req()) is None


def test_realtime_stream_accepts_bearer(client: TestClient, northside_headers):
    with client.stream("GET", "/api/events", headers=northside_headers) as res:
        assert res.status_code == 200
```

- [ ] **Step 2: Verify fail**

Run: `npm test 2>&1 | grep test_token_extraction`
Expected: FAIL — `ImportError: cannot import name 'token_from_request'`

- [ ] **Step 3: Implement**

`auth/dependencies.py`:
- Rename `def _resolve_user_from_token` → `def resolve_user_from_token` (`:28`); update the call at `:80` and the three references in `test_production_boundaries.py` (`dependencies._resolve_user_from_token` → `dependencies.resolve_user_from_token`).
- Add above `get_request_context`:

```python
def token_from_request(request: Request, query_token: Optional[str] = None) -> Optional[str]:
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    if "x-user-id" in request.headers:
        return request.headers.get("x-user-id")
    return query_token
```

- `get_request_context` `:66-73` becomes:
```python
token = None
if auth and auth.credentials:
    token = auth.credentials
if not token:
    token = token_from_request(request)
```

`routes_realtime.py:15-28` — replace the manual header parsing with:

```python
from ..auth.dependencies import resolve_user_from_token, token_from_request

@router.get("/events")
async def events_stream(request: Request, token: Optional[str] = None, roomId: Optional[str] = None):
    auth_token = token_from_request(request, token)
    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required for real-time events.")
    user = await run_in_threadpool(resolve_user_from_token, auth_token)
```
(delete the `from ..auth.dependencies import _resolve_user_from_token` import and `:16-22`)

`clinical_engine.py` — add method to `ClinicalEngine` (after `lookup_condition_code`):

```python
def get_patients_for_org(self, org_slug: str) -> List[Patient]:
    return [p for p in self.patients if p.org_slug == org_slug]
```

`routes_tools.py:22-26` — replace:
```python
org_patients = [p.model_dump() for p in clinical_engine.patients if p.org_slug == context.org_slug]
```
with:
```python
org_patients = [p.model_dump() for p in clinical_engine.get_patients_for_org(context.org_slug)]
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: 32 passed (29 + 3 new)

Run: `grep -rn "_resolve_user_from_token\|clinical_engine.patients" backend/app backend/tests`
Expected: empty

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: public token-resolution API; realtime uses shared extraction; engine encapsulation" && git push origin dev
```

---

