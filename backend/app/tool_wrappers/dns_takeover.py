"""Checagem de risco de subdomain takeover via CNAME + fingerprints.

Lista de fingerprints em `takeover_fingerprints.json` (mesma pasta) e um
subconjunto pequeno de exemplo. Vale expandir a partir do repositorio
https://github.com/EdOverflow/can-i-take-over-xyz conforme o projeto avancar.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

import dns.exception
import dns.resolver

logger = logging.getLogger(__name__)

FINGERPRINTS_PATH = Path(__file__).resolve().parent / "takeover_fingerprints.json"


@lru_cache(maxsize=1)
def _load_fingerprints() -> list[dict]:
    with open(FINGERPRINTS_PATH) as f:
        return json.load(f)


def check_takeover(hostname: str) -> dict:
    """
    RF04 - resolve o CNAME do host e compara contra fingerprints conhecidos
    para sinalizar possivel subdomain takeover.

    Retorna {"cname": str | None, "is_candidate": bool, "fingerprint": str | None}.
    Em caso de falha real na resolucao (timeout, erro de rede - nao apenas
    "sem CNAME"), loga um warning e adiciona "error": True ao retorno, pra
    nao confundir silenciosamente uma checagem que falhou com um resultado
    negativo legitimo.
    """
    try:
        answers = dns.resolver.resolve(hostname, "CNAME")
        cname = str(answers[0].target).rstrip(".")
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        # host sem CNAME - resultado legitimo, nao e erro
        return {"cname": None, "is_candidate": False, "fingerprint": None}
    except dns.exception.DNSException:
        logger.warning(
            "Falha ao resolver CNAME de %s - checagem de takeover pulada", hostname, exc_info=True
        )
        return {"cname": None, "is_candidate": False, "fingerprint": None, "error": True}

    for fp in _load_fingerprints():
        if fp["cname_pattern"] in cname:
            return {"cname": cname, "is_candidate": True, "fingerprint": fp["service"]}

    return {"cname": cname, "is_candidate": False, "fingerprint": None}
