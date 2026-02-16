import json
import logging
from typing import List, Optional

from kafka import KafkaConsumer as KafkaClient

from .models import CleanYoutubePoint

logger = logging.getLogger(__name__)


class KafkaConsumer:
    def __init__(self, brokers: List[str], topic: str, group_id: str):
        self.topic = topic
        self.group_id = group_id
        self.last_message_meta: Optional[dict] = None
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
        logger.info(
            "Kafka consumer initialized",
            extra={"event": "kafka_consumer_initialized", "topic": topic, "group_id": group_id},
        )

    def fetch_one(self) -> Optional[CleanYoutubePoint]:
        try:
            records = self.consumer.poll(timeout_ms=5000, max_records=1)
            for topic_partition, partition_records in records.items():
                for record in partition_records:
                    try:
                        parsed = CleanYoutubePoint(**record.value)
                        self.last_message_meta = {
                            "topic": topic_partition.topic,
                            "partition": topic_partition.partition,
                            "offset": record.offset,
                            "key": (record.key.decode("utf-8", errors="ignore") if record.key else None),
                            "data_point_id": getattr(parsed, "data_point_id", None),
                            "video_id": getattr(parsed, "video_id", None),
                        }
                        logger.debug(
                            "Fetched Kafka message",
                            extra={"event": "kafka_message_fetched", **self.last_message_meta},
                        )
                        return parsed
                    except Exception as exc:
                        logger.error(
                            "Failed to parse youtube message",
                            extra={
                                "event": "kafka_message_parse_failed",
                                "topic": topic_partition.topic,
                                "partition": topic_partition.partition,
                                "offset": record.offset,
                                "error": str(exc),
                            },
                        )
            return None
        except Exception as exc:
            logger.error(
                "Error fetching youtube messages",
                extra={"event": "kafka_fetch_failed", "topic": self.topic, "error": str(exc)},
            )
            return None

    def commit(self):
        try:
            self.consumer.commit()
            meta = self.last_message_meta or {}
            logger.info("Committed Kafka offsets", extra={"event": "kafka_offsets_committed", **meta})
        except Exception as exc:
            logger.error(
                "Error committing youtube offsets",
                extra={"event": "kafka_commit_failed", "topic": self.topic, "error": str(exc)},
            )

    def close(self):
        self.consumer.close()
        logger.info(
            "Kafka consumer closed",
            extra={"event": "kafka_consumer_closed", "topic": self.topic, "group_id": self.group_id},
        )
