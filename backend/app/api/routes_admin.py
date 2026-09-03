from fastapi import APIRouter, Depends
from ..models.schemas import RequestContext
from ..services.chat_store import chat_store
from ..services.memory_engine import memory_engine
from ..auth.dependencies import require_admin

router = APIRouter(prefix="/admin", tags=["Admin Operations"])

@router.post("/reset-demo")
async def reset_demo(context: RequestContext = Depends(require_admin)):
    chat_store.reset_to_seed()
    memory_engine.reset_to_seed()
    return {"message": "Demo data reset successfully to seed state."}
