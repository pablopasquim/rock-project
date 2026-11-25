from backend.models.schemas import MONTH_PATTERN
from fastapi import APIRouter, Query, Depends
from typing import List
from datetime import datetime, timezone
from backend.models.schemas import DashboardSummary, CategorySummary, MonthlyEvolution
from backend.services.auth_service import get_current_user
import backend.services.firestore_service as fs

router = APIRouter(
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)


def _current_month() -> str:
    return fs.current_month()


@router.get("/summary", response_model=DashboardSummary)
def get_summary(month: str = Query(None, pattern=MONTH_PATTERN, description="YYYY-MM (padrão: mês atual)")):
    """Retorna resumo financeiro do mês: saldo, receitas e despesas."""
    month_key = month or _current_month()
    return fs.get_summary_by_month(month_key)


@router.get("/by-category", response_model=List[CategorySummary])
def get_by_category(month: str = Query(None, pattern=MONTH_PATTERN, description="YYYY-MM")):
    """Retorna gastos agrupados por categoria para o mês."""
    month_key = month or _current_month()
    return fs.get_by_category(month_key)


@router.get("/monthly-evolution", response_model=List[MonthlyEvolution])
def get_monthly_evolution(months: int = Query(12, ge=1, le=24)):
    """Retorna evolução de receitas/despesas/saldo dos últimos N meses."""
    return fs.get_monthly_evolution(months)


@router.get("/overview")
def overview(month: str = Query(..., pattern=MONTH_PATTERN)):
    return fs.get_overview(month)
