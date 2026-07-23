import os
import logging
from typing import List
from google import genai
from google.genai import types
from backend.models.schemas import ChatMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = """Você é um assistente financeiro pessoal inteligente e amigável chamado **Rock Advisor**.
Você tem acesso aos dados financeiros do usuário para o mês selecionado e deve ajudá-lo a entender suas finanças, 
identificar padrões de gastos, sugerir economias e responder perguntas sobre seu dinheiro.

Responda sempre em português brasileiro, de forma clara, objetiva e com um toque de empatia.
Use formatação markdown quando apropriado (negrito para valores, listas para sugestões).

=== DADOS FINANCEIROS DO MÊS SELECIONADO ===
{financial_context}
==========================================

Com base nesses dados, responda às perguntas do usuário de forma personalizada e útil.
Se o usuário perguntar algo não relacionado a finanças, gentilmente redirecione para 
tópicos financeiros ou ofereça ajuda com suas finanças pessoais."""


def _get_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY não configurada no ambiente.")
    return genai.Client(api_key=api_key)


def chat_with_context(
    user_message: str,
    history: List[ChatMessage],
    financial_context: str,
) -> str:
    """
    Envia mensagem para o Gemini 2.5 Flash usando a nova SDK google-genai.
    Envia o system_instruction contendo o contexto do Rock Advisor e o resumo financeiro.
    """
    client = _get_client()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(financial_context=financial_context)

    # Prepara o histórico no formato esperado pela SDK google-genai (types.Content)
    contents: List[types.Content] = []
    
    # Adiciona histórico limpo
    for msg in history[-10:]:  # Limita aos últimos 10 turnos
        role = "user" if msg.role == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg.content)]
            )
        )

    # Adiciona a mensagem atual do usuário
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)]
        )
    )

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.7,
        max_output_tokens=1024,
    )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=config,
    )

    if not response or not response.text:
        raise ValueError("Resposta vazia retornada pelo modelo Gemini.")

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
