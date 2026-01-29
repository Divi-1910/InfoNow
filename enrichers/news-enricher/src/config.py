from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Kafka settings
    kafka_brokers: str = "localhost:9092"
    kafka_consumer_group: str = "enricher-news"
    kafka_input_topic: str = "process.news.clean"

    # Database settings
    database_url: str

    # OpenSearch settings
    opensearch_url: str = "http://localhost:9200"
    opensearch_index: str = "news-enriched"

    # Ollama settings
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "nomic-embed-text"
    embedding_dimension: int = 768

    # Processing settings
    max_chunk_tokens: int = 512
    scraper_workers: int = 10
    scraper_timeout_seconds: int = 10
    batch_size: int = 10

    @property
    def kafka_brokers_list(self) -> List[str]:
        return self.kafka_brokers.split(",")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
