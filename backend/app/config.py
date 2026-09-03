import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "TeamChat AI"
    VERSION: str = "teamchat-seed-2026.1"
    PORT: int = int(os.getenv("PORT", "8000"))
    DEFAULT_BASE_RATE: float = 12000.0

    # --- Gemini / Vertex AI ---
    # API key mode (local dev): set GEMINI_API_KEY
    # Vertex AI mode (Cloud Run): set GOOGLE_CLOUD_PROJECT (no API key needed — uses workload identity)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GOOGLE_CLOUD_PROJECT: str = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    GOOGLE_CLOUD_LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

    # --- Firebase Auth (optional) ---
    # When set, the backend verifies Firebase ID tokens instead of demo tokens.
    # Leave empty to use the built-in demo-token mode for local evaluation.
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "")

    # --- Application URL ---
    APP_URL: str = os.getenv("APP_URL", "http://localhost:8000")

    # --- Data paths ---
    ROOT_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = (
        (Path(__file__).resolve().parent.parent.parent / "data")
        if (Path(__file__).resolve().parent.parent.parent / "data").exists()
        else Path(__file__).resolve().parent.parent.parent
    )

settings = Settings()
