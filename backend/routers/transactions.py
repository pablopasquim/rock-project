import calendar
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Depends
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
    current_user: dict = Depends(get_current_user),
):
    """Cria uma nova transação (receita ou despesa), com suporte a parcelamento e metadados de autor."""
    data = transaction.model_dump()
    installments = data.pop("installments", None)

    # Injeta metadados de auditoria do household
    data["created_by_uid"] = current_user.get("uid")
    data["created_by_email"] = current_user.get("email")

    if installments and installments > 1 and data["type"] == "expense":
        base_desc = data["description"]
        base_date = data["date"]
        total_amount = data["amount"]
        
        installment_amount = round(total_amount / installments, 2)
        last_installment_amount = round(total_amount - (installment_amount * (installments - 1)), 2)

        transactions_to_create = []
        
        for i in range(installments):
            current_data = data.copy()
            current_data["amount"] = last_installment_amount if i == installments - 1 else installment_amount
            current_data["description"] = f"{base_desc} ({i+1}/{installments})"
            current_data["date"] = add_months(base_date, i)
            transactions_to_create.append(current_data)
            
        return fs.create_transactions_batch(transactions_to_create)
    else:
        return fs.create_transaction(data)


@router.get("", response_model=List[TransactionResponse])
def list_transactions(
    month: Optional[str] = Query(None, description="Filtro por mês (YYYY-MM)"),
    category: Optional[str] = Query(None),
    type: Optional[str] = Query(None, description="'expense' ou 'income'"),
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

    result = fs.update_transaction(tx_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return result


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: str):
    """Deleta uma transação."""
    success = fs.delete_transaction(tx_id)
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
