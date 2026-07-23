"""
Fixtures compartilhadas para todos os testes.

Estratégia de mock:
1. Mockar google-cloud-firestore, firebase_admin e google-genai em sys.modules
   ANTES de qualquer import do backend (nível de módulo).
2. Importar o app e os routers normalmente.
3. Usar patch.object() no fixture para substituir 'fs' e 'gemini'
   dentro de cada router — sem precisar de credenciais GCP.
"""
import sys
from unittest.mock import MagicMock, patch
import pytest

# ── 1. Mockar libs Google e Firebase antes de qualquer import do backend ────────
_GOOGLE_MOCKS = [
    "google",
    "google.cloud",
    "google.cloud.firestore",
    "google.cloud.firestore_v1",
    "google.cloud.firestore_v1.base_query",
    "google.genai",
    "google.genai.types",
    "google.generativeai",
    "firebase_admin",
    "firebase_admin.auth",
    "firebase_admin.credentials",
]
for _mod_name in _GOOGLE_MOCKS:
    if _mod_name not in sys.modules:
        sys.modules[_mod_name] = MagicMock()

# ── 2. Importar backend ───────────────────────────────────────────────────────
from fastapi.testclient import TestClient  # noqa: E402
from backend.main import app  # noqa: E402
from backend.services.auth_service import get_current_user  # noqa: E402
from backend.routers.chat import reset_rate_limiter  # noqa: E402
import backend.routers.transactions as _tx_router   # noqa: E402
import backend.routers.dashboard as _dash_router    # noqa: E402
import backend.routers.history as _hist_router      # noqa: E402
import backend.routers.chat as _chat_router         # noqa: E402

# ── Dados de exemplo reutilizáveis ────────────────────────────────────────────

SAMPLE_TX = {
    "id": "tx-abc-123",
    "type": "expense",
    "amount": 150.00,
    "category": "alimentacao",
    "description": "Supermercado",
    "date": "2026-07-18",
    "month_key": "2026-07",
    "created_at": "2026-07-18T12:00:00",
}

SAMPLE_TX_INCOME = {
    "id": "tx-def-456",
    "type": "income",
    "amount": 5000.00,
    "category": "salario",
    "description": "Salario Julho",
    "date": "2026-07-05",
    "month_key": "2026-07",
    "created_at": "2026-07-05T09:00:00",
}

SAMPLE_SUMMARY = {
    "month_key": "2026-07",
    "total_income": 5000.00,
    "total_expenses": 150.00,
    "balance": 4850.00,
    "transaction_count": 2,
}

SAMPLE_BY_CATEGORY = [
    {"category": "alimentacao", "total": 150.00, "count": 1, "percentage": 100.0},
]

SAMPLE_EVOLUTION = [
    {"month_key": "2026-06", "income": 5000.0, "expenses": 200.0, "balance": 4800.0},
    {"month_key": "2026-07", "income": 5000.0, "expenses": 150.0, "balance": 4850.0},
]

SAMPLE_MONTH_DETAIL = {
    "month_key": "2026-07",
    "total_income": 5000.00,
    "total_expenses": 150.00,
    "balance": 4850.00,
    "transactions": [SAMPLE_TX, SAMPLE_TX_INCOME],
    "by_category": SAMPLE_BY_CATEGORY,
}


# ── 3. Fixture: TestClient com mocks injetados ────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_rate_limit_between_tests():
    reset_rate_limiter()
    yield
    reset_rate_limiter()


@pytest.fixture
def client():
    """
    TestClient com Firestore, Gemini e Auth mockados por padrão.
    Nenhuma credencial GCP ou Firebase é necessária.
    """
    mock_fs = MagicMock()
    mock_fs.create_transaction.return_value = SAMPLE_TX
    mock_fs.create_transactions_batch.return_value = SAMPLE_TX
    mock_fs.get_transactions.return_value = [SAMPLE_TX, SAMPLE_TX_INCOME]
    mock_fs.get_transaction_by_id.return_value = SAMPLE_TX
    mock_fs.update_transaction.return_value = {**SAMPLE_TX, "description": "Atualizado"}
    mock_fs.delete_transaction.return_value = True
    mock_fs.get_summary_by_month.return_value = SAMPLE_SUMMARY
    mock_fs.get_by_category.return_value = SAMPLE_BY_CATEGORY
    mock_fs.get_monthly_evolution.return_value = SAMPLE_EVOLUTION
    mock_fs.get_available_months.return_value = ["2026-07", "2026-06"]
    mock_fs.get_financial_context.return_value = "Receitas: R$ 5000. Despesas: R$ 150."

    mock_gemini = MagicMock()
    mock_gemini.chat_with_context.return_value = (
        "Voce esta indo muito bem! Seu saldo e positivo."
    )
    mock_gemini.get_quick_suggestions.return_value = [
        "Como estao meus gastos este mes?",
        "Em qual categoria gasto mais?",
    ]

    # Override de dependência de usuário autenticado por padrão para os testes existentes
    async def _mock_get_current_user():
        return {
            "uid": "test-user-uid",
            "email": "user1@example.com",
            "is_dev_bypass": False,
        }

    app.dependency_overrides[get_current_user] = _mock_get_current_user

    with patch.object(_tx_router, "fs", mock_fs), \
         patch.object(_dash_router, "fs", mock_fs), \
         patch.object(_hist_router, "fs", mock_fs), \
         patch.object(_chat_router, "fs", mock_fs), \
         patch.object(_chat_router, "gemini", mock_gemini):

        with TestClient(app) as c:
            c._mock_fs = mock_fs
            c._mock_gemini = mock_gemini
            yield c

    app.dependency_overrides.clear()
