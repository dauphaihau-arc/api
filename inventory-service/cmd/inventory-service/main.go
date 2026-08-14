package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"arc/inventory-service/internal/rabbitmq"
	"arc/inventory-service/internal/reservation"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	config := loadConfig()
	store, closeStore := buildStore(config, logger)
	defer closeStore()
	service := reservation.NewService(store)
	handler := reservation.NewHandler(service)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	consumer := rabbitmq.NewOrderCreatedConsumer(rabbitmq.OrderCreatedConsumerConfig{
		URL:      config.RabbitMQURL,
		Queue:    config.InventoryOrderEventsQueue,
		Exchange: config.DomainEventsExchange,
	}, service, logger)

	go func() {
		if err := consumer.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Error("rabbitmq.consumer.failed", "error", err)
		}
	}()

	server := &http.Server{
		Addr:              ":" + config.Port,
		Handler:           handler.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("inventory_service.http.start", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("inventory_service.http.failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("inventory_service.http.shutdown_failed", "error", err)
	}
}

type config struct {
	Port                      string
	DatabaseURL               string
	RabbitMQURL               string
	DomainEventsExchange      string
	InventoryOrderEventsQueue string
	ShutdownTimeout           time.Duration
}

func loadConfig() config {
	return config{
		Port:                      env("PORT", "8081"),
		DatabaseURL:               env("DATABASE_URL", ""),
		RabbitMQURL:               env("RABBITMQ_URL", "amqp://guest:guest@127.0.0.1:5672"),
		DomainEventsExchange:      env("RABBITMQ_DOMAIN_EVENTS_EXCHANGE", "arc.domain-events"),
		InventoryOrderEventsQueue: env("RABBITMQ_INVENTORY_ORDER_EVENTS_QUEUE", "inventory.order-events"),
		ShutdownTimeout:           durationEnv("SHUTDOWN_TIMEOUT_SECONDS", 10*time.Second),
	}
}

func buildStore(config config, logger *slog.Logger) (reservation.Store, func()) {
	if config.DatabaseURL == "" {
		logger.Warn("inventory_service.store.memory")
		return reservation.NewMemoryStore(), func() {}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		logger.Error("inventory_service.postgres.pool_failed", "error", err)
		os.Exit(1)
	}
	if err := pool.Ping(ctx); err != nil {
		logger.Error("inventory_service.postgres.ping_failed", "error", err)
		pool.Close()
		os.Exit(1)
	}

	logger.Info("inventory_service.store.postgres")
	store := reservation.NewPostgresStore(pool)
	return store, store.Close
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return fallback
	}

	return time.Duration(seconds) * time.Second
}
