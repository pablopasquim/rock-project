import os
from typing import List, Optional, Dict, Any
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from datetime import datetime


_db_client = None

def _get_client() -> firestore.Client:
    global _db_client
    if _db_client is None:
        project_id = os.getenv("GCP_PROJECT_ID")
        database_id = os.getenv("FIRESTORE_DATABASE", "schemaless")
        _db_client = firestore.Client(project=project_id, database=database_id)
    return _db_client


def get_household_id() -> str:
    return os.getenv("HOUSEHOLD_ID", "rock-family")


def _get_transactions_collection():
    db = _get_client()
    household_id = get_household_id()
    return db.collection("households").document(household_id).collection("transactions")


def _transaction_to_dict(doc) -> Dict[str, Any]:
    data = doc.to_dict() or {}
    created_at = data.get("created_at")
    if hasattr(created_at, "isoformat"):
        data["created_at"] = created_at.isoformat()
    elif created_at is None:
        data["created_at"] = datetime.utcnow().isoformat()
    data["id"] = doc.id
    return data


# ─── CRUD ───────────────────────────────────────────────────────────────────

def create_transaction(data: Dict[str, Any]) -> Dict[str, Any]:
    collection = _get_transactions_collection()
    date_str = data["date"]
    month_key = date_str[:7]  # "YYYY-MM"
    doc_data = {
        **data,
        "month_key": month_key,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    ref = collection.add(doc_data)
    doc = ref[1].get()
    return _transaction_to_dict(doc)


def create_transactions_batch(transactions_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    db = _get_client()
    batch = db.batch()
    collection = _get_transactions_collection()
    
    first_ref = None
    
    for data in transactions_data:
        date_str = data["date"]
        month_key = date_str[:7]
        doc_data = {
            **data,
            "month_key": month_key,
            "created_at": firestore.SERVER_TIMESTAMP,
        }
        ref = collection.document()
        if not first_ref:
            first_ref = ref
        batch.set(ref, doc_data)
        
    batch.commit()
    return _transaction_to_dict(first_ref.get())


def get_transactions(
    month_key: Optional[str] = None,
    category: Optional[str] = None,
    tx_type: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    query = _get_transactions_collection()

    if month_key:
        query = query.where(filter=FieldFilter("month_key", "==", month_key))
    if category:
        query = query.where(filter=FieldFilter("category", "==", category))
    if tx_type:
        query = query.where(filter=FieldFilter("type", "==", tx_type))

    query = query.order_by("date", direction=firestore.Query.DESCENDING).limit(limit)
    docs = query.stream()
    return [_transaction_to_dict(doc) for doc in docs]


def get_transaction_by_id(tx_id: str) -> Optional[Dict[str, Any]]:
    doc = _get_transactions_collection().document(tx_id).get()
    if not doc.exists:
        return None
    return _transaction_to_dict(doc)


def update_transaction(tx_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ref = _get_transactions_collection().document(tx_id)
    doc = ref.get()
    if not doc.exists:
        return None

    if "date" in updates:
        updates["month_key"] = updates["date"][:7]

    ref.update(updates)
    return _transaction_to_dict(ref.get())


def delete_transaction(tx_id: str) -> bool:
    ref = _get_transactions_collection().document(tx_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True


# ─── Aggregations ───────────────────────────────────────────────────────────

def get_summary_by_month(month_key: str) -> Dict[str, Any]:
    transactions = get_transactions(month_key=month_key, limit=1000)
    total_income = sum(t["amount"] for t in transactions if t["type"] == "income")
    total_expenses = sum(t["amount"] for t in transactions if t["type"] == "expense")
    return {
        "month_key": month_key,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "balance": round(total_income - total_expenses, 2),
        "transaction_count": len(transactions),
    }


def get_by_category(month_key: str) -> List[Dict[str, Any]]:
    transactions = get_transactions(month_key=month_key, tx_type="expense", limit=1000)
    category_map: Dict[str, Dict] = {}

    for t in transactions:
        cat = t["category"]
        if cat not in category_map:
            category_map[cat] = {"category": cat, "total": 0.0, "count": 0}
        category_map[cat]["total"] += t["amount"]
        category_map[cat]["count"] += 1

    total = sum(v["total"] for v in category_map.values())
    result = []
    for v in category_map.values():
        v["total"] = round(v["total"], 2)
        v["percentage"] = round((v["total"] / total * 100) if total > 0 else 0, 1)
        result.append(v)

    return sorted(result, key=lambda x: x["total"], reverse=True)


def get_monthly_evolution(months: int = 12) -> List[Dict[str, Any]]:
    """Retorna os últimos N meses com dados."""
    now = datetime.utcnow()
    month_keys = []
    for i in range(months - 1, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_keys.append(f"{year:04d}-{month:02d}")
    
    oldest_month = month_keys[0]

    docs = _get_transactions_collection().where(filter=FieldFilter("month_key", ">=", oldest_month)).stream()
    
    summary_map = {mk: {"income": 0.0, "expenses": 0.0, "balance": 0.0} for mk in month_keys}
    
    for doc in docs:
        data = doc.to_dict()
        mk = data.get("month_key")
        if mk in summary_map:
            amt = float(data.get("amount", 0))
            if data.get("type") == "income":
                summary_map[mk]["income"] += amt
                summary_map[mk]["balance"] += amt
            elif data.get("type") == "expense":
                summary_map[mk]["expenses"] += amt
                summary_map[mk]["balance"] -= amt
                
    result = []
    for mk in month_keys:
        result.append({
            "month_key": mk,
            "income": round(summary_map[mk]["income"], 2),
            "expenses": round(summary_map[mk]["expenses"], 2),
            "balance": round(summary_map[mk]["balance"], 2),
        })
    
    return result


def get_available_months() -> List[str]:
    """Retorna meses distintos que têm transações."""
    docs = _get_transactions_collection().stream()
    months = set()
    for doc in docs:
        data = doc.to_dict()
        if "month_key" in data:
            months.add(data["month_key"])
    return sorted(months, reverse=True)


def get_financial_context(month_key: str) -> str:
    """Monta um resumo financeiro textual para o system prompt da IA."""
    summary = get_summary_by_month(month_key)
    by_cat = get_by_category(month_key)
    evolution = get_monthly_evolution(6)

    lines = [
        f"=== Resumo Financeiro — {month_key} ===",
        f"Receitas: R$ {summary['total_income']:.2f}",
        f"Despesas: R$ {summary['total_expenses']:.2f}",
        f"Saldo: R$ {summary['balance']:.2f}",
        f"Total de transações: {summary['transaction_count']}",
        "",
        "=== Gastos por Categoria ===",
    ]
    for cat in by_cat:
        lines.append(f"  {cat['category']}: R$ {cat['total']:.2f} ({cat['percentage']}%)")

    lines.append("")
    lines.append("=== Evolução dos Últimos 6 Meses ===")
    for ev in evolution:
        lines.append(
            f"  {ev['month_key']}: receitas R$ {ev['income']:.2f} | "
            f"despesas R$ {ev['expenses']:.2f} | saldo R$ {ev['balance']:.2f}"
        )

    return "\n".join(lines)
