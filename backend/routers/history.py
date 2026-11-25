from fastapi import APIRouter, Query, Depends, Path
from fastapi.responses import StreamingResponse
import io
import csv
from backend.models.schemas import MonthDetail, MONTH_PATTERN
from backend.services.finance_service import csv_safe
from backend.services.auth_service import get_current_user
import backend.services.firestore_service as fs

router = APIRouter(
    prefix="/api/history",
    tags=["history"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/months")
def get_available_months():
    """Retorna lista de meses com dados disponíveis."""
    months = fs.get_available_months()
    return {"months": months}


@router.get("/{year}/{month}", response_model=MonthDetail)
def get_month_detail(year: int = Path(..., ge=1000, le=9999), month: int = Path(..., ge=1, le=12)):
    """Retorna detalhes completos de um mês específico."""
    month_key = f"{year:04d}-{month:02d}"
    return fs.get_month_detail(month_key)


@router.get("/compare")
def compare_months(
    month_a: str = Query(..., pattern=MONTH_PATTERN, description="Primeiro mês (YYYY-MM)"),
    month_b: str = Query(..., pattern=MONTH_PATTERN, description="Segundo mês (YYYY-MM)"),
):
    """Compara dois meses lado a lado."""

    def build_detail(mk):
        return fs.get_month_detail(mk)

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
def export_csv(month: str = Query(None, pattern=MONTH_PATTERN, description="Filtrar por mês (YYYY-MM)")):
    """Exporta transações em formato CSV."""
    transactions = fs.get_all_transactions(month_key=month)

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "date", "type", "category", "description", "amount", "month_key"],
        extrasaction="ignore",
    )
    writer.writeheader()
    for t in transactions:
        writer.writerow({k: csv_safe(v) for k, v in t.items()})

    output.seek(0)
    filename = f"transacoes_{month or 'todas'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
