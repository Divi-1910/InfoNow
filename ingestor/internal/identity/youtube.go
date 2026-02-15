package identity

import (
	"crypto/sha256"
	"fmt"
	"strings"
)

func YoutubeDataID(videoID string) (string, error) {
	normalized := strings.TrimSpace(strings.ToLower(videoID))
	if normalized == "" {
		return "", fmt.Errorf("empty video id")
	}

	hash := sha256.Sum256([]byte(normalized))
	return fmt.Sprintf("youtube:%x", hash), nil
}
