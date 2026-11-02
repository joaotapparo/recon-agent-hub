"""core/domain_validation.py - validacao de formato de dominio (issue #9)."""

import re

_DOMAIN_RE = re.compile(r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$")


class InvalidDomainFormatError(ValueError):
    """Dominio nao tem formato valido de hostname."""


def assert_valid_domain_format(domain: str) -> None:
    """Levanta InvalidDomainFormatError se `domain` nao parecer um hostname valido."""
    if len(domain) > 253 or not _DOMAIN_RE.match(domain):
        raise InvalidDomainFormatError(f"'{domain}' nao e um formato de dominio valido")
