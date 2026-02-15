import json
import logging
from typing import List, Optional

from kafka import KafkaConsumer as KafkaClient

from .models import CleanYoutubePoint

logger = logging.getLogger(__name__)


class KafkaConsumer:
    def __init__(self, brokers: List[str], topic: str, group_id: str):
        self.consumer = KafkaClient(
            topic,
            bootstrap_servers=brokers,
            group_id=group_id,
            auto_offset_reset="earliest",
            enable_auto_commit=False,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            max_poll_records=10,
            consumer_timeout_ms=5000,
        )
        logger.info("Kafka consumer initialized for topic: %s", topic)

    def fetch_one(self) -> Optional[CleanYoutubePoint]:
        try:
            records = self.consumer.poll(timeout_ms=5000, max_records=1)
            for _, partition_records in records.items():
                for record in partition_records:
                    try:
                        return CleanYoutubePoint(**record.value)
                    except Exception as exc:
                        logger.error("Failed to parse youtube message: %s", exc)
            return None
        except Exception as exc:
            logger.error("Error fetching youtube messages: %s", exc)
            return None

    def commit(self):
        try:
            self.consumer.commit()
        except Exception as exc:
            logger.error("Error committing youtube offsets: %s", exc)

    def close(self):
        self.consumer.close()
        logger.info("Kafka consumer closed")
