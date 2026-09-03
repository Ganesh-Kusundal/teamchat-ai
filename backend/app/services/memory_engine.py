import json
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Literal
from ..config import settings
from ..models.schemas import TeamMemory

DATASET_VERSION = settings.VERSION

class MemoryEngine:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.seed_memories: List[TeamMemory] = []
        self.memories: List[TeamMemory] = []
        self.load_datasets()

    def load_datasets(self):
        mem_path = self.root_dir / "team_memory_seed.json"
        if mem_path.exists():
            with open(mem_path, mode="r", encoding="utf-8") as f:
                data = json.load(f)
                raw_memories = data.get("memories", [])
                self.seed_memories = [TeamMemory(**m) for m in raw_memories]
                self.reset_to_seed()

    def reset_to_seed(self):
        self.memories = [m.model_copy() for m in self.seed_memories]

    def team_memory_tool(
        self,
        org_slug: str,
        action: Literal["recall", "store"],
        key: Optional[str] = None,
        query: Optional[str] = None,
        value: Optional[Dict[str, Any]] = None,
        room: Optional[str] = None,
        user_email: Optional[str] = None,
    ) -> Dict[str, Any]:
        if action == "recall":
            q = (query or key or "").lower().strip()
            org_mems = [m for m in self.memories if m.org_slug == org_slug]

            # Exact key match
            if key:
                exact = next((m for m in org_mems if m.key.lower() == key.lower().strip()), None)
                if exact:
                    return {
                        "dataset_version": DATASET_VERSION,
                        "org_slug": org_slug,
                        "matched_key": exact.key,
                        "memory": exact.model_dump(),
                    }

            # Semantic / keyword search over key and values
            results = []
            for m in org_mems:
                val_str = json.dumps(m.value).lower()
                words = [w for w in q.split() if len(w) > 2]
                if m.key.lower() in q or any(w in m.key.lower() or w in val_str for w in words):
                    results.append(m.model_dump())

            return {
                "dataset_version": DATASET_VERSION,
                "org_slug": org_slug,
                "query": query or key,
                "count": len(results),
                "memories": results,
                "isolation_note": f'Results strictly scoped to tenant "{org_slug}". Cross-tenant memories are completely isolated.',
            }

        elif action == "store":
            if not key:
                return {"error": "A valid key string is required to store a team memory."}
            if not value or not isinstance(value, dict):
                return {"error": "A value dictionary is required to store a team memory."}

            # Validate flat dictionary rule: 1 level deep only, values must be string | int | float | bool
            for k, v in value.items():
                if isinstance(v, (dict, list)):
                    return {
                        "error": f'Team memory violation: Value must be a flat dictionary exactly one level deep. Nested object or array in key "{k}" is rejected.'
                    }
                if not isinstance(v, (str, int, float, bool)):
                    return {
                        "error": f'Team memory violation: Value in key "{k}" must be a string, number, or boolean. Received type "{type(v).__name__}".'
                    }

            clean_key = key.strip().lower().replace(" ", "_")
            new_mem = TeamMemory(
                memory_id=f"MEM-{org_slug[:3].upper()}-{int(time.time() * 1000) % 10000:04d}",
                org_slug=org_slug,
                key=clean_key,
                value=value,
                created_by=user_email or "system@teamchat.ai",
                created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                room=room or "general",
            )

            # Update if existing in same org, else append
            existing_idx = next(
                (i for i, m in enumerate(self.memories) if m.org_slug == org_slug and m.key == clean_key),
                -1,
            )
            if existing_idx >= 0:
                self.memories[existing_idx] = new_mem
            else:
                self.memories.append(new_mem)

            return {
                "dataset_version": DATASET_VERSION,
                "success": True,
                "message": f'Team memory "{clean_key}" stored securely in organization "{org_slug}".',
                "memory": new_mem.model_dump(),
            }

        return {"error": f'Invalid action "{action}". Expected "recall" or "store".'}

memory_engine = MemoryEngine(settings.DATA_DIR)
