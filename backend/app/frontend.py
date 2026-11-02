"""
frontend.py - serve o build do painel (frontend/dist) pela propria API.

Assim painel e API ficam na mesma origem/porta em producao (sem CORS e sem
abrir outra porta). Em dev o frontend roda no Vite e isto fica inativo, pois
frontend/dist nao existe ate alguem rodar `pnpm build`.
"""

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

DEFAULT_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def mount_frontend(app: FastAPI, dist: Path = DEFAULT_DIST) -> bool:
    """Registra a rota catch-all do SPA. Deve ser chamada depois das rotas da API."""
    index = dist / "index.html"
    if not index.is_file():
        logger.info("frontend nao encontrado em %s; servindo so a API", dist)
        return False
    root = dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        # rota de API inexistente deve continuar dando 404, nao o index.html
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        if path:
            candidate = (root / path).resolve()
            if candidate.is_relative_to(root) and candidate.is_file():
                return FileResponse(candidate)
        # rotas do react-router (/, /dashboard...) caem no index.html
        return FileResponse(index)

    logger.info("servindo frontend de %s", dist)
    return True
