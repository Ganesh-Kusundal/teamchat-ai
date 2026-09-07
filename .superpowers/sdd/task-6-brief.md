### Task 6: dead code deletion + internal dedup

**Files:**
- Modify: `backend/app/models/schemas.py:62,236-242` (delete `Room.aiPersona`, `GroundingRecord`), `src/types.ts:45` (delete `aiPersona`), `package.json:9,11` (delete `dev:python`, `test:python`), `backend/app/services/gemini_service.py:325-381` (dedup streaming loop)
- Test: existing suite + `tsc --noEmit`

**Interfaces:**
- Consumes: nothing new
- Produces: `_stream_response(client, model_name, contents, system_instruction, ai_message_id, room_id, org_slug, tool_calls)` (module-private helper in `gemini_service.py`)

- [ ] **Step 1: Prove dead code is dead**

Run: `grep -rn "GroundingRecord\|aiPersona" backend src`
Expected: only the definition lines (schemas.py:62, schemas.py:236, types.ts:45). If anything else appears, STOP and reassess.

- [ ] **Step 2: Delete**

- `schemas.py`: remove `aiPersona: Optional[str] = None` (`:62`) and the whole `GroundingRecord` class (`:236-242`)
- `types.ts:45`: remove `aiPersona?: string;`
- `package.json`: remove lines `"dev:python": ...` and `"test:python": ...` (keep valid JSON — drop trailing comma on the previous line)

- [ ] **Step 3: Dedup the streaming loop in gemini_service.py**

Add module-private helper after `execute_tool`:

```python
async def _stream_response(client, model_name, contents, system_instruction, ai_message_id, room_id, org_slug, tool_calls):
    stream = client.models.generate_content_stream(
        model=model_name,
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=system_instruction, temperature=0.3),
    )
    for chunk in stream:
        text_chunk = chunk.text or ""
        if text_chunk:
            chat_store.update_streaming_message(ai_message_id, room_id, org_slug, text_chunk, False, tool_calls)
            await asyncio.sleep(0.02)
    chat_store.update_streaming_message(ai_message_id, room_id, org_slug, "", True, tool_calls)
```

Replace the tool-calls branch (`:325-354`) with:
```python
await _stream_response(client, model_name, followup_prompt, system_instruction,
                       ai_message_id, room_id, org_slug, tool_calls_executed)
```
and the no-tool branch (`:356-381`) with:
```python
await _stream_response(client, model_name, attributed_prompt, system_instruction,
                       ai_message_id, room_id, org_slug, [])
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint`
Expected: tests pass; tsc exits 0

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: delete dead symbols, dedup streaming loop, drop duplicate npm scripts" && git push origin dev
```

---

