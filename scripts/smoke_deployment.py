"""Verify a deployed container without sending credentials or creating records."""

import argparse
import json
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


def fetch(base: str, path: str, method: str = "GET") -> tuple[int, str, str]:
    request = Request(urljoin(base, path), method=method)
    try:
        with urlopen(request, timeout=10) as response:
            return (
                response.status,
                response.headers.get_content_type(),
                response.read().decode(),
            )
    except HTTPError as exc:
        return exc.code, exc.headers.get_content_type(), exc.read().decode()


def verify(base: str, require_auth: bool) -> None:
    deadline = time.monotonic() + 90
    while True:
        try:
            code, _, body = fetch(base, "/readyz")
            if code == 200 and json.loads(body).get("status") == "ready":
                break
        except (OSError, URLError, ValueError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError("The deployment did not become database-ready.")
        time.sleep(2)

    code, content_type, html = fetch(base, "/")
    if code != 200 or content_type != "text/html" or '<div id="root">' not in html:
        raise RuntimeError("The production frontend is not being served.")
    scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
    if not scripts or any(fetch(base, script)[0] != 200 for script in scripts):
        raise RuntimeError("The frontend JavaScript bundle is unavailable.")
    if fetch(base, "/room?trip=smoke-test")[0] != 200:
        raise RuntimeError("Frontend deep links are unavailable.")
    if fetch(base, "/api/v1/not-a-route")[0] != 404:
        raise RuntimeError("Unknown API routes must return 404.")
    if fetch(base, "/assets/not-a-bundle.js")[0] != 404:
        raise RuntimeError("Missing static assets must return 404.")
    if require_auth and fetch(base, "/api/v1/trips")[0] != 401:
        raise RuntimeError(
            "Production deployment blocked: unauthenticated trip listing is allowed. "
            "Apply the reviewed authorization fixes before publishing."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--require-auth", action="store_true")
    args = parser.parse_args()
    try:
        verify(args.url, args.require_auth)
    except (RuntimeError, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print("Deployment checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
