import json
from typing import Optional

from ..models.schemas import TeamMemory


def validate_flat_value(value: dict) -> Optional[str]:
    for k, v in value.items():
        if isinstance(v, (dict, list)):
            return (
                "Team memory violation: Value must be a flat dictionary exactly one level deep. "
                f'Nested object or array in key "{k}" is rejected.'
            )
        if not isinstance(v, (str, int, float, bool)):
            return (
                "Team memory violation: "
                f'Value in key "{k}" must be a string, number, or boolean. '
                f'Received type "{type(v).__name__}".'
            )
    return None


def memory_matches(memory: TeamMemory, q: str) -> bool:
    words = [w for w in q.split() if len(w) > 2]
    key = memory.key.lower()
    if key in q:
        return True
    value_text = json.dumps(memory.value).lower()
    return any(w in key or w in value_text for w in words)
