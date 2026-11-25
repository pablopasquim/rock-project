"""Exercise repository behavior, mocking only the Firestore transport."""
from copy import deepcopy
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from backend.services import firestore_service as fs


class Snapshot:
    def __init__(self, ref, data):
        self.reference, self.id, self.exists = ref, ref.id, data is not None
        self._data = deepcopy(data)
    def to_dict(self):
        return deepcopy(self._data)


class Ref:
    def __init__(self, db, path):
        self.db, self.path, self.id = db, path, path.split('/')[-1]
    def collection(self, name):
        return Collection(self.db, self.path + '/' + name)
    def get(self, transaction=None):
        return Snapshot(self, self.db.rows.get(self.path))


class Collection(Ref):
    def document(self, name=None):
        self.db.counter += 1
        return Ref(self.db, self.path + '/' + (name or f'new-{self.db.counter}'))


class Transaction:
    def __init__(self, db): self.db = db
    def set(self, ref, data): self.db.rows[ref.path] = deepcopy(data)
    def create(self, ref, data):
        assert ref.path not in self.db.rows
        self.set(ref, data)
    def delete(self, ref): self.db.rows.pop(ref.path, None)
    def update(self, ref, data): self.db.rows[ref.path].update(deepcopy(data))


@pytest.fixture
def repository(monkeypatch):
    db = SimpleNamespace(rows={}, counter=0)
    db.collection = lambda name: Collection(db, name)
    db.transaction = lambda: Transaction(db)
    monkeypatch.setattr(fs, '_get_client', lambda: db)
    monkeypatch.setattr(fs.firestore, 'transactional', lambda fn: fn)
    monkeypatch.setenv('HOUSEHOLD_ID', 'test-house')
    return db


ROW = dict(type='expense', amount=1, amount_cents=100, category='outros', description='Teste', date='2026-09-16')


def test_idempotent_retry_and_conflict(repository):
    first = fs.create_idempotent([ROW], 'owner', 'same-key', ROW)
    second = fs.create_idempotent([ROW], 'owner', 'same-key', ROW)
    assert first['id'] == second['id']
    assert len([k for k in repository.rows if '/transactions/' in k]) == 1
    with pytest.raises(HTTPException) as exc:
        fs.create_idempotent([{**ROW, 'amount': 2}], 'owner', 'same-key', {**ROW, 'amount': 2})
    assert exc.value.status_code == 409


def test_delete_restore_preserves_data(repository):
    created = fs.create_idempotent([ROW], 'owner', 'unique-key', ROW)
    assert fs.delete_transaction(created['id'], {'uid': 'owner'})
    assert fs.get_transaction_by_id(created['id']) is None
    restored = fs.restore_transaction(created['id'], {'uid': 'owner'})
    assert restored['amount_cents'] == 100
    assert restored['description'] == 'Teste'
    assert restored['restored_by_uid'] == 'owner'


def test_daily_ai_budget_survives_repeated_requests(repository):
    fs.reserve_ai_request('2026-09-16', 2)
    fs.reserve_ai_request('2026-09-16', 2)
    with pytest.raises(HTTPException) as exc:
        fs.reserve_ai_request('2026-09-16', 2)
    assert exc.value.status_code == 429
    fs.reserve_ai_request('2026-09-17', 2)


def test_stale_update_rejected(repository):
    created = fs.create_idempotent([ROW], 'owner', 'version-key', ROW)
    fs.update_transaction(created['id'], {'description': 'Primeira', 'expected_version': 0})
    with pytest.raises(HTTPException) as exc:
        fs.update_transaction(created['id'], {'description': 'Segunda', 'expected_version': 0})
    assert exc.value.status_code == 409
