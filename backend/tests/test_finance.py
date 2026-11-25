from decimal import Decimal
import pytest
from backend.services import finance_service as finance


def test_installments_conserve_cents():
    rows = finance.build_transactions(dict(type='expense', amount=1, installments=3,
        category='outros', description='Compra', date='2026-01-31'), {'uid': 'u'})
    assert [r['amount_cents'] for r in rows] == [34, 33, 33]
    assert [r['date'] for r in rows] == ['2026-01-31', '2026-02-28', '2026-03-31']
    assert len({r['installment_group_id'] for r in rows}) == 1


def test_summary_uses_cents_and_legacy_amounts():
    result = finance.summarize('2026-09', [
        {'type':'income','amount':1,'category':'salario'},
        {'type':'expense','amount':999,'amount_cents':10,'category':'outros'},
        {'type':'expense','amount':0.2,'category':'outros'}])
    assert result['balance'] == 0.7
    assert result['total_expenses'] == 0.3


@pytest.mark.parametrize('amount', [float('inf'), Decimal('NaN'), 0.001])
def test_invalid_cents(amount):
    with pytest.raises(ValueError):
        finance.to_cents(amount)
