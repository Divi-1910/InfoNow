package deduper

import (
	"context"
	"fmt"
	"ingestor/internal/redis"
	"time"
)

type Deduper struct {
	redis *redis.RedisClient
	ttl   time.Duration
}

func New(redisClient *redis.RedisClient, ttl time.Duration) *Deduper {
	return &Deduper{
		redis: redisClient,
		ttl:   ttl,
	}
}

func (d *Deduper) IsDuplicate(ctx context.Context, dataID string) (bool, error) {
	key := fmt.Sprintf("dedupe:datapoint:%s", dataID)
	
	ok, err := d.redis.Client.SetNX(ctx, key, "1", d.ttl).Result()
	if err != nil {
		return false, err
	}
	
	return !ok, nil
}
