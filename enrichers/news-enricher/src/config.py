from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Logging settings
    log_level: str = "INFO"
    log_format: str = "json"

    # Kafka settings
    kafka_brokers: str = "localhost:9092"
    kafka_consumer_group: str = "enricher-news"
    kafka_input_topic: str = "process.news.clean"

    # Database settings
    database_url: str

    # OpenSearch settings
    opensearch_url: str = "http://localhost:9200"
    opensearch_index: str = "news_index"

    # Ollama settings
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "nomic-embed-text"
    ollama_summary_model: str = "llama3.2"
    embedding_dimension: int = 768
    summary_input_max_chars: int = 12000

    # Processing settings
    max_chunk_tokens: int = 512
    scraper_workers: int = 10
    scraper_timeout_seconds: int = 10
    scraper_max_retries: int = 2
    scraper_backoff_seconds: float = 0.75
    scraper_min_content_chars: int = 100
    scraper_user_agent: str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    scraper_extractor_order: str = "trafilatura,heuristic"
    batch_size: int = 10

    # Outbox publisher settings
    outbox_poll_interval: float = 1.0  # seconds
    outbox_batch_size: int = 100
    outbox_max_retries: int = 3

    @property
    def kafka_brokers_list(self) -> List[str]:
        return self.kafka_brokers.split(",")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
