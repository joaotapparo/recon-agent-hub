"""
Firewall de aplicacao (WAF) / CDN de protecao na frente do site.

Deteccao passiva: so olha os cabecalhos e cookies da resposta que a
auditoria ja buscou. Nao envia payload de ataque pra provocar bloqueio
(o que ferramentas como wafw00f fazem) - nao e o tipo de teste deste projeto.
Por isso "nenhum detectado" significa "nenhuma assinatura conhecida", nao
garantia de que nao exista protecao.
"""

from collections.abc import Mapping

# (nome, cabecalhos que denunciam, trechos do valor de Server, prefixos de cookie)
_SIGNATURES: list[tuple[str, tuple[str, ...], tuple[str, ...], tuple[str, ...]]] = [
    ("Cloudflare", ("cf-ray", "cf-cache-status"), ("cloudflare",), ("__cf_bm", "__cflb", "cf_clearance")),
    ("Akamai", ("akamai-grn", "x-akamai-transformed", "akamai-cache-status"), ("akamaighost", "akamai"), ("ak_bmsc", "bm_sz")),
    ("AWS CloudFront", ("x-amz-cf-id", "x-amz-cf-pop"), ("cloudfront",), ("aws-waf-token",)),
    ("Imperva / Incapsula", ("x-iinfo", "x-cdn"), ("incapsula",), ("incap_ses", "visid_incap", "nlbi_")),
    ("Sucuri", ("x-sucuri-id", "x-sucuri-cache"), ("sucuri", "cloudproxy"), ()),
    ("F5 BIG-IP", ("x-wa-info",), ("bigip", "big-ip"), ("bigipserver", "ts01")),
    ("Fastly", ("x-fastly-request-id",), ("fastly",), ()),
    ("Azure Front Door", ("x-azure-ref", "x-fd-healthprobe"), (), ()),
    ("Barracuda", (), ("barracuda",), ("barra_counter_session",)),
    ("FortiWeb", (), ("fortiweb",), ("fortiwafsid",)),
    ("Vercel", ("x-vercel-id",), ("vercel",), ()),
]


def detect_waf(headers: Mapping[str, str], set_cookies: list[str]) -> str | None:
    lower = {k.lower(): v.lower() for k, v in headers.items()}
    server = lower.get("server", "") + " " + lower.get("via", "")
    cookies = [c.split("=", 1)[0].strip().lower() for c in set_cookies]
    for name, header_keys, server_hints, cookie_prefixes in _SIGNATURES:
        if any(h in lower for h in header_keys):
            return name
        if any(hint in server for hint in server_hints):
            return name
        if any(c.startswith(p) for c in cookies for p in cookie_prefixes):
            return name
    return None
