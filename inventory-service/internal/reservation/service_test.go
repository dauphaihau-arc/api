package reservation

import (
	"testing"
	"time"
)

func TestReserveValidateConsumeFlow(t *testing.T) {
	service := NewService(NewMemoryStore())
	expiresAt := time.Now().Add(30 * time.Minute)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		QuoteID:        "quote-1",
		CartID:         "cart-1",
		IdempotencyKey: "quote-1:reservation:v1",
		ExpiresAt:      expiresAt,
		Items: []Item{{
			InventoryID: "inventory-1",
			Quantity:    1,
			Title:       "Product",
		}},
	})
	if err != nil {
		t.Fatalf("reserve quote: %v", err)
	}
	if reserved.Status != StatusActive {
		t.Fatalf("expected active reservation, got %s", reserved.Status)
	}

	validation, err := service.ValidateReservation(ValidateReservationRequest{
		QuoteID:       "quote-1",
		ReservationID: reserved.ReservationID,
		Items:         []Item{{InventoryID: "inventory-1", Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("validate reservation: %v", err)
	}
	if !validation.Valid {
		t.Fatal("expected reservation to validate")
	}

	err = service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-1",
		EventType: "order.created",
		Payload: struct {
			OrderIDs      []string `json:"orderIds"`
			QuoteID       string   `json:"quoteId"`
			ReservationID string   `json:"reservationId"`
			Items         []Item   `json:"items"`
		}{
			OrderIDs:      []string{"order-1"},
			QuoteID:       "quote-1",
			ReservationID: reserved.ReservationID,
			Items:         []Item{{InventoryID: "inventory-1", Quantity: 1}},
		},
	})
	if err != nil {
		t.Fatalf("consume order created: %v", err)
	}

	validation, err = service.ValidateReservation(ValidateReservationRequest{
		QuoteID:       "quote-1",
		ReservationID: reserved.ReservationID,
		Items:         []Item{{InventoryID: "inventory-1", Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("validate sold reservation: %v", err)
	}
	if validation.Valid || validation.Status != StatusSold {
		t.Fatalf("expected sold reservation to be invalid, got valid=%v status=%s", validation.Valid, validation.Status)
	}
}

func TestReserveQuoteIsIdempotent(t *testing.T) {
	service := NewService(NewMemoryStore())
	request := ReserveQuoteRequest{
		QuoteID:        "quote-1",
		CartID:         "cart-1",
		IdempotencyKey: "quote-1:reservation:v1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{{InventoryID: "inventory-1", Quantity: 1}},
	}

	first, err := service.ReserveQuote(request)
	if err != nil {
		t.Fatalf("first reserve: %v", err)
	}
	second, err := service.ReserveQuote(request)
	if err != nil {
		t.Fatalf("second reserve: %v", err)
	}

	if first.ReservationID != second.ReservationID {
		t.Fatalf("expected same reservation id, got %s and %s", first.ReservationID, second.ReservationID)
	}
}
