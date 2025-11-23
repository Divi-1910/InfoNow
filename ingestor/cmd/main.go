package main

import (
	"log"
	"net/http"
	"time"

	"github.com/Divi-1910/InfoNow/ingestor/internal/configs"
	"github.com/Divi-1910/InfoNow/ingestor/internal/redis"
)

func main() {

	log.Println("Starting Ingestor")

	config := configs.LoadConfig()

	redis.Init(config.RedisAddr)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Ingestor Healthy"))
	})

	go func() {
		addr := ":" + config.HTTPPort
		log.Printf("Server listening on %s", addr)

		if err := http.ListenAndServe(addr, mux); err != nil {
			log.Fatalf("HTTP server error : %v", err)
		}
	}()

	ticker := time.NewTicker(config.ScheduleInterval)

	go func() {
		for range ticker.C {
			log.Printf("Ingesting data - scheduled pull")
		}
	}()

	select {}

}
