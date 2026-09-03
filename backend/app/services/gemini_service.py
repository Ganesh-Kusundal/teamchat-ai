import os
import re
import json
import time
import asyncio
from typing import List, Dict, Any, Optional
from ..config import settings
from ..models.schemas import Message, UserProfile, ToolCallRecord
from .clinical_engine import clinical_engine
from .memory_engine import memory_engine
from .chat_store import chat_store

# Try importing google-genai SDK
try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    genai = None
    types = None
    HAS_GENAI = False

_genai_client_cache: object = None

def get_genai_client():
    """
    Returns a configured Google Gen AI client.

    Mode selection (checked in order):
      1. Vertex AI mode  — when GOOGLE_CLOUD_PROJECT env var is set.
                           Uses workload identity on Cloud Run (no API key needed).
                           Endpoint: us-central1-aiplatform.googleapis.com
      2. API key mode    — when GEMINI_API_KEY env var is set.
                           Used for local development and AI Studio.
      3. No client       — returns None; deterministic fallback engine activates.
    """
    global _genai_client_cache
    if _genai_client_cache is not None:
        return _genai_client_cache

    if not HAS_GENAI:
        return None

    # --- Mode 1: Vertex AI (Cloud Run / GCP production) ---
    if settings.GOOGLE_CLOUD_PROJECT:
        try:
            client = genai.Client(
                vertexai=True,
                project=settings.GOOGLE_CLOUD_PROJECT,
                location=settings.GOOGLE_CLOUD_LOCATION,
            )
            _genai_client_cache = client
            print(f"[Gemini] Vertex AI mode — project={settings.GOOGLE_CLOUD_PROJECT}, location={settings.GOOGLE_CLOUD_LOCATION}")
            return client
        except Exception as e:
            print(f"[Gemini] Vertex AI init failed: {e}. Attempting API key fallback.")

    # --- Mode 2: API key (local dev / AI Studio) ---
    api_key = settings.GEMINI_API_KEY
    if api_key and api_key not in ("", "MY_GEMINI_API_KEY"):
        try:
            client = genai.Client(api_key=api_key)
            _genai_client_cache = client
            print("[Gemini] API key mode (local dev).")
            return client
        except Exception as e:
            print(f"[Gemini] API key init failed: {e}")

    print("[Gemini] No credentials configured — deterministic fallback engine will handle all AI requests.")
    return None

def format_attributed_prompt(history: List[Message], last_message: Message, room_name: str) -> str:
    recent = history[-15:]
    participants = list(set(m.senderName for m in recent if not m.isAi))

    formatted = f"[Conversation History in #{room_name}]\n"
    for m in recent:
        # Extract HH:MM
        time_str = m.timestamp[11:16] if len(m.timestamp) >= 16 else "12:00"
        if m.isAi:
            formatted += f"[{time_str}] Gemini AI: {m.content[:300]}\n"
        else:
            formatted += f"[{time_str}] {m.senderName}: {m.content}\n"

    formatted += "\n---\n"
    formatted += "Respond directly and helpfully to the conversation.\n"
    formatted += f"The last message is from {last_message.senderName}.\n"
    formatted += f"Multiple team members are participating in this room: {', '.join(participants)}.\n"
    formatted += f'CRITICAL: You MUST maintain context across all participants and address users by name when relevant (e.g. "{last_message.senderName}, regarding your point...").'
    return formatted

def execute_tool(name: str, args: Dict[str, Any], caller_org_slug: str, caller_user: UserProfile) -> Dict[str, Any]:
    if name == "lookup_condition_code":
        code_or_q = str(args.get("code_or_query", ""))
        return clinical_engine.lookup_condition_code(code_or_q)
    elif name == "calculate_risk_score":
        p_id = str(args.get("patient_id")) if args.get("patient_id") else None
        raw_codes = args.get("icd10_codes", [])
        if isinstance(raw_codes, list):
            codes = [str(c) for c in raw_codes]
        else:
            codes = []
        base_rate = float(args.get("base_rate", 12000.0))
        return clinical_engine.calculate_risk_score(
            org_slug=caller_org_slug,
            patient_id=p_id,
            icd10_codes=codes,
            base_rate=base_rate,
        )
    elif name == "get_patient_risk_profile":
        p_id = str(args.get("patient_id", ""))
        return clinical_engine.get_patient_risk_profile(caller_org_slug, p_id)
    elif name == "team_memory":
        act = "store" if args.get("action") == "store" else "recall"
        key = str(args.get("key")) if args.get("key") else None
        query = str(args.get("query")) if args.get("query") else None
        val = args.get("value") if isinstance(args.get("value"), dict) else None
        return memory_engine.team_memory_tool(
            org_slug=caller_org_slug,
            action=act,
            key=key,
            query=query,
            value=val,
            user_email=caller_user.email,
        )
    return {"error": f'Unknown tool "{name}".'}

# Declarations for Gemini Function Calling
lookup_decl = {
    "name": "lookup_condition_code",
    "description": "Lookup ICD-10 diagnosis code details, description, chronic flag, specificity, and CMS-HCC V28 payment category mapping.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "code_or_query": {
                "type": "STRING",
                "description": 'ICD-10 code (e.g. "I50.32" or "I5032") or diagnosis search keyword.',
            }
        },
        "required": ["code_or_query"],
    },
}

calculate_raf_decl = {
    "name": "calculate_risk_score",
    "description": "Calculate CMS-HCC V28 Risk Adjustment Factor (RAF) score and estimated annual Medicare payment ($12,000 base rate). Follows strict CMS hierarchy supersession rules.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "patient_id": {
                "type": "STRING",
                "description": 'Optional patient identifier (e.g. "PT-4001", "PT-4003"). Automatically loads age, sex, and model segment.',
            },
            "icd10_codes": {
                "type": "ARRAY",
                "items": {"type": "STRING"},
                "description": 'List of ICD-10 diagnosis codes (e.g. ["E11.22", "N18.4", "I50.32"]).',
            },
            "base_rate": {
                "type": "NUMBER",
                "description": "Base rate per 1.0 RAF score. Defaults to $12,000.",
            },
        },
    },
}

patient_profile_decl = {
    "name": "get_patient_risk_profile",
    "description": "Retrieve patient risk profile and unrecaptured chronic care gap analysis. Strictly isolated by caller organization.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "patient_id": {
                "type": "STRING",
                "description": 'Patient identifier (e.g. "PT-4001", "PT-4003", "PT-4013").',
            }
        },
        "required": ["patient_id"],
    },
}

team_memory_decl = {
    "name": "team_memory",
    "description": "Recall or store organization guidelines, recapture targets, EHR documentation policies. Strictly isolated by tenant.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "action": {
                "type": "STRING",
                "description": '"recall" to search organizational memory, or "store" to save a new memory.',
            },
            "key": {"type": "STRING", "description": "Memory key identifier."},
            "query": {
                "type": "STRING",
                "description": "Natural language query when recalling memory.",
            },
            "value": {
                "type": "OBJECT",
                "description": "Flat 1-level dictionary when storing a new memory.",
            },
        },
        "required": ["action"],
    },
}

MODEL_CANDIDATES = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]

async def handle_ai_invocation(
    room_id: str,
    org_slug: str,
    room_name: str,
    trigger_message: Message,
    caller_user: UserProfile,
):
    ai_message_id = f"msg-ai-{int(time.time() * 1000)}"
    initial_ai_message = Message(
        id=ai_message_id,
        roomId=room_id,
        orgSlug=org_slug,
        senderId="gemini-ai",
        senderName="Gemini AI",
        isAi=True,
        content="",
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        isStreaming=True,
        toolCalls=[],
    )
    chat_store.add_message(initial_ai_message)

    history = chat_store.get_messages(room_id, org_slug, limit=20)
    attributed_prompt = format_attributed_prompt(history, trigger_message, room_name)

    system_instruction = f"""You are TeamChat AI, a highly capable collaborative AI colleague integrated directly into team chat rooms for {org_slug}.
You are collaborating in real-time with healthcare and technology professionals (clinicians, risk adjustment coders, quality auditors, engineers).
- Always acknowledge who asked or spoke, addressing participants by name (e.g. "{trigger_message.senderName}", "As Sarah mentioned...").
- You have access to official tools:
  * lookup_condition_code: inspect ICD-10 diagnosis codes and whether they map to CMS-HCC V28.
  * calculate_risk_score: compute full RAF breakdown and estimated financial impact ($12,000 base rate) with hierarchy rules.
  * get_patient_risk_profile: load patient profiles and suspected unrecaptured care gaps.
  * team_memory: recall or store organization guidelines and recapture targets.
- Strict Tenant Boundary: All data you access is strictly scoped to organization "{org_slug}". Never assume or reveal details from other organizations.
- Formatting: Use clean Markdown with clear headings, bullet points, and bold text."""

    client = get_genai_client()

    if not client:
        # Fallback to local deterministic clinical intelligence engine
        fallback = generate_intelligent_fallback(
            prompt=trigger_message.content,
            last_sender=trigger_message.senderName,
            org_slug=org_slug,
            caller_user=caller_user,
        )
        await simulate_streaming(
            ai_message_id,
            room_id,
            org_slug,
            fallback["text"],
            fallback["tool_calls"],
        )
        return

    # Attempt calling live Gemini model
    success = False
    last_err = None

    for model_name in MODEL_CANDIDATES:
        if success:
            break
        for attempt in range(2):
            try:
                if attempt > 0:
                    await asyncio.sleep(0.8)

                # Convert declarations to types
                tool_config = types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.3,
                    tools=[
                        types.Tool(
                            function_declarations=[
                                types.FunctionDeclaration(**lookup_decl),
                                types.FunctionDeclaration(**calculate_raf_decl),
                                types.FunctionDeclaration(**patient_profile_decl),
                                types.FunctionDeclaration(**team_memory_decl),
                            ]
                        )
                    ],
                )

                response = client.models.generate_content(
                    model=model_name,
                    contents=attributed_prompt,
                    config=tool_config,
                )

                tool_calls_executed: List[ToolCallRecord] = []

                if response.function_calls:
                    tool_results_payload = []
                    for call in response.function_calls:
                        c_args = call.args if isinstance(call.args, dict) else {}
                        rec = ToolCallRecord(
                            id=f"tool-{int(time.time()*1000)}-{call.name}",
                            toolName=call.name,
                            args=c_args,
                            status="running",
                        )
                        tool_calls_executed.append(rec)
                        t_res = execute_tool(call.name, c_args, org_slug, caller_user)
                        rec.result = t_res
                        rec.status = "completed"

                        tool_results_payload.append(
                            {"name": call.name, "response": {"name": call.name, "content": t_res}}
                        )

                    followup_prompt = f"{attributed_prompt}\n\nTool Results:\n{json.dumps(tool_results_payload, indent=2)}\n\nNow synthesize a complete, beautifully formatted response addressing {trigger_message.senderName} and the team."

                    stream_res = client.models.generate_content_stream(
                        model=model_name,
                        contents=followup_prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.3,
                        ),
                    )

                    for chunk in stream_res:
                        text_chunk = chunk.text or ""
                        if text_chunk:
                            chat_store.update_streaming_message(
                                ai_message_id,
                                room_id,
                                org_slug,
                                text_chunk,
                                False,
                                tool_calls_executed,
                            )
                            await asyncio.sleep(0.02)

                    chat_store.update_streaming_message(
                        ai_message_id,
                        room_id,
                        org_slug,
                        "",
                        True,
                        tool_calls_executed,
                    )
                else:
                    # No tool calls, stream content
                    stream_res = client.models.generate_content_stream(
                        model=model_name,
                        contents=attributed_prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.3,
                        ),
                    )

                    for chunk in stream_res:
                        text_chunk = chunk.text or ""
                        if text_chunk:
                            chat_store.update_streaming_message(
                                ai_message_id,
                                room_id,
                                org_slug,
                                text_chunk,
                                False,
                                [],
                            )
                            await asyncio.sleep(0.02)

                    chat_store.update_streaming_message(
                        ai_message_id, room_id, org_slug, "", True, []
                    )

                success = True
                break
            except Exception as e:
                last_err = e
                print(f"[Gemini API] Failed on model {model_name} (attempt {attempt+1}): {e}")
                await asyncio.sleep(0.5)

    if not success:
        print(f"[Gemini API] Falling back to deterministic clinical engine. Error: {last_err}")
        fallback = generate_intelligent_fallback(
            prompt=trigger_message.content,
            last_sender=trigger_message.senderName,
            org_slug=org_slug,
            caller_user=caller_user,
        )
        note = f"> ℹ️ *Note: Gemini cloud model experiencing high demand. Grounded response provided via deterministic clinical engine for **{trigger_message.senderName}**.*"
        await simulate_streaming(
            ai_message_id,
            room_id,
            org_slug,
            f"{note}\n\n{fallback['text']}",
            fallback["tool_calls"],
        )

def generate_intelligent_fallback(
    prompt: str, last_sender: str, org_slug: str, caller_user: UserProfile
) -> Dict[str, Any]:
    p = prompt.lower()
    tool_calls: List[ToolCallRecord] = []

    # Check 1: Patient lookup
    pt_match = re.search(r"PT-\d{4}", prompt, re.IGNORECASE)
    if pt_match:
        pt_id = pt_match.group(0).upper()
        res = clinical_engine.get_patient_risk_profile(org_slug, pt_id)
        tool_calls.append(
            ToolCallRecord(
                id=f"tool-{int(time.time()*1000)}-patient",
                toolName="get_patient_risk_profile",
                args={"patient_id": pt_id},
                result=res,
                status="completed",
            )
        )

        if "error" in res:
            return {
                "text": f"**{last_sender}**, I searched the patient database for **{pt_id}**:\n\n⚠️ **{res['error']}**\n\n*Security Note*: Each organization operates with strictly isolated patient datasets. If this patient belongs to another healthcare tenant, their records are completely invisible to prevent cross-tenant PHI leakage.",
                "tool_calls": tool_calls,
            }

        pt = res["patient"]
        doc_items = []
        for c in pt["documented_conditions_2026"]:
            hcc_tag = f"*(CMS-HCC {c['hcc_v28_code']})*" if c.get("hcc_v28_code") else "*(No HCC Mapping)*"
            doc_items.append(f"- `{c['icd10_code']}`: **{c['description']}** {hcc_tag}")
        doc_list = "\n".join(doc_items)

        susp_items = []
        for c in pt["suspected_conditions"]:
            hcc_tag = f"*(CMS-HCC {c['hcc_v28_code']})*" if c.get("hcc_v28_code") else ""
            ev_tag = f"\n  *Clinical Evidence*: {c.get('evidence', '')}" if c.get("evidence") else ""
            susp_items.append(f"- `{c['icd10_code']}`: **{c['description']}** {hcc_tag}{ev_tag}")
        susp_list = "\n".join(susp_items)

        return {
            "text": f"""Hello **{last_sender}**. Here is the clinical risk adjustment profile for **{pt['name']} ({pt['patient_id']})**:

### Patient Demographics & Enrollment
- **Age/Sex**: {pt['age']}-year-old {"Female" if pt['sex'] == 'F' else "Male"}
- **Model Segment**: `{pt['enrollment']['model_segment']}` ({"Dual Eligible" if pt['enrollment']['medicaid_dual'] else "Non-Dual"})
- **Plan**: {pt['enrollment']['plan']} | **Attending**: {pt['attending_provider']} | **Last Visit**: {pt['last_visit']}

### 2026 Documented Conditions
{doc_list}

### Suspected Chronic Care Gaps (Unrecaptured)
{susp_list}

### RAF Financial Impact Summary
- **Current Documented RAF**: `{pt['raf_analysis']['current_documented']}`
- **Potential RAF with Gap Closure**: `{pt['raf_analysis']['potential_with_suspected']}`
- **Annual Recapture Gap**: **+${pt['raf_analysis']['annual_financial_gap']:,}** *(Based on $12,000 base rate)*

Would you like me to run a full RAF hierarchy calculation on these codes?""",
            "tool_calls": tool_calls,
        }

    # Check 2: Team memory check
    if any(k in p for k in ["recapture", "target", "policy", "rule", "memory", "specialist"]):
        recall_res = memory_engine.team_memory_tool(org_slug, "recall", query=prompt)
        tool_calls.append(
            ToolCallRecord(
                id=f"tool-{int(time.time()*1000)}-memory",
                toolName="team_memory",
                args={"action": "recall", "query": prompt},
                result=recall_res,
                status="completed",
            )
        )

        if recall_res.get("memories"):
            mem_items = []
            for m in recall_res["memories"]:
                val_items = "\n".join(f"  - **{k.replace('_', ' ')}**: {v}" for k, v in m["value"].items())
                mem_items.append(f"#### `{m['key']}` *(Room: #{m['room']})*\n{val_items}\n*Created by {m['created_by']} on {m['created_at'][:10]}*")

            return {
                "text": f"""**{last_sender}**, I queried our team memory bank for **{org_slug}**:

{chr(10).join(mem_items)}

*(Notice: Results are strictly partitioned by tenant. If this were queried from another organization, their specific policies or targets would be returned instead.)*""",
                "tool_calls": tool_calls,
            }

    # Check 3: ICD-10 Code lookup / RAF calculation
    code_match = re.search(r"[A-TV-Z]\d{2}(?:\.\d{1,4})?", prompt, re.IGNORECASE)
    if code_match:
        code = code_match.group(0)
        code_res = clinical_engine.lookup_condition_code(code)
        tool_calls.append(
            ToolCallRecord(
                id=f"tool-{int(time.time()*1000)}-lookup",
                toolName="lookup_condition_code",
                args={"code_or_query": code},
                result=code_res,
                status="completed",
            )
        )

        if "code" in code_res:
            raf_res = clinical_engine.calculate_risk_score(org_slug=org_slug, icd10_codes=[code_res["code"]])
            tool_calls.append(
                ToolCallRecord(
                    id=f"tool-{int(time.time()*1000)}-raf",
                    toolName="calculate_risk_score",
                    args={"icd10_codes": [code_res["code"]]},
                    result=raf_res,
                    status="completed",
                )
            )

            hcc_map_str = (
                f"**HCC {code_res['hcc_v28_code']}** — *{code_res['hcc_v28_label']}*"
                if code_res["maps_to_hcc"]
                else "❌ **No HCC Mapping** *(Does not increase RAF score directly)*"
            )
            return {
                "text": f"""**{last_sender}**, here is the ICD-10 and CMS-HCC V28 analysis for **`{code_res['code']}`**:

### Diagnosis Details
- **Description**: {code_res['description']}
- **Family**: {code_res['code_family']} | **Chapter**: {code_res['chapter']}
- **Clinical Specificity**: `{code_res['specificity']}` | **Chronic Condition**: {"Yes" if code_res['chronic'] else "No"}
- **CMS-HCC V28 Mapping**: {hcc_map_str}

### RAF Score Impact Example (75-year-old female, non-dual)
- Demographic Weight: **{raf_res['demographic_coefficient']}**
- Condition Factor: **{raf_res['hcc_coefficient_sum']}**
- Combined Total RAF: **{raf_res['raf_total']}**
- Estimated Annual Medicare Payment: **${raf_res['estimated_annual_payment']:,}** *(at $12,000 base rate)*

*Dataset Version: {code_res['dataset_version']}*""",
                "tool_calls": tool_calls,
            }

    # Default collaboration response
    return {
        "text": f"""Hello **{last_sender}**! I'm active in **#{org_slug}** and collaborating with all participants in this room.

You can ask me to:
- 🔍 **Lookup condition codes**: e.g., `@Gemini lookup I50.32` or `@Gemini what HCC does E11.22 map to?`
- 📊 **Evaluate patient risk**: e.g., `@Gemini check patient PT-4001` or `PT-4003`
- 🧠 **Recall team memories & policies**: e.g., `@Gemini what is our Q1 recapture target?` or `@Gemini what is our diabetes documentation policy?`
- 💰 **Calculate RAF scores**: e.g., `@Gemini calculate RAF for E11.22 and N18.4`

How can I help the team move forward?""",
        "tool_calls": tool_calls,
    }

async def simulate_streaming(
    message_id: str,
    room_id: str,
    org_slug: str,
    text: str,
    tool_calls: List[ToolCallRecord],
):
    words = text.split(" ")
    batch_size = 3
    for i in range(0, len(words), batch_size):
        chunk = (" " if i > 0 else "") + " ".join(words[i : i + batch_size])
        is_complete = i + batch_size >= len(words)
        chat_store.update_streaming_message(
            message_id,
            room_id,
            org_slug,
            chunk,
            is_complete,
            tool_calls,
        )
        await asyncio.sleep(0.035)
