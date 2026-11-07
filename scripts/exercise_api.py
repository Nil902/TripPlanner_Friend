"""Exercise writes only against a disposable local production test service."""

import argparse
import uuid
from urllib.parse import urlsplit

import httpx


def exercise(base_url: str) -> None:
    if urlsplit(base_url).hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("Write verification is limited to a disposable local service.")
    with httpx.Client(base_url=base_url, timeout=120) as client:
        suffix = uuid.uuid4().hex
        credentials = {
            "email": f"release-{suffix}@example.invalid",
            "password": "release-test-password-123",
        }
        signup = client.post(
            "/api/v1/auth/signup", json={**credentials, "name": "Release test owner"}
        )
        assert signup.status_code == 201, "Signup failed"
        login = client.post("/api/v1/auth/login", json=credentials)
        assert login.status_code == 200, "Login failed"
        user_id = login.json()["user"]["id"]
        owner = {"Authorization": f"Bearer {login.json()['token']}"}
        created = client.post(
            "/api/v1/trips",
            headers=owner,
            json={
                "title": "Disposable release test",
                "destination": "Lisbon",
                "start_date": "2026-11-01",
                "end_date": "2026-11-03",
            },
        )
        assert created.status_code == 201, "Trip creation failed"
        trip_id = created.json()["id"]
        root = f"/api/v1/trips/{trip_id}"
        assert client.get("/api/v1/trips").status_code == 401
        assert any(
            trip["id"] == trip_id
            for trip in client.get("/api/v1/trips", headers=owner).json()
        )

        joined = client.post(
            root + "/join", json={"name": "Release test guest", "user_id": user_id}
        )
        assert joined.status_code == 200, "Invitation join failed"
        guest_id = joined.json()["id"]
        assert guest_id != user_id
        guest = {"Authorization": f"Bearer {joined.json()['session_token']}"}
        assert client.get(root, headers=guest).status_code == 200
        assert client.post(root + "/plan", headers=guest).status_code == 403
        for identity, member_id in ((owner, user_id), (guest, guest_id)):
            response = client.post(
                root + "/constraints",
                headers=identity,
                json={"user_id": member_id, "budget_per_day": 80},
            )
            assert response.status_code == 200, "Member preferences were not saved"
        assert (
            client.post(
                root + "/constraints",
                headers=guest,
                json={"user_id": user_id, "budget_per_day": 1},
            ).status_code
            == 403
        )

        generated = client.post(root + "/plan", headers=owner)
        assert generated.status_code == 200, "Planning failed"
        plan = generated.json()
        assert plan["version"] == 1
        item = plan["days"][0]["items"][0]
        updated = client.put(
            root + f"/plan/items/{item['id']}",
            headers=owner,
            json={"place_name": "Private release-test stop", "cost": 3},
        )
        assert updated.status_code == 200, "Stop update failed"
        assert updated.json()["place_id"] != item["place_id"]
        previous = client.get(root + "/plan?version=1", headers=owner).json()
        rebalance = client.post(
            root + "/rebalance",
            headers=owner,
            json={
                "type": "weather_alert",
                "day_index": 1,
                "description": "Release-test rain",
            },
        )
        assert rebalance.status_code == 200, "Rebalance failed"
        assert rebalance.json()["version"] == 2
        assert client.get(root + "/plan?version=1", headers=owner).json() == previous
        calendar = client.get(root + "/plan/export.ics", headers=guest)
        assert calendar.status_code == 200 and "BEGIN:VCALENDAR" in calendar.text

        expense = client.post(
            root + "/expenses",
            headers=owner,
            json={
                "paid_by": user_id,
                "amount": 25,
                "description": "Disposable test lunch",
                "split_between": [user_id, guest_id],
            },
        )
        assert expense.status_code == 201, "Expense creation failed"
        report = client.get(root + "/expenses/settle-up", headers=guest)
        assert report.status_code == 200
        assert (
            abs(sum(row["net_balance"] for row in report.json()["user_balances"]))
            < 0.01
        )
        assert client.delete(root, headers=guest).status_code == 403
        assert client.delete(root, headers=owner).status_code == 204
        assert client.get(root, headers=owner).status_code == 404
    print("Authenticated PostgreSQL lifecycle checks passed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    exercise(parser.parse_args().url)
