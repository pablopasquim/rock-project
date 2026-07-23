import time
import logging
import threading
from typing import Dict, List
from fastapi import APIRouter, HTTPException, Depends, status, Response
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
        # Remove requisições expiradas
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
    user_id = current_user.get("uid", "anonymous")
    check_rate_limit(user_id)

    try:
        # Busca o contexto financeiro usando o month_key enviado pelo frontend
        financial_context = fs.get_financial_context(request.month_key)

        # Filtra o histórico recebido (aceitando somente roles válidos 'user' e 'assistant')
        history_clean = [
            msg for msg in (request.history or [])
            if msg.role in ("user", "assistant")
        ][-10:]

        response_text = gemini.chat_with_context(
            user_message=request.message,
            history=history_clean,
            financial_context=financial_context,
        )

        # Monta o histórico atualizado para devolver à sessão do cliente (sem salvar no Firestore)
        updated_history = list(request.history or [])
        updated_history.append(ChatMessage(role="user", content=request.message))
        updated_history.append(ChatMessage(role="assistant", content=response_text))

        return ChatResponse(response=response_text, history=updated_history)

    except ValueError as e:
        logger.warning(f"Erro de validação ou configuração no chat: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de IA indisponível ou não configurado.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro interno no processamento do chat: {e}", exc_info=True)
        # Não vaza detalhes de exceção interna para o cliente
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar sua mensagem. Tente novamente mais tarde.",
        )


@router.get("/suggestions")
def get_suggestions():
    """Retorna sugestões de perguntas rápidas para o chat."""
    return {"suggestions": gemini.get_quick_suggestions()}
