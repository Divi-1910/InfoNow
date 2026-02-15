import logging
from typing import List
from opensearchpy import OpenSearch, helpers

from ..models import OpenSearchDocument, MegaDocument

logger = logging.getLogger(__name__)

MEGA_INDEX = "mega_index"


def _build_client(url: str) -> OpenSearch:
    url = url.replace("http://", "").replace("https://", "")
    host, port = url.split(":") if ":" in url else (url, 9200)
    return OpenSearch(
        hosts=[{"host": host, "port": int(port)}],
        http_compress=True,
        use_ssl=False,
        verify_certs=False,
        ssl_show_warn=False,
    )


class OpenSearchStorage:
    """OpenSearch client for indexing enriched article chunks to news_index"""

    def __init__(self, url: str, index_name: str, embedding_dimension: int = 768):
        self.index_name = index_name
        self.embedding_dimension = embedding_dimension
        self.client = _build_client(url)

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
                    "topic_id": {"type": "integer"},
                    "topic_name": {"type": "keyword"},
                    "topic_slug": {"type": "keyword"},
                    "subtopic_id": {"type": "integer"},
                    "subtopic_name": {"type": "keyword"},
                    "subtopic_slug": {"type": "keyword"},
                    "title": {"type": "text", "analyzer": "standard"},
                    "description": {"type": "text", "analyzer": "standard"},
                    "url": {"type": "keyword", "index": False},
                    "source_name": {
                        "type": "text",
                        "analyzer": "standard",
                        "fields": {"keyword": {"type": "keyword"}},
                    },
                    "author": {"type": "keyword"},
                    "image_url": {"type": "keyword", "index": False},
                    "published_at": {"type": "date"},
                    "fetch_timestamp": {"type": "date"},
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
        logger.info(f"Created index {self.index_name}")

    def index_documents(self, documents: List[OpenSearchDocument]):
        """Bulk index documents to OpenSearch"""
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
            logger.info(f"Indexed {success} documents, {len(failed)} failed")
            if failed:
                for item in failed[:5]:
                    logger.error(f"Failed to index: {item}")
        except Exception as e:
            logger.error(f"Error bulk indexing: {e}")
            raise

    def close(self):
        """Close the OpenSearch client"""
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
        except Exception as e:
            logger.error(f"Failed to upsert mega doc {doc.data_point_id}: {e}")
            raise

    def close(self):
        """Close the OpenSearch client"""
        self.client.close()
