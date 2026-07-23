"""
Testes para /api/transactions
Cobre: criação, listagem, atualização, deleção e categorias.
"""
import pytest
from .conftest import SAMPLE_TX, SAMPLE_TX_INCOME


class TestCreateTransaction:
    def test_create_expense_success(self, client):
        payload = {
            "type": "expense",
            "amount": 150.00,
            "category": "alimentacao",
            "description": "Supermercado",
            "date": "2026-07-18",
        }
        resp = client.post("/api/transactions", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "expense"
        assert data["amount"] == 150.00
        assert data["category"] == "alimentacao"
        assert data["id"] == SAMPLE_TX["id"]

    def test_create_income_success(self, client):
        client._mock_fs.create_transaction.return_value = SAMPLE_TX_INCOME
        payload = {
            "type": "income",
            "amount": 5000.00,
            "category": "salario",
            "description": "Salário Julho",
            "date": "2026-07-05",
        }
        resp = client.post("/api/transactions", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "income"
        assert data["amount"] == 5000.00

    def test_create_invalid_amount_zero(self, client):
        """Valor zero deve ser rejeitado (validação Pydantic)."""
        payload = {
            "type": "expense",
            "amount": 0,
            "category": "alimentacao",
            "description": "Teste",
            "date": "2026-07-18",
        }
        resp = client.post("/api/transactions", json=payload)
        assert resp.status_code == 422

    def test_create_invalid_amount_negative(self, client):
        payload = {
            "type": "expense",
            "amount": -50,
            "category": "alimentacao",
            "description": "Teste",
            "date": "2026-07-18",
        }
        resp = client.post("/api/transactions", json=payload)
        assert resp.status_code == 422

    def test_create_invalid_date_format(self, client):
        payload = {
            "type": "expense",
            "amount": 50,
            "category": "alimentacao",
            "description": "Teste",
            "date": "18/07/2026",  # formato inválido
        }
        resp = client.post("/api/transactions", json=payload)
        assert resp.status_code == 422

    def test_create_invalid_type(self, client):
        payload = {
            "type": "invalid_type",
            "amount": 50,
            "category": "alimentacao",
            "description": "Teste",
            "date": "2026-07-18",
        }
        resp = client.post("/api/transactions", json=payload)
        assert resp.status_code == 422

    def test_create_empty_description_rejected(self, client):
        payload = {
            "type": "expense",
            "amount": 50,
            "category": "alimentacao",
            "description": "",
            "date": "2026-07-18",
        }
        resp = client.post("/api/transactions", json=payload)
        assert resp.status_code == 422

    def test_create_missing_required_fields(self, client):
        resp = client.post("/api/transactions", json={"amount": 50})
        assert resp.status_code == 422


class TestListTransactions:
    def test_list_all(self, client):
        resp = client.get("/api/transactions")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2

    def test_list_filter_by_month(self, client):
        client._mock_fs.get_transactions.return_value = [SAMPLE_TX]
        resp = client.get("/api/transactions?month=2026-07")
        assert resp.status_code == 200
        # Verifica que o filtro foi passado corretamente para o serviço
        client._mock_fs.get_transactions.assert_called_with(
            month_key="2026-07", category=None, tx_type=None, limit=100
        )

    def test_list_filter_by_type(self, client):
        client._mock_fs.get_transactions.return_value = [SAMPLE_TX]
        resp = client.get("/api/transactions?type=expense")
        assert resp.status_code == 200
        client._mock_fs.get_transactions.assert_called_with(
            month_key=None, category=None, tx_type="expense", limit=100
        )

    def test_list_filter_by_category(self, client):
        client._mock_fs.get_transactions.return_value = [SAMPLE_TX]
        resp = client.get("/api/transactions?category=alimentacao")
        assert resp.status_code == 200

    def test_list_respects_limit(self, client):
        resp = client.get("/api/transactions?limit=10")
        assert resp.status_code == 200
        client._mock_fs.get_transactions.assert_called_with(
            month_key=None, category=None, tx_type=None, limit=10
        )

    def test_list_limit_too_large_rejected(self, client):
        resp = client.get("/api/transactions?limit=9999")
        assert resp.status_code == 422


class TestUpdateTransaction:
    def test_update_description(self, client):
        resp = client.put("/api/transactions/tx-abc-123", json={"description": "Atualizado"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["description"] == "Atualizado"

    def test_update_not_found(self, client):
        client._mock_fs.update_transaction.return_value = None
        resp = client.put("/api/transactions/nao-existe", json={"description": "X"})
        assert resp.status_code == 404

    def test_update_empty_body_rejected(self, client):
        """Body vazio (sem campos) deve retornar 400."""
        resp = client.put("/api/transactions/tx-abc-123", json={})
        assert resp.status_code == 400

    def test_update_invalid_amount(self, client):
        resp = client.put("/api/transactions/tx-abc-123", json={"amount": -10})
        assert resp.status_code == 422


class TestDeleteTransaction:
    def test_delete_success(self, client):
        resp = client.delete("/api/transactions/tx-abc-123")
        assert resp.status_code == 204

    def test_delete_not_found(self, client):
        client._mock_fs.delete_transaction.return_value = False
        resp = client.delete("/api/transactions/nao-existe")
        assert resp.status_code == 404


class TestCategories:
    def test_get_categories(self, client):
        resp = client.get("/api/transactions/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert "expense" in data
        assert "income" in data
        # Verifica categorias de despesa
        expense_ids = [c["id"] for c in data["expense"]]
        assert "alimentacao" in expense_ids
        assert "transporte" in expense_ids
        assert "moradia" in expense_ids
        # Verifica categorias de receita
        income_ids = [c["id"] for c in data["income"]]
        assert "salario" in income_ids
