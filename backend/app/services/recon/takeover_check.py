"""
services/recon/takeover_check.py - deteccao de subdomain takeover (RF04, issue #8).

Fingerprint matching estilo can-i-take-over-xyz: compara o CNAME (via
dnspython) e, quando disponivel, o corpo da resposta HTTP (campo do probe
retornado pelo httpx, ver tool_wrappers/httpx_cli.py) contra
backend/data/takeover_fingerprints.json.

NOTA: o nome exato do campo de corpo no JSON do httpx (-include-response)
nao foi validado contra uma execucao real da ferramenta neste ambiente -
ver _extract_body() e ajustar se o campo vier com outro nome.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

import dns.exception
import dns.resolver

logger = logging.getLogger(__name__)

FINGERPRINTS_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent / "data" / "takeover_fingerprints.json"
)


@lru_cache(maxsize=1)
def _load_fingerprints() -> list[dict]:
    with open(FINGERPRINTS_PATH) as f:
        return json.load(f)


def _resolve_cname(hostname: str) -> str | None:
    try:
        answers = dns.resolver.resolve(hostname, "CNAME")
        return str(answers[0].target).rstrip(".")
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        # host sem CNAME - resultado legitimo, nao e erro
        return None
    except dns.exception.DNSException:
        logger.warning(
            "Falha ao resolver CNAME de %s - checagem de takeover via DNS pulada",
            hostname,
            exc_info=True,
        )
        return None


def _extract_body(probe: dict | None) -> str:
    if not probe:
        return ""
    return probe.get("response") or probe.get("body") or ""


def check_takeover(hostname: str, probe: dict | None = None) -> dict:
    """
    Retorna {"cname": str | None, "is_candidate": bool, "fingerprint": str | None}.

    `probe` e o dict retornado pelo httpx pra esse host (ver
    tool_wrappers/httpx_cli.py) - opcional, usado pra comparar o corpo da
    resposta contra os fingerprints. Sem ele, so a checagem por CNAME roda.
    """
    cname = _resolve_cname(hostname)
    body = _extract_body(probe)

    for fp in _load_fingerprints():
        cname_match = cname is not None and fp["cname_pattern"] in cname
        body_match = bool(fp.get("body_fingerprint")) and fp["body_fingerprint"] in body
        if cname_match or body_match:
            return {"cname": cname, "is_candidate": True, "fingerprint": fp["service"]}

    return {"cname": cname, "is_candidate": False, "fingerprint": None}
