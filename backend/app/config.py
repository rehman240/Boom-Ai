"""App settings, read from environment variables (or backend/.env locally)."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env: str = "development"
    secret_key: str
    cors_origins: str = "http://localhost:3000"
    rate_limit_default: str = "120/minute"
    rate_limit_auth: str = "10/minute"  # sign up and login, per IP
    rate_limit_ai: str = "30/hour"  # AI generations, per user across all campaigns

    # Login session (signed token in an httpOnly cookie)
    session_cookie_name: str = "boooom_session"
    session_days: int = 7

    # Database
    database_url: str

    # File storage
    storage_backend: str = "local"
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_bucket: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    upload_max_mb: int = 5

    # AI
    ai_enabled: bool = True
    ai_provider: str = "mock"
    ai_model: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    ai_mock_delay_seconds: float = 2.0  # mock only: long enough to see the progress state
    ai_job_stale_minutes: int = 5  # a job active for longer than this is marked failed

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        # Hosts like Supabase and Render give "postgres://" or "postgresql://" URLs.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
