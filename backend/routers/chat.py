import os
from datetime import datetime
from zoneinfo import ZoneInfo
import time
import logging
import threading
from typing import Dict, List
from fastapi import APIRouter, HTTPException, Depends, status
from backend.models.schemas import ChatRequest, ChatResponse, ChatMessage
from backend.services.auth_service import get_current_user
import backend.services.firestore_service as fs
import backend.services.gemini_service as gemini

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chat",
    tags=["chat"],
    dependencies=[Depends(get_current_user)],
)

# ─── Rate Limiter Thread-Safe em Memória ──────────────────────────────────────
# Limite: 15 requisições por minuto por UID de usuário.
RATE_LIMIT_REQUESTS = 15
RATE_LIMIT_WINDOW = 60.0  # segundos

_rate_limit_store: Dict[str, List[float]] = {}
_rate_limit_lock = threading.Lock()


def check_rate_limit(user_id: str) -> None:
    """
    Thread-safe rate limiter indexado pelo UID do usuário.
    Documentação: Funciona perfeitamente no MVP com Cloud Run max-instances=1.
    """
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW

    with _rate_limit_lock:
        timestamps = _rate_limit_store.get(user_id, [])
        timestamps = [ts for ts in timestamps if ts > cutoff]

        if len(timestamps) >= RATE_LIMIT_REQUESTS:
            _rate_limit_store[user_id] = timestamps
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Limite de mensagens excedido. Tente novamente em 1 minuto.",
                headers={"Retry-After": "60"},
            )

        timestamps.append(now)
        _rate_limit_store[user_id] = timestamps


def reset_rate_limiter() -> None:
    """Auxiliar para limpar o estado do rate limiter nos testes unitários."""
    with _rate_limit_lock:
        _rate_limit_store.clear()


@router.post("", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """Envia mensagem para o Rock Advisor utilizando o mês selecionado."""
    if os.getenv("AI_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "IA desativada para evitar consumo. Seus dados financeiros continuam disponiveis.")
    user_id = current_user.get("uid", "anonymous")
    check_rate_limit(user_id)

    try:
        fs.reserve_ai_request(datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat(),
                              int(os.getenv("AI_DAILY_LIMIT", "20")))
        # Busca o contexto financeiro usando o month_key enviado pelo frontend
        financial_context = fs.get_financial_context(request.month_key)

        # Client history is untrusted conversation data, never authorization or facts.
        raw_history = request.history or []
        user_history_clean = raw_history[-6:]

        response_text = gemini.chat_with_context(
            user_message=request.message,
            history=[ChatMessage(role=m.role, content=m.content[:2000]) for m in user_history_clean],
            financial_context=financial_context,
        )

        # Recontrói o histórico confiável sem mensagens assistant fabricadas pelo navegador
        updated_history: List[ChatMessage] = []
        for m in user_history_clean:
            updated_history.append(ChatMessage(role=m.role, content=m.content))

        updated_history.append(ChatMessage(role="user", content=request.message))
        updated_history.append(ChatMessage(role="assistant", content=response_text))
        updated_history = updated_history[-10:]

        return ChatResponse(response=response_text, history=updated_history)

    except ValueError:
        logger.warning("ai_configuration_or_response_invalid")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de IA indisponível ou não configurado.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("ai_request_failed", extra={"error_type": type(e).__name__})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar sua mensagem. Tente novamente mais tarde.",
        )


@router.get("/suggestions")
def get_suggestions():
    """Retorna sugestões de perguntas rápidas para o chat."""
    return {"enabled": os.getenv("AI_ENABLED", "false").lower() == "true",
            "suggestions": gemini.get_quick_suggestions()}
