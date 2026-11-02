"""
core/ssrf_guard.py - validacao anti-SSRF na submissao de dominio (issue #9).

Sem isso, o backend poderia ser usado como proxy de scan contra a propria
infraestrutura interna - por exemplo, um dominio malicioso que resolve
para 169.254.169.254 (endpoint de metadata da AWS) permitiria vazar
credenciais da instancia via os proprios wrappers de recon.

NOTA: esta e a checagem basica pedida na issue #9 (resolve e bloqueia IP
privado/loopback/link-local). A issue #26 (hardening) pede protecao mais
robusta ainda (seguir redirecionamento, DNS rebinding) - nao implementada
aqui, fica como trabalho futuro.
"""

import ipaddress
import socket


class UnsafeDomainError(ValueError):
    """Dominio resolve para um IP nao publico - bloqueado por seguranca."""


def assert_domain_is_public(domain: str) -> None:
    """Levanta UnsafeDomainError se qualquer IP resolvido para `domain` nao for publico."""
    try:
        infos = socket.getaddrinfo(domain, None)
    except socket.gaierror as exc:
        raise UnsafeDomainError(f"Nao foi possivel resolver o dominio: {exc}") from exc

    for info in infos:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeDomainError(
                f"{domain} resolve para um IP nao publico ({ip_str}) - bloqueado por seguranca"
            )
