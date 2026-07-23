from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from typing import List
import io
import csv
from backend.models.schemas import MonthDetail, MonthComparison
import backend.services.firestore_service as fs

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/months")
def get_available_months():
    """Retorna lista de meses com dados disponíveis."""
    months = fs.get_available_months()
    return {"months": months}


@router.get("/{year}/{month}", response_model=MonthDetail)
def get_month_detail(year: int, month: int):
    """Retorna detalhes completos de um mês específico."""
    month_key = f"{year:04d}-{month:02d}"
    transactions = fs.get_transactions(month_key=month_key, limit=1000)
    summary = fs.get_summary_by_month(month_key)
    by_category = fs.get_by_category(month_key)

    return {
        "month_key": month_key,
        "total_income": summary["total_income"],
        "total_expenses": summary["total_expenses"],
        "balance": summary["balance"],
        "transactions": transactions,
        "by_category": by_category,
    }


@router.get("/compare")
def compare_months(
    month_a: str = Query(..., description="Primeiro mês (YYYY-MM)"),
    month_b: str = Query(..., description="Segundo mês (YYYY-MM)"),
):
    """Compara dois meses lado a lado."""

    def build_detail(mk: str):
        transactions = fs.get_transactions(month_key=mk, limit=1000)
        summary = fs.get_summary_by_month(mk)
        by_category = fs.get_by_category(mk)
        return {
            "month_key": mk,
            "total_income": summary["total_income"],
            "total_expenses": summary["total_expenses"],
            "balance": summary["balance"],
            "transactions": transactions,
            "by_category": by_category,
        }

    a = build_detail(month_a)
    b = build_detail(month_b)

    return {
        "month_a": a,
        "month_b": b,
        "income_diff": round(b["total_income"] - a["total_income"], 2),
        "expenses_diff": round(b["total_expenses"] - a["total_expenses"], 2),
        "balance_diff": round(b["balance"] - a["balance"], 2),
    }


@router.get("/export")
def export_csv(month: str = Query(None, description="Filtrar por mês (YYYY-MM)")):
    """Exporta transações em formato CSV."""
    transactions = fs.get_transactions(month_key=month, limit=5000)

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "date", "type", "category", "description", "amount", "month_key"],
        extrasaction="ignore",
    )
    writer.writeheader()
    for t in transactions:
        writer.writerow(t)

    output.seek(0)
    filename = f"transacoes_{month or 'todas'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
