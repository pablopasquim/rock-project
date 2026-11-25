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


def _is_placeholder(value: str) -> bool:
    if not value:
        return True
    val = value.strip().lower()
    placeholders = [
        "seu-projeto", "seu-dominio", "placeholder", "aizasy...",
        "1:1234567890:web:abcdef", "domínio-do-cloud-run", "example.com"
    ]
    return any(p in val for p in placeholders)


def validate_auth_startup() -> None:
    """
    Validações estritas de segurança na inicialização da aplicação (Startup Guard).
    Garante que TODAS as configurações obrigatórias em produção estejam presentes e não sejam placeholders.
    """
    dev_bypass = os.getenv("AUTH_DEV_BYPASS", "false").lower() in ("true", "1", "yes")
    environment = os.getenv("ENVIRONMENT", "development").lower()

    if dev_bypass and (environment == "production" or os.getenv("K_SERVICE")):
        raise RuntimeError("CRITICAL SECURITY ERROR: AUTH_DEV_BYPASS não é permitido em produção!")

    if environment == "production" or os.getenv("K_SERVICE"):
        uids = get_allowed_uids()
        if not 1 <= len(uids) <= 2:
            raise RuntimeError("Configure ALLOWED_USER_UIDS com um ou dois UIDs.")
        allowed_emails = get_allowed_emails()
        if not allowed_emails:
            raise RuntimeError("CRITICAL SECURITY ERROR: ALLOWED_USER_EMAILS está vazia em produção.")

        for email in allowed_emails:
            domain = email.split("@")[-1] if "@" in email else ""
            if email in PLACEHOLDER_EMAILS or domain in PLACEHOLDER_DOMAINS:
                raise RuntimeError(f"CRITICAL SECURITY ERROR: ALLOWED_USER_EMAILS contém e-mail placeholder: {email}")

        required_vars = [
            ("GCP_PROJECT_ID", os.getenv("GCP_PROJECT_ID")),
            ("FIREBASE_PROJECT_ID", os.getenv("FIREBASE_PROJECT_ID")),
            ("FIREBASE_API_KEY", os.getenv("FIREBASE_API_KEY")),
            ("FIREBASE_AUTH_DOMAIN", os.getenv("FIREBASE_AUTH_DOMAIN")),
            ("FIREBASE_APP_ID", os.getenv("FIREBASE_APP_ID")),
            ("FIRESTORE_DATABASE", os.getenv("FIRESTORE_DATABASE")),
            ("HOUSEHOLD_ID", os.getenv("HOUSEHOLD_ID")),
            ("APP_ORIGINS", os.getenv("APP_ORIGINS")),
        ]

        for name, val in required_vars:
            if not val or _is_placeholder(val):
                raise RuntimeError(f"CRITICAL SECURITY ERROR: Configuração de produção '{name}' está ausente ou contém valor placeholder inválido.")


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
    return dev_bypass and environment == "development" and not os.getenv("K_SERVICE")


# Inicialização segura do Firebase Admin
_firebase_app = None

def _init_firebase_admin():
    global _firebase_app
    if not firebase_admin._apps:
        project_id = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GCP_PROJECT_ID")
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
        decoded = auth.verify_id_token(token_str, check_revoked=True)
        return decoded
    except auth.CertificateFetchError as e:
        logger.error("Falha de rede ao buscar certificados públicos do Firebase: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de autenticação temporariamente indisponível.",
            headers={"Retry-After": "5"},
        ) from e
    except Exception:
        logger.debug("firebase_token_rejected")
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

    # Authorize immutable UIDs, not unverified email claims.
    if not uid or uid not in get_allowed_uids():
        logger.warning("auth_access_denied")
        raise HTTPException(status_code=403, detail="Conta nao autorizada.")

    return {
        "uid": uid,
        "email": email,
        "is_dev_bypass": False,
    }


def get_allowed_uids() -> List[str]:
    return list(dict.fromkeys(uid.strip() for uid in os.getenv("ALLOWED_USER_UIDS", "").split(",") if uid.strip()))
