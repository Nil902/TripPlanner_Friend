"""Remove credentials from HTTP request logs before handlers format them."""

import logging
import re
from collections.abc import Iterable

from app.core.config import settings


class SecretRedactionFilter(logging.Filter):
    def __init__(self, secrets: Iterable[str]) -> None:
        super().__init__()
        self.secrets = tuple(secret for secret in secrets if secret)

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for secret in self.secrets:
            message = message.replace(secret, "[REDACTED]")
        message = re.sub(
            r"([?&](?:key|api_key|access_token)=)[^&\s\"']+",
            r"\1[REDACTED]",
            message,
            flags=re.IGNORECASE,
        )
        record.msg, record.args = message, ()
        return True


def install_secret_redaction() -> None:
    redaction = SecretRedactionFilter(
        (
            settings.GOOGLE_MAPS_API_KEY,
            settings.GEMINI_API_KEY,
            settings.OPENAI_API_KEY,
            settings.DATABASE_URL,
        )
    )
    for name in (
        "httpx",
        "httpcore.http11",
        "httpcore.http2",
        "httpcore.connection",
        "httpcore.proxy",
        "httpcore.socks",
        "app.services.proposer",
        "app.services.places_service",
    ):
        logger = logging.getLogger(name)
        if not any(isinstance(item, SecretRedactionFilter) for item in logger.filters):
            logger.addFilter(redaction)
