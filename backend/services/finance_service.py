"""Financial rules independent of HTTP, Firestore and language models."""
import calendar
from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import uuid4

EXPENSE_CATEGORIES = {'alimentacao', 'transporte', 'moradia', 'lazer', 'saude', 'educacao', 'outros'}
INCOME_CATEGORIES = {'salario', 'freelance', 'outros'}


def to_cents(value):
    try:
        amount = Decimal(str(value))
        cents = amount * 100
        if not amount.is_finite() or cents != cents.to_integral_value() or not 0 < amount <= 1_000_000_000:
            raise ValueError('Valor deve ser positivo, finito e ter no máximo duas casas decimais.')
        return int(cents)
    except (InvalidOperation, TypeError) as exc:
        raise ValueError('Valor monetário inválido.') from exc


def cents_of(row):
    # Existing documents remain readable; no migration is performed on reads.
    if 'amount_cents' in row:
        return int(row['amount_cents'])
    return int((Decimal(str(row['amount'])) * 100).quantize(Decimal('1')))


def add_months(value, offset):
    original = date.fromisoformat(value)
    year, month0 = divmod(original.year * 12 + original.month - 1 + offset, 12)
    return date(year, month0 + 1, min(original.day, calendar.monthrange(year, month0 + 1)[1])).isoformat()


def validate_category(tx_type, category):
    allowed = EXPENSE_CATEGORIES if tx_type == 'expense' else INCOME_CATEGORIES
    if category not in allowed:
        raise ValueError('Categoria incompatível com o tipo da transação.')


def build_transactions(payload, user):
    data = dict(payload)
    count = data.pop('installments', None) or 1
    total = to_cents(data.pop('amount'))
    validate_category(data['type'], data['category'])
    if count > 1 and data['type'] != 'expense':
        raise ValueError('Parcelamento disponível somente para despesas.')
    if count > total:
        raise ValueError('Cada parcela deve ter pelo menos um centavo.')
    data.update(created_by_uid=user.get('uid'), created_by_email=user.get('email'))
    group = uuid4().hex if count > 1 else None
    base, remainder = divmod(total, count)
    rows = []
    for index in range(count):
        cents = base + (1 if index < remainder else 0)
        row = {**data, 'amount_cents': cents, 'amount': cents / 100,
               'date': add_months(data['date'], index)}
        if count > 1:
            suffix = f' ({index + 1}/{count})'
            row.update(installment_group_id=group, installment_number=index + 1, installment_count=count,
                       description=data['description'][:200-len(suffix)] + suffix)
        rows.append(row)
    return rows


def summarize(month_key, rows):
    income = sum(cents_of(r) for r in rows if r['type'] == 'income')
    expenses = sum(cents_of(r) for r in rows if r['type'] == 'expense')
    return {'month_key': month_key, 'total_income': income / 100, 'total_expenses': expenses / 100,
            'balance': (income - expenses) / 100, 'transaction_count': len(rows)}


def categories(rows):
    totals = {}
    for row in rows:
        if row['type'] == 'expense':
            item = totals.setdefault(row['category'], {'cents': 0, 'count': 0})
            item['cents'] += cents_of(row)
            item['count'] += 1
    total = sum(item['cents'] for item in totals.values())
    return sorted([{'category': name, 'total': item['cents'] / 100, 'count': item['count'],
                    'percentage': round(item['cents'] * 100 / total, 1) if total else 0}
                   for name, item in totals.items()], key=lambda r: r['total'], reverse=True)


def csv_safe(value):
    if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
        return "'" + value
    return value
