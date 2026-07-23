"""
Testes de Autenticação, Autorização, CSP e Startup Guards
"""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.auth_service import validate_auth_startup, get_current_user, verify_firebase_token


VALID_PROD_ENV = {
    "ENVIRONMENT": "production",
    "AUTH_DEV_BYPASS": "false",
    "GCP_PROJECT_ID": "my-real-project-id",
    "FIREBASE_PROJECT_ID": "my-real-project-id",
    "FIREBASE_API_KEY": "real-api-key-123456",
    "FIREBASE_AUTH_DOMAIN": "my-real-project-id.firebaseapp.com",
    "FIREBASE_APP_ID": "1:999999:web:999999",
    "FIRESTORE_DATABASE": "(default)",
    "HOUSEHOLD_ID": "rock-family-real",
    "APP_ORIGINS": "https://real-app.a.run.app",
    "ALLOWED_USER_EMAILS": "user1@realdomain.com,user2@realdomain.com",
}


class TestAuthEndpointsAndCSP:
    def test_csp_header_present_and_clean(self, client):
        """Verifica se o header Content-Security-Policy está presente e não contém typos."""
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert "Content-Security-Policy" in resp.headers
        csp = resp.headers["Content-Security-Policy"]
        assert "firebase Financial" not in csp
        assert "'unsafe-inline'" not in csp.split("script-src")[1].split(";")[0]

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
        """Requisição para rota protegida sem token deve retornar 401."""
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
             patch("backend.services.auth_service.get_allowed_emails", return_value=["allowed@real.com"]):
            
            with TestClient(app) as auth_client:
                headers = {"Authorization": "Bearer valid-token"}
                resp = auth_client.get("/api/transactions", headers=headers)
                assert resp.status_code == 403

    def test_authorized_email_succeeds(self):
        """Token de e-mail autorizado deve permitir o acesso."""
        app.dependency_overrides.clear()
        mock_decoded = {"uid": "authorized-uid", "email": "allowed@real.com"}
        with patch("backend.services.auth_service.is_dev_bypass_active", return_value=False), \
             patch("backend.services.auth_service.verify_firebase_token", return_value=mock_decoded), \
             patch("backend.services.auth_service.get_allowed_emails", return_value=["allowed@real.com"]), \
             patch("backend.routers.transactions.fs.get_transactions", return_value=[]):
            
            with TestClient(app) as auth_client:
                headers = {"Authorization": "Bearer valid-token"}
                resp = auth_client.get("/api/transactions", headers=headers)
                assert resp.status_code == 200


class TestStartupGuards:
    def test_dev_bypass_in_production_raises_runtime_error(self):
        """AUTH_DEV_BYPASS=true em produção lança erro no startup."""
        env = {**VALID_PROD_ENV, "AUTH_DEV_BYPASS": "true"}
        with patch.dict(os.environ, env):
            with pytest.raises(RuntimeError) as exc_info:
                validate_auth_startup()
            assert "AUTH_DEV_BYPASS não é permitido em produção" in str(exc_info.value)

    def test_empty_allowlist_in_production_raises_runtime_error(self):
        """ALLOWED_USER_EMAILS vazia em produção lança erro no startup."""
        env = {**VALID_PROD_ENV, "ALLOWED_USER_EMAILS": ""}
        with patch.dict(os.environ, env):
            with pytest.raises(RuntimeError) as exc_info:
                validate_auth_startup()
            assert "ALLOWED_USER_EMAILS" in str(exc_info.value)

    def test_placeholder_email_in_production_raises_runtime_error(self):
        """ALLOWED_USER_EMAILS contendo exemplo/placeholder em produção lança erro no startup."""
        env = {**VALID_PROD_ENV, "ALLOWED_USER_EMAILS": "user1@example.com"}
        with patch.dict(os.environ, env):
            with pytest.raises(RuntimeError) as exc_info:
                validate_auth_startup()
            assert "ALLOWED_USER_EMAILS" in str(exc_info.value)

    def test_missing_firebase_project_id_in_production_raises_runtime_error(self):
        """GCP_PROJECT_ID / FIREBASE_PROJECT_ID ausente ou placeholder em produção lança erro no startup."""
        env = {**VALID_PROD_ENV, "GCP_PROJECT_ID": "seu-projeto-gcp", "FIREBASE_PROJECT_ID": "seu-projeto-gcp"}
        with patch.dict(os.environ, env):
            with pytest.raises(RuntimeError) as exc_info:
                validate_auth_startup()
            assert "GCP_PROJECT_ID" in str(exc_info.value) or "FIREBASE_PROJECT_ID" in str(exc_info.value)
