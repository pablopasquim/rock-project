import os
from typing import List
# pyrefly: ignore [missing-import]
import google.generativeai as genai
from backend.models.schemas import ChatMessage


SYSTEM_PROMPT_TEMPLATE = """Você é um assistente financeiro pessoal inteligente e amigável chamado **FinBot**.
Você tem acesso aos dados financeiros do usuário e deve ajudá-lo a entender suas finanças, 
identificar padrões de gastos, sugerir economias e responder perguntas sobre seu dinheiro.

Responda sempre em português brasileiro, de forma clara, objetiva e com um toque de empatia.
Use formatação markdown quando apropriado (negrito para valores, listas para sugestões).

=== DADOS FINANCEIROS ATUAIS DO USUÁRIO ===
{financial_context}
==========================================

Com base nesses dados, responda às perguntas do usuário de forma personalizada e útil.
Se o usuário perguntar algo não relacionado a finanças, gentilmente redirecione para 
tópicos financeiros ou ofereça ajuda com suas finanças pessoais."""


def _get_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY não configurada")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.5-flash")


def chat_with_context(
    user_message: str,
    history: List[ChatMessage],
    financial_context: str,
) -> str:
    """
    Envia mensagem para o Gemini com contexto financeiro no system prompt.
    Mantém histórico de conversa para continuidade.
    """
    model = _get_model()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(financial_context=financial_context)

    # Converte histórico para formato Gemini
    gemini_history = []
    for msg in history:
        role = "user" if msg.role == "user" else "model"
        gemini_history.append({
            "role": role,
            "parts": [msg.content],
        })

    # Inicia chat com histórico
    chat = model.start_chat(history=gemini_history)

    # Prepend system context no primeiro turno ou sempre
    full_message = f"{system_prompt}\n\n---\nMensagem do usuário: {user_message}"
    if gemini_history:
        # Se já há histórico, só manda a mensagem pura
        full_message = user_message

    response = chat.send_message(
        full_message if not gemini_history else user_message,
        generation_config=genai.GenerationConfig(
            temperature=0.7,
            max_output_tokens=1024,
        ),
    )

    return response.text


def get_quick_suggestions() -> List[str]:
    """Sugestões de perguntas rápidas para o chat."""
    return [
        "Como estão meus gastos este mês?",
        "Em qual categoria gasto mais?",
        "Como posso economizar mais?",
        "Compare meus gastos com o mês passado",
        "Qual foi meu maior gasto este mês?",
        "Estou dentro do orçamento?",
    ]
