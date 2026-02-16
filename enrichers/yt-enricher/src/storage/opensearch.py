import logging
from typing import List

from opensearchpy import OpenSearch, helpers

from ..models import OpenSearchDocument, MegaDocument

logger = logging.getLogger(__name__)

MEGA_INDEX = "mega_index"


def _build_client(url: str) -> OpenSearch:
    parsed = url.replace("http://", "").replace("https://", "")
    host, port = parsed.split(":") if ":" in parsed else (parsed, 9200)
    return OpenSearch(
        hosts=[{"host": host, "port": int(port)}],
        http_compress=True,
        use_ssl=False,
        verify_certs=False,
        ssl_show_warn=False,
    )


class OpenSearchStorage:
    """OpenSearch client for indexing enriched video chunks to yt_index"""

    def __init__(self, url: str, index_name: str, embedding_dimension: int = 768):
        self.index_name = index_name
        self.embedding_dimension = embedding_dimension
        self.client = _build_client(url)

    def create_index_if_not_exists(self):
        if self.client.indices.exists(index=self.index_name):
            logger.info(
                "OpenSearch index already exists",
                extra={"event": "opensearch_index_exists", "index": self.index_name},
            )
            return

        index_body = {
            "settings": {
                "index": {
                    "knn": True,
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                }
            },
            "mappings": {
                "properties": {
                    "data_id": {"type": "keyword"},
                    "data_point_id": {"type": "keyword"},
                    "source_type": {"type": "keyword"},
                    "topic_id": {"type": "integer"},
                    "topic_name": {"type": "keyword"},
                    "topic_slug": {"type": "keyword"},
                    "subtopic_id": {"type": "integer"},
                    "subtopic_name": {"type": "keyword"},
                    "subtopic_slug": {"type": "keyword"},
                    "title": {"type": "text", "analyzer": "standard"},
                    "description": {"type": "text", "analyzer": "standard"},
                    "video_id": {"type": "keyword"},
                    "channel_id": {"type": "keyword"},
                    "channel_title": {"type": "text", "analyzer": "standard"},
                    "thumbnail_url": {"type": "keyword", "index": False},
                    "published_at": {"type": "date"},
                    "fetch_timestamp": {"type": "date"},
                    "duration": {"type": "keyword", "index": False},
                    "view_count": {"type": "long"},
                    "like_count": {"type": "long"},
                    "summary": {"type": "text", "analyzer": "standard"},
                    "chunk_index": {"type": "integer"},
                    "content": {"type": "text", "analyzer": "standard"},
                    "embedding": {
                        "type": "knn_vector",
                        "dimension": self.embedding_dimension,
                        "method": {
                            "name": "hnsw",
                            "space_type": "cosinesimil",
                            "engine": "nmslib",
                            "parameters": {"ef_construction": 128, "m": 24},
                        },
                    },
                }
            },
        }

        self.client.indices.create(index=self.index_name, body=index_body)
        logger.info(
            "Created OpenSearch index",
            extra={"event": "opensearch_index_created", "index": self.index_name},
        )

    def index_documents(self, documents: List[OpenSearchDocument]):
        if not documents:
            return

        actions = [
            {
                "_index": self.index_name,
                "_id": f"{doc.data_id}_{doc.chunk_index}",
                "_source": doc.model_dump(mode="json"),
            }
            for doc in documents
        ]

        try:
            success, failed = helpers.bulk(self.client, actions, raise_on_error=False)
            logger.info(
                "Indexed chunk documents in OpenSearch",
                extra={
                    "event": "opensearch_bulk_indexed",
                    "index": self.index_name,
                    "success_count": success,
                    "failed_count": len(failed),
                },
            )
            if failed:
                for item in failed[:5]:
                    logger.error(
                        "Failed to index chunk document",
                        extra={"event": "opensearch_bulk_item_failed", "index": self.index_name, "item": item},
                    )
        except Exception as exc:
            logger.error(
                "Error during OpenSearch bulk indexing",
                extra={"event": "opensearch_bulk_failed", "index": self.index_name, "error": str(exc)},
            )
            raise

    def close(self):
        self.client.close()


class MegaOpenSearchStorage:
    """OpenSearch client for upserting complete documents to mega_index"""

    def __init__(self, url: str):
        self.client = _build_client(url)

    def upsert_document(self, doc: MegaDocument):
        """Upsert a document to mega_index using the data_point_id as the document ID"""
        try:
            self.client.index(
                index=MEGA_INDEX,
                id=doc.data_point_id,
                body=doc.model_dump(mode="json"),
            )
            logger.debug(
                "Upserted mega document",
                extra={"event": "opensearch_mega_upserted", "index": MEGA_INDEX, "data_point_id": doc.data_point_id},
            )
        except Exception as e:
            logger.error(
                "Failed to upsert mega document",
                extra={
                    "event": "opensearch_mega_upsert_failed",
                    "index": MEGA_INDEX,
                    "data_point_id": doc.data_point_id,
                    "error": str(e),
                },
            )
            raise

    def close(self):
        self.client.close()
