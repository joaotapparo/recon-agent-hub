from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = f"sqlite:///{DATA_DIR / 'recon.db'}"
    data_dir: Path = DATA_DIR
    scans_dir: Path = DATA_DIR / "scans"

    ai_triage_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    gemini_temperature: float = 0.2
    gemini_timeout_seconds: int = Field(default=30, gt=0)

    subfinder_path: str = "subfinder"
    httpx_path: str = "httpx"
    nmap_path: str = "nmap"
    gitleaks_path: str = "gitleaks"

    tool_timeout_seconds: int = 300
    max_concurrent_scans: int = 1

    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.scans_dir.mkdir(parents=True, exist_ok=True)
