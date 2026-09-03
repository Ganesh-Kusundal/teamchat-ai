"""
Firebase Admin SDK — lazy initialization module.

Behavior:
  - When FIREBASE_PROJECT_ID env var is set: initializes firebase_admin and exposes
    `verify_firebase_token(id_token)` for real Firebase Auth verification.
  - When FIREBASE_PROJECT_ID is not set: all functions are no-ops that return None,
    preserving the demo-token fallback mode for local evaluation.

On Cloud Run the SDK authenticates automatically via workload identity (no service
account key file needed).
"""
from typing import Optional
from ..config import settings

_firebase_initialized = False

def _ensure_initialized() -> bool:
    global _firebase_initialized
    if _firebase_initialized:
        return True
    if not settings.FIREBASE_PROJECT_ID:
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials
        if not firebase_admin._apps:
            # On Cloud Run: uses Application Default Credentials automatically.
            # Locally: set GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON.
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})
        _firebase_initialized = True
        print(f"[Firebase] Admin SDK initialized — project={settings.FIREBASE_PROJECT_ID}")
        return True
    except ImportError:
        print("[Firebase] firebase-admin not installed. Falling back to demo-token mode.")
        return False
    except Exception as e:
        print(f"[Firebase] Admin SDK initialization failed: {e}. Falling back to demo-token mode.")
        return False


def verify_firebase_token(id_token: str) -> Optional[dict]:
    """
    Verify a Firebase ID token and return the decoded claims dict.
    Returns None if Firebase Admin is not configured or verification fails.
    """
    if not _ensure_initialized():
        return None
    try:
        from firebase_admin import auth as fb_auth
        decoded = fb_auth.verify_id_token(id_token)
        return decoded
    except Exception as e:
        print(f"[Firebase] Token verification failed: {e}")
        return None
