package rabbitmq

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"arc/inventory-service/internal/reservation"
	amqp "github.com/rabbitmq/amqp091-go"
)

type OrderCreatedConsumerConfig struct {
	URL      string
	Queue    string
	Exchange string
}

type OrderCreatedConsumer struct {
	config  OrderCreatedConsumerConfig
	service *reservation.Service
	logger  *slog.Logger
}

func NewOrderCreatedConsumer(
	config OrderCreatedConsumerConfig,
	service *reservation.Service,
	logger *slog.Logger,
) *OrderCreatedConsumer {
	return &OrderCreatedConsumer{
		config:  config,
		service: service,
		logger:  logger,
	}
}

func (c *OrderCreatedConsumer) Run(ctx context.Context) error {
	for {
		if err := c.consume(ctx); err != nil {
			if errors.Is(err, context.Canceled) {
				return err
			}
			c.logger.Error("rabbitmq.consume.loop_failed", "error", err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}

func (c *OrderCreatedConsumer) consume(ctx context.Context) error {
	connection, err := amqp.Dial(c.config.URL)
	if err != nil {
		return err
	}
	defer connection.Close()

	channel, err := connection.Channel()
	if err != nil {
		return err
	}
	defer channel.Close()

	if err := channel.ExchangeDeclare(c.config.Exchange, "topic", true, false, false, false, nil); err != nil {
		return err
	}
	if _, err := channel.QueueDeclare(c.config.Queue, true, false, false, false, nil); err != nil {
		return err
	}
	if err := channel.QueueBind(c.config.Queue, "order.created", c.config.Exchange, false, nil); err != nil {
		return err
	}
	if err := channel.Qos(20, 0, false); err != nil {
		return err
	}

	deliveries, err := channel.Consume(c.config.Queue, "inventory-service", false, false, false, false, nil)
	if err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case delivery, ok := <-deliveries:
			if !ok {
				return nil
			}
			c.handleDelivery(delivery)
		}
	}
}

func (c *OrderCreatedConsumer) handleDelivery(delivery amqp.Delivery) {
	var event reservation.OrderCreatedEvent

	if err := json.Unmarshal(delivery.Body, &event); err != nil {
		c.logger.Error("rabbitmq.order_created.invalid_json", "error", err)
		_ = delivery.Nack(false, false)
		return
	}

	if event.EventType != "order.created" {
		_ = delivery.Ack(false)
		return
	}

	if err := c.service.ConsumeOrderCreated(event); err != nil {
		c.logger.Error("rabbitmq.order_created.consume_failed", "event_id", event.EventID, "error", err)
		_ = delivery.Nack(false, true)
		return
	}

	c.logger.Info("rabbitmq.order_created.consumed", "event_id", event.EventID)
	_ = delivery.Ack(false)
}
