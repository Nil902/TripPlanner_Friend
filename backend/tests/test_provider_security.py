"""External integration failures must not put credentials into logs or URLs."""

from datetime import date
from typing import Any

import httpx
import pytest

from app.models.schema import Trip
from app.services import places_service, proposer


def test_gemini_uses_an_authentication_header(monkeypatch: pytest.MonkeyPatch) -> None:
    key = "synthetic-gemini-credential"
    monkeypatch.setattr(proposer.settings, "GEMINI_API_KEY", key)

    def response(request: httpx.Request) -> httpx.Response:
        assert key not in str(request.url)
        assert request.headers["x-goog-api-key"] == key
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"content": {"parts": [{"text": '{"answer":"Visit the museum."}'}]}}
                ]
            },
        )

    original = httpx.Client

    def client(**kwargs: Any) -> httpx.Client:
        return original(transport=httpx.MockTransport(response), **kwargs)

    monkeypatch.setattr(proposer.httpx, "Client", client)
    trip = Trip(
        title="Test",
        destination="Lisbon",
        creator_id="alice",
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 3),
    )
    assert (
        proposer.call_gemini_ask(trip, [], None, "Where should I visit?")
        == "Visit the museum."
    )


def test_places_failure_does_not_log_provider_response_credentials(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    key = "synthetic-maps-credential"
    monkeypatch.setattr(places_service.settings, "GOOGLE_MAPS_API_KEY", key)
    original = httpx.Client

    def client(**kwargs: Any) -> httpx.Client:
        return original(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(403, text=f"Rejected key: {key}")
            ),
            **kwargs,
        )

    monkeypatch.setattr(places_service.httpx, "Client", client)
    assert places_service.fetch_from_google_places_api("Lisbon") == []
    assert key not in caplog.text
