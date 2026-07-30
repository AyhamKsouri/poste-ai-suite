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

    @property
    def ai_enabled(self) -> bool:
        return bool(self.groq_api_key.strip())


settings = Settings()
