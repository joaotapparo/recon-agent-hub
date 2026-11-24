"""
CORS mal configurado: o servidor devolve a origem que o atacante mandou?

Uma requisicao GET com `Origin` de um dominio que nao existe (`.invalid`
e reservado pela RFC 2606). Se a resposta autorizar essa origem, qualquer
site pode ler as respostas da API - e, com credenciais, os dados do usuario
logado.
"""

from collections.abc import Mapping

PROBE_ORIGIN = "https://recon-agent-hub-cors-check.invalid"


def analyze_cors(url: str, status_code: int, headers: Mapping[str, str]) -> dict | None:
    lower = {k.lower(): v for k, v in headers.items()}
    allow_origin = lower.get("access-control-allow-origin", "").strip()
    allow_credentials = lower.get("access-control-allow-credentials", "").strip().lower() == "true"

    if allow_origin == PROBE_ORIGIN:
        issue = "reflected_origin"
    elif allow_origin == "null":
        issue = "null_origin"
    else:
        # "*" sem credenciais e o comportamento normal de API publica; o
        # navegador ja recusa "*" junto com credenciais.
        return None

    return {
        "url": url,
        "status_code": status_code,
        "issue": issue,
        "probe_origin": PROBE_ORIGIN,
        "access_control_allow_origin": allow_origin,
        "access_control_allow_credentials": allow_credentials,
    }
