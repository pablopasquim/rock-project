from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


# ─── Transaction ────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    type: Literal["expense", "income"]
    amount: float = Field(..., gt=0, description="Valor positivo em BRL")
    category: str = Field(..., description="Categoria da transação")
    description: str = Field(..., min_length=1, max_length=200)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD")
    installments: Optional[int] = Field(None, ge=1, le=72, description="Número de parcelas (para cartão de crédito)")



class TransactionUpdate(BaseModel):
    type: Optional[Literal["expense", "income"]] = None
    amount: Optional[float] = Field(None, gt=0)
    category: Optional[str] = None
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class TransactionResponse(BaseModel):
    id: str
    type: str
    amount: float
    category: str
    description: str
    date: str
    month_key: str
    created_at: str


# ─── Dashboard ──────────────────────────────────────────────────────────────

class CategorySummary(BaseModel):
    category: str
    total: float
    count: int
    percentage: float


class DashboardSummary(BaseModel):
    month_key: str
    total_income: float
    total_expenses: float
    balance: float
    transaction_count: int


class MonthlyEvolution(BaseModel):
    month_key: str
    income: float
    expenses: float
    balance: float


# ─── History ────────────────────────────────────────────────────────────────

class MonthDetail(BaseModel):
    month_key: str
    total_income: float
    total_expenses: float
    balance: float
    transactions: List[TransactionResponse]
    by_category: List[CategorySummary]


class MonthComparison(BaseModel):
    month_a: MonthDetail
    month_b: MonthDetail
    income_diff: float
    expenses_diff: float
    balance_diff: float


# ─── Chat ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: Optional[List[ChatMessage]] = []


class ChatResponse(BaseModel):
    response: str
    history: List[ChatMessage]
