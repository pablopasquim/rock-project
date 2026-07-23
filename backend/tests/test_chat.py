"""
Testes para /api/chat e /api/health
Cobre: envio de mensagem, histórico, sugestões e health check.
"""
import pytest


class TestHealthCheck:
    def test_health_returns_ok(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_health_has_version(self, client):
        resp = client.get("/api/health")
        data = resp.json()
        assert "version" in data

    def test_health_has_environment(self, client):
        resp = client.get("/api/health")
        data = resp.json()
        assert "environment" in data


class TestChat:
    def test_send_message(self, client):
        payload = {"message": "Como estão meus gastos?"}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "response" in data
        assert "history" in data
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0

    def test_response_contains_assistant_message(self, client):
        payload = {"message": "Qual meu saldo?"}
        resp = client.post("/api/chat", json=payload)
        data = resp.json()
        # Histórico deve ter mensagem do user e do assistant
        assert len(data["history"]) == 2
        assert data["history"][0]["role"] == "user"
        assert data["history"][1]["role"] == "assistant"

    def test_history_is_preserved(self, client):
        """Mensagens anteriores devem ser passadas corretamente."""
        history = [
            {"role": "user", "content": "Olá"},
            {"role": "assistant", "content": "Olá! Como posso ajudar?"},
        ]
        payload = {"message": "Qual meu saldo?", "history": history}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        # Histórico deve conter os anteriores + 2 novos
        assert len(data["history"]) == 4

    def test_user_message_in_history(self, client):
        payload = {"message": "Teste de mensagem"}
        resp = client.post("/api/chat", json=payload)
        data = resp.json()
        user_msgs = [m for m in data["history"] if m["role"] == "user"]
        assert user_msgs[-1]["content"] == "Teste de mensagem"

    def test_empty_message_rejected(self, client):
        resp = client.post("/api/chat", json={"message": ""})
        assert resp.status_code == 422

    def test_too_long_message_rejected(self, client):
        resp = client.post("/api/chat", json={"message": "x" * 2001})
        assert resp.status_code == 422

    def test_missing_message_rejected(self, client):
        resp = client.post("/api/chat", json={})
        assert resp.status_code == 422

    def test_gemini_called_with_financial_context(self, client):
        """Verifica que o contexto financeiro é passado para o Gemini."""
        payload = {"message": "Resumo financeiro"}
        client.post("/api/chat", json=payload)
        # Confirma que get_financial_context foi chamado
        client._mock_fs.get_financial_context.assert_called_once()
        # Confirma que chat_with_context foi chamado com o contexto
        call_kwargs = client._mock_gemini.chat_with_context.call_args
        assert call_kwargs is not None
        assert "financial_context" in call_kwargs.kwargs or len(call_kwargs.args) >= 3

    def test_chat_without_history(self, client):
        """Chat sem histórico deve funcionar normalmente."""
        payload = {"message": "Primeira mensagem"}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 200

    def test_response_is_string(self, client):
        payload = {"message": "Teste"}
        resp = client.post("/api/chat", json=payload)
        data = resp.json()
        assert isinstance(data["response"], str)

    def test_gemini_error_returns_503(self, client):
        """Se GEMINI_API_KEY não configurada, deve retornar 503."""
        client._mock_gemini.chat_with_context.side_effect = ValueError("GEMINI_API_KEY não configurada")
        payload = {"message": "Teste"}
        resp = client.post("/api/chat", json=payload)
        assert resp.status_code == 503

    def test_gemini_unexpected_error_returns_500(self, client):
        """Erros inesperados devem retornar 500."""
        client._mock_gemini.chat_with_context.side_effect = RuntimeError("Erro inesperado")
        payload = {"message": "Teste"}
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

    def test_suggestions_are_strings(self, client):
        resp = client.get("/api/chat/suggestions")
        data = resp.json()
        for suggestion in data["suggestions"]:
            assert isinstance(suggestion, str)
            assert len(suggestion) > 0
