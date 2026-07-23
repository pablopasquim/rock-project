import os
import logging
from typing import Dict, Any, List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth

logger = logging.getLogger(__name__)

# Security Bearer Scheme
security_scheme = HTTPBearer(auto_error=False)

PLACEHOLDER_DOMAINS = ["example.com", "example.org", "example.net"]
PLACEHOLDER_EMAILS = [
    "user1@example.com", "user2@example.com",
    "email1@example.com", "email2@example.com",
    "user@example.com", "admin@example.com",
]


def validate_auth_startup() -> None:
    """
    Validações estritas de segurança na inicialização da aplicação (Startup Guard).
    Garante que configurações de produção sejam válidas e que dev bypass não esteja ativo.
    """
    dev_bypass = os.getenv("AUTH_DEV_BYPASS", "false").lower() in ("true", "1", "yes")
    environment = os.getenv("ENVIRONMENT", "development").lower()

    if dev_bypass and environment == "production":
        raise RuntimeError("CRITICAL SECURITY ERROR: AUTH_DEV_BYPASS não é permitido em produção!")

    if environment == "production":
        allowed_emails = get_allowed_emails()
        if not allowed_emails:
            raise RuntimeError("CRITICAL SECURITY ERROR: ALLOWED_USER_EMAILS está vazia em produção.")

        for email in allowed_emails:
            domain = email.split("@")[-1] if "@" in email else ""
            if email in PLACEHOLDER_EMAILS or domain in PLACEHOLDER_DOMAINS:
                raise RuntimeError(f"CRITICAL SECURITY ERROR: ALLOWED_USER_EMAILS contém e-mail placeholder: {email}")

        project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("FIREBASE_PROJECT_ID")
        if not project_id or project_id.startswith("seu-projeto"):
            raise RuntimeError("CRITICAL SECURITY ERROR: GCP_PROJECT_ID ou FIREBASE_PROJECT_ID ausente ou inválido em produção.")


def validate_dev_bypass_startup() -> None:
    """Retrocompatibilidade com alias para validate_auth_startup."""
    validate_auth_startup()


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
        environment = os.getenv("ENVIRONMENT", "development").lower()
        try:
            if project_id:
                _firebase_app = firebase_admin.initialize_app(options={"projectId": project_id})
            else:
                _firebase_app = firebase_admin.initialize_app()
        except Exception as e:
            logger.error(f"Erro ao inicializar Firebase Admin SDK: {e}")
            if environment == "production":
                raise RuntimeError(f"Falha ao inicializar Firebase Admin SDK em produção: {e}") from e


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
    Dependência FastAPI para verificar autenticação e autorização por e-mail em modo FAIL CLOSED.
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

    # 4. Checagem de Lista de E-mails Permitidos (FAIL CLOSED)
    allowed_emails = get_allowed_emails()
    if not allowed_emails or email not in allowed_emails:
        logger.warning(f"Acesso negado para e-mail não autorizado (fail-closed): {email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado para este e-mail.",
        )

    return {
        "uid": uid,
        "email": email,
        "is_dev_bypass": False,
    }
