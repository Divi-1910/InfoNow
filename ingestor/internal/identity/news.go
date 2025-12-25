package identity

import (
	"crypto/sha256"
	"fmt"
	"ingestor/internal/utils"
)

func NewsDataID(articleURL string) (string, error) {
	normalized := utils.NormalizeURL(articleURL)
	if normalized == "" {
		return "", fmt.Errorf("failed to normalize URL: %s", articleURL)
	}

	hash := sha256.Sum256([]byte(normalized))
	return fmt.Sprintf("news:%x", hash), nil
}
