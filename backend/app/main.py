import os
import time
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from .config import settings
from .api import (
    auth_router,
    rooms_router,
    messages_router,
    realtime_router,
    tools_router,
    admin_router,
)

app = FastAPI(
    title="TeamChat AI Backend",
    description="Multi-Tenant Collaborative AI Platform with Real-Time Presence, CMS-HCC V28 Clinical Intelligence, and Gemini Integration.",
    version=settings.VERSION,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# Health Check Endpoint
# -------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    has_key = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "MY_GEMINI_API_KEY")
    return {
        "status": "ok",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "geminiConfigured": has_key,
        "dataset_version": settings.VERSION,
    }

# -------------------------------------------------------------
# Include API Routers under /api
# -------------------------------------------------------------
app.include_router(auth_router, prefix="/api")
app.include_router(rooms_router, prefix="/api")
app.include_router(messages_router, prefix="/api")
app.include_router(realtime_router, prefix="/api")
app.include_router(tools_router, prefix="/api")
app.include_router(admin_router, prefix="/api")

# -------------------------------------------------------------
# Static Frontend Serving for Production / Docker Deployment
# -------------------------------------------------------------
dist_path = settings.ROOT_DIR / "dist"

if dist_path.exists():
    assets_path = dist_path / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(request: Request, full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": "API route not found"})
        file_target = dist_path / full_path
        if file_target.exists() and file_target.is_file():
            return FileResponse(file_target)
        return FileResponse(dist_path / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
