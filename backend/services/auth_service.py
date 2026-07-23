import os
import logging
from typing import Dict, Any, List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth, credentials

logger = logging.getLogger(__name__)

# Security Bearer Scheme
security_scheme = HTTPBearer(auto_error=False)


def validate_dev_bypass_startup() -> None:
    """
    Garante que AUTH_DEV_BYPASS nunca esteja ativo em ambiente de produção.
    Lança RuntimeError se houver violação de segurança.
    """
    dev_bypass = os.getenv("AUTH_DEV_BYPASS", "false").lower() in ("true", "1", "yes")
    environment = os.getenv("ENVIRONMENT", "development").lower()
    
    if dev_bypass and environment == "production":
        raise RuntimeError("CRITICAL SECURITY ERROR: AUTH_DEV_BYPASS não é permitido em produção!")


def get_allowed_emails() -> List[str]:
    """Retorna a lista de e-mails autorizados normalizados."""
    raw = os.getenv("ALLOWED_USER_EMAILS", "")
    if not raw:
        return []
    return [email.strip().lower() for email in raw.split(",") if email.strip()]


def is_dev_bypass_active() -> bool:
    """Verifica se o modo dev bypass está ativado de forma segura (somente em desenvolvimento)."""
    dev_bypass = os.getenv("AUTH_DEV_BYPASS", "false").lower() in ("true", "1", "yes")
    environment = os.getenv("ENVIRONMENT", "development").lower()
    return dev_bypass and environment == "development"


# Inicialização segura do Firebase Admin
_firebase_app = None

def _init_firebase_admin():
    global _firebase_app
    if not firebase_admin._apps:
        project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("FIREBASE_PROJECT_ID")
        try:
            if project_id:
                _firebase_app = firebase_admin.initialize_app(options={"projectId": project_id})
            else:
                _firebase_app = firebase_admin.initialize_app()
        except Exception as e:
            logger.warning(f"Erro ao inicializar Firebase Admin SDK: {e}")


def verify_firebase_token(token_str: str) -> Dict[str, Any]:
    """Verifica o ID Token do Firebase usando a SDK Admin."""
    _init_firebase_admin()
    try:
        decoded = auth.verify_id_token(token_str)
        return decoded
    except Exception as e:
        logger.debug(f"Falha ao verificar Firebase ID token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    auth_credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Dict[str, Any]:
    """
    Dependência FastAPI para verificar autenticação e autorização por e-mail.
    """
    # 1. Checa modo Dev Bypass (somente em desenvolvimento)
    if is_dev_bypass_active():
        allowed = get_allowed_emails()
        dev_email = allowed[0] if allowed else "dev@rockfinance.local"
        return {
            "uid": "dev-bypass-uid",
            "email": dev_email,
            "is_dev_bypass": True,
        }

    # 2. Exige Bearer Token
    if not auth_credentials or not auth_credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária. Token ausente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Valida Token Firebase
    token_str = auth_credentials.credentials
    decoded_token = verify_firebase_token(token_str)

    email = (decoded_token.get("email") or "").strip().lower()
    uid = decoded_token.get("uid") or ""

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token não contém um e-mail válido.",
        )

    # 4. Checagem de Lista de E-mails Permitidos (ALLOWED_USER_EMAILS)
    allowed_emails = get_allowed_emails()
    if allowed_emails and email not in allowed_emails:
        logger.warning(f"Acesso negado para e-mail não autorizado: {email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado para este e-mail.",
        )

    return {
        "uid": uid,
        "email": email,
        "is_dev_bypass": False,
    }
