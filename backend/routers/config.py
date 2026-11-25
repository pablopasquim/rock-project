import os
from fastapi import APIRouter, Response
# pyrefly: ignore [missing-import]
from backend.services.auth_service import is_dev_bypass_active

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/firebase")
def get_firebase_config(response: Response):
    """
    Retorna exclusivamente as configurações públicas do Firebase Web SDK
    e o status seguro de dev bypass para o frontend (com no-cache).
    """
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY", ""),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": os.getenv("FIREBASE_PROJECT_ID", os.getenv("GCP_PROJECT_ID", "")),
        "appId": os.getenv("FIREBASE_APP_ID", ""),
        "devBypass": is_dev_bypass_active(),
        "aiEnabled": os.getenv("AI_ENABLED", "false").lower() == "true",
    }
