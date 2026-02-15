package ingest

// CycleStats captures summary metrics for one ingestion cycle.
type CycleStats struct {
	Topics    int `json:"topics"`
	Fetched   int `json:"fetched"`
	Deduped   int `json:"deduped"`
	Published int `json:"published"`
}
