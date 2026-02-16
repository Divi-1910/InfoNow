import json
import logging
import os
from datetime import datetime, timezone
from typing import Any


_BASE_FIELDS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "message",
    "asctime",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        record_message = record.getMessage()
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "service": "news-enricher",
            "message": record_message,
        }

        event = getattr(record, "event", None)
        if event:
            payload["event"] = event

        for key, value in record.__dict__.items():
            if key in _BASE_FIELDS or key.startswith("_"):
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(log_level: str = "INFO", log_format: str = "json") -> None:
    level = getattr(logging, (log_level or "INFO").upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(level)

    handler = logging.StreamHandler()
    if (log_format or "json").lower() == "text":
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s"
        )
    else:
        formatter = JsonFormatter()
    handler.setFormatter(formatter)

    root_logger.addHandler(handler)

    third_party_level = logging.INFO if level <= logging.DEBUG else logging.WARNING
    logging.getLogger("kafka").setLevel(third_party_level)
    logging.getLogger("opensearch").setLevel(third_party_level)
    logging.getLogger("httpx").setLevel(third_party_level)
    logging.getLogger("httpcore").setLevel(third_party_level)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    os.environ["PYTHONUNBUFFERED"] = "1"
