"""Checagem de risco de subdomain takeover via CNAME + fingerprints.

Lista de fingerprints em `takeover_fingerprints.json` (mesma pasta) e um
subconjunto pequeno de exemplo. Vale expandir a partir do repositorio
https://github.com/EdOverflow/can-i-take-over-xyz conforme o projeto avancar.
"""

import json
from functools import lru_cache
from pathlib import Path

import dns.resolver

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
    """
    try:
        answers = dns.resolver.resolve(hostname, "CNAME")
        cname = str(answers[0].target).rstrip(".")
    except Exception:
        return {"cname": None, "is_candidate": False, "fingerprint": None}

    for fp in _load_fingerprints():
        if fp["cname_pattern"] in cname:
            return {"cname": cname, "is_candidate": True, "fingerprint": fp["service"]}

    return {"cname": cname, "is_candidate": False, "fingerprint": None}
