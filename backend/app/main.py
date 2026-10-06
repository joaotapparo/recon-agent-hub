from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app import (
    models,  # noqa: F401 - garante que os models sao registrados no Base.metadata
)
from app.config import settings
from app.routers import domains, scans
from app.workers.job_runner import recover_orphaned_jobs, start_worker

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    recover_orphaned_jobs()  # issue #27
    worker_task = start_worker()  # issue #6
    yield
    worker_task.cancel()


app = FastAPI(title="recon-agent-hub API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(domains.router)
app.include_router(scans.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/test-harness", response_class=HTMLResponse, include_in_schema=False)
def test_harness() -> str:
    """
    Pagina de teste manual do modulo Infraestrutura (sem build, sem
    dependencia externa) - NAO e o painel oficial do projeto, que e
    responsabilidade de outro modulo (issues #22-#25). Serve so pra
    validar a API sem precisar de curl.
    """
    return (STATIC_DIR / "test_harness.html").read_text()
