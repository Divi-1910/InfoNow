import { Client } from "@opensearch-project/opensearch";

export const MEGA_INDEX = "mega_index";

let _client: Client | null = null;

export function getOpenSearchClient(): Client {
  if (!_client) {
    _client = new Client({
      node: process.env.OPENSEARCH_URL || "http://localhost:9200",
    });
  }
  return _client;
}
