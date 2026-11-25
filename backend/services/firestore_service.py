"""Household persistence. Financial arithmetic lives in finance_service."""
import hashlib
import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from fastapi import HTTPException
from backend.services import finance_service as finance

_db_client = None
MAX_REPORT_ROWS = 10000


def _get_client():
    global _db_client
    if _db_client is None:
        _db_client = firestore.Client(project=os.getenv('GCP_PROJECT_ID'), database=os.getenv('FIRESTORE_DATABASE', '(default)'))
    return _db_client


def get_household_id():
    return os.getenv('HOUSEHOLD_ID', 'rock-family')


def _household():
    return _get_client().collection('households').document(get_household_id())


def _get_transactions_collection():
    return _household().collection('transactions')


def _transaction_to_dict(doc):
    data = doc.to_dict() or {}
    for key, value in list(data.items()):
        if hasattr(value, 'isoformat'):
            data[key] = value.isoformat()
    data['id'] = doc.id
    data['amount_cents'] = finance.cents_of(data)
    data['amount'] = data['amount_cents'] / 100
    data.setdefault('version', 0)
    return data


def _document(data):
    return {**data, 'month_key': data['date'][:7], 'version': 0, 'created_at': firestore.SERVER_TIMESTAMP}


def create_transaction(data):
    return create_transactions_batch([data])


def create_transactions_batch(rows):
    batch = _get_client().batch()
    refs = [_get_transactions_collection().document() for _ in rows]
    for ref, row in zip(refs, rows):
        batch.create(ref, _document(row))
    batch.commit()
    return _transaction_to_dict(refs[0].get())


def create_idempotent(rows, uid, key, payload):
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
    key_id = hashlib.sha256(f'{uid}:{key}'.encode()).hexdigest()
    marker = _household().collection('request_keys').document(key_id)
    refs = [_get_transactions_collection().document() for _ in rows]

    @firestore.transactional
    def commit(transaction):
        previous = marker.get(transaction=transaction)
        if previous.exists:
            saved = previous.to_dict()
            if saved['fingerprint'] != fingerprint:
                raise HTTPException(409, 'Chave de criação já utilizada com outros dados.')
            return saved['first_id']
        for ref, row in zip(refs, rows):
            transaction.create(ref, _document(row))
        transaction.create(marker, {'fingerprint': fingerprint, 'first_id': refs[0].id, 'created_at': firestore.SERVER_TIMESTAMP})
        return refs[0].id

    first_id = commit(_get_client().transaction())
    result = get_transaction_by_id(first_id)
    if result is None:
        raise HTTPException(409, 'Lançamento já criado e posteriormente excluído. Use a lixeira.')
    return result


def _query(month_key=None, category=None, tx_type=None):
    query = _get_transactions_collection()
    for field, value in [('month_key', month_key), ('category', category), ('type', tx_type)]:
        if value:
            query = query.where(filter=FieldFilter(field, '==', value))
    return query


def get_transactions(month_key=None, category=None, tx_type=None, limit=200):
    query = _query(month_key, category, tx_type).order_by('date', direction=firestore.Query.DESCENDING)
    return [_transaction_to_dict(doc) for doc in query.limit(limit).stream()]


def get_transactions_page(month_key, limit=200, cursor=None):
    query = _query(month_key).order_by('date', direction=firestore.Query.DESCENDING).order_by('__name__', direction=firestore.Query.DESCENDING)
    if cursor:
        doc = _get_transactions_collection().document(cursor).get()
        if not doc.exists or doc.to_dict().get('month_key') != month_key:
            raise HTTPException(400, 'Cursor expirado. Atualize o extrato.')
        query = query.start_after(doc)
    docs = list(query.limit(limit + 1).stream())
    return {'items': [_transaction_to_dict(doc) for doc in docs[:limit]],
            'next_cursor': docs[limit - 1].id if len(docs) > limit else None}


def _complete(query):
    rows = [_transaction_to_dict(doc) for doc in query.limit(MAX_REPORT_ROWS + 1).stream()]
    if len(rows) > MAX_REPORT_ROWS:
        raise HTTPException(413, 'Relatório excede 10.000 registros. Selecione um período menor.')
    return sorted(rows, key=lambda row: (row['date'], row['id']), reverse=True)


def get_all_transactions(month_key=None):
    return _complete(_query(month_key))


def get_transaction_by_id(tx_id):
    doc = _get_transactions_collection().document(tx_id).get()
    return _transaction_to_dict(doc) if doc.exists else None


def update_transaction(tx_id, updates):
    ref = _get_transactions_collection().document(tx_id)
    updates = dict(updates)
    expected = updates.pop('expected_version', None)

    @firestore.transactional
    def commit(transaction):
        doc = ref.get(transaction=transaction)
        if not doc.exists:
            return False
        current = doc.to_dict()
        if expected is not None and expected != current.get('version', 0):
            raise HTTPException(409, 'Outro usuário alterou este lançamento. Atualize o extrato.')
        merged = {**current, **updates}
        try:
            finance.validate_category(merged['type'], merged['category'])
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        transaction.update(ref, {**updates, 'month_key': merged['date'][:7],
                                 'updated_at': firestore.SERVER_TIMESTAMP, 'version': current.get('version', 0) + 1})
        return True
    return _transaction_to_dict(ref.get()) if commit(_get_client().transaction()) else None


def delete_transaction(tx_id, user=None):
    ref = _get_transactions_collection().document(tx_id)
    archived = _household().collection('trash').document(tx_id)

    @firestore.transactional
    def commit(transaction):
        doc = ref.get(transaction=transaction)
        if not doc.exists:
            return False
        transaction.set(archived, {**doc.to_dict(), 'deleted_at': firestore.SERVER_TIMESTAMP,
                                   'deleted_by_uid': (user or {}).get('uid')})
        transaction.delete(ref)
        return True
    return commit(_get_client().transaction())


def restore_transaction(tx_id, user):
    ref = _get_transactions_collection().document(tx_id)
    archived = _household().collection('trash').document(tx_id)

    @firestore.transactional
    def commit(transaction):
        old = archived.get(transaction=transaction)
        current = ref.get(transaction=transaction)
        if not old.exists:
            raise HTTPException(404, 'Lançamento não encontrado na lixeira.')
        if current.exists:
            raise HTTPException(409, 'Já existe um lançamento com este identificador.')
        data = old.to_dict()
        data.pop('deleted_at', None)
        data.pop('deleted_by_uid', None)
        data.update(restored_by_uid=user['uid'], updated_at=firestore.SERVER_TIMESTAMP, version=data.get('version', 0) + 1)
        transaction.create(ref, data)
        transaction.delete(archived)
    commit(_get_client().transaction())
    return _transaction_to_dict(ref.get())


def get_trash():
    return _complete(_household().collection('trash'))


def get_month_detail(month_key):
    rows = get_all_transactions(month_key)
    return {**finance.summarize(month_key, rows), 'transactions': rows, 'by_category': finance.categories(rows)}


def get_summary_by_month(month_key):
    return finance.summarize(month_key, get_all_transactions(month_key))


def get_by_category(month_key):
    return finance.categories(get_all_transactions(month_key))


def current_month():
    return datetime.now(ZoneInfo('America/Sao_Paulo')).strftime('%Y-%m')


def get_overview(month_key, months=12):
    keys = [finance.add_months(month_key + '-01', -i)[:7] for i in range(months - 1, -1, -1)]
    query = _get_transactions_collection().where(filter=FieldFilter('month_key', '>=', keys[0]))
    query = query.where(filter=FieldFilter('month_key', '<=', keys[-1]))
    rows = _complete(query)
    grouped = {key: [] for key in keys}
    for row in rows:
        grouped[row['month_key']].append(row)
    evolution = []
    for key in keys:
        summary = finance.summarize(key, grouped[key])
        evolution.append({'month_key': key, 'income': summary['total_income'], 'expenses': summary['total_expenses'], 'balance': summary['balance']})
    selected = grouped[month_key]
    return {'summary': finance.summarize(month_key, selected), 'by_category': finance.categories(selected),
            'evolution': evolution, 'transactions': selected[:6]}


def get_monthly_evolution(months=12):
    return get_overview(current_month(), months)['evolution']


def get_available_months():
    return sorted({row['month_key'] for row in get_all_transactions()}, reverse=True)


def get_financial_context(month_key):
    overview = get_overview(month_key, 6)
    return json.dumps({'selected_month': month_key, 'summary': overview['summary'],
                       'categories': overview['by_category'], 'evolution': overview['evolution'], 'budget': None}, ensure_ascii=False)


def reserve_ai_request(day, limit):
    # Failed calls count too, preventing retry storms from defeating the budget.
    ref = _household().collection('ai_usage').document(day)

    @firestore.transactional
    def commit(transaction):
        doc = ref.get(transaction=transaction)
        count = (doc.to_dict() or {}).get('requests', 0)
        if count >= limit:
            raise HTTPException(429, 'Limite diário de IA da casa atingido.', headers={'Retry-After': '3600'})
        transaction.set(ref, {'requests': count + 1, 'updated_at': firestore.SERVER_TIMESTAMP})
    commit(_get_client().transaction())
