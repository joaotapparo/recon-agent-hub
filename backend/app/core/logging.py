"""
core/logging.py - logging estruturado em JSON (issue #28, RNF08).

Cada linha vira um objeto JSON com horario, nivel, modulo e mensagem. Toda
linha emitida durante uma analise leva o `scan_id` automaticamente (via
contextvar definido em orchestrator.run_scan_job), entao da para filtrar o
log de uma analise mesmo com varias rodando. Campos passados em
`logger.info(..., extra={...})` entram no JSON. So biblioteca padrao.

    {"time": "...", "level": "WARNING", "logger": "app.services...",
     "message": "...", "scan_id": 42}

LOG_FORMAT=text no .env volta para texto legivel (util em desenvolvimento).
"""

import contextvars
import json
import logging
import sys
from datetime import UTC, datetime

scan_id_var: contextvars.ContextVar[int | None] = contextvars.ContextVar("scan_id", default=None)

# atributos que todo LogRecord ja tem: o que sobrar veio de `extra=`
_RECORD_FIELDS = set(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {
    "message",
    "asctime",
    "scan_id",
    "color_message",  # o uvicorn repete a mensagem com codigos de cor de terminal
}

# bibliotecas que logam cada requisicao HTTP em INFO: ruido no log da analise
_NOISY_LOGGERS = ("httpx", "httpcore", "google_genai", "anthropic")


class ScanContextFilter(logging.Filter):
    """Anexa o scan_id da analise em andamento (ou None) a cada registro."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.scan_id = scan_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        scan_id = getattr(record, "scan_id", None)
        if scan_id is not None:
            data["scan_id"] = scan_id
        for key, value in record.__dict__.items():
            if key not in _RECORD_FIELDS and not key.startswith("_"):
                data[key] = value
        if record.exc_info:
            data["exception"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False, default=str)


_TEXT_FORMAT = "%(asctime)s %(levelname)s %(name)s [scan=%(scan_id)s] %(message)s"


def configure_logging(level: str = "INFO", fmt: str = "json") -> None:
    """Configura o logger raiz. Pode ser chamada mais de uma vez (substitui o handler)."""
    handler = logging.StreamHandler(sys.stderr)
    handler.addFilter(ScanContextFilter())
    handler.setFormatter(JsonFormatter() if fmt == "json" else logging.Formatter(_TEXT_FORMAT))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # o uvicorn configura os proprios handlers antes de carregar o app:
    # manda tudo pelo mesmo formato
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
