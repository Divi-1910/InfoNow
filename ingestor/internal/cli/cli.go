package cli

import (
	"context"
	"fmt"
	"ingestor/internal/api"
	"ingestor/internal/config"
	"ingestor/internal/service"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"
)

func Execute() {
	cfg := config.LoadConfig()
	rootCmd := newRootCommand(cfg)
	if err := rootCmd.Execute(); err != nil {
		log.Fatalf("Command failed: %v", err)
	}
}

func newRootCommand(cfg *config.Config) *cobra.Command {
	rootCmd := &cobra.Command{
		Use:   "ingestor",
		Short: "Ingestor service CLI",
	}
	rootCmd.SilenceUsage = true

	rootCmd.AddCommand(newRunCommand(cfg))
	rootCmd.AddCommand(newServeCommand(cfg))
	return rootCmd
}

func newRunCommand(cfg *config.Config) *cobra.Command {
	var (
		topic    string
		subtopic string
		source   string
		all      bool
		once     bool
	)

	cmd := &cobra.Command{
		Use:   "run",
		Short: "Run ingestion manually or on schedule",
		RunE: func(cmd *cobra.Command, args []string) error {
			svc := service.New(cfg)
			defer func() {
				if err := svc.Close(); err != nil {
					log.Printf("Service close error: %v", err)
				}
			}()

			if all && strings.TrimSpace(topic) != "" {
				return fmt.Errorf("cannot set both --all and --topic")
			}

			request := service.RunRequest{
				All:      all,
				Topic:    topic,
				SubTopic: subtopic,
				Source:   source,
			}
			if !request.All && strings.TrimSpace(request.Topic) == "" {
				// Backward-compatible default: run full ingestion when no topic is provided.
				request.All = true
			}

			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			runOnce := func() error {
				result, err := svc.Run(ctx, request)
				if err != nil {
					return err
				}
				logRunResult(result)
				return nil
			}

			if err := runOnce(); err != nil {
				return err
			}

			if once {
				return nil
			}

			ticker := time.NewTicker(svc.ScheduledInterval())
			defer ticker.Stop()
			log.Printf("Scheduled mode enabled (interval=%s)", svc.ScheduledInterval())

			for {
				select {
				case <-ctx.Done():
					log.Println("Stopping scheduled ingestion")
					return nil
				case <-ticker.C:
					if err := runOnce(); err != nil {
						log.Printf("Scheduled run failed: %v", err)
					}
				}
			}
		},
	}

	cmd.Flags().StringVar(&topic, "topic", "", "Topic name/slug for manual ingestion")
	cmd.Flags().StringVar(&subtopic, "subtopic", "", "Subtopic name/slug for manual ingestion")
	cmd.Flags().StringVar(&source, "source", "all", "Source to ingest: all|news|youtube")
	cmd.Flags().BoolVar(&all, "all", false, "Ingest all topics from backend")
	cmd.Flags().BoolVar(&once, "once", false, "Run one cycle and exit")
	return cmd
}

func newServeCommand(cfg *config.Config) *cobra.Command {
	var port string

	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start ingestion trigger API server",
		RunE: func(cmd *cobra.Command, args []string) error {
			if strings.TrimSpace(cfg.APIKey) == "" {
				return fmt.Errorf("INGESTOR_API_KEY must be set to run API server")
			}

			svc := service.New(cfg)
			defer func() {
				if err := svc.Close(); err != nil {
					log.Printf("Service close error: %v", err)
				}
			}()

			addr := normalizeAddr(port)
			if addr == ":" {
				addr = normalizeAddr(cfg.ServerPort)
			}
			if addr == ":" {
				addr = ":7575"
			}

			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			server := api.NewServer(addr, cfg.APIKey, cfg.APIRateLimit, cfg.APIJobTimeout, svc)
			return server.Start(ctx)
		},
	}

	cmd.Flags().StringVar(&port, "port", cfg.ServerPort, "HTTP server port (e.g. 7575)")
	return cmd
}

func logRunResult(result service.RunResult) {
	log.Printf(
		"Ingestion complete source=%s all=%t topic=%q subtopic=%q duration=%s",
		result.Request.Source,
		result.Request.All,
		result.Request.Topic,
		result.Request.SubTopic,
		result.Duration,
	)

	if result.News != nil {
		log.Printf(
			"News stats: topics=%d fetched=%d deduped=%d published=%d",
			result.News.Topics,
			result.News.Fetched,
			result.News.Deduped,
			result.News.Published,
		)
	}
	if result.YouTube != nil {
		log.Printf(
			"YouTube stats: topics=%d fetched=%d deduped=%d published=%d",
			result.YouTube.Topics,
			result.YouTube.Fetched,
			result.YouTube.Deduped,
			result.YouTube.Published,
		)
	}
}

func normalizeAddr(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	if strings.HasPrefix(v, ":") {
		return v
	}
	return ":" + v
}
