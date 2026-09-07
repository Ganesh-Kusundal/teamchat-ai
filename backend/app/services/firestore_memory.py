"""Durable organization-scoped team memory repository."""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Any, Dict, Optional

from ..config import settings
from ..models.schemas import TeamMemory
from .memory_engine import MemoryEngine


class FirestoreMemoryEngine(MemoryEngine):
    def __init__(self):
        try:
            from google.cloud import firestore
        except ImportError as exc:
            raise RuntimeError(
                "google-cloud-firestore is required when STORAGE_BACKEND=firestore"
            ) from exc
        self._firestore = firestore
        self.db = firestore.Client(
            project=settings.GOOGLE_CLOUD_PROJECT or None,
            database=settings.FIRESTORE_DATABASE,
        )
        self.root_dir = settings.DATA_DIR
        self.seed_memories = []
        self.memories = []

    def _memories_ref(self, org_slug: str):
        return self.db.collection("organizations").document(org_slug).collection("memories")

    @staticmethod
    def _memory_from_doc(doc) -> TeamMemory:
        data = doc.to_dict()
        data["memory_id"] = data.get("memory_id", doc.id)
        return TeamMemory(**data)

    def reset_to_seed(self):
        raise RuntimeError("reset_to_seed is disabled in Firestore mode; use scripts/seed_firestore.py")

    def team_memory_tool(
        self,
        org_slug: str,
        action: str,
        key: Optional[str] = None,
        query: Optional[str] = None,
        value: Optional[Dict[str, Any]] = None,
        room: Optional[str] = None,
        user_email: Optional[str] = None,
    ) -> Dict[str, Any]:
        ref = self._memories_ref(org_slug)
        if action == "recall":
            q = (query or key or "").lower().strip()
            docs = list(ref.stream())
            memories = [self._memory_from_doc(d) for d in docs]
            if key:
                exact = next((m for m in memories if m.key.lower() == key.lower().strip()), None)
                if exact:
                    return {
                        "dataset_version": settings.VERSION,
                        "org_slug": org_slug,
                        "matched_key": exact.key,
                        "memory": exact.model_dump(),
                    }
            words = [word for word in q.split() if len(word) > 2]
            results = []
            for memory in memories:
                value_text = json.dumps(memory.value).lower()
                if memory.key.lower() in q or any(
                    word in memory.key.lower() or word in value_text for word in words
                ):
                    results.append(memory.model_dump())
            return {
                "dataset_version": settings.VERSION,
                "org_slug": org_slug,
                "query": query or key,
                "count": len(results),
                "memories": results,
                "isolation_note": f'Results strictly scoped to tenant "{org_slug}".',
            }

        if action == "store":
            if not key or not key.strip():
                return {"error": "A valid key string is required to store a team memory."}
            if not value or not isinstance(value, dict):
                return {"error": "A value dictionary is required to store a team memory."}
            for field, field_value in value.items():
                if isinstance(field_value, (dict, list)):
                    return {"error": f'Team memory violation: nested value in key "{field}" is rejected.'}
                if not isinstance(field_value, (str, int, float, bool)):
                    return {"error": f'Team memory violation: key "{field}" must be a scalar value.'}

            clean_key = key.strip().lower().replace(" ", "_")
            existing = next(iter(ref.where("key", "==", clean_key).limit(1).stream()), None)
            memory_id = existing.id if existing else f"MEM-{uuid.uuid4().hex}"
            memory = TeamMemory(
                memory_id=memory_id,
                org_slug=org_slug,
                key=clean_key,
                value=value,
                created_by=user_email or "system@teamchat.ai",
                created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                room=room or "general",
            )
            ref.document(memory_id).set(memory.model_dump())
            return {
                "dataset_version": settings.VERSION,
                "success": True,
                "message": f'Team memory "{clean_key}" stored securely in organization "{org_slug}".',
                "memory": memory.model_dump(),
            }

        return {"error": f'Invalid action "{action}". Expected "recall" or "store".'}


memory_engine = FirestoreMemoryEngine()
