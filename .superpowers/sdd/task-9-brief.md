### Task 9: `logging` replaces `print`

**Files:**
- Modify: `backend/app/services/gemini_service.py` (7 prints: :54, :57, :65, :68, :70, :387, :391), `backend/app/auth/firebase.py` (4: :37, :40, :43, :62, :78), `backend/app/services/firestore_store.py:376`, `backend/app/services/event_broker.py:79`, `backend/app/main.py` (add `logging.basicConfig` in lifespan)
- Test: existing suite

**Interfaces:**
- Produces: module loggers `logger = logging.getLogger(__name__)`; messages keep their existing text/level semantics.

- [ ] **Step 1: Mechanical swap**

Per file add `import logging` + `logger = logging.getLogger(__name__)`, then:
- `print(f"[Gemini] ...")` → `logger.info(...)` / `logger.warning(...)` for failure lines (init failures `:57, :68`, model failures `:387, :391`, relay failure in event_broker, firebase failures `:40, :43, :62, :78`)
- Informational lines (init success, mode selection) → `logger.info(...)`
- Strip the `[Gemini]`/`[Firebase]`/`[Realtime]` prefixes — the logger name carries that context.

`main.py` — in `lifespan`, before the checks:
```python
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
```

- [ ] **Step 2: Verify**

Run: `npm test`
Expected: 33 passed

Run: `grep -rn "print(" backend/app | grep -v "core\|__main__"`
Expected: empty

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: structured logging replaces print statements" && git push origin dev
```

---

