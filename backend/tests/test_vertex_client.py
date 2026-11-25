from unittest.mock import patch

import pytest

from backend.services import gemini_service


def test_client_uses_vertex_ai_with_project_and_location(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "proj-x")
    monkeypatch.setenv("VERTEX_LOCATION", "europe-west1")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with patch.object(gemini_service.genai, "Client") as client_cls:
        gemini_service._get_client()
    kwargs = client_cls.call_args.kwargs
    assert kwargs["vertexai"] is True
    assert kwargs["project"] == "proj-x"
    assert kwargs["location"] == "europe-west1"
    assert "api_key" not in kwargs


def test_client_defaults_location_to_global(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "proj-x")
    monkeypatch.delenv("VERTEX_LOCATION", raising=False)
    with patch.object(gemini_service.genai, "Client") as client_cls:
        gemini_service._get_client()
    assert client_cls.call_args.kwargs["location"] == "global"


def test_client_requires_project(monkeypatch):
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    with pytest.raises(ValueError):
        gemini_service._get_client()
