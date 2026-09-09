package reservation

import (
	"errors"
	"testing"
	"time"
)

func TestReserveValidateConsumeFlow(t *testing.T) {
	store := NewMemoryStore()
	store.SetInventoryBalance("inventory-1", InventoryBalance{OnHandQuantity: 3, ReservedQuantity: 0, LifecycleState: LifecycleActive})
	service := NewService(store)
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
	balance := store.InventoryBalance("inventory-1")
	if balance.OnHandQuantity != 3 || balance.ReservedQuantity != 1 || balance.AvailableQuantity() != 2 {
		t.Fatalf("expected on-hand=3 reserved=1 available=2 after reserve, got %+v", balance)
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
	balance = store.InventoryBalance("inventory-1")
	if balance.OnHandQuantity != 2 || balance.ReservedQuantity != 0 || balance.AvailableQuantity() != 2 {
		t.Fatalf("expected on-hand=2 reserved=0 available=2 after consume, got %+v", balance)
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
	store := NewMemoryStore()
	store.SetInventoryBalance("inventory-1", InventoryBalance{OnHandQuantity: 2, ReservedQuantity: 0, LifecycleState: LifecycleActive})
	service := NewService(store)
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
	balance := store.InventoryBalance("inventory-1")
	if balance.ReservedQuantity != 1 {
		t.Fatalf("expected replay not to duplicate reserved quantity, got %+v", balance)
	}
	if got := len(store.InventoryMovements("inventory-1")); got != 1 {
		t.Fatalf("expected one reserve movement after replay, got %d", got)
	}
}

func TestReserveQuoteRejectsIdempotencyKeyConflict(t *testing.T) {
	store := NewMemoryStore()
	store.SetInventoryBalance("inventory-1", InventoryBalance{OnHandQuantity: 4, LifecycleState: LifecycleActive})
	service := NewService(store)
	request := ReserveQuoteRequest{
		QuoteID:        "quote-1",
		CartID:         "cart-1",
		IdempotencyKey: "reservation-key",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{{InventoryID: "inventory-1", Quantity: 1}},
	}
	if _, err := service.ReserveQuote(request); err != nil {
		t.Fatalf("first reserve: %v", err)
	}
	request.Items = []Item{{InventoryID: "inventory-1", Quantity: 2}}
	if _, err := service.ReserveQuote(request); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("expected idempotency conflict, got %v", err)
	}
}

func TestSellerCountCreatesShortageAndVersionConflict(t *testing.T) {
	store := NewMemoryStore()
	store.SetInventoryBalance("inventory-1", InventoryBalance{OnHandQuantity: 5, ReservedQuantity: 4, OnHandVersion: 7, LifecycleState: LifecycleActive})
	service := NewService(store)

	count, err := service.SetOnHandQuantity(SetOnHandQuantityRequest{
		InventoryID:           "inventory-1",
		ExpectedOnHandVersion: 7,
		OnHandQuantity:        3,
		IdempotencyKey:        "count-1",
		ActorID:               "seller-1",
		Note:                  "cycle count",
	})
	if err != nil {
		t.Fatalf("seller count: %v", err)
	}
	if count.OnHandQuantity != 3 || count.ReservedQuantity != 4 || count.AvailableQuantity != 0 || count.Shortage != 1 || count.OnHandVersion != 8 {
		t.Fatalf("unexpected count response: %+v", count)
	}

	_, err = service.SetOnHandQuantity(SetOnHandQuantityRequest{
		InventoryID:           "inventory-1",
		ExpectedOnHandVersion: 7,
		OnHandQuantity:        6,
		IdempotencyKey:        "count-2",
		ActorID:               "seller-1",
	})
	if !errors.Is(err, ErrOnHandVersionConflict) {
		t.Fatalf("expected version conflict, got %v", err)
	}
	if got := len(store.InventoryMovements("inventory-1")); got != 1 {
		t.Fatalf("expected one count movement, got %d", got)
	}
}

func TestReleaseReservationDecreasesReservedQuantity(t *testing.T) {
	store := NewMemoryStore()
	store.SetInventoryBalance("inventory-1", InventoryBalance{OnHandQuantity: 3, LifecycleState: LifecycleActive})
	service := NewService(store)
	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		QuoteID:        "quote-1",
		CartID:         "cart-1",
		IdempotencyKey: "reserve-1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{{InventoryID: "inventory-1", Quantity: 2}},
	})
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	_, err = service.ReleaseReservation(ReleaseReservationRequest{
		QuoteID:        "quote-1",
		ReservationID:  reserved.ReservationID,
		Reason:         "checkout_abandoned",
		IdempotencyKey: "release-1",
	})
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	balance := store.InventoryBalance("inventory-1")
	if balance.OnHandQuantity != 3 || balance.ReservedQuantity != 0 || balance.AvailableQuantity() != 3 {
		t.Fatalf("expected release to restore availability by lowering reserved only, got %+v", balance)
	}
}

func TestConsumeOrderCreatedIsAtomicWhenShortagePreventsFullConsumption(t *testing.T) {
	store := NewMemoryStore()
	store.SetInventoryBalance("inventory-1", InventoryBalance{OnHandQuantity: 1, ReservedQuantity: 2, LifecycleState: LifecycleActive})
	service := NewService(store)
	reservation := Reservation{
		ID:             "reservation-1",
		QuoteID:        "quote-1",
		CartID:         "cart-1",
		Status:         StatusActive,
		Items:          []Item{{InventoryID: "inventory-1", Quantity: 2}},
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		IdempotencyKey: "reserve-existing",
		ProcessedEvent: map[string]time.Time{},
	}
	if _, err := store.CreateReservationWithoutInventoryMutation(reservation); err != nil {
		t.Fatalf("seed reservation: %v", err)
	}

	err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-shortage",
		EventType: "order.created",
		Payload: struct {
			OrderIDs      []string `json:"orderIds"`
			QuoteID       string   `json:"quoteId"`
			ReservationID string   `json:"reservationId"`
			Items         []Item   `json:"items"`
		}{
			OrderIDs:      []string{"order-1"},
			QuoteID:       "quote-1",
			ReservationID: "reservation-1",
			Items:         []Item{{InventoryID: "inventory-1", Quantity: 2}},
		},
	})
	if !errors.Is(err, ErrReservationUnavailable) {
		t.Fatalf("expected unavailable reservation, got %v", err)
	}
	balance := store.InventoryBalance("inventory-1")
	if balance.OnHandQuantity != 1 || balance.ReservedQuantity != 2 {
		t.Fatalf("expected no partial consume, got %+v", balance)
	}
}

func TestSKUUniquenessAppliesOnlyAmongNonRemovedItems(t *testing.T) {
	store := NewMemoryStore()
	store.SetInventoryItem(InventoryItem{ID: "active-1", ShopID: "shop-1", SKU: "SKU-1", LifecycleState: LifecycleActive})
	store.SetInventoryItem(InventoryItem{ID: "removed-1", ShopID: "shop-1", SKU: "SKU-2", LifecycleState: LifecycleRemoved})

	if err := store.SetInventoryItem(InventoryItem{ID: "active-2", ShopID: "shop-1", SKU: "SKU-1", LifecycleState: LifecycleActive}); !errors.Is(err, ErrSKUConflict) {
		t.Fatalf("expected active SKU conflict, got %v", err)
	}
	if err := store.SetInventoryItem(InventoryItem{ID: "active-3", ShopID: "shop-1", SKU: "SKU-2", LifecycleState: LifecycleActive}); err != nil {
		t.Fatalf("expected removed SKU to be reusable, got %v", err)
	}
}
