"""
Testes para /api/history
Cobre: meses disponíveis, detalhes por mês, comparação e exportação CSV.
"""
import pytest
from .conftest import SAMPLE_MONTH_DETAIL


class TestAvailableMonths:
    def test_returns_month_list(self, client):
        resp = client.get("/api/history/months")
        assert resp.status_code == 200
        data = resp.json()
        assert "months" in data
        assert isinstance(data["months"], list)

    def test_months_are_in_correct_format(self, client):
        resp = client.get("/api/history/months")
        data = resp.json()
        for month in data["months"]:
            assert len(month) == 7
            assert month[4] == "-"

    def test_months_sorted_desc(self, client):
        """Meses devem vir em ordem decrescente (mais recente primeiro)."""
        resp = client.get("/api/history/months")
        data = resp.json()
        months = data["months"]
        if len(months) > 1:
            assert months[0] >= months[1]


class TestMonthDetail:
    def test_get_month_detail(self, client):
        client._mock_fs.get_transactions.return_value = SAMPLE_MONTH_DETAIL["transactions"]
        resp = client.get("/api/history/2026/7")
        assert resp.status_code == 200
        data = resp.json()
        assert data["month_key"] == "2026-07"
        assert "total_income" in data
        assert "total_expenses" in data
        assert "balance" in data
        assert "transactions" in data
        assert "by_category" in data

    def test_month_detail_transactions_list(self, client):
        client._mock_fs.get_transactions.return_value = SAMPLE_MONTH_DETAIL["transactions"]
        resp = client.get("/api/history/2026/7")
        data = resp.json()
        assert isinstance(data["transactions"], list)

    def test_month_key_format_in_response(self, client):
        resp = client.get("/api/history/2026/7")
        data = resp.json()
        assert data["month_key"] == "2026-07"

    def test_month_key_zero_padded(self, client):
        """Meses com um dígito devem ser zero-padded (7 → 07)."""
        resp = client.get("/api/history/2026/7")
        data = resp.json()
        assert data["month_key"] == "2026-07"

    def test_firestore_called_with_correct_month_key(self, client):
        client._mock_fs.get_transactions.return_value = []
        client.get("/api/history/2026/7")
        client._mock_fs.get_month_detail.assert_called_with("2026-07")


class TestMonthComparison:
    def test_compare_two_months(self, client):
        resp = client.get("/api/history/compare?month_a=2026-06&month_b=2026-07")
        assert resp.status_code == 200
        data = resp.json()
        assert "month_a" in data
        assert "month_b" in data
        assert "income_diff" in data
        assert "expenses_diff" in data
        assert "balance_diff" in data

    def test_compare_requires_both_months(self, client):
        resp = client.get("/api/history/compare?month_a=2026-06")
        assert resp.status_code == 422

    def test_compare_diff_is_b_minus_a(self, client):
        """Diffs devem ser calculados como B - A."""
        # Mock summary para dois meses diferentes
        summaries = {
            "2026-06": {
                "month_key": "2026-06", "total_income": 4000,
                "total_expenses": 300, "balance": 3700, "transaction_count": 3,
            },
            "2026-07": {
                "month_key": "2026-07", "total_income": 5000,
                "total_expenses": 150, "balance": 4850, "transaction_count": 2,
            },
        }
        client._mock_fs.get_month_detail.side_effect = lambda mk: {**summaries[mk], "transactions": [], "by_category": []}
        client._mock_fs.get_transactions.return_value = []
        client._mock_fs.get_by_category.return_value = []

        resp = client.get("/api/history/compare?month_a=2026-06&month_b=2026-07")
        data = resp.json()
        assert data["income_diff"] == pytest.approx(1000.0)    # 5000 - 4000
        assert data["expenses_diff"] == pytest.approx(-150.0)  # 150 - 300
        assert data["balance_diff"] == pytest.approx(1150.0)   # 4850 - 3700


class TestExportCSV:
    def test_export_csv_returns_file(self, client):
        resp = client.get("/api/history/export")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_export_csv_has_content_disposition(self, client):
        resp = client.get("/api/history/export")
        assert "content-disposition" in resp.headers
        assert "attachment" in resp.headers["content-disposition"]

    def test_export_csv_with_month_filter(self, client):
        resp = client.get("/api/history/export?month=2026-07")
        assert resp.status_code == 200
        assert "2026-07" in resp.headers["content-disposition"]

    def test_export_csv_has_header_row(self, client):
        resp = client.get("/api/history/export")
        content = resp.text
        # Verifica que o CSV tem cabeçalho
        first_line = content.split("\n")[0]
        assert "date" in first_line
        assert "amount" in first_line
        assert "category" in first_line
        assert "description" in first_line

    def test_export_csv_data_rows(self, client):
        resp = client.get("/api/history/export")
        lines = [l for l in resp.text.strip().split("\n") if l]
        # Header + 2 transações do mock
        assert len(lines) == 3
