import calendar
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Depends, Header
from backend.services.finance_service import build_transactions, to_cents
from backend.models.schemas import MONTH_PATTERN
from backend.models.schemas import TransactionCreate, TransactionUpdate, TransactionResponse
from backend.services.auth_service import get_current_user
import backend.services.firestore_service as fs

router = APIRouter(
    prefix="/api/transactions",
    tags=["transactions"],
    dependencies=[Depends(get_current_user)],
)

VALID_CATEGORIES = [
    "alimentacao", "transporte", "moradia", "lazer",
    "saude", "educacao", "salario", "freelance", "outros"
]


def add_months(date_str: str, months_to_add: int) -> str:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    month = dt.month - 1 + months_to_add
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return f"{year:04d}-{month:02d}-{day:02d}"


@router.post("", response_model=TransactionResponse, status_code=201)
def create_transaction(
    transaction: TransactionCreate,
    idempotency_key: Optional[str] = Header(None, min_length=8, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
    current_user: dict = Depends(get_current_user),
):
    """Cria uma nova transação (receita ou despesa), com suporte a parcelamento e metadados de autor."""
    rows = build_transactions(transaction.model_dump(), current_user)
    if idempotency_key:
        return fs.create_idempotent(rows, current_user["uid"], idempotency_key, transaction.model_dump())
    return fs.create_transactions_batch(rows) if len(rows) > 1 else fs.create_transaction(rows[0])


@router.get("", response_model=List[TransactionResponse])
def list_transactions(
    month: Optional[str] = Query(None, pattern=MONTH_PATTERN, description="Filtro por mês (YYYY-MM)"),
    category: Optional[str] = Query(None),
    type: Optional[str] = Query(None, pattern="^(expense|income)$", description="Tipo"),
    limit: int = Query(100, ge=1, le=500),
):
    """Lista transações com filtros opcionais."""
    return fs.get_transactions(
        month_key=month,
        category=category,
        tx_type=type,
        limit=limit,
    )


@router.put("/{tx_id}", response_model=TransactionResponse)
def update_transaction(
    tx_id: str,
    updates: TransactionUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Atualiza uma transação existente adicionando metadados de edição."""
    data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    data["updated_by_uid"] = current_user.get("uid")
    data["updated_by_email"] = current_user.get("email")

    if "amount" in data:
        data["amount_cents"] = to_cents(data["amount"])
    result = fs.update_transaction(tx_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return result


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: str, current_user: dict = Depends(get_current_user)):
    """Deleta uma transação."""
    success = fs.delete_transaction(tx_id, current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Transação não encontrada")


@router.get("/categories")
def get_categories():
    """Retorna as categorias disponíveis."""
    return {
        "expense": [
            {"id": "alimentacao", "label": "Alimentação", "icon": "utensils"},
            {"id": "transporte", "label": "Transporte", "icon": "car"},
            {"id": "moradia", "label": "Moradia", "icon": "home"},
            {"id": "lazer", "label": "Lazer", "icon": "gamepad-2"},
            {"id": "saude", "label": "Saúde", "icon": "heart-pulse"},
            {"id": "educacao", "label": "Educação", "icon": "book-open"},
            {"id": "outros", "label": "Outros", "icon": "more-horizontal"},
        ],
        "income": [
            {"id": "salario", "label": "Salário", "icon": "briefcase"},
            {"id": "freelance", "label": "Freelance", "icon": "laptop"},
            {"id": "outros", "label": "Outros", "icon": "more-horizontal"},
        ],
    }


@router.get("/page")
def transactions_page(month: str = Query(..., pattern=MONTH_PATTERN), limit: int = Query(200, ge=1, le=500),
                      cursor: Optional[str] = Query(None, min_length=1, max_length=1500, pattern=r"^[^/]+$")):
    return fs.get_transactions_page(month, limit, cursor)


@router.get("/trash")
def trash():
    return fs.get_trash()


@router.post("/{tx_id}/restore", response_model=TransactionResponse)
def restore(tx_id: str, current_user: dict = Depends(get_current_user)):
    return fs.restore_transaction(tx_id, current_user)
