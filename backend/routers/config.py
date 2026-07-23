import os
from fastapi import APIRouter
from backend.services.auth_service import is_dev_bypass_active

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/firebase")
def get_firebase_config():
    """
    Retorna exclusivamente as configurações públicas do Firebase Web SDK
    e o status seguro de dev bypass para o frontend.
    """
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY", ""),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": os.getenv("FIREBASE_PROJECT_ID", os.getenv("GCP_PROJECT_ID", "")),
        "appId": os.getenv("FIREBASE_APP_ID", ""),
        "devBypass": is_dev_bypass_active(),
    }
