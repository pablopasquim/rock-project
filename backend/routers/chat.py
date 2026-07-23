from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from backend.models.schemas import ChatRequest, ChatResponse, ChatMessage
import backend.services.firestore_service as fs
import backend.services.gemini_service as gemini

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest):
    """Envia mensagem para o assistente de IA com contexto financeiro."""
    try:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
        financial_context = fs.get_financial_context(month_key)

        # Limita o histórico às últimas 5 interações para economizar tokens
        history_limit = (request.history or [])[-5:]
        
        response_text = gemini.chat_with_context(
            user_message=request.message,
            history=history_limit,
            financial_context=financial_context,
        )

        # Monta histórico atualizado
        updated_history = list(request.history or [])
        updated_history.append(ChatMessage(role="user", content=request.message))
        updated_history.append(ChatMessage(role="assistant", content=response_text))

        # Persiste no Firestore (opcional, não-bloqueante)
        try:
            fs.save_chat_message("user", request.message)
            fs.save_chat_message("assistant", response_text)
        except Exception:
            pass  # Falha silenciosa — não bloqueia a resposta

        return ChatResponse(response=response_text, history=updated_history)

    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar chat: {str(e)}")


@router.get("/suggestions")
def get_suggestions():
    """Retorna sugestões de perguntas rápidas para o chat."""
    return {"suggestions": gemini.get_quick_suggestions()}
