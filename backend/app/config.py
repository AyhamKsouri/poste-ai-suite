from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    secret_key: str = "dev-only-secret-change-me"
    access_token_expire_minutes: int = 480

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    database_url: str = "sqlite:///./data/poste.db"
    upload_dir: str = "./data/uploads"

    admin_email: str = "admin@poste.tn"
    admin_password: str = "admin123"

    # Comma-separated list. Defaults to the native dev workflow's Vite origins;
    # Docker Compose adds the frontend container's origin via this env var
    # instead of hardcoding it into the app.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.groq_api_key.strip())

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
