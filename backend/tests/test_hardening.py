from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.services import auth_service


PAYLOAD = dict(type="expense", amount=1, category="outros", description="Teste", date="2026-09-16")


@pytest.mark.parametrize("path", ["/%2e%2e/backend/requirements.txt", "/api/does-not-exist", "/missing.js"])
def test_no_arbitrary_file_or_api_fallback(client, path):
    assert client.get(path).status_code == 404


def test_financial_responses_not_cached(client):
    assert "no-store" in client.get('/api/transactions').headers.get('cache-control', '')


@pytest.mark.parametrize('amount', ['Infinity', 'NaN', 0.001, 1000000001])
def test_invalid_money_rejected(client, amount):
    assert client.post('/api/transactions', json={**PAYLOAD, 'amount': amount}).status_code == 422


def test_too_many_installments_rejected(client):
    assert client.post('/api/transactions', json={**PAYLOAD, 'amount': 0.04, 'installments': 6}).status_code == 422


@pytest.mark.parametrize('category', ['', 'inventada'])
def test_invalid_category_rejected(client, category):
    assert client.post('/api/transactions', json={**PAYLOAD, 'category': category}).status_code == 422


@pytest.mark.parametrize('path', ['/api/dashboard/summary?month=2026-13', '/api/transactions?month=bad', '/api/history/2026/13'])
def test_invalid_month_rejected(client, path):
    assert client.get(path).status_code == 422


def test_ai_disabled_does_not_generate(client, monkeypatch):
    monkeypatch.setenv('AI_ENABLED', 'false')
    assert client.post('/api/chat', json={'message': 'oi', 'month_key': '2026-09'}).status_code == 503
    client._mock_gemini.chat_with_context.assert_not_called()


def test_long_assistant_reply_is_valid(client, monkeypatch):
    monkeypatch.setenv('AI_ENABLED', 'true')
    client._mock_gemini.chat_with_context.return_value = 'a' * 3000
    response = client.post('/api/chat', json={'message': 'oi', 'month_key': '2026-09'})
    assert response.status_code == 200
    assert len(response.json()['response']) == 3000


def test_history_payload_bounded(client):
    response = client.post('/api/chat', json={'message': 'oi', 'month_key': '2026-09', 'history': [{'role': 'user', 'content': 'x'}] * 21})
    assert response.status_code == 422


def test_csv_formula_escaped(client):
    from backend.tests.conftest import SAMPLE_TX
    client._mock_fs.get_all_transactions.return_value = [{**SAMPLE_TX, 'description': '=1+1'}]
    assert "'=1+1" in client.get('/api/history/export').text


def test_uid_not_email_controls_authorization(monkeypatch):
    monkeypatch.setenv('AUTH_DEV_BYPASS', 'false')
    monkeypatch.setenv('ALLOWED_USER_UIDS', 'owner-uid')
    monkeypatch.setenv('ALLOWED_USER_EMAILS', 'allowed@test.invalid')
    app.dependency_overrides.clear()
    with patch.object(auth_service, 'verify_firebase_token', return_value={'uid': 'other', 'email': 'allowed@test.invalid'}):
        response = TestClient(app).get('/api/transactions', headers={'Authorization': 'Bearer fake'})
    assert response.status_code == 403


def test_cloud_bypass_rejected(monkeypatch):
    monkeypatch.setenv('K_SERVICE', 'finance')
    monkeypatch.setenv('ENVIRONMENT', 'development')
    monkeypatch.setenv('AUTH_DEV_BYPASS', 'true')
    with pytest.raises(RuntimeError):
        auth_service.validate_auth_startup()
