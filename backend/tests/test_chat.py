"""
Testes para /api/chat e /api/health
Cobre: envio de mensagem com month_key, histórico, sugestões, rate limiting e health check.
"""
import pytest
from backend.routers.chat import reset_rate_limiter, check_rate_limit, RATE_LIMIT_REQUESTS
from fastapi import HTTPException


class TestHealthCheck:
    def test_health_returns_ok(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


class TestChat:
    def test_send_message(self, client):
        payload = {"message": "Como estão meus gastos?", "month_key": "2026-07"}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "response" in data
        assert "history" in data
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0

    def test_response_contains_assistant_message(self, client):
        payload = {"message": "Qual meu saldo?", "month_key": "2026-07"}
        resp = client.post("/api/chat", json=payload)
        data = resp.json()
        assert len(data["history"]) == 2
        assert data["history"][0]["role"] == "user"
        assert data["history"][1]["role"] == "assistant"

    def test_history_is_preserved(self, client):
        """Mensagens anteriores devem ser passadas corretamente."""
        history = [
            {"role": "user", "content": "Olá"},
            {"role": "assistant", "content": "Olá! Como posso ajudar?"},
        ]
        payload = {"message": "Qual meu saldo?", "month_key": "2026-07", "history": history}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["history"]) == 4

    def test_invalid_month_key_rejected(self, client):
        """month_key inválido (mês 13 ou string malformada) deve retornar 422."""
        payload_13 = {"message": "Teste", "month_key": "2026-13"}
        resp1 = client.post("/api/chat", json=payload_13)
        assert resp1.status_code == 422

        payload_str = {"message": "Teste", "month_key": "invalido"}
        resp2 = client.post("/api/chat", json=payload_str)
        assert resp2.status_code == 422

    def test_missing_month_key_rejected(self, client):
        payload = {"message": "Sem mes"}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 422

    def test_empty_message_rejected(self, client):
        resp = client.post("/api/chat", json={"message": "", "month_key": "2026-07"})
        assert resp.status_code == 422

    def test_too_long_message_rejected(self, client):
        resp = client.post("/api/chat", json={"message": "x" * 2001, "month_key": "2026-07"})
        assert resp.status_code == 422

    def test_gemini_called_with_financial_context(self, client):
        payload = {"message": "Resumo financeiro", "month_key": "2026-07"}
        client.post("/api/chat", json=payload)
        client._mock_fs.get_financial_context.assert_called_with("2026-07")
        call_kwargs = client._mock_gemini.chat_with_context.call_args
        assert call_kwargs is not None

    def test_chat_rate_limit(self, client):
        """Ao ultrapassar o limite de mensagens por minuto, deve retornar HTTP 429 com Retry-After."""
        reset_rate_limiter()
        payload = {"message": "Ping", "month_key": "2026-07"}

        for _ in range(RATE_LIMIT_REQUESTS):
            res = client.post("/api/chat", json=payload)
            assert res.status_code == 200

        # A 16ª requisição deve exceder o limite
        res_overflow = client.post("/api/chat", json=payload)
        assert res_overflow.status_code == 429
        assert "Retry-After" in res_overflow.headers

    def test_gemini_error_returns_503(self, client):
        client._mock_gemini.chat_with_context.side_effect = ValueError("GEMINI_API_KEY não configurada")
        payload = {"message": "Teste", "month_key": "2026-07"}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 503

    def test_gemini_unexpected_error_returns_500(self, client):
        client._mock_gemini.chat_with_context.side_effect = RuntimeError("Erro inesperado")
        payload = {"message": "Teste", "month_key": "2026-07"}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 500


class TestChatSuggestions:
    def test_suggestions_returns_list(self, client):
        resp = client.get("/api/chat/suggestions")
        assert resp.status_code == 200
        data = resp.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)

    def test_suggestions_not_empty(self, client):
        resp = client.get("/api/chat/suggestions")
        data = resp.json()
        assert len(data["suggestions"]) > 0
