from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    agent_host: str = "0.0.0.0"
    agent_port: int = 8090
    agent_log_level: str = "INFO"
    agent_max_tool_loops: int = 2
    agent_default_top_k: int = 8
    agent_model: str = "gpt-4o-mini"
    agent_model_temperature: float = 0.2
    agent_enable_web_search: bool = False
    agent_openai_api_key: str = ""
    agent_openai_base_url: str | None = None

    opensearch_url: str = "http://localhost:9200"
    opensearch_news_index: str = "news_index"
    opensearch_yt_index: str = "yt_index"
    opensearch_mega_index: str = "mega_index"

    database_url: str = "postgresql://postgres:postgres@localhost:5432/infonow"
    backend_base_url: str = "http://localhost:3000"
    agent_checkpoint_schema: str = "public"


settings = Settings()
