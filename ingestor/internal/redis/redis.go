package redis

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

var Client *redis.Client

func Init(addr string) {
	log.Printf("Connecting to redis at %s", addr)

	redisClient := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Redis Connection failed : %v", err)
	}

	log.Println("Redis Connected !! ")

}
