import logging
from typing import List
from opensearchpy import OpenSearch, helpers

from ..models import OpenSearchDocument

logger = logging.getLogger(__name__)


class OpenSearchStorage:
    """OpenSearch client for indexing enriched article chunks"""

    def __init__(self, url: str, index_name: str, embedding_dimension: int = 768):
        self.index_name = index_name
        self.embedding_dimension = embedding_dimension

        # Parse URL for host and port
        url = url.replace("http://", "").replace("https://", "")
        host, port = url.split(":") if ":" in url else (url, 9200)

        self.client = OpenSearch(
            hosts=[{"host": host, "port": int(port)}],
            http_compress=True,
            use_ssl=False,
            verify_certs=False,
            ssl_show_warn=False,
        )

    def create_index_if_not_exists(self):
        """Create the index with proper mappings if it doesn't exist"""
        if self.client.indices.exists(index=self.index_name):
            logger.info(f"Index {self.index_name} already exists")
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
                    "url": {"type": "keyword"},
                    "source_name": {"type": "keyword"},
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
        logger.info(f"Created index {self.index_name}")

    def index_documents(self, documents: List[OpenSearchDocument]):
        """Bulk index documents to OpenSearch"""
        if not documents:
            return

        actions = [
            {
                "_index": self.index_name,
                "_id": f"{doc.data_id}_{doc.chunk_index}",
                "_source": doc.model_dump(),
            }
            for doc in documents
        ]

        try:
            success, failed = helpers.bulk(self.client, actions, raise_on_error=False)
            logger.info(f"Indexed {success} documents, {len(failed)} failed")
            if failed:
                for item in failed[:5]:  # Log first 5 failures
                    logger.error(f"Failed to index: {item}")
        except Exception as e:
            logger.error(f"Error bulk indexing: {e}")
            raise

    def search_similar(
        self, embedding: List[float], k: int = 10, filters: dict = None
    ) -> List[dict]:
        """Search for similar documents using vector similarity"""
        query = {
            "size": k,
            "query": {
                "knn": {
                    "embedding": {
                        "vector": embedding,
                        "k": k,
                    }
                }
            },
        }

        if filters:
            query["query"] = {
                "bool": {
                    "must": [query["query"]],
                    "filter": [{"term": {k: v}} for k, v in filters.items()],
                }
            }

        response = self.client.search(index=self.index_name, body=query)
        return [hit["_source"] for hit in response["hits"]["hits"]]

    def close(self):
        """Close the OpenSearch client"""
        self.client.close()
