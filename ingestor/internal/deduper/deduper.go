package deduper

import (
	"ingestor/internal/client"
)

type DataPoint struct {
	DataID   string
	DataType string
	Article  []client.Article
}
