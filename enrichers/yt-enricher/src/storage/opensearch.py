import logging
from typing import List

from opensearchpy import OpenSearch, helpers

from ..models import OpenSearchDocument

logger = logging.getLogger(__name__)


class OpenSearchStorage:
    def __init__(self, url: str, index_name: str, embedding_dimension: int = 768):
        self.index_name = index_name
        self.embedding_dimension = embedding_dimension

        parsed = url.replace("http://", "").replace("https://", "")
        host, port = parsed.split(":") if ":" in parsed else (parsed, 9200)

        self.client = OpenSearch(
            hosts=[{"host": host, "port": int(port)}],
            http_compress=True,
            use_ssl=False,
            verify_certs=False,
            ssl_show_warn=False,
        )

    def create_index_if_not_exists(self):
        if self.client.indices.exists(index=self.index_name):
            logger.info("Index %s already exists", self.index_name)
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
                    "topic": {"type": "keyword"},
                    "subtopic": {"type": "keyword"},
                    "title": {"type": "text", "analyzer": "standard"},
                    "video_id": {"type": "keyword"},
                    "channel_id": {"type": "keyword"},
                    "channel_title": {"type": "text", "analyzer": "standard"},
                    "published_at": {"type": "date"},
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
        logger.info("Created index %s", self.index_name)

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

        success, failed = helpers.bulk(self.client, actions, raise_on_error=False)
        logger.info("Indexed %d documents, %d failed", success, len(failed))

    def close(self):
        self.client.close()
