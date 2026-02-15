import json
import logging
from typing import List, Optional
from kafka import KafkaConsumer as KafkaClient

from .models import CleanNewsPoint

logger = logging.getLogger(__name__)


class KafkaConsumer:
    """Kafka consumer for clean news articles"""

    def __init__(self, brokers: List[str], topic: str, group_id: str):
        self.topic = topic
        self.consumer = KafkaClient(
            topic,
            bootstrap_servers=brokers,
            group_id=group_id,
            auto_offset_reset="earliest",
            enable_auto_commit=False,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            max_poll_records=10,
            consumer_timeout_ms=5000,  # 5 second timeout for polling
        )
        logger.info(f"Kafka consumer initialized for topic: {topic}")

    def fetch_one(self) -> Optional[CleanNewsPoint]:
        """Fetch a single message from Kafka without committing offset"""
        try:
            records = self.consumer.poll(timeout_ms=5000, max_records=1)

            for topic_partition, partition_records in records.items():
                for record in partition_records:
                    try:
                        return CleanNewsPoint(**record.value)
                    except Exception as e:
                        logger.error(f"Failed to parse message: {e}")

            return None

        except Exception as e:
            logger.error(f"Error fetching from Kafka: {e}")
            return None

    def commit(self):
        """Commit current offsets"""
        try:
            self.consumer.commit()
            logger.debug("Committed Kafka offsets")
        except Exception as e:
            logger.error(f"Error committing offsets: {e}")

    def close(self):
        """Close the consumer"""
        self.consumer.close()
        logger.info("Kafka consumer closed")
