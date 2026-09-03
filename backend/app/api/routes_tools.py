from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from ..models.schemas import RequestContext
from ..services.clinical_engine import clinical_engine
from ..services.memory_engine import memory_engine
from ..auth.dependencies import get_request_context

router = APIRouter(tags=["Clinical Tools & Diagnostics"])

class CalculateRafRequest(BaseModel):
    patientId: Optional[str] = None
    icd10Codes: Optional[List[str]] = None
    baseRate: Optional[float] = 12000.0

class StoreMemoryRequest(BaseModel):
    key: str
    value: Dict[str, Any]
    room: Optional[str] = None

@router.get("/patients")
async def get_patients(context: RequestContext = Depends(get_request_context)):
    # Strictly scoped by caller's org_slug!
    org_patients = [p.model_dump() for p in clinical_engine.patients if p.org_slug == context.org_slug]
    return org_patients

@router.get("/patients/{patient_id}")
async def get_patient_profile(
    patient_id: str,
    context: RequestContext = Depends(get_request_context),
):
    result = clinical_engine.get_patient_risk_profile(context.org_slug, patient_id)
    return result

@router.get("/tools/lookup")
async def lookup_condition(q: str = Query(..., description="ICD-10 code or search term")):
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Missing search query or code parameter 'q'.")
    return clinical_engine.lookup_condition_code(q)

@router.post("/tools/calculate-raf")
async def calculate_raf(
    req: CalculateRafRequest,
    context: RequestContext = Depends(get_request_context),
):
    result = clinical_engine.calculate_risk_score(
        org_slug=context.org_slug,
        patient_id=req.patientId,
        icd10_codes=req.icd10Codes,
        base_rate=req.baseRate or 12000.0,
    )
    return result

@router.get("/memories")
async def recall_memories(
    q: Optional[str] = "",
    context: RequestContext = Depends(get_request_context),
):
    result = memory_engine.team_memory_tool(
        org_slug=context.org_slug,
        action="recall",
        query=q,
    )
    return result

@router.post("/memories")
async def store_memory(
    req: StoreMemoryRequest,
    context: RequestContext = Depends(get_request_context),
):
    result = memory_engine.team_memory_tool(
        org_slug=context.org_slug,
        action="store",
        key=req.key,
        value=req.value,
        room=req.room,
        user_email=context.email,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
