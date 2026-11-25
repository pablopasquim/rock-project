"""
Testes para /api/dashboard
Cobre: summary, by-category e evolução mensal.
"""


class TestDashboardSummary:
    def test_summary_current_month(self, client):
        resp = client.get("/api/dashboard/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_income"] == 5000.00
        assert data["total_expenses"] == 150.00
        assert data["balance"] == 4850.00
        assert data["transaction_count"] == 2
        assert "month_key" in data

    def test_summary_specific_month(self, client):
        resp = client.get("/api/dashboard/summary?month=2026-06")
        assert resp.status_code == 200
        client._mock_fs.get_summary_by_month.assert_called_with("2026-06")

    def test_summary_uses_current_month_by_default(self, client):
        resp = client.get("/api/dashboard/summary")
        assert resp.status_code == 200
        # Verifica que foi chamado com alguma string de mês (YYYY-MM)
        call_args = client._mock_fs.get_summary_by_month.call_args[0][0]
        assert len(call_args) == 7
        assert call_args[4] == "-"

    def test_summary_response_structure(self, client):
        """Verifica que todos os campos obrigatórios estão presentes."""
        resp = client.get("/api/dashboard/summary")
        data = resp.json()
        required_fields = ["month_key", "total_income", "total_expenses", "balance", "transaction_count"]
        for field in required_fields:
            assert field in data, f"Campo '{field}' ausente na resposta"

    def test_summary_balance_is_correct(self, client):
        resp = client.get("/api/dashboard/summary")
        data = resp.json()
        expected_balance = data["total_income"] - data["total_expenses"]
        assert abs(data["balance"] - expected_balance) < 0.01


class TestDashboardByCategory:
    def test_by_category_returns_list(self, client):
        resp = client.get("/api/dashboard/by-category")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_by_category_fields(self, client):
        resp = client.get("/api/dashboard/by-category")
        data = resp.json()
        for item in data:
            assert "category" in item
            assert "total" in item
            assert "count" in item
            assert "percentage" in item

    def test_by_category_percentage_range(self, client):
        resp = client.get("/api/dashboard/by-category")
        data = resp.json()
        for item in data:
            assert 0 <= item["percentage"] <= 100

    def test_by_category_filter_month(self, client):
        resp = client.get("/api/dashboard/by-category?month=2026-06")
        assert resp.status_code == 200
        client._mock_fs.get_by_category.assert_called_with("2026-06")

    def test_by_category_total_non_negative(self, client):
        resp = client.get("/api/dashboard/by-category")
        data = resp.json()
        for item in data:
            assert item["total"] >= 0


class TestMonthlyEvolution:
    def test_evolution_returns_list(self, client):
        resp = client.get("/api/dashboard/monthly-evolution")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_evolution_default_12_months(self, client):
        resp = client.get("/api/dashboard/monthly-evolution")
        assert resp.status_code == 200
        client._mock_fs.get_monthly_evolution.assert_called_with(12)

    def test_evolution_custom_months(self, client):
        resp = client.get("/api/dashboard/monthly-evolution?months=6")
        assert resp.status_code == 200
        client._mock_fs.get_monthly_evolution.assert_called_with(6)

    def test_evolution_max_months_limit(self, client):
        resp = client.get("/api/dashboard/monthly-evolution?months=999")
        assert resp.status_code == 422

    def test_evolution_item_structure(self, client):
        resp = client.get("/api/dashboard/monthly-evolution")
        data = resp.json()
        for item in data:
            assert "month_key" in item
            assert "income" in item
            assert "expenses" in item
            assert "balance" in item

    def test_evolution_month_key_format(self, client):
        resp = client.get("/api/dashboard/monthly-evolution")
        data = resp.json()
        for item in data:
            mk = item["month_key"]
            assert len(mk) == 7, f"month_key inválido: {mk}"
            assert mk[4] == "-", f"month_key sem hífen: {mk}"
