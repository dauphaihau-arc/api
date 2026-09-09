package reservation

import "time"

type Status string

const (
	StatusActive   Status = "ACTIVE"
	StatusSold     Status = "SOLD"
	StatusExpired  Status = "EXPIRED"
	StatusReleased Status = "RELEASED"
)

type LifecycleState string

const (
	LifecycleActive   LifecycleState = "active"
	LifecycleInactive LifecycleState = "inactive"
	LifecycleRemoved  LifecycleState = "removed"
)

type MovementKind string

const (
	MovementCount   MovementKind = "count"
	MovementReserve MovementKind = "reserve"
	MovementRelease MovementKind = "release"
	MovementSale    MovementKind = "sale"
)

type InventoryBalance struct {
	OnHandQuantity  int
	ReservedQuantity int
	AvailableQuantityValue int
	ShortageValue int
	OnHandVersion int
	LifecycleState LifecycleState
}

func (b InventoryBalance) AvailableQuantity() int {
	available := b.OnHandQuantity - b.ReservedQuantity
	if available < 0 {
		return 0
	}
	return available
}

func (b InventoryBalance) Shortage() int {
	shortage := b.ReservedQuantity - b.OnHandQuantity
	if shortage < 0 {
		return 0
	}
	return shortage
}

func (b InventoryBalance) withDerivedQuantities() InventoryBalance {
	b.AvailableQuantityValue = b.AvailableQuantity()
	b.ShortageValue = b.Shortage()
	return b
}

type InventoryMovement struct {
	InventoryID    string
	Kind           MovementKind
	QuantityDelta  int
	OnHandBefore   int
	ReservedBefore int
	OnHandAfter    int
	ReservedAfter  int
	Cause          string
	ActorID        string
	CommandID      string
	Note           string
	OccurredAt     time.Time
}

type InventoryItem struct {
	ID             string
	ShopID         string
	SKU            string
	LifecycleState LifecycleState
}

type SetOnHandQuantityRequest struct {
	InventoryID           string `json:"inventoryId"`
	ExpectedOnHandVersion int    `json:"expectedOnHandVersion"`
	OnHandQuantity        int    `json:"onHandQuantity"`
	IdempotencyKey        string `json:"idempotencyKey"`
	ActorID               string `json:"actorId"`
	Note                  string `json:"note,omitempty"`
}

type SetOnHandQuantityResponse struct {
	InventoryID       string `json:"inventoryId"`
	OnHandQuantity    int    `json:"onHandQuantity"`
	ReservedQuantity  int    `json:"reservedQuantity"`
	AvailableQuantity int    `json:"availableQuantity"`
	OnHandVersion     int    `json:"onHandVersion"`
	Shortage          int    `json:"shortage"`
}


type Item struct {
	InventoryID               string `json:"inventoryId"`
	Quantity                  int    `json:"quantity"`
	Title                     string `json:"title,omitempty"`
	AvailableAfterReservation int    `json:"-"`
}

type Reservation struct {
	ID             string
	QuoteID        string
	CartID         string
	Status         Status
	Items          []Item
	ExpiresAt      time.Time
	IdempotencyKey string
	ProcessedEvent map[string]time.Time
}

type ReserveQuoteRequest struct {
	QuoteID        string    `json:"quoteId"`
	CartID         string    `json:"cartId"`
	IdempotencyKey string    `json:"idempotencyKey"`
	ExpiresAt      time.Time `json:"expiresAt"`
	Items          []Item    `json:"items"`
}

type ReserveQuoteResponse struct {
	ReservationID string `json:"reservationId"`
	Status        Status `json:"status"`
	Items         []struct {
		InventoryID               string `json:"inventoryId"`
		Quantity                  int    `json:"quantity"`
		AvailableAfterReservation int    `json:"availableAfterReservation"`
	} `json:"items"`
}

type ValidateReservationRequest struct {
	QuoteID       string `json:"quoteId"`
	ReservationID string `json:"reservationId"`
	Items         []Item `json:"items"`
}

type ValidateReservationResponse struct {
	Valid  bool   `json:"valid"`
	Status Status `json:"status"`
}

type ReleaseReservationRequest struct {
	QuoteID        string `json:"quoteId"`
	ReservationID  string `json:"reservationId"`
	Reason         string `json:"reason"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type ReleaseReservationResponse struct {
	ReservationID string `json:"reservationId"`
	Status        Status `json:"status"`
}

type OrderCreatedEvent struct {
	EventID    string    `json:"eventId"`
	EventType  string    `json:"eventType"`
	OccurredAt time.Time `json:"occurredAt"`
	Producer   string    `json:"producer"`
	Payload    struct {
		OrderIDs      []string `json:"orderIds"`
		QuoteID       string   `json:"quoteId"`
		ReservationID string   `json:"reservationId"`
		Items         []Item   `json:"items"`
	} `json:"payload"`
}
