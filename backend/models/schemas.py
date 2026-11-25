import re
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Literal
from datetime import datetime
from backend.services.finance_service import to_cents, validate_category, EXPENSE_CATEGORIES, INCOME_CATEGORIES

MONTH_PATTERN = r"^[1-9][0-9]{3}-(0[1-9]|1[0-2])$"


def validate_month_key_str(v: str) -> str:
    """Valida se uma string month_key tem o formato YYYY-MM com mês entre 01 e 12."""
    if not isinstance(v, str):
        raise ValueError("month_key deve ser uma string.")
    match = re.match(MONTH_PATTERN, v)
    if not match:
        raise ValueError("month_key deve estar no formato YYYY-MM com mês válido de 01 a 12.")
    return v


# ─── Transaction ────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    type: Literal["expense", "income"]
    amount: float = Field(..., gt=0, le=1_000_000_000, allow_inf_nan=False, description="Valor positivo em BRL")
    category: str = Field(..., description="Categoria da transação")
    description: str = Field(..., min_length=1, max_length=200)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD")
    installments: Optional[int] = Field(None, ge=1, le=72, description="Número de parcelas (para cartão de crédito)")

    @field_validator("amount", mode="before")
    @classmethod
    def valid_money(cls, value):
        to_cents(value)
        return value

    @model_validator(mode="after")
    def valid_transaction(self):
        validate_category(self.type, self.category)
        if self.installments and self.installments > 1:
            if self.type != "expense" or self.installments > to_cents(self.amount):
                raise ValueError("Parcelamento invalido para o tipo ou valor.")
            if int(self.date[:4]) + (self.installments // 12) >= 9999:
                raise ValueError("Data fora do intervalo permitido.")
        return self

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Data deve ser uma data válida no formato YYYY-MM-DD.")
        return v


class TransactionUpdate(BaseModel):
    expected_version: Optional[int] = Field(None, ge=0)
    type: Optional[Literal["expense", "income"]] = None
    amount: Optional[float] = Field(None, gt=0, le=1_000_000_000, allow_inf_nan=False)
    category: Optional[str] = None
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")

    @field_validator("amount", mode="before")
    @classmethod
    def valid_money(cls, value):
        if value is not None:
            to_cents(value)
        return value

    @field_validator("category")
    @classmethod
    def valid_category(cls, value):
        if value is not None and value not in EXPENSE_CATEGORIES | INCOME_CATEGORIES:
            raise ValueError("Categoria invalida.")
        return value

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                datetime.strptime(v, "%Y-%m-%d")
            except ValueError:
                raise ValueError("Data deve ser uma data válida no formato YYYY-MM-DD.")
        return v


class TransactionResponse(BaseModel):
    version: int = 0
    id: str
    type: str
    amount: float
    category: str
    description: str
    date: str
    month_key: str
    created_at: str
    created_by_uid: Optional[str] = None
    created_by_email: Optional[str] = None
    updated_by_uid: Optional[str] = None
    updated_by_email: Optional[str] = None
    updated_at: Optional[str] = None
    amount_cents: Optional[int] = None
    installment_group_id: Optional[str] = None
    installment_number: Optional[int] = None
    installment_count: Optional[int] = None


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

    @field_validator("month_key")
    @classmethod
    def validate_mk(cls, v: str) -> str:
        return validate_month_key_str(v)


class MonthlyEvolution(BaseModel):
    month_key: str
    income: float
    expenses: float
    balance: float

    @field_validator("month_key")
    @classmethod
    def validate_mk(cls, v: str) -> str:
        return validate_month_key_str(v)


# ─── History ────────────────────────────────────────────────────────────────

class MonthDetail(BaseModel):
    month_key: str
    total_income: float
    total_expenses: float
    balance: float
    transactions: List[TransactionResponse]
    by_category: List[CategorySummary]

    @field_validator("month_key")
    @classmethod
    def validate_mk(cls, v: str) -> str:
        return validate_month_key_str(v)


# ─── Chat ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=12000)

    @model_validator(mode="after")
    def user_length(self):
        if self.role == "user" and len(self.content) > 2000:
            raise ValueError("Mensagem do usuario excede 2000 caracteres.")
        return self


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    month_key: str = Field(..., description="Mês selecionado (YYYY-MM)")
    history: Optional[List[ChatMessage]] = Field(default_factory=list, max_length=20)

    @field_validator("month_key")
    @classmethod
    def validate_mk(cls, v: str) -> str:
        return validate_month_key_str(v)


class ChatResponse(BaseModel):
    response: str
    history: List[ChatMessage]
