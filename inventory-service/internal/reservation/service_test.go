package reservation

import (
	"errors"
	"testing"
	"time"
)

func seedPool(store *MemoryStore, poolID string, inventoryID string, onHand int) {
	store.SetStockPoolBalance(InventoryBalance{
		StockPoolID:    poolID,
		InventoryID:    inventoryID,
		OnHandQuantity: onHand,
		IsDefault:      true,
		LifecycleState: LifecycleActive,
	})
}

func inventoryItem(inventoryID string, poolID string, quantity int) Item {
	return Item{InventoryID: inventoryID, StockPoolID: poolID, Quantity: quantity, Title: "Product"}
}

func orderCreatedPayload(orderID string, reservationID string, items []Item) struct {
	OrderIDs      []string `json:"orderIds"`
	ReservationID string   `json:"reservationId"`
	Items         []Item   `json:"items"`
} {
	return orderCreatedPayloadWithOrders([]string{orderID}, reservationID, items)
}

func orderCreatedPayloadWithOrders(orderIDs []string, reservationID string, items []Item) struct {
	OrderIDs      []string `json:"orderIds"`
	ReservationID string   `json:"reservationId"`
	Items         []Item   `json:"items"`
} {
	return struct {
		OrderIDs      []string `json:"orderIds"`
		ReservationID string   `json:"reservationId"`
		Items         []Item   `json:"items"`
	}{
		OrderIDs:      orderIDs,
		ReservationID: reservationID,
		Items:         items,
	}
}

func TestReserveValidateConsumeFlow(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 3)
	service := NewService(store)
	expiresAt := time.Now().Add(30 * time.Minute)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "order-1:reservation:v1",
		ExpiresAt:      expiresAt,
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
	})
	if err != nil {
		t.Fatalf("reserve quote: %v", err)
	}
	if reserved.Status != StatusActive {
		t.Fatalf("expected active reservation, got %s", reserved.Status)
	}
	balance := store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 3 || balance.ReservedQuantity != 1 || balance.AvailableQuantity() != 2 {
		t.Fatalf("expected on-hand=3 reserved=1 available=2 after reserve, got %+v", balance)
	}
	if balance.OnHandVersion != 1 {
		t.Fatalf("expected reservation activity to leave On-hand Version unchanged, got %d", balance.OnHandVersion)
	}

	validation, err := service.ValidateReservation(ValidateReservationRequest{
		OrderID:       "order-1",
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
		Payload:   orderCreatedPayload("order-1", reserved.ReservationID, []Item{{InventoryID: "inventory-1", Quantity: 1}}),
	})
	if err != nil {
		t.Fatalf("consume order created: %v", err)
	}
	balance = store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 2 || balance.ReservedQuantity != 0 || balance.AvailableQuantity() != 2 {
		t.Fatalf("expected on-hand=2 reserved=0 available=2 after consume, got %+v", balance)
	}
	if balance.OnHandVersion != 1 {
		t.Fatalf("expected consumption to leave On-hand Version unchanged, got %d", balance.OnHandVersion)
	}

	validation, err = service.ValidateReservation(ValidateReservationRequest{
		OrderID:       "order-1",
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
	seedPool(store, "pool-1", "inventory-1", 2)
	service := NewService(store)
	request := ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "order-1:reservation:v1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
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
	balance := store.StockPoolBalance("pool-1")
	if balance.ReservedQuantity != 1 {
		t.Fatalf("expected replay not to duplicate reserved quantity, got %+v", balance)
	}
	if got := len(store.StockPoolMovements("pool-1")); got != 1 {
		t.Fatalf("expected one reserve movement after replay, got %d", got)
	}
}

func TestReserveOrderOwnedAccepted(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 5)
	service := NewService(store)

	first, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "order-1:reservation:v1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
	})
	if err != nil {
		t.Fatalf("reserve order-owned: %v", err)
	}

	storedFirst, ok := store.FindByID(first.ReservationID)
	if !ok {
		t.Fatal("expected to find first order-owned reservation")
	}
	if storedFirst.OrderID != "order-1" {
		t.Fatalf("expected OrderID order-1, got %q", storedFirst.OrderID)
	}

	_, err = service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-2",
		CartID:         "cart-2",
		IdempotencyKey: "order-2:reservation:v1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
	})
	if err != nil {
		t.Fatalf("reserve second order-owned: %v", err)
	}

	if balance := store.StockPoolBalance("pool-1"); balance.ReservedQuantity != 2 {
		t.Fatalf("expected two distinct reservations to reserve 2 units, got %+v", balance)
	}
}

func TestConsumeOrderCreatedConsumesOrderOwnedReservation(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 3)
	service := NewService(store)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-owned-1",
		CartID:         "cart-1",
		IdempotencyKey: "order-owned-1:reservation:v1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 2)},
	})
	if err != nil {
		t.Fatalf("reserve order-owned: %v", err)
	}

	err = service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-order-owned",
		EventType: "order.created",
		Payload: orderCreatedPayloadWithOrders(
			[]string{"order-owned-1"},
			reserved.ReservationID,
			[]Item{{InventoryID: "inventory-1", Quantity: 2}},
		),
	})
	if err != nil {
		t.Fatalf("consume order-owned: %v", err)
	}

	balance := store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 1 || balance.ReservedQuantity != 0 || balance.AvailableQuantity() != 1 {
		t.Fatalf("expected order-owned sale to consume stock, got %+v", balance)
	}

	stored, ok := store.FindByID(reserved.ReservationID)
	if !ok {
		t.Fatal("expected to find consumed reservation")
	}
	if stored.Status != StatusSold {
		t.Fatalf("expected reservation status SOLD, got %s", stored.Status)
	}
}

func TestConsumeOrderCreatedRejectsMismatchedOrderId(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 3)
	service := NewService(store)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-owned-1",
		CartID:         "cart-1",
		IdempotencyKey: "order-owned-1:reservation:v1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
	})
	if err != nil {
		t.Fatalf("reserve order-owned: %v", err)
	}

	err = service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-wrong-order",
		EventType: "order.created",
		Payload: orderCreatedPayloadWithOrders(
			[]string{"order-owned-2"},
			reserved.ReservationID,
			[]Item{{InventoryID: "inventory-1", Quantity: 1}},
		),
	})
	if !errors.Is(err, ErrReservationUnavailable) {
		t.Fatalf("expected unavailable reservation for mismatched order id, got %v", err)
	}

	balance := store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 3 || balance.ReservedQuantity != 1 {
		t.Fatalf("expected no consume for mismatched order id, got %+v", balance)
	}

	stored, ok := store.FindByID(reserved.ReservationID)
	if !ok || stored.Status != StatusActive {
		t.Fatalf("expected reservation to stay active, got status=%s", stored.Status)
	}
}

func TestReserveQuoteRejectsIdempotencyKeyConflict(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 4)
	service := NewService(store)
	request := ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "reservation-key",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
	}
	if _, err := service.ReserveQuote(request); err != nil {
		t.Fatalf("first reserve: %v", err)
	}
	request.Items = []Item{inventoryItem("inventory-1", "pool-1", 2)}
	if _, err := service.ReserveQuote(request); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("expected idempotency conflict, got %v", err)
	}
}

func TestSellerCountCreatesShortageAndVersionConflict(t *testing.T) {
	store := NewMemoryStore()
	store.SetStockPoolBalance(InventoryBalance{
		StockPoolID:      "pool-1",
		InventoryID:      "inventory-1",
		OnHandQuantity:   5,
		ReservedQuantity: 4,
		OnHandVersion:    7,
		IsDefault:        true,
		LifecycleState:   LifecycleActive,
	})
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
	if count.StockPoolID != "pool-1" || count.OnHandQuantity != 3 || count.ReservedQuantity != 4 || count.AvailableQuantity != 0 || count.Shortage != 1 || count.OnHandVersion != 8 {
		t.Fatalf("unexpected count response: %+v", count)
	}

	conflict, err := service.SetOnHandQuantity(SetOnHandQuantityRequest{
		InventoryID:           "inventory-1",
		ExpectedOnHandVersion: 7,
		OnHandQuantity:        6,
		IdempotencyKey:        "count-2",
		ActorID:               "seller-1",
	})
	if !errors.Is(err, ErrOnHandVersionConflict) {
		t.Fatalf("expected version conflict, got %v", err)
	}
	if conflict.StockPoolID != "pool-1" || conflict.OnHandVersion != 8 {
		t.Fatalf("expected conflict to report the current pool balance, got %+v", conflict)
	}
	if got := len(store.StockPoolMovements("pool-1")); got != 1 {
		t.Fatalf("expected one count movement, got %d", got)
	}
}

func TestReleaseReservationDecreasesReservedQuantity(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 3)
	service := NewService(store)
	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "reserve-1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 2)},
	})
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	_, err = service.ReleaseReservation(ReleaseReservationRequest{
		OrderID:        "order-1",
		ReservationID:  reserved.ReservationID,
		Reason:         "checkout_abandoned",
		IdempotencyKey: "release-1",
	})
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	balance := store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 3 || balance.ReservedQuantity != 0 || balance.AvailableQuantity() != 3 {
		t.Fatalf("expected release to restore availability by lowering reserved only, got %+v", balance)
	}
}

func TestConsumeOrderCreatedIsAtomicWhenShortagePreventsFullConsumption(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 1)
	store.SetStockPoolBalance(InventoryBalance{
		StockPoolID:      "pool-1",
		InventoryID:      "inventory-1",
		OnHandQuantity:   1,
		ReservedQuantity: 2,
		IsDefault:        true,
		LifecycleState:   LifecycleActive,
	})
	service := NewService(store)
	reservation := Reservation{
		ID:             "reservation-1",
		OrderID:        "order-1",
		CartID:         "cart-1",
		Status:         StatusActive,
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 2)},
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
		Payload:   orderCreatedPayload("order-1", "reservation-1", []Item{{InventoryID: "inventory-1", Quantity: 2}}),
	})
	if !errors.Is(err, ErrReservationUnavailable) {
		t.Fatalf("expected unavailable reservation, got %v", err)
	}
	balance := store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 1 || balance.ReservedQuantity != 2 {
		t.Fatalf("expected no partial consume, got %+v", balance)
	}
}

func TestRestoreSaleAppliesExactlyOnceToRecordedPool(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 3)
	service := NewService(store)
	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "reserve-1",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
	})
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-1",
		EventType: "order.created",
		Payload:   orderCreatedPayload("order-1", reserved.ReservationID, []Item{{InventoryID: "inventory-1", Quantity: 1}}),
	}); err != nil {
		t.Fatalf("consume: %v", err)
	}
	if balance := store.StockPoolBalance("pool-1"); balance.OnHandQuantity != 2 {
		t.Fatalf("expected on-hand=2 after sale, got %+v", balance)
	}

	first, err := service.RestoreSale(RestoreSaleRequest{
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "order-1:restore",
	})
	if err != nil {
		t.Fatalf("restore sale: %v", err)
	}
	if !first.Restored {
		t.Fatal("expected the sold reservation to be restored")
	}

	replayed, err := service.RestoreSale(RestoreSaleRequest{
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "order-1:restore",
	})
	if err != nil {
		t.Fatalf("replayed restore sale: %v", err)
	}
	if !replayed.Restored {
		t.Fatal("expected replayed restore to report the restored state without applying again")
	}

	balance := store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 3 || balance.ReservedQuantity != 0 {
		t.Fatalf("expected restore to add the sold quantity back exactly once, got %+v", balance)
	}

	corrections := 0
	poolMovements := store.StockPoolMovements("pool-1")
	for _, movement := range poolMovements {
		if movement.Kind == MovementCorrection {
			corrections++
		}
	}
	if corrections != 1 {
		t.Fatalf("expected exactly one correction movement, got %d", corrections)
	}
}

func TestRestoreSaleReleasesAnActiveHold(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 5)
	service := NewService(store)
	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "reserve-active",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 2)},
	})
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}

	response, err := service.RestoreSale(RestoreSaleRequest{
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "order-1:restore",
	})
	if err != nil {
		t.Fatalf("restore sale: %v", err)
	}
	if response.Restored {
		t.Fatal("expected an unconsumed hold to be released rather than treated as a sale correction")
	}

	balance := store.StockPoolBalance("pool-1")
	if balance.OnHandQuantity != 5 || balance.ReservedQuantity != 0 {
		t.Fatalf("expected release without manufacturing on-hand stock, got %+v", balance)
	}
}

func TestRestoreSaleDistributesAggregatedInventoryAcrossRecordedPools(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 2)
	seedPool(store, "pool-2", "inventory-1", 3)
	service := NewService(store)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-split",
		CartID:         "cart-split",
		IdempotencyKey: "reserve-split",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items: []Item{
			inventoryItem("inventory-1", "pool-1", 2),
			inventoryItem("inventory-1", "pool-2", 3),
		},
	})
	if err != nil {
		t.Fatalf("reserve split: %v", err)
	}
	if err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-split",
		EventType: "order.created",
		Payload: orderCreatedPayload(
			"order-split",
			reserved.ReservationID,
			[]Item{{InventoryID: "inventory-1", Quantity: 5}},
		),
	}); err != nil {
		t.Fatalf("consume split: %v", err)
	}

	if _, err := service.RestoreSale(RestoreSaleRequest{
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "order-split:restore",
		Items:          []Item{{InventoryID: "inventory-1", Quantity: 5}},
	}); err != nil {
		t.Fatalf("restore split: %v", err)
	}

	if balance := store.StockPoolBalance("pool-1"); balance.OnHandQuantity != 2 {
		t.Fatalf("expected first pool fully restored, got %+v", balance)
	}
	if balance := store.StockPoolBalance("pool-2"); balance.OnHandQuantity != 3 {
		t.Fatalf("expected second pool fully restored, got %+v", balance)
	}
}

func TestRestoreSaleScopesToRequestedItems(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 3)
	seedPool(store, "pool-2", "inventory-2", 3)
	service := NewService(store)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "reserve-multi",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items: []Item{
			inventoryItem("inventory-1", "pool-1", 1),
			inventoryItem("inventory-2", "pool-2", 1),
		},
	})
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-1",
		EventType: "order.created",
		Payload: orderCreatedPayload("order-1", reserved.ReservationID, []Item{
			{InventoryID: "inventory-1", Quantity: 1},
			{InventoryID: "inventory-2", Quantity: 1},
		}),
	}); err != nil {
		t.Fatalf("consume: %v", err)
	}

	if _, err := service.RestoreSale(RestoreSaleRequest{
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "order-1:restore",
		Items:          []Item{{InventoryID: "inventory-1", Quantity: 1}},
	}); err != nil {
		t.Fatalf("restore one order's items: %v", err)
	}

	if balance := store.StockPoolBalance("pool-1"); balance.OnHandQuantity != 3 {
		t.Fatalf("expected the canceled order's pool restored to 3, got %+v", balance)
	}
	if balance := store.StockPoolBalance("pool-2"); balance.OnHandQuantity != 2 {
		t.Fatalf("expected the other order's sold pool untouched at 2, got %+v", balance)
	}
}

func TestConsumeOrderCreatedAcknowledgesReleasedReservation(t *testing.T) {
	store := NewMemoryStore()
	seedPool(store, "pool-1", "inventory-1", 2)
	service := NewService(store)

	reserved, err := service.ReserveQuote(ReserveQuoteRequest{
		OrderID:        "order-1",
		CartID:         "cart-1",
		IdempotencyKey: "reserve-release",
		ExpiresAt:      time.Now().Add(30 * time.Minute),
		Items:          []Item{inventoryItem("inventory-1", "pool-1", 1)},
	})
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if _, err := service.ReleaseReservation(ReleaseReservationRequest{
		OrderID:        "order-1",
		ReservationID:  reserved.ReservationID,
		Reason:         "order_canceled",
		IdempotencyKey: "release-1",
	}); err != nil {
		t.Fatalf("release: %v", err)
	}

	if err := service.ConsumeOrderCreated(OrderCreatedEvent{
		EventID:   "event-delayed",
		EventType: "order.created",
		Payload:   orderCreatedPayload("order-1", reserved.ReservationID, []Item{{InventoryID: "inventory-1", Quantity: 1}}),
	}); err != nil {
		t.Fatalf("expected a delayed sale event for a released hold to be acknowledged, got %v", err)
	}

	if balance := store.StockPoolBalance("pool-1"); balance.OnHandQuantity != 2 || balance.ReservedQuantity != 0 {
		t.Fatalf("expected the released hold to keep stock unchanged, got %+v", balance)
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
