package deduper

import (
	"context"
	"fmt"
	"ingestor/internal/redis"
	"log"
	"time"
)

type Deduper struct {
	redis *redis.RedisClient
	ttl   time.Duration
	count int
}

func New(redisClient *redis.RedisClient, ttl time.Duration) *Deduper {
	return &Deduper{
		redis: redisClient,
		ttl:   ttl,
		count: 0,
	}
}

func (d *Deduper) IsDuplicate(ctx context.Context, dataID string) (bool, error) {
	key := fmt.Sprintf("dedupe:datapoint:%s", dataID)
	ok, err := d.redis.Client.SetNX(ctx, key, "1", d.ttl).Result()
	if err != nil {
		return false, err
	}
	
	if d.count < 5 {
		log.Printf("DEBUG: dataID=%s SetNX=%v isDup=%v", dataID[:20], ok, !ok)
		d.count++
	}
	
	return !ok, nil
}
