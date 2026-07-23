"""
Testes de Autenticação, Autorização e Dev Bypass
Cobre:
- Rotas protegidas sem token (401)
- Token inválido (401)
- E-mail não autorizado (403)
- Usuário autorizado (200)
- Guard de Dev Bypass em Produção (startup exception)
- Configuração pública do Firebase
"""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.auth_service import validate_dev_bypass_startup, get_current_user, verify_firebase_token


class TestAuthEndpoints:
    def test_public_firebase_config_endpoint(self, client):
        """Endpoint /api/config/firebase deve ser público."""
        resp = client.get("/api/config/firebase")
        assert resp.status_code == 200
        data = resp.json()
        assert "apiKey" in data
        assert "authDomain" in data
        assert "projectId" in data
        assert "appId" in data
        assert "devBypass" in data

    def test_protected_route_without_token_returns_401(self):
        """Requisição para rota protegida sem token e sem override deve retornar 401."""
        # Limpa overrides para testar o comportamento real do middleware/dependency
        app.dependency_overrides.clear()
        with patch("backend.services.auth_service.is_dev_bypass_active", return_value=False):
            with TestClient(app) as unauth_client:
                resp = unauth_client.get("/api/transactions")
                assert resp.status_code == 401

    def test_unauthorized_email_returns_403(self):
        """Token válido de e-mail fora de ALLOWED_USER_EMAILS deve retornar 403."""
        app.dependency_overrides.clear()
        
        mock_decoded = {"uid": "attacker-uid", "email": "hacker@evil.com"}
        with patch("backend.services.auth_service.is_dev_bypass_active", return_value=False), \
             patch("backend.services.auth_service.verify_firebase_token", return_value=mock_decoded), \
             patch("os.getenv", side_effect=lambda k, d="": "user1@example.com,user2@example.com" if k == "ALLOWED_USER_EMAILS" else d):
            
            with TestClient(app) as auth_client:
                headers = {"Authorization": "Bearer valid-token-unauthorized-email"}
                resp = auth_client.get("/api/transactions", headers=headers)
                assert resp.status_code == 403

    def test_authorized_email_succeeds(self):
        """Token de e-mail listado em ALLOWED_USER_EMAILS deve permitir o acesso."""
        app.dependency_overrides.clear()
        
        mock_decoded = {"uid": "authorized-uid", "email": "user1@example.com"}
        with patch("backend.services.auth_service.is_dev_bypass_active", return_value=False), \
             patch("backend.services.auth_service.verify_firebase_token", return_value=mock_decoded), \
             patch("backend.services.auth_service.get_allowed_emails", return_value=["user1@example.com"]), \
             patch("backend.routers.transactions.fs.get_transactions", return_value=[]):
            
            with TestClient(app) as auth_client:
                headers = {"Authorization": "Bearer valid-token"}
                resp = auth_client.get("/api/transactions", headers=headers)
                assert resp.status_code == 200

    def test_dev_bypass_in_production_raises_runtime_error(self):
        """AUTH_DEV_BYPASS=true com ENVIRONMENT=production DEVE lançar exceção no startup."""
        with patch.dict(os.environ, {"AUTH_DEV_BYPASS": "true", "ENVIRONMENT": "production"}):
            with pytest.raises(RuntimeError) as exc_info:
                validate_dev_bypass_startup()
            assert "AUTH_DEV_BYPASS não é permitido em produção" in str(exc_info.value)
