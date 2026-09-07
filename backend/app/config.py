import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "TeamChat AI"
    VERSION: str = "teamchat-seed-2026.1"
    PORT: int = int(os.getenv("PORT", "8000"))

    # --- Gemini / Vertex AI ---
    # API key mode (local dev): set GEMINI_API_KEY
    # Vertex AI mode (Cloud Run): set GOOGLE_CLOUD_PROJECT (no API key needed — uses workload identity)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GOOGLE_CLOUD_PROJECT: str = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    GOOGLE_CLOUD_LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

    # --- Firebase Auth / persistence ---
    # Production enables Firebase ID-token verification and Firestore-backed state.
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "")
    FIREBASE_WEB_API_KEY: str = os.getenv("FIREBASE_WEB_API_KEY", "")
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "memory").strip().lower()
    FIRESTORE_DATABASE: str = os.getenv("FIRESTORE_DATABASE", "(default)")
    # HOSTNAME is unique per Cloud Run container; K_REVISION is shared by all instances.
    INSTANCE_ID: str = os.getenv("INSTANCE_ID", os.getenv("HOSTNAME", os.getenv("K_REVISION", "local")))

    # --- Application URL ---
    APP_URL: str = os.getenv("APP_URL", "http://localhost:8000")
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8000")

    # --- Data paths ---
    ROOT_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = (
        (Path(__file__).resolve().parent.parent.parent / "data")
        if (Path(__file__).resolve().parent.parent.parent / "data").exists()
        else Path(__file__).resolve().parent.parent.parent
    )

settings = Settings()
